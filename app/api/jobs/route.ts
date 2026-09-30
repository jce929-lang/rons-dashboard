import { NextRequest, NextResponse } from "next/server";
import { appendRow, ensureSheet, readRange, writeRange } from "@/lib/sheets";
import { JOB_STEPS, type JobRow, type JobStep } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sheet layout (tab "Jobs"):
// A Job # | B Part # | C Op 1 | D Op 2 | E Op 3 | F Op 4 | G Paint | H Assembly | I Released | J Archived
const TAB = "Jobs";
const HEADER = ["Job #", "Part #", "Op 1", "Op 2", "Op 3", "Op 4", "Paint", "Assembly", "Released", "Archived"];
const STEP_COL: Record<JobStep, string> = { op1: "C", op2: "D", op3: "E", op4: "F", paint: "G", assembly: "H" };

const isYes = (v: string | undefined) => /^(true|y|yes|x|1|done)$/i.test((v ?? "").trim());

async function readAll() {
  await ensureSheet(TAB, [HEADER]);
  const rows = await readRange(`${TAB}!A1:J`);
  return rows.slice(1);
}

/** Sheet row number (1-based) for a job + part, or -1. */
function findRow(body: string[][], job: string, part: string) {
  const i = body.findIndex((r) => (r[0] ?? "").trim() === job && (r[1] ?? "").trim() === part);
  return i === -1 ? -1 : i + 2;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const body = await readAll();
    const items: JobRow[] = body
      .filter((r) => (r[0] ?? "").trim() && !isYes(r[9]))
      .map((r) => {
        const row = {
          job: (r[0] ?? "").trim(),
          part: (r[1] ?? "").trim(),
          released: (r[8] ?? "").trim(),
        } as JobRow;
        JOB_STEPS.forEach((s, i) => (row[s] = isYes(r[2 + i])));
        return row;
      });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}

/** Add a job: { job, part } — or archive all finished jobs: { action: "archiveCompleted" } */
export async function POST(req: NextRequest) {
  const b = await req.json();
  const body = await readAll();

  if (b.action === "archiveCompleted") {
    for (let i = 0; i < body.length; i++) {
      const r = body[i];
      if (!(r[0] ?? "").trim() || isYes(r[9])) continue;
      const done = JOB_STEPS.every((_, k) => isYes(r[2 + k]));
      if (done) await writeRange(`${TAB}!J${i + 2}`, [["Y"]]);
    }
    return NextResponse.json({ ok: true });
  }

  const job = String(b.job ?? "").trim();
  const part = String(b.part ?? "").trim();
  if (!job) return NextResponse.json({ error: "Job # is required" }, { status: 400 });
  if (findRow(body, job, part) !== -1) {
    return NextResponse.json({ error: "That job and part is already on the list" }, { status: 409 });
  }
  // Leading apostrophe keeps Sheets from turning job/part numbers into numbers or dates.
  await appendRow(`${TAB}!A:J`, [`'${job}`, `'${part}`, "", "", "", "", "", "", today(), ""]);
  return NextResponse.json({ ok: true });
}

/** Check / uncheck a step: { job, part, step, done } */
export async function PUT(req: NextRequest) {
  const { job, part, step, done } = (await req.json()) as { job: string; part: string; step: JobStep; done: boolean };
  if (!JOB_STEPS.includes(step)) return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  const body = await readAll();
  const row = findRow(body, String(job).trim(), String(part ?? "").trim());
  if (row === -1) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  await writeRange(`${TAB}!${STEP_COL[step]}${row}`, [[done ? "TRUE" : "FALSE"]]);
  return NextResponse.json({ ok: true });
}
