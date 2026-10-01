import { NextRequest, NextResponse } from "next/server";
import { appendRows, batchWrite, ensureSheet, readRange } from "@/lib/sheets";
import type { InventoryWeek } from "@/lib/types";

export const dynamic = "force-dynamic";

// Tab "Inventory": A Date | B WIP | C Raw Materials | D Open Order Total
const TAB = "Inventory";
const HEADER = ["Date", "WIP", "Raw Materials", "Open Order Total"];

const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(x) ? x : NaN;
};

/** 2026-09-28, 9/28/26, 9/28/2026 or a Sheets serial number -> YYYY-MM-DD */
function toIso(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(+d) ? "" : d.toISOString().slice(0, 10);
}

async function readAll(): Promise<string[][]> {
  await ensureSheet(TAB, [HEADER]);
  return (await readRange(`${TAB}!A1:D`)).slice(1);
}

export async function GET() {
  try {
    const items: InventoryWeek[] = (await readAll())
      .map((r) => ({ date: toIso(r[0]), wip: n(r[1]), rm: n(r[2]), oo: n(r[3]) }))
      .filter((r) => r.date && [r.wip, r.rm, r.oo].every(Number.isFinite) && r.oo > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Add or replace weeks (matched by date):
 *  { weeks: [{ date, wip, rm, oo }, ...] }   or a single { date, wip, rm, oo }
 */
export async function POST(req: NextRequest) {
  const b = await req.json();
  const weeks: InventoryWeek[] = (Array.isArray(b.weeks) ? b.weeks : [b]).map((w: InventoryWeek) => ({
    date: toIso(String(w.date ?? "")),
    wip: n(w.wip),
    rm: n(w.rm),
    oo: n(w.oo),
  }));
  if (weeks.length === 0 || weeks.some((w) => !w.date || ![w.wip, w.rm, w.oo].every(Number.isFinite))) {
    return NextResponse.json({ error: "Each week needs a date and numbers for WIP, raw materials and open orders" }, { status: 400 });
  }
  const body = await readAll();
  const rowOf = new Map<string, number>();
  body.forEach((r, i) => rowOf.set(toIso(r[0]), i + 2));
  const updates: { range: string; values: (string | number)[][] }[] = [];
  const appends: (string | number)[][] = [];
  for (const w of weeks) {
    const row = rowOf.get(w.date);
    const values = [w.date, w.wip, w.rm, w.oo];
    if (row) updates.push({ range: `${TAB}!A${row}:D${row}`, values: [values] });
    else appends.push(values);
  }
  await batchWrite(updates);
  await appendRows(`${TAB}!A:D`, appends);
  return NextResponse.json({ ok: true, updated: updates.length, added: appends.length });
}
