import { NextResponse } from "next/server";
import { getFxRates } from "@/lib/server/fx";

// GET /api/fx → FxRates (USD base; GBP, EUR, JPY). Cached for an hour at the edge.

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const fx = await getFxRates();
  return NextResponse.json(fx, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
