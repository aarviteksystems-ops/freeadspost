# Walkthrough: Advertisement Creation System (/post-ad)

We have implemented the advertisement creation system for FreeAds Post adhering strictly to all requirements and constraints:

- **Strict Zero-Upload Architecture**: Absolutely no file inputs (`<input type="file">`), drag-and-drop zones, cloud buckets, or Base64 / data URIs.
- **External Image URL Validation**: Image URL is completely optional. When provided, it is strictly validated (HTTP/HTTPS only, rejects `javascript:`, `data:`, `file:`, `blob:`, invalid protocols, and malformed strings). The image is never downloaded, cached, or proxied.
- **Moderation Workflow**: Every submitted advertisement is created in `PENDING` status. Ads are never auto-published.
- **Confirmation Message**: The exact required text `"Your advertisement has been submitted and is awaiting admin approval."` is displayed with status badge and clear navigation.
- **Persistent Data Store**: Recorded into the `Ads` Google Sheet and audited via the `ActivityLog` worksheet.

---

## 1. Frontend: Advertisement Creation Route (`/post-ad`)

Created [`app/routes/post-ad.tsx`](file:///d:/Website%20Works/freeadspost/app/routes/post-ad.tsx) protected by `<ProtectedRoute>`:

- **Form Fields**:
  - **Title**: Text input (minimum 5 characters, maximum 100 characters).
  - **Category**: Dropdown with 9 pre-defined classified categories (Vehicles, Real Estate, Electronics, Jobs, Services, Home & Garden, Fashion, Community, Other).
  - **Location**: City / Region input (minimum 2 characters, maximum 100 characters).
  - **Contact Preference**: Toggle buttons for `EMAIL`, `PHONE`, or `BOTH`.
  - **Description**: Textarea (minimum 20 characters, maximum 3,000 characters with live character counter).
  - **Image URL (Optional)**: Single text input with client-side regex protocol validation (`^https?://`), warning banner reminding users no uploads are used, and a live non-proxied image preview using `<img referrerPolicy="no-referrer" />` with an image load error handler.
- **Submission State**:
  - Shows an alert with the required message:
    > **Your advertisement has been submitted and is awaiting admin approval.**
  - Displays a `PENDING` badge and links to view ads or create another ad.

---

## 2. Backend: Google Apps Script Ad Creation Engine

### [`backend/gas/AdService.gs`](file:///d:/Website%20Works/freeadspost/backend/gas/AdService.gs)
- `createAd(user, payload)`:
  - Validates all input fields using [`Validation.gs`](file:///d:/Website%20Works/freeadspost/backend/gas/Validation.gs).
  - Validates the optional `image_url` using `Validation.imageUrl(urlStr, true)`.
  - Generates a unique `ad_id` with `Utils.generateUUID()`.
  - Hardcodes `status: 'PENDING'`, `rejection_reason: ''`, `is_sponsored: false`, `approved_at: ''`, `expires_at: ''`.
  - Appends row to the `Ads` worksheet in Google Sheets.
  - Logs the event to the `ActivityLog` worksheet with action `CREATE_AD` and details `title` and `category`.
  - Returns HTTP 201 with sanitized ad details and confirmation message.

### [`backend/gas/Validation.gs`](file:///d:/Website%20Works/freeadspost/backend/gas/Validation.gs)
Added `Validation.imageUrl`:
```javascript
imageUrl: function(urlStr, allowEmpty) {
  if (!urlStr || urlStr.toString().trim() === '') {
    return { valid: !!allowEmpty, error: allowEmpty ? null : 'Image URL is required' };
  }
  const clean = urlStr.toString().trim();
  if (clean.length > 500) {
    return { valid: false, error: 'Image URL cannot exceed 500 characters' };
  }
  // Reject dangerous protocols
  const lower = clean.toLowerCase().replace(/\s+/g, '');
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || 
      lower.startsWith('file:') || lower.startsWith('blob:') || lower.startsWith('vbscript:')) {
    return { valid: false, error: 'Image URL must use HTTP or HTTPS protocol only' };
  }
  const httpRegex = /^https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/i;
  if (!httpRegex.test(clean)) {
    return { valid: false, error: 'Please enter a valid HTTP or HTTPS image URL' };
  }
  return { valid: true, error: null };
}
```

### [`backend/gas/Main.gs`](file:///d:/Website%20Works/freeadspost/backend/gas/Main.gs)
- Registered `POST create-ad` route guarded by `Auth.requireAuth`.

---

## 3. Automated Test Verification

All 19 automated acceptance tests in [`backend/tests/run_tests.cjs`](file:///d:/Website%20Works/freeadspost/backend/tests/run_tests.cjs) executed and passed (100%):

```
======================================================
  FreeAds Post - Acceptance Test Suite
======================================================

 ✔ PASS [1] Test Invalid Email: Rejects malformed email address
 ✔ PASS [2] Test Weak Password: Rejects password under 8 characters or missing numbers/letters
 ✔ PASS [3] Test Successful Registration: Creates user with email_verified=false and hashes password
 ✔ PASS [4] Test Duplicate Email: Rejects registration with existing email
 ✔ PASS [5] Test Expired Token: Rejects token whose expires_at is in the past
 ✔ PASS [6] Test Successful Verification: Activates user account and marks email_verified=true
 ✔ PASS [7] Test Reused Token: Rejects token that has already been used
 ✔ PASS [8] Test Unverified Login: Rejects login attempt before email is verified
 ✔ PASS [9] Test Wrong Password: Returns generic error for wrong password or non-existent email
 ✔ PASS [10] Test Valid Login: Issues secure session token and updates last_login timestamp
 ✔ PASS [11] Test Logout: Invalidates session token in database
 ✔ PASS [12] Test Expired Session: Rejects expired session token and cleans up record
 ✔ PASS [13] Test Unauthorized API Request: Rejects missing tokens and enforces admin authorization
 ✔ PASS [14] Test Protected Access: Authenticated user accesses profile; Admin accesses admin endpoint
 ✔ PASS [15] Test Create Ad: Rejects missing required fields
 ✔ PASS [16] Test Create Ad Image URL Security: Rejects javascript:, data:, and invalid schemes
 ✔ PASS [17] Test Create Ad Success: Creates ad with status PENDING and logs activity
 ✔ PASS [18] Test Create Ad Optional Image: Successfully creates ad without an image URL
 ✔ PASS [19] Test Dashboard Summary: Correctly calculates user pending ad counts

------------------------------------------------------
  Results: 19 of 19 tests passed (100%)
------------------------------------------------------
```

---

## 4. Build & Type Checking

- `npm run typecheck`: **0 errors**.
- `npm run build`: **Success** (Client & SSR builds generated clean bundles with 0 errors).
