"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useMoney } from "@/hooks/useMoney";
import { CONDITIONS, LANGUAGES, priceKey, type AggregatedPrice, type BinderItem, type CardLanguage, type Condition } from "@/lib/types";
import { useData } from "@/store/data";
import { useTrade } from "@/store/trade";
import { toast } from "@/store/toast";
import { TopBar } from "@/components/nav/TopBar";
import { Icon } from "@/components/ui/Icon";
import { CardThumb, Chip, LangBadge, Segmented, VariantBadge } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { PriceBreakdown } from "@/components/price/PriceBreakdown";
import { CardSearchSheet } from "@/components/search/CardSearchSheet";

type Pockets = "4" | "9";
type Sort = "value" | "newest" | "name" | "set";
type GradeFilter = "ALL" | Condition | "GRADED";
const VALUE_STEPS = [0, 5, 20, 50, 100, 500];

const lineValue = (b: BinderItem) => (b.lastPriceUsd ?? 0) * b.quantity;

export function BinderView() {
  const { binder, binderState, loadBinder, upsertBinder } = useData();
  const money = useMoney();
  const [pockets, setPockets] = useState<Pockets>("9");
  const [q, setQ] = useState("");
  const [lang, setLang] = useState<CardLanguage | "ALL">("ALL");
  const [set, setSet] = useState<string>("ALL");
  const [minValue, setMinValue] = useState(0);
  const [grade, setGrade] = useState<GradeFilter>("ALL");
  const [sort, setSort] = useState<Sort>("value");
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [repricing, setRepricing] = useState(false);

  useEffect(() => {
    void loadBinder();
  }, [loadBinder]);

  const sets = useMemo(() => [...new Set(binder.map((b) => b.card.setName).filter(Boolean) as string[])].sort(), [binder]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = binder.filter((b) => {
      if (lang !== "ALL" && b.card.language !== lang) return false;
      if (set !== "ALL" && b.card.setName !== set) return false;
      if ((b.lastPriceUsd ?? 0) < minValue) return false;
      if (grade === "GRADED" && !b.grade) return false;
      if (grade !== "ALL" && grade !== "GRADED" && (b.grade || b.condition !== grade)) return false;
      if (term && !`${b.card.name} ${b.card.nameEn} ${b.card.setName} ${b.card.number}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const by: Record<Sort, (a: BinderItem, b: BinderItem) => number> = {
      value: (a, b) => (b.lastPriceUsd ?? 0) - (a.lastPriceUsd ?? 0),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => (a.card.nameEn || a.card.name).localeCompare(b.card.nameEn || b.card.name),
      set: (a, b) =>
        (a.card.setName ?? "").localeCompare(b.card.setName ?? "") || (parseInt(a.card.number ?? "0") || 0) - (parseInt(b.card.number ?? "0") || 0),
    };
    return list.sort(by[sort]);
  }, [binder, q, lang, set, minValue, grade, sort]);

  const pageSize = Number(pockets);
  const pages = useMemo(() => {
    const out: BinderItem[][] = [];
    for (let i = 0; i < filtered.length; i += pageSize) out.push(filtered.slice(i, i + pageSize));
    return out;
  }, [filtered, pageSize]);

  const activeFilters = [lang !== "ALL", set !== "ALL", minValue > 0, grade !== "ALL"].filter(Boolean).length;
  const open = binder.find((b) => b.id === openId) ?? null;

  const reprice = async () => {
    setRepricing(true);
    try {
      const r = await api.binder.reprice();
      await loadBinder(true);
      toast(`Updated ${r.updated} prices${r.remaining ? ` · ${r.remaining} queued` : ""}`, "good");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setRepricing(false);
    }
  };

  return (
    <div className="min-h-dvh pb-nav">
      <TopBar
        title="Binder"
        sub={binderState === "ready" ? `${binder.reduce((s, b) => s + b.quantity, 0)} cards` : undefined}
        right={
          <button onClick={reprice} disabled={repricing || binderState !== "ready"} className="press grid h-9 w-9 place-items-center rounded-full bg-raised text-soft" aria-label="Refresh values">
            <Icon name="refresh" size={18} className={repricing ? "animate-spin" : ""} />
          </button>
        }
      />

      {binderState === "no-db" && (
        <div className="m-4 rounded-2xl border border-fair/40 bg-fair/10 p-4 text-sm text-fair">
          Your binder is stored in Supabase. Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> and run <code>supabase/schema.sql</code>.
        </div>
      )}
      {binderState === "error" && <div className="m-4 text-sm text-bad">Couldn’t load binder. Pull to refresh.</div>}

      {binderState === "ready" && (
        <div className="space-y-3 p-3">
          <CollectionSummary items={binder} />

          {/* search + filter bar */}
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-2xl bg-raised px-3">
              <Icon name="search" size={18} className="text-mute" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search binder" className="h-11 w-full bg-transparent outline-none placeholder:text-mute" />
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`press relative h-11 rounded-2xl px-3 text-sm font-semibold ${showFilters ? "bg-white text-ink" : "bg-raised"}`}
            >
              Filters
              {activeFilters > 0 && <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-[11px] text-ink">{activeFilters}</span>}
            </button>
          </div>

          {showFilters && (
            <div className="space-y-3 rounded-2xl bg-panel p-3">
              <FilterRow label="Language">
                <Chip active={lang === "ALL"} onClick={() => setLang("ALL")}>
                  All
                </Chip>
                {LANGUAGES.map((l) => (
                  <Chip key={l.code} active={lang === l.code} onClick={() => setLang(l.code)}>
                    {l.short}
                  </Chip>
                ))}
              </FilterRow>
              <FilterRow label="Value">
                {VALUE_STEPS.map((v) => (
                  <Chip key={v} active={minValue === v} onClick={() => setMinValue(v)}>
                    {v === 0 ? "Any" : `${money(v, { compact: true })}+`}
                  </Chip>
                ))}
              </FilterRow>
              <FilterRow label="Grade / condition">
                {(["ALL", ...CONDITIONS, "GRADED"] as GradeFilter[]).map((g) => (
                  <Chip key={g} active={grade === g} onClick={() => setGrade(g)}>
                    {g === "ALL" ? "All" : g === "GRADED" ? "Slabs" : g}
                  </Chip>
                ))}
              </FilterRow>
              <div>
                <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Set</div>
                <select value={set} onChange={(e) => setSet(e.target.value)} className="h-11 w-full rounded-xl bg-raised px-3 outline-none">
                  <option value="ALL">All sets</option>
                  {sets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <FilterRow label="Sort">
                {(["value", "newest", "name", "set"] as Sort[]).map((s) => (
                  <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
                    {s === "value" ? "Value" : s === "newest" ? "Newest" : s === "name" ? "Name" : "Set #"}
                  </Chip>
                ))}
              </FilterRow>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-mute">
              {filtered.length} shown · {money(filtered.reduce((s, b) => s + lineValue(b), 0))}
            </div>
            <div className="w-36">
              <Segmented
                size="sm"
                value={pockets}
                onChange={setPockets}
                options={[
                  { value: "4", label: "4-pocket" },
                  { value: "9", label: "9-pocket" },
                ]}
              />
            </div>
          </div>

          {/* binder pages */}
          <div className="space-y-4">
            {pages.map((page, pi) => (
              <div key={pi} className="rounded-3xl border border-line bg-linear-to-b from-panel to-ink p-2.5">
                <div className={`grid gap-2 ${pockets === "4" ? "grid-cols-2" : "grid-cols-3"}`}>
                  {Array.from({ length: pageSize }).map((_, i) => {
                    const b = page[i];
                    if (!b) return <div key={i} className="aspect-[63/88] rounded-lg border border-dashed border-line/60" />;
                    return (
                      <button key={b.id} onClick={() => setOpenId(b.id)} className="press relative overflow-hidden rounded-lg bg-raised ring-1 ring-white/5">
                        <CardThumb card={b.card} className="w-full" rounded="rounded-lg" />
                        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 to-transparent px-1.5 pt-4 pb-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`tabular font-bold ${pockets === "4" ? "text-sm" : "text-[11px]"}`}>{money(b.lastPriceUsd)}</span>
                            <span className="flex items-center gap-0.5">
                              <LangBadge lang={b.card.language} />
                            </span>
                          </div>
                        </div>
                        {b.quantity > 1 && <span className="absolute top-1 left-1 rounded-full bg-black/80 px-1.5 text-[10px] font-bold">×{b.quantity}</span>}
                        {b.grade && <span className="absolute top-1 right-1 rounded bg-gold px-1 text-[10px] font-extrabold text-ink">{b.grade.grade}</span>}
                        {!b.forTrade && !b.grade && <span className="absolute top-1 right-1 rounded bg-black/80 px-1 text-[9px] text-soft">PC</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 text-center text-[10px] text-mute">Page {pi + 1}</div>
              </div>
            ))}
            {filtered.length === 0 && <p className="py-10 text-center text-mute">{binder.length ? "No cards match these filters." : "Your binder is empty. Scan or add cards."}</p>}
          </div>
        </div>
      )}

      <button
        onClick={() => setAdding(true)}
        className="press fixed right-4 bottom-nav-offset z-30 mb-4 grid h-14 w-14 place-items-center rounded-full bg-gold text-ink shadow-xl"
        aria-label="Add card"
      >
        <Icon name="plus" size={26} strokeWidth={2.6} />
      </button>

      <CardSearchSheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add to binder"
        confirmLabel="Add to binder"
        onPick={async (p) => {
          try {
            const { item } = await api.binder.add({ card: p.card, condition: p.condition, priceUsd: p.price?.usd ?? null });
            upsertBinder(item);
            toast(`Added ${p.card.nameEn || p.card.name}`, "good");
          } catch (e) {
            toast(e instanceof ApiError && e.code === "DB_NOT_CONFIGURED" ? "Connect Supabase first" : (e as Error).message, "bad");
          }
        }}
      />
      <BinderItemSheet item={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">{label}</div>
      <div className="scrollbar-none flex gap-2 overflow-x-auto">{children}</div>
    </div>
  );
}

function CollectionSummary({ items }: { items: BinderItem[] }) {
  const money = useMoney();
  const total = items.reduce((s, b) => s + lineValue(b), 0);
  const cost = items.reduce((s, b) => s + (b.purchaseUsd ?? 0) * b.quantity, 0);
  const tradeable = items.filter((b) => b.forTrade).reduce((s, b) => s + lineValue(b), 0);
  const byLang = LANGUAGES.map((l) => ({ ...l, v: items.filter((b) => b.card.language === l.code).reduce((s, b) => s + lineValue(b), 0) })).filter((x) => x.v > 0);
  const top = [...items].sort((a, b) => (b.lastPriceUsd ?? 0) - (a.lastPriceUsd ?? 0)).slice(0, 3);
  const colors = ["bg-sky-400", "bg-rose-400", "bg-indigo-400", "bg-amber-400", "bg-orange-400"];
  const stale = items.filter((b) => !b.lastPricedAt || Date.now() - new Date(b.lastPricedAt).getTime() > 3 * 86400_000).length;

  return (
    <div className="rounded-3xl bg-panel p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold tracking-wide text-mute uppercase">Collection value</div>
          <div className="tabular text-3xl font-extrabold">{money(total)}</div>
          <div className="text-xs text-mute">
            {money(tradeable)} tradeable
            {cost > 0 && (
              <span className={total >= cost ? "text-good" : "text-bad"}>
                {" "}
                · {money(total - cost, { sign: true })} vs cost
              </span>
            )}
          </div>
        </div>
        <div className="flex -space-x-3">
          {top.map((b) => (
            <CardThumb key={b.id} card={b.card} className="w-10 ring-2 ring-panel" />
          ))}
        </div>
      </div>
      {byLang.length > 0 && (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-raised">
            {byLang.map((l, i) => (
              <div key={l.code} className={colors[LANGUAGES.findIndex((x) => x.code === l.code)] ?? colors[i]} style={{ width: `${(l.v / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-mute">
            {byLang.map((l) => (
              <span key={l.code}>
                {l.short} {Math.round((l.v / total) * 100)}%
              </span>
            ))}
          </div>
        </>
      )}
      {stale > 0 && <div className="mt-2 text-[11px] text-fair">{stale} card values older than 3 days — tap ↻</div>}
    </div>
  );
}

function BinderItemSheet({ item, onClose }: { item: BinderItem | null; onClose: () => void }) {
  const { upsertBinder, removeBinder } = useData();
  const add = useTrade((s) => s.add);
  const [price, setPrice] = useState<AggregatedPrice | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) return;
    setPrice(null);
    setLoading(true);
    api
      .prices([{ card: item.card, grade: item.grade }], { history: true })
      .then(({ prices }) => setPrice(prices[priceKey(item.card, item.grade)] ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return null;
  const patch = async (p: Parameters<typeof api.binder.update>[1]) => {
    try {
      const { item: next } = await api.binder.update(item.id, p);
      upsertBinder(next);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title={item.card.nameEn || item.card.name}
      footer={
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!window.confirm("Remove from binder?")) return;
              await api.binder.remove(item.id).catch(() => {});
              removeBinder(item.id);
              onClose();
            }}
            className="press grid h-13 w-14 place-items-center rounded-2xl bg-bad/15 text-bad"
            aria-label="Delete"
          >
            <Icon name="trash" />
          </button>
          <button
            onClick={() => {
              add({ side: "offer", card: item.card, condition: item.condition, grade: item.grade, source: "binder", binderItemId: item.id, price });
              toast("Added to my side of the trade", "good");
              onClose();
            }}
            className="press flex-1 rounded-2xl bg-give py-3.5 font-bold text-ink"
          >
            Offer in trade
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-4">
          <CardThumb card={item.card} className="w-32 shrink-0" rounded="rounded-xl" />
          <div className="min-w-0 space-y-1">
            <div className="flex gap-1">
              <LangBadge lang={item.card.language} />
              <VariantBadge variant={item.card.variant} />
            </div>
            <div className="text-lg leading-tight font-bold">{item.card.name}</div>
            <div className="text-sm text-mute">{item.card.setName}</div>
            <div className="tabular text-sm text-soft">#{item.card.number}</div>
            {item.card.rarity && <div className="text-xs text-mute">{item.card.rarity}</div>}
            {item.grade && (
              <div className="inline-block rounded bg-gold/20 px-1.5 text-sm font-bold text-gold">
                {item.grade.company} {item.grade.grade}
              </div>
            )}
          </div>
        </div>
        <PriceBreakdown price={price} loading={loading} />
        {!item.grade && (
          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Condition</div>
            <div className="flex gap-2">
              {CONDITIONS.map((c) => (
                <Chip key={c} active={item.condition === c} onClick={() => void patch({ condition: c })} className="flex-1 px-0">
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-2xl bg-raised p-4">
          <div>
            <div className="font-semibold">Available for trade</div>
            <div className="text-xs text-mute">Off = personal collection (hidden from the trade picker)</div>
          </div>
          <input type="checkbox" checked={item.forTrade} onChange={(e) => void patch({ forTrade: e.target.checked })} className="h-6 w-6 accent-[var(--color-gold)]" />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-wide text-mute uppercase">Quantity</div>
          <div className="flex items-center gap-3">
            <button onClick={() => item.quantity > 1 && void patch({ quantity: item.quantity - 1 })} className="press grid h-11 w-11 place-items-center rounded-full bg-raised" aria-label="Decrease">
              <Icon name="minus" />
            </button>
            <span className="tabular w-6 text-center text-lg font-bold">{item.quantity}</span>
            <button onClick={() => void patch({ quantity: item.quantity + 1 })} className="press grid h-11 w-11 place-items-center rounded-full bg-raised" aria-label="Increase">
              <Icon name="plus" />
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
