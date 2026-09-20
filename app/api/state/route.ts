import { NextResponse } from "next/server";
import { buildState } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await buildState();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load paper account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
