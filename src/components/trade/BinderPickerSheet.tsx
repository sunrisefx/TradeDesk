"use client";

import { useEffect, useMemo, useState } from "react";
import { useMoney } from "@/hooks/useMoney";
import { LANGUAGES, type BinderItem, type CardLanguage } from "@/lib/types";
import { useData } from "@/store/data";
import { useTrade } from "@/store/trade";
import { Sheet } from "@/components/ui/Sheet";
import { CardThumb, Chip, LangBadge, VariantBadge } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

/** One-tap (multi-select) add from my saved binder to the "offering" column. */
export function BinderPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { binder, binderState, loadBinder } = useData();
  const lines = useTrade((s) => s.lines);
  const add = useTrade((s) => s.add);
  const money = useMoney();
  const [q, setQ] = useState("");
  const [lang, setLang] = useState<CardLanguage | "ALL">("ALL");
  const [tradeOnly, setTradeOnly] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      void loadBinder();
      setSel(new Set());
    }
  }, [open, loadBinder]);

  const inTrade = useMemo(() => new Set(lines.map((l) => l.binderItemId).filter(Boolean)), [lines]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return binder
      .filter((b) => (!tradeOnly || b.forTrade) && (lang === "ALL" || b.card.language === lang))
      .filter((b) => !term || `${b.card.name} ${b.card.nameEn} ${b.card.setName} ${b.card.number}`.toLowerCase().includes(term))
      .sort((a, b) => (b.lastPriceUsd ?? 0) - (a.lastPriceUsd ?? 0));
  }, [binder, q, lang, tradeOnly]);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const confirm = () => {
    for (const b of binder.filter((x) => sel.has(x.id))) {
      add({ side: "offer", card: b.card, condition: b.condition, grade: b.grade, quantity: 1, source: "binder", binderItemId: b.id });
    }
    onClose();
  };

  const total = binder.filter((b) => sel.has(b.id)).reduce((s, b) => s + (b.lastPriceUsd ?? 0), 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title="From my binder"
      footer={
        <button onClick={confirm} disabled={!sel.size} className="press w-full rounded-2xl bg-give py-3.5 font-bold text-ink disabled:opacity-40">
          Offer {sel.size || ""} card{sel.size === 1 ? "" : "s"} {sel.size ? `· ${money(total)}` : ""}
        </button>
      }
    >
      <div className="sticky top-0 z-10 space-y-2 bg-panel pb-3">
        <div className="flex items-center gap-2 rounded-2xl bg-raised px-3">
          <Icon name="search" size={18} className="text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter binder" className="h-11 w-full bg-transparent outline-none placeholder:text-mute" />
        </div>
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          <Chip active={tradeOnly} onClick={() => setTradeOnly(!tradeOnly)}>
            For trade
          </Chip>
          <Chip active={lang === "ALL"} onClick={() => setLang("ALL")}>
            All
          </Chip>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} active={lang === l.code} onClick={() => setLang(l.code)}>
              {l.short}
            </Chip>
          ))}
        </div>
      </div>

      {binderState === "no-db" && <p className="py-8 text-center text-mute">Connect Supabase to use your binder (see README).</p>}
      {binderState === "loading" && <p className="py-8 text-center text-mute">Loading binder…</p>}
      {binderState === "ready" && items.length === 0 && <p className="py-8 text-center text-mute">Nothing here yet — scan cards into your binder first.</p>}

      <div className="grid grid-cols-3 gap-2">
        {items.map((b: BinderItem) => {
          const on = sel.has(b.id);
          const used = inTrade.has(b.id);
          return (
            <button
              key={b.id}
              onClick={() => toggle(b.id)}
              disabled={used}
              className={`press relative rounded-xl p-1.5 text-left ${on ? "bg-give/25 ring-2 ring-give" : "bg-raised"} ${used ? "opacity-40" : ""}`}
            >
              <CardThumb card={b.card} className="w-full" />
              {on && (
                <span className="absolute top-2.5 right-2.5 grid h-6 w-6 place-items-center rounded-full bg-give text-ink">
                  <Icon name="check" size={14} strokeWidth={3} />
                </span>
              )}
              <div className="mt-1 truncate text-xs font-semibold">{b.card.nameEn || b.card.name}</div>
              <div className="flex items-center gap-1">
                <LangBadge lang={b.card.language} />
                <VariantBadge variant={b.card.variant} />
                <span className="text-[10px] text-mute">{b.grade ? `${b.grade.company} ${b.grade.grade}` : b.condition}</span>
              </div>
              <div className="tabular text-xs font-bold">{money(b.lastPriceUsd)}</div>
              {used && <div className="text-[10px] text-mute">in trade</div>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
