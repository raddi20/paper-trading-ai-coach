import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DEFAULT_SETTINGS, STARTING_CASH } from "./constants";
import type {
  Account,
  ClosedTrade,
  EquitySnapshot,
  JournalEntry,
  JournalType,
  PendingSignal,
  Position,
  Settings,
  Side,
} from "./types";

const globalForDb = globalThis as unknown as {
  paperDb?: Database.Database;
};

function dbPath(): string {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "paper-trading.db");
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      trading_mode TEXT NOT NULL,
      max_position_pct REAL NOT NULL,
      max_daily_loss_pct REAL NOT NULL,
      max_open_positions INTEGER NOT NULL,
      stop_loss_pct REAL NOT NULL,
      take_profit_pct REAL NOT NULL,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cash REAL NOT NULL,
      starting_cash REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      asset_class TEXT NOT NULL,
      qty REAL NOT NULL,
      avg_price REAL NOT NULL,
      stop_price REAL NOT NULL,
      take_profit_price REAL NOT NULL,
      opened_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      coach_note TEXT NOT NULL,
      price REAL NOT NULL,
      qty REAL NOT NULL,
      status TEXT NOT NULL,
      demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      symbol TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty REAL NOT NULL,
      price REAL NOT NULL,
      pnl REAL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equity REAL NOT NULL,
      cash REAL NOT NULL,
      positions_value REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bars_cache (
      symbol TEXT NOT NULL,
      payload TEXT NOT NULL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (symbol)
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const settings = db.prepare("SELECT id FROM settings WHERE id = 1").get();
  if (!settings) {
    db.prepare(
      `INSERT INTO settings (
        id, trading_mode, max_position_pct, max_daily_loss_pct, max_open_positions,
        stop_loss_pct, take_profit_pct, onboarding_complete, updated_at
      ) VALUES (1, @tradingMode, @maxPositionPct, @maxDailyLossPct, @maxOpenPositions,
        @stopLossPct, @takeProfitPct, 0, @updatedAt)`,
    ).run({ ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() });
  }

  const account = db.prepare("SELECT id FROM account WHERE id = 1").get();
  if (!account) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO account (id, cash, starting_cash, created_at) VALUES (1, ?, ?, ?)`,
    ).run(STARTING_CASH, STARTING_CASH, now);
    db.prepare(
      `INSERT INTO equity_snapshots (equity, cash, positions_value, created_at)
       VALUES (?, ?, 0, ?)`,
    ).run(STARTING_CASH, STARTING_CASH, now);
  }
}

export function getDb(): Database.Database {
  if (globalForDb.paperDb) return globalForDb.paperDb;
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  globalForDb.paperDb = db;
  return db;
}

export function getSettings(): Settings {
  const row = getDb()
    .prepare(
      `SELECT trading_mode, max_position_pct, max_daily_loss_pct, max_open_positions,
              stop_loss_pct, take_profit_pct, onboarding_complete, updated_at
       FROM settings WHERE id = 1`,
    )
    .get() as {
    trading_mode: Settings["tradingMode"];
    max_position_pct: number;
    max_daily_loss_pct: number;
    max_open_positions: number;
    stop_loss_pct: number;
    take_profit_pct: number;
    onboarding_complete: number;
    updated_at: string;
  };
  return {
    tradingMode: row.trading_mode,
    maxPositionPct: row.max_position_pct,
    maxDailyLossPct: row.max_daily_loss_pct,
    maxOpenPositions: row.max_open_positions,
    stopLossPct: row.stop_loss_pct,
    takeProfitPct: row.take_profit_pct,
    onboardingComplete: Boolean(row.onboarding_complete),
    updatedAt: row.updated_at,
  };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `UPDATE settings SET
        trading_mode = @tradingMode,
        max_position_pct = @maxPositionPct,
        max_daily_loss_pct = @maxDailyLossPct,
        max_open_positions = @maxOpenPositions,
        stop_loss_pct = @stopLossPct,
        take_profit_pct = @takeProfitPct,
        onboarding_complete = @onboardingComplete,
        updated_at = @updatedAt
       WHERE id = 1`,
    )
    .run({
      tradingMode: next.tradingMode,
      maxPositionPct: next.maxPositionPct,
      maxDailyLossPct: next.maxDailyLossPct,
      maxOpenPositions: next.maxOpenPositions,
      stopLossPct: next.stopLossPct,
      takeProfitPct: next.takeProfitPct,
      onboardingComplete: next.onboardingComplete ? 1 : 0,
      updatedAt: next.updatedAt,
    });
  return next;
}

export function getAccount(): Account {
  const row = getDb()
    .prepare(`SELECT cash, starting_cash, created_at FROM account WHERE id = 1`)
    .get() as { cash: number; starting_cash: number; created_at: string };
  return {
    cash: row.cash,
    startingCash: row.starting_cash,
    createdAt: row.created_at,
  };
}

export function setCash(cash: number) {
  getDb().prepare("UPDATE account SET cash = ? WHERE id = 1").run(cash);
}

export function getPositions(): Position[] {
  return getDb()
    .prepare(
      `SELECT id, symbol, asset_class as assetClass, qty, avg_price as avgPrice,
              stop_price as stopPrice, take_profit_price as takeProfitPrice,
              opened_at as openedAt
       FROM positions ORDER BY opened_at ASC`,
    )
    .all() as Position[];
}

export function getPosition(symbol: string): Position | undefined {
  return getDb()
    .prepare(
      `SELECT id, symbol, asset_class as assetClass, qty, avg_price as avgPrice,
              stop_price as stopPrice, take_profit_price as takeProfitPrice,
              opened_at as openedAt
       FROM positions WHERE symbol = ?`,
    )
    .get(symbol) as Position | undefined;
}

export function upsertPosition(position: Omit<Position, "id"> & { id?: number }) {
  getDb()
    .prepare(
      `INSERT INTO positions (symbol, asset_class, qty, avg_price, stop_price, take_profit_price, opened_at)
       VALUES (@symbol, @assetClass, @qty, @avgPrice, @stopPrice, @takeProfitPrice, @openedAt)
       ON CONFLICT(symbol) DO UPDATE SET
         qty = excluded.qty,
         avg_price = excluded.avg_price,
         stop_price = excluded.stop_price,
         take_profit_price = excluded.take_profit_price`,
    )
    .run(position);
}

export function deletePosition(symbol: string) {
  getDb().prepare("DELETE FROM positions WHERE symbol = ?").run(symbol);
}

export function insertSignal(signal: {
  symbol: string;
  action: Side;
  reason: string;
  coachNote: string;
  price: number;
  qty: number;
  demo?: boolean;
}): PendingSignal {
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO pending_signals (symbol, action, reason, coach_note, price, qty, status, demo, created_at)
       VALUES (@symbol, @action, @reason, @coachNote, @price, @qty, 'pending', @demo, @createdAt)`,
    )
    .run({
      ...signal,
      demo: signal.demo ? 1 : 0,
      createdAt,
    });
  return {
    id: Number(result.lastInsertRowid),
    symbol: signal.symbol,
    action: signal.action,
    reason: signal.reason,
    coachNote: signal.coachNote,
    price: signal.price,
    qty: signal.qty,
    status: "pending",
    demo: Boolean(signal.demo),
    createdAt,
  };
}

export function getPendingSignals(): PendingSignal[] {
  return (
    getDb()
      .prepare(
        `SELECT id, symbol, action, reason, coach_note as coachNote, price, qty, status,
                demo, created_at as createdAt
         FROM pending_signals WHERE status = 'pending' ORDER BY id DESC`,
      )
      .all() as Array<Omit<PendingSignal, "demo"> & { demo: number }>
  ).map((row) => ({ ...row, demo: Boolean(row.demo) }));
}

export function getSignal(id: number): PendingSignal | undefined {
  const row = getDb()
    .prepare(
      `SELECT id, symbol, action, reason, coach_note as coachNote, price, qty, status,
              demo, created_at as createdAt
       FROM pending_signals WHERE id = ?`,
    )
    .get(id) as (Omit<PendingSignal, "demo"> & { demo: number }) | undefined;
  return row ? { ...row, demo: Boolean(row.demo) } : undefined;
}

export function setSignalStatus(id: number, status: PendingSignal["status"]) {
  getDb().prepare("UPDATE pending_signals SET status = ? WHERE id = ?").run(status, id);
}

export function hasPendingFor(symbol: string, action: Side): boolean {
  const row = getDb()
    .prepare(
      `SELECT id FROM pending_signals WHERE symbol = ? AND action = ? AND status = 'pending'`,
    )
    .get(symbol, action);
  return Boolean(row);
}

export function addJournal(entry: {
  type: JournalType;
  symbol?: string | null;
  title: string;
  body: string;
  meta?: Record<string, unknown> | null;
}): JournalEntry {
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO journal (type, symbol, title, body, meta, created_at)
       VALUES (@type, @symbol, @title, @body, @meta, @createdAt)`,
    )
    .run({
      type: entry.type,
      symbol: entry.symbol ?? null,
      title: entry.title,
      body: entry.body,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
      createdAt,
    });
  return {
    id: Number(result.lastInsertRowid),
    type: entry.type,
    symbol: entry.symbol ?? null,
    title: entry.title,
    body: entry.body,
    meta: entry.meta ?? null,
    createdAt,
  };
}

export function listJournal(filters?: {
  type?: string;
  symbol?: string;
  limit?: number;
}): JournalEntry[] {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {
    limit: filters?.limit ?? 200,
  };
  if (filters?.type && filters.type !== "all") {
    clauses.push("type = @type");
    params.type = filters.type;
  }
  if (filters?.symbol) {
    clauses.push("symbol = @symbol");
    params.symbol = filters.symbol.toUpperCase();
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT id, type, symbol, title, body, meta, created_at as createdAt
       FROM journal ${where} ORDER BY id DESC LIMIT @limit`,
    )
    .all(params) as Array<Omit<JournalEntry, "meta"> & { meta: string | null }>;
  return rows.map((row) => ({
    ...row,
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
  }));
}

export function addTrade(trade: {
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  pnl?: number | null;
  reason?: string | null;
}): ClosedTrade {
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO trades (symbol, side, qty, price, pnl, reason, created_at)
       VALUES (@symbol, @side, @qty, @price, @pnl, @reason, @createdAt)`,
    )
    .run({
      ...trade,
      pnl: trade.pnl ?? null,
      reason: trade.reason ?? null,
      createdAt,
    });
  return {
    id: Number(result.lastInsertRowid),
    symbol: trade.symbol,
    side: trade.side,
    qty: trade.qty,
    price: trade.price,
    pnl: trade.pnl ?? null,
    reason: trade.reason ?? null,
    createdAt,
  };
}

export function closedSells(): ClosedTrade[] {
  return getDb()
    .prepare(
      `SELECT id, symbol, side, qty, price, pnl, reason, created_at as createdAt
       FROM trades WHERE side = 'sell' AND pnl IS NOT NULL ORDER BY id DESC`,
    )
    .all() as ClosedTrade[];
}

export function addSnapshot(snap: {
  equity: number;
  cash: number;
  positionsValue: number;
}) {
  getDb()
    .prepare(
      `INSERT INTO equity_snapshots (equity, cash, positions_value, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(snap.equity, snap.cash, snap.positionsValue, new Date().toISOString());
}

export function listSnapshots(limit = 180): EquitySnapshot[] {
  return getDb()
    .prepare(
      `SELECT id, equity, cash, positions_value as positionsValue, created_at as createdAt
       FROM equity_snapshots ORDER BY id ASC LIMIT ?`,
    )
    .all(limit) as EquitySnapshot[];
}

export function firstSnapshotToday(): EquitySnapshot | undefined {
  const today = new Date().toISOString().slice(0, 10);
  return getDb()
    .prepare(
      `SELECT id, equity, cash, positions_value as positionsValue, created_at as createdAt
       FROM equity_snapshots WHERE created_at LIKE ? ORDER BY id ASC LIMIT 1`,
    )
    .get(`${today}%`) as EquitySnapshot | undefined;
}

export function getKv(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setKv(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function getCachedBars(symbol: string): {
  payload: string;
  source: string;
  fetchedAt: string;
} | null {
  return (
    (getDb()
      .prepare(
        `SELECT payload, source, fetched_at as fetchedAt FROM bars_cache WHERE symbol = ?`,
      )
      .get(symbol) as { payload: string; source: string; fetchedAt: string } | undefined) ??
    null
  );
}

export function setCachedBars(
  symbol: string,
  payload: string,
  source: string,
) {
  getDb()
    .prepare(
      `INSERT INTO bars_cache (symbol, payload, source, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         payload = excluded.payload,
         source = excluded.source,
         fetched_at = excluded.fetched_at`,
    )
    .run(symbol, payload, source, new Date().toISOString());
}

export function resetPaperAccount() {
  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM positions;
      DELETE FROM pending_signals;
      DELETE FROM journal;
      DELETE FROM trades;
      DELETE FROM equity_snapshots;
    `);
    db.prepare("UPDATE account SET cash = ?, starting_cash = ?, created_at = ? WHERE id = 1").run(
      STARTING_CASH,
      STARTING_CASH,
      now,
    );
    db.prepare(
      `UPDATE settings SET trading_mode = 'manual', max_position_pct = ?, max_daily_loss_pct = ?,
        max_open_positions = ?, stop_loss_pct = ?, take_profit_pct = ?, updated_at = ?
       WHERE id = 1`,
    ).run(
      DEFAULT_SETTINGS.maxPositionPct,
      DEFAULT_SETTINGS.maxDailyLossPct,
      DEFAULT_SETTINGS.maxOpenPositions,
      DEFAULT_SETTINGS.stopLossPct,
      DEFAULT_SETTINGS.takeProfitPct,
      now,
    );
    db.prepare(
      `INSERT INTO equity_snapshots (equity, cash, positions_value, created_at) VALUES (?, ?, 0, ?)`,
    ).run(STARTING_CASH, STARTING_CASH, now);
    db.prepare("DELETE FROM kv WHERE key IN ('last_scan_at', 'demo_signal_seeded')").run();
  });
  tx();
}
