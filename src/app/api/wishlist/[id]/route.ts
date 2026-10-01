import { NextResponse, type NextRequest } from "next/server";
import { requireDb } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

// DELETE /api/wishlist/:id

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { error } = await requireDb().from("wishlist_items").delete().eq("id", id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
