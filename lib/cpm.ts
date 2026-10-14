// Critical-path (CPM) schedule math, matching the LightWELD spreadsheet's formulas.
// "Day numbers" are working days counted from the project start (start = day 1, like NETWORKDAYS).

export type CpmInput = {
  id: number;
  task: string;
  duration: number; // working days, may be fractional
  preds: number[]; // task IDs that must finish first
  due: string; // YYYY-MM-DD or ""
  owner: string;
  actualFinish: string; // YYYY-MM-DD or "" (set = done)
};

export type CpmTask = CpmInput & {
  es: number; // early start (working days from start)
  ef: number; // early finish
  ls: number; // late start
  lf: number; // late finish
  slack: number;
  status: "Done" | "Critical" | "Ok";
  start: string; // calendar dates
  finish: string;
  pastDue: number | null; // calendar days finish is after the due date (+ = late)
};

export type CpmResult = {
  projectStart: string;
  nonWorking: string; // 7 chars Mon→Sun, 1 = day off (e.g. "0000011")
  tasks: CpmTask[];
  durationDays: number;
  completion: string;
  criticalPath: number[];
};

const DAY = 86400000;
const toMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function makeCalendar(nonWorking: string) {
  const off = nonWorking.padStart(7, "0").slice(-7); // index 0 = Monday
  const isWork = (ms: number) => off[(new Date(ms).getUTCDay() + 6) % 7] !== "1";

  /** NETWORKDAYS.INTL(start, date): working days from start to date, inclusive. */
  const networkdays = (startIso: string, dateIso: string) => {
    let a = toMs(startIso);
    let b = toMs(dateIso);
    const sign = b >= a ? 1 : -1;
    if (sign < 0) [a, b] = [b, a];
    let n = 0;
    for (let t = a; t <= b; t += DAY) if (isWork(t)) n++;
    return sign * n;
  };

  /** WORKDAY.INTL(start, n): the date n working days after start (n = 0 returns start). */
  const workday = (startIso: string, n: number) => {
    let t = toMs(startIso);
    const step = n >= 0 ? DAY : -DAY;
    let left = Math.abs(n);
    while (left > 0) {
      t += step;
      if (isWork(t)) left--;
    }
    return toIso(t);
  };

  return { isWork, networkdays, workday };
}

export function computeCpm(input: CpmInput[], projectStart: string, nonWorking = "0000011"): CpmResult {
  const cal = makeCalendar(nonWorking);
  const n = input.length;
  const es: number[] = new Array(n).fill(0);
  const ef: number[] = new Array(n).fill(0);
  const ls: number[] = new Array(n).fill(0);
  const lf: number[] = new Array(n).fill(0);

  // Forward pass (predecessors must be listed above the task, same as the sheet).
  for (let i = 0; i < n; i++) {
    const t = input[i];
    let s = 0;
    for (let j = 0; j < i; j++) if (t.preds.includes(input[j].id)) s = Math.max(s, ef[j]);
    es[i] = s;
    ef[i] = t.actualFinish ? cal.networkdays(projectStart, t.actualFinish) : s + t.duration;
  }
  const durationDays = n ? Math.max(...ef) : 0;

  // Backward pass: late finish = earliest of project end, the task's own due date, and successors' late starts.
  for (let i = n - 1; i >= 0; i--) {
    const t = input[i];
    let f = durationDays;
    if (t.due) f = Math.min(f, cal.networkdays(projectStart, t.due));
    for (let j = i + 1; j < n; j++) if (input[j].preds.includes(t.id)) f = Math.min(f, ls[j]);
    lf[i] = f;
    ls[i] = f - t.duration;
  }

  const tasks: CpmTask[] = input.map((t, i) => {
    const slack = Math.round((ls[i] - es[i]) * 1000) / 1000;
    const start = cal.workday(projectStart, Math.floor(es[i]));
    const finish = t.actualFinish || cal.workday(projectStart, Math.ceil(ef[i]) - 1);
    return {
      ...t,
      es: es[i],
      ef: ef[i],
      ls: ls[i],
      lf: lf[i],
      slack,
      status: t.actualFinish ? "Done" : slack <= 0 ? "Critical" : "Ok",
      start,
      finish,
      pastDue: t.due ? Math.round((toMs(finish) - toMs(t.due)) / DAY) : null,
    };
  });

  return {
    projectStart,
    nonWorking,
    tasks,
    durationDays,
    completion: n ? cal.workday(projectStart, Math.ceil(durationDays) - 1) : projectStart,
    criticalPath: tasks.filter((t) => t.status === "Critical").map((t) => t.id),
  };
}

/** Is this calendar date a working day? (for shading the chart) */
export function isWorkingDay(iso: string, nonWorking = "0000011") {
  return makeCalendar(nonWorking).isWork(toMs(iso));
}
