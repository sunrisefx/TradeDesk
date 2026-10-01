"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { CONDITIONS } from "@/lib/types";
import { useSettings } from "@/store/settings";
import { TopBar, CurrencyToggle } from "@/components/nav/TopBar";
import { Icon } from "@/components/ui/Icon";

export function SettingsView() {
  const router = useRouter();
  const { conditionWeights, setConditionWeight, resetConditionWeights, fx, currency } = useSettings();

  return (
    <div className="min-h-dvh pb-nav">
      <TopBar
        title="Settings"
        right={
          <button onClick={() => router.back()} className="press grid h-9 w-9 place-items-center rounded-full bg-raised" aria-label="Back">
            <Icon name="back" size={18} />
          </button>
        }
      />
      <div className="space-y-4 p-4">
        <section className="rounded-2xl bg-panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Display currency</div>
              <div className="text-xs text-mute">
                {fx
                  ? `1 USD = ${fx.rates[currency].toLocaleString(undefined, { maximumFractionDigits: 4 })} ${currency}${fx.stale ? " (offline fallback)" : ""}`
                  : "Loading rates…"}
              </div>
            </div>
            <CurrencyToggle />
          </div>
        </section>

        <section className="rounded-2xl bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">Condition weights</div>
              <div className="text-xs text-mute">% of Near Mint market value applied on the trade desk</div>
            </div>
            <button onClick={resetConditionWeights} className="text-sm font-semibold text-gold">
              Reset
            </button>
          </div>
          <div className="space-y-3">
            {CONDITIONS.map((c) => (
              <label key={c} className="flex items-center gap-3">
                <span className="w-10 font-bold">{c}</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={conditionWeights[c]}
                  onChange={(e) => setConditionWeight(c, Number(e.target.value))}
                  className="flex-1 accent-[var(--color-gold)]"
                />
                <span className="tabular w-12 text-right">{Math.round(conditionWeights[c] * 100)}%</span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-panel p-4 text-sm text-soft">
          <div className="mb-1 font-semibold text-white">Pricing sources</div>
          <p>
            English cards: TCGplayer + Cardmarket via TCGdex (free). Japanese, Korean and Chinese prints: PriceCharting (sold data) and eBay. Configure keys in
            Vercel → Settings → Environment Variables.
          </p>
        </section>

        <button
          onClick={async () => {
            await api.lock().catch(() => {});
            router.replace("/unlock");
          }}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-raised py-3.5 font-semibold"
        >
          <Icon name="lock" size={18} /> Lock app
        </button>
      </div>
    </div>
  );
}
