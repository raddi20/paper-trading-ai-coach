import { STRATEGY_RULES, WATCH_BY_SYMBOL } from "./constants";
import {
  closedSells,
  firstSnapshotToday,
  getAccount,
  getCachedBars,
  getKv,
  getPendingSignals,
  getPositions,
  getSettings,
  listJournal,
} from "./db";
import { evaluateSetup, indicatorsFromBars } from "./market-data";
import type { Bar, CoachContext, CoachFocusSnapshot, CoachPositionSnapshot } from "./types";

function dailyHalt(equity: number, dayPnl: number, maxDailyLossPct: number): boolean {
  if (equity <= 0) return true;
  return dayPnl <= -maxDailyLossPct * (equity - dayPnl);
}

function lastCloseFromCache(symbol: string): number | null {
  const cached = getCachedBars(symbol);
  if (!cached) return null;
  try {
    const bars = JSON.parse(cached.payload) as Bar[];
    const last = bars[bars.length - 1];
    return typeof last?.close === "number" ? last.close : null;
  } catch {
    return null;
  }
}

function focusSnapshot(symbol: string): CoachFocusSnapshot | null {
  const item = WATCH_BY_SYMBOL[symbol];
  if (!item) return null;
  const cached = getCachedBars(symbol);
  if (!cached) {
    return {
      symbol: item.symbol,
      name: item.name,
      lastClose: null,
      sma50: null,
      rsi: null,
      buySetup: null,
      sellSetup: null,
      notes: [
        "No cached chart for this ticker yet. Open Markets to load candles, then ask again.",
      ],
      cached: false,
    };
  }
  try {
    const bars = JSON.parse(cached.payload) as Bar[];
    const indicators = indicatorsFromBars(bars);
    const setup = evaluateSetup(bars, indicators);
    const last = bars[bars.length - 1];
    return {
      symbol: item.symbol,
      name: item.name,
      lastClose: last?.close ?? null,
      sma50: indicators.sma50,
      rsi: indicators.rsi,
      buySetup: setup.buy,
      sellSetup: setup.sell,
      notes: setup.notes,
      cached: true,
    };
  } catch {
    return {
      symbol: item.symbol,
      name: item.name,
      lastClose: null,
      sma50: null,
      rsi: null,
      buySetup: null,
      sellSetup: null,
      notes: ["Could not read the cached chart for this ticker."],
      cached: false,
    };
  }
}

export function buildCoachContext(focusSymbol?: string | null): CoachContext {
  const settings = getSettings();
  const account = getAccount();
  const rawPositions = getPositions();
  const positions: CoachPositionSnapshot[] = rawPositions.map((pos) => {
    const lastPrice = lastCloseFromCache(pos.symbol);
    const mark = lastPrice ?? pos.avgPrice;
    const unrealizedPnl = (mark - pos.avgPrice) * pos.qty;
    const unrealizedPnlPct = pos.avgPrice ? (mark - pos.avgPrice) / pos.avgPrice : 0;
    return {
      symbol: pos.symbol,
      name: WATCH_BY_SYMBOL[pos.symbol]?.name ?? pos.symbol,
      assetClass: pos.assetClass,
      qty: pos.qty,
      avgPrice: pos.avgPrice,
      lastPrice,
      stopPrice: pos.stopPrice,
      takeProfitPrice: pos.takeProfitPrice,
      openedAt: pos.openedAt,
      unrealizedPnl: lastPrice == null ? null : unrealizedPnl,
      unrealizedPnlPct: lastPrice == null ? null : unrealizedPnlPct,
    };
  });
  const positionsValue = positions.reduce(
    (sum, pos) => sum + pos.qty * (pos.lastPrice ?? pos.avgPrice),
    0,
  );
  const equity = account.cash + positionsValue;
  const first = firstSnapshotToday();
  const start = first?.equity ?? account.startingCash;
  const dayPnl = equity - start;
  const dayPnlPct = start ? dayPnl / start : 0;
  const journal = listJournal({ limit: 20 });
  const lastSkip = journal.find((entry) => entry.type === "skip") ?? null;
  const lastFill = journal.find((entry) => entry.type === "fill") ?? null;
  const wanted = focusSymbol?.trim().toUpperCase() || null;

  return {
    cash: account.cash,
    equity,
    positionsValue,
    startingCash: account.startingCash,
    dayPnl,
    dayPnlPct,
    allTimePnl: equity - account.startingCash,
    tradingMode: settings.tradingMode,
    maxPositionPct: settings.maxPositionPct,
    maxDailyLossPct: settings.maxDailyLossPct,
    maxOpenPositions: settings.maxOpenPositions,
    stopLossPct: settings.stopLossPct,
    takeProfitPct: settings.takeProfitPct,
    dailyLossHalt: dailyHalt(equity, dayPnl, settings.maxDailyLossPct),
    lastScanAt: getKv("last_scan_at"),
    positions,
    pendingSignals: getPendingSignals(),
    recentJournal: journal.map((entry) => ({
      type: entry.type,
      symbol: entry.symbol,
      title: entry.title,
      body: entry.body,
      createdAt: entry.createdAt,
    })),
    lastSkip,
    lastFill,
    focus: wanted ? focusSnapshot(wanted) : null,
  };
}

export function coachContextForPrompt(ctx: CoachContext) {
  return {
    paper: true,
    disclaimer: "Educational paper trading only. Not financial advice. Not real money.",
    strategy: STRATEGY_RULES,
    cash: ctx.cash,
    equity: ctx.equity,
    positionsValue: ctx.positionsValue,
    dayPnl: ctx.dayPnl,
    dayPnlPct: ctx.dayPnlPct,
    allTimePnl: ctx.allTimePnl,
    tradingMode: ctx.tradingMode,
    risk: {
      maxPositionPct: ctx.maxPositionPct,
      maxDailyLossPct: ctx.maxDailyLossPct,
      maxOpenPositions: ctx.maxOpenPositions,
      stopLossPct: ctx.stopLossPct,
      takeProfitPct: ctx.takeProfitPct,
      dailyLossHalt: ctx.dailyLossHalt,
    },
    lastScanAt: ctx.lastScanAt,
    positions: ctx.positions,
    pendingSignals: ctx.pendingSignals.map((signal) => ({
      id: signal.id,
      symbol: signal.symbol,
      action: signal.action,
      reason: signal.reason,
      coachNote: signal.coachNote,
      price: signal.price,
      qty: signal.qty,
      demo: signal.demo,
      createdAt: signal.createdAt,
    })),
    recentJournal: ctx.recentJournal,
    lastSkip: ctx.lastSkip
      ? {
          symbol: ctx.lastSkip.symbol,
          title: ctx.lastSkip.title,
          body: ctx.lastSkip.body,
          createdAt: ctx.lastSkip.createdAt,
        }
      : null,
    lastFill: ctx.lastFill
      ? {
          symbol: ctx.lastFill.symbol,
          title: ctx.lastFill.title,
          body: ctx.lastFill.body,
          createdAt: ctx.lastFill.createdAt,
        }
      : null,
    closedSellsCount: closedSells().length,
    focus: ctx.focus,
    rules: [
      "Never invent fills, positions, or journal events that are not in this snapshot.",
      "If a list is empty, say so plainly.",
      "Do not encourage real-money trading, gambling, or guaranteed profits.",
    ],
  };
}
