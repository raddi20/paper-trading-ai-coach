import { NextResponse } from "next/server";
import { COACH_STARTER_PROMPTS, DISCLAIMER } from "@/lib/constants";
import { clearCoachMessages } from "@/lib/db";
import { listChat, sendChat } from "@/lib/coach-chat";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await listChat();
    return NextResponse.json({
      ...data,
      starters: COACH_STARTER_PROMPTS,
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load coach chat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: unknown;
      focusSymbol?: unknown;
    };
    const message = typeof body.message === "string" ? body.message : "";
    const focusSymbol = typeof body.focusSymbol === "string" ? body.focusSymbol : null;
    const data = await sendChat({ message, focusSymbol });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not answer.";
    const status = message.startsWith("Type a question") || message.startsWith("Keep questions")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  try {
    clearCoachMessages();
    const data = await listChat();
    return NextResponse.json({
      ...data,
      starters: COACH_STARTER_PROMPTS,
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not clear chat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
