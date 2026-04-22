"use client";

import { fmtInt, fmtMoney } from "@/lib/utils";
import { useSalesTotals } from "./SalesChart";

type Brand = { fbm: number; fba: number; web: number; total: number };

function BrandCard({ label, brand, accent }: { label: string; brand: Brand; accent: string }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className={"mt-1 text-2xl font-semibold tabular-nums " + accent}>{fmtInt(brand.total)}</div>
      <div className="mt-1 text-xs text-stone-500 tabular-nums flex gap-2">
        <span>FBM <span className="text-stone-700 font-medium">{fmtInt(brand.fbm)}</span></span>
        <span>FBA <span className="text-stone-700 font-medium">{fmtInt(brand.fba)}</span></span>
        <span>WEB <span className="text-stone-700 font-medium">{fmtInt(brand.web)}</span></span>
      </div>
    </div>
  );
}

function SimpleCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className={"mt-1 text-2xl font-semibold tabular-nums " + accent}>{value}</div>
    </div>
  );
}

export function StatCards() {
  const t = useSalesTotals();
  if (!t) {
    return (
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm h-24 animate-pulse" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-6 gap-3">
      <BrandCard label="Ford USL sold" brand={t.fordUsl} accent="text-orange-700" />
      <BrandCard label="GM USL sold" brand={t.gmUsl} accent="text-amber-700" />
      <BrandCard label="Ford FOL sold" brand={t.fordFol} accent="text-sky-700" />
      <BrandCard label="GM FOL sold" brand={t.gmFol} accent="text-cyan-700" />
      <SimpleCard label="Total units sold" value={fmtInt(t.totalUnits)} accent="text-stone-800" />
      <SimpleCard label="Total revenue" value={fmtMoney(t.revenue)} accent="text-emerald-700" />
    </div>
  );
}
