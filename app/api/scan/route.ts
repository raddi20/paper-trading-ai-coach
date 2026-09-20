import { NextResponse } from "next/server";
import { runScan, buildState } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runScan({ ensureDemo: true });
    const state = await buildState();
    return NextResponse.json({ ...result, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
