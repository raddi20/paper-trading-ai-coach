import { LLM_TIMEOUT_MS, STRATEGY_RULES } from "./constants";
import { pct, usd } from "./format";
import type { PendingSignal, Position, Settings } from "./types";

export function templateCoach(input: {
  settings: Settings;
  equity: number;
  cash: number;
  dayPnlPct: number;
  dailyLossHalt: boolean;
  positions: Position[];
  pendingSignals: PendingSignal[];
  lastScanAt: string | null;
}): { headline: string; body: string } {
  const { settings, pendingSignals, positions, dailyLossHalt, dayPnlPct } = input;
  const buys = pendingSignals.filter((s) => s.action === "buy");
  const sells = pendingSignals.filter((s) => s.action === "sell");

  if (dailyLossHalt) {
    return {
      headline: "Daily risk brake is on",
      body: `The paper account is down ${pct(dayPnlPct)} today, which hits the ${pct(
        -settings.maxDailyLossPct,
      )} daily-loss cap. No new buys until tomorrow. Existing positions can still exit on a stop, target, or trend break. This is how we keep a bad day from becoming a disaster — even with fake money.`,
    };
  }

  if (settings.tradingMode === "manual" && buys.length) {
    const first = buys[0];
    return {
      headline: `A practice buy is waiting: ${first.symbol}`,
      body: `${first.coachNote} Because you are in Manual mode, nothing is filled until you tap “Place paper buy.” That is the safest way to learn: read the thesis, look at the chart, then decide.`,
    };
  }

  if (settings.tradingMode === "auto" && !positions.length && !pendingSignals.length) {
    return {
      headline: "Auto paper is watching the watchlist",
      body: `The beginner trend-follow rules will place simulated buys when price is above SMA 50 and RSI is between 40 and 65. Position size is capped at ${pct(
        settings.maxPositionPct,
        0,
      )} of the portfolio. No real broker is involved.`,
    };
  }

  if (positions.length) {
    const names = positions.map((p) => p.symbol).join(", ");
    return {
      headline: `Holding ${positions.length} paper position${positions.length === 1 ? "" : "s"}`,
      body: `Open: ${names}. Each one has a stop around −${pct(
        settings.stopLossPct,
        0,
      ).replace("+", "")} and a target around +${pct(
        settings.takeProfitPct,
        0,
      ).replace("+", "")}. We sell if price closes back under the 50-day average. ${
        sells.length ? "At least one exit signal is waiting for you." : "No exit signal right now."
      }`,
    };
  }

  return {
    headline: "Your $100,000 paper account is funded",
    body: `${STRATEGY_RULES.summary} Cash on hand: ${usd(
      input.cash,
    )}. Scan the markets to see if any ticker currently matches the buy rules. If live data is quiet, we still show a worked example so you can practice confirming a trade.`,
  };
}

export async function maybeLlmRewrite(
  template: { headline: string; body: string },
  context: Record<string, unknown>,
): Promise<{ headline: string; body: string; source: "template" | "llm" }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ...template, source: "template" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "You are a calm coach for a complete beginner using PAPER TRADING (fake money). Never give financial advice. Never tell them to use real money. 2-3 short sentences, grade-8 reading level. Return JSON {headline, body}.",
          },
          {
            role: "user",
            content: JSON.stringify({ template, context }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ...template, source: "template" };
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ...template, source: "template" };
    const parsed = extractJson(content);
    if (parsed?.headline && parsed?.body) {
      return { headline: parsed.headline, body: parsed.body, source: "llm" };
    }
    return { ...template, source: "template" };
  } catch {
    return { ...template, source: "template" };
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(text: string): { headline?: string; body?: string } | null {
  try {
    return JSON.parse(text) as { headline?: string; body?: string };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as { headline?: string; body?: string };
    } catch {
      return null;
    }
  }
}

export function explainBuy(args: {
  symbol: string;
  price: number;
  sma50: number;
  rsi: number;
  qty: number;
  stop: number;
  take: number;
  pctOfPortfolio: number;
  demo?: boolean;
}): { reason: string; coachNote: string } {
  const reason = `${args.symbol} close ${usd(args.price)} is above SMA50 ${usd(
    args.sma50,
  )} and RSI ${args.rsi.toFixed(1)} is inside 40–65.`;
  const demoPrefix = args.demo
    ? "This is a worked example (live prices did not currently match, or markets are closed). "
    : "";
  const coachNote = `${demoPrefix}Think of SMA 50 as a simple “is this still in an uptrend?” line. ${args.symbol} is above it, and RSI at ${args.rsi.toFixed(
    1,
  )} means the move is not wildly overheated. A paper buy of ${args.qty} uses about ${pct(
    args.pctOfPortfolio,
    1,
  )} of the virtual portfolio. Planned stop ${usd(args.stop)} (−5% area) and target ${usd(
    args.take,
  )} (+10% area).`;
  return { reason, coachNote };
}

