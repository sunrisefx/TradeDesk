// Run: npm test   (Node ≥ 22.6 with --experimental-strip-types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONDITION_WEIGHTS, PRESETS, balancingCashUsd, computeTotals, valueLine, type TradeSettings } from "../src/lib/trade/math.ts";
import { cardKey, emptyCard, parseCardNumber, type AggregatedPrice, type TradeLine } from "../src/lib/types.ts";

const price = (usd: number, graded: Record<string, number> = {}): AggregatedPrice => ({
  cardKey: "k",
  usd,
  gradedUsd: graded,
  quotes: [],
  primarySource: "tcgplayer",
  trend7dPct: null,
  trend30dPct: null,
  history: [],
  confidence: "high",
  fetchedAt: new Date().toISOString(),
});

let n = 0;
const line = (side: "offer" | "receive", usd: number | null, patch: Partial<TradeLine> = {}): TradeLine => ({
  id: String(++n),
  side,
  card: emptyCard({ name: "Test", nameEn: "Test" }),
  condition: "NM",
  grade: null,
  quantity: 1,
  source: "search",
  binderItemId: null,
  price: usd == null ? null : price(usd),
  priceStatus: usd == null ? "error" : "ready",
  overrideUsd: null,
  ...patch,
});

const settings = (presetId = "straight", fairBandPct = 5): TradeSettings => ({
  preset: PRESETS.find((p) => p.id === presetId)!,
  conditionWeights: DEFAULT_CONDITION_WEIGHTS,
  fairBandPct,
});

test("1:1 market: +$24.50 in your favor is favorable", () => {
  const t = computeTotals([line("offer", 100), line("receive", 124.5)], settings());
  assert.equal(t.netUsd, 24.5);
  assert.equal(t.equity, "favorable");
});

test("store credit preset discounts only my side", () => {
  const t = computeTotals([line("offer", 100), line("receive", 80)], settings("store-credit"));
  assert.equal(t.offer.adjustedUsd, 80);
  assert.equal(t.netUsd, 0);
  assert.equal(t.equity, "fair");
});

test("condition weights apply to raw cards, not slabs or sticker prices", () => {
  const s = settings();
  assert.equal(valueLine(line("offer", 100, { condition: "MP" }), s).adjustedUsd, 70);
  const slab = line("offer", 100, { condition: "HP", grade: { company: "PSA", grade: 10 }, price: price(100, { "PSA 10": 400 }) });
  assert.equal(valueLine(slab, s).adjustedUsd, 400);
  const sticker = line("receive", 100, { condition: "LP", overrideUsd: 90, quantity: 2 });
  assert.equal(valueLine(sticker, s).adjustedUsd, 180);
});

test("cash balances the trade", () => {
  const s = settings();
  const lines = [line("offer", 50), line("receive", 65)];
  const t0 = computeTotals(lines, s);
  const cash = balancingCashUsd(t0);
  assert.equal(cash, -15); // I pay $15
  const t1 = computeTotals(lines, s, cash);
  assert.equal(t1.netUsd, 0);
});

test("unfavorable outside the fair band; unpriced lines counted", () => {
  const t = computeTotals([line("offer", 100), line("receive", 85), line("receive", null)], settings());
  assert.equal(t.equity, "unfavorable");
  assert.equal(t.receive.unpriced, 1);
  assert.equal(t.netPct, -15);
});

test("collector number parsing", () => {
  assert.deepEqual(parseCardNumber("025/165"), { prefix: null, local: "25", total: "165" });
  assert.deepEqual(parseCardNumber("TG05/TG30"), { prefix: "TG", local: "5", total: "TG30" });
  assert.deepEqual(parseCardNumber("SVP 085"), { prefix: "SVP", local: "85", total: null });
  assert.deepEqual(parseCardNumber("201/165"), { prefix: null, local: "201", total: "165" });
});

test("card key distinguishes language and variant", () => {
  const a = emptyCard({ catalogId: "sv03.5-025", nameEn: "Pikachu", language: "EN", variant: "normal" });
  assert.notEqual(cardKey(a), cardKey({ ...a, variant: "masterball" }));
  assert.notEqual(cardKey(a), cardKey({ ...a, language: "JA" }));
});
