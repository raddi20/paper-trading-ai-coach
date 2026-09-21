import type { WatchItem } from "./types";

export const PAPER_LABEL = "PAPER TRADING — not real money";

export const DISCLAIMER =
  "Educational paper trading only. Simulated money, never a real broker. Not financial advice. Past results do not predict future results.";

export const STARTING_CASH = 100_000;

export const DEFAULT_SETTINGS = {
  tradingMode: "manual" as const,
  maxPositionPct: 0.05,
  maxDailyLossPct: 0.02,
  maxOpenPositions: 8,
  stopLossPct: 0.05,
  takeProfitPct: 0.1,
};

/** 5 basis points of slippage on market fills at bar close. */
export const SLIPPAGE_BPS = 5;

export const RSI_PERIOD = 14;
export const SMA_FAST = 20;
export const SMA_SLOW = 50;
export const RSI_BUY_MIN = 40;
export const RSI_BUY_MAX = 65;

export const BARS_CACHE_MS = 30 * 60 * 1000;
export const QUOTE_CACHE_MS = 60 * 1000;
export const LLM_TIMEOUT_MS = 2500;
/** Chat can wait a bit longer than dashboard copy; always falls back. */
export const CHAT_LLM_TIMEOUT_MS = 12_000;
export const CHAT_MAX_MESSAGE_CHARS = 2_000;
export const CHAT_HISTORY_LIMIT = 80;

export const COACH_STARTER_PROMPTS = [
  "What's in my portfolio?",
  "Why am I holding this?",
  "What does RSI mean on this chart?",
  "Should I confirm this signal?",
  "Explain my last journal skip.",
  "What is a stop-loss?",
];

export const WATCHLIST: WatchItem[] = [
  { symbol: "AAPL", name: "Apple", assetClass: "equity", yahoo: "AAPL" },
  { symbol: "MSFT", name: "Microsoft", assetClass: "equity", yahoo: "MSFT" },
  { symbol: "GOOGL", name: "Alphabet", assetClass: "equity", yahoo: "GOOGL" },
  { symbol: "AMZN", name: "Amazon", assetClass: "equity", yahoo: "AMZN" },
  { symbol: "NVDA", name: "NVIDIA", assetClass: "equity", yahoo: "NVDA" },
  { symbol: "META", name: "Meta", assetClass: "equity", yahoo: "META" },
  { symbol: "TSLA", name: "Tesla", assetClass: "equity", yahoo: "TSLA" },
  { symbol: "SPY", name: "S&P 500 ETF", assetClass: "equity", yahoo: "SPY" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", assetClass: "equity", yahoo: "QQQ" },
  { symbol: "JPM", name: "JPMorgan", assetClass: "equity", yahoo: "JPM" },
  { symbol: "V", name: "Visa", assetClass: "equity", yahoo: "V" },
  { symbol: "UNH", name: "UnitedHealth", assetClass: "equity", yahoo: "UNH" },
  { symbol: "XOM", name: "Exxon Mobil", assetClass: "equity", yahoo: "XOM" },
  { symbol: "AVGO", name: "Broadcom", assetClass: "equity", yahoo: "AVGO" },
  { symbol: "NFLX", name: "Netflix", assetClass: "equity", yahoo: "NFLX" },
  {
    symbol: "BTC",
    name: "Bitcoin",
    assetClass: "crypto",
    yahoo: "BTC-USD",
    coingecko: "bitcoin",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    assetClass: "crypto",
    yahoo: "ETH-USD",
    coingecko: "ethereum",
  },
  {
    symbol: "SOL",
    name: "Solana",
    assetClass: "crypto",
    yahoo: "SOL-USD",
    coingecko: "solana",
  },
];

export const WATCH_BY_SYMBOL = Object.fromEntries(
  WATCHLIST.map((item) => [item.symbol, item]),
) as Record<string, WatchItem>;

export const STRATEGY_RULES = {
  name: "Beginner trend-follow",
  summary:
    "Buy strength that is not overheated. Sell if the trend breaks, or if the stop or target is hit.",
  entries: [
    "Price close is above the 50-day simple moving average (SMA 50) — a simple uptrend filter.",
    "14-day RSI is between 40 and 65 — some momentum, but not a blow-off (RSI above 70 is often called overbought).",
    "Long only: we never short, never use leverage, never trade options.",
  ],
  exits: [
    "Close drops back below SMA 50 (trend may be fading).",
    "Stop-loss: default −5% from the fill price.",
    "Take-profit: default +10% from the fill price.",
  ],
  sizing:
    "Each new buy is capped at 5% of the whole paper portfolio. At most 8 open positions. If the account is down 2% on the day, new buys halt until tomorrow.",
};

export const FILL_MODEL_DOC = {
  title: "How simulated fills work (v1)",
  bullets: [
    "Market orders fill at the latest daily bar close, plus 0.05% slippage on buys and minus 0.05% on sells (a bar-close model).",
    "Limit orders fill only if that bar’s high/low trades through the limit; fill price is the limit.",
    "Stop-loss and take-profit are checked against the latest bar’s low/high. If both would trigger in the same bar, the stop fills first (conservative).",
    "Exits are not evaluated on the same bar as the entry.",
    "There is no partial fill, no overnight borrow, and no real broker. If a live quote is missing we use cached or bundled demo bars so the classroom still works when markets are closed.",
  ],
};
