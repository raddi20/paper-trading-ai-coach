import { NextResponse } from "next/server";
import { listJournal } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "all";
  const symbol = url.searchParams.get("symbol") ?? undefined;
  const entries = listJournal({ type, symbol, limit: 300 });
  return NextResponse.json({ entries });
}
