import { NextResponse } from "next/server";
import { ensureSheet, readRange } from "@/lib/sheets";
import { num } from "@/lib/utils";
import type { ProjectionMonth } from "@/lib/types";

export const dynamic = "force-dynamic";

// Tab "Projections": A Month (YYYY-MM) | B USL Web/Amazon | C USL Distributor | D Closet Locker | E Handgun Locker
// Monthly revenue total is calculated. Edit numbers or add months right in Sheets.
const TAB = "Projections";
const SEED: (string | number)[][] = [
  ["Month", "USL Web/Amazon", "USL Distributor", "Closet Locker", "Handgun Locker"],
  ["'2025-12", 9822, 0, 0, 0],
  ["'2026-01", 5771, 0, 0, 0],
  ["'2026-02", 15246, 0, 0, 0],
  ["'2026-03", 4475, 0, 0, 0],
  ["'2026-04", 14070, 0, 0, 0],
  ["'2026-05", 13390, 0, 0, 0],
  ["'2026-06", 12000, 0, 0, 0],
  ["'2026-07", 14000, 1000, 0, 0],
  ["'2026-08", 12000, 2500, 2000, 0],
  ["'2026-09", 12000, 3750, 3000, 0],
  ["'2026-10", 13000, 6000, 4000, 0],
  ["'2026-11", 15000, 8000, 6000, 2000],
  ["'2026-12", 18000, 9500, 8000, 4000],
  ["'2027-01", 19000, 11000, 9000, 8000],
  ["'2027-02", 21000, 13000, 10000, 10000],
  ["'2027-03", 21500, 15000, 11500, 12000],
  ["'2027-04", 22000, 16000, 13000, 15000],
  ["'2027-05", 22500, 17000, 13500, 17000],
  ["'2027-06", 23000, 18000, 14000, 20000],
];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "2026-10", "10/2026", "Oct 2026", "10/1/2026" or a Sheets date serial -> "2026-10" */
function toMonth(v: string | undefined): string {
  const s = (v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 7);
  return "";
}

const money = (v: string | undefined) => num(String(v ?? "").replace(/[$\s]/g, ""));

export async function GET() {
  try {
    await ensureSheet(TAB, SEED);
    const rows = await readRange(`${TAB}!A1:E`);
    const items: ProjectionMonth[] = rows
      .slice(1)
      .map((r) => {
        const p = { month: toMonth(r[0]), uslWeb: money(r[1]), uslDist: money(r[2]), closet: money(r[3]), handgun: money(r[4]) };
        return { ...p, total: p.uslWeb + p.uslDist + p.closet + p.handgun };
      })
      .filter((p) => p.month)
      .sort((a, b) => a.month.localeCompare(b.month));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
