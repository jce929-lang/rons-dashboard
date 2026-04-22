import { NextRequest, NextResponse } from "next/server";
import { readRange, writeRange, appendRow } from "@/lib/sheets";
import type { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await readRange("Quotes!A1:B");
  const [, ...body] = rows;
  const quotes: Quote[] = body
    .filter((r) => r[0])
    .map((r) => ({ quote: r[0] ?? "", author: r[1] ?? "" }));
  return NextResponse.json({ quotes });
}

export async function POST(req: NextRequest) {
  const { quote, author } = (await req.json()) as Quote;
  if (!quote) return NextResponse.json({ error: "quote required" }, { status: 400 });
  await appendRow("Quotes!A:B", [quote, author ?? ""]);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const { index, quote, author } = (await req.json()) as Quote & { index: number };
  const rowNumber = index + 2; // header + 1-based
  await writeRange(`Quotes!A${rowNumber}:B${rowNumber}`, [[quote, author ?? ""]]);
  return NextResponse.json({ ok: true });
}
