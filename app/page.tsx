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

const SLIDES = ["Weekly sales", "Revenue plan"] as const;
const ROTATE_MS = 20_000; // auto-advance on the TV
const HOLD_MS = 120_000; // after someone picks a slide, stay on it this long
const RELOAD_MS = 30 * 60_000; // full page refresh, so the TV picks up new deploys

export default function Page() {
  const [editing, setEditing] = useState(false);
  const [slide, setSlide] = useState(0);
  const holdUntil = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() >= holdUntil.current) setSlide((s) => (s + 1) % SLIDES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

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

  const pickSlide = (i: number) => {
    holdUntil.current = Date.now() + HOLD_MS;
    setSlide(i);
  };

  return (
    <SWRConfig value={{ refreshInterval: 60000, revalidateOnFocus: true }}>
      <main className="h-screen overflow-hidden bg-stone-50 p-3">
        <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
          {/* Top-left quadrant: slides (weekly sales / revenue plan) */}
          <section className="min-h-0 flex flex-col gap-2">
            {slide === 0 ? (
              <>
                <StatCards compact />
                <div className="flex-1 min-h-0">
                  <SalesChart />
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0">
                <RevenuePlan />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-stone-300 bg-white p-0.5 text-xs">
                {SLIDES.map((name, i) => (
                  <button
                    key={name}
                    onClick={() => pickSlide(i)}
                    className={
                      "px-3 py-1 rounded " +
                      (slide === i ? "bg-stone-800 text-white" : "text-stone-600 hover:text-stone-900")
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
              {slide === 0 && (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md px-3 py-1 text-xs font-medium border bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                >
                  Edit sales
                </button>
              )}
            </div>
          </section>

          {/* Top-right quadrant: product development schedules */}
          <section className="min-h-0">
            <ScheduleGantt />
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
