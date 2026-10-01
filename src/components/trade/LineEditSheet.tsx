"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useMoney, useToUsd } from "@/hooks/useMoney";
import { valueLine, type TradeSettings } from "@/lib/trade/math";
import { CONDITIONS, VARIANTS, priceKey, type GradingCompany, type TradeLine } from "@/lib/types";
import { useTrade } from "@/store/trade";
import { useSettings } from "@/store/settings";
import { Sheet } from "@/components/ui/Sheet";
import { CardThumb, Chip, LangBadge } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PriceBreakdown } from "@/components/price/PriceBreakdown";

const GRADERS: GradingCompany[] = ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG"];
const GRADES = [10, 9.5, 9, 8.5, 8, 7, 6, 5];

/** Edit one card in the trade: condition, printing, grade, quantity, sticker price, side. */
export function LineEditSheet({ line, settings, onClose }: { line: TradeLine | null; settings: TradeSettings; onClose: () => void }) {
  const update = useTrade((s) => s.update);
  const remove = useTrade((s) => s.remove);
  const setPrice = useTrade((s) => s.setPrice);
  const money = useMoney();
  const toUsd = useToUsd();
  const currency = useSettings((s) => s.currency);
  const [sticker, setSticker] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState<string | null>(null);

  useEffect(() => {
    if (!line) return;
    setSticker("");
    // Pull price history (and a fresh quote) when the detail view opens.
    if (historyLoaded === line.id || line.priceStatus === "loading") return;
    setHistoryLoaded(line.id);
    api
      .prices([{ card: line.card, grade: line.grade }], { history: true })
      .then(({ prices }) => {
        const p = prices[priceKey(line.card, line.grade)];
        if (p) setPrice(line.id, p, "ready");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);

  if (!line) return null;
  const v = valueLine(line, settings);

  const refetch = (patch: Partial<TradeLine>) => update(line.id, { ...patch, priceStatus: "idle" });

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title={<span className={line.side === "offer" ? "text-give" : "text-get"}>{line.side === "offer" ? "My card" : "Their card"}</span>}
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => {
              remove(line.id);
              onClose();
            }}
            className="press grid h-13 w-14 place-items-center rounded-2xl bg-bad/15 text-bad"
            aria-label="Remove from trade"
          >
            <Icon name="trash" />
          </button>
          <button
            onClick={() => {
              update(line.id, { side: line.side === "offer" ? "receive" : "offer", binderItemId: null });
              onClose();
            }}
            className="press flex-1 rounded-2xl border border-line bg-raised py-3.5 font-semibold"
          >
            Move to {line.side === "offer" ? "theirs" : "mine"}
          </button>
          <button onClick={onClose} className="press flex-1 rounded-2xl bg-white py-3.5 font-bold text-ink">
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-4">
          <CardThumb card={line.card} className="w-28 shrink-0" rounded="rounded-xl" />
          <div className="min-w-0">
            <LangBadge lang={line.card.language} />
            <div className="mt-1 text-xl leading-tight font-bold">{line.card.name}</div>
            {line.card.nameEn !== line.card.name && <div className="text-soft">{line.card.nameEn}</div>}
            <div className="mt-1 text-sm text-mute">{line.card.setName}</div>
            <div className="tabular text-sm text-soft">#{line.card.number}</div>
            <div className="mt-3 text-xs text-mute">In this trade</div>
            <div className="tabular text-2xl font-bold">{money(v.adjustedUsd)}</div>
            <div className="text-xs text-mute">
              {v.usedOverride
                ? "sticker price"
                : `${Math.round(v.conditionWeight * 100)}% cond. × ${v.presetPct}% ${settings.preset.label}`}
            </div>
          </div>
        </div>

        <PriceBreakdown price={line.price} loading={line.priceStatus === "loading" && !line.price} />

        {/* sticker / negotiated price */}
        <div>
          <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Sticker / agreed price (each)</div>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-2xl bg-raised px-3">
              <span className="text-mute">{currency}</span>
              <input
                inputMode="decimal"
                value={sticker}
                placeholder={line.overrideUsd != null ? money(line.overrideUsd) : "e.g. 45"}
                onChange={(e) => setSticker(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="h-12 w-full bg-transparent pl-2 outline-none placeholder:text-mute"
              />
            </div>
            <button
              onClick={() => {
                const n = Number(sticker.replace(",", "."));
                if (Number.isFinite(n) && n > 0) update(line.id, { overrideUsd: Math.round(toUsd(n) * 100) / 100 });
                setSticker("");
              }}
              className="press rounded-2xl bg-gold px-4 font-bold text-ink"
            >
              Set
            </button>
            {line.overrideUsd != null && (
              <button onClick={() => update(line.id, { overrideUsd: null })} className="press rounded-2xl bg-raised px-3 text-sm text-soft">
                Clear
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Condition</div>
          <div className="flex gap-2">
            {CONDITIONS.map((c) => (
              <Chip key={c} active={line.condition === c && !line.grade} onClick={() => update(line.id, { condition: c, grade: null })} className="flex-1 px-0">
                {c}
                <span className="ml-0.5 text-[10px] opacity-60">{Math.round(settings.conditionWeights[c] * 100)}</span>
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Graded slab</div>
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            <Chip active={!line.grade} onClick={() => line.grade && refetch({ grade: null })}>
              Raw
            </Chip>
            {GRADERS.map((g) => (
              <Chip key={g} active={line.grade?.company === g} onClick={() => refetch({ grade: { company: g, grade: line.grade?.grade ?? 10 } })}>
                {g}
              </Chip>
            ))}
          </div>
          {line.grade && (
            <div className="scrollbar-none mt-2 flex gap-2 overflow-x-auto">
              {GRADES.map((n) => (
                <Chip key={n} active={line.grade?.grade === n} onClick={() => refetch({ grade: { company: line.grade!.company, grade: n } })}>
                  {n}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Printing</div>
          <div className="flex flex-wrap gap-2">
            {VARIANTS.filter((x) => x.id !== "other").map((x) => (
              <Chip key={x.id} active={line.card.variant === x.id} onClick={() => refetch({ card: { ...line.card, variant: x.id } })}>
                {x.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-wide text-mute uppercase">Quantity</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => update(line.id, { quantity: Math.max(1, line.quantity - 1) })}
              className="press grid h-11 w-11 place-items-center rounded-full bg-raised"
              aria-label="Decrease"
            >
              <Icon name="minus" />
            </button>
            <span className="tabular w-6 text-center text-lg font-bold">{line.quantity}</span>
            <button onClick={() => update(line.id, { quantity: line.quantity + 1 })} className="press grid h-11 w-11 place-items-center rounded-full bg-raised" aria-label="Increase">
              <Icon name="plus" />
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
