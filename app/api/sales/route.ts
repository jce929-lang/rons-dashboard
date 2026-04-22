import { NextRequest, NextResponse } from "next/server";
import { readRange, writeRange, appendRow } from "@/lib/sheets";
import { num } from "@/lib/utils";
import { SALES_CHANNELS, SalesRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGE = "Sales!A1:Q";

function parseRow(r: string[]): SalesRow {
  const [week_of, type, ...rest] = r;
  const channels = SALES_CHANNELS.reduce((acc, name, i) => {
    acc[name] = num(rest[i]);
    return acc;
  }, {} as Record<(typeof SALES_CHANNELS)[number], number>);
  return {
    week_of: week_of ?? "",
    type: type === "Forecast" ? "Forecast" : "Actual",
    ...channels,
  };
}

export async function GET() {
  const rows = await readRange(RANGE);
  const [, ...body] = rows;
  const items = body.filter((r) => r[0]).map(parseRow);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const row = (await req.json()) as SalesRow;
  const vals = [row.week_of, row.type, ...SALES_CHANNELS.map((c) => row[c] || null)];
  await appendRow("Sales!A:Q", vals);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const { index, ...row } = (await req.json()) as SalesRow & { index: number };
  const r = index + 2;
  const vals = [row.week_of, row.type, ...SALES_CHANNELS.map((c) => row[c] || null)];
  await writeRange(`Sales!A${r}:Q${r}`, [vals]);
  return NextResponse.json({ ok: true });
}
