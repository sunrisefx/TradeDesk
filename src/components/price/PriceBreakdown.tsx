"use client";

import { useMoney } from "@/hooks/useMoney";
import type { AggregatedPrice } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { Sparkline } from "./Sparkline";

function Trend({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <div className={`flex items-center gap-1 text-sm font-semibold ${up ? "text-good" : "text-bad"}`}>
      <Icon name={up ? "trendUp" : "trendDown"} size={16} />
      <span className="tabular">
        {up ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
      <span className="text-xs font-normal text-mute">{label}</span>
    </div>
  );
}

/** Per-source price breakdown with trends and history — shown in card detail sheets. */
export function PriceBreakdown({ price, loading }: { price: AggregatedPrice | null; loading?: boolean }) {
  const money = useMoney();
  if (loading) return <div className="rounded-2xl bg-raised p-4 text-center text-mute">Fetching live prices…</div>;
  if (!price || price.quotes.length === 0)
    return <div className="rounded-2xl bg-raised p-4 text-sm text-mute">No market data found. Set a sticker price instead.</div>;

  return (
    <div className="space-y-3 rounded-2xl bg-raised p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold tracking-wide text-mute uppercase">Market value (NM)</div>
          <div className="tabular text-3xl font-bold">{money(price.usd)}</div>
          <div className="text-xs text-mute">
            {price.confidence} confidence · updated {new Date(price.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Sparkline points={price.history} />
          <Trend label="7d" pct={price.trend7dPct} />
          <Trend label="30d" pct={price.trend30dPct} />
        </div>
      </div>
      <div className="divide-y divide-line">
        {price.quotes.map((q) => (
          <a key={q.source + q.label} href={q.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {q.label}
                {q.source === price.primarySource && <span className="rounded bg-white/10 px-1 text-[10px] text-soft">primary</span>}
              </div>
              <div className="text-xs text-mute">
                {q.kind}
                {q.sampleSize ? ` · ${q.sampleSize} listings` : ""}
                {!q.variantMatched && <span className="text-fair"> · other printing</span>}
                {q.currency !== "USD" && ` · ${q.market.toLocaleString(undefined, { style: "currency", currency: q.currency })}`}
              </div>
            </div>
            <div className="tabular text-right font-semibold">{money(q.usd)}</div>
          </a>
        ))}
      </div>
      {Object.keys(price.gradedUsd).length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wide text-mute uppercase">Graded</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(price.gradedUsd).map(([k, v]) => (
              <span key={k} className="tabular rounded-lg bg-panel px-2 py-1 text-xs">
                <span className="text-mute">{/^\d/.test(k) ? `Grade ${k}` : k}</span> {money(v)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
