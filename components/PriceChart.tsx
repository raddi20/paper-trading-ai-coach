"use client";

import { useMemo, useState } from "react";
import type { Bar } from "@/lib/types";

type Props = {
  bars: Bar[];
  sma20: Array<number | null>;
  sma50: Array<number | null>;
  rsi: Array<number | null>;
};

export function PriceChart({ bars, sma20, sma50, rsi }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const candleH = 240;
  const rsiH = 78;
  const padL = 8;
  const padR = 56;
  const padT = 12;
  const padB = 8;
  const innerW = width - padL - padR;

  const slice = bars.slice(-120);
  const s20 = sma20.slice(sma20.length - slice.length);
  const s50 = sma50.slice(sma50.length - slice.length);
  const rs = rsi.slice(rsi.length - slice.length);

  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < slice.length; i += 1) {
      lo = Math.min(lo, slice[i].low);
      hi = Math.max(hi, slice[i].high);
      if (s20[i] != null) lo = Math.min(lo, s20[i] as number);
      if (s50[i] != null) hi = Math.max(hi, s50[i] as number);
      if (s50[i] != null) lo = Math.min(lo, s50[i] as number);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1 };
    const pad = (hi - lo) * 0.06 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [slice, s20, s50]);

  const y = (price: number) =>
    padT + ((max - price) / (max - min || 1)) * candleH;
  const x = (i: number) => padL + ((i + 0.5) / slice.length) * innerW;
  const candleW = Math.max(2, (innerW / slice.length) * 0.62);

  const linePath = (series: Array<number | null>) => {
    let d = "";
    series.forEach((value, i) => {
      if (value == null) return;
      const cmd = d ? "L" : "M";
      d += `${cmd}${x(i)},${y(value)} `;
    });
    return d;
  };

  const rsiY = (value: number) => 8 + ((100 - value) / 100) * (rsiH - 16);
  const rsiPath = (() => {
    let d = "";
    rs.forEach((value, i) => {
      if (value == null) return;
      const cmd = d ? "L" : "M";
      d += `${cmd}${x(i)},${rsiY(value)} `;
    });
    return d;
  })();

  const idx = hover ?? slice.length - 1;
  const bar = slice[idx];
  const ticks = [max, (max + min) / 2, min];

  if (!slice.length) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-mute">
        No chart data yet.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-mute">
        <span className="tabular text-foreground">
          {bar.time} O {fmt(bar.open)} H {fmt(bar.high)} L {fmt(bar.low)} C {fmt(bar.close)}
        </span>
        <Legend color="#5eead4" label="SMA 20" />
        <Legend color="#f0c14a" label="SMA 50" />
        <span>RSI 14 (buy zone 40–65)</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${candleH + padT + padB + rsiH + 24}`}
        className="h-auto w-full"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Price chart with SMA 20, SMA 50, and RSI"
      >
        <rect width={width} height={candleH + padT + padB} fill="#10141c" rx="8" />
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#232b3b"
              strokeDasharray="3 6"
            />
            <text
              x={width - padR + 6}
              y={y(tick) + 4}
              fill="#8b96ab"
              fontSize="10"
              fontFamily="ui-monospace, monospace"
            >
              {fmt(tick)}
            </text>
          </g>
        ))}
        {slice.map((item, i) => {
          const up = item.close >= item.open;
          const color = up ? "#3ee0b0" : "#ff6b7a";
          const cx = x(i);
          return (
            <g
              key={item.time + i}
              onMouseEnter={() => setHover(i)}
              className="cursor-crosshair"
            >
              <line
                x1={cx}
                x2={cx}
                y1={y(item.high)}
                y2={y(item.low)}
                stroke={color}
                strokeWidth="1"
              />
              <rect
                x={cx - candleW / 2}
                y={y(Math.max(item.open, item.close))}
                width={candleW}
                height={Math.max(1, Math.abs(y(item.open) - y(item.close)))}
                fill={color}
              />
            </g>
          );
        })}
        <path d={linePath(s20)} fill="none" stroke="#5eead4" strokeWidth="1.4" />
        <path d={linePath(s50)} fill="none" stroke="#f0c14a" strokeWidth="1.6" />
        <g transform={`translate(0, ${candleH + padT + padB + 8})`}>
          <rect width={width} height={rsiH} fill="#10141c" rx="8" />
          <rect
            x={padL}
            y={rsiY(65)}
            width={innerW}
            height={Math.max(0, rsiY(40) - rsiY(65))}
            fill="#3ee0b0"
            opacity="0.08"
          />
          {[70, 50, 30].map((level) => (
            <g key={level}>
              <line
                x1={padL}
                x2={width - padR}
                y1={rsiY(level)}
                y2={rsiY(level)}
                stroke="#232b3b"
              />
              <text
                x={width - padR + 6}
                y={rsiY(level) + 3}
                fill="#8b96ab"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {level}
              </text>
            </g>
          ))}
          <path d={rsiPath} fill="none" stroke="#7aa2ff" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-0.5 w-4" style={{ background: color }} />
      {label}
    </span>
  );
}
