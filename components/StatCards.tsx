"use client";

import { fmtInt, fmtMoney } from "@/lib/utils";
import { useSalesTotals } from "./SalesChart";

type Brand = { fbm: number; fba: number; web: number; total: number };

function BrandCard({ label, brand, accent, compact }: { label: string; brand: Brand; accent: string; compact?: boolean }) {
  return (
    <div className={"rounded-2xl bg-white border border-stone-200 shadow-sm " + (compact ? "px-3 py-2" : "p-4")}>
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className={"font-semibold tabular-nums " + (compact ? "text-xl " : "mt-1 text-2xl ") + accent}>{fmtInt(brand.total)}</div>
      <div className={(compact ? "text-[11px]" : "mt-1 text-xs") + " text-stone-500 tabular-nums flex gap-2"}>
        <span>FBM <span className="text-stone-700 font-medium">{fmtInt(brand.fbm)}</span></span>
        <span>FBA <span className="text-stone-700 font-medium">{fmtInt(brand.fba)}</span></span>
        <span>WEB <span className="text-stone-700 font-medium">{fmtInt(brand.web)}</span></span>
      </div>
    </div>
  );
}

function SimpleCard({ label, value, accent, compact }: { label: string; value: string; accent: string; compact?: boolean }) {
  return (
    <div className={"rounded-2xl bg-white border border-stone-200 shadow-sm " + (compact ? "px-3 py-2" : "p-4")}>
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className={"font-semibold tabular-nums " + (compact ? "text-xl " : "mt-1 text-2xl ") + accent}>{value}</div>
    </div>
  );
}

export function StatCards({ compact = false }: { compact?: boolean } = {}) {
  const t = useSalesTotals();
  const cols = compact ? "grid-cols-3 gap-2" : "grid-cols-6 gap-3";
  if (!t) {
    return (
      <div className={"grid " + cols}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={"rounded-2xl bg-white border border-stone-200 shadow-sm animate-pulse " + (compact ? "h-16" : "h-24")} />
        ))}
      </div>
    );
  }
  return (
    <div className={"grid " + cols}>
      <BrandCard label="Ford USL sold" brand={t.fordUsl} compact={compact} accent="text-orange-700" />
      <BrandCard label="GM USL sold" brand={t.gmUsl} compact={compact} accent="text-amber-700" />
      <BrandCard label="Ford FOL sold" brand={t.fordFol} compact={compact} accent="text-sky-700" />
      <BrandCard label="GM FOL sold" brand={t.gmFol} compact={compact} accent="text-cyan-700" />
      <SimpleCard label="Total units sold" value={fmtInt(t.totalUnits)} compact={compact} accent="text-stone-800" />
      <SimpleCard label="Total revenue" value={fmtMoney(t.revenue)} compact={compact} accent="text-emerald-700" />
    </div>
  );
}
