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
- **Sales**: the `USL SALES MASTER.xlsx` workbook ("Data and Forecast" tab) is the source of truth. Send Claude the latest copy and it replaces the `Sales` tab with it (the old contents are copied to a `Sales_backup_<date>` tab first). For a single week, click **Edit sales** → "Add weekly sales" → enter the week, pick Actual or Forecast, fill in the channel numbers (FBM / FBA / WEB / DIST), click "Add week".
  - `Sales` tab columns: `week_of`, `type`, 15 original channel columns, then `ford_usl_dist` … `ram_dist`, `revenue` (actual weekly $ from the master; if blank the dashboard uses units × Config prices) and `forecast_units` (forecast rows only).
  - Ram counts toward USL, matching the master.
- **Product development schedule** (top-right of the dashboard): edit the `Schedule` tab in Sheets. The dashboard creates this tab on its own the first time it loads. One row per task:
  - `Product`: e.g. `QX` or `Handgun Locker`. Rows with the same product are grouped together, in sheet order.
  - `Task`, `Start`, `End`: dates like `2026-10-01` or `10/1/2026`. Set Start = End for a milestone (drawn as a diamond).
  - `% Complete`: 0-100. `Critical (Y/N)`: `Y` puts the task on the critical path (drawn in red).
  - `Owner`, `Notes`: optional. Tasks past their end date and under 100% are flagged LATE.
  - To add another product, add rows with a new Product name.
- **Shop job releases** (bottom-left of the dashboard): one row per job, with a checkbox for each operation in its routing (e.g. `10 LASER L5`, `20 PRESS BRAKE`). Click an operation to check it off. Jobs are grouped by job family (e.g. `IZE92`), and the list scrolls. Data lives in the `Job Ops` tab in Sheets, one row per operation, laid out like the M2M Jobs Detail report.
  - **+ Add job**: enter job #, part #, description, qty, due date, and the operations in order separated by commas.
  - **Loading an M2M report**: send Claude a new Jobs Detail PDF and it loads it through the dashboard's import. Operations with 0 remaining in M2M come in checked; boxes you checked by hand stay checked.
  - **Clear finished** hides jobs whose operations are all checked (puts `Y` in the Archived column; nothing is deleted).
- **Shop KPIs: WIP & raw materials vs. open orders** (bottom-right): one row per week in the `Inventory` tab (Date, WIP, Raw Materials, Open Order Total, all in $), the same three numbers as the weekly M2M reports (RPGLTB, RPIVAL, RPBKLG). Add a week with **+ Add week** on the dashboard or by adding a row in Sheets; saving a date that already exists replaces it. The chart shows WIP % and raw materials % of open orders, with dashed 12-month averages; the toggle switches between 8 weeks, 6 months and 1 year.
- **Prices / title**: edit the `Config` tab directly in Sheets. Changes show up on next page load.
