export type BarLike = {
  close: number;
};

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = [null];
  if (values.length < 2) return values.map(() => null);

  const gains: number[] = [];
  const losses: number[] = [];
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
        out.push(rsFrom(avgGain, avgLoss));
      } else {
        out.push(null);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      out.push(rsFrom(avgGain, avgLoss));
    }
  }
  return out;
}

function rsFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function lastNumber(series: Array<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

export function computeFromCloses(closes: number[]): {
  sma20: number | null;
  sma50: number | null;
  rsi: number | null;
  sma20Series: Array<number | null>;
  sma50Series: Array<number | null>;
  rsiSeries: Array<number | null>;
} {
  const sma20Series = sma(closes, 20);
  const sma50Series = sma(closes, 50);
  const rsiSeries = rsi(closes, 14);
  return {
    sma20: lastNumber(sma20Series),
    sma50: lastNumber(sma50Series),
    rsi: lastNumber(rsiSeries),
    sma20Series,
    sma50Series,
    rsiSeries,
  };
}
