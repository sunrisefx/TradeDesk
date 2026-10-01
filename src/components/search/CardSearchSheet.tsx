"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useMoney } from "@/hooks/useMoney";
import { CONDITIONS, LANGUAGES, VARIANTS, priceKey, type AggregatedPrice, type CardLanguage, type CardRef, type Condition } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";
import { CardThumb, Chip, LangBadge } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

export interface PickedCard {
  card: CardRef;
  price: AggregatedPrice | null;
  condition: Condition;
}

/**
 * Manual search / add with autocomplete — the fallback when lighting or glare beats the camera.
 * Accepts "charizard", "charizard 199", "pikachu 025/165", "ピカチュウ", "피카츄".
 */
export function CardSearchSheet({
  open,
  onClose,
  onPick,
  title = "Search cards",
  confirmLabel = "Add",
  showCondition = true,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: PickedCard) => void | Promise<void>;
  title?: string;
  confirmLabel?: string;
  showCondition?: boolean;
}) {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState<CardLanguage>("EN");
  const [results, setResults] = useState<CardRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<CardRef | null>(null);
  const [price, setPrice] = useState<AggregatedPrice | null>(null);
  const [pricing, setPricing] = useState(false);
  const [condition, setCondition] = useState<Condition>("NM");
  const inputRef = useRef<HTMLInputElement>(null);
  const money = useMoney();

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setPrice(null);
      return;
    }
    // iOS only raises the keyboard for focus() inside a user gesture; this works when opened from a tap.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced autocomplete with cancellation.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { results } = await api.search(term, lang, ac.signal);
        setResults(results);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, lang, open]);

  const loadPrice = async (c: CardRef) => {
    setPricing(true);
    setPrice(null);
    try {
      const { prices } = await api.prices([{ card: c }]);
      setPrice(prices[priceKey(c, null)] ?? null);
    } catch {
      /* show as unpriced */
    } finally {
      setPricing(false);
    }
  };

  const pick = (c: CardRef) => {
    const card = { ...c, language: lang };
    setPicked(card);
    setCondition("NM");
    void loadPrice(card);
  };

  const setVariant = (variant: CardRef["variant"]) => {
    if (!picked) return;
    const c = { ...picked, variant };
    setPicked(c);
    void loadPrice(c);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={
        picked ? (
          <button onClick={() => setPicked(null)} className="flex items-center gap-1 text-base text-soft">
            <Icon name="back" size={18} /> Results
          </button>
        ) : (
          title
        )
      }
      footer={
        picked ? (
          <button
            onClick={() => void onPick({ card: picked, price, condition })}
            className="press w-full rounded-2xl bg-gold py-3.5 text-base font-bold text-ink"
          >
            {confirmLabel} · {pricing ? "…" : money(price?.usd)}
          </button>
        ) : undefined
      }
    >
      {!picked ? (
        <div className="space-y-3">
          <div className="sticky top-0 z-10 space-y-2 bg-panel pb-2">
            <div className="flex items-center gap-2 rounded-2xl bg-raised px-3">
              <Icon name="search" size={18} className="text-mute" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name and number, e.g. Charizard 199"
                className="h-12 w-full bg-transparent outline-none placeholder:text-mute"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                inputMode="search"
              />
              {q && (
                <button onClick={() => setQ("")} className="text-mute" aria-label="Clear">
                  <Icon name="x" size={18} />
                </button>
              )}
            </div>
            <div className="scrollbar-none flex gap-2 overflow-x-auto">
              {LANGUAGES.map((l) => (
                <Chip key={l.code} active={lang === l.code} onClick={() => setLang(l.code)}>
                  {l.short}
                </Chip>
              ))}
            </div>
          </div>
          {loading && results.length === 0 && <p className="py-6 text-center text-mute">Searching…</p>}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="py-6 text-center text-mute">No matches. Try the English name, or fewer words.</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {results.map((c) => (
              <button key={c.catalogId ?? c.name} onClick={() => pick(c)} className="press rounded-xl bg-raised p-1.5 text-left">
                <CardThumb card={c} className="w-full" />
                <div className="mt-1 truncate text-xs font-semibold">{c.name}</div>
                <div className="truncate text-[10px] text-mute">{c.setName}</div>
                <div className="tabular truncate text-[10px] text-soft">#{c.number}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-4">
            <CardThumb card={picked} className="w-32 shrink-0" rounded="rounded-xl" />
            <div className="min-w-0">
              <LangBadge lang={picked.language} />
              <div className="mt-1 text-xl leading-tight font-bold">{picked.name}</div>
              {picked.nameEn && picked.nameEn !== picked.name && <div className="text-soft">{picked.nameEn}</div>}
              <div className="mt-1 text-sm text-mute">{picked.setName}</div>
              <div className="tabular text-sm text-soft">#{picked.number}</div>
              <div className="tabular mt-3 text-2xl font-bold">{pricing ? "…" : money(price?.usd)}</div>
              {price && price.quotes.length > 0 && (
                <div className="text-xs text-mute">
                  {price.quotes.length} source{price.quotes.length > 1 ? "s" : ""} · {price.confidence} confidence
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Printing</div>
            <div className="flex flex-wrap gap-2">
              {VARIANTS.filter((v) => v.id !== "other").map((v) => (
                <Chip key={v.id} active={picked.variant === v.id} onClick={() => setVariant(v.id)}>
                  {v.label}
                </Chip>
              ))}
            </div>
          </div>
          {showCondition && (
            <div>
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Condition</div>
              <div className="flex gap-2">
                {CONDITIONS.map((c) => (
                  <Chip key={c} active={condition === c} onClick={() => setCondition(c)} className="flex-1 px-0">
                    {c}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
