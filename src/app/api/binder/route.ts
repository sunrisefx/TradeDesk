import { NextResponse, type NextRequest } from "next/server";
import { cardToRow, requireDb, rowToBinder, type BinderRow } from "@/lib/server/db";
import { handle, jsonError } from "@/lib/server/http";
import { parseCard, parseCondition, parseGrade, parseMoney } from "@/lib/server/validate";
import { cardKey } from "@/lib/types";

// GET  /api/binder            → { items: BinderItem[] }
// POST /api/binder            body: { card, condition?, grade?, quantity?, forTrade?, purchaseUsd?, priceUsd? }
//                             → { item } (merges into an identical existing copy by bumping quantity)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sb = requireDb();
  const { data, error } = await sb.from("binder_items").select("*").order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;
  return NextResponse.json({ items: (data as BinderRow[]).map(rowToBinder) });
});

export const POST = handle(async (req: NextRequest) => {
  const sb = requireDb();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const card = parseCard(body?.card);
  if (!card) return jsonError("card required");
  const condition = parseCondition(body?.condition);
  const grade = parseGrade(body?.grade);
  const quantity = Math.max(1, Math.min(999, Number(body?.quantity) || 1));
  const key = cardKey(card);

  // Same print, same condition, same grade → just bump the count.
  let q = sb.from("binder_items").select("*").eq("card_key", key).eq("condition", condition);
  q = grade ? q.eq("grading_company", grade.company).eq("grade", grade.grade) : q.is("grading_company", null);
  const { data: existing } = await q.limit(1).maybeSingle<BinderRow>();

  if (existing) {
    const { data, error } = await sb
      .from("binder_items")
      .update({ quantity: existing.quantity + quantity })
      .eq("id", existing.id)
      .select("*")
      .single<BinderRow>();
    if (error) throw error;
    return NextResponse.json({ item: rowToBinder(data), merged: true });
  }

  const priceUsd = parseMoney(body?.priceUsd);
  const { data, error } = await sb
    .from("binder_items")
    .insert({
      ...cardToRow(card),
      card_key: key,
      condition,
      grading_company: grade?.company ?? null,
      grade: grade?.grade ?? null,
      quantity,
      for_trade: body?.forTrade !== false,
      purchase_usd: parseMoney(body?.purchaseUsd),
      last_price_usd: priceUsd,
      last_priced_at: priceUsd != null ? new Date().toISOString() : null,
    })
    .select("*")
    .single<BinderRow>();
  if (error) throw error;
  return NextResponse.json({ item: rowToBinder(data), merged: false }, { status: 201 });
});
