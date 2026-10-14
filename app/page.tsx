"use client";

import { useEffect, useRef, useState } from "react";
import { SWRConfig } from "swr";
import { SalesChart } from "@/components/SalesChart";
import { StatCards } from "@/components/StatCards";
import { SalesEditor } from "@/components/SalesEditor";
import { ScheduleGantt } from "@/components/ScheduleGantt";
import { JobTracker } from "@/components/JobTracker";
import { InventoryKpi } from "@/components/InventoryKpi";
import { RevenuePlan } from "@/components/RevenuePlan";
import { LightweldGantt } from "@/components/LightweldGantt";

const SLIDES = ["Weekly sales", "Revenue plan"] as const;
const TR_SLIDES = ["Product dev", "LightWELD"] as const;
const TOGGLE_SPACE = 190; // px kept clear in each pane's header for the toggle
const RELOAD_MS = 30 * 60_000; // full page refresh, so the TV picks up new deploys

export default function Page() {
  const [editing, setEditing] = useState(false);
  // Panes don't rotate on their own. Whichever pane is picked stays up, and is remembered
  // on this screen so the 30-minute reload doesn't flip it back.
  const [slide, setSlide] = usePane("pane-top-left", SLIDES.length);
  const [trSlide, setTrSlide] = usePane("pane-top-right", TR_SLIDES.length);

  // Reload the whole page every 30 minutes. If someone is typing or the sales editor is open,
  // wait and try again a minute later so nothing they entered is lost.
  const editingRef = useRef(false);
  editingRef.current = editing;
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tryReload = () => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (editingRef.current || typing) id = setTimeout(tryReload, 60_000);
      else window.location.reload();
    };
    id = setTimeout(tryReload, RELOAD_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <SWRConfig value={{ refreshInterval: 60000, revalidateOnFocus: true }}>
      <main className="h-screen overflow-hidden bg-stone-50 p-3">
        <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
          {/* Top-left quadrant: slides (weekly sales / revenue plan).
              The slide toggle floats in the top-right corner so it doesn't take a row of its own. */}
          <section className="relative min-h-0 flex flex-col gap-2">
            {slide === 0 ? (
              <>
                {/* leave room on the right for the slide toggle */}
                <div className="pr-[188px]">
                  <StatCards compact />
                </div>
                <div className="flex-1 min-h-0">
                  <SalesChart />
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="absolute bottom-2 right-2 rounded-md px-3 py-1 text-xs font-medium border bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                >
                  Edit sales
                </button>
              </>
            ) : (
              <div className="flex-1 min-h-0">
                <RevenuePlan />
              </div>
            )}
            <PaneToggle names={SLIDES} value={slide} onPick={setSlide} />
          </section>

          {/* Top-right quadrant: schedules (product development / LightWELD booth) */}
          <section className="relative min-h-0">
            {trSlide === 0 ? <ScheduleGantt reserveRight={TOGGLE_SPACE} /> : <LightweldGantt reserveRight={TOGGLE_SPACE} />}
            <PaneToggle names={TR_SLIDES} value={trSlide} onPick={setTrSlide} />
          </section>

          {/* Bottom-left quadrant: shop job releases */}
          <section className="min-h-0">
            <JobTracker />
          </section>

          {/* Bottom-right quadrant: shop KPIs */}
          <section className="min-h-0">
            <InventoryKpi />
          </section>
        </div>

        {editing && (
          <div
            className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6"
            onClick={() => setEditing(false)}
          >
            <div
              className="w-full max-w-5xl max-h-full overflow-y-auto rounded-2xl bg-stone-50 p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium border bg-stone-800 text-white border-stone-800 hover:bg-stone-900"
                >
                  Done editing
                </button>
              </div>
              <SalesEditor />
            </div>
          </div>
        )}
      </main>
    </SWRConfig>
  );
}

/** Remembers which pane a quadrant shows (per screen). Falls back to the first pane. */
function usePane(key: string, count: number): [number, (i: number) => void] {
  const [value, setValue] = useState(0);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(key));
      if (Number.isInteger(v) && v >= 0 && v < count) setValue(v);
    } catch {}
  }, [key, count]);
  const pick = (i: number) => {
    setValue(i);
    try {
      localStorage.setItem(key, String(i));
    } catch {}
  };
  return [value, pick];
}

function PaneToggle({ names, value, onPick }: { names: readonly string[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="absolute top-2 right-2 z-30 inline-flex rounded-md border border-stone-300 bg-white/95 p-0.5 text-[11px] shadow-sm">
      {names.map((name, i) => (
        <button
          key={name}
          onClick={() => onPick(i)}
          className={"px-2.5 py-0.5 rounded " + (value === i ? "bg-stone-800 text-white" : "text-stone-600 hover:text-stone-900")}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
