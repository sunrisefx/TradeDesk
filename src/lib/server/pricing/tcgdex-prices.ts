import "server-only";
import type { CardRef, PriceQuote, Variant } from "@/lib/types";
import { getCard } from "../catalog/tcgdex";

// TCGdex embeds TCGplayer (USD, hourly) and Cardmarket (EUR, daily) prices in each card.
// These marketplaces price the ENGLISH/international print, so we only use them for EN cards —
// Japanese/Asian prints trade at very different prices and come from PriceCharting / eBay instead.

const TCGP_KEYS: Record<Variant, string[]> = {
  normal: ["normal", "unlimited", "unlimitednormal"],
  holo: ["holofoil", "holo", "unlimitedholofoil"],
  reverse: ["reverseholofoil", "reverse", "reverseholo"],
  pokeball: ["reverseholofoil", "reverse", "reverseholo"],
  masterball: ["reverseholofoil", "reverse", "reverseholo"],
  "first-edition": ["1steditionholofoil", "1stedition", "1steditionnormal", "firsteditionholofoil", "firstedition"],
  shadowless: ["unlimitedholofoil", "holofoil", "normal"],
  stamped: ["holofoil", "normal", "reverseholofoil"],
  other: [],
};

interface TcgpVariantPrice {
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  marketPrice?: number;
  directLowPrice?: number;
}

export async function tcgdexQuotes(card: CardRef): Promise<PriceQuote[]> {
  if (!card.catalogId || card.catalogLang !== "en" || card.language !== "EN") return [];
  const c = await getCard("en", card.catalogId, 900);
  if (!c?.pricing) return [];
  const quotes: PriceQuote[] = [];

  // ── TCGplayer ────────────────────────────────────────────────────────────
  const tp = c.pricing.tcgplayer;
  if (tp) {
    const entries = Object.entries(tp)
      .filter(([k, v]) => k !== "updated" && k !== "unit" && v && typeof v === "object")
      .map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ""), v as TcgpVariantPrice] as const)
      .filter(([, v]) => (v.marketPrice ?? v.midPrice ?? 0) > 0);

    const wanted = TCGP_KEYS[card.variant] ?? [];
    let hit = entries.find(([k]) => wanted.includes(k));
    // A card with a single printing (ex, SIR, full art) has exactly one key — that IS the variant.
    let matched = Boolean(hit) || entries.length === 1;
    if (!hit) hit = entries[0];
    // Poké Ball / Master Ball reverses are separate TCGplayer products; the generic reverse
    // price badly undervalues them, so mark it as a fallback.
    if (card.variant === "pokeball" || card.variant === "masterball") matched = false;

    if (hit) {
      const [, v] = hit;
      quotes.push({
        source: "tcgplayer",
        label: "TCGplayer market",
        currency: "USD",
        market: v.marketPrice ?? v.midPrice ?? 0,
        low: v.lowPrice,
        high: v.highPrice,
        kind: "market",
        variantMatched: matched,
        updatedAt: typeof tp.updated === "string" ? tp.updated : undefined,
        url: `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(`${c.name} ${c.localId}`)}`,
      });
    }
  }

  // ── Cardmarket ───────────────────────────────────────────────────────────
  const cm = c.pricing.cardmarket;
  if (cm) {
    const reverseLike = card.variant === "reverse" || card.variant === "pokeball" || card.variant === "masterball";
    const pick = (k: "avg" | "low" | "trend" | "avg1" | "avg7" | "avg30") =>
      (reverseLike ? (cm[`${k}-holo` as keyof typeof cm] as number | undefined) : undefined) ?? (cm[k] as number | undefined);
    const market = pick("trend") ?? pick("avg");
    if (market && market > 0) {
      quotes.push({
        source: "cardmarket",
        label: "Cardmarket trend",
        currency: "EUR",
        market,
        low: pick("low"),
        avg1: pick("avg1"),
        avg7: pick("avg7"),
        avg30: pick("avg30"),
        kind: "market",
        variantMatched: !reverseLike || cm["trend-holo"] != null,
        updatedAt: cm.updated,
        url: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name)}`,
      });
    }
  }

  return quotes;
}
