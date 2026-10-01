"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AggregatedPrice, CardRef, Condition, GradeInfo, TradeLine, TradeSide } from "@/lib/types";

// The live trade lives in localStorage so it survives a refresh, a phone lock,
// or iOS evicting the PWA from memory mid-negotiation.

export interface NewLine {
  side: TradeSide;
  card: CardRef;
  condition?: Condition;
  grade?: GradeInfo | null;
  quantity?: number;
  source: TradeLine["source"];
  binderItemId?: string | null;
  price?: AggregatedPrice | null;
}

interface TradeState {
  lines: TradeLine[];
  /** + = cash you receive, − = cash you pay on top */
  cashUsd: number;
  startedAt: string | null;
  add: (l: NewLine) => string;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Omit<TradeLine, "id">>) => void;
  setPrice: (id: string, price: AggregatedPrice | null, status: TradeLine["priceStatus"]) => void;
  setCash: (usd: number) => void;
  swapSides: () => void;
  clear: () => void;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export const useTrade = create<TradeState>()(
  persist(
    (set) => ({
      lines: [],
      cashUsd: 0,
      startedAt: null,
      add: (l) => {
        const id = uid();
        set((s) => ({
          startedAt: s.startedAt ?? new Date().toISOString(),
          lines: [
            ...s.lines,
            {
              id,
              side: l.side,
              card: l.card,
              condition: l.condition ?? "NM",
              grade: l.grade ?? null,
              quantity: l.quantity ?? 1,
              source: l.source,
              binderItemId: l.binderItemId ?? null,
              price: l.price ?? null,
              priceStatus: l.price ? "ready" : "idle",
              overrideUsd: null,
            },
          ],
        }));
        return id;
      },
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
      update: (id, patch) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      setPrice: (id, price, priceStatus) =>
        set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, price: price ?? l.price, priceStatus } : l)) })),
      setCash: (cashUsd) => set({ cashUsd: Math.round(cashUsd * 100) / 100 }),
      swapSides: () =>
        set((s) => ({
          lines: s.lines.map((l) => ({ ...l, side: l.side === "offer" ? "receive" : "offer", binderItemId: null })),
          cashUsd: -s.cashUsd,
        })),
      clear: () => set({ lines: [], cashUsd: 0, startedAt: null }),
    }),
    {
      name: "td-trade",
      skipHydration: true, // rehydrated in <AppProviders> after mount to avoid SSR mismatches
      version: 1,
      // Don't persist in-flight loading states.
      partialize: (s: TradeState) => ({
        lines: s.lines.map((l): TradeLine => ({ ...l, priceStatus: l.priceStatus === "loading" ? "idle" : l.priceStatus })),
        cashUsd: s.cashUsd,
        startedAt: s.startedAt,
      }),
    },
  ),
);
