import { NextResponse } from "next/server";
import { acceptSignal, dismissSignal, buildState } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: number; action?: string };
    if (!body.id || !body.action) {
      return NextResponse.json({ error: "id and action required" }, { status: 400 });
    }
    const result =
      body.action === "accept" ? await acceptSignal(body.id) : dismissSignal(body.id);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    const state = await buildState();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signal update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
