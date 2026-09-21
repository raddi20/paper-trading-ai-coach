"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { COACH_STARTER_PROMPTS, DISCLAIMER, WATCHLIST } from "@/lib/constants";
import { compactTime } from "@/lib/format";
import type { CoachChatMessage, CoachLead } from "@/lib/types";

type ChatPayload = {
  messages: CoachChatMessage[];
  llmEnabled: boolean;
  starters?: string[];
  disclaimer?: string;
};

export function CoachChat() {
  const search = useSearchParams();
  const urlSymbol = search.get("symbol")?.toUpperCase() || "";
  const [focusOverride, setFocusOverride] = useState<string | null>(null);
  const focusSymbol = focusOverride ?? urlSymbol;
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [starters, setStarters] = useState<string[]>(COACH_STARTER_PROMPTS);
  const [disclaimer, setDisclaimer] = useState(DISCLAIMER);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/chat", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as ChatPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Could not load chat");
        setMessages(data.messages ?? []);
        setLlmEnabled(Boolean(data.llmEnabled));
        if (data.starters?.length) setStarters(data.starters);
        if (data.disclaimer) setDisclaimer(data.disclaimer);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load chat");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const empty = messages.length === 0;

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          focusSymbol: focusSymbol || null,
        }),
      });
      const data = (await res.json()) as {
        user?: CoachChatMessage;
        assistant?: CoachChatMessage;
        llmEnabled?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "The coach could not answer.");
      setMessages((prev) => {
        const next = [...prev];
        if (data.user) next.push(data.user);
        if (data.assistant) next.push(data.assistant);
        return next;
      });
      if (typeof data.llmEnabled === "boolean") setLlmEnabled(data.llmEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The coach could not answer.");
      setDraft(message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function clearChat() {
    if (!messages.length) return;
    const ok = window.confirm("Clear this coach conversation? Your paper account is unchanged.");
    if (!ok) return;
    const res = await fetch("/api/coach/chat", { method: "DELETE" });
    const data = (await res.json()) as ChatPayload & { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not clear chat");
      return;
    }
    setMessages(data.messages ?? []);
    setError(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  }

  const focusLabel = useMemo(() => {
    const item = WATCHLIST.find((w) => w.symbol === focusSymbol);
    return item ? `${item.symbol} · ${item.name}` : "None";
  }, [focusSymbol]);

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col gap-4 md:min-h-[calc(100vh-8rem)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Ask the Coach</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Paper classroom chat</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-mute">
            Ask about your simulated portfolio, a chart, or a word like RSI. Answers use your paper
            state. This is not financial advice.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-mute">
            Chart in focus
            <select
              className="ml-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground"
              value={focusSymbol}
              onChange={(e) => setFocusOverride(e.target.value)}
              aria-label="Chart in focus"
            >
              <option value="">None</option>
              {WATCHLIST.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void clearChat()}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-mute"
          >
            New conversation
          </button>
        </div>
      </div>

      <div
        className={`rounded-full border px-3 py-1.5 text-xs ${
          llmEnabled
            ? "border-mint/30 bg-mint-dim/40 text-mint"
            : "border-border bg-card text-mute"
        }`}
      >
        {llmEnabled
          ? "Live LLM wording is on. Trade rules stay the same, and answers still use your paper snapshot."
          : "Rule-based coach (no API key). Add OPENAI_API_KEY in .env.local for richer chat — see Settings."}
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <p className="text-sm text-mute">Loading conversation…</p>
          ) : empty ? (
            <EmptyState
              disclaimer={disclaimer}
              focusLabel={focusLabel}
              starters={starters}
              onPick={(prompt) => void send(prompt)}
              disabled={sending}
            />
          ) : (
            messages.map((msg) => <Bubble key={msg.id} message={msg} />)
          )}
          {sending ? <Typing /> : null}
        </div>

        {!empty ? (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            {starters.slice(0, 4).map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => void send(prompt)}
                className="rounded-full border border-border px-3 py-1 text-xs text-mute hover:border-mint/40 hover:text-mint disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="border-t border-border p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          {error ? <p className="mb-2 text-sm text-rose">{error}</p> : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your paper account…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm leading-6"
              aria-label="Message the coach"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="rounded-full bg-mint px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-mute">
            Enter to send · Shift+Enter for a new line. {disclaimer}
          </p>
        </form>
      </section>
    </div>
  );
}

function EmptyState({
  disclaimer,
  focusLabel,
  starters,
  onPick,
  disabled,
}: {
  disclaimer: string;
  focusLabel: string;
  starters: string[];
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto max-w-lg py-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mint-dim text-lg text-mint">
        ?
      </div>
      <h2 className="mt-4 text-lg font-semibold">Ask anything about this classroom</h2>
      <p className="mt-2 text-sm leading-6 text-mute">{disclaimer}</p>
      <p className="mt-2 text-xs text-mute">Chart in focus: {focusLabel}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {starters.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="rounded-full border border-mint/30 bg-mint-dim/50 px-3 py-1.5 text-xs text-mint hover:border-mint disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: CoachChatMessage }) {
  const mine = message.role === "user";
  return (
    <article className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[80%] ${
          mine ? "bg-mint-dim text-foreground" : "border border-border bg-card-2"
        }`}
      >
        {!mine ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-mint">
            Coach
            {message.source ? ` · ${message.source === "llm" ? "LLM" : "rule-based"}` : ""}
          </p>
        ) : null}
        <div className="space-y-2 text-sm leading-6">
          {message.content.split("\n\n").map((para, index) => (
            <p key={`${message.id}-${index}`}>{para}</p>
          ))}
        </div>
        {!mine && message.leads.length > 0 ? <Leads leads={message.leads} /> : null}
        <p className="mt-2 text-[10px] text-mute">{compactTime(message.createdAt)}</p>
      </div>
    </article>
  );
}

function Leads({ leads }: { leads: CoachLead[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {leads.map((lead) => (
        <Link
          key={`${lead.label}-${lead.href}`}
          href={lead.href}
          className="rounded-full bg-mint px-3 py-1.5 text-xs font-semibold text-background"
        >
          {lead.label}
        </Link>
      ))}
    </div>
  );
}

function Typing() {
  return (
    <div className="flex justify-start" aria-live="polite">
      <div className="rounded-2xl border border-border bg-card-2 px-4 py-3 text-sm text-mute">
        Coach is thinking
        <span className="ml-1 inline-flex gap-0.5">
          <span className="animate-pulse">.</span>
          <span className="animate-pulse [animation-delay:150ms]">.</span>
          <span className="animate-pulse [animation-delay:300ms]">.</span>
        </span>
      </div>
    </div>
  );
}
