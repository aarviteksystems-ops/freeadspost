# FreeAdsPost — Vercel + Google Sheets MVP

FreeAdsPost is a React Router classified-ads portal designed for a zero-infrastructure-cost MVP.

## Architecture

- Frontend: React Router + Vite
- Hosting: Vercel
- API: Express running as a Vercel serverless function
- Persistent storage: Google Sheets via Google Apps Script
- Authentication: stateless signed tokens issued by the Vercel API
- Images: URL-based in this phase; external image storage can be added next

The old local JSON files (`server/data/users.json` and `server/data/ads.json`) are intentionally no longer used.

## Google Sheets setup

1. Create a blank Google Sheet.
2. Open **Extensions → Apps Script**.
3. Replace the Apps Script editor content with `google-apps-script.js`.
4. Deploy → New deployment → Web app.
5. Execute as: **Me**.
6. Who has access: **Anyone**.
7. Authorize and copy the `/exec` URL.

The script automatically creates `Users` and `Ads` sheets and seeds demo ads on first use.

## Vercel setup

Set these Environment Variables in the Vercel project:

- `GOOGLE_SHEET_WEBHOOK_URL` — the Apps Script `/exec` URL
- `FREEADSPOST_TOKEN_SECRET` — a long random secret, preferably 32+ characters

Redeploy after setting the variables.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `http://127.0.0.1:5000`.

## Production

Vercel uses `vercel.json` to route `/api/*` to `api/index.js` and the remaining paths to the SPA build.

## Important security note

The MVP never stores plain-text passwords. Passwords are stored as SHA-256 hashes in the private Google Sheet. For a high-volume production marketplace, replace this authentication/storage layer with a dedicated auth service and stronger password hashing such as Argon2/bcrypt.

Google Sheets is intentionally being used only to keep the first version at approximately ₹0 infrastructure cost. It should be replaced when traffic and concurrent writes become significant.
