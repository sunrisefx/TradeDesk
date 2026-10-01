// ════════════════════════════════════════════════════════════════════════════
// Trade math — pure functions, no React, unit-tested in tests/trade-math.test.ts
// ════════════════════════════════════════════════════════════════════════════
import type { Condition, Equity, GradeInfo, TradeLine, TradePreset, TradeSide } from "../types.ts";

/** Standard raw-card condition multipliers vs Near Mint market. Editable in Settings. */
export const DEFAULT_CONDITION_WEIGHTS: Record<Condition, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.7,
  HP: 0.5,
  DMG: 0.3,
};

export const PRESETS: TradePreset[] = [
  {
    id: "straight",
    label: "1:1 Market",
    description: "Collector-to-collector. Both sides at full market value.",
    offerPct: 100,
    receivePct: 100,
  },
  {
    id: "store-credit",
    label: "Store Credit 80%",
    description: "Shop trade-in: your cards at 80% of market, theirs at 100%.",
    offerPct: 80,
    receivePct: 100,
  },
  {
    id: "shop-cash",
    label: "Shop Cash 70%",
    description: "Selling for cash: your cards at 70% of market.",
    offerPct: 70,
    receivePct: 100,
  },
  {
    id: "show-dealer",
    label: "Show Dealer 85/110",
    description: "Convention dealer: 85% for yours, case prices ~110% of market.",
    offerPct: 85,
    receivePct: 110,
  },
];

export interface TradeSettings {
  preset: TradePreset;
  conditionWeights: Record<Condition, number>;
  /** ±% band around zero that still counts as a "fair" trade. */
  fairBandPct: number;
}

/** Key used in AggregatedPrice.gradedUsd. Gem-mint 10s differ by company; lower grades are pooled. */
export function gradeKey(grade: GradeInfo): string {
  return grade.grade >= 10 ? `${grade.company} 10` : `${grade.grade}`;
}

export interface LineValue {
  /** Unadjusted NM market (or graded market) for the full quantity, USD. null = unpriced. */
  marketUsd: number | null;
  /** After condition + preset, for the full quantity, USD. */
  adjustedUsd: number;
  conditionWeight: number;
  presetPct: number;
  usedGradedPrice: boolean;
  usedOverride: boolean;
}

export function valueLine(line: TradeLine, settings: TradeSettings): LineValue {
  const presetPct = line.side === "offer" ? settings.preset.offerPct : settings.preset.receivePct;
  const qty = Math.max(1, line.quantity);

  // A negotiated / sticker price is already condition-aware and is what actually changes hands,
  // so it bypasses both the condition weight and the preset margin.
  if (line.overrideUsd != null && Number.isFinite(line.overrideUsd)) {
    const unitMarket = line.price?.usd ?? null;
    return {
      marketUsd: unitMarket == null ? null : round2(unitMarket * qty),
      adjustedUsd: round2(line.overrideUsd * qty),
      conditionWeight: 1,
      presetPct: 100,
      usedGradedPrice: false,
      usedOverride: true,
    };
  }

  const graded = line.grade ? line.price?.gradedUsd?.[gradeKey(line.grade)] : undefined;
  const unit = graded ?? line.price?.usd ?? null;
  if (unit == null) {
    return { marketUsd: null, adjustedUsd: 0, conditionWeight: 1, presetPct, usedGradedPrice: false, usedOverride: false };
  }

  // Slabbed cards are priced by grade; the raw condition weighting doesn't apply.
  const conditionWeight = graded != null || line.grade ? 1 : settings.conditionWeights[line.condition] ?? 1;
  return {
    marketUsd: round2(unit * qty),
    adjustedUsd: round2(unit * qty * conditionWeight * (presetPct / 100)),
    conditionWeight,
    presetPct,
    usedGradedPrice: graded != null,
    usedOverride: false,
  };
}

export interface TradeTotals {
  offer: { marketUsd: number; adjustedUsd: number; count: number; unpriced: number };
  receive: { marketUsd: number; adjustedUsd: number; count: number; unpriced: number };
  /** Cash you hand over (+) or receive (−) to balance; included in the net. */
  cashDeltaUsd: number;
  /** receive − offer (+ cash you received). Positive = in your favour. */
  netUsd: number;
  /** net as % of what you're giving up. */
  netPct: number;
  equity: Equity;
}

/**
 * @param cashUsd  cash in the deal from YOUR perspective: positive = you receive cash,
 *                 negative = you pay cash on top.
 */
export function computeTotals(lines: TradeLine[], settings: TradeSettings, cashUsd = 0): TradeTotals {
  const side = (s: TradeSide) => {
    let marketUsd = 0;
    let adjustedUsd = 0;
    let count = 0;
    let unpriced = 0;
    for (const l of lines) {
      if (l.side !== s) continue;
      const v = valueLine(l, settings);
      count += Math.max(1, l.quantity);
      if (v.marketUsd == null && !v.usedOverride) unpriced += 1;
      marketUsd += v.marketUsd ?? 0;
      adjustedUsd += v.adjustedUsd;
    }
    return { marketUsd: round2(marketUsd), adjustedUsd: round2(adjustedUsd), count, unpriced };
  };

  const offer = side("offer");
  const receive = side("receive");
  const giving = offer.adjustedUsd + Math.max(0, -cashUsd);
  const getting = receive.adjustedUsd + Math.max(0, cashUsd);
  const netUsd = round2(getting - giving);
  const netPct = giving > 0 ? (netUsd / giving) * 100 : getting > 0 ? 100 : 0;

  let equity: Equity;
  if (offer.count === 0 && receive.count === 0) equity = "empty";
  else if (Math.abs(netPct) <= settings.fairBandPct) equity = "fair";
  else equity = netPct > 0 ? "favorable" : "unfavorable";

  return { offer, receive, cashDeltaUsd: round2(cashUsd), netUsd, netPct: round1(netPct), equity };
}

/** Cash amount that would make the trade exactly even (positive = you should receive cash). */
export function balancingCashUsd(totals: TradeTotals): number {
  return round2(-(totals.receive.adjustedUsd - totals.offer.adjustedUsd));
}

export function nextCondition(c: Condition): Condition {
  const order: Condition[] = ["NM", "LP", "MP", "HP", "DMG"];
  return order[(order.indexOf(c) + 1) % order.length];
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
