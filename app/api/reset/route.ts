import { NextResponse } from "next/server";
import { addJournal, resetPaperAccount } from "@/lib/db";
import { buildState } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  resetPaperAccount();
  addJournal({
    type: "system",
    title: "Paper account reset",
    body: "Back to $100,000 cash, no positions, Manual mode. Still not real money.",
  });
  const state = await buildState();
  return NextResponse.json(state);
}
