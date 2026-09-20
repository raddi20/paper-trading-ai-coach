import { BARS_CACHE_MS, WATCHLIST, WATCH_BY_SYMBOL } from "./constants";
import { demoQuoteFromBars, generateDemoBars } from "./demo-data";
import { getCachedBars, setCachedBars } from "./db";
import { computeFromCloses } from "./indicators";
import type { Bar, ChartPayload, Indicators, Quote } from "./types";

type SeriesResult = {
  bars: Bar[];
  source: "live" | "demo" | "cache";
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; PaperCoach/1.0; educational paper trading)",
  Accept: "application/json",
};

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseYahooChart(json: unknown): Bar[] {
  const root = json as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };
  const result = root.chart?.result?.[0];
  const ts = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!ts || !quote?.close) return [];
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    bars.push({
      time: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: volume ?? 0,
    });
  }
  return bars;
}

function parseCoinGecko(json: unknown): Bar[] {
  const root = json as { prices?: Array<[number, number]> };
  const prices = root.prices;
  if (!prices?.length) return [];
  const bars: Bar[] = [];
  for (let i = 0; i < prices.length; i += 1) {
    const [t, close] = prices[i];
    const prev = prices[i - 1]?.[1] ?? close;
    const open = prev;
    const high = Math.max(open, close) * 1.004;
    const low = Math.min(open, close) * 0.996;
    bars.push({
      time: new Date(t).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 0,
    });
  }
  return bars;
}

async function fetchLiveBars(symbol: string): Promise<Bar[] | null> {
  const item = WATCH_BY_SYMBOL[symbol];
  if (!item) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      item.yahoo,
    )}?interval=1d&range=6mo`;
    const json = await fetchJson(url);
    const bars = parseYahooChart(json);
    if (bars.length >= 50) return bars;
  } catch {
    // fall through
  }
  if (item.coingecko) {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${item.coingecko}/market_chart?vs_currency=usd&days=180&interval=daily`;
      const json = await fetchJson(url);
      const bars = parseCoinGecko(json);
      if (bars.length >= 50) return bars;
    } catch {
      // fall through
    }
  }
  return null;
}

export async function getBars(symbol: string, force = false): Promise<SeriesResult> {
  const cached = getCachedBars(symbol);
  if (!force && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age >= 0 && age < BARS_CACHE_MS) {
      return {
        bars: JSON.parse(cached.payload) as Bar[],
        source: cached.source === "live" ? "cache" : "demo",
      };
    }
  }

  const live = await fetchLiveBars(symbol);
  if (live && live.length >= 50) {
    setCachedBars(symbol, JSON.stringify(live), "live");
    return { bars: live, source: "live" };
  }

  if (cached) {
    return {
      bars: JSON.parse(cached.payload) as Bar[],
      source: cached.source === "live" ? "cache" : "demo",
    };
  }

  const demo = generateDemoBars(symbol, 180);
  setCachedBars(symbol, JSON.stringify(demo), "demo");
  return { bars: demo, source: "demo" };
}

export function indicatorsFromBars(bars: Bar[]): Indicators {
  return computeFromCloses(bars.map((bar) => bar.close));
}

export function quoteFromBars(
  symbol: string,
  bars: Bar[],
  source: Quote["source"],
): Quote {
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
    source,
  };
}

export async function getQuote(symbol: string): Promise<Quote> {
  const { bars, source } = await getBars(symbol);
  if (!bars.length) return demoQuoteFromBars(symbol, generateDemoBars(symbol));
  return quoteFromBars(symbol, bars, source);
}

export async function getAllQuotes(): Promise<Quote[]> {
  const results = await Promise.all(
    WATCHLIST.map(async (item) => {
      try {
        return await getQuote(item.symbol);
      } catch {
        const bars = generateDemoBars(item.symbol);
        return demoQuoteFromBars(item.symbol, bars);
      }
    }),
  );
  return results;
}

export async function getChart(symbol: string): Promise<ChartPayload | null> {
  const item = WATCH_BY_SYMBOL[symbol];
  if (!item) return null;
  const { bars, source } = await getBars(symbol);
  const indicators = indicatorsFromBars(bars);
  const quote = bars.length ? quoteFromBars(symbol, bars, source) : null;
  return {
    symbol,
    name: item.name,
    assetClass: item.assetClass,
    source,
    bars,
    indicators,
    quote,
    position: null,
    strategy: evaluateSetup(bars, indicators),
  };
}

export function evaluateSetup(bars: Bar[], indicators: Indicators) {
  const last = bars[bars.length - 1];
  const notes: string[] = [];
  let buy = false;
  let sell = false;
  if (!last) return { buy, sell, notes: ["Not enough price history yet."] };
  if (indicators.sma50 == null || indicators.rsi == null) {
    notes.push("Need at least 50 daily bars before the 50-day average is ready.");
    return { buy, sell, notes };
  }
  const above = last.close > indicators.sma50;
  const rsiOk = indicators.rsi >= 40 && indicators.rsi <= 65;
  if (above) notes.push("Price is above the 50-day average (uptrend filter is on).");
  else notes.push("Price is below the 50-day average, so this is not a buy setup.");
  if (rsiOk) notes.push(`RSI is ${indicators.rsi.toFixed(1)} — in the 40–65 “not too hot” zone.`);
  else if (indicators.rsi > 65)
    notes.push(`RSI is ${indicators.rsi.toFixed(1)} — a bit stretched. The strategy waits.`);
  else notes.push(`RSI is ${indicators.rsi.toFixed(1)} — too little momentum for a buy.`);
  buy = above && rsiOk;
  sell = last.close < indicators.sma50;
  return { buy, sell, notes };
}
