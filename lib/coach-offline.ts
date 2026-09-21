import { STRATEGY_RULES } from "./constants";
import { pct, qtyLabel, signedUsd, usd } from "./format";
import type { CoachContext, CoachLead, CoachPositionSnapshot } from "./types";

export type CoachIntent =
  | "safety_refuse"
  | "portfolio"
  | "holding"
  | "rsi"
  | "sma"
  | "stop_loss"
  | "take_profit"
  | "confirm_signal"
  | "journal_skip"
  | "last_fill"
  | "strategy"
  | "risk"
  | "mode"
  | "fills"
  | "paper"
  | "next_action"
  | "greeting"
  | "fallback";

export function isUnsafePrompt(text: string): boolean {
  const t = text.toLowerCase();
  if (/guaranteed\s+(profit|return|win|money)/.test(t)) return true;
  if (/\b(can't|cannot|can not)\s+lose\b/.test(t)) return true;
  if (/get rich/.test(t)) return true;
  if (/double (my|your) money/.test(t)) return true;
  if (/sure thing/.test(t) && /(profit|trade|buy|sell|win)/.test(t)) return true;
  if (
    /(should i|how do i|want to|let's|lets|help me)\s.{0,40}(real money|live account|real broker|live trad)/.test(
      t,
    )
  ) {
    return true;
  }
  if (/(trade|invest|use|put|risk|gamble).{0,30}(real money|live account|paycheck|rent|mortgage)/.test(t)) {
    return true;
  }
  return false;
}

export function classifyIntent(text: string): CoachIntent {
  if (isUnsafePrompt(text)) return "safety_refuse";
  const t = text.toLowerCase();
  if (/\b(hi|hello|hey|yo)\b/.test(t) && t.length < 40) return "greeting";
  if (/stop[-\s]?loss|what is a stop/.test(t)) return "stop_loss";
  if (/take[-\s]?profit|what is a target/.test(t)) return "take_profit";
  if (/\brsi\b|relative strength/.test(t)) return "rsi";
  if (/\bsma\b|moving average|50-day|50 day/.test(t)) return "sma";
  if (/last journal skip|explain.{0,20}skip|why.{0,20}skip/.test(t)) return "journal_skip";
  if (/confirm this signal|should i confirm|pending signal|place paper/.test(t)) {
    return "confirm_signal";
  }
  if (/why am i holding|why.{0,12}hold|open position/.test(t)) return "holding";
  if (/what.?s in my portfolio|my portfolio|what do i (own|hold)|how much cash/.test(t)) {
    return "portfolio";
  }
  if (/last (fill|trade)|what did i (buy|sell)/.test(t)) return "last_fill";
  if (/strategy|buy rule|sell rule|trend-follow/.test(t)) return "strategy";
  if (/risk|daily loss|position size|max open/.test(t)) return "risk";
  if (/manual|auto paper|trading mode/.test(t)) return "mode";
  if (/fill model|slippage|how (do )?fills/.test(t)) return "fills";
  if (/paper trad|fake money|real money|financial advice/.test(t)) return "paper";
  if (/what should i do|next (step|action)|where do i start/.test(t)) return "next_action";
  return "fallback";
}

export function defaultLeads(ctx: CoachContext): CoachLead[] {
  const leads: CoachLead[] = [];
  const pending = ctx.pendingSignals[0];
  if (pending) {
    leads.push({
      label:
        pending.action === "buy"
          ? `Review ${pending.symbol} buy signal`
          : `Review ${pending.symbol} exit signal`,
      href: "/",
    });
  }
  leads.push({ label: "Open Dashboard", href: "/" });
  const symbol = ctx.focus?.symbol ?? ctx.positions[0]?.symbol ?? pending?.symbol;
  leads.push({
    label: symbol ? `View ${symbol} chart` : "Browse Markets",
    href: symbol ? `/markets?symbol=${symbol}` : "/markets",
  });
  leads.push({ label: "Read Journal", href: "/journal" });
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = `${lead.label}|${lead.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function join(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}

function positionLine(pos: CoachPositionSnapshot): string {
  const qty = qtyLabel(pos.qty, pos.assetClass);
  const mark =
    pos.lastPrice == null
      ? `avg ${usd(pos.avgPrice)} (no cached last price yet)`
      : `last ${usd(pos.lastPrice)}, avg ${usd(pos.avgPrice)}`;
  const pnl =
    pos.unrealizedPnl == null
      ? ""
      : `, paper P&L ${signedUsd(pos.unrealizedPnl)} (${pct(pos.unrealizedPnlPct ?? 0)})`;
  return `• ${pos.symbol} (${pos.name}) — ${qty} @ ${mark}${pnl}. Stop ${usd(pos.stopPrice)}, target ${usd(pos.takeProfitPrice)}.`;
}

function portfolioBody(ctx: CoachContext): string {
  if (!ctx.positions.length) {
    return join([
      `Your paper account is in cash: ${usd(ctx.cash)}. Equity is ${usd(ctx.equity)}. There are no open positions and I will not invent fills you do not have.`,
      `Mode is ${ctx.tradingMode === "auto" ? "Auto paper" : "Manual"}. Starting classroom balance was ${usd(ctx.startingCash)}.`,
      "If you want something to practice on, scan the watchlist from the Dashboard or open Markets and look for the beginner buy rules.",
    ]);
  }
  return join([
    `Paper snapshot (simulated money only): cash ${usd(ctx.cash)}, invested about ${usd(ctx.positionsValue)}, equity ${usd(ctx.equity)}. Day P&L ${signedUsd(ctx.dayPnl)} (${pct(ctx.dayPnlPct)}).`,
    `Open positions (${ctx.positions.length} of ${ctx.maxOpenPositions}):\n${ctx.positions.map(positionLine).join("\n")}`,
    "This is a classroom blotter, not a broker statement. Numbers can use a cached last price when a chart has loaded.",
  ]);
}

function holdingBody(ctx: CoachContext): string {
  const focused = ctx.focus?.symbol
    ? ctx.positions.find((p) => p.symbol === ctx.focus?.symbol)
    : undefined;
  const pos = focused ?? ctx.positions[0];
  if (!pos) {
    return join([
      "You are not holding anything in the paper account right now — cash only. I will not pretend a position exists.",
      "A hold starts after you confirm a buy (or Auto paper fills one). Until then, there is nothing to explain.",
    ]);
  }
  const why = focused
    ? `You asked about ${pos.symbol}, which is in the paper book.`
    : ctx.positions.length === 1
      ? `The only paper position is ${pos.symbol}.`
      : `I will start with ${pos.symbol}. You also hold ${ctx.positions
          .filter((p) => p.symbol !== pos.symbol)
          .map((p) => p.symbol)
          .join(", ")}.`;
  return join([
    why,
    `The beginner strategy holds a long only while the idea is still valid: stay in unless price closes back under SMA 50, or the stop (${usd(pos.stopPrice)}) or target (${usd(pos.takeProfitPrice)}) is hit. Average fill was ${usd(pos.avgPrice)}.`,
    pos.lastPrice == null
      ? "I do not have a cached last price for this name yet, so I will not guess whether it is winning or losing."
      : `Cached last price is ${usd(pos.lastPrice)} — paper P&L ${signedUsd(pos.unrealizedPnl ?? 0)} (${pct(pos.unrealizedPnlPct ?? 0)}). That is simulated, not a prediction.`,
    "If you want to leave the trade, that is a paper sell from the Dashboard. If you want to understand the chart, open Markets.",
  ]);
}

function rsiBody(ctx: CoachContext): string {
  const reading =
    ctx.focus?.rsi != null
      ? `On ${ctx.focus.symbol}, the cached 14-day RSI is ${ctx.focus.rsi.toFixed(1)}. ${
          ctx.focus.rsi >= 40 && ctx.focus.rsi <= 65
            ? "That sits inside the strategy’s 40–65 buy zone (some momentum, not a blow-off)."
            : ctx.focus.rsi > 65
              ? "That is hotter than 65, so the beginner rules wait instead of chasing."
              : "That is cooler than 40, so the beginner rules do not treat it as a buy."
        }`
      : ctx.focus
        ? `I selected ${ctx.focus.symbol}, but I do not have a cached RSI yet. Open Markets so the chart can load, then ask again.`
        : "Pick a ticker in the “chart in focus” menu (or open Markets first) if you want the RSI for a specific name.";
  return join([
    "RSI (Relative Strength Index) is a 0–100 momentum score. Think of it as “how quickly has price been rising versus falling over the last 14 days?” It is not a crystal ball.",
    "This classroom’s buy rule only likes RSI between 40 and 65: enough strength to suggest an uptrend, not so much that the move looks exhausted (people often call RSI above 70 overbought).",
    reading,
  ]);
}

function smaBody(ctx: CoachContext): string {
  const reading =
    ctx.focus?.sma50 != null && ctx.focus.lastClose != null
      ? `On ${ctx.focus.symbol}, cached close is ${usd(ctx.focus.lastClose)} vs SMA 50 ${usd(ctx.focus.sma50)}. ${
          ctx.focus.lastClose > ctx.focus.sma50
            ? "Price is above the line, so the uptrend filter is on."
            : "Price is below the line, so this is not a beginner buy setup."
        }`
      : ctx.focus
        ? `Focus is ${ctx.focus.symbol}, but SMA 50 is not cached yet. Load the chart on Markets.`
        : "Choose a ticker in focus to see that chart’s 50-day average.";
  return join([
    "SMA 50 is the average closing price of the last 50 days. We use it as a simple “is this still generally going up?” line — not as a promise.",
    "The strategy only considers a paper buy when the latest close is above SMA 50. A close back under it is an exit reason.",
    reading,
  ]);
}

function confirmBody(ctx: CoachContext): string {
  const signal = ctx.pendingSignals[0];
  if (!signal) {
    return join([
      "There is no pending signal right now. I will not invent one for you to confirm.",
      "Scan markets from the Dashboard, or browse charts. In Manual mode a matching setup shows up as a card you can accept or skip.",
    ]);
  }
  return join([
    `A paper ${signal.action.toUpperCase()} for ${signal.symbol} is waiting${signal.demo ? " (worked example)" : ""}. Because you are in ${ctx.tradingMode === "auto" ? "Auto paper" : "Manual"} mode, ${
      ctx.tradingMode === "manual"
        ? "nothing fills until you tap the button on the Dashboard."
        : "the engine may fill it without asking — still fake money."
    }`,
    signal.coachNote,
    "I cannot tell you this will make money. Simulated results are practice. If you want to learn the process, read the thesis, look at the chart, then confirm or skip.",
  ]);
}

function skipBody(ctx: CoachContext): string {
  if (!ctx.lastSkip) {
    return join([
      "I do not see a skip in the recent journal. I will not invent a skip reason.",
      "A skip is logged when you dismiss a signal, or when a buy cannot size (for example, not enough paper cash).",
    ]);
  }
  return join([
    `Latest journal skip${ctx.lastSkip.symbol ? ` (${ctx.lastSkip.symbol})` : ""}: ${ctx.lastSkip.title}.`,
    ctx.lastSkip.body,
    "Skipping is a normal classroom move. The point is to read the setup and decide — not to take every signal.",
  ]);
}

function fillBody(ctx: CoachContext): string {
  if (!ctx.lastFill) {
    return join([
      "No paper fills are in the recent journal. I will not invent a trade.",
      "A fill appears after you confirm a signal, Auto paper takes one, or a stop/target/trend-break sells a position.",
    ]);
  }
  return join([
    `Latest paper fill${ctx.lastFill.symbol ? ` (${ctx.lastFill.symbol})` : ""}: ${ctx.lastFill.title}.`,
    ctx.lastFill.body,
    "Fills use the bar-close classroom model (small slippage). Open the Journal for the full audit trail.",
  ]);
}

export function answerOffline(
  question: string,
  ctx: CoachContext,
): { reply: string; leads: CoachLead[]; intent: CoachIntent } {
  const intent = classifyIntent(question);
  let reply: string;
  let leads = defaultLeads(ctx);

  switch (intent) {
    case "safety_refuse":
      reply = join([
        "I cannot help with real-money gambling, live brokerage orders, or any claim of guaranteed profits. This app is a paper classroom with fake dollars.",
        "Nothing here is financial advice. Past simulated results do not predict the future. If you ever use real money, that is outside this website and you should talk to a licensed professional.",
        "I can still explain your paper portfolio, the beginner rules, or a chart in this app.",
      ]);
      leads = [
        { label: "Stay on paper Dashboard", href: "/" },
        { label: "Read the strategy", href: "/settings" },
        { label: "Open Journal", href: "/journal" },
      ];
      break;
    case "greeting":
      reply = join([
        "Hi — I am the paper-trading coach. Ask about your fake portfolio, a pending signal, a journal skip, or a word like RSI.",
        `Right now you have ${usd(ctx.cash)} cash and ${ctx.positions.length} open paper position${ctx.positions.length === 1 ? "" : "s"}. Educational only, not financial advice.`,
      ]);
      break;
    case "portfolio":
      reply = portfolioBody(ctx);
      break;
    case "holding":
      reply = holdingBody(ctx);
      leads = [
        ctx.positions[0]
          ? { label: `View ${ctx.positions[0].symbol} chart`, href: `/markets?symbol=${ctx.positions[0].symbol}` }
          : { label: "Browse Markets", href: "/markets" },
        { label: "Open Dashboard", href: "/" },
        { label: "Read Journal", href: "/journal" },
      ];
      break;
    case "rsi":
      reply = rsiBody(ctx);
      leads = [
        {
          label: ctx.focus?.symbol ? `Open ${ctx.focus.symbol} chart` : "Open Markets",
          href: ctx.focus?.symbol ? `/markets?symbol=${ctx.focus.symbol}` : "/markets",
        },
        { label: "Review strategy rules", href: "/settings" },
        { label: "Dashboard", href: "/" },
      ];
      break;
    case "sma":
      reply = smaBody(ctx);
      leads = [
        {
          label: ctx.focus?.symbol ? `Open ${ctx.focus.symbol} chart` : "Open Markets",
          href: ctx.focus?.symbol ? `/markets?symbol=${ctx.focus.symbol}` : "/markets",
        },
        { label: "Review strategy rules", href: "/settings" },
        { label: "Dashboard", href: "/" },
      ];
      break;
    case "stop_loss":
      reply = join([
        `A stop-loss is a pre-planned “if I am wrong, get out” price. In this classroom each new paper buy places a stop about ${pct(ctx.stopLossPct, 0).replace("+", "")} below the fill.`,
        "It does not make a trade safe. It only caps how large one simulated mistake is allowed to get. If both a stop and a target would hit in the same daily bar, the stop wins (conservative).",
        ctx.positions.length
          ? `Your open stops: ${ctx.positions.map((p) => `${p.symbol} ${usd(p.stopPrice)}`).join(", ")}.`
          : "You have no open positions, so there is no live stop right now.",
      ]);
      leads = [
        { label: "Adjust risk in Settings", href: "/settings" },
        { label: "Open Dashboard", href: "/" },
        { label: "Browse Markets", href: "/markets" },
      ];
      break;
    case "take_profit":
      reply = join([
        `A take-profit (target) is a pre-planned “if it works, bank some of it” price. Default here is about ${pct(ctx.takeProfitPct, 0)} above the paper fill.`,
        "Hitting a target in this app is still simulated. It does not mean the same trade will work tomorrow.",
        ctx.positions.length
          ? `Your open targets: ${ctx.positions.map((p) => `${p.symbol} ${usd(p.takeProfitPrice)}`).join(", ")}.`
          : "No open positions, so no live target.",
      ]);
      break;
    case "confirm_signal":
      reply = confirmBody(ctx);
      leads = ctx.pendingSignals.length
        ? [
            { label: "Confirm or skip on Dashboard", href: "/" },
            {
              label: `View ${ctx.pendingSignals[0].symbol} chart`,
              href: `/markets?symbol=${ctx.pendingSignals[0].symbol}`,
            },
            { label: "Read Journal", href: "/journal" },
          ]
        : [
            { label: "Scan from Dashboard", href: "/" },
            { label: "Browse Markets", href: "/markets" },
            { label: "Settings", href: "/settings" },
          ];
      break;
    case "journal_skip":
      reply = skipBody(ctx);
      leads = [
        { label: "Open Journal", href: "/journal" },
        { label: "Dashboard", href: "/" },
        { label: "Markets", href: "/markets" },
      ];
      break;
    case "last_fill":
      reply = fillBody(ctx);
      leads = [
        { label: "Open Journal", href: "/journal" },
        { label: "Dashboard", href: "/" },
        { label: "Markets", href: "/markets" },
      ];
      break;
    case "strategy":
      reply = join([
        `${STRATEGY_RULES.name}: ${STRATEGY_RULES.summary}`,
        `Buy: ${STRATEGY_RULES.entries.join(" ")}`,
        `Sell: ${STRATEGY_RULES.exits.join(" ")}`,
        STRATEGY_RULES.sizing,
      ]);
      leads = [
        { label: "Full rules in Settings", href: "/settings" },
        { label: "Try a chart", href: "/markets" },
        { label: "Dashboard", href: "/" },
      ];
      break;
    case "risk":
      reply = join([
        `Risk brakes (paper only): max ${pct(ctx.maxPositionPct, 0)} of portfolio per new buy, at most ${ctx.maxOpenPositions} open names, daily-loss halt at ${pct(-ctx.maxDailyLossPct)} (${ctx.dailyLossHalt ? "currently ON — no new buys" : "not triggered"}).`,
        `Stops default ${pct(ctx.stopLossPct, 0).replace("+", "")} / targets ${pct(ctx.takeProfitPct, 0)}. You can edit these in Settings. They still do not talk to a broker.`,
      ]);
      leads = [
        { label: "Edit risk in Settings", href: "/settings" },
        { label: "Dashboard", href: "/" },
        { label: "Journal", href: "/journal" },
      ];
      break;
    case "mode":
      reply = join([
        ctx.tradingMode === "manual"
          ? "You are in Manual mode: the strategy can suggest a paper trade, but you confirm or skip it. That is the safest way to learn why a setup fired."
          : "You are in Auto paper: the rule engine may place simulated fills without asking. Still not real money, and you can switch back to Manual in Settings.",
        "Auto never becomes a live broker. There is nowhere in this app to paste brokerage keys.",
      ]);
      leads = [
        { label: "Change mode in Settings", href: "/settings" },
        { label: "Dashboard", href: "/" },
        { label: "Journal", href: "/journal" },
      ];
      break;
    case "fills":
      reply = join([
        "Paper fills are a classroom model: market orders use the latest daily close plus 0.05% slippage on buys (minus on sells). Limits fill only if that bar trades through the price.",
        "Stops and targets look at the bar’s low/high. Same-bar stop and target → stop wins. No partial fills, no real broker.",
      ]);
      leads = [
        { label: "Read fill notes in Settings", href: "/settings" },
        { label: "Journal", href: "/journal" },
        { label: "Dashboard", href: "/" },
      ];
      break;
    case "paper":
      reply = join([
        "This is paper trading: a virtual $100,000 classroom. It cannot buy or sell real stocks or crypto. It is not financial advice.",
        "Quotes may come from public feeds or bundled demo bars. Past simulated results do not predict the future.",
      ]);
      break;
    case "next_action":
      reply = join([
        ctx.pendingSignals.length
          ? `A signal is waiting (${ctx.pendingSignals[0].action} ${ctx.pendingSignals[0].symbol}). Open the Dashboard, read the note, look at the chart, then confirm or skip.`
          : ctx.positions.length
            ? `You already have ${ctx.positions.length} paper position${ctx.positions.length === 1 ? "" : "s"}. Review them on the Dashboard, or ask why you are holding one.`
            : "Start on the Dashboard: scan markets, then open a chart. Confirm a buy only after you can explain the SMA 50 + RSI rule in your own words.",
        "I will not tell you a trade is a sure thing. Practice the process, not a profit target.",
      ]);
      break;
    default:
      reply = join([
        `I can answer with your live paper state. Cash ${usd(ctx.cash)}, equity ${usd(ctx.equity)}, ${ctx.positions.length} open position${ctx.positions.length === 1 ? "" : "s"}, ${ctx.pendingSignals.length} pending signal${ctx.pendingSignals.length === 1 ? "" : "s"}.`,
        ctx.positions.length
          ? `Holdings: ${ctx.positions.map((p) => p.symbol).join(", ")}.`
          : "No open holdings — I will not invent any.",
        "Try a specific question: portfolio, a stop-loss, RSI on the focused chart, a pending signal, or your last journal skip. Educational only, not financial advice.",
      ]);
  }

  return { reply, leads: leads.slice(0, 3), intent };
}
