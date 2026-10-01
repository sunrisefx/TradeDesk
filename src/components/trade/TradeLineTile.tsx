"use client";

import { useMoney } from "@/hooks/useMoney";
import { nextCondition, valueLine, type TradeSettings } from "@/lib/trade/math";
import type { TradeLine, WishlistItem } from "@/lib/types";
import { useTrade } from "@/store/trade";
import { CardThumb, LangBadge, VariantBadge } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

const COND_TONE: Record<string, string> = {
  NM: "bg-good/15 text-good",
  LP: "bg-lime-400/15 text-lime-300",
  MP: "bg-fair/15 text-fair",
  HP: "bg-orange-400/15 text-orange-300",
  DMG: "bg-bad/15 text-bad",
};

/** Compact card row sized for a half-width column on a 375–440pt iPhone. */
export function TradeLineTile({
  line,
  settings,
  wishlistHit,
  onOpen,
}: {
  line: TradeLine;
  settings: TradeSettings;
  wishlistHit: WishlistItem | null;
  onOpen: () => void;
}) {
  const money = useMoney();
  const update = useTrade((s) => s.update);
  const v = valueLine(line, settings);
  const adjusted = v.marketUsd != null && (v.conditionWeight !== 1 || v.presetPct !== 100) && !v.usedOverride;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-panel ${
        wishlistHit ? "border-gold/70 shadow-[0_0_0_1px_rgba(255,203,46,0.35)]" : "border-line"
      }`}
    >
      {wishlistHit && (
        <div className="flex items-center gap-1 bg-gold px-2 py-0.5 text-[10px] font-bold text-ink">
          <Icon name="star" size={11} /> WISHLIST
        </div>
      )}
      <button onClick={onOpen} className="press flex w-full gap-2 p-2 text-left">
        <CardThumb card={line.card} className="w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] leading-tight font-semibold">{line.card.nameEn || line.card.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <LangBadge lang={line.card.language} />
            <VariantBadge variant={line.card.variant} />
            {line.card.number && <span className="tabular truncate text-[10px] text-mute">#{line.card.number}</span>}
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between gap-1 px-2 pb-2">
        {line.grade ? (
          <span className="rounded-md bg-gold/15 px-1.5 py-1 text-[11px] font-bold text-gold">
            {line.grade.company} {line.grade.grade}
          </span>
        ) : (
          <button
            onClick={() => update(line.id, { condition: nextCondition(line.condition) })}
            className={`press min-w-[38px] rounded-md px-1.5 py-1 text-[11px] font-bold ${COND_TONE[line.condition]}`}
            aria-label={`Condition ${line.condition}, tap to change`}
          >
            {line.condition}
          </button>
        )}
        {line.quantity > 1 && <span className="text-[11px] font-semibold text-soft">×{line.quantity}</span>}
        <div className="min-w-0 text-right">
          {line.priceStatus === "loading" ? (
            <span className="text-xs text-mute">pricing…</span>
          ) : v.marketUsd == null && !v.usedOverride ? (
            <button onClick={onOpen} className="text-xs font-semibold text-fair">
              set price
            </button>
          ) : (
            <>
              <div className="tabular text-sm font-bold">
                {money(v.adjustedUsd)}
                {v.usedOverride && <Icon name="tag" size={11} className="ml-0.5 inline text-gold" />}
              </div>
              {adjusted && <div className="tabular text-[10px] text-mute line-through">{money(v.marketUsd)}</div>}
            </>
          )}
        </div>
      </div>
      {line.price?.confidence === "low" && !v.usedOverride && <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-fair" title="Low price confidence" />}
    </div>
  );
}
