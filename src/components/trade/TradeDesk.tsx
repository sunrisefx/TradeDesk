"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useEnsureTradePrices, useMoney } from "@/hooks/useMoney";
import { matchWishlist } from "@/lib/client/wishlist-match";
import { computeTotals, valueLine, type TradeSettings, type TradeTotals } from "@/lib/trade/math";
import type { TradeLine, TradeSide, WishlistItem } from "@/lib/types";
import { useTradeSettings } from "@/store/settings";
import { useTrade } from "@/store/trade";
import { useData } from "@/store/data";
import { toast } from "@/store/toast";
import { TopBar } from "@/components/nav/TopBar";
import { Icon } from "@/components/ui/Icon";
import { CameraScanner, type ScanConfirm } from "@/components/scanner/CameraScanner";
import { CardSearchSheet } from "@/components/search/CardSearchSheet";
import { EquityGauge } from "./EquityGauge";
import { TradeLineTile } from "./TradeLineTile";
import { LineEditSheet } from "./LineEditSheet";
import { BinderPickerSheet } from "./BinderPickerSheet";
import { CashSheet, PresetSheet } from "./TermsSheets";
import { CompleteTradeSheet } from "./CompleteTradeSheet";

// ════════════════════════════════════════════════════════════════════════════
// Showroom Trade Evaluator — side-by-side live comparison.
//   LEFT  (violet) = my cards / offering   ·   RIGHT (teal) = their cards / receiving
// ════════════════════════════════════════════════════════════════════════════

const SUMMARY_H = 176; // px, keep in sync with TradeSummary layout

export function TradeDesk() {
  useEnsureTradePrices();
  const lines = useTrade((s) => s.lines);
  const cashUsd = useTrade((s) => s.cashUsd);
  const add = useTrade((s) => s.add);
  const settings = useTradeSettings();
  const money = useMoney();
  const { wishlist, loadWishlist } = useData();

  const [scanSide, setScanSide] = useState<TradeSide | null>(null);
  const [searchSide, setSearchSide] = useState<TradeSide | null>(null);
  const [binderOpen, setBinderOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"preset" | "cash" | "complete" | null>(null);

  useEffect(() => {
    void loadWishlist();
  }, [loadWishlist]);

  const totals = useMemo(() => computeTotals(lines, settings, cashUsd), [lines, settings, cashUsd]);
  const hits = useMemo(() => {
    const m = new Map<string, WishlistItem>();
    for (const l of lines) {
      if (l.side !== "receive") continue;
      const w = matchWishlist(l.card, wishlist);
      if (w) m.set(l.id, w);
    }
    return m;
  }, [lines, wishlist]);

  const onScanned = (side: TradeSide) => (r: ScanConfirm) => {
    add({ side, card: r.card, condition: r.condition, grade: r.grade, source: r.source, price: r.price });
    if (side === "receive" && matchWishlist(r.card, wishlist)) toast("★ On your wishlist!", "good");
  };

  const editing = lines.find((l) => l.id === editId) ?? null;

  return (
    <div className="min-h-dvh">
      <TopBar title="Trade Desk" sub={settings.preset.label} />

      {hits.size > 0 && (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-2xl bg-gold px-3 py-2 text-sm font-semibold text-ink">
          <Icon name="star" size={18} />
          <span className="min-w-0 flex-1 truncate">
            Wishlist hit: {[...hits.values()].map((w) => w.nameEn).join(", ")}
            {[...hits.values()][0]?.maxPriceUsd != null && ` · max ${money([...hits.values()][0].maxPriceUsd)}`}
          </span>
        </div>
      )}

      <main className="px-2 pt-2" style={{ paddingBottom: `calc(64px + env(safe-area-inset-bottom) + ${SUMMARY_H + 12}px)` }}>
        <div className="grid grid-cols-2 gap-2">
          <TradeColumn
            side="offer"
            lines={lines}
            settings={settings}
            totals={totals}
            hits={hits}
            onOpen={setEditId}
            actions={
              <>
                <ColumnButton icon="binder" label="Binder" onClick={() => setBinderOpen(true)} tone="give" />
                <ColumnButton icon="camera" label="Scan" onClick={() => setScanSide("offer")} tone="give" />
                <ColumnButton icon="search" label="Find" onClick={() => setSearchSide("offer")} tone="give" />
              </>
            }
          />
          <TradeColumn
            side="receive"
            lines={lines}
            settings={settings}
            totals={totals}
            hits={hits}
            onOpen={setEditId}
            actions={
              <>
                <ColumnButton icon="camera" label="Scan theirs" onClick={() => setScanSide("receive")} tone="get" wide />
                <ColumnButton icon="search" label="Find" onClick={() => setSearchSide("receive")} tone="get" />
              </>
            }
          />
        </div>
      </main>

      <TradeSummary totals={totals} settings={settings} onPreset={() => setSheet("preset")} onCash={() => setSheet("cash")} onComplete={() => setSheet("complete")} />

      <CameraScanner
        open={scanSide != null}
        onClose={() => setScanSide(null)}
        title={scanSide === "offer" ? "Scan my card" : "Scan their card"}
        accent={scanSide === "offer" ? "give" : "get"}
        continuous
        actions={[
          {
            label: scanSide === "offer" ? "Add to mine" : "Add to theirs",
            tone: scanSide === "offer" ? "give" : "get",
            onClick: onScanned(scanSide ?? "receive"),
          },
        ]}
      />
      <CardSearchSheet
        open={searchSide != null}
        onClose={() => setSearchSide(null)}
        title={searchSide === "offer" ? "Add my card" : "Add their card"}
        confirmLabel={searchSide === "offer" ? "Add to mine" : "Add to theirs"}
        onPick={(p) => {
          onScanned(searchSide ?? "receive")({ ...p, grade: null, source: "search" });
          setSearchSide(null);
        }}
      />
      <BinderPickerSheet open={binderOpen} onClose={() => setBinderOpen(false)} />
      <LineEditSheet line={editing} settings={settings} onClose={() => setEditId(null)} />
      <PresetSheet open={sheet === "preset"} onClose={() => setSheet(null)} />
      <CashSheet open={sheet === "cash"} onClose={() => setSheet(null)} totals={totals} />
      <CompleteTradeSheet open={sheet === "complete"} onClose={() => setSheet(null)} totals={totals} settings={settings} />
    </div>
  );
}

function ColumnButton({
  icon,
  label,
  onClick,
  tone,
  wide,
}: {
  icon: "binder" | "camera" | "search";
  label: string;
  onClick: () => void;
  tone: "give" | "get";
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`press flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${wide ? "col-span-2" : ""} ${
        tone === "give" ? "bg-give/15 text-give" : "bg-get/15 text-get"
      }`}
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}

function TradeColumn({
  side,
  lines,
  settings,
  totals,
  hits,
  onOpen,
  actions,
}: {
  side: TradeSide;
  lines: TradeLine[];
  settings: TradeSettings;
  totals: TradeTotals;
  hits: Map<string, WishlistItem>;
  onOpen: (id: string) => void;
  actions: ReactNode;
}) {
  const money = useMoney();
  const mine = lines.filter((l) => l.side === side);
  const t = side === "offer" ? totals.offer : totals.receive;
  const pct = side === "offer" ? settings.preset.offerPct : settings.preset.receivePct;
  const sorted = [...mine].sort((a, b) => valueLine(b, settings).adjustedUsd - valueLine(a, settings).adjustedUsd);

  return (
    <section className="min-w-0">
      <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 -mx-0.5 mb-2 rounded-2xl bg-ink/90 px-1 py-1.5 backdrop-blur">
        <div className={`flex items-center gap-1.5 text-xs font-extrabold tracking-wide uppercase ${side === "offer" ? "text-give" : "text-get"}`}>
          <span className={`h-2 w-2 rounded-full ${side === "offer" ? "bg-give" : "bg-get"}`} />
          {side === "offer" ? "Mine · Offering" : "Theirs · Receiving"}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="tabular text-lg font-bold">{money(t.adjustedUsd)}</span>
          <span className="text-[11px] text-mute">
            {t.count} card{t.count === 1 ? "" : "s"}
            {pct !== 100 && ` · ${pct}%`}
          </span>
        </div>
        {t.unpriced > 0 && <div className="text-[10px] font-semibold text-fair">{t.unpriced} unpriced</div>}
      </div>

      <div className="space-y-2">
        {sorted.map((l) => (
          <TradeLineTile key={l.id} line={l} settings={settings} wishlistHit={hits.get(l.id) ?? null} onOpen={() => onOpen(l.id)} />
        ))}
        {mine.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-xs text-mute">
            {side === "offer" ? "Add cards you're giving up" : "Scan the cards you want"}
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5">{actions}</div>
      </div>
    </section>
  );
}

function TradeSummary({
  totals,
  settings,
  onPreset,
  onCash,
  onComplete,
}: {
  totals: TradeTotals;
  settings: TradeSettings;
  onPreset: () => void;
  onCash: () => void;
  onComplete: () => void;
}) {
  const money = useMoney();
  const clear = useTrade((s) => s.clear);
  const empty = totals.equity === "empty";
  const tone = totals.equity === "favorable" ? "text-good" : totals.equity === "unfavorable" ? "text-bad" : totals.equity === "fair" ? "text-fair" : "text-mute";
  const netText = empty
    ? "Add cards to both sides"
    : Math.abs(totals.netUsd) < 0.005
      ? "Dead even"
      : totals.netUsd > 0
        ? `${money(totals.netUsd, { sign: true })} in your favor`
        : `${money(totals.netUsd, { sign: true })} loss`;

  return (
    <div className="fixed inset-x-0 bottom-nav-offset z-30 px-2 pb-2" style={{ height: SUMMARY_H }}>
      <div className="flex h-full flex-col justify-between rounded-3xl border border-line bg-panel/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="w-[34%]">
            <div className="text-[10px] font-bold tracking-wide text-give uppercase">You give</div>
            <div className="tabular truncate text-lg font-bold">{money(totals.offer.adjustedUsd + Math.max(0, -totals.cashDeltaUsd))}</div>
            {totals.cashDeltaUsd < 0 && <div className="text-[10px] text-mute">incl. {money(-totals.cashDeltaUsd)} cash</div>}
          </div>
          <EquityGauge netPct={totals.netPct} equity={totals.equity} fairBandPct={settings.fairBandPct} size={104} />
          <div className="w-[34%] text-right">
            <div className="text-[10px] font-bold tracking-wide text-get uppercase">You get</div>
            <div className="tabular truncate text-lg font-bold">{money(totals.receive.adjustedUsd + Math.max(0, totals.cashDeltaUsd))}</div>
            {totals.cashDeltaUsd > 0 && <div className="text-[10px] text-mute">incl. {money(totals.cashDeltaUsd)} cash</div>}
          </div>
        </div>

        <div className={`tabular text-center text-xl font-extrabold ${tone}`}>
          {netText}
          {!empty && Math.abs(totals.netPct) >= 0.1 && <span className="ml-1.5 text-sm font-semibold opacity-80">({totals.netPct > 0 ? "+" : ""}{totals.netPct}%)</span>}
        </div>

        <div className="flex gap-1.5">
          <button onClick={onPreset} className="press flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-raised px-2 text-xs font-semibold">
            <Icon name="tag" size={14} />
            <span className="truncate">{settings.preset.label}</span>
          </button>
          <button onClick={onCash} className="press flex h-10 items-center justify-center rounded-xl bg-raised px-3 text-xs font-semibold">
            {totals.cashDeltaUsd ? money(totals.cashDeltaUsd, { sign: true }) : "+ Cash"}
          </button>
          <button
            onClick={() => {
              if (window.confirm("Clear this trade?")) clear();
            }}
            className="press grid h-10 w-10 place-items-center rounded-xl bg-raised text-soft"
            aria-label="Clear trade"
          >
            <Icon name="trash" size={16} />
          </button>
          <button onClick={onComplete} disabled={empty} className="press h-10 rounded-xl bg-gold px-4 text-sm font-extrabold text-ink disabled:opacity-40">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
