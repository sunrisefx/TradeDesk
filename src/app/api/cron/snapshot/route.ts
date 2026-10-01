import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/server/env";
import { jsonError, handle } from "@/lib/server/http";
import { repriceBinder } from "@/lib/server/reprice";
import { hasDb } from "@/lib/server/env";

// GET /api/cron/snapshot — called daily by Vercel Cron (see vercel.json).
// Re-prices the binder, which also writes one price_snapshots row per card per day,
// building the historical price chart over time.

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return jsonError("unauthorized", 401);
  }
  if (!hasDb()) return NextResponse.json({ skipped: "no database" });
  const result = await repriceBinder(400, 270_000);
  return NextResponse.json({ ok: true, ...result });
});
