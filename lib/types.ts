export type AssetClass = "equity" | "crypto";
export type TradingMode = "manual" | "auto";
export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";
export type SignalStatus = "pending" | "accepted" | "dismissed" | "expired";
export type JournalType = "signal" | "fill" | "skip" | "coach" | "risk" | "system";

export type WatchItem = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  yahoo: string;
  coingecko?: string;
};

export type Bar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Quote = {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  asOf: string;
  source: "live" | "demo" | "cache";
};

export type Indicators = {
  sma20: number | null;
  sma50: number | null;
  rsi: number | null;
  sma20Series: Array<number | null>;
  sma50Series: Array<number | null>;
  rsiSeries: Array<number | null>;
};

export type Settings = {
  tradingMode: TradingMode;
  maxPositionPct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  stopLossPct: number;
  takeProfitPct: number;
  onboardingComplete: boolean;
  updatedAt: string;
};

export type Account = {
  cash: number;
  startingCash: number;
  createdAt: string;
};

export type Position = {
  id: number;
  symbol: string;
  assetClass: AssetClass;
  qty: number;
  avgPrice: number;
  stopPrice: number;
  takeProfitPrice: number;
  openedAt: string;
  lastPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
};

export type PendingSignal = {
  id: number;
  symbol: string;
  action: Side;
  reason: string;
  coachNote: string;
  price: number;
  qty: number;
  status: SignalStatus;
  demo: boolean;
  createdAt: string;
};

export type JournalEntry = {
  id: number;
  type: JournalType;
  symbol: string | null;
  title: string;
  body: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type EquitySnapshot = {
  id: number;
  equity: number;
  cash: number;
  positionsValue: number;
  createdAt: string;
};

export type ClosedTrade = {
  id: number;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  pnl: number | null;
  reason: string | null;
  createdAt: string;
};

export type AppState = {
  paper: true;
  disclaimer: string;
  settings: Settings;
  account: Account;
  cash: number;
  equity: number;
  positionsValue: number;
  dayPnl: number;
  dayPnlPct: number;
  allTimePnl: number;
  allTimePnlPct: number;
  winRate: number | null;
  closedTrades: number;
  winningTrades: number;
  dailyLossHalt: boolean;
  positions: Position[];
  pendingSignals: PendingSignal[];
  quotes: Quote[];
  equityHistory: EquitySnapshot[];
  recentJournal: JournalEntry[];
  coach: {
    headline: string;
    body: string;
    source: "template" | "llm";
  };
  dataHealth: {
    liveQuotes: number;
    demoQuotes: number;
    lastScanAt: string | null;
  };
};

export type ChartPayload = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  source: "live" | "demo" | "cache";
  bars: Bar[];
  indicators: Indicators;
  quote: Quote | null;
  position: Position | null;
  strategy: {
    buy: boolean;
    sell: boolean;
    notes: string[];
  };
};
