import { NextRequest, NextResponse } from "next/server";
import { appendRows, batchWrite, ensureSheet, readRange, writeRange } from "@/lib/sheets";
import type { ShopJob } from "@/lib/types";

export const dynamic = "force-dynamic";

// One row per job operation, laid out like a Made2Manage job routing report.
// A Job # | B Parent Job # | C Part # | D Rev | E Description | F Qty | G Due Date |
// H Op # | I WC # | J WC Desc | K Done | L Qty Comp | M Qty Rem | N Archived
const TAB = "Job Ops";
const HEADER = [
  "Job #", "Parent Job #", "Part #", "Rev", "Description", "Qty", "Due Date",
  "Op #", "WC #", "WC Desc", "Done", "Qty Comp", "Qty Rem", "Archived",
];

type Cell = string | number | null;

const isYes = (v: string | undefined) => /^(true|y|yes|x|1|done)$/i.test((v ?? "").trim());
const txt = (v: unknown) => `'${String(v ?? "").trim()}`; // keep Sheets from reformatting IDs
const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

/** 2026-10-13, 10/13/26, 10/13/2026 or a Sheets serial number -> YYYY-MM-DD */
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
  const rows = await readRange(`${TAB}!A1:N`);
  return rows.slice(1);
}

const key = (job: string, op: number | string) => `${String(job).trim()}|${n(op)}`;

export async function GET() {
  try {
    const body = await readAll();
    const byJob = new Map<string, ShopJob>();
    for (const r of body) {
      const job = (r[0] ?? "").trim();
      if (!job || isYes(r[13])) continue;
      let j = byJob.get(job);
      if (!j) {
        j = {
          job,
          parent: (r[1] ?? "").trim(),
          part: (r[2] ?? "").trim(),
          rev: (r[3] ?? "").trim(),
          desc: (r[4] ?? "").trim(),
          qty: n(r[5]),
          due: toIso(r[6]),
          ops: [],
        };
        byJob.set(job, j);
      }
      if ((r[7] ?? "").trim() || (r[9] ?? "").trim()) {
        j.ops.push({
          op: n(r[7]),
          wc: (r[8] ?? "").trim(),
          wcDesc: (r[9] ?? "").trim(),
          done: isYes(r[10]),
          comp: n(r[11]),
          rem: n(r[12]),
        });
      }
    }
    const items = [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job, undefined, { numeric: true }));
    for (const j of items) j.ops.sort((a, b) => a.op - b.op);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}

type ImportJob = Omit<ShopJob, "ops"> & {
  ops: { op: number; wc?: string; wcDesc: string; comp?: number; rem?: number }[];
};

function rowFor(j: ImportJob, o: ImportJob["ops"][number], done: boolean): Cell[] {
  return [
    txt(j.job), txt(j.parent), txt(j.part), txt(j.rev), txt(j.desc), n(j.qty), toIso(j.due),
    n(o.op), txt(o.wc), txt(o.wcDesc), done ? "TRUE" : "FALSE", n(o.comp), n(o.rem),
  ];
}

/**
 * POST actions:
 *  { action: "add", job, parent?, part, rev?, desc?, qty?, due?, ops: ["LASER L5", "PRESS BRAKE", ...] }
 *  { action: "import", jobs: ImportJob[], archiveMissing?: boolean }  - load/refresh from an M2M report
 *  { action: "archiveCompleted" }                                    - hide jobs with every op checked
 */
export async function POST(req: NextRequest) {
  const b = await req.json();
  const body = await readAll();
  const rowOf = new Map<string, number>(); // key -> sheet row number
  body.forEach((r, i) => {
    if ((r[0] ?? "").trim()) rowOf.set(key(r[0], r[7]), i + 2);
  });

  if (b.action === "archiveCompleted") {
    const jobs = new Map<string, { rows: number[]; allDone: boolean }>();
    body.forEach((r, i) => {
      const job = (r[0] ?? "").trim();
      if (!job || isYes(r[13])) return;
      const e = jobs.get(job) ?? { rows: [], allDone: true };
      e.rows.push(i + 2);
      if (!isYes(r[10])) e.allDone = false;
      jobs.set(job, e);
    });
    const data = [...jobs.values()]
      .filter((e) => e.allDone)
      .flatMap((e) => e.rows.map((row) => ({ range: `${TAB}!N${row}`, values: [["Y"]] as Cell[][] })));
    await batchWrite(data);
    return NextResponse.json({ ok: true, archivedRows: data.length });
  }

  if (b.action === "import") {
    const jobs = (b.jobs ?? []) as ImportJob[];
    const updates: { range: string; values: Cell[][] }[] = [];
    const appends: Cell[][] = [];
    const seen = new Set<string>();
    for (const j of jobs) {
      seen.add(String(j.job).trim());
      for (const o of j.ops) {
        const row = rowOf.get(key(j.job, o.op));
        const m2mDone = n(o.rem) === 0 && n(o.comp) > 0;
        if (row) {
          const wasDone = isYes(body[row - 2][10]);
          updates.push({ range: `${TAB}!A${row}:M${row}`, values: [rowFor(j, o, wasDone || m2mDone)] });
        } else {
          appends.push([...rowFor(j, o, m2mDone), ""]);
        }
      }
    }
    if (b.archiveMissing) {
      body.forEach((r, i) => {
        const job = (r[0] ?? "").trim();
        if (job && !isYes(r[13]) && !seen.has(job)) updates.push({ range: `${TAB}!N${i + 2}`, values: [["Y"]] });
      });
    }
    await batchWrite(updates);
    await appendRows(`${TAB}!A:N`, appends);
    return NextResponse.json({ ok: true, updated: updates.length, added: appends.length });
  }

  if (b.action === "add") {
    const job = String(b.job ?? "").trim();
    if (!job) return NextResponse.json({ error: "Job # is required" }, { status: 400 });
    if (body.some((r) => (r[0] ?? "").trim() === job && !isYes(r[13]))) {
      return NextResponse.json({ error: "That job is already on the list" }, { status: 409 });
    }
    const opNames: string[] = (b.ops ?? []).map((s: string) => String(s).trim()).filter(Boolean);
    if (opNames.length === 0) return NextResponse.json({ error: "Add at least one operation" }, { status: 400 });
    const j: ImportJob = {
      job,
      parent: b.parent ?? "",
      part: b.part ?? "",
      rev: b.rev ?? "",
      desc: b.desc ?? "",
      qty: n(b.qty),
      due: b.due ?? "",
      ops: opNames.map((wcDesc, i) => ({ op: (i + 1) * 10, wcDesc, rem: n(b.qty) })),
    };
    await appendRows(`${TAB}!A:N`, j.ops.map((o) => [...rowFor(j, o, false), ""]));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** Check / uncheck one operation: { job, op, done } */
export async function PUT(req: NextRequest) {
  const { job, op, done } = (await req.json()) as { job: string; op: number; done: boolean };
  const body = await readAll();
  const i = body.findIndex((r) => key(r[0] ?? "", r[7] ?? "") === key(job, op) && !isYes(r[13]));
  if (i === -1) return NextResponse.json({ error: "Operation not found" }, { status: 404 });
  await writeRange(`${TAB}!K${i + 2}`, [[done ? "TRUE" : "FALSE"]]);
  return NextResponse.json({ ok: true });
}
