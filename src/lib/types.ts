// ════════════════════════════════════════════════════════════════════════════
// Shared domain types — imported by both server routes and client components.
// ════════════════════════════════════════════════════════════════════════════

export type CardLanguage = "EN" | "JA" | "KO" | "ZH-CN" | "ZH-TW";

export const LANGUAGES: { code: CardLanguage; label: string; short: string }[] = [
  { code: "EN", label: "English", short: "EN" },
  { code: "JA", label: "Japanese", short: "日本" },
  { code: "KO", label: "Korean", short: "한국" },
  { code: "ZH-CN", label: "Simplified Chinese", short: "简体" },
  { code: "ZH-TW", label: "Traditional Chinese", short: "繁體" },
];

/** Printing variant — how the card was printed, independent of rarity. */
export type Variant =
  | "normal"
  | "holo"
  | "reverse"
  | "pokeball"
  | "masterball"
  | "first-edition"
  | "shadowless"
  | "stamped"
  | "other";

export const VARIANTS: { id: Variant; label: string; short: string }[] = [
  { id: "normal", label: "Normal", short: "Norm" },
  { id: "holo", label: "Holo", short: "Holo" },
  { id: "reverse", label: "Reverse Holo", short: "Rev" },
  { id: "pokeball", label: "Poké Ball Reverse", short: "PB" },
  { id: "masterball", label: "Master Ball Reverse", short: "MB" },
  { id: "first-edition", label: "1st Edition", short: "1st" },
  { id: "shadowless", label: "Shadowless", short: "SL" },
  { id: "stamped", label: "Stamped / Promo", short: "Stamp" },
  { id: "other", label: "Other", short: "Other" },
];

export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";
export const CONDITIONS: Condition[] = ["NM", "LP", "MP", "HP", "DMG"];

export type Currency = "USD" | "GBP" | "EUR" | "JPY";
export const CURRENCIES: Currency[] = ["USD", "GBP", "EUR", "JPY"];

export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC" | "ACE" | "TAG" | "OTHER";

/** A fully identified card print. Everything in the app references cards through this. */
export interface CardRef {
  catalogId: string | null; // TCGdex id, e.g. "sv03.5-025"; null when unmatched
  catalogLang: string | null; // TCGdex language code used for the match, e.g. "ja"
  name: string; // as printed (localized)
  nameEn: string; // English equivalent
  setId: string | null;
  setName: string | null;
  setCode: string | null; // printed set code, e.g. "MEW", "SV2a"
  number: string | null; // as printed, e.g. "025/165"
  language: CardLanguage;
  rarity: string | null;
  variant: Variant;
  imageUrl: string | null;
}

export interface GradeInfo {
  company: GradingCompany;
  grade: number;
}

/** Raw output of the vision model before catalog resolution. */
export interface ScanIdentity {
  nameLocalized: string | null;
  nameEnglish: string | null;
  setName: string | null;
  setCode: string | null;
  cardNumber: string | null;
  language: CardLanguage | null;
  rarity: string | null;
  variant: Variant | null;
  isGraded: boolean;
  gradingCompany: GradingCompany | null;
  grade: number | null;
  confidence: number; // 0..1
  notes: string | null;
}

export interface CatalogMatch {
  card: CardRef;
  score: number; // 0..100 match quality
  reason: string;
}

export type PriceSource = "tcgplayer" | "cardmarket" | "pricecharting" | "ebay";

export interface PriceQuote {
  source: PriceSource;
  label: string;
  currency: Currency;
  market: number; // in `currency`
  low?: number;
  high?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
  graded?: Record<string, number>; // "PSA 10" | "9" | "9.5" ... → value in `currency`
  sampleSize?: number;
  kind: "market" | "sold" | "asking";
  variantMatched: boolean; // false when we had to fall back to another variant's price
  updatedAt?: string;
  url?: string;
}

export interface PricePoint {
  date: string; // YYYY-MM-DD
  usd: number;
}

export interface AggregatedPrice {
  cardKey: string;
  usd: number | null; // consensus raw (ungraded NM) market value
  gradedUsd: Record<string, number>;
  quotes: (PriceQuote & { usd: number })[];
  primarySource: PriceSource | null;
  trend7dPct: number | null;
  trend30dPct: number | null;
  history: PricePoint[];
  confidence: "high" | "medium" | "low" | "none";
  fetchedAt: string;
}

export interface FxRates {
  base: "USD";
  rates: Record<Currency, number>;
  updatedAt: string;
  stale: boolean;
}

export interface BinderItem {
  id: string;
  cardKey: string;
  card: CardRef;
  condition: Condition;
  grade: GradeInfo | null;
  quantity: number;
  forTrade: boolean;
  purchaseUsd: number | null;
  lastPriceUsd: number | null;
  lastPricedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface WishlistItem {
  id: string;
  cardKey: string | null;
  catalogId: string | null;
  name: string;
  nameEn: string;
  setName: string | null;
  number: string | null;
  language: CardLanguage | null; // null = any
  variant: Variant | null; // null = any
  imageUrl: string | null;
  maxPriceUsd: number | null;
  priority: 1 | 2 | 3;
  notes: string | null;
  createdAt: string;
}

export type TradeSide = "offer" | "receive";

export interface TradeLine {
  id: string;
  side: TradeSide;
  card: CardRef;
  condition: Condition;
  grade: GradeInfo | null;
  quantity: number;
  source: "binder" | "scan" | "search";
  binderItemId: string | null;
  price: AggregatedPrice | null;
  priceStatus: "idle" | "loading" | "ready" | "error";
  /** Dealer sticker / agreed price in USD. Overrides market & condition weighting. */
  overrideUsd: number | null;
}

export interface TradePreset {
  id: string;
  label: string;
  description: string;
  offerPct: number; // % of market you get for YOUR cards
  receivePct: number; // % of market you pay for THEIR cards
}

export type Equity = "favorable" | "fair" | "unfavorable" | "empty";

export interface TradeRecordSummary {
  id: string;
  createdAt: string;
  location: string | null;
  counterparty: string | null;
  presetLabel: string;
  offeredTotalUsd: number;
  receivedTotalUsd: number;
  cashDeltaUsd: number;
  netUsd: number;
  equity: Equity;
  lines: { side: TradeSide; card: CardRef; condition: Condition; quantity: number; adjustedUsd: number }[];
}

// ── helpers ─────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable identity of a specific printing (not of a physical copy). */
export function cardKey(card: Pick<CardRef, "catalogId" | "nameEn" | "number" | "language" | "variant">): string {
  const base = card.catalogId ?? `${slug(card.nameEn)}~${(card.number ?? "").replace(/\s+/g, "")}`;
  return `${base}|${card.language}|${card.variant}`;
}

/** Key for a price lookup (a graded copy prices differently from a raw one). */
export function priceKey(card: CardRef, grade: GradeInfo | null): string {
  return grade ? `${cardKey(card)}#${grade.company}${grade.grade}` : cardKey(card);
}

/** "025/165" → { local: "25", total: "165" }; "SVP 085" → { local: "85", total: null, prefix: "SVP" } */
export function parseCardNumber(raw: string | null | undefined): { local: string | null; total: string | null; prefix: string | null } {
  if (!raw) return { local: null, total: null, prefix: null };
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const slash = s.match(/^([A-Z-]*)\s*0*([0-9]+[A-Z]?)\s*\/\s*([A-Z0-9-]+)$/);
  if (slash) return { prefix: slash[1] || null, local: slash[2], total: slash[3].replace(/^0+(?=\d)/, "") };
  const promo = s.match(/^([A-Z-]+)\s*-?\s*0*([0-9]+[A-Z]?)$/);
  if (promo) return { prefix: promo[1], local: promo[2], total: null };
  const bare = s.match(/^0*([0-9]+[A-Z]?)$/);
  if (bare) return { prefix: null, local: bare[1], total: null };
  return { local: s.replace(/^0+(?=\d)/, ""), total: null, prefix: null };
}

export function stripLeadingZeros(s: string): string {
  return s.replace(/^0+(?=[0-9])/, "");
}

export function emptyCard(partial: Partial<CardRef> = {}): CardRef {
  return {
    catalogId: null,
    catalogLang: null,
    name: "",
    nameEn: "",
    setId: null,
    setName: null,
    setCode: null,
    number: null,
    language: "EN",
    rarity: null,
    variant: "normal",
    imageUrl: null,
    ...partial,
  };
}
