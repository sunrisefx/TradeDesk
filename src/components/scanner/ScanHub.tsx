"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/client/api";
import { useData } from "@/store/data";
import { useTrade } from "@/store/trade";
import { toast } from "@/store/toast";
import { TopBar } from "@/components/nav/TopBar";
import { Icon } from "@/components/ui/Icon";
import { CameraScanner, type ScanConfirm } from "@/components/scanner/CameraScanner";

/** Quick-scan hub: identify + price any card, then file it to binder / wishlist / trade. */
export function ScanHub() {
  const [open, setOpen] = useState(false);
  const { upsertBinder, addWishlist } = useData();
  const add = useTrade((s) => s.add);
  const [last, setLast] = useState<string[]>([]);

  useEffect(() => setOpen(true), []);

  const noDb = (e: unknown) => {
    if (e instanceof ApiError && e.code === "DB_NOT_CONFIGURED") toast("Connect Supabase to save cards", "bad");
    else toast((e as Error).message, "bad");
  };
  const log = (s: string) => setLast((l) => [s, ...l].slice(0, 8));

  const toBinder = async (r: ScanConfirm) => {
    try {
      const { item, merged } = await api.binder.add({ card: r.card, condition: r.condition, grade: r.grade, priceUsd: r.price?.usd ?? null });
      upsertBinder(item);
      toast(merged ? `+1 ${r.card.nameEn} (now ×${item.quantity})` : `Added ${r.card.nameEn} to binder`, "good");
      log(`Binder · ${r.card.nameEn} ${r.card.number ?? ""}`);
    } catch (e) {
      noDb(e);
    }
  };
  const toWishlist = async (r: ScanConfirm) => {
    try {
      const { item } = await api.wishlist.add({ card: r.card });
      addWishlist(item);
      toast(`★ ${r.card.nameEn} wishlisted`, "good");
      log(`Wishlist · ${r.card.nameEn}`);
    } catch (e) {
      noDb(e);
    }
  };

  return (
    <div className="min-h-dvh pb-nav">
      <TopBar title="Scan" />
      <div className="space-y-4 p-4">
        <button onClick={() => setOpen(true)} className="press flex w-full flex-col items-center gap-2 rounded-3xl bg-gold py-10 text-ink">
          <Icon name="camera" size={40} />
          <span className="text-lg font-extrabold">Open scanner</span>
          <span className="text-sm opacity-70">EN · 日本語 · 한국어 · 简体 · 繁體</span>
        </button>
        <div className="rounded-2xl bg-panel p-4 text-sm text-soft">
          <div className="mb-1 font-semibold text-white">Tips for sleeves &amp; top-loaders</div>
          <ul className="list-disc space-y-1 pl-5">
            <li>Tilt the card ~10° so overhead lights reflect off-axis.</li>
            <li>Fill the gold frame; the number in the corner must be readable.</li>
            <li>Dim hall? Turn on the torch, or use the Find button to search by name.</li>
            <li>Slabs work too — the label is read for grade and cert.</li>
          </ul>
        </div>
        {last.length > 0 && (
          <div className="rounded-2xl bg-panel p-4">
            <div className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">This session</div>
            <ul className="space-y-1 text-sm">
              {last.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <Link href="/binder" className="mt-3 inline-block text-sm font-semibold text-gold">
              Open binder →
            </Link>
          </div>
        )}
      </div>

      <CameraScanner
        open={open}
        onClose={() => setOpen(false)}
        title="Scan card"
        continuous
        actions={[
          { label: "Add to binder", tone: "gold", onClick: toBinder },
          { label: "★ Wishlist", tone: "plain", onClick: toWishlist },
          {
            label: "Offer in trade",
            tone: "give",
            onClick: (r) => {
              add({ side: "offer", card: r.card, condition: r.condition, grade: r.grade, source: "scan", price: r.price });
              toast("Added to my side", "good");
            },
          },
          {
            label: "Want in trade",
            tone: "get",
            onClick: (r) => {
              add({ side: "receive", card: r.card, condition: r.condition, grade: r.grade, source: "scan", price: r.price });
              toast("Added to their side", "good");
            },
          },
        ]}
      />
    </div>
  );
}
