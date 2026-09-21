"use client";

import { useState } from "react";
import Link from "next/link";
import { FILL_MODEL_DOC } from "@/lib/constants";
import { StrategyRules } from "./StrategyRules";
import { postJson, useAppState } from "./useAppState";
import type { AppState } from "@/lib/types";

export function SettingsView() {
  const { state, loading, error, setState } = useAppState();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="text-sm text-mute">Loading settings…</p>;
  if (error || !state) return <p className="text-sm text-rose">{error}</p>;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setState(data as AppState);
      setMessage("Saved. New risk limits apply to the next scan and the next paper fill.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const ok = window.confirm("Reset the paper account to $100,000 cash and Manual mode?");
    if (!ok) return;
    const data = await postJson<AppState>("/api/reset");
    setState(data);
    setMessage("Paper account reset.");
  }

  const s = state.settings;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings & risk</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-mute">
          Hard-coded classroom defaults you can edit. None of this talks to a broker. There is
          nowhere to paste API keys for live trading — by design. Conversational coaching lives
          on the Coach tab; optional OpenAI wording is described below.
        </p>
      </div>
      {message ? <p className="text-sm text-blue">{message}</p> : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Trading mode</h2>
        <p className="mt-1 text-sm text-mute">
          Default is Manual: you confirm every signal. Auto paper lets the rule engine place
          simulated fills.
        </p>
        <div className="mt-4 flex gap-2">
          <ModeButton
            active={s.tradingMode === "manual"}
            disabled={busy}
            onClick={() => void save({ tradingMode: "manual" })}
          >
            Manual
          </ModeButton>
          <ModeButton
            active={s.tradingMode === "auto"}
            disabled={busy}
            onClick={() => {
              const ok = window.confirm(
                "Enable Auto paper? Simulated only — the strategy will fill without asking.",
              );
              if (ok) void save({ tradingMode: "auto" });
            }}
          >
            Auto paper
          </ModeButton>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Risk controls</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void save({
              maxPositionPct: Number(form.get("maxPositionPct")) / 100,
              maxDailyLossPct: Number(form.get("maxDailyLossPct")) / 100,
              maxOpenPositions: Number(form.get("maxOpenPositions")),
              stopLossPct: Number(form.get("stopLossPct")) / 100,
              takeProfitPct: Number(form.get("takeProfitPct")) / 100,
            });
          }}
        >
          <Field
            name="maxPositionPct"
            label="Max position size (% of portfolio)"
            defaultValue={s.maxPositionPct * 100}
            hint="Default 5%"
          />
          <Field
            name="maxDailyLossPct"
            label="Max daily loss (% of portfolio)"
            defaultValue={s.maxDailyLossPct * 100}
            hint="Hits this → halt new buys for the day"
          />
          <Field
            name="maxOpenPositions"
            label="Max open positions"
            defaultValue={s.maxOpenPositions}
            step="1"
            hint="Default 8"
          />
          <Field
            name="stopLossPct"
            label="Stop-loss per position (%)"
            defaultValue={s.stopLossPct * 100}
            hint="Default 5%"
          />
          <Field
            name="takeProfitPct"
            label="Take-profit per position (%)"
            defaultValue={s.takeProfitPct * 100}
            hint="Default 10%"
          />
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              Save risk limits
            </button>
          </div>
        </form>
      </section>

      <StrategyRules />

      <section className="rounded-2xl border border-border bg-card p-5 text-sm leading-6 text-mute">
        <h2 className="font-semibold text-foreground">Ask the Coach & optional LLM</h2>
        <p className="mt-2">
          Open{" "}
          <Link href="/coach" className="text-mint underline">
            Ask the Coach
          </Link>{" "}
          in the nav to type questions. Without a
          key, answers still use your paper cash, positions, journal, and the published strategy
          rules. They never invent fills you do not have.
        </p>
        <p className="mt-2">
          For richer conversational wording, copy <code className="text-mint">.env.example</code> to{" "}
          <code className="text-mint">.env.local</code> and set{" "}
          <code className="text-mint">OPENAI_API_KEY</code>. Optional{" "}
          <code className="text-mint">OPENAI_MODEL</code> defaults to <code>gpt-4o-mini</code>. Restart{" "}
          <code>npm run dev</code> after changing env. Chat times out after ~12s and falls back to
          templates. Dashboard blurbs still time out after ~2.5s. Trade decisions stay 100%
          rule-based.
        </p>
        <p className="mt-2">
          Later, if you want a paid market-data key (Polygon, Alpha Vantage, etc.), add it only
          in the market-data module — never a brokerage key.
        </p>
      </section>

      <section className="rounded-2xl border border-rose/30 bg-card p-5">
        <h2 className="font-semibold">Reset classroom</h2>
        <p className="mt-1 text-sm text-mute">{FILL_MODEL_DOC.bullets[4]}</p>
        <button
          type="button"
          onClick={() => void reset()}
          className="mt-4 rounded-full border border-rose/40 px-4 py-2 text-sm text-rose"
        >
          Reset paper account to $100,000
        </button>
      </section>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  hint,
  step = "0.1",
}: {
  name: string;
  label: string;
  defaultValue: number;
  hint: string;
  step?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type="number"
        step={step}
        min="0"
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 tabular"
      />
      <span className="mt-1 block text-xs text-mute">{hint}</span>
    </label>
  );
}

function ModeButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm ${
        active ? "bg-mint text-background" : "border border-border"
      }`}
    >
      {children}
    </button>
  );
}
