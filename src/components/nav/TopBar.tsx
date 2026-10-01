"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CURRENCIES, type Currency } from "@/lib/types";
import { useSettings } from "@/store/settings";
import { Icon } from "@/components/ui/Icon";

const SYMBOL: Record<Currency, string> = { USD: "$", GBP: "£", EUR: "€", JPY: "¥" };

export function CurrencyToggle() {
  const currency = useSettings((s) => s.currency);
  const setCurrency = useSettings((s) => s.setCurrency);
  const stale = useSettings((s) => s.fx?.stale);
  return (
    <div className="flex rounded-full bg-raised p-0.5" title={stale ? "Using fallback FX rates" : undefined}>
      {CURRENCIES.map((c) => (
        <button
          key={c}
          onClick={() => setCurrency(c)}
          className={`press h-8 w-8 rounded-full text-sm font-bold ${currency === c ? "bg-white text-ink" : "text-soft"}`}
          aria-label={`Show prices in ${c}`}
        >
          {SYMBOL[c]}
        </button>
      ))}
    </div>
  );
}

/** Sticky translucent header that clears the Dynamic Island / notch. */
export function TopBar({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-ink/85 pt-safe backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight">{title}</h1>
          {sub && <div className="-mt-0.5 truncate text-xs text-mute">{sub}</div>}
        </div>
        <div className="flex items-center gap-2">
          {right ?? <CurrencyToggle />}
          <Link href="/settings" className="press grid h-9 w-9 place-items-center rounded-full bg-raised text-soft" aria-label="Settings">
            <Icon name="gear" size={18} />
          </Link>
        </div>
      </div>
    </header>
  );
}
