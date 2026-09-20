import { NextResponse } from "next/server";
import { completeOnboarding } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const state = await completeOnboarding();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onboarding failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
