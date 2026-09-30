"use client";

import { useState } from "react";
import { SWRConfig } from "swr";
import { SalesChart } from "@/components/SalesChart";
import { StatCards } from "@/components/StatCards";
import { SalesEditor } from "@/components/SalesEditor";
import { ScheduleGantt } from "@/components/ScheduleGantt";
import { JobTracker } from "@/components/JobTracker";

function InProgress() {
  return (
    <div className="rounded-2xl bg-white border border-dashed border-stone-300 shadow-sm h-full min-h-0 flex items-center justify-center">
      <span className="text-lg font-medium text-stone-400">In progress</span>
    </div>
  );
}

export default function Page() {
  const [editing, setEditing] = useState(false);

  return (
    <SWRConfig value={{ refreshInterval: 60000, revalidateOnFocus: true }}>
      <main className="h-screen overflow-hidden bg-stone-50 p-3">
        <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
          {/* Top-left quadrant: weekly sales */}
          <section className="relative min-h-0 flex flex-col gap-2">
            <StatCards compact />
            <div className="flex-1 min-h-0">
              <SalesChart />
            </div>
            <button
              onClick={() => setEditing(true)}
              className="absolute bottom-2 right-2 rounded-md px-3 py-1 text-xs font-medium border bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
            >
              Edit sales
            </button>
          </section>

          {/* Top-right quadrant: product development schedules */}
          <section className="min-h-0">
            <ScheduleGantt />
          </section>

          {/* Bottom-left quadrant: shop job releases */}
          <section className="min-h-0">
            <JobTracker />
          </section>

          <InProgress />
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
