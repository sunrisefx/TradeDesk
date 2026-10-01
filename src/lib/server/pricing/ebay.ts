import "server-only";
import { env } from "@/lib/server/env";
import { parseCardNumber, type CardLanguage, type CardRef, type Currency, type GradeInfo, type PriceQuote } from "@/lib/types";

// ════════════════════════════════════════════════════════════════════════════
// eBay — the deepest market for Japanese / Korean / Chinese singles.
//
// • Default: Browse API (active Buy-It-Now listings) → robust median "asking" price.
// • If your app is approved for the Marketplace Insights API, set
//   EBAY_USE_MARKETPLACE_INSIGHTS=1 to use real SOLD prices (last 90 days).
//
// We deliberately do NOT scrape eBay's sold-listings HTML: it violates eBay's
// User Agreement and is blocked from Vercel's IP ranges anyway.
// ════════════════════════════════════════════════════════════════════════════

const CATEGORY_CCG_SINGLES = "183454";
const API = "https://api.ebay.com";

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!env.ebayClientId || !env.ebayClientSecret) return null;
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  const basic = Buffer.from(`${env.ebayClientId}:${env.ebayClientSecret}`).toString("base64");
  const scope = env.ebayInsights
    ? "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"
    : "https://api.ebay.com/oauth/api_scope";
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return token.value;
}

const LANG_QUERY: Record<CardLanguage, string> = {
  EN: "",
  JA: "japanese",
  KO: "korean",
  "ZH-CN": "chinese simplified",
  "ZH-TW": "chinese traditional",
};

const NOISE = /\b(lot|bundle|set of|proxy|custom|orica|fan ?made|digital|code card|online code|replica|metal|gold plated|jumbo|oversized|empty|sleeve only|choose|pick|you pick|mystery)\b/i;
const GRADED = /\b(psa|bgs|cgc|sgc|beckett|graded|slab|ace grading|tag grading)\b/i;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Drop outliers outside 1.5×IQR — eBay listings have wild asks and mislisted lots. */
function iqrTrim(xs: number[]): number[] {
  if (xs.length < 5) return xs;
  const s = [...xs].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  const iqr = q3 - q1;
  return s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
}

interface Listing {
  title: string;
  price: number;
  currency: string;
}

export async function ebayQuote(card: CardRef, grade: GradeInfo | null = null): Promise<PriceQuote | null> {
  const tok = await getToken();
  if (!tok || !card.nameEn) return null;
  const { local, total } = parseCardNumber(card.number);
  const numberTerm = local && total ? `${local.padStart(3, "0")}/${total.padStart(3, "0")}` : (local ?? "");
  const variantTerm =
    card.variant === "masterball" ? "master ball" : card.variant === "pokeball" ? "poke ball" : card.variant === "first-edition" ? "1st edition" : "";
  const gradeTerm = grade ? `${grade.company} ${grade.grade}` : "";
  const q = ["pokemon", LANG_QUERY[card.language], card.nameEn, numberTerm, variantTerm, gradeTerm].filter(Boolean).join(" ");

  const params = new URLSearchParams({ q, category_ids: CATEGORY_CCG_SINGLES, limit: "100" });
  const path = env.ebayInsights ? "/buy/marketplace_insights/v1_beta/item_sales/search" : "/buy/browse/v1/item_summary/search";
  if (!env.ebayInsights) params.set("filter", "buyingOptions:{FIXED_PRICE}");

  const res = await fetch(`${API}${path}?${params}`, {
    headers: { Authorization: `Bearer ${tok}`, "X-EBAY-C-MARKETPLACE-ID": env.ebayMarketplace },
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    itemSummaries?: { title: string; price?: { value: string; currency: string } }[];
    itemSales?: { title: string; lastSoldPrice?: { value: string; currency: string } }[];
  };

  const raw: Listing[] = (env.ebayInsights ? data.itemSales : data.itemSummaries)?.flatMap((it) => {
    const p = "lastSoldPrice" in it ? it.lastSoldPrice : "price" in it ? it.price : undefined;
    const v = p ? Number(p.value) : NaN;
    return Number.isFinite(v) && v > 0 && p ? [{ title: it.title, price: v, currency: p.currency }] : [];
  }) ?? [];

  const nameWord = card.nameEn.split(" ")[0].toLowerCase();
  const numRe = local ? new RegExp(`(^|\\D)0*${local}(\\D|$)`, "i") : null;
  const relevant = raw.filter((l) => {
    const t = l.title.toLowerCase();
    if (!t.includes(nameWord)) return false;
    if (numRe && !numRe.test(l.title)) return false;
    if (NOISE.test(l.title)) return false;
    if (grade) return t.includes(grade.company.toLowerCase()) && t.includes(String(grade.grade));
    return !GRADED.test(l.title);
  });

  // Use the dominant currency of the result set.
  const byCur = new Map<string, number[]>();
  for (const l of relevant) byCur.set(l.currency, [...(byCur.get(l.currency) ?? []), l.price]);
  const [currency, prices] = [...byCur.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ["USD", []];
  const trimmed = iqrTrim(prices);
  if (trimmed.length < 3) return null; // too thin to be meaningful

  const supported: Currency[] = ["USD", "GBP", "EUR", "JPY"];
  if (!supported.includes(currency as Currency)) return null;

  return {
    source: "ebay",
    label: env.ebayInsights ? "eBay sold (90d)" : "eBay asking (median)",
    currency: currency as Currency,
    market: median(trimmed),
    low: Math.min(...trimmed),
    high: Math.max(...trimmed),
    sampleSize: trimmed.length,
    kind: env.ebayInsights ? "sold" : "asking",
    variantMatched: true,
    url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`,
  };
}
