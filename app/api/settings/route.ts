import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db";
import { buildState } from "@/lib/engine";
import type { TradingMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<{
      tradingMode: TradingMode;
      maxPositionPct: number;
      maxDailyLossPct: number;
      maxOpenPositions: number;
      stopLossPct: number;
      takeProfitPct: number;
    }>;
    const patch: Parameters<typeof updateSettings>[0] = {};
    if (body.tradingMode === "manual" || body.tradingMode === "auto") {
      patch.tradingMode = body.tradingMode;
    }
    if (isPct(body.maxPositionPct)) patch.maxPositionPct = body.maxPositionPct;
    if (isPct(body.maxDailyLossPct)) patch.maxDailyLossPct = body.maxDailyLossPct;
    if (typeof body.maxOpenPositions === "number" && body.maxOpenPositions >= 1 && body.maxOpenPositions <= 20) {
      patch.maxOpenPositions = Math.round(body.maxOpenPositions);
    }
    if (isPct(body.stopLossPct)) patch.stopLossPct = body.stopLossPct;
    if (isPct(body.takeProfitPct)) patch.takeProfitPct = body.takeProfitPct;
    updateSettings(patch);
    const state = await buildState();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isPct(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 0.5;
}
