import {
  FILL_MODEL_DOC,
  SLIPPAGE_BPS,
  STARTING_CASH,
  WATCHLIST,
  WATCH_BY_SYMBOL,
} from "./constants";
import {
  addJournal,
  addSnapshot,
  addTrade,
  closedSells,
  deletePosition,
  firstSnapshotToday,
  getAccount,
  getPendingSignals,
  getPosition,
  getPositions,
  getSettings,
  getSignal,
  getKv,
  hasPendingFor,
  insertSignal,
  listJournal,
  listSnapshots,
  setCash,
  setKv,
  setSignalStatus,
  updateSettings,
  upsertPosition,
} from "./db";
import { roundPrice, roundQty } from "./format";
import { evaluateSetup, getBars, getQuote, indicatorsFromBars, quoteFromBars } from "./market-data";
import { explainBuy, maybeLlmRewrite, templateCoach } from "./coach";
import type {
  AppState,
  AssetClass,
  Bar,
  Position,
  Quote,
  Side,
} from "./types";

export function marketFillPrice(side: Side, close: number, assetClass: AssetClass): number {
  const slip = close * (SLIPPAGE_BPS / 10_000);
  const raw = side === "buy" ? close + slip : close - slip;
  return roundPrice(raw, assetClass);
}

export function positionSize(args: {
  equity: number;
  cash: number;
  price: number;
  maxPositionPct: number;
  assetClass: AssetClass;
}): number {
  const cap = args.equity * args.maxPositionPct;
  const buyingPower = Math.min(cap, args.cash);
  if (args.price <= 0) return 0;
  const raw = buyingPower / args.price;
  const qty = roundQty(raw, args.assetClass);
  if (args.assetClass === "equity") return qty >= 1 ? qty : 0;
  return qty * args.price >= 10 ? qty : 0;
}

function markPositions(positions: Position[], quotes: Map<string, Quote>): Position[] {
  return positions.map((pos) => {
    const price = quotes.get(pos.symbol)?.price ?? pos.avgPrice;
    const marketValue = pos.qty * price;
    const unrealizedPnl = (price - pos.avgPrice) * pos.qty;
    const unrealizedPnlPct = pos.avgPrice ? (price - pos.avgPrice) / pos.avgPrice : 0;
    return { ...pos, lastPrice: price, marketValue, unrealizedPnl, unrealizedPnlPct };
  });
}

export function portfolioTotals(cash: number, positions: Position[]) {
  const positionsValue = positions.reduce((sum, p) => sum + (p.marketValue ?? p.qty * p.avgPrice), 0);
  const equity = cash + positionsValue;
  return { positionsValue, equity };
}

function sameBar(openedAt: string, bar: Bar): boolean {
  return openedAt.slice(0, 10) === bar.time;
}

function fillBuy(args: {
  symbol: string;
  qty: number;
  price: number;
  reason: string;
  coachNote?: string;
  demo?: boolean;
}) {
  const item = WATCH_BY_SYMBOL[args.symbol];
  if (!item) throw new Error("Unknown symbol");
  const settings = getSettings();
  const account = getAccount();
  const cost = args.qty * args.price;
  if (args.qty <= 0 || cost > account.cash + 1e-8) {
    addJournal({
      type: "skip",
      symbol: args.symbol,
      title: `Skipped buy ${args.symbol}`,
      body: "Not enough paper cash for this size.",
      meta: { cost, cash: account.cash },
    });
    return null;
  }
  const stop = roundPrice(args.price * (1 - settings.stopLossPct), item.assetClass);
  const take = roundPrice(args.price * (1 + settings.takeProfitPct), item.assetClass);
  const now = new Date().toISOString();
  upsertPosition({
    symbol: args.symbol,
    assetClass: item.assetClass,
    qty: args.qty,
    avgPrice: args.price,
    stopPrice: stop,
    takeProfitPrice: take,
    openedAt: now,
  });
  setCash(account.cash - cost);
  addTrade({
    symbol: args.symbol,
    side: "buy",
    qty: args.qty,
    price: args.price,
    pnl: null,
    reason: args.reason,
  });
  addJournal({
    type: "fill",
    symbol: args.symbol,
    title: `Paper BUY filled: ${args.symbol}`,
    body:
      args.coachNote ??
      `Bought ${args.qty} at ${args.price}. Stop ${stop}, take-profit ${take}. ${FILL_MODEL_DOC.bullets[0]}`,
    meta: {
      qty: args.qty,
      price: args.price,
      stop,
      take,
      demo: Boolean(args.demo),
      fillModel: "bar-close-plus-slippage",
    },
  });
  snapshotNow();
  return { stop, take };
}

function fillSell(args: {
  position: Position;
  price: number;
  reason: string;
}) {
  const proceeds = args.position.qty * args.price;
  const pnl = (args.price - args.position.avgPrice) * args.position.qty;
  const account = getAccount();
  setCash(account.cash + proceeds);
  deletePosition(args.position.symbol);
  addTrade({
    symbol: args.position.symbol,
    side: "sell",
    qty: args.position.qty,
    price: args.price,
    pnl,
    reason: args.reason,
  });
  addJournal({
    type: pnl >= 0 ? "fill" : "fill",
    symbol: args.position.symbol,
    title: `Paper SELL filled: ${args.position.symbol}`,
    body: `Sold ${args.position.qty} at ${args.price} (${args.reason}). Realized P&L ${pnl.toFixed(2)}.`,
    meta: { qty: args.position.qty, price: args.price, pnl, reason: args.reason },
  });
  snapshotNow();
}

function snapshotNow() {
  const quotesNeeded = getPositions();
  const cash = getAccount().cash;
  const positionsValue = quotesNeeded.reduce((sum, p) => sum + p.qty * p.avgPrice, 0);
  // Mark-to-market snapshot is refined in buildState with live quotes; store cash+book here then overwrite via snapshotMarked.
  addSnapshot({
    equity: cash + positionsValue,
    cash,
    positionsValue,
  });
}

export async function snapshotMarked(quotes: Quote[]) {
  const map = new Map(quotes.map((q) => [q.symbol, q]));
  const marked = markPositions(getPositions(), map);
  const cash = getAccount().cash;
  const { positionsValue, equity } = portfolioTotals(cash, marked);
  addSnapshot({ equity, cash, positionsValue });
}

function dailyHalt(equity: number, dayPnl: number, maxDailyLossPct: number): boolean {
  if (equity <= 0) return true;
  return dayPnl <= -maxDailyLossPct * (equity - dayPnl);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      ret[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return ret;
}

export async function runScan(options?: { ensureDemo?: boolean }): Promise<{
  created: number;
  autoFills: number;
  skips: number;
}> {
  const settings = getSettings();
  let created = 0;
  let autoFills = 0;
  let skips = 0;

  const quoteMap = new Map<string, Quote>();
  const barMap = new Map<string, { bars: Bar[]; source: Quote["source"] }>();

  const seriesList = await mapLimit(WATCHLIST, 4, async (item) => {
    try {
      const series = await getBars(item.symbol);
      return { item, series };
    } catch {
      return null;
    }
  });
  for (const row of seriesList) {
    if (!row) continue;
    barMap.set(row.item.symbol, { bars: row.series.bars, source: row.series.source });
    const q = quoteFromBars(row.item.symbol, row.series.bars, row.series.source);
    quoteMap.set(row.item.symbol, q);
  }

  const marked = markPositions(getPositions(), quoteMap);
  const cash = getAccount().cash;
  const { equity } = portfolioTotals(cash, marked);
  const day = dayPnlFromSnapshots(equity);
  const halt = dailyHalt(equity, day.dayPnl, settings.maxDailyLossPct);
  if (halt) {
    addJournal({
      type: "risk",
      title: "Daily loss halt",
      body: `New buys are paused. Day P&L is ${day.dayPnl.toFixed(2)}, past the ${
        settings.maxDailyLossPct * 100
      }% cap.`,
    });
  }

  for (const pos of getPositions()) {
    const series = barMap.get(pos.symbol);
    if (!series?.bars.length) continue;
    const bars = series.bars;
    const last = bars[bars.length - 1];
    if (sameBar(pos.openedAt, last)) continue;

    const indicators = indicatorsFromBars(bars);
    let exitPrice: number | null = null;
    let reason = "";

    if (last.low <= pos.stopPrice) {
      exitPrice = pos.stopPrice;
      reason = "stop-loss";
    } else if (last.high >= pos.takeProfitPrice) {
      exitPrice = pos.takeProfitPrice;
      reason = "take-profit";
    } else if (indicators.sma50 != null && last.close < indicators.sma50) {
      exitPrice = marketFillPrice("sell", last.close, pos.assetClass);
      reason = "sma50-cross-down";
    }

    if (exitPrice == null) continue;

    if (settings.tradingMode === "manual") {
      if (!hasPendingFor(pos.symbol, "sell")) {
        insertSignal({
          symbol: pos.symbol,
          action: "sell",
          reason,
          coachNote: sellCoach(pos, reason, exitPrice),
          price: exitPrice,
          qty: pos.qty,
        });
        created += 1;
        addJournal({
          type: "signal",
          symbol: pos.symbol,
          title: `Exit signal: sell ${pos.symbol}`,
          body: sellCoach(pos, reason, exitPrice),
          meta: { reason, price: exitPrice },
        });
      }
    } else {
      fillSell({ position: pos, price: exitPrice, reason });
      autoFills += 1;
    }
  }

    const buyCandidates: Array<{
      symbol: string;
      assetClass: (typeof WATCHLIST)[number]["assetClass"];
      price: number;
      qty: number;
      sma50: number;
      rsi: number;
      copy: { reason: string; coachNote: string };
    }> = [];

    for (const item of WATCHLIST) {
    if (getPosition(item.symbol)) continue;
    const series = barMap.get(item.symbol);
    if (!series?.bars.length) continue;
    const indicators = indicatorsFromBars(series.bars);
    const setup = evaluateSetup(series.bars, indicators);
    if (!setup.buy || indicators.sma50 == null || indicators.rsi == null) continue;

    const last = series.bars[series.bars.length - 1];
    const price = marketFillPrice("buy", last.close, item.assetClass);
    const liveEquity = portfolioTotals(getAccount().cash, markPositions(getPositions(), quoteMap)).equity;
    const qty = positionSize({
      equity: liveEquity,
      cash: getAccount().cash,
      price,
      maxPositionPct: settings.maxPositionPct,
      assetClass: item.assetClass,
    });

    if (halt) {
      skips += 1;
      addJournal({
        type: "skip",
        symbol: item.symbol,
        title: `Skipped ${item.symbol} buy`,
        body: explainSkipReason("Daily loss halt is active."),
        meta: { code: "daily_loss_halt" },
      });
      continue;
    }
    if (getPositions().length >= settings.maxOpenPositions) {
      skips += 1;
      addJournal({
        type: "skip",
        symbol: item.symbol,
        title: `Skipped ${item.symbol} buy`,
        body: explainSkipReason(`Already at the max of ${settings.maxOpenPositions} open positions.`),
        meta: { code: "max_positions" },
      });
      continue;
    }
    if (qty <= 0) {
      skips += 1;
      addJournal({
        type: "skip",
        symbol: item.symbol,
        title: `Skipped ${item.symbol} buy`,
        body: explainSkipReason("Position would be smaller than the minimum size."),
        meta: { code: "size_zero" },
      });
      continue;
    }

    const stop = roundPrice(price * (1 - settings.stopLossPct), item.assetClass);
    const take = roundPrice(price * (1 + settings.takeProfitPct), item.assetClass);
    const copy = explainBuy({
      symbol: item.symbol,
      price,
      sma50: indicators.sma50,
      rsi: indicators.rsi,
      qty,
      stop,
      take,
      pctOfPortfolio: (qty * price) / liveEquity,
    });
    buyCandidates.push({
      symbol: item.symbol,
      assetClass: item.assetClass,
      price,
      qty,
      sma50: indicators.sma50,
      rsi: indicators.rsi,
      copy,
    });
  }

  // Prefer RSI near the middle of 40–65 so beginners are not flooded with every match.
  buyCandidates.sort((a, b) => Math.abs(a.rsi - 52) - Math.abs(b.rsi - 52));
  const ranked = buyCandidates.slice(0, settings.tradingMode === "auto" ? 2 : 3);
  for (const extra of buyCandidates.slice(ranked.length)) {
    skips += 1;
    addJournal({
      type: "skip",
      symbol: extra.symbol,
      title: `Ranked below the top setups: ${extra.symbol}`,
      body: `${extra.symbol} also matched the buy rules (RSI ${extra.rsi.toFixed(1)}), but we only surface a few names at a time so the classroom stays readable.`,
      meta: { code: "ranked_out", rsi: extra.rsi },
    });
  }

  for (const candidate of ranked) {
    if (settings.tradingMode === "auto") {
      fillBuy({
        symbol: candidate.symbol,
        qty: candidate.qty,
        price: candidate.price,
        reason: candidate.copy.reason,
        coachNote: candidate.copy.coachNote,
      });
      autoFills += 1;
      addJournal({
        type: "signal",
        symbol: candidate.symbol,
        title: `Auto paper BUY ${candidate.symbol}`,
        body: candidate.copy.coachNote,
        meta: { mode: "auto", price: candidate.price, qty: candidate.qty },
      });
    } else if (!hasPendingFor(candidate.symbol, "buy")) {
      insertSignal({
        symbol: candidate.symbol,
        action: "buy",
        reason: candidate.copy.reason,
        coachNote: candidate.copy.coachNote,
        price: candidate.price,
        qty: candidate.qty,
      });
      created += 1;
      addJournal({
        type: "signal",
        symbol: candidate.symbol,
        title: `Buy signal: ${candidate.symbol}`,
        body: candidate.copy.coachNote,
        meta: { price: candidate.price, qty: candidate.qty, sma50: candidate.sma50, rsi: candidate.rsi },
      });
    }
  }

  if (options?.ensureDemo !== false) {
    const seeded = ensureDemoSignal(quoteMap, barMap);
    if (seeded) created += 1;
  }

  setKv("last_scan_at", new Date().toISOString());
  return { created, autoFills, skips };
}

function explainSkipReason(why: string) {
  return why;
}

function sellCoach(pos: Position, reason: string, price: number): string {
  if (reason === "stop-loss") {
    return `${pos.symbol} traded down to the stop (${price}). The strategy sells to cap the paper loss. Stops are not magic — they just decide in advance how much of this simulated position we are willing to lose.`;
  }
  if (reason === "take-profit") {
    return `${pos.symbol} reached the take-profit around ${price}. The plan was to bank a roughly +10% paper gain rather than get greedy.`;
  }
  return `${pos.symbol} closed back under the 50-day average, so the uptrend filter flipped off. The strategy exits at about ${price} rather than hoping it comes back.`;
}

function ensureDemoSignal(
  quoteMap: Map<string, Quote>,
  barMap: Map<string, { bars: Bar[]; source: Quote["source"] }>,
): boolean {
  if (getKv("demo_signal_seeded") === "1") return false;
  if (getPendingSignals().length > 0) {
    setKv("demo_signal_seeded", "1");
    return false;
  }
  if (getPositions().length > 0) {
    setKv("demo_signal_seeded", "1");
    return false;
  }

  const symbol = "AAPL";
  const item = WATCH_BY_SYMBOL[symbol];
  const series = barMap.get(symbol);
  const lastClose = series?.bars.at(-1)?.close ?? quoteMap.get(symbol)?.price ?? 228;
  const settings = getSettings();
  const price = marketFillPrice("buy", lastClose, item.assetClass);
  const equity = getAccount().cash;
  const qty = positionSize({
    equity,
    cash: equity,
    price,
    maxPositionPct: settings.maxPositionPct,
    assetClass: item.assetClass,
  });
  if (qty <= 0) return false;
  const indicators = series ? indicatorsFromBars(series.bars) : { sma50: price * 0.97, rsi: 52, sma20: price * 0.99, sma20Series: [], sma50Series: [], rsiSeries: [] };
  const copy = explainBuy({
    symbol,
    price,
    sma50: indicators.sma50 ?? price * 0.97,
    rsi: indicators.rsi ?? 52,
    qty,
    stop: roundPrice(price * (1 - settings.stopLossPct), item.assetClass),
    take: roundPrice(price * (1 + settings.takeProfitPct), item.assetClass),
    pctOfPortfolio: (qty * price) / equity,
    demo: true,
  });
  insertSignal({
    symbol,
    action: "buy",
    reason: copy.reason,
    coachNote: copy.coachNote,
    price,
    qty,
    demo: true,
  });
  addJournal({
    type: "signal",
    symbol,
    title: "Example buy signal (demo)",
    body: copy.coachNote,
    meta: { demo: true, price, qty },
  });
  addJournal({
    type: "coach",
    symbol,
    title: "How to use this example",
    body: "Open Markets, look at the AAPL chart, then come back and either Place paper buy or Skip. Manual mode never trades until you say so.",
  });
  setKv("demo_signal_seeded", "1");
  return true;
}

export async function acceptSignal(id: number): Promise<{ ok: boolean; error?: string }> {
  const signal = getSignal(id);
  if (!signal || signal.status !== "pending") return { ok: false, error: "Signal is no longer pending." };
  const settings = getSettings();

  if (signal.action === "buy") {
    const halt = await isDailyHalted();
    if (halt) return { ok: false, error: "Daily loss halt is active — no new buys today." };
    if (getPositions().length >= settings.maxOpenPositions) {
      setSignalStatus(id, "expired");
      return { ok: false, error: "Max open positions reached." };
    }
    if (getPosition(signal.symbol)) {
      setSignalStatus(id, "expired");
      return { ok: false, error: "You already hold this symbol." };
    }
    fillBuy({
      symbol: signal.symbol,
      qty: signal.qty,
      price: signal.price,
      reason: signal.reason,
      coachNote: signal.coachNote,
      demo: signal.demo,
    });
    setSignalStatus(id, "accepted");
    return { ok: true };
  }

  const pos = getPosition(signal.symbol);
  if (!pos) {
    setSignalStatus(id, "expired");
    return { ok: false, error: "Position already closed." };
  }
  fillSell({ position: pos, price: signal.price, reason: signal.reason });
  setSignalStatus(id, "accepted");
  return { ok: true };
}

export function dismissSignal(id: number): { ok: boolean; error?: string } {
  const signal = getSignal(id);
  if (!signal || signal.status !== "pending") return { ok: false, error: "Signal is no longer pending." };
  setSignalStatus(id, "dismissed");
  addJournal({
    type: "skip",
    symbol: signal.symbol,
    title: `You skipped ${signal.action} ${signal.symbol}`,
    body: "Manual mode: you declined this paper signal. That is a valid choice — learning includes passing.",
  });
  return { ok: true };
}

async function isDailyHalted(): Promise<boolean> {
  const quotes = await Promise.all(
    getPositions().map(async (p) => getQuote(p.symbol)),
  );
  const map = new Map(quotes.map((q) => [q.symbol, q]));
  const marked = markPositions(getPositions(), map);
  const { equity } = portfolioTotals(getAccount().cash, marked);
  const day = dayPnlFromSnapshots(equity);
  const settings = getSettings();
  return dailyHalt(equity, day.dayPnl, settings.maxDailyLossPct);
}

function dayPnlFromSnapshots(equity: number): { dayPnl: number; dayPnlPct: number } {
  const first = firstSnapshotToday();
  const start = first?.equity ?? STARTING_CASH;
  const dayPnl = equity - start;
  return { dayPnl, dayPnlPct: start ? dayPnl / start : 0 };
}

export async function buildState(): Promise<AppState> {
  const settings = getSettings();
  const account = getAccount();
  const quotesList = settings.onboardingComplete
    ? (
        await Promise.all(
          WATCHLIST.map(async (item) => {
            try {
              return await getQuote(item.symbol);
            } catch {
              return null;
            }
          }),
        )
      ).filter((q): q is Quote => q !== null)
    : [];
  const quoteMap = new Map(quotesList.map((q) => [q.symbol, q]));
  const positions = markPositions(getPositions(), quoteMap);
  const { positionsValue, equity } = portfolioTotals(account.cash, positions);
  const day = dayPnlFromSnapshots(equity);
  const sells = closedSells();
  const winningTrades = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const closedTrades = sells.length;
  const liveQuotes = quotesList.filter((q) => q.source === "live" || q.source === "cache").length;
  const demoQuotes = quotesList.filter((q) => q.source === "demo").length;
  const pendingSignals = getPendingSignals();
  const lastScanAt = getKv("last_scan_at");
  const halt = dailyHalt(equity, day.dayPnl, settings.maxDailyLossPct);
  const templated = templateCoach({
    settings,
    equity,
    cash: account.cash,
    dayPnlPct: day.dayPnlPct,
    dailyLossHalt: halt,
    positions,
    pendingSignals,
    lastScanAt,
  });
  const coach = await maybeLlmRewrite(templated, {
    equity,
    cash: account.cash,
    positions: positions.map((p) => p.symbol),
    pending: pendingSignals.map((s) => `${s.action} ${s.symbol}`),
    mode: settings.tradingMode,
  });

  return {
    paper: true,
    disclaimer: "Educational paper trading only. Not financial advice. Not real money.",
    settings,
    account,
    cash: account.cash,
    equity,
    positionsValue,
    dayPnl: day.dayPnl,
    dayPnlPct: day.dayPnlPct,
    allTimePnl: equity - account.startingCash,
    allTimePnlPct: (equity - account.startingCash) / account.startingCash,
    winRate: closedTrades ? winningTrades / closedTrades : null,
    closedTrades,
    winningTrades,
    dailyLossHalt: halt,
    positions,
    pendingSignals,
    quotes: quotesList,
    equityHistory: listSnapshots(),
    recentJournal: listJournal({ limit: 12 }),
    coach,
    dataHealth: {
      liveQuotes,
      demoQuotes,
      lastScanAt,
    },
  };
}

export async function completeOnboarding(): Promise<AppState> {
  updateSettings({ onboardingComplete: true, tradingMode: "manual" });
  addJournal({
    type: "system",
    title: "Paper account opened",
    body: "Starting virtual cash: $100,000. Manual mode is on — the strategy will suggest trades, you confirm them. No real broker, no real orders.",
  });
  addJournal({
    type: "coach",
    title: "The only strategy in v1",
    body: "Buy when price is above the 50-day average and RSI is between 40 and 65. Sell on a close back under SMA 50, or at the −5% stop / +10% target. Rules are public on every screen.",
  });
  await runScan({ ensureDemo: true });
  return buildState();
}

export async function sellPositionNow(symbol: string): Promise<{ ok: boolean; error?: string }> {
  const pos = getPosition(symbol);
  if (!pos) return { ok: false, error: "No position to sell." };
  const quote = await getQuote(symbol);
  const price = marketFillPrice("sell", quote.price, pos.assetClass);
  fillSell({ position: pos, price, reason: "manual-sell" });
  addJournal({
    type: "fill",
    symbol,
    title: `You sold ${symbol} (paper)`,
    body: `Manual exit at about ${price}. This was your decision, not an automatic stop or target.`,
  });
  return { ok: true };
}
