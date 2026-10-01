import { NextResponse, type NextRequest } from "next/server";
import { requireDb, rowToBinder, type BinderRow } from "@/lib/server/db";
import { handle, jsonError } from "@/lib/server/http";
import { parseCondition, parseGrade, parseMoney, parseVariant } from "@/lib/server/validate";
import { cardKey } from "@/lib/types";

// PATCH  /api/binder/:id  body: any of { condition, grade (null clears), quantity, forTrade, notes, purchaseUsd, variant }
// DELETE /api/binder/:id

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const sb = requireDb();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("body required");

  const patch: Record<string, unknown> = {};
  if ("condition" in body) patch.condition = parseCondition(body.condition);
  if ("quantity" in body) patch.quantity = Math.max(1, Math.min(999, Number(body.quantity) || 1));
  if ("forTrade" in body) patch.for_trade = body.forTrade === true;
  if ("notes" in body) patch.notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
  if ("purchaseUsd" in body) patch.purchase_usd = parseMoney(body.purchaseUsd);
  if ("grade" in body) {
    const g = parseGrade(body.grade);
    patch.grading_company = g?.company ?? null;
    patch.grade = g?.grade ?? null;
    patch.last_priced_at = null; // force a re-price at the new grade
  }
  if ("variant" in body) {
    const v = parseVariant(body.variant);
    if (v) {
      const { data: cur } = await sb.from("binder_items").select("*").eq("id", id).single<BinderRow>();
      if (cur) {
        patch.variant = v;
        patch.card_key = cardKey({ catalogId: cur.catalog_id, nameEn: cur.name_en, number: cur.number, language: cur.language, variant: v });
        patch.last_priced_at = null;
      }
    }
  }

  const { data, error } = await sb.from("binder_items").update(patch).eq("id", id).select("*").single<BinderRow>();
  if (error) throw error;
  return NextResponse.json({ item: rowToBinder(data) });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const sb = requireDb();
  const { error } = await sb.from("binder_items").delete().eq("id", id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
