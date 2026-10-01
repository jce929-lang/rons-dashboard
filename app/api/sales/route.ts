import { NextRequest, NextResponse } from "next/server";
import { readRange, writeRange, appendRow, clearRange, ensureSheet } from "@/lib/sheets";
import { num } from "@/lib/utils";
import { SALES_CHANNELS, SalesRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sales tab layout:
// A week_of | B type | C..Q original 15 channels | R..V dist channels | W revenue | X forecast_units
const TAB = "Sales";
const LAST_COL = "X";
const RANGE = `${TAB}!A1:${LAST_COL}`;
const HEADER = ["week_of", "type", ...SALES_CHANNELS, "revenue", "forecast_units"];
const REV_IDX = 2 + SALES_CHANNELS.length; // column W
const FC_IDX = REV_IDX + 1; // column X

type Cell = string | number | null;

/** 2025-09-29, 9/29/2025 or a Sheets serial number -> YYYY-MM-DD */
function toIso(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return s;
}

const optNum = (v: string | undefined) => ((v ?? "").trim() === "" ? null : num(String(v).replace(/[$\s]/g, "")));

function parseRow(r: string[]): SalesRow {
  const [week_of, type, ...rest] = r;
  const channels = SALES_CHANNELS.reduce((acc, name, i) => {
    acc[name] = num(rest[i]);
    return acc;
  }, {} as Record<(typeof SALES_CHANNELS)[number], number>);
  return {
    week_of: toIso(week_of),
    type: type === "Forecast" ? "Forecast" : "Actual",
    revenue: optNum(r[REV_IDX]),
    forecast_units: optNum(r[FC_IDX]),
    ...channels,
  };
}

function toCells(row: Partial<SalesRow>): Cell[] {
  return [
    `'${toIso(String(row.week_of ?? ""))}`,
    row.type === "Forecast" ? "Forecast" : "Actual",
    ...SALES_CHANNELS.map((c) => row[c] || null),
    row.revenue ?? null,
    row.forecast_units ?? null,
  ];
}

export async function GET() {
  const rows = await readRange(RANGE);
  const [, ...body] = rows;
  const items = body.filter((r) => r[0]).map(parseRow);
  return NextResponse.json({ items });
}

/**
 * Add one week: a SalesRow.
 * Replace everything from the sales master: { action: "replaceAll", rows: SalesRow[] }
 *   (the current tab contents are copied to a "Sales_backup_<date>" tab first).
 */
export async function POST(req: NextRequest) {
  const b = await req.json();

  if (b.action === "replaceAll") {
    const rows = (b.rows ?? []) as SalesRow[];
    if (rows.length === 0 || rows.some((r) => !/^\d{4}-\d{2}-\d{2}$/.test(String(r.week_of)))) {
      return NextResponse.json({ error: "Every row needs a week_of date (YYYY-MM-DD)" }, { status: 400 });
    }
    const current = await readRange(RANGE);
    // Tab names can't contain ":" - e.g. Sales_backup_20261001_1430 (UTC)
    const backup = "Sales_backup_" + new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "_");
    await ensureSheet(backup, current.length ? current : [HEADER]);
    await clearRange(RANGE);
    await writeRange(`${TAB}!A1`, [HEADER, ...rows.map(toCells)]);
    return NextResponse.json({ ok: true, rows: rows.length, backup });
  }

  await appendRow(`${TAB}!A:${LAST_COL}`, toCells(b as SalesRow));
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const { index, ...row } = (await req.json()) as SalesRow & { index: number };
  const r = index + 2;
  await writeRange(`${TAB}!A${r}:${LAST_COL}${r}`, [toCells(row)]);
  return NextResponse.json({ ok: true });
}
