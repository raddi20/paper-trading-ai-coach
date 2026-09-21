import assert from "node:assert/strict";
import test from "node:test";
import { answerOffline, classifyIntent, isUnsafePrompt } from "../lib/coach-offline";
import { isSafeHref, sanitizeLeads } from "../lib/coach-leads";
import type { CoachContext } from "../lib/types";

function ctx(patch: Partial<CoachContext> = {}): CoachContext {
  return {
    cash: 100_000,
    equity: 100_000,
    positionsValue: 0,
    startingCash: 100_000,
    dayPnl: 0,
    dayPnlPct: 0,
    allTimePnl: 0,
    tradingMode: "manual",
    maxPositionPct: 0.05,
    maxDailyLossPct: 0.02,
    maxOpenPositions: 8,
    stopLossPct: 0.05,
    takeProfitPct: 0.1,
    dailyLossHalt: false,
    lastScanAt: null,
    positions: [],
    pendingSignals: [],
    recentJournal: [],
    lastSkip: null,
    lastFill: null,
    focus: null,
    ...patch,
  };
}

test("classifies portfolio, rsi, skip, and confirm intents", () => {
  assert.equal(classifyIntent("What's in my portfolio?"), "portfolio");
  assert.equal(classifyIntent("What does RSI mean on this chart?"), "rsi");
  assert.equal(classifyIntent("Should I confirm this signal?"), "confirm_signal");
  assert.equal(classifyIntent("Explain my last journal skip."), "journal_skip");
  assert.equal(classifyIntent("What is a stop-loss?"), "stop_loss");
  assert.equal(classifyIntent("Why am I holding this?"), "holding");
});

test("refuses guaranteed-profit and real-money gambling prompts", () => {
  assert.equal(isUnsafePrompt("How do I get guaranteed profits?"), true);
  assert.equal(isUnsafePrompt("Should I put real money into this?"), true);
  assert.equal(classifyIntent("guaranteed profit please"), "safety_refuse");
  const { reply } = answerOffline("How do I get guaranteed profits?", ctx());
  assert.match(reply, /cannot help/i);
  assert.doesNotMatch(reply, /sure thing/i);
});

test("portfolio answer uses live cash and does not invent holdings", () => {
  const empty = answerOffline("What's in my portfolio?", ctx());
  assert.match(empty.reply, /\$100,000/);
  assert.match(empty.reply, /no open positions/i);

  const held = answerOffline(
    "What's in my portfolio?",
    ctx({
      cash: 95_000,
      equity: 98_500,
      positionsValue: 3_500,
      positions: [
        {
          symbol: "AAPL",
          name: "Apple",
          assetClass: "equity",
          qty: 20,
          avgPrice: 185,
          lastPrice: 190,
          stopPrice: 175.75,
          takeProfitPrice: 203.5,
          openedAt: "2026-01-01T00:00:00.000Z",
          unrealizedPnl: 100,
          unrealizedPnlPct: 0.027,
        },
      ],
    }),
  );
  assert.match(held.reply, /AAPL/);
  assert.match(held.reply, /\$95,000/);
  assert.doesNotMatch(held.reply, /\bMSFT\b/);
});

test("holding and skip answers stay honest when the book is empty", () => {
  const hold = answerOffline("Why am I holding this?", ctx());
  assert.match(hold.reply, /not holding/i);

  const skip = answerOffline("Explain my last journal skip.", ctx());
  assert.match(skip.reply, /do not see a skip/i);
});

test("journal skip and confirm signal use real events only", () => {
  const skip = answerOffline(
    "Explain my last journal skip.",
    ctx({
      lastSkip: {
        id: 1,
        type: "skip",
        symbol: "NVDA",
        title: "Skipped buy NVDA",
        body: "You dismissed the worked example.",
        meta: null,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    }),
  );
  assert.match(skip.reply, /NVDA/);
  assert.match(skip.reply, /dismissed the worked example/);

  const none = answerOffline("Should I confirm this signal?", ctx());
  assert.match(none.reply, /no pending signal/i);

  const pending = answerOffline(
    "Should I confirm this signal?",
    ctx({
      pendingSignals: [
        {
          id: 9,
          symbol: "MSFT",
          action: "buy",
          reason: "close above SMA50",
          coachNote: "MSFT is a practice buy above SMA 50 with RSI in range.",
          price: 400,
          qty: 12,
          status: "pending",
          demo: true,
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    }),
  );
  assert.match(pending.reply, /MSFT/);
  assert.match(pending.reply, /Dashboard/);
});

test("stop-loss teaching answer points back into settings", () => {
  const { reply, leads } = answerOffline("What is a stop-loss?", ctx());
  assert.match(reply, /stop-loss/i);
  assert.match(reply, /5%/);
  assert.ok(leads.some((lead) => lead.href === "/settings"));
});

test("internal lead hrefs are sanitized", () => {
  assert.equal(isSafeHref("/markets?symbol=AAPL"), true);
  assert.equal(isSafeHref("https://evil.example"), false);
  assert.equal(isSafeHref("//evil.example"), false);
  const leads = sanitizeLeads([
    { label: "Dashboard", href: "/" },
    { label: "Nope", href: "javascript:alert(1)" },
    { label: "Markets", href: "/markets?symbol=AAPL" },
  ]);
  assert.equal(leads.length, 2);
  assert.equal(leads[0].href, "/");
});
