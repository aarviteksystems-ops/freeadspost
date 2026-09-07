# Technical Architecture Specification: FreeAds Post

**Version:** 2.0.0 (API Contract & Backend Foundation)  
**Status:** Approved & Implemented  
**Data Storage:** Google Sheets Exclusively (Zero Traditional Database)  
**Backend Layer:** Google Apps Script Web App (API Engine)  
**Frontend Layer:** React Router v8 + React 19 + Vanilla/Tailwind CSS  

---

## 1. Architectural Overview & System Data Flow

FreeAds Post is a classified advertisement platform built with a clear separation of concerns across a 5-tier architecture:

```
┌────────────────────────────────────────────────────────┐
│                   1. Browser (User)                    │
│    Unauthenticated Visitor / Registered User / Admin   │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS (Browser Interactions)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   2. Frontend Client                   │
│      React Router v8 SPA (Client-Side Rendering)       │
│           No direct access to Google Sheets            │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS (JSON API Calls via fetch)
                            ▼
┌────────────────────────────────────────────────────────┐
│             3. Google Apps Script API Layer            │
│         Entry Points: doGet(e) & doPost(e)             │
│      Request Router, RateLimiter & AuthMiddleware      │
└───────────────────────────┬────────────────────────────┘
                            │ In-Memory Controller Dispatch
                            ▼
┌────────────────────────────────────────────────────────┐
│        4. Repositories & Domain Services Layer         │
│  [UserRepository] [AdRepository] [MembershipRepository]│
│  [AdminRepository] [SessionRepository] [LogRepository] │
│      Business Logic, Validation, Ownership Checks      │
└───────────────────────────┬────────────────────────────┘
                            │ Transactional withLock() & SpreadsheetApp API
                            ▼
┌────────────────────────────────────────────────────────┐
│               5. Google Sheets Data Store              │
│    [Users]  [Sessions]  [Ads]  [Memberships]           │
│    [Admins] [ActivityLog] [Settings]                   │
└────────────────────────────────────────────────────────┘
```

> ### STRICT ARCHITECTURAL INVARIANTS:
> 1. **No Direct Google Sheets Access**: The browser client **NEVER** communicates directly with Google Sheets or the Google Sheets API. All interactions pass through the Google Apps Script backend layer.
> 2. **No Traditional Database**: No SQL (Postgres, MySQL, SQLite) or NoSQL (MongoDB, DynamoDB, Firebase, Supabase) databases are introduced. Google Sheets is the single persistent store.
> 3. **Credential Secrecy**: Google Sheets IDs, service keys, and private configuration live strictly in Google Apps Script `PropertiesService` (Script Properties) and are never exposed to the browser.
> 4. **Stable Resource IDs**: Business logic and repositories operate purely on stable UUIDs (`user_id`, `ad_id`, `membership_id`, `log_id`). Spreadsheet row numbers are never used as permanent IDs.

---

## 2. Core Business Rules & System Behaviors

### 2.1 Public Ads & Contact Information Privacy
- **Public Discovery**: Visitors do **not** need to log in to browse advertisements, view categories, or execute searches.
- **Server-Side Contact Shielding**:
  - Unauthenticated visitors or unverified users receiving `GET /ads` or `GET /ads/:id` **NEVER** receive private seller contact information (`phone`, `email`, `whatsapp`).
  - Responses for visitors explicitly contain `"contact_locked": true` and `"contact_available": true` (or `false`).
  - Contact details are never sent to the browser and hidden with CSS; the backend strictly redacts them before JSON serialization.
  - Authenticated and email-verified users receive permitted contact details based on the seller's `contact_preference` (`EMAIL`, `PHONE`, or `BOTH`).

### 2.2 Dynamic Seller Login Visibility Rule
An advertisement is publicly visible in the public feed, category browsing, and search results **only if ALL five conditions are met**:
1. `ad.status === 'APPROVED'`
2. The seller currently has an active, non-expired session in the `Sessions` sheet (`isSellerLoggedIn === true`)
3. The advertisement is not expired (`expires_at > now`)
4. The advertisement is not hidden (`status !== 'HIDDEN'`)
5. The advertisement is not deleted (`status !== 'DELETED'`)

> **IMPORTANT STATE RULE**:
> When a seller logs out, their ads immediately disappear from the public listing.
> **The backend DOES NOT change `APPROVED -> INACTIVE` on logout.**
> Administrative approval remains intact. When the seller logs in again, their approved ads automatically reappear in the public feed.

### 2.3 Ad Ownership & Integrity
- All modifications (`PUT /ads/:id`, `DELETE /ads/:id`, `POST /ads/:id/hide`, `POST /ads/:id/resubmit`) strictly verify server-side:
  $$\text{authenticated\_user\_id} === \text{ad.user\_id}$$
- Client-supplied `user_id` fields in request bodies or query parameters are discarded and never trusted.
- Editing an advertisement automatically resets its status to `PENDING` for administrative re-review.
- Users cannot self-approve their ads or set `is_sponsored = true`.

### 2.4 Server-Side Admin Authorization
- Administrator privileges are verified server-side against the `Admins` sheet (`status === 'ACTIVE'`).
- The backend never trusts client roles from `localStorage`, request bodies, or headers.
- Normal users are prevented by middleware from invoking any administrative endpoint.

---

## 3. Data Access Layer: Repositories Pattern

To eliminate spreadsheet operations scattered throughout business logic, the backend implements a clean Repositories pattern over `GoogleSheetsService` (backed by `Sheets.gs`):

```
┌──────────────────────────────────────────────────────────┐
│                   GoogleSheetsService                    │
│   Transactional Locking (LockService), Atomic Batch Row  │
│   Operations, Formula Injection Neutralization, Caching  │
└────────────────────────────┬─────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│UserRepository│     │ AdRepository │     │ MembershipRepository │
└──────────────┘     └──────────────┘     └──────────────────────┘
     ▲                       ▲                       ▲
     │                       │                       │
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│AdminRepository│    │LogRepository │     │  SessionRepository   │
└──────────────┘     └──────────────┘     └──────────────────────┘
```

### 3.1 `GoogleSheetsService`
- Manages spreadsheet handles via memoized `SpreadsheetApp` instances.
- Executes operations within transactional locks (`LockService.getScriptLock()`) to prevent race conditions during concurrent writes.
- Sanitizes cell inputs against formula injection (`=`, `+`, `-`, `@`).

### 3.2 Repositories Responsibility Matrix
| Repository | Entity | Core Methods |
| :--- | :--- | :--- |
| `UserRepository` | `Users` | `findById`, `findByEmail`, `create`, `update`, `sanitize` |
| `SessionRepository` | `Sessions` | `createSession`, `findValidSession`, `invalidateSession`, `getActiveSellerIds` |
| `AdRepository` | `Ads` | `findById`, `findByUserId`, `findPublicApproved`, `create`, `update`, `delete` |
| `MembershipRepository` | `Memberships` | `findByUserId`, `assign`, `cancel`, `getPlans` |
| `AdminRepository` | `Admins` | `isAdmin`, `getAllAdmins`, `createAdmin` |
| `ActivityLogRepository` | `ActivityLog` | `logAction`, `getRecentLogs` |

---

## 4. Server-Side Rate Limiting Architecture

Because Google Apps Script operates in a serverless environment with daily quota limits, rate limiting is implemented natively using `CacheService.getScriptCache()`.

### 4.1 Implementation Mechanism
- **Cache Store**: `CacheService.getScriptCache()` provides fast, key-value storage with TTL up to 21,600 seconds (6 hours).
- **Fallback**: In local Node.js test execution, an in-memory dictionary is used as the fallback provider.
- **Key Strategy**:
  - Registration & Verification: `rl:reg:<client_ip_or_id>`
  - Login Attempts: `rl:login:<client_ip_or_id>:<email>`
  - Ad Creation: `rl:ad_create:<user_id>`
  - Admin Operations: `rl:admin:<user_id>`
- **Exceeded Limit Handling**:
  Returns HTTP `429 RATE_LIMIT_EXCEEDED` with a user-friendly message and retry timing.

---

## 5. Security & Validation Architecture

### 5.1 Input Validation Rules
- **Advertisements**:
  - `title`: 5 to 120 characters, text sanitized.
  - `description`: 20 to 3000 characters.
  - `location`: 2 to 100 characters.
  - `category`: Validated against platform allowed categories list.
  - `contact_preference`: Validated against `['EMAIL', 'PHONE', 'BOTH']`.
- **Image URL Security**:
  - Must be a valid external `http://` or `https://` web address.
  - **Strict Rejections**: `javascript:`, `data:`, base64 strings, file upload payloads, or malformed URIs.
  - **Zero Server Uploads**: No files, binaries, or base64 streams are accepted or stored.

### 5.2 Password Security
- User passwords are salted with a 16-byte cryptographically secure random salt and hashed using SHA-256 before insertion into the `Users` sheet.
- Password hashes and salts are stripped in all repository query responses.
