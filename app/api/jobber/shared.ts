// Must match the Callback URL saved on the app in Jobber's Developer Center exactly.
export const REDIRECT_URI = process.env.JOBBER_REDIRECT_URI || "https://rons-dashboard.vercel.app/api/jobber/callback";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Small plain page for the person approving the connection. */
export function page(title: string, body: string, ok: boolean) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#fafaf9;color:#1c1917;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.card{max-width:520px;background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:28px}
h1{font-size:20px;margin:0 0 8px;color:${ok ? "#047857" : "#b91c1c"}}p{line-height:1.5;color:#44403c}a{color:#047857}</style></head>
<body><div class="card"><h1>${esc(title)}</h1><p>${esc(body)}</p><p><a href="/">Back to the dashboard</a></p></div></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
