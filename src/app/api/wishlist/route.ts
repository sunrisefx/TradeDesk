import { NextResponse, type NextRequest } from "next/server";
import { requireDb, rowToWishlist, type WishlistRow } from "@/lib/server/db";
import { handle, jsonError } from "@/lib/server/http";
import { parseCard, parseMoney } from "@/lib/server/validate";
import { cardKey } from "@/lib/types";

// GET  /api/wishlist → { items: WishlistItem[] }
// POST /api/wishlist  body: { card, anyLanguage?, anyVariant?, maxPriceUsd?, priority?, notes? }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sb = requireDb();
  const { data, error } = await sb.from("wishlist_items").select("*").order("priority").order("created_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ items: (data as WishlistRow[]).map(rowToWishlist) });
});

export const POST = handle(async (req: NextRequest) => {
  const sb = requireDb();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const card = parseCard(body?.card);
  if (!card) return jsonError("card required");
  const priority = [1, 2, 3].includes(Number(body?.priority)) ? Number(body?.priority) : 2;
  const { data, error } = await sb
    .from("wishlist_items")
    .insert({
      card_key: cardKey(card),
      catalog_id: card.catalogId,
      name: card.name,
      name_en: card.nameEn,
      set_name: card.setName,
      number: card.number,
      language: body?.anyLanguage === true ? null : card.language,
      variant: body?.anyVariant === true ? null : card.variant,
      image_url: card.imageUrl,
      max_price_usd: parseMoney(body?.maxPriceUsd),
      priority,
      notes: typeof body?.notes === "string" ? body.notes.slice(0, 500) : null,
    })
    .select("*")
    .single<WishlistRow>();
  if (error) throw error;
  return NextResponse.json({ item: rowToWishlist(data) }, { status: 201 });
});
