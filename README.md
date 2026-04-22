# Ron's Dashboard

A web dashboard backed by a Google Sheet. Quote of the day, product viability scores, weekly sales chart and forecast.

**First time? Read [SETUP.md](./SETUP.md).**

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 
- Recharts
- Google Sheets API (read/write via service account)
- Deploys to Vercel

## Layout
```
app/            — pages + API routes (/api/quotes, /api/viability, /api/sales, /api/config)
components/     — UI: QuoteOfDay, ViabilityGrid, SalesChart, StatCards, SalesEditor
lib/            — sheets client, types, formatting utils
Rons Dashboard Template.xlsx  — upload this to Drive and open as a Google Sheet
```

## Scripts
- `npm run dev` — local dev at http://localhost:3000
- `npm run build` && `npm run start` — production build
- `vercel --prod` — deploy
