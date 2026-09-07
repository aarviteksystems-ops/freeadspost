# FreeAds Post — Production Platform

FreeAds Post is a secure, private, member-supported classified advertisements web platform built with a high-performance **React Router v8** frontend and a serverless **Google Apps Script** backend persisting data strictly in **Google Sheets**.

---

## Architecture Overview

- **Frontend:** React Router v8, React 19, Tailwind CSS v4, TypeScript.
- **Backend:** Google Apps Script (GAS) Web App (`doPost` / `doGet` RPC action router).
- **Data Persistence:** **Google Sheets exclusively**. No external databases (zero SQL, zero NoSQL, zero Supabase, zero Firebase).
- **Asset Storage:** External HTTPS URLs only (zero file uploads stored on server).
- **Security:** Salted SHA-256 password hashing, 64-char crypto session tokens, RBAC via Google Sheets `Admins` table, formula injection defense, strict CSP headers.
- **Moderation:** Two-tier workflow: ads submitted as `PENDING` until reviewed and marked `APPROVED` by an administrator.

```
┌────────────────────────────────────────────────────────┐
│                   Frontend (Client)                    │
│      React Router v8 (SPA + Responsive Design)         │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS (POST / text/plain JSON payload)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Google Apps Script Web App                 │
│       doPost() Action Router & Service Controllers     │
│  [AuthService | AdService | Membership | AdminService] │
└───────────────────────────┬────────────────────────────┘
                            │ Google Apps Script SpreadsheetApp API
                            ▼
┌────────────────────────────────────────────────────────┐
│                     Google Sheets                      │
│        Users | Ads | Memberships | EmailVerification   │
│         Admins | ActivityLog | Sessions | Settings     │
└────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **User Authentication & Email Verification:**
   - Registration with password strength rules and phone validation.
   - One-time verification tokens sent via email; unverified accounts blocked from login.
   - Salted password hashing (`SHA256(password + salt):salt`).
   - Session tracking with server-side token hashes and single-click logout revocation.
2. **Advertisement Lifecycle & Moderation:**
   - Submissions default to `PENDING` status.
   - Any edit to an ad automatically resets its status back to `PENDING`.
   - Admin approval queue with mandatory rejection reasons and non-destructive soft deletes.
   - Public feed strictly filters for `APPROVED` and non-expired ads.
3. **Membership & Sponsored Ads:**
   - Tiered plans (`FREE`, `PREMIUM_MONTHLY`, `PREMIUM_YEARLY`) stored dynamically in `Settings`.
   - Sponsored ads prioritized at top of discovery (`sponsored_first`).
   - Automatic expiry evaluation and graceful downgrade.
4. **User Inactivity & Auto-Pausing:**
   - Configurable warning (`60` days) and pause (`90` days) thresholds.
   - Advance warning email notifications.
   - Auto-hides ads for inactive users (`APPROVED -> HIDDEN`) with zero data loss.
   - User-initiated safe reactivation (`HIDDEN -> PENDING`).
5. **Security Hardening:**
   - Anti-tampering: Server overrides client-supplied `user_id`, `role`, `membership_status`, and `is_sponsored`.
   - Formula injection neutralization (`'`, `+`, `-`, `@`, tab).
   - Strict image URL validation (external `http://`/`https://` only; rejects `javascript:`, `data:`).
   - Rate limiting on sensitive endpoints.

---

## Directory Structure

```
freeadspost/
├── app/                        # React Router v8 Frontend
│   ├── components/             # Reusable UI components (Navbar, AdCard, ProtectedRoute)
│   ├── context/                # AuthContext (state, token, login, logout)
│   ├── routes/                 # Route views (home, ads, post-ad, my-ads, dashboard, admin, etc.)
│   ├── services/               # API client service & mock fallback
│   ├── app.css                 # Tailwind CSS v4 design system
│   ├── root.tsx                # App shell, CSP headers, viewport meta
│   └── routes.ts               # Route manifest
├── backend/
│   ├── gas/                    # Google Apps Script Source Files
│   │   ├── Config.gs           # PropertiesService configuration wrapper
│   │   ├── Responses.gs        # Standardized JSON response envelopes
│   │   ├── Sheets.gs           # Google Sheets ORM, caching, locking & atomic writes
│   │   ├── Validation.gs       # Input validators & sensitive data sanitizers
│   │   ├── Logger.gs           # Activity and system audit logging
│   │   ├── AuthMiddleware.gs   # Token authentication and RBAC middleware
│   │   ├── EmailService.gs     # HTML transactional email templates
│   │   ├── AuthService.gs      # Registration, verification, login, logout
│   │   ├── AdService.gs        # Classifieds posting, filtering, discovery
│   │   ├── MembershipService.gs# Membership tiers, expiration, sponsorships
│   │   ├── UserActivityService.gs # Inactivity metrics, warnings, auto-pausing
│   │   ├── AdminService.gs     # Moderation queue, dashboard stats, settings
│   │   ├── Router.gs           # RPC action dispatcher
│   │   ├── Setup.gs            # Database schema initializer
│   │   └── Main.gs             # doGet, doPost, and time-driven trigger entry points
│   └── tests/                  # Automated Test Suites
│       ├── run_tests.cjs       # 68-test backend regression suite
│       └── e2e_verification.cjs# 50-test end-to-end acceptance suite
├── docs/
│   ├── ARCHITECTURE.md         # Full technical architecture specification
│   ├── DATABASE_SCHEMA.md      # Google Sheets data model and ER diagram
│   └── PRODUCTION_READINESS_AUDIT.md # Final production readiness audit
├── public/                     # Static assets
├── TEST_REPORT.md              # Detailed end-to-end test execution report
├── package.json
└── vite.config.ts
```

---

## Production Deployment Guide

### Step 1: Google Sheet Setup

1. Create a new Google Sheet in Google Drive.
2. Open **Extensions > Apps Script**.
3. Copy all files from `backend/gas/*.gs` into the Apps Script project editor.
4. In `Setup.gs`, run the `setupDatabase()` function.
   - This automatically creates all 8 worksheets (`Users`, `Ads`, `Memberships`, `EmailVerification`, `Admins`, `ActivityLog`, `Sessions`, `Settings`) with standard headers, frozen header rows, and default settings.
5. In the `Admins` sheet, insert your initial administrator row:
   - `admin_id`: `adm_admin1`
   - `email`: `your-admin-email@example.com`
   - `role`: `SUPER_ADMIN`
   - `status`: `ACTIVE`
   - `created_at`: `2026-09-05T00:00:00.000Z`

### Step 2: Google Apps Script Web App Deployment

1. In the Apps Script project, open **Project Settings > Script Properties** and configure:
   - `SPREADSHEET_ID`: (Your Google Sheet ID from the URL)
   - `INITIAL_ADMIN_EMAIL`: `your-admin-email@example.com`
   - `EXPOSE_DEBUG_TOKENS`: `false` (Strictly `false` in production)
   - `LOCK_TIMEOUT_MS`: `15000`
2. Click **Deploy > New Deployment**.
3. Select **Web app**:
   - **Execute as:** `Me` (your Google account)
   - **Who has access:** `Anyone` (required so the frontend can dispatch API calls)
4. Click **Deploy** and copy the **Web App Executable URL** (ends in `/exec`).

### Step 3: Setup Inactivity Daily Trigger

1. In the Apps Script editor, open **Triggers** (clock icon on left menu).
2. Click **+ Add Trigger**:
   - **Choose which function to run:** `processInactivityDailyTrigger`
   - **Choose which deployment should run:** `Head`
   - **Select event source:** `Time-driven`
   - **Select type of time based trigger:** `Day timer`
   - **Select time of day:** `Midnight to 1am` (or preferred off-peak hour)
3. Click **Save**.

### Step 4: Frontend Production Configuration & Build

1. In the repository root, create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Set your published Web App URL:
   ```env
   VITE_GAS_API_URL=https://script.google.com/macros/s/AKfycbx.../exec
   ```
3. Validate and build the application:
   ```bash
   # 1. Typecheck
   npm run typecheck

   # 2. Production build
   npm run build
   ```
4. Deploy the production bundle (`build/client` and `build/server`) to your hosting provider of choice:
   - **Vercel / Netlify / Cloudflare Pages:** Standard Node/Vite build.
   - **Docker:** Build and run using the included `Dockerfile`:
     ```bash
     docker build -t freeadspost .
     docker run -p 3000:3000 freeadspost
     ```

---

## Verification & Testing

The project includes an automated test harness simulating Google Apps Script services (`SpreadsheetApp`, `LockService`, `MailApp`, `PropertiesService`, `Utilities`).

```bash
# Run 68-test backend regression suite
node backend/tests/run_tests.cjs

# Run 50-test complete end-to-end acceptance suite
node backend/tests/e2e_verification.cjs

# Run full TypeScript validation
npm run typecheck
```

Refer to [TEST_REPORT.md](TEST_REPORT.md) for detailed test cases and results.

---

## License

Private, Member-Supported Classifieds Platform. All rights reserved.
