import { NextRequest, NextResponse } from "next/server";
import { readRange, writeRange, appendRow } from "@/lib/sheets";
import { num } from "@/lib/utils";
import type { ViabilityRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await readRange("Viability!A1:D");
  const [, ...body] = rows;
  const items: ViabilityRow[] = body
    .filter((r) => r[0])
    .map((r) => {
      const potential = num(r[1]);
      const channels = num(r[2]);
      const remaining_work = num(r[3]);
      return {
        product: r[0],
        potential,
        channels,
        remaining_work,
        score: potential * channels * remaining_work,
      };
    });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ViabilityRow;
  await appendRow("Viability!A:D", [body.product, body.potential, body.channels, body.remaining_work]);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const { index, product, potential, channels, remaining_work } = (await req.json()) as ViabilityRow & { index: number };
  const row = index + 2;
  await writeRange(`Viability!A${row}:D${row}`, [[product, potential, channels, remaining_work]]);
  return NextResponse.json({ ok: true });
}
