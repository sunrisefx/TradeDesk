import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasDb } from "@/lib/server/env";
import type {
  BinderItem,
  CardLanguage,
  CardRef,
  Condition,
  GradingCompany,
  PricePoint,
  Variant,
  WishlistItem,
} from "@/lib/types";

let client: SupabaseClient | null = null;

/** Service-role client. Server-only; RLS denies the anon key everything. */
export function db(): SupabaseClient | null {
  if (!hasDb()) return null;
  client ??= createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export class DbNotConfiguredError extends Error {
  readonly code = "DB_NOT_CONFIGURED";
  readonly status = 503;
  constructor() {
    super("Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}

export function requireDb(): SupabaseClient {
  const c = db();
  if (!c) throw new DbNotConfiguredError();
  return c;
}

// ── Row mappers ─────────────────────────────────────────────────────────────

export interface BinderRow {
  id: string;
  card_key: string;
  catalog_id: string | null;
  catalog_lang: string | null;
  name: string;
  name_en: string;
  set_id: string | null;
  set_name: string | null;
  set_code: string | null;
  number: string | null;
  language: CardLanguage;
  rarity: string | null;
  variant: Variant;
  image_url: string | null;
  condition: Condition;
  grading_company: GradingCompany | null;
  grade: number | string | null;
  quantity: number;
  for_trade: boolean;
  purchase_usd: number | string | null;
  last_price_usd: number | string | null;
  last_priced_at: string | null;
  notes: string | null;
  created_at: string;
}

const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

export function rowToCard(r: Pick<BinderRow, "catalog_id" | "catalog_lang" | "name" | "name_en" | "set_id" | "set_name" | "set_code" | "number" | "language" | "rarity" | "variant" | "image_url">): CardRef {
  return {
    catalogId: r.catalog_id,
    catalogLang: r.catalog_lang,
    name: r.name,
    nameEn: r.name_en,
    setId: r.set_id,
    setName: r.set_name,
    setCode: r.set_code,
    number: r.number,
    language: r.language,
    rarity: r.rarity,
    variant: r.variant,
    imageUrl: r.image_url,
  };
}

export function rowToBinder(r: BinderRow): BinderItem {
  return {
    id: r.id,
    cardKey: r.card_key,
    card: rowToCard(r),
    condition: r.condition,
    grade: r.grading_company && r.grade != null ? { company: r.grading_company, grade: Number(r.grade) } : null,
    quantity: r.quantity,
    forTrade: r.for_trade,
    purchaseUsd: num(r.purchase_usd),
    lastPriceUsd: num(r.last_price_usd),
    lastPricedAt: r.last_priced_at,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export function cardToRow(card: CardRef) {
  return {
    catalog_id: card.catalogId,
    catalog_lang: card.catalogLang,
    name: card.name || card.nameEn,
    name_en: card.nameEn || card.name,
    set_id: card.setId,
    set_name: card.setName,
    set_code: card.setCode,
    number: card.number,
    language: card.language,
    rarity: card.rarity,
    variant: card.variant,
    image_url: card.imageUrl,
  };
}

export interface WishlistRow {
  id: string;
  card_key: string | null;
  catalog_id: string | null;
  name: string;
  name_en: string;
  set_name: string | null;
  number: string | null;
  language: CardLanguage | null;
  variant: Variant | null;
  image_url: string | null;
  max_price_usd: number | string | null;
  priority: 1 | 2 | 3;
  notes: string | null;
  created_at: string;
}

export function rowToWishlist(r: WishlistRow): WishlistItem {
  return {
    id: r.id,
    cardKey: r.card_key,
    catalogId: r.catalog_id,
    name: r.name,
    nameEn: r.name_en,
    setName: r.set_name,
    number: r.number,
    language: r.language,
    variant: r.variant,
    imageUrl: r.image_url,
    maxPriceUsd: num(r.max_price_usd),
    priority: r.priority,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

// ── Price history ───────────────────────────────────────────────────────────

export async function getPriceHistory(cardKey: string, days = 90): Promise<PricePoint[]> {
  const c = db();
  if (!c) return [];
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data } = await c
    .from("price_snapshots")
    .select("captured_on, usd")
    .eq("card_key", cardKey)
    .gte("captured_on", since)
    .order("captured_on", { ascending: true });
  return (data ?? []).map((r: { captured_on: string; usd: number | string }) => ({ date: r.captured_on, usd: Number(r.usd) }));
}

export async function recordSnapshot(cardKey: string, usd: number, sources: unknown): Promise<void> {
  const c = db();
  if (!c) return;
  await c
    .from("price_snapshots")
    .upsert({ card_key: cardKey, usd, sources, captured_on: new Date().toISOString().slice(0, 10) }, { onConflict: "card_key,captured_on" });
}
