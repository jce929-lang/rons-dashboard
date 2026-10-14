import { NextRequest, NextResponse } from "next/server";
import { ensureSheet, readRange, writeRange } from "@/lib/sheets";
import { computeCpm, type CpmInput } from "@/lib/cpm";

export const dynamic = "force-dynamic";

// "LightWELD" tab: one row per task (A..G); project settings live in I1:J2.
// The dashboard does the critical-path math, so only the inputs are kept in the sheet.
const TAB = "LightWELD";
const HEADER = ["Task ID", "Task", "Duration (working days)", "Predecessors (task IDs)", "Due date", "Owner", "Actual finish"];

// Leading ' keeps Sheets from turning "1,2" or "0000011" into numbers.
const T = (s: string) => (s ? `'${s}` : "");
const SEED_TASKS: [number, string, number, string, string, string, string][] = [
  [1, "finalize layout of booth with locations for robot and fixture tables", 1, "", "2026-10-08", "Ron/Jackson", ""],
  [2, "mark floor for concrete cut", 0.2, "1", "2026-10-09", "Ron/Jacob", "2026-10-09"],
  [3, "cut concrete/ pour new pad", 1, "1,2", "2026-10-10", "Jacob/James Barger", "2026-10-10"],
  [4, "clean up plates, drill and tap holes", 1, "", "2026-10-14", "Rich/Casey", ""],
  [5, "weld and inspect pedestal", 1, "4", "2026-10-15", "Casey/L&N Welding", ""],
  [6, "purchase chem anchors and robot mounting studs", 2, "", "2026-10-14", "Sarah/Adam", ""],
  [7, "specify and purchase fixture tables", 2, "", "2026-10-14", "Sarah/Adam/Casey/Jackson", ""],
  [8, "complete detailed design of booth", 5, "1", "2026-10-15", "Eric/Jackson", ""],
  [9, "determine method of securing tables to floor and to pedestal", 1, "7", "2026-10-16", "Jacob/Casey", ""],
  [10, "specify and purchase windows", 1, "1,8", "2026-10-16", "Eric/Matt/Sarah/Adam", ""],
  [11, "design operating mechanism for automatic doors", 3, "", "2026-10-15", "Eric/Casey/Jackson/Ron", ""],
  [12, "specify and purchase automatic door components", 2, "11", "2026-10-16", "Jackson/Sarah/Casey", ""],
  [13, "fabricate booth", 14, "8", "2026-11-02", "Matt/Gammons", ""],
  [14, "install Fanuc Robot and pedestal", 1, "1,2,3,4,5,6", "2026-10-30", "Casey/Jacob/Serra Laser", ""],
  [15, "complete power drops and gas drop", 3, "1,2,3,4,5,6", "2026-10-26", "Casey/Jacob", ""],
  [16, "assemble, install, and level tables", 2, "7,9", "2026-11-03", "Casey/Jacob", ""],
  [17, "assemble booth", 3, "13,14,15,16", "2026-11-04", "Casey/Jacob/Matt", ""],
  [18, "schedule training with Serra Laser", 3, "14,15,16,17", "2026-11-12", "", ""],
];
// Settings sit in columns I:J beside the first rows.
const SETTINGS: [string, string][] = [
  ["Project start", "2026-10-08"],
  ["Non-working days (Mon→Sun, 1 = off)", "'0000011"],
  ["How to use", "Predecessors = task IDs separated by commas. Enter Actual finish when a task is done."],
];
const SEED: (string | number)[][] = [
  HEADER,
  ...SEED_TASKS.map(([id, task, dur, preds, due, owner, fin]) => [id, task, dur, T(preds), due, owner, fin]),
].map((r, i) => (SETTINGS[i] ? [...r, "", ...SETTINGS[i]] : r));

/** 2026-10-08, 10/8/2026, Oct 8 2026 or a Sheets serial number -> YYYY-MM-DD ("" if blank/unreadable). */
function toIso(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (isNaN(+d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function load() {
  await ensureSheet(TAB, SEED);
  const rows = await readRange(`${TAB}!A1:J`);
  const settings = new Map<string, string>();
  for (const r of rows) if ((r[8] ?? "").trim()) settings.set(r[8].trim().toLowerCase(), (r[9] ?? "").trim());
  const start = toIso(settings.get("project start")) || "2026-10-08";
  const offKey = [...settings.keys()].find((k) => k.startsWith("non-working"));
  const off = ((offKey && settings.get(offKey)) || "0000011").replace(/\D/g, "").padStart(7, "0");

  const tasks: (CpmInput & { row: number })[] = [];
  rows.forEach((r, i) => {
    if (i === 0) return;
    const id = Number((r[0] ?? "").trim());
    const task = (r[1] ?? "").trim();
    if (!task || !Number.isFinite(id)) return;
    tasks.push({
      row: i + 1,
      id,
      task,
      duration: Number((r[2] ?? "").trim()) || 0,
      preds: (r[3] ?? "")
        .split(/[,;\s]+/)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0),
      due: toIso(r[4]),
      owner: (r[5] ?? "").trim(),
      actualFinish: toIso(r[6]),
    });
  });
  return { start, off, tasks };
}

export async function GET() {
  try {
    const { start, off, tasks } = await load();
    return NextResponse.json(computeCpm(tasks, start, off));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, tasks: [] }, { status: 500 });
  }
}

/** Check a task off from the dashboard: { id, done, date? } writes or clears its Actual finish. */
export async function PUT(req: NextRequest) {
  try {
    const { id, done, date } = (await req.json()) as { id: number; done: boolean; date?: string };
    const { tasks } = await load();
    const t = tasks.find((x) => x.id === Number(id));
    if (!t) return NextResponse.json({ error: `No task ${id}` }, { status: 404 });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : new Date().toISOString().slice(0, 10);
    await writeRange(`${TAB}!G${t.row}`, [[done ? day : ""]]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
