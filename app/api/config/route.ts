import { NextResponse } from "next/server";
import { readRange } from "@/lib/sheets";
import { num } from "@/lib/utils";
import type { DashboardConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await readRange("Config!A1:B");
  const [, ...body] = rows;
  const map = new Map(body.filter((r) => r[0]).map((r) => [r[0], r[1]]));
  const config: DashboardConfig = {
    usl_unit_price: num(map.get("usl_unit_price")) || 795,
    fol_unit_price: num(map.get("fol_unit_price")) || 1500,
    ram_unit_price: num(map.get("ram_unit_price")) || 795,
    dashboard_title: map.get("dashboard_title") || "Ron's Dashboard",
  };
  return NextResponse.json({ config });
}
