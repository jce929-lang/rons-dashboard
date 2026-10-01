export type Quote = { quote: string; author: string };

export type ViabilityRow = {
  product: string;
  potential: number;
  channels: number;
  remaining_work: number;
  score: number;
};

export const SALES_CHANNELS = [
  "ford_usl_fbm", "ford_usl_fba", "ford_usl_web",
  "gm_usl_fbm", "gm_usl_fba", "gm_usl_web",
  "ford_fol_fbm", "ford_fol_fba", "ford_fol_web",
  "gm_fol_fbm", "gm_fol_fba", "gm_fol_web",
  "ram_fbm", "ram_fba", "ram_web",
  // Distributor sales (added after the original 15 columns so existing sheet columns don't move)
  "ford_usl_dist", "gm_usl_dist", "ford_fol_dist", "gm_fol_dist", "ram_dist",
] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

export type SalesRow = {
  week_of: string;
  type: "Actual" | "Forecast";
  /** Weekly revenue $ from the sales master. Blank = units x Config prices. */
  revenue?: number | null;
  /** Forecast rows only: total forecast units (USL + FOL) from the sales master. */
  forecast_units?: number | null;
} & Record<SalesChannel, number>;

export type DashboardConfig = {
  usl_unit_price: number;
  fol_unit_price: number;
  ram_unit_price: number;
  dashboard_title: string;
};

export type ScheduleRow = {
  product: string;
  task: string;
  start: string; // ISO date YYYY-MM-DD
  end: string;   // ISO date YYYY-MM-DD (same as start = milestone)
  pct: number;   // 0-100
  critical: boolean;
  owner: string;
  notes: string;
};

/** One routing operation on a shop job (mirrors a Made2Manage job routing line). */
export type JobOp = {
  op: number;      // 10, 20, 30...
  wc: string;      // work center #
  wcDesc: string;  // work center name, e.g. LASER L5
  done: boolean;
  comp: number;    // qty complete (from M2M)
  rem: number;     // qty remaining (from M2M)
};

export type ShopJob = {
  job: string;
  parent: string;
  part: string;
  rev: string;
  desc: string;
  qty: number;
  due: string; // YYYY-MM-DD
  ops: JobOp[];
};

/** One weekly inventory snapshot (from the WIP / RM / Open Orders M2M reports). */
export type InventoryWeek = {
  date: string; // YYYY-MM-DD
  wip: number;  // work in process $
  rm: number;   // raw materials $
  oo: number;   // open order total $
};
