import { NextResponse } from "next/server";
import { ensureSheet, readRange } from "@/lib/sheets";
import type { ScheduleRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const TAB = "Schedule";

const HEADER = ["Product", "Task", "Start", "End", "% Complete", "Critical (Y/N)", "Owner", "Notes"];

// Starter rows written the first time the tab is created. Dates are placeholders.
const P = "Placeholder dates - update";
const SEED: (string | number)[][] = [
  HEADER,
  ["QX", "Working prototype", "2026-07-01", "2026-09-30", 100, "Y", "", ""],
  ["QX", "Keypad design freeze", "2026-10-01", "2026-10-31", 0, "Y", "", P],
  ["QX", "Weapon mount accessories", "2026-10-15", "2026-12-15", 0, "N", "", P],
  ["QX", "Production tooling & fixtures", "2026-11-01", "2026-12-31", 0, "Y", "", P],
  ["QX", "Pilot build & testing", "2027-01-04", "2027-02-12", 0, "Y", "", P],
  ["QX", "Keypad version launch", "2027-03-01", "2027-03-01", 0, "Y", "", P],
  ["QX", "Palm-vein biometric version", "2027-01-15", "2027-06-30", 0, "N", "", P],
  ["Handgun Locker", "HL5 design refinement", "2026-09-01", "2026-10-31", 50, "Y", "", P],
  ["Handgun Locker", "Provisional patent filing", "2026-09-15", "2026-10-15", 25, "Y", "", P],
  ["Handgun Locker", "HL6 concept evaluation", "2026-10-01", "2026-11-30", 0, "N", "", P],
  ["Handgun Locker", "Electronic latch validation", "2026-11-01", "2026-12-15", 0, "Y", "", P],
  ["Handgun Locker", "Pilot build & vehicle fit testing", "2027-01-04", "2027-02-26", 0, "Y", "", P],
  ["Handgun Locker", "Launch", "2027-04-01", "2027-04-01", 0, "Y", "", P],
];

/** Accepts 2026-10-01, 10/1/2026, Oct 1 2026, or a Sheets serial number. Returns YYYY-MM-DD or "". */
function toIso(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (isNaN(+d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toPct(v: string | undefined): number {
  const s = (v ?? "").replace("%", "").trim();
  if (!s) return 0;
  let n = Number(s);
  if (!Number.isFinite(n)) return 0;
  if (n > 0 && n <= 1 && !(v ?? "").includes("%") && s.includes(".")) n = n * 100;
  return Math.max(0, Math.min(100, n));
}

export async function GET() {
  try {
    await ensureSheet(TAB, SEED);
    const rows = await readRange(`${TAB}!A1:H`);
    const [, ...body] = rows;
    const items: ScheduleRow[] = body
      .filter((r) => (r[0] ?? "").trim() && (r[1] ?? "").trim())
      .map((r) => {
        const start = toIso(r[2]);
        const end = toIso(r[3]) || start;
        return {
          product: r[0].trim(),
          task: r[1].trim(),
          start: start || end,
          end,
          pct: toPct(r[4]),
          critical: /^(y|yes|true|x|1)$/i.test((r[5] ?? "").trim()),
          owner: (r[6] ?? "").trim(),
          notes: (r[7] ?? "").trim(),
        };
      })
      .filter((r) => r.start && r.end);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
