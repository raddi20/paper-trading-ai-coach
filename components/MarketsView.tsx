"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PriceChart } from "./PriceChart";
import { StrategyRules } from "./StrategyRules";
import { useAppState } from "./useAppState";
import type { ChartPayload } from "@/lib/types";
import { WATCHLIST } from "@/lib/constants";
import { pct, pnlClass, usd } from "@/lib/format";

export function MarketsView() {
  const search = useSearchParams();
  const initial = search.get("symbol")?.toUpperCase() || "AAPL";
  const [symbol, setSymbol] = useState(initial);
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state } = useAppState();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chart/${symbol}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Chart failed");
        setError(null);
        setChart(data as ChartPayload);
      })
      .catch((err) => {
        if (!cancelled) {
          setChart(null);
          setError(err instanceof Error ? err.message : "Chart failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const quotes = useMemo(() => {
    const map = new Map((state?.quotes ?? []).map((q) => [q.symbol, q]));
    return WATCHLIST.map((item) => ({
      ...item,
      quote: map.get(item.symbol),
    }));
  }, [state]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist & charts</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-mute">
          Fifteen liquid US names plus BTC, ETH, and SOL. Candles are daily. SMA 20 / SMA 50
          and RSI 14 are the only indicators the beginner strategy uses. Paper trading only.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-border bg-card">
          <ul className="max-h-[70vh] divide-y divide-border overflow-auto">
            {quotes.map((item) => {
              const q = item.quote;
              const active = item.symbol === symbol;
              return (
                <li key={item.symbol}>
                  <button
                    type="button"
                    onClick={() => setSymbol(item.symbol)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left ${
                      active ? "bg-mint-dim/60" : "hover:bg-card-2"
                    }`}
                  >
                    <span>
                      <span className="block font-medium">{item.symbol}</span>
                      <span className="block text-xs text-mute">
                        {item.name} · {item.assetClass}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block tabular text-sm">{q ? usd(q.price) : "—"}</span>
                      <span className={`block text-xs tabular ${pnlClass(q?.changePct ?? 0)}`}>
                        {q ? pct(q.changePct) : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          {error ? (
            <p className="text-sm text-rose">
              {error} Using whatever we can still show. The UI never needs a live quote to stay up.
            </p>
          ) : null}
          {chart ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {chart.symbol}{" "}
                    <span className="text-base font-normal text-mute">{chart.name}</span>
                  </h2>
                  <p className="text-sm text-mute">
                    Data: {chart.source}
                    {chart.quote ? ` · last ${usd(chart.quote.price)}` : ""}
                  </p>
                </div>
                <div className="flex gap-3 text-sm">
                  <Pill label="SMA 20" value={chart.indicators.sma20} />
                  <Pill label="SMA 50" value={chart.indicators.sma50} />
                  <Pill label="RSI 14" value={chart.indicators.rsi} digits={1} />
                </div>
              </div>
              <PriceChart
                bars={chart.bars}
                sma20={chart.indicators.sma20Series}
                sma50={chart.indicators.sma50Series}
                rsi={chart.indicators.rsiSeries}
              />
              <div className="rounded-xl border border-border bg-card-2 p-4 text-sm leading-6">
                <p className="font-medium">
                  {chart.strategy.buy
                    ? "This ticker currently matches the buy recipe."
                    : "This ticker is not a buy right now."}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-mute">
                  {chart.strategy.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                {chart.position ? (
                  <p className="mt-2 text-mint">
                    You already hold a paper position here (avg {usd(chart.position.avgPrice)}).
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-mute">Loading chart…</p>
          )}
        </section>
      </div>
      <StrategyRules compact />
    </div>
  );
}

function Pill({
  label,
  value,
  digits = 2,
}: {
  label: string;
  value: number | null;
  digits?: number;
}) {
  return (
    <div className="rounded-full border border-border px-3 py-1 tabular">
      <span className="mr-2 text-xs text-mute">{label}</span>
      {value == null ? "—" : value.toFixed(digits)}
    </div>
  );
}
