"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useMoney } from "@/hooks/useMoney";
import { useData } from "@/store/data";
import { toast } from "@/store/toast";
import { TopBar } from "@/components/nav/TopBar";
import { Icon } from "@/components/ui/Icon";
import { CardThumb, LangBadge, VariantBadge } from "@/components/ui/Card";
import { CardSearchSheet } from "@/components/search/CardSearchSheet";

const PRIORITY = { 1: "Grail", 2: "Want", 3: "Nice to have" } as const;

export function WishlistView() {
  const { wishlist, wishlistState, loadWishlist, addWishlist, removeWishlist } = useData();
  const money = useMoney();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void loadWishlist();
  }, [loadWishlist]);

  return (
    <div className="min-h-dvh pb-nav">
      <TopBar title="Wishlist" sub="Flagged automatically on the trade desk" />
      <div className="space-y-2 p-3">
        {wishlistState === "no-db" && <p className="rounded-2xl bg-fair/10 p-4 text-sm text-fair">Connect Supabase to keep a wishlist.</p>}
        {wishlistState === "ready" && wishlist.length === 0 && (
          <p className="py-10 text-center text-mute">Nothing yet. Add the cards you're hunting — they light up gold when a dealer's card matches.</p>
        )}
        {wishlist.map((w) => (
          <div key={w.id} className="flex items-center gap-3 rounded-2xl bg-panel p-2.5">
            <CardThumb card={{ imageUrl: w.imageUrl, name: w.name, nameEn: w.nameEn }} className="w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{w.nameEn || w.name}</div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-mute">
                {w.language ? <LangBadge lang={w.language} /> : <span className="rounded bg-white/10 px-1 text-[10px]">Any lang</span>}
                {w.variant && <VariantBadge variant={w.variant} />}
                <span className="truncate">
                  {w.setName} {w.number && `#${w.number}`}
                </span>
              </div>
              <div className="text-xs">
                <span className={w.priority === 1 ? "font-bold text-gold" : "text-soft"}>{PRIORITY[w.priority]}</span>
                {w.maxPriceUsd != null && <span className="text-mute"> · max {money(w.maxPriceUsd)}</span>}
              </div>
            </div>
            <button
              onClick={async () => {
                await api.wishlist.remove(w.id).catch(() => {});
                removeWishlist(w.id);
              }}
              className="press grid h-10 w-10 place-items-center rounded-full bg-raised text-mute"
              aria-label="Remove"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setAdding(true)}
        className="press fixed right-4 bottom-nav-offset z-30 mb-4 grid h-14 w-14 place-items-center rounded-full bg-gold text-ink shadow-xl"
        aria-label="Add to wishlist"
      >
        <Icon name="plus" size={26} strokeWidth={2.6} />
      </button>

      <CardSearchSheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add to wishlist"
        confirmLabel="★ Wishlist"
        showCondition={false}
        onPick={async (p) => {
          try {
            const { item } = await api.wishlist.add({ card: p.card, maxPriceUsd: p.price?.usd ? Math.round(p.price.usd * 1.1) : null });
            addWishlist(item);
            toast("Added to wishlist", "good");
            setAdding(false);
          } catch (e) {
            toast(e instanceof ApiError && e.code === "DB_NOT_CONFIGURED" ? "Connect Supabase first" : (e as Error).message, "bad");
          }
        }}
      />
    </div>
  );
}
