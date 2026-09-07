# FreeAds Post — API Contract Specification

This document defines the official API contract for the **FreeAds Post** platform. 

The architecture strictly follows:
```
Frontend (Browser)
       ↓
API / Google Apps Script Web App (Backend Engine)
       ↓
Repositories & Services Abstraction Layer
       ↓
Google Sheets (Persistent Data Store)
```
> **STRICT ARCHITECTURAL INVARIANT**:
> The browser **NEVER** communicates directly with Google Sheets. All access is mediated by the Google Apps Script Web App API.

---

## 1. Global Conventions & Standards

### 1.1 Content Types & Invocation
- **HTTP Methods Supported**: `GET`, `POST`, `PUT`, `DELETE`.
- **Method Override**: For environments (such as certain Google Apps Script client dispatchers) where native HTTP `PUT` and `DELETE` requests are restricted, clients may issue a `POST` request with `_method: "PUT"` or `_method: "DELETE"` in the JSON request body or `action: "<path>"` parameter.
- **Request Format**: `Content-Type: text/plain;charset=utf-8` or `application/json` with a valid JSON body.
- **Response Format**: `Content-Type: application/json;charset=utf-8`.

---

## 2. Standard Response Envelopes

Every API response strictly follows a unified JSON envelope.

### 2.1 Success Response Envelope
```json
{
  "success": true,
  "statusCode": 200,
  "message": "User-friendly description or null",
  "data": {
    "key": "value"
  },
  "error": null,
  "timestamp": "2026-09-06T12:00:00.000Z"
}
```

### 2.2 Error Response Envelope
```json
{
  "success": false,
  "statusCode": 400,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly, actionable error message",
    "details": null
  },
  "timestamp": "2026-09-06T12:00:00.000Z"
}
```

### 2.3 Strict Sensitive Data Exclusion Rule
API responses **NEVER** expose:
- Stack traces or uncaught execution exceptions
- Google Spreadsheet IDs or Sheet Names
- Internal database row numbers (`_rowNumber`)
- Password hashes, salts, or verification tokens
- Service account or private configuration credentials
- Internal server error messages

---

## 3. Standard Error Codes

| Error Code | HTTP Status | Description |
| :--- | :---: | :--- |
| `VALIDATION_ERROR` | 400 | Missing or invalid required fields. |
| `INVALID_CREDENTIALS` | 401 | Invalid email or password during login. |
| `ACCOUNT_UNVERIFIED` | 403 | User email is not verified (`email_verified = false`). |
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired session token. |
| `FORBIDDEN` | 403 | User lacks ownership or permissions to perform the action. |
| `ADMIN_REQUIRED` | 403 | Action requires active administrator credentials in the `Admins` sheet. |
| `NOT_FOUND` | 404 | Resource does not exist, is deleted, or is not publicly accessible. |
| `INVALID_STATE` | 400 | The operation is invalid for the resource's current status. |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests in the configured time window. |
| `INTERNAL_ERROR` | 500 | Unexpected server-side processing error. |

---

## 4. Authentication Endpoints

### 4.1 `POST /register`
Creates a new user account. Initial state: `account_status = ACTIVE`, `email_verified = false`. A single-use verification token is generated and emailed.

- **Authentication**: None (Public)
- **Rate Limit**: 5 attempts per 15 minutes per IP/client
- **Request Body**:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1 555-0199",
  "company_name": "Acme Corp",
  "password": "Password123!"
}
```
- **Validation Rules**:
  - `name`: 2–100 characters.
  - `email`: Valid RFC 5322 email syntax. Must be unique.
  - `phone`: Valid phone format (7–15 digits).
  - `password`: Minimum 8 characters, at least 1 letter and 1 number.
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Registration successful. Please check your email to verify your account.",
  "data": {
    "user": {
      "user_id": "usr_9a4f21b...",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1 555-0199",
      "company_name": "Acme Corp",
      "email_verified": false,
      "account_status": "ACTIVE",
      "role": "USER",
      "membership_status": "FREE",
      "created_at": "2026-09-06T12:00:00.000Z"
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:00:00.000Z"
}
```

---

### 4.2 `POST /verify-email`
Validates a one-time verification token and transitions the user to `email_verified = true`.

- **Authentication**: None (Public)
- **Rate Limit**: 10 attempts per 15 minutes
- **Request Body**:
```json
{
  "token": "tok_v1_8c9d2f4e..."
}
```
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Email verified successfully. You may now log in.",
  "data": {
    "verified": true,
    "email": "jane@example.com"
  },
  "error": null,
  "timestamp": "2026-09-06T12:00:00.000Z"
}
```

---

### 4.3 `POST /login`
Authenticates user credentials against the `Users` sheet. Validates that `email_verified === true`. Creates an active session token in the `Sessions` sheet.

- **Authentication**: None (Public)
- **Rate Limit**: 10 attempts per 15 minutes
- **Request Body**:
```json
{
  "email": "jane@example.com",
  "password": "Password123!"
}
```
- **Error Codes**:
  - `ACCOUNT_UNVERIFIED` (403): If user has not verified their email.
  - `INVALID_CREDENTIALS` (401): If email or password do not match.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful.",
  "data": {
    "token": "sess_tok_3a1b8c...",
    "user": {
      "user_id": "usr_9a4f21b...",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1 555-0199",
      "company_name": "Acme Corp",
      "email_verified": true,
      "account_status": "ACTIVE",
      "role": "USER",
      "membership_status": "FREE",
      "last_login": "2026-09-06T12:05:00.000Z",
      "created_at": "2026-09-06T12:00:00.000Z"
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:05:00.000Z"
}
```

---

### 4.4 `POST /logout`
Invalidates the active session token in the `Sessions` sheet.

- **Authentication**: Required (`token` in header or request body)
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Successfully logged out.",
  "data": null,
  "error": null,
  "timestamp": "2026-09-06T12:10:00.000Z"
}
```

---

### 4.5 `GET /me`
Returns the sanitized profile of the currently authenticated user.

- **Authentication**: Required (`token`)
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "user_id": "usr_9a4f21b...",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+1 555-0199",
    "company_name": "Acme Corp",
    "email_verified": true,
    "account_status": "ACTIVE",
    "role": "USER",
    "membership_status": "FREE",
    "created_at": "2026-09-06T12:00:00.000Z"
  },
  "error": null,
  "timestamp": "2026-09-06T12:10:00.000Z"
}
```

---

## 5. Advertisement Endpoints

### 5.1 `GET /ads`
Returns a paginated list of publicly discoverable advertisements.

- **Authentication**: Optional (Visitors can browse without logging in).
- **Public Visibility Invariant (Dynamic Seller Login Calculation)**:
  An advertisement is included in public results **ONLY IF**:
  1. `status === "APPROVED"`
  2. The seller has an active, valid session in the `Sessions` sheet (`sellerLoggedIn === true`)
  3. Ad is not expired (`expires_at > now`)
  4. Ad is not hidden (`status !== "HIDDEN"`)
  5. Ad is not deleted (`status !== "DELETED"`)
- **Contact Privacy Invariant**:
  - **Unauthenticated Visitors / Unverified Users**:
    - `seller.phone`, `seller.email`, `contact` are **STRONGLY WITHHELD**.
    - Response includes `"contact_locked": true` and `"contact_available": true`.
  - **Authenticated & Verified Users**:
    - Permitted contact details are provided according to seller's `contact_preference`.
    - Response includes `"contact_locked": false`.
- **Query Parameters**:
  - `page`: Page number (default: `1`).
  - `limit`: Items per page (default: `12`, max: `50`).
  - `category`: Category filter (or `'all'`).
  - `location`: Location keyword filter.
  - `search`: Full-text search on title and description.
  - `sort_by`: `'sponsored_first'` (default), `'newest'`, or `'oldest'`.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "ads": [
      {
        "ad_id": "ad_8b21c4...",
        "user_id": "usr_9a4f21b...",
        "title": "Professional Web Development Services",
        "category": "Services",
        "description": "Full-stack web application development and consulting.",
        "location": "San Francisco, CA",
        "price": 1500,
        "image_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
        "contact_preference": "BOTH",
        "status": "APPROVED",
        "is_sponsored": true,
        "created_at": "2026-09-05T10:00:00.000Z",
        "expires_at": "2026-10-05T10:00:00.000Z",
        "seller": {
          "name": "Jane Doe"
        },
        "contact_available": true,
        "contact_locked": true
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 12,
    "total_pages": 1,
    "has_more": false,
    "locations": ["San Francisco, CA"]
  },
  "error": null,
  "timestamp": "2026-09-06T12:15:00.000Z"
}
```

---

### 5.2 `GET /ads/:id`
Retrieves a single advertisement by its ID.

- **Authentication**: Optional.
- **Visibility Rules**:
  - If status is `APPROVED`, non-expired, and the seller is actively logged in, returns the advertisement.
  - If the seller is logged out, the ad is hidden, pending, or expired:
    - **Visitor / Non-Owner**: Returns `404 NOT_FOUND`.
    - **Ad Owner / Admin**: Returns the advertisement regardless of seller public login state.
- **Contact Privacy**:
  - Visitors receive `"contact_locked": true`.
  - Authenticated and verified users receive permitted contact details.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "ad": {
      "ad_id": "ad_8b21c4...",
      "title": "Professional Web Development Services",
      "category": "Services",
      "description": "Full-stack web application development and consulting.",
      "location": "San Francisco, CA",
      "price": 1500,
      "image_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
      "seller": {
        "name": "Jane Doe"
      },
      "contact_available": true,
      "contact_locked": true
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:15:00.000Z"
}
```

---

### 5.3 `POST /ads`
Creates a new classified advertisement.

- **Authentication**: Required (`email_verified === true`).
- **Initial Status**: Always `PENDING` (Awaiting admin approval).
- **Anti-Tampering Rule**:
  - `user_id` is extracted strictly from the verified session token. Client-supplied `user_id` is ignored.
  - `status` is forced to `PENDING`. Clients cannot self-approve.
  - `is_sponsored` is forced to `false`.
- **Validation Rules**:
  - `title`: 5–120 characters.
  - `category`: Must match one of the allowed platform categories.
  - `description`: 20–3000 characters.
  - `location`: 2–100 characters.
  - `contact_preference`: `'EMAIL'`, `'PHONE'`, or `'BOTH'`.
  - `image_url`: Optional external HTTP/HTTPS URL (max 2000 chars).
    - **STRICT PROHIBITION**: Reject `javascript:`, `data:`, base64, or file uploads.
- **Request Body**:
```json
{
  "title": "Vintage Acoustic Guitar",
  "category": "Buy & Sell",
  "description": "Solid spruce top vintage acoustic guitar in mint condition with hard shell case.",
  "location": "Austin, TX",
  "price": 450,
  "contact_preference": "EMAIL",
  "image_url": "https://images.unsplash.com/photo-1510915361894-db8b60106cb1"
}
```
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Your advertisement has been submitted and is awaiting admin approval.",
  "data": {
    "ad": {
      "ad_id": "ad_1f2e3d4c...",
      "user_id": "usr_9a4f21b...",
      "title": "Vintage Acoustic Guitar",
      "category": "Buy & Sell",
      "status": "PENDING",
      "is_sponsored": false,
      "created_at": "2026-09-06T12:20:00.000Z"
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:20:00.000Z"
}
```

---

### 5.4 `PUT /ads/:id`
Updates an existing advertisement.

- **Authentication**: Required.
- **Ownership Verification**: Backend verifies `authenticated_user_id === ad.user_id`. Returns `403 FORBIDDEN` on mismatch.
- **Re-Moderation Invariant**: Updating an ad automatically resets `status` to `PENDING` for administrative re-review.
- **Request Body**: Same fields as `POST /ads`.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Advertisement updated and submitted for admin review.",
  "data": {
    "ad": {
      "ad_id": "ad_1f2e3d4c...",
      "status": "PENDING"
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:25:00.000Z"
}
```

---

### 5.5 `DELETE /ads/:id`
Deletes an advertisement owned by the authenticated user.

- **Authentication**: Required.
- **Ownership Verification**: Backend verifies `authenticated_user_id === ad.user_id`.
- **Status Transition**: `status` transitions to `DELETED`.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Advertisement deleted successfully.",
  "data": {
    "ad_id": "ad_1f2e3d4c...",
    "status": "DELETED"
  },
  "error": null,
  "timestamp": "2026-09-06T12:30:00.000Z"
}
```

---

### 5.6 `POST /ads/:id/hide`
Hides an `APPROVED` advertisement from public visibility.

- **Authentication**: Required.
- **Ownership Verification**: Backend verifies `authenticated_user_id === ad.user_id`.
- **Status Transition**: `APPROVED` → `HIDDEN`.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Advertisement is now hidden.",
  "data": {
    "ad": {
      "ad_id": "ad_1f2e3d4c...",
      "status": "HIDDEN"
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:35:00.000Z"
}
```

---

### 5.7 `POST /ads/:id/resubmit`
Resubmits a `REJECTED` advertisement for administrative review.

- **Authentication**: Required.
- **Ownership Verification**: Backend verifies `authenticated_user_id === ad.user_id`.
- **Status Transition**: `REJECTED` → `PENDING`. Clears previous rejection reason.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Advertisement resubmitted for admin approval.",
  "data": {
    "ad": {
      "ad_id": "ad_1f2e3d4c...",
      "status": "PENDING"
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:40:00.000Z"
}
```

---

## 6. Administration Endpoints

All admin endpoints require server-side verification against the `Admins` sheet (`status === "ACTIVE"`).

> **CRITICAL SECURITY RULE**:
> Admin status is NEVER inferred from `request.body.role`, `localStorage`, or client headers. Regular users attempting to invoke any admin endpoint receive `403 FORBIDDEN` or `ADMIN_REQUIRED`.

### 6.1 `GET /admin/dashboard`
Returns platform statistics and recent metrics.

- **Authentication**: Required (Admin).
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "stats": {
      "total_users": 150,
      "verified_users": 140,
      "active_users": 125,
      "pending_ads": 12,
      "approved_ads": 85,
      "rejected_ads": 8,
      "hidden_ads": 4,
      "expired_ads": 15,
      "total_memberships": 20,
      "active_memberships": 18
    },
    "recent_pending_ads": []
  },
  "error": null,
  "timestamp": "2026-09-06T12:45:00.000Z"
}
```

---

### 6.2 `GET /admin/users`
Returns all registered platform users with inactivity metrics.

- **Authentication**: Required (Admin).
- **Query Parameter**: `filter` (`'all'`, `'active'`, `'warning'`, `'inactive'`).
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "users": [
      {
        "user_id": "usr_9a4f21b...",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "email_verified": true,
        "account_status": "ACTIVE",
        "role": "USER",
        "membership_status": "FREE",
        "days_inactive": 12,
        "inactivity_status": "ACTIVE"
      }
    ],
    "total": 1
  },
  "error": null,
  "timestamp": "2026-09-06T12:45:00.000Z"
}
```

---

### 6.3 `GET /admin/ads/pending`
Returns all ads currently awaiting moderation (`status === "PENDING"`).

- **Authentication**: Required (Admin).
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "ads": [],
    "total": 0
  },
  "error": null,
  "timestamp": "2026-09-06T12:45:00.000Z"
}
```

---

### 6.4 `GET /admin/ads/approved`
Returns all approved advertisements (`status === "APPROVED"`).

- **Authentication**: Required (Admin).
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "ads": [],
    "total": 0
  },
  "error": null,
  "timestamp": "2026-09-06T12:45:00.000Z"
}
```

---

### 6.5 `GET /admin/ads/rejected`
Returns all rejected advertisements (`status === "REJECTED"`).

- **Authentication**: Required (Admin).
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "ads": [],
    "total": 0
  },
  "error": null,
  "timestamp": "2026-09-06T12:45:00.000Z"
}
```

---

### 6.6 `POST /admin/ads/:id/approve`
Approves an advertisement and sets `approved_at` timestamp.

- **Authentication**: Required (Admin).
- **Status Transition**: `PENDING` → `APPROVED`.
- **Activity Log**: Logs `ADMIN_APPROVE_AD`.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Advertisement approved successfully.",
  "data": {
    "ad": {
      "ad_id": "ad_1f2e3d4c...",
      "status": "APPROVED",
      "approved_at": "2026-09-06T12:50:00.000Z"
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:50:00.000Z"
}
```

---

### 6.7 `POST /admin/ads/:id/reject`
Rejects an advertisement with a mandatory rejection reason.

- **Authentication**: Required (Admin).
- **Validation**: `rejection_reason` (min 5 chars) is mandatory.
- **Status Transition**: `PENDING` / `APPROVED` → `REJECTED`.
- **Activity Log**: Logs `ADMIN_REJECT_AD`.
- **Request Body**:
```json
{
  "rejection_reason": "Incomplete product description and missing clear item location."
}
```
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Advertisement rejected.",
  "data": {
    "ad": {
      "ad_id": "ad_1f2e3d4c...",
      "status": "REJECTED",
      "rejection_reason": "Incomplete product description and missing clear item location."
    }
  },
  "error": null,
  "timestamp": "2026-09-06T12:50:00.000Z"
}
```

---

### 6.8 `POST /admin/ads/:id/delete`
Administratively removes an advertisement (`status = "DELETED"`).

- **Authentication**: Required (Admin).
- **Activity Log**: Logs `ADMIN_DELETE_AD`.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Advertisement deleted by administrator.",
  "data": {
    "ad_id": "ad_1f2e3d4c...",
    "status": "DELETED"
  },
  "error": null,
  "timestamp": "2026-09-06T12:50:00.000Z"
}
```

---

## 7. Membership Endpoints

### 7.1 `GET /membership`
Returns current user's membership tier, validity, and sponsorship eligibility.

- **Authentication**: Required.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "membership": {
      "membership_id": "mem_4a5b6c...",
      "user_id": "usr_9a4f21b...",
      "plan": "PREMIUM_MONTHLY",
      "start_date": "2026-09-01T00:00:00.000Z",
      "expiry_date": "2026-10-01T00:00:00.000Z",
      "status": "ACTIVE"
    },
    "plan": "PREMIUM_MONTHLY",
    "status": "ACTIVE",
    "is_eligible_for_sponsorship": true
  },
  "error": null,
  "timestamp": "2026-09-06T12:55:00.000Z"
}
```

---

### 7.2 `GET /membership/plans`
Retrieves public membership plan configurations.

- **Authentication**: None (Public).
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": null,
  "data": {
    "plans": [
      {
        "plan_id": "FREE",
        "name": "Free Membership",
        "price": 0,
        "currency": "USD",
        "interval": "lifetime",
        "duration_days": 0,
        "is_sponsored_eligible": false,
        "features": [
          "Submit classified ads for moderation",
          "Browse all approved member advertisements",
          "Manage your ads from user dashboard"
        ]
      },
      {
        "plan_id": "PREMIUM_MONTHLY",
        "name": "Premium Monthly",
        "price": 19.99,
        "currency": "USD",
        "interval": "month",
        "duration_days": 30,
        "is_sponsored_eligible": true,
        "features": [
          "All Free Membership benefits",
          "Eligible for priority SPONSORED placement",
          "Featured at the top of category & search feeds",
          "Prominent SPONSORED badge"
        ]
      },
      {
        "plan_id": "PREMIUM_YEARLY",
        "name": "Premium Yearly",
        "price": 199.99,
        "currency": "USD",
        "interval": "year",
        "duration_days": 365,
        "is_sponsored_eligible": true,
        "features": [
          "All Premium Monthly benefits",
          "Year-round SPONSORED placement eligibility",
          "Priority administrative support"
        ]
      }
    ]
  },
  "error": null,
  "timestamp": "2026-09-06T12:55:00.000Z"
}
```

---

## 8. Server-Side Rate Limiting Strategy

Rate limiting is implemented using Google Apps Script's native `CacheService.getScriptCache()`, providing lightweight, fast, key-based rate tracking without burdening Google Sheets with high-frequency write operations.

### 8.1 Configuration Matrix

| Action / Endpoint | Window | Max Attempts | Key Scope | Action on Exceeded |
| :--- | :---: | :---: | :--- | :--- |
| `POST /register` | 15 min | 5 | IP / client identifier | `429 RATE_LIMIT_EXCEEDED` |
| `POST /login` | 15 min | 10 | IP / client identifier + email | `429 RATE_LIMIT_EXCEEDED` |
| `POST /verify-email` | 15 min | 10 | IP / client identifier | `429 RATE_LIMIT_EXCEEDED` |
| `POST /ads` | 1 hour | 20 | Authenticated `user_id` | `429 RATE_LIMIT_EXCEEDED` |
| `admin/*` | 1 min | 60 | Authenticated `user_id` | `429 RATE_LIMIT_EXCEEDED` |

---

## 9. Activity Logging Invariant

All significant security, membership, and moderation events are appended to the `ActivityLog` worksheet using stable identifiers (`log_id`, `user_id`, `entity_id`):

- `REGISTER`
- `EMAIL_VERIFIED`
- `LOGIN`
- `LOGOUT`
- `CREATE_AD`
- `UPDATE_AD`
- `DELETE_AD`
- `HIDE_AD`
- `RESUBMIT_AD`
- `ADMIN_APPROVE_AD`
- `ADMIN_REJECT_AD`
- `ADMIN_DELETE_AD`
- `MEMBERSHIP_CHANGE`

**Sensitive Data Redaction**: Passwords, salts, session tokens, and credit card numbers are strictly omitted from `metadata`.
