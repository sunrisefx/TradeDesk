import "server-only";
import type { Currency, FxRates } from "@/lib/types";

// Used only if both live sources are down, so the trade desk keeps working.
// Flagged as `stale: true` and shown in the UI.
const FALLBACK: Record<Currency, number> = { USD: 1, GBP: 0.75, EUR: 0.86, JPY: 148 };

let memo: { at: number; value: FxRates } | null = null;
const TTL_MS = 60 * 60 * 1000;

async function fromFrankfurter(): Promise<FxRates | null> {
  // ECB reference rates, free, no key.
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP,EUR,JPY", {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { date: string; rates: Partial<Record<Currency, number>> };
  if (!j.rates?.GBP || !j.rates?.EUR || !j.rates?.JPY) return null;
  return {
    base: "USD",
    rates: { USD: 1, GBP: j.rates.GBP, EUR: j.rates.EUR, JPY: j.rates.JPY },
    updatedAt: new Date(j.date).toISOString(),
    stale: false,
  };
}

async function fromOpenErApi(): Promise<FxRates | null> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { result: string; time_last_update_unix: number; rates: Record<string, number> };
  if (j.result !== "success") return null;
  return {
    base: "USD",
    rates: { USD: 1, GBP: j.rates.GBP, EUR: j.rates.EUR, JPY: j.rates.JPY },
    updatedAt: new Date(j.time_last_update_unix * 1000).toISOString(),
    stale: false,
  };
}

export async function getFxRates(): Promise<FxRates> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  for (const source of [fromFrankfurter, fromOpenErApi]) {
    try {
      const v = await source();
      if (v) {
        memo = { at: Date.now(), value: v };
        return v;
      }
    } catch {
      /* try next source */
    }
  }
  return memo?.value ?? { base: "USD", rates: FALLBACK, updatedAt: new Date(0).toISOString(), stale: true };
}

/** Convert an amount in `from` currency into USD. */
export function toUsd(amount: number, from: Currency, fx: FxRates): number {
  return from === "USD" ? amount : amount / fx.rates[from];
}
