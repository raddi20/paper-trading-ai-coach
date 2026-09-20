"use client";

import Link from "next/link";
import { useState } from "react";
import { CoachPanel } from "./CoachPanel";
import { EquityChart } from "./EquityChart";
import { StrategyRules } from "./StrategyRules";
import { postJson, useAppState } from "./useAppState";
import type { AppState, PendingSignal, Position } from "@/lib/types";
import { pct, pnlClass, qtyLabel, signedUsd, usd } from "@/lib/format";
import { WATCH_BY_SYMBOL } from "@/lib/constants";

export function DashboardView() {
  const { state, error, loading, setState, refresh } = useAppState();
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setMessage(null);
    try {
      const data = await postJson<{ state: AppState; created: number; autoFills: number }>(
        "/api/scan",
      );
      setState(data.state);
      setMessage(
        `Scan complete. ${data.created} new signal${data.created === 1 ? "" : "s"}, ${data.autoFills} auto paper fill${data.autoFills === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function act(id: number, action: "accept" | "dismiss") {
    setBusyId(id);
    setMessage(null);
    try {
      const data = await postJson<{ state: AppState }>("/api/signals", { id, action });
      setState(data.state);
      setMessage(action === "accept" ? "Paper fill booked." : "Signal skipped.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update signal");
    } finally {
      setBusyId(null);
    }
  }

  async function sell(symbol: string) {
    setMessage(null);
    try {
      const data = await postJson<{ state: AppState }>("/api/positions/sell", { symbol });
      setState(data.state);
      setMessage(`Sold ${symbol} in the paper account.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sell failed");
    }
  }

  async function toggleMode() {
    if (!state) return;
    const next = state.settings.tradingMode === "manual" ? "auto" : "manual";
    if (next === "auto") {
      const ok = window.confirm(
        "Turn on Auto paper? The strategy will place simulated fills without asking. Still not real money.",
      );
      if (!ok) return;
    }
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingMode: next }),
    });
    const data = await res.json();
    setState(data as AppState);
  }

  if (loading) return <p className="text-sm text-mute">Loading paper account…</p>;
  if (error || !state) {
    return (
      <div className="text-sm text-rose">
        {error || "Could not load."}{" "}
        <button className="underline" type="button" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paper dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-mute">
            A virtual $100,000 classroom. Every number on this page is simulated.
            Quotes may come from public market data or bundled demo bars if a feed is quiet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleMode()}
          className="self-start rounded-full border border-border px-4 py-2 text-sm"
        >
          Mode:{" "}
          <span className="font-semibold text-mint">
            {state.settings.tradingMode === "auto" ? "Auto paper" : "Manual"}
          </span>
        </button>
      </div>

      <CoachPanel state={state} onScan={() => void scan()} scanning={scanning} />
      {message ? <p className="text-sm text-blue">{message}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Paper portfolio" value={usd(state.equity)} hint="Cash + positions" />
        <Kpi label="Cash" value={usd(state.cash)} hint="Uninvested virtual dollars" />
        <Kpi
          label="Day P&L"
          value={signedUsd(state.dayPnl)}
          hint={pct(state.dayPnlPct)}
          tone={state.dayPnl}
        />
        <Kpi
          label="All-time P&L"
          value={signedUsd(state.allTimePnl)}
          hint={`Win rate ${state.winRate == null ? "—" : pct(state.winRate, 0)} on ${state.closedTrades} closed`}
          tone={state.allTimePnl}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Portfolio value over time</h2>
          <p className="text-xs text-mute">
            {state.dataHealth.demoQuotes
              ? `${state.dataHealth.demoQuotes} tickers on demo data`
              : "Live/cached public quotes"}
          </p>
        </div>
        <EquityChart history={state.equityHistory} />
      </section>

      {state.pendingSignals.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Signals waiting for you</h2>
          {state.pendingSignals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              busy={busyId === signal.id}
              onAccept={() => void act(signal.id, "accept")}
              onSkip={() => void act(signal.id, "dismiss")}
            />
          ))}
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-mute">
          No pending signals. Tap Scan markets, or open{" "}
          <Link className="text-mint underline" href="/markets">
            Markets
          </Link>{" "}
          to browse charts.
        </p>
      )}

      <PositionsTable positions={state.positions} onSell={sell} />

      <div className="grid gap-6 lg:grid-cols-2">
        <StrategyRules compact />
        <RecentJournal state={state} />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-mute">{label}</p>
      <p className={`mt-2 text-xl font-semibold tabular ${tone != null ? pnlClass(tone) : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-mute">{hint}</p>
    </div>
  );
}

function SignalCard({
  signal,
  busy,
  onAccept,
  onSkip,
}: {
  signal: PendingSignal;
  busy: boolean;
  onAccept: () => void;
  onSkip: () => void;
}) {
  const item = WATCH_BY_SYMBOL[signal.symbol];
  const verb = signal.action === "buy" ? "Place paper buy" : "Place paper sell";
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-mint-dim px-2 py-0.5 text-xs font-semibold uppercase text-mint">
          {signal.action}
        </span>
        <h3 className="text-lg font-semibold">
          {signal.symbol}
          <span className="ml-2 text-sm font-normal text-mute">{item?.name}</span>
        </h3>
        {signal.demo ? (
          <span className="rounded-full border border-amber/40 px-2 py-0.5 text-[11px] text-amber">
            Worked example
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-7 text-mute">{signal.coachNote}</p>
      <p className="mt-2 text-sm tabular">
        About {qtyLabel(signal.qty, item?.assetClass ?? "equity")} @ {usd(signal.price)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="rounded-full bg-mint px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
        >
          {busy ? "Working…" : verb}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="rounded-full border border-border px-4 py-2 text-sm"
        >
          Skip
        </button>
        <Link href={`/markets?symbol=${signal.symbol}`} className="rounded-full px-4 py-2 text-sm text-blue">
          View chart
        </Link>
      </div>
    </article>
  );
}

function PositionsTable({
  positions,
  onSell,
}: {
  positions: Position[];
  onSell: (symbol: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">Open paper positions</h2>
      {positions.length === 0 ? (
        <p className="mt-3 text-sm text-mute">
          None yet. Confirm a buy signal to see a position here.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-mute">
              <tr>
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Avg</th>
                <th className="pb-2 font-medium">Last</th>
                <th className="pb-2 font-medium">P&L</th>
                <th className="pb-2 font-medium">Stop / target</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.id} className="border-t border-border">
                  <td className="py-3 font-medium">{pos.symbol}</td>
                  <td className="tabular">{qtyLabel(pos.qty, pos.assetClass)}</td>
                  <td className="tabular">{usd(pos.avgPrice)}</td>
                  <td className="tabular">{usd(pos.lastPrice ?? pos.avgPrice)}</td>
                  <td className={`tabular ${pnlClass(pos.unrealizedPnl ?? 0)}`}>
                    {signedUsd(pos.unrealizedPnl ?? 0)} ({pct(pos.unrealizedPnlPct ?? 0)})
                  </td>
                  <td className="text-mute tabular">
                    {usd(pos.stopPrice)} / {usd(pos.takeProfitPrice)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-xs text-rose"
                      onClick={() => onSell(pos.symbol)}
                    >
                      Sell paper
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RecentJournal({ state }: { state: AppState }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Latest journal notes</h2>
        <Link href="/journal" className="text-sm text-blue">
          See all
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {state.recentJournal.slice(0, 6).map((entry) => (
          <li key={entry.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
            <p className="text-xs uppercase tracking-wide text-mute">
              {entry.type}
              {entry.symbol ? ` · ${entry.symbol}` : ""}
            </p>
            <p className="text-sm font-medium">{entry.title}</p>
            <p className="text-sm leading-6 text-mute">{entry.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
