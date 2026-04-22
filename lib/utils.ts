import clsx, { ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Deterministic index for a given day — picks the same quote all day, rotates at midnight. */
export function dayIndex(total: number, date = new Date()): number {
  if (total <= 0) return 0;
  const epoch = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.floor(epoch / (1000 * 60 * 60 * 24));
  return ((days % total) + total) % total;
}
