import { NextResponse } from "next/server";
import { getChart } from "@/lib/market-data";
import { getPosition } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await context.params;
    const chart = await getChart(symbol.toUpperCase());
    if (!chart) {
      return NextResponse.json({ error: "Unknown symbol" }, { status: 404 });
    }
    chart.position = getPosition(chart.symbol) ?? null;
    return NextResponse.json(chart);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chart unavailable.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
