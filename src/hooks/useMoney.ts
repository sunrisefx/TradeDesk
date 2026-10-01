"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/client/api";
import { useSettings } from "@/store/settings";
import { useTrade } from "@/store/trade";
import { priceKey, type Currency } from "@/lib/types";

const FALLBACK: Record<Currency, number> = { USD: 1, GBP: 0.75, EUR: 0.86, JPY: 148 };
const formatters = new Map<string, Intl.NumberFormat>();

function fmt(currency: Currency, compact: boolean): Intl.NumberFormat {
  const k = `${currency}${compact}`;
  let f = formatters.get(k);
  if (!f) {
    f = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "JPY" ? 0 : compact ? 0 : 2,
      minimumFractionDigits: currency === "JPY" ? 0 : compact ? 0 : 2,
      notation: compact ? "compact" : "standard",
    });
    formatters.set(k, f);
  }
  return f;
}

/** Returns a formatter: USD amount → string in the user's selected display currency. */
export function useMoney() {
  const currency = useSettings((s) => s.currency);
  const fx = useSettings((s) => s.fx);
  return useCallback(
    (usd: number | null | undefined, opts: { sign?: boolean; compact?: boolean } = {}) => {
      if (usd == null || !Number.isFinite(usd)) return "—";
      const rate = fx?.rates[currency] ?? FALLBACK[currency];
      const v = usd * rate;
      const s = fmt(currency, Boolean(opts.compact && Math.abs(v) >= 10_000)).format(Math.abs(v));
      if (opts.sign) return `${v > 0.004 ? "+" : v < -0.004 ? "−" : "±"}${s}`;
      return v < 0 ? `−${s}` : s;
    },
    [currency, fx],
  );
}

/** Convert a value typed in the display currency back to USD (for sticker-price overrides). */
export function useToUsd() {
  const currency = useSettings((s) => s.currency);
  const fx = useSettings((s) => s.fx);
  return useCallback((amount: number) => amount / (fx?.rates[currency] ?? FALLBACK[currency]), [currency, fx]);
}

/** Loads FX once per hour. Mount once at the app root. */
export function useFxBootstrap() {
  const setFx = useSettings((s) => s.setFx);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .fx()
        .then((r) => alive && setFx(r))
        .catch(() => {});
    void load();
    const t = setInterval(load, 60 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [setFx]);
}

/** Any trade line without a price gets fetched in one batch. */
export function useEnsureTradePrices() {
  const lines = useTrade((s) => s.lines);
  const setPrice = useTrade((s) => s.setPrice);
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    const todo = lines.filter((l) => l.priceStatus === "idle" && !inflight.current.has(l.id));
    if (!todo.length) return;
    todo.forEach((l) => {
      inflight.current.add(l.id);
      setPrice(l.id, null, "loading");
    });
    api
      .prices(todo.map((l) => ({ card: l.card, grade: l.grade })))
      .then(({ prices }) => {
        for (const l of todo) {
          const p = prices[priceKey(l.card, l.grade)];
          setPrice(l.id, p ?? null, p ? "ready" : "error");
        }
      })
      .catch(() => todo.forEach((l) => setPrice(l.id, null, "error")))
      .finally(() => todo.forEach((l) => inflight.current.delete(l.id)));
  }, [lines, setPrice]);
}
