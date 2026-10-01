"use client";

import { useState } from "react";
import { useMoney, useToUsd } from "@/hooks/useMoney";
import { PRESETS, balancingCashUsd, type TradeTotals } from "@/lib/trade/math";
import { CUSTOM_PRESET_ID, useSettings } from "@/store/settings";
import { useTrade } from "@/store/trade";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

/** Shop / vendor margin presets + custom margins + fair band. */
export function PresetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { presetId, setPreset, customPreset, setCustomPreset, fairBandPct, setFairBand } = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title="Trade terms">
      <div className="space-y-2">
        {[...PRESETS, customPreset].map((p) => {
          const active = presetId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`press flex w-full items-center justify-between rounded-2xl border p-3 text-left ${active ? "border-gold bg-gold/10" : "border-line bg-raised"}`}
            >
              <div>
                <div className="font-semibold">{p.id === CUSTOM_PRESET_ID ? "Custom" : p.label}</div>
                <div className="text-sm text-mute">{p.description}</div>
              </div>
              <div className="tabular shrink-0 pl-3 text-right text-sm">
                <div className="text-give">mine {p.offerPct}%</div>
                <div className="text-get">theirs {p.receivePct}%</div>
              </div>
            </button>
          );
        })}
      </div>

      {presetId === CUSTOM_PRESET_ID && (
        <div className="mt-4 space-y-4 rounded-2xl bg-raised p-4">
          <label className="block">
            <div className="flex justify-between text-sm">
              <span className="text-give">My cards valued at</span>
              <span className="tabular font-bold">{customPreset.offerPct}%</span>
            </div>
            <input
              type="range"
              min={40}
              max={120}
              step={5}
              value={customPreset.offerPct}
              onChange={(e) => setCustomPreset({ offerPct: Number(e.target.value) })}
              className="mt-2 w-full accent-[var(--color-give)]"
            />
          </label>
          <label className="block">
            <div className="flex justify-between text-sm">
              <span className="text-get">Their cards valued at</span>
              <span className="tabular font-bold">{customPreset.receivePct}%</span>
            </div>
            <input
              type="range"
              min={60}
              max={150}
              step={5}
              value={customPreset.receivePct}
              onChange={(e) => setCustomPreset({ receivePct: Number(e.target.value) })}
              className="mt-2 w-full accent-[var(--color-get)]"
            />
          </label>
        </div>
      )}

      <label className="mt-4 block rounded-2xl bg-raised p-4">
        <div className="flex justify-between text-sm">
          <span>“Fair” band</span>
          <span className="tabular font-bold">±{fairBandPct}%</span>
        </div>
        <input type="range" min={0} max={15} step={1} value={fairBandPct} onChange={(e) => setFairBand(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-fair)]" />
        <div className="mt-1 text-xs text-mute">Net differences inside this band show as Fair on the gauge.</div>
      </label>
    </Sheet>
  );
}

/** Cash on top of cards, in the display currency. */
export function CashSheet({ open, onClose, totals }: { open: boolean; onClose: () => void; totals: TradeTotals }) {
  const cashUsd = useTrade((s) => s.cashUsd);
  const setCash = useTrade((s) => s.setCash);
  const currency = useSettings((s) => s.currency);
  const money = useMoney();
  const toUsd = useToUsd();
  const [dir, setDir] = useState<"pay" | "get">(cashUsd < 0 ? "pay" : "get");
  const [amount, setAmount] = useState("");
  const balance = balancingCashUsd(totals);

  return (
    <Sheet open={open} onClose={onClose} title="Cash in the deal">
      <div className="space-y-4">
        <Segmented
          value={dir}
          onChange={setDir}
          options={[
            { value: "pay", label: "I pay cash" },
            { value: "get", label: "I get cash" },
          ]}
        />
        <div className="flex items-center rounded-2xl bg-raised px-4">
          <span className="text-mute">{currency}</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder={cashUsd ? money(Math.abs(cashUsd)) : "0"}
            className="h-14 w-full bg-transparent pl-2 text-2xl font-bold outline-none placeholder:text-mute"
          />
        </div>
        {Math.abs(balance) >= 0.01 && (
          <button
            onClick={() => {
              setCash(balance);
              onClose();
            }}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-raised py-3 text-sm font-semibold"
          >
            <Icon name="swap" size={16} /> Even it out: {balance > 0 ? "I get" : "I pay"} {money(Math.abs(balance))}
          </button>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCash(0);
              onClose();
            }}
            className="press flex-1 rounded-2xl bg-raised py-3.5 font-semibold text-soft"
          >
            No cash
          </button>
          <button
            onClick={() => {
              const n = Number(amount.replace(",", "."));
              if (Number.isFinite(n)) setCash((dir === "pay" ? -1 : 1) * toUsd(n));
              onClose();
            }}
            className="press flex-1 rounded-2xl bg-white py-3.5 font-bold text-ink"
          >
            Apply
          </button>
        </div>
      </div>
    </Sheet>
  );
}
