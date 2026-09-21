"use client";

import Link from "next/link";
import type { AppState } from "@/lib/types";
import { pct } from "@/lib/format";

export function CoachPanel({
  state,
  onScan,
  scanning,
}: {
  state: AppState;
  onScan?: () => void;
  scanning?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-mint/25 bg-gradient-to-br from-mint-dim/80 to-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">
            AI coach · {state.coach.source === "llm" ? "optional LLM wording" : "rule-based copy"}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{state.coach.headline}</h2>
        </div>
        {onScan ? (
          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className="shrink-0 rounded-full border border-mint/40 px-3 py-1.5 text-xs font-medium text-mint disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Scan markets"}
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-7 text-foreground/90">{state.coach.body}</p>
      <div className="mt-4">
        <Link
          href="/coach"
          className="inline-flex rounded-full bg-mint px-4 py-2 text-sm font-semibold text-background"
        >
          Ask the Coach
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-mute sm:grid-cols-4">
        <Stat label="Mode" value={state.settings.tradingMode === "auto" ? "Auto paper" : "Manual"} />
        <Stat
          label="Open slots"
          value={`${state.positions.length} / ${state.settings.maxOpenPositions}`}
        />
        <Stat label="Max size / trade" value={pct(state.settings.maxPositionPct, 0)} />
        <Stat
          label="Day brake"
          value={state.dailyLossHalt ? "HALTED" : `${pct(state.settings.maxDailyLossPct, 0)} cap`}
        />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/40 px-3 py-2">
      <dt>{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
