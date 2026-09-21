import type { CoachLead } from "./types";

export function isSafeHref(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return false;
  try {
    const url = new URL(href, "http://paper.local");
    if (url.origin !== "http://paper.local") return false;
    const allowed = new Set(["/", "/markets", "/journal", "/settings", "/coach"]);
    return allowed.has(url.pathname);
  } catch {
    return false;
  }
}

export function sanitizeLeads(leads: unknown): CoachLead[] {
  if (!Array.isArray(leads)) return [];
  const out: CoachLead[] = [];
  for (const item of leads) {
    if (!item || typeof item !== "object") continue;
    const label = (item as CoachLead).label;
    const href = (item as CoachLead).href;
    if (typeof label !== "string" || typeof href !== "string") continue;
    if (!isSafeHref(href)) continue;
    const trimmed = label.trim().slice(0, 80);
    if (!trimmed) continue;
    out.push({ label: trimmed, href });
    if (out.length >= 3) break;
  }
  return out;
}
