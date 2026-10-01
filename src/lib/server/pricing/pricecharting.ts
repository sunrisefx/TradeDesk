import "server-only";
import { env } from "@/lib/server/env";
import { parseCardNumber, type CardLanguage, type CardRef, type PriceQuote, type Variant } from "@/lib/types";

// ════════════════════════════════════════════════════════════════════════════
// PriceCharting API (https://www.pricecharting.com/api-documentation)
// Sold-listing–based prices; covers Japanese, Korean and Chinese Pokémon sets
// plus graded values. Requires a paid subscription token.
// All prices are returned in US cents.
// ════════════════════════════════════════════════════════════════════════════

interface PcProduct {
  id: string;
  "product-name": string;
  "console-name": string;
  "loose-price"?: number; // ungraded
  "cib-price"?: number; // grade 7 / 7.5
  "new-price"?: number; // grade 8 / 8.5
  "graded-price"?: number; // grade 9
  "box-only-price"?: number; // grade 9.5
  "manual-only-price"?: number; // PSA 10
  "bgs-10-price"?: number;
  "condition-17-price"?: number; // CGC 10
  "condition-18-price"?: number; // SGC 10
  "sales-volume"?: string | number;
}

const LANG_WORD: Record<CardLanguage, string | null> = {
  EN: null,
  JA: "japanese",
  KO: "korean",
  "ZH-CN": "chinese",
  "ZH-TW": "chinese",
};

const VARIANT_WORDS: Partial<Record<Variant, string>> = {
  reverse: "reverse holo",
  pokeball: "poke ball",
  masterball: "master ball",
  "first-edition": "1st edition",
  shadowless: "shadowless",
};

const cents = (v?: number) => (typeof v === "number" && v > 0 ? v / 100 : undefined);

function scoreProduct(p: PcProduct, card: CardRef, local: string | null): number {
  const name = p["product-name"].toLowerCase();
  const consoleName = p["console-name"].toLowerCase();
  if (!consoleName.includes("pokemon")) return -1;
  const lw = LANG_WORD[card.language];
  if (lw ? !consoleName.includes(lw) : /japanese|chinese|korean/.test(consoleName)) return -1;

  let s = 0;
  if (local && new RegExp(`#0*${local.toLowerCase()}(\\b|$)`).test(name)) s += 50;
  const nameEn = card.nameEn.toLowerCase();
  if (nameEn && name.startsWith(nameEn.split(" ")[0])) s += 15;
  if (nameEn && name.includes(nameEn)) s += 10;
  if (card.setName && consoleName.includes(card.setName.toLowerCase())) s += 15;

  const vw = VARIANT_WORDS[card.variant];
  const hasVariantTag = /reverse|master ball|poke ?ball|1st edition|shadowless/.test(name);
  if (vw) s += name.includes(vw) ? 20 : -20;
  else if (hasVariantTag) s -= 25; // we want the plain printing
  return s;
}

export async function priceChartingQuote(card: CardRef): Promise<PriceQuote | null> {
  if (!env.priceChartingToken || !card.nameEn) return null;
  const { local } = parseCardNumber(card.number);
  const terms = [
    "pokemon",
    LANG_WORD[card.language],
    card.nameEn,
    local,
    VARIANT_WORDS[card.variant],
  ].filter(Boolean);
  const url = `https://www.pricecharting.com/api/products?t=${encodeURIComponent(env.priceChartingToken)}&q=${encodeURIComponent(terms.join(" "))}`;

  const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: string; products?: PcProduct[] };
  if (data.status !== "success" || !data.products?.length) return null;

  const ranked = data.products
    .map((p) => ({ p, s: scoreProduct(p, card, local) }))
    .filter((x) => x.s >= 50) // must at least match the collector number
    .sort((a, b) => b.s - a.s);
  const best = ranked[0]?.p;
  if (!best) return null;

  const loose = cents(best["loose-price"]);
  if (!loose) return null;

  const graded: Record<string, number> = {};
  const add = (k: string, v?: number) => {
    const c = cents(v);
    if (c) graded[k] = c;
  };
  add("7", best["cib-price"]);
  add("8", best["new-price"]);
  add("9", best["graded-price"]);
  add("9.5", best["box-only-price"]);
  add("PSA 10", best["manual-only-price"]);
  add("BGS 10", best["bgs-10-price"]);
  add("CGC 10", best["condition-17-price"]);
  add("SGC 10", best["condition-18-price"]);

  return {
    source: "pricecharting",
    label: "PriceCharting (sold)",
    currency: "USD",
    market: loose,
    graded,
    kind: "sold",
    variantMatched: true,
    sampleSize: typeof best["sales-volume"] === "number" ? best["sales-volume"] : Number(best["sales-volume"]) || undefined,
    url: `https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(`${best["console-name"]} ${best["product-name"]}`)}`,
  };
}
