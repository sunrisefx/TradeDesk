"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CONDITION_WEIGHTS, PRESETS, type TradeSettings } from "@/lib/trade/math";
import type { Condition, Currency, FxRates, TradePreset } from "@/lib/types";

interface SettingsState {
  currency: Currency;
  presetId: string;
  customPreset: TradePreset;
  conditionWeights: Record<Condition, number>;
  fairBandPct: number;
  fx: FxRates | null;
  setCurrency: (c: Currency) => void;
  setPreset: (id: string) => void;
  setCustomPreset: (p: Partial<Pick<TradePreset, "offerPct" | "receivePct">>) => void;
  setConditionWeight: (c: Condition, w: number) => void;
  resetConditionWeights: () => void;
  setFairBand: (pct: number) => void;
  setFx: (fx: FxRates) => void;
}

export const CUSTOM_PRESET_ID = "custom";

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      currency: "USD",
      presetId: "straight",
      customPreset: {
        id: CUSTOM_PRESET_ID,
        label: "Custom",
        description: "Your own margins.",
        offerPct: 90,
        receivePct: 100,
      },
      conditionWeights: { ...DEFAULT_CONDITION_WEIGHTS },
      fairBandPct: 5,
      fx: null,
      setCurrency: (currency) => set({ currency }),
      setPreset: (presetId) => set({ presetId }),
      setCustomPreset: (p) =>
        set((s) => {
          const next = { ...s.customPreset, ...p };
          return { customPreset: { ...next, label: `Custom ${next.offerPct}/${next.receivePct}` }, presetId: CUSTOM_PRESET_ID };
        }),
      setConditionWeight: (c, w) => set((s) => ({ conditionWeights: { ...s.conditionWeights, [c]: Math.max(0, Math.min(1, w)) } })),
      resetConditionWeights: () => set({ conditionWeights: { ...DEFAULT_CONDITION_WEIGHTS } }),
      setFairBand: (fairBandPct) => set({ fairBandPct: Math.max(0, Math.min(25, fairBandPct)) }),
      setFx: (fx) => set({ fx }),
    }),
    { name: "td-settings", version: 1, skipHydration: true },
  ),
);

export function useActivePreset(): TradePreset {
  const presetId = useSettings((s) => s.presetId);
  const custom = useSettings((s) => s.customPreset);
  return presetId === CUSTOM_PRESET_ID ? custom : (PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]);
}

export function useTradeSettings(): TradeSettings {
  const preset = useActivePreset();
  const conditionWeights = useSettings((s) => s.conditionWeights);
  const fairBandPct = useSettings((s) => s.fairBandPct);
  return useMemo(() => ({ preset, conditionWeights, fairBandPct }), [preset, conditionWeights, fairBandPct]);
}
