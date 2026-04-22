# Ron's Dashboard — setup

End-to-end setup from zero to a live URL. ~30 minutes, mostly one-time.

## 1. Install Node.js

Download the **LTS** installer from https://nodejs.org (Windows 64-bit). Run it, click through the defaults. Then open a new terminal and confirm:

```
node --version
npm --version
```

Both should print a version number.

## 2. Install app dependencies

From this folder (`Ron's Dashboard`):

```
npm install
```

## 3. Create the Google Sheet

1. Open https://drive.google.com and drag `Rons Dashboard Template.xlsx` (in this folder) into Drive.
2. Right-click the uploaded file → **Open with → Google Sheets**. Save as a Google Sheet (File → Save as Google Sheets).
3. From the URL, copy the Sheet ID — the long string between `/d/` and `/edit`:
   - `https://docs.google.com/spreadsheets/d/`**`1A2B3C...xyz`**`/edit`
4. Keep the tab names exactly as-is: `Quotes`, `Viability`, `Sales`, `Config`. Edit/add rows freely.

## 4. Create a Google service account

This gives the app a non-human "user" that can read/write the sheet.

1. Go to https://console.cloud.google.com → **Select a project → New Project** → name it `rons-dashboard`.
2. In the left menu: **APIs & Services → Library** → search "Google Sheets API" → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   - Name: `rons-dashboard-bot`. Click Create. Skip the optional role. Click Done.
4. Click the service account you just made → **Keys** tab → **Add key → Create new key → JSON**. A `.json` file downloads — save it somewhere private (do NOT commit it).
5. Open the JSON file. You need two fields: `client_email` and `private_key`.
6. **Back in your Google Sheet:** click **Share**, paste the `client_email`, give it **Editor** access, uncheck "Notify people". Share.

## 5. Add environment variables

Copy `.env.local.example` to `.env.local` and fill it in:

```
GOOGLE_SHEET_ID=1A2B3C...xyz
GOOGLE_SERVICE_ACCOUNT_EMAIL=rons-dashboard-bot@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

Notes:
- Keep the quotes around `GOOGLE_PRIVATE_KEY`.
- The key contains literal `\n` escape sequences — leave them as `\n`, don't replace with real line breaks.

## 6. Run locally

```
npm run dev
```

Open http://localhost:3000 . If you see the dashboard with data, you're good.

If you see an error about missing env vars or "The caller does not have permission", re-check step 4.6 (did you share the sheet with the service account email?).

## 7. Deploy to Vercel (free)

1. Install: `npm install -g vercel`
2. From this folder: `vercel`
   - Log in with email/GitHub.
   - Accept defaults, confirm project name `rons-dashboard`.
3. Add environment variables: `vercel env add GOOGLE_SHEET_ID`, repeat for `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`. (Paste the private key exactly as in `.env.local`.)
4. Deploy: `vercel --prod`
5. You get a URL like `rons-dashboard.vercel.app`. Open it — done.

## 8. Connect ronsdashboard.com (when you own the domain)

1. Buy the domain from any registrar (Cloudflare, Namecheap, Google Domains).
2. In Vercel: project → **Settings → Domains → Add** → enter `ronsdashboard.com`.
3. Vercel shows a DNS record to add at your registrar (A record or CNAME). Add it. Wait a few minutes.
4. Vercel auto-issues an SSL cert. Done.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Missing GOOGLE_SHEET_ID" on page load | `.env.local` not loaded — restart `npm run dev` |
| "The caller does not have permission" | Share the Sheet with the service account `client_email` as Editor |
| Sheets API 403 | Enable the Google Sheets API in the Cloud Console project (step 4.2) |
| Private key parse error | Make sure `GOOGLE_PRIVATE_KEY` is wrapped in double quotes and keeps its `\n` escapes |
| Numbers on viability row aren't saving | Use whole numbers 0–10; hit the "Save" button that appears after editing |

## Adding / editing data

- **Quotes**: click **Edit** on the dashboard → add new ones at the bottom. Or edit `Quotes` tab directly in Google Sheets — add rows, no need to sort.
- **Viability**: click **Edit** → adjust the three scores → **Save** on that row. Score recomputes automatically. Rows sort by score on display.
- **Sales**: click **Edit** → scroll to "Add weekly sales" → enter the week, pick Actual or Forecast, fill in the channel numbers that apply, click "Add week".
- **Prices / title**: edit the `Config` tab directly in Sheets. Changes show up on next page load.
