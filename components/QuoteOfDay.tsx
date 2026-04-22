"use client";

import useSWR from "swr";
import { useState } from "react";
import type { Quote } from "@/lib/types";
import { dayIndex } from "@/lib/utils";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function QuoteOfDay({ editing }: { editing: boolean }) {
  const { data, mutate } = useSWR<{ quotes: Quote[] }>("/api/quotes", fetcher);
  const [newQuote, setNewQuote] = useState("");
  const [newAuthor, setNewAuthor] = useState("");

  const quotes = data?.quotes ?? [];
  const idx = dayIndex(quotes.length);
  const q = quotes[idx];

  async function addQuote() {
    if (!newQuote.trim()) return;
    await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote: newQuote.trim(), author: newAuthor.trim() }),
    });
    setNewQuote("");
    setNewAuthor("");
    mutate();
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 border border-amber-200 px-5 py-3 shadow-sm flex items-center gap-4">
      <div className="text-xs uppercase tracking-wider text-amber-800/70 shrink-0">Quote of the day</div>
      {q ? (
        <div className="flex items-baseline gap-3 min-w-0">
          <blockquote className="text-base font-serif italic text-stone-800 leading-snug truncate">
            &ldquo;{q.quote}&rdquo;
          </blockquote>
          {q.author && <div className="text-stone-600 text-sm shrink-0">— {q.author}</div>}
        </div>
      ) : (
        <div className="text-stone-500">Loading…</div>
      )}

      {editing && (
        <div className="mt-6 pt-4 border-t border-amber-200 space-y-2">
          <div className="text-sm font-medium text-stone-700">Add a new quote</div>
          <input
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
            placeholder="Quote text"
            value={newQuote}
            onChange={(e) => setNewQuote(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
              placeholder="Author (optional)"
              value={newAuthor}
              onChange={(e) => setNewAuthor(e.target.value)}
            />
            <button
              onClick={addQuote}
              className="rounded-md bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-medium"
            >
              Add
            </button>
          </div>
          <div className="text-xs text-stone-500">
            {quotes.length} total · showing #{idx + 1} today
          </div>
        </div>
      )}
    </div>
  );
}
