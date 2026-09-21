# Paper Coach — paper-trading AI classroom

Simulated-money trading coach for someone who has **never traded**. Watch a transparent beginner strategy, confirm (or auto-simulate) paper fills, and read plain-English notes about *why*.

## This is / this is not

**This is**
- A local web app with a virtual **$100,000** USD balance
- US equities (a ~15-name liquid watchlist) plus **BTC, ETH, SOL**
- A rule-based trend-follow strategy, a paper fill engine, risk brakes, charts, and a journal
- **Ask the Coach** chat grounded in your paper portfolio (works without a key; richer with OpenAI)
- Optional LLM *wording* for the coach if you later add an OpenAI key

**This is not**
- Financial advice
- A broker, exchange, or way to place real orders
- Connected to any brokerage API
- A place to store live-trading API keys (do not add them)

**PAPER TRADING — not real money.** Past simulated results do not predict the future.

## How to run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Complete the 4-step walkthrough. You should see a funded paper account, charts, at least one example signal (even if cash markets are closed), and a journal after you place or skip a paper trade. Open **Coach** in the nav and ask “What’s in my portfolio?” — the reply uses live paper cash and positions (and will not invent fills).

```bash
npm test      # indicator + sizing + coach-chat self-check
npm run build # production build
```

Requires Node.js 20+. SQLite is created at `data/paper-trading.db` on first launch (gitignored).

## Environment variables

Copy `.env.example` to `.env.local` if you want optional LLM copy:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | No | If set, **Coach Chat** and dashboard notes may use friendlier LLM wording. Without a key, Coach still answers from templates + your paper snapshot (cash, positions, journal, strategy rules). Trade **decisions** stay rule-based. Chat times out after ~12s; dashboard blurbs after ~2.5s. Always falls back to templates. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini`. |

Restart `npm run dev` after changing env vars. The UI never hangs or crashes if the key is missing.

## Coach Chat

The **Coach** tab (`/coach`) is a conversational classroom:

- Suggested prompts (“What’s in my portfolio?”, “What does RSI mean on this chart?”, “Explain my last journal skip.”)
- Every answer injects structured paper context from SQLite — never invented fills
- Suggested next steps link back to Dashboard, Markets, Journal, or Settings
- History is stored locally in SQLite so a refresh does not wipe the thread
- Empty state reminds you this is paper trading / not financial advice
- The coach refuses real-money gambling and “guaranteed profit” questions

Without `OPENAI_API_KEY` you still get useful, deterministic coaching. Settings explains how to add a key for richer chat.

**No brokerage keys. No paid market-data keys required for the demo.** Quotes come from public Yahoo Finance chart endpoints (unofficial) and CoinGecko as a crypto fallback, then from bundled deterministic demo bars if a feed fails or rate-limits.

To plug in a paid vendor later (Polygon, Alpha Vantage, etc.): edit `lib/market-data.ts` only. Still never add a broker.

## Strategy (v1, long only)

**Beginner trend-follow**
- **Buy** when daily close > SMA 50 and 14-day RSI is between 40 and 65
- **Sell** when close drops back under SMA 50, or at stop-loss / take-profit
- No shorts, no leverage, no options

Default risk (editable in Settings):
- Max **5%** of portfolio per new position
- Max **2%** daily loss → halt new buys for the day
- Max **8** open positions
- Stop **−5%** / take-profit **+10%**

Modes: **Manual** (default, you confirm signals) and **Auto paper** (engine places simulated fills).

## Fill model

- **Market** orders fill at the latest daily **bar close** ± 0.05% slippage (buy +, sell −)
- **Limit** support is modeled as “fill if that bar’s high/low trades through the limit; fill price = limit”
- Stops/targets use the latest bar low/high. If both would hit in the same bar, the **stop wins** (conservative)
- Exits are not evaluated on the same bar as the entry
- No partial fills. If live data is missing, cached or demo bars keep the classroom running

## Architecture

```
Browser (Next.js App Router + React)
  → API routes (Node runtime)
      → Paper engine (lib/engine.ts) — signals, risk, fills
      → SQLite via better-sqlite3 (data/paper-trading.db)
      → Market data (lib/market-data.ts) — Yahoo / CoinGecko + cache + demo bars
      → Coach copy (lib/coach.ts) — dashboard templates, optional OpenAI
      → Coach chat (lib/coach-chat.ts, lib/coach-offline.ts) — conversational Q&A + SQLite history
```

Screens: Dashboard, Markets (watchlist + candles + SMA/RSI), **Coach** (Ask the Coach chat), Journal (filterable), Settings.

## Disclaimer

This project is an educational toy. It cannot buy or sell real assets. It is not a recommendation to trade. If you choose to use real money someday, that is outside this app and you should get advice from a licensed professional. You can lose real money in real markets.
