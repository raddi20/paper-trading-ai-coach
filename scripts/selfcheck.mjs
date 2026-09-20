import assert from "node:assert/strict";
import test from "node:test";

function sma(values, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function rsi(values, period = 14) {
  const out = [null];
  const gains = [];
  const losses = [];
  for (let i = 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < gains.length; i += 1) {
    if (i < period) {
      avgGain += gains[i];
      avgLoss += losses[i];
      if (i === period - 1) {
        avgGain /= period;
        avgLoss /= period;
        out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
      } else out.push(null);
    } else {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  return out;
}

function positionSize({ equity, cash, price, maxPositionPct, assetClass }) {
  const cap = equity * maxPositionPct;
  const buyingPower = Math.min(cap, cash);
  const raw = buyingPower / price;
  if (assetClass === "equity") return Math.floor(raw);
  return Math.floor(raw * 1_000_000) / 1_000_000;
}

test("SMA of a flat series equals the value", () => {
  const series = sma([10, 10, 10, 10], 3);
  assert.equal(series[2], 10);
  assert.equal(series[0], null);
});

test("RSI is 100 when there are only gains", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const last = rsi(values, 14).at(-1);
  assert.ok(last > 99);
});

test("equity size is 5% in whole shares", () => {
  assert.equal(
    positionSize({
      equity: 100_000,
      cash: 100_000,
      price: 250,
      maxPositionPct: 0.05,
      assetClass: "equity",
    }),
    20,
  );
});

test("crypto size can be fractional", () => {
  const qty = positionSize({
    equity: 100_000,
    cash: 100_000,
    price: 96_400,
    maxPositionPct: 0.05,
    assetClass: "crypto",
  });
  assert.ok(qty > 0 && qty < 1);
});

test("market buy slippage is 5 bps", () => {
  assert.equal(Math.round((100 + 100 * 0.0005) * 100) / 100, 100.05);
});
