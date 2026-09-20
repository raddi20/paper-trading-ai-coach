"use client";

import { useEffect, useMemo, useState } from "react";
import { compactTime } from "@/lib/format";
import { WATCHLIST } from "@/lib/constants";
import type { JournalEntry, JournalType } from "@/lib/types";

const TYPES: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "signal", label: "Signals" },
  { id: "fill", label: "Fills" },
  { id: "skip", label: "Skips" },
  { id: "coach", label: "Coach" },
  { id: "risk", label: "Risk" },
  { id: "system", label: "System" },
];

export function JournalView() {
  const [type, setType] = useState("all");
  const [symbol, setSymbol] = useState("");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (symbol) params.set("symbol", symbol);
    return params.toString();
  }, [type, symbol]);

  useEffect(() => {
    fetch(`/api/journal?${query}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load journal");
        setEntries(data.entries as JournalEntry[]);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Journal failed"));
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trade journal</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-mute">
          Every signal, simulated fill, skip reason, and coach note lands here. Filter by type or
          ticker. This is the paper audit trail — still not a real brokerage blotter.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setType(item.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                type === item.id ? "bg-mint-dim text-mint" : "border border-border text-mute"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <select
          className="rounded-full border border-border bg-card px-3 py-2 text-sm"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        >
          <option value="">All tickers</option>
          {WATCHLIST.map((w) => (
            <option key={w.symbol} value={w.symbol}>
              {w.symbol}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-rose">{error}</p> : null}

      <ol className="space-y-3">
        {entries.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border p-6 text-sm text-mute">
            Nothing here yet. Finish onboarding and scan markets to populate the journal.
          </li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
                <TypeBadge type={entry.type} />
                {entry.symbol ? <span>{entry.symbol}</span> : null}
                <span>{compactTime(entry.createdAt)}</span>
              </div>
              <h2 className="mt-2 font-medium">{entry.title}</h2>
              <p className="mt-1 text-sm leading-6 text-mute">{entry.body}</p>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

function TypeBadge({ type }: { type: JournalType }) {
  const colors: Record<string, string> = {
    signal: "text-blue border-blue/30",
    fill: "text-mint border-mint/30",
    skip: "text-amber border-amber/30",
    coach: "text-foreground border-border",
    risk: "text-rose border-rose/30",
    system: "text-mute border-border",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${colors[type] ?? ""}`}>
      {type}
    </span>
  );
}
