import { NextResponse } from "next/server";
import { sellPositionNow, buildState } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { symbol?: string };
    if (!body.symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }
    const result = await sellPositionNow(body.symbol.toUpperCase());
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    const state = await buildState();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sell failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
