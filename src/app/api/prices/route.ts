import { NextResponse, type NextRequest } from "next/server";
import { getAggregatedPrice } from "@/lib/server/pricing/aggregate";
import { handle, jsonError } from "@/lib/server/http";
import { parseCard, parseGrade } from "@/lib/server/validate";
import { priceKey, type AggregatedPrice } from "@/lib/types";

// POST /api/prices
// body: { items: [{ card: CardRef, grade?: { company, grade } }], fresh?: boolean, history?: boolean }
// → { prices: { [cardKey(+grade)]: AggregatedPrice } }
// Batched so a whole trade (or a binder page) prices in one round trip.

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_ITEMS = 30;
const CONCURRENCY = 6;

export const POST = handle(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { items?: unknown[]; fresh?: boolean; history?: boolean } | null;
  const items = Array.isArray(body?.items) ? body!.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return jsonError("items[] required");

  const parsed = items
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const card = parseCard(o.card);
      return card ? { card, grade: parseGrade(o.grade) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const prices: Record<string, AggregatedPrice> = {};
  let i = 0;
  async function worker() {
    while (i < parsed.length) {
      const { card, grade } = parsed[i++];
      const key = priceKey(card, grade);
      prices[key] = await getAggregatedPrice(card, { grade, fresh: body?.fresh === true, withHistory: body?.history === true });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, parsed.length) }, worker));
  return NextResponse.json({ prices });
});
