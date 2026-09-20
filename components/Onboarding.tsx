"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    title: "This is fake money",
    body: "Paper Coach never talks to a real broker. The $100,000 you will see is a classroom balance. Nothing here can buy or sell actual stocks or crypto.",
  },
  {
    title: "A simple strategy, explained in English",
    body: "We follow one beginner trend-follow recipe: buy when price is above the 50-day average and RSI is between 40 and 65. We sell if the trend breaks, or at a stop (−5%) or target (+10%). The rules stay on screen so nothing is a black box.",
  },
  {
    title: "You stay in control (Manual is the default)",
    body: "The coach can suggest a paper trade. In Manual mode it waits for you. Auto paper can place simulated fills by itself — still not real money. Risk brakes cap each position, how many you hold, and how much you can lose in a day.",
  },
  {
    title: "Past charts ≠ future results",
    body: "A setup that “worked” on old data can fail tomorrow. This app is for learning vocabulary and process, not for picking winners. It is not financial advice. If you ever trade for real, that is a completely separate, regulated decision — not this website.",
  },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/state")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data && data.settings && !data.settings.onboardingComplete) {
          setOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", { method: "POST" });
      if (!res.ok) throw new Error("Could not open the paper account.");
      setOpen(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber">
          First-run walkthrough · {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">{current.title}</h2>
        <p className="mt-3 text-[15px] leading-7 text-mute">{current.body}</p>
        {error ? <p className="mt-3 text-sm text-rose">{error}</p> : null}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-sm text-mute disabled:opacity-30"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          {last ? (
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="rounded-full bg-mint px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
            >
              {busy ? "Funding paper account…" : "Fund my $100,000 paper account"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
