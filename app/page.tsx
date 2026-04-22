"use client";

import { useState } from "react";
import { QuoteOfDay } from "@/components/QuoteOfDay";
import { ViabilityGrid } from "@/components/ViabilityGrid";
import { SalesChart } from "@/components/SalesChart";
import { StatCards } from "@/components/StatCards";
import { SalesEditor } from "@/components/SalesEditor";

export default function Page() {
  const [editing, setEditing] = useState(false);

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-stone-50 p-3 gap-3">
      <StatCards />

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex-[5] min-h-0 flex flex-col">
          <SalesChart />
        </div>
        <div className="flex-[2] min-h-0 overflow-y-auto">
          <ViabilityGrid editing={editing} />
        </div>
      </div>

      <div className="flex gap-3 items-stretch">
        <div className="flex-1">
          <QuoteOfDay editing={editing} />
        </div>
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setEditing((e) => !e)}
            className={
              "rounded-md px-4 py-2 text-sm font-medium border " +
              (editing
                ? "bg-stone-800 text-white border-stone-800 hover:bg-stone-900"
                : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50")
            }
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="overflow-y-auto max-h-96">
          <SalesEditor />
        </div>
      )}
    </main>
  );
}
