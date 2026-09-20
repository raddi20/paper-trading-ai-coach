"use client";

import type { EquitySnapshot } from "@/lib/types";
import { usd } from "@/lib/format";

export function EquityChart({ history }: { history: EquitySnapshot[] }) {
  const width = 640;
  const height = 180;
  const pad = { l: 8, r: 64, t: 12, b: 24 };
  if (!history.length) {
    return <p className="text-sm text-mute">Equity history starts after your first paper fill.</p>;
  }
  const values = history.map((h) => h.equity);
  const min = Math.min(...values) * 0.998;
  const max = Math.max(...values) * 1.002;
  const x = (i: number) =>
    pad.l + (history.length === 1 ? 0.5 : i / (history.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + ((max - v) / (max - min || 1)) * (height - pad.t - pad.b);
  const d = history
    .map((h, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(h.equity)}`)
    .join(" ");
  const last = history[history.length - 1];
  const up = last.equity >= history[0].equity;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Paper portfolio value over time">
      <rect width={width} height={height} fill="#10141c" rx="8" />
      <path d={`${d} L${x(history.length - 1)},${height - pad.b} L${x(0)},${height - pad.b} Z`} fill={up ? "#3ee0b01a" : "#ff6b7a1a"} />
      <path d={d} fill="none" stroke={up ? "#3ee0b0" : "#ff6b7a"} strokeWidth="2" />
      {history.length === 1 ? (
        <circle cx={x(0)} cy={y(history[0].equity)} r="4" fill="#3ee0b0" />
      ) : null}
      <text x={width - pad.r + 8} y={y(last.equity) + 4} fill="#eef1f6" fontSize="11" fontFamily="ui-monospace, monospace">
        {usd(last.equity, 0)}
      </text>
    </svg>
  );
}
