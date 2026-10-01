import "server-only";
import { after } from "next/server";
import { cardKey, type AggregatedPrice, type CardLanguage, type CardRef, type GradeInfo, type PriceQuote, type PriceSource } from "@/lib/types";
import { gradeKey } from "@/lib/trade/math";
import { getFxRates, toUsd } from "@/lib/server/fx";
import { getPriceHistory, recordSnapshot } from "@/lib/server/db";
import { tcgdexQuotes } from "./tcgdex-prices";
import { priceChartingQuote } from "./pricecharting";
import { ebayQuote } from "./ebay";

// ════════════════════════════════════════════════════════════════════════════
// Price aggregation: fan out to every configured provider in parallel, convert
// to USD, pick a consensus value by language-aware source priority with an
// outlier guard, and attach trend + history.
// ════════════════════════════════════════════════════════════════════════════

/** Which market best reflects real trade value for each print language. */
const PRIORITY: Record<CardLanguage, PriceSource[]> = {
  EN: ["tcgplayer", "pricecharting", "cardmarket", "ebay"],
  JA: ["pricecharting", "ebay", "cardmarket", "tcgplayer"],
  KO: ["pricecharting", "ebay", "cardmarket", "tcgplayer"],
  "ZH-CN": ["pricecharting", "ebay", "cardmarket", "tcgplayer"],
  "ZH-TW": ["pricecharting", "ebay", "cardmarket", "tcgplayer"],
};

const PROVIDER_TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: AggregatedPrice }>();

function withTimeout<T>(p: Promise<T>, ms = PROVIDER_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getAggregatedPrice(
  card: CardRef,
  opts: { grade?: GradeInfo | null; fresh?: boolean; withHistory?: boolean } = {},
): Promise<AggregatedPrice> {
  const key = cardKey(card);
  const cacheKey = `${key}#${opts.grade ? gradeKey(opts.grade) : "raw"}#${opts.withHistory ? "h" : ""}`;
  const hit = cache.get(cacheKey);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const [fx, tcgdex, pc, ebay, history] = await Promise.all([
    getFxRates(),
    withTimeout(tcgdexQuotes(card)),
    withTimeout(priceChartingQuote(card)),
    withTimeout(ebayQuote(card)),
    opts.withHistory ? withTimeout(getPriceHistory(key), 3000) : Promise.resolve([]),
  ]);

  const raw: PriceQuote[] = [...(tcgdex ?? []), ...(pc ? [pc] : []), ...(ebay ? [ebay] : [])].filter((q) => q.market > 0);
  const quotes = raw.map((q) => ({ ...q, usd: r2(toUsd(q.market, q.currency, fx)) }));

  // ── consensus ────────────────────────────────────────────────────────────
  const order = PRIORITY[card.language];
  const ranked = [...quotes].sort((a, b) => {
    // Prefer quotes that matched the exact printing variant, then by language priority.
    if (a.variantMatched !== b.variantMatched) return a.variantMatched ? -1 : 1;
    return order.indexOf(a.source) - order.indexOf(b.source);
  });
  const primary = ranked[0] ?? null;
  let usd: number | null = primary?.usd ?? null;
  const all = quotes.map((q) => q.usd);
  if (primary && all.length >= 3) {
    const med = median(all);
    // Outlier guard: one stale/mismatched source shouldn't decide a trade.
    if (Math.abs(primary.usd - med) / med > 0.6) usd = med;
  }

  let confidence: AggregatedPrice["confidence"] = "none";
  if (usd != null) {
    const agreeing = quotes.filter((q) => Math.abs(q.usd - usd!) / usd! <= 0.25).length;
    confidence = !primary?.variantMatched ? "low" : agreeing >= 2 ? "high" : "medium";
  }

  // ── graded values ────────────────────────────────────────────────────────
  const gradedUsd: Record<string, number> = {};
  for (const q of quotes) {
    for (const [k, v] of Object.entries(q.graded ?? {})) gradedUsd[k] ??= r2(toUsd(v, q.currency, fx));
  }
  if (opts.grade && gradedUsd[gradeKey(opts.grade)] == null) {
    const g = await withTimeout(ebayQuote(card, opts.grade));
    if (g) gradedUsd[gradeKey(opts.grade)] = r2(toUsd(g.market, g.currency, fx));
  }

  // ── trends ───────────────────────────────────────────────────────────────
  const cm = quotes.find((q) => q.source === "cardmarket");
  let trend7dPct: number | null = null;
  let trend30dPct: number | null = null;
  const hist = history ?? [];
  if (hist.length >= 2 && usd != null) {
    const ago = (d: number) => {
      const cutoff = new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
      return [...hist].reverse().find((p) => p.date <= cutoff)?.usd;
    };
    const w = ago(7);
    const m = ago(30);
    if (w) trend7dPct = r2(((usd - w) / w) * 100);
    if (m) trend30dPct = r2(((usd - m) / m) * 100);
  }
  if (trend7dPct == null && cm?.avg1 && cm.avg7) trend7dPct = r2(((cm.avg1 - cm.avg7) / cm.avg7) * 100);
  if (trend30dPct == null && cm?.avg7 && cm.avg30) trend30dPct = r2(((cm.avg7 - cm.avg30) / cm.avg30) * 100);

  const value: AggregatedPrice = {
    cardKey: key,
    usd: usd == null ? null : r2(usd),
    gradedUsd,
    quotes,
    primarySource: primary?.source ?? null,
    trend7dPct,
    trend30dPct,
    history: hist,
    confidence,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  if (value.usd != null && !opts.grade) {
    // Every live lookup also feeds the price-history table (one row per card per day).
    const write = () => recordSnapshot(key, value.usd!, quotes.map((q) => ({ s: q.source, usd: q.usd }))).catch(() => {});
    try {
      after(write); // runs after the response is sent, kept alive by Vercel's waitUntil
    } catch {
      void write(); // outside a request scope (e.g. scripts)
    }
  }
  return value;
}
