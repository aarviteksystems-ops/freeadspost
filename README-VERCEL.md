# FreeAdsPost — Vercel + Google Sheets (₹0 MVP)

This version removes the production dependency on `server/data/users.json` and `server/data/ads.json`.
The Express API remains for local development and is also exposed as a Vercel serverless function at `/api/*`.
Persistent data is stored in Google Sheets through the Apps Script web app.

## 1. Create the Google Sheet

Create a blank Google Sheet and open **Extensions → Apps Script**.
Replace the script with the contents of `google-apps-script.js`.

Deploy:
- Deploy → New deployment
- Type: Web app
- Execute as: Me
- Who has access: Anyone
- Authorize and copy the Web app URL ending in `/exec`

The script creates `Users` and `Ads` sheets automatically and seeds demo ads the first time it runs.

## 2. Configure Vercel

Add these Environment Variables to the Vercel project:

- `GOOGLE_SHEET_WEBHOOK_URL` = your Apps Script `/exec` URL
- `FREEADSPOST_TOKEN_SECRET` = a long random secret (at least 32 characters)

Redeploy after adding variables.

## 3. Local development

Create `.env`:

```env
GOOGLE_SHEET_WEBHOOK_URL="YOUR_APPS_SCRIPT_EXEC_URL"
FREEADSPOST_TOKEN_SECRET="YOUR_LONG_RANDOM_SECRET"
```

Then:

```bash
npm install
npm run dev
```

## Security notes

- Plain-text passwords are not sent to or stored in Google Sheets.
- Passwords are stored as SHA-256 hashes for this zero-cost MVP. For a larger production service, move authentication to a dedicated auth provider and use a stronger password hashing scheme such as Argon2/bcrypt.
- The Vercel API issues stateless signed tokens, so sessions do not depend on server memory.
- Google Sheets is intended for the MVP/early stage, not high-volume marketplace traffic.
