export function usd(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function pct(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function signedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${usd(Math.abs(value))}`;
}

export function qtyLabel(qty: number, assetClass: "equity" | "crypto"): string {
  if (assetClass === "crypto") {
    return qty.toLocaleString("en-US", {
      maximumFractionDigits: 6,
    });
  }
  return qty.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function compactTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayKey(iso = new Date().toISOString()): string {
  return iso.slice(0, 10);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function roundPrice(price: number, assetClass: "equity" | "crypto"): number {
  const digits = assetClass === "crypto" && price < 100 ? 4 : 2;
  const factor = 10 ** digits;
  return Math.round(price * factor) / factor;
}

export function roundQty(qty: number, assetClass: "equity" | "crypto"): number {
  if (assetClass === "equity") return Math.floor(qty);
  return Math.floor(qty * 1_000_000) / 1_000_000;
}

export function pnlClass(value: number): string {
  if (value > 0) return "text-mint";
  if (value < 0) return "text-rose";
  return "text-mute";
}
