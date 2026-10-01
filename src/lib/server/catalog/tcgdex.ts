import "server-only";
import type { CardLanguage } from "@/lib/types";

// ════════════════════════════════════════════════════════════════════════════
// TCGdex — free, open-source, multilingual Pokémon TCG catalog (no API key).
// https://tcgdex.dev  ·  Card objects embed Cardmarket (EUR) + TCGplayer (USD) pricing.
// ════════════════════════════════════════════════════════════════════════════

const BASE = "https://api.tcgdex.net/v2";

/** Our language → TCGdex language code. KO and ZH-CN coverage is still growing upstream. */
export const TCGDEX_LANG: Record<CardLanguage, string> = {
  EN: "en",
  JA: "ja",
  KO: "ko",
  "ZH-TW": "zh-tw",
  "ZH-CN": "zh-cn",
};

export interface TcgdexBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgdexSetBrief {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
}

export interface TcgdexPricing {
  cardmarket?: {
    updated?: string;
    unit?: string;
    avg?: number;
    low?: number;
    trend?: number;
    avg1?: number;
    avg7?: number;
    avg30?: number;
    "avg-holo"?: number;
    "low-holo"?: number;
    "trend-holo"?: number;
    "avg1-holo"?: number;
    "avg7-holo"?: number;
    "avg30-holo"?: number;
  } | null;
  tcgplayer?: ({
    updated?: string;
    unit?: string;
  } & Record<string, unknown>) | null;
}

export interface TcgdexCard extends TcgdexBrief {
  set: TcgdexSetBrief;
  rarity?: string;
  variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean; wPromo?: boolean };
  pricing?: TcgdexPricing;
}

async function tget<T>(path: string, revalidateSec: number): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: revalidateSec },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function tcgdexImage(base: string | undefined | null, quality: "low" | "high" = "high"): string | null {
  if (!base) return null;
  return `${base}/${quality}.webp`;
}

/** Set id is everything before the last "-" in a card id ("sv03.5-025" → "sv03.5"). */
export function setIdFromCardId(id: string): string {
  const i = id.lastIndexOf("-");
  return i > 0 ? id.slice(0, i) : id;
}

export async function listSets(lang: string): Promise<Map<string, TcgdexSetBrief>> {
  const sets = (await tget<TcgdexSetBrief[]>(`/${lang}/sets`, 86400)) ?? [];
  return new Map(sets.map((s) => [s.id, s]));
}

export async function searchCards(
  lang: string,
  params: { name?: string; localId?: string; limit?: number },
): Promise<TcgdexBrief[]> {
  const q = new URLSearchParams();
  if (params.name) q.set("name", params.name);
  if (params.localId) q.set("localId", params.localId);
  q.set("pagination:page", "1");
  q.set("pagination:itemsPerPage", String(params.limit ?? 60));
  q.set("sort:field", "id"); // deterministic; release-date sort is applied client-side per set
  q.set("sort:order", "DESC");
  return (await tget<TcgdexBrief[]>(`/${lang}/cards?${q.toString()}`, 3600)) ?? [];
}

export async function getCard(lang: string, id: string, revalidateSec = 900): Promise<TcgdexCard | null> {
  return tget<TcgdexCard>(`/${lang}/cards/${encodeURIComponent(id)}`, revalidateSec);
}

/** Strip TCG mechanics suffixes so a laxist name search matches "リザードンex", "Charizard ex", "Pikachu VMAX". */
export function baseSearchName(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/\b(VMAX|VSTAR|V-UNION|GX|EX|ex|V|BREAK|LV\.?\s?X|Prism Star|δ|☆|TAG TEAM)\b/g, " ")
    .replace(/(ex|EX|GX|VMAX|VSTAR|V|ｅｘ|ＧＸ)$/u, "")
    .replace(/^(Radiant|Shining|Dark|Light|Alolan|Galarian|Hisuian|Paldean|[A-Z][a-z]+'s)\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}
