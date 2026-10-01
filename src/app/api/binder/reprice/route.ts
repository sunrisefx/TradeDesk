import { NextResponse } from "next/server";
import { handle } from "@/lib/server/http";
import { repriceBinder } from "@/lib/server/reprice";

// POST /api/binder/reprice → refresh the stalest binder values now (the "Refresh values" button).

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = handle(async () => {
  const result = await repriceBinder(40, 45_000);
  return NextResponse.json(result);
});
