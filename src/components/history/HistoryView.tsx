"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useMoney } from "@/hooks/useMoney";
import type { TradeRecordSummary } from "@/lib/types";
import { TopBar } from "@/components/nav/TopBar";
import { CardThumb } from "@/components/ui/Card";

export function HistoryView() {
  const money = useMoney();
  const [trades, setTrades] = useState<TradeRecordSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.trades
      .list()
      .then((r) => setTrades(r.trades))
      .catch((e) => setErr(e instanceof ApiError && e.code === "DB_NOT_CONFIGURED" ? "Connect Supabase to keep trade history." : (e as Error).message));
  }, []);

  const lifetime = trades?.reduce((s, t) => s + t.netUsd, 0) ?? 0;

  return (
    <div className="min-h-dvh pb-nav">
      <TopBar title="History" sub={trades ? `${trades.length} trades · ${money(lifetime, { sign: true })} lifetime` : undefined} />
      <div className="space-y-2 p-3">
        {err && <p className="rounded-2xl bg-fair/10 p-4 text-sm text-fair">{err}</p>}
        {trades?.length === 0 && <p className="py-10 text-center text-mute">No completed trades yet.</p>}
        {trades?.map((t) => {
          const tone = t.equity === "favorable" ? "text-good" : t.equity === "unfavorable" ? "text-bad" : "text-fair";
          const expanded = open === t.id;
          return (
            <button key={t.id} onClick={() => setOpen(expanded ? null : t.id)} className="press block w-full rounded-2xl bg-panel p-3 text-left">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{t.counterparty || t.location || "Trade"}</div>
                  <div className="text-xs text-mute">
                    {new Date(t.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    {t.location && t.counterparty && ` · ${t.location}`} · {t.presetLabel}
                  </div>
                </div>
                <div className={`tabular text-right font-bold ${tone}`}>{money(t.netUsd, { sign: true })}</div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-mute">
                <span className="text-give">gave {money(t.offeredTotalUsd)}</span>
                <span>→</span>
                <span className="text-get">got {money(t.receivedTotalUsd)}</span>
                {t.cashDeltaUsd !== 0 && <span>· cash {money(t.cashDeltaUsd, { sign: true })}</span>}
              </div>
              {expanded && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
                  {(["offer", "receive"] as const).map((side) => (
                    <div key={side} className="space-y-1.5">
                      {t.lines
                        .filter((l) => l.side === side)
                        .map((l, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <CardThumb card={l.card} className="w-8 shrink-0" />
                            <div className="min-w-0 text-xs">
                              <div className="truncate">{l.card.nameEn || l.card.name}</div>
                              <div className="tabular text-mute">
                                {l.condition} · {money(l.adjustedUsd)}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
