"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useMoney } from "@/hooks/useMoney";
import { valueLine, type TradeSettings, type TradeTotals } from "@/lib/trade/math";
import { cardKey, type TradeLine } from "@/lib/types";
import { useData } from "@/store/data";
import { useSettings } from "@/store/settings";
import { useTrade } from "@/store/trade";
import { toast } from "@/store/toast";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";

/** Plain-text recap — handy to AirDrop/text to the other trader. */
export function tradeSummaryText(lines: TradeLine[], totals: TradeTotals, settings: TradeSettings, money: (n: number | null) => string): string {
  const fmt = (side: "offer" | "receive") =>
    lines
      .filter((l) => l.side === side)
      .map((l) => {
        const v = valueLine(l, settings);
        const tag = l.grade ? `${l.grade.company} ${l.grade.grade}` : l.condition;
        return `• ${l.card.nameEn || l.card.name} ${l.card.number ?? ""} [${l.card.language}/${tag}]${l.quantity > 1 ? ` ×${l.quantity}` : ""} — ${money(v.adjustedUsd)}`;
      })
      .join("\n");
  const cash = totals.cashDeltaUsd ? `\nCash: ${totals.cashDeltaUsd > 0 ? "I receive" : "I pay"} ${money(Math.abs(totals.cashDeltaUsd))}` : "";
  return `TRADE (${settings.preset.label})\n\nGIVING ${money(totals.offer.adjustedUsd)}\n${fmt("offer")}\n\nGETTING ${money(totals.receive.adjustedUsd)}\n${fmt("receive")}${cash}\n\nNet: ${money(totals.netUsd)}`;
}

export function CompleteTradeSheet({
  open,
  onClose,
  totals,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  totals: TradeTotals;
  settings: TradeSettings;
}) {
  const lines = useTrade((s) => s.lines);
  const clear = useTrade((s) => s.clear);
  const currency = useSettings((s) => s.currency);
  const fx = useSettings((s) => s.fx);
  const { loadBinder } = useData();
  const money = useMoney();
  const [location, setLocation] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");
  const [addToBinder, setAddToBinder] = useState(true);
  const [saving, setSaving] = useState(false);

  const share = async () => {
    const text = tradeSummaryText(lines, totals, settings, (n) => money(n));
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied trade summary", "good");
      }
    } catch {
      /* user cancelled */
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.trades.complete({
        location: location || null,
        counterparty: counterparty || null,
        notes: notes || null,
        preset: settings.preset,
        displayCurrency: currency,
        fxRate: fx?.rates[currency] ?? 1,
        offeredTotalUsd: totals.offer.adjustedUsd,
        receivedTotalUsd: totals.receive.adjustedUsd,
        cashDeltaUsd: totals.cashDeltaUsd,
        netUsd: totals.netUsd,
        equity: totals.equity,
        addReceivedToBinder: addToBinder,
        lines: lines.map((l) => {
          const v = valueLine(l, settings);
          return {
            side: l.side,
            card: l.card,
            cardKey: cardKey(l.card),
            condition: l.condition,
            quantity: l.quantity,
            marketUsd: v.marketUsd,
            adjustedUsd: v.adjustedUsd,
            binderItemId: l.binderItemId,
          };
        }),
      });
      clear();
      void loadBinder(true);
      toast("Trade saved · binder updated", "good");
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "DB_NOT_CONFIGURED") toast("No database — trade not saved", "bad");
      else toast((e as Error).message, "bad");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Complete trade"
      footer={
        <div className="flex gap-2">
          <button onClick={share} className="press grid h-13 w-14 place-items-center rounded-2xl bg-raised" aria-label="Share summary">
            <Icon name="share" />
          </button>
          <button onClick={save} disabled={saving} className="press flex-1 rounded-2xl bg-gold py-3.5 font-bold text-ink disabled:opacity-50">
            {saving ? "Saving…" : "Save & update binder"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-give/10 p-3">
            <div className="text-xs text-give">Giving · {totals.offer.count}</div>
            <div className="tabular text-xl font-bold">{money(totals.offer.adjustedUsd)}</div>
          </div>
          <div className="rounded-2xl bg-get/10 p-3">
            <div className="text-xs text-get">Getting · {totals.receive.count}</div>
            <div className="tabular text-xl font-bold">{money(totals.receive.adjustedUsd)}</div>
          </div>
        </div>
        {totals.cashDeltaUsd !== 0 && (
          <div className="text-center text-sm text-soft">
            + cash: {totals.cashDeltaUsd > 0 ? "you receive" : "you pay"} {money(Math.abs(totals.cashDeltaUsd))}
          </div>
        )}
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where (shop / show / table #)" className="h-12 w-full rounded-2xl bg-raised px-4 outline-none placeholder:text-mute" />
        <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Who (dealer / trader)" className="h-12 w-full rounded-2xl bg-raised px-4 outline-none placeholder:text-mute" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className="w-full rounded-2xl bg-raised p-4 outline-none placeholder:text-mute" />
        <label className="flex items-center justify-between rounded-2xl bg-raised p-4">
          <span>Add received cards to my binder</span>
          <input type="checkbox" checked={addToBinder} onChange={(e) => setAddToBinder(e.target.checked)} className="h-6 w-6 accent-[var(--color-gold)]" />
        </label>
        <p className="text-xs text-mute">Cards you offered from your binder are removed (or their quantity reduced) automatically.</p>
      </div>
    </Sheet>
  );
}
