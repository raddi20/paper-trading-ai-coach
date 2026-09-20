import type { Bar } from "./types";
import { WATCHLIST } from "./constants";

const BASE_PRICES: Record<string, number> = {
  AAPL: 228,
  MSFT: 418,
  GOOGL: 172,
  AMZN: 186,
  NVDA: 138,
  META: 548,
  TSLA: 246,
  SPY: 562,
  QQQ: 486,
  JPM: 218,
  V: 292,
  UNH: 536,
  XOM: 114,
  AVGO: 178,
  NFLX: 742,
  BTC: 96400,
  ETH: 3420,
  SOL: 178,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSymbol(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i += 1) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Deterministic bundled daily bars so charts and the strategy demo work
 * when Yahoo/CoinGecko are rate-limited or markets are closed.
 */
export function generateDemoBars(
  symbol: string,
  days = 180,
  options?: { forceBuySetup?: boolean },
): Bar[] {
  const item = WATCHLIST.find((w) => w.symbol === symbol);
  const crypto = item?.assetClass === "crypto";
  const rand = mulberry32(hashSymbol(symbol) ^ 0x9e3779b9);
  const startPrice = BASE_PRICES[symbol] ?? 100;
  const bars: Bar[] = [];

  let cursor = addDays(new Date(), -(crypto ? days + 4 : Math.round(days * 1.45)));
  let price = startPrice * (0.82 + rand() * 0.08);

  while (bars.length < days) {
    if (!crypto && isWeekend(cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    const drift = 0.00035;
    const shock = (rand() - 0.48) * 0.018;
    const ret = drift + shock;
    const open = price;
    const close = Math.max(0.5, open * (1 + ret));
    const wick = Math.abs(ret) + 0.004 + rand() * 0.006;
    const high = Math.max(open, close) * (1 + wick * 0.6);
    const low = Math.min(open, close) * (1 - wick * 0.6);
    const volume = Math.round(1_000_000 + rand() * 20_000_000);
    bars.push({
      time: isoDay(cursor),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    });
    price = close;
    cursor = addDays(cursor, 1);
  }

  if (options?.forceBuySetup ?? shouldForceBuy(symbol)) {
    return forceBuySetup(bars, rand);
  }
  return bars;
}

function shouldForceBuy(symbol: string): boolean {
  return symbol === "AAPL" || symbol === "SPY" || symbol === "BTC";
}

/** Uptrend then a mild pullback so close > SMA50 and RSI sits in 40–65. */
export function forceBuySetup(bars: Bar[], rand: () => number = Math.random): Bar[] {
  if (bars.length < 60) return bars;
  const clone = bars.map((bar) => ({ ...bar }));
  const start = clone.length - 70;
  let price = clone[start].close;

  for (let i = start; i < clone.length; i += 1) {
    const intoPullback = i >= clone.length - 9;
    const ret = intoPullback
      ? -0.0022 - rand() * 0.0015
      : 0.0048 + rand() * 0.0025;
    const open = price;
    const close = Math.max(0.5, open * (1 + ret));
    const high = Math.max(open, close) * (1.002 + rand() * 0.004);
    const low = Math.min(open, close) * (0.997 - rand() * 0.003);
    clone[i] = {
      ...clone[i],
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
    };
    price = close;
  }
  return clone;
}

function round(n: number): number {
  if (n >= 1000) return Math.round(n * 100) / 100;
  if (n >= 1) return Math.round(n * 100) / 100;
  return Math.round(n * 10000) / 10000;
}

export function demoQuoteFromBars(symbol: string, bars: Bar[]) {
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] ?? last;
  const change = last.close - prev.close;
  return {
    symbol,
    price: last.close,
    previousClose: prev.close,
    change,
    changePct: prev.close ? change / prev.close : 0,
    asOf: `${last.time}T20:00:00.000Z`,
    source: "demo" as const,
  };
}
