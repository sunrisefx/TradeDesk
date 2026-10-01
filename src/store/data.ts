"use client";

import { create } from "zustand";
import { ApiError, api } from "@/lib/client/api";
import type { BinderItem, WishlistItem } from "@/lib/types";

// In-memory cache of the binder + wishlist (source of truth is Postgres).

type LoadState = "idle" | "loading" | "ready" | "error" | "no-db";

interface DataState {
  binder: BinderItem[];
  binderState: LoadState;
  wishlist: WishlistItem[];
  wishlistState: LoadState;
  error: string | null;
  loadBinder: (force?: boolean) => Promise<void>;
  loadWishlist: (force?: boolean) => Promise<void>;
  upsertBinder: (item: BinderItem) => void;
  removeBinder: (id: string) => void;
  addWishlist: (item: WishlistItem) => void;
  removeWishlist: (id: string) => void;
}

const stateFor = (e: unknown): LoadState => (e instanceof ApiError && e.code === "DB_NOT_CONFIGURED" ? "no-db" : "error");

export const useData = create<DataState>()((set, get) => ({
  binder: [],
  binderState: "idle",
  wishlist: [],
  wishlistState: "idle",
  error: null,
  loadBinder: async (force = false) => {
    const st = get().binderState;
    if (!force && (st === "loading" || st === "ready" || st === "no-db")) return;
    set({ binderState: "loading" });
    try {
      const { items } = await api.binder.list();
      set({ binder: items, binderState: "ready" });
    } catch (e) {
      set({ binderState: stateFor(e), error: (e as Error).message });
    }
  },
  loadWishlist: async (force = false) => {
    const st = get().wishlistState;
    if (!force && (st === "loading" || st === "ready" || st === "no-db")) return;
    set({ wishlistState: "loading" });
    try {
      const { items } = await api.wishlist.list();
      set({ wishlist: items, wishlistState: "ready" });
    } catch (e) {
      set({ wishlistState: stateFor(e), error: (e as Error).message });
    }
  },
  upsertBinder: (item) =>
    set((s) => {
      const exists = s.binder.some((b) => b.id === item.id);
      return { binder: exists ? s.binder.map((b) => (b.id === item.id ? item : b)) : [item, ...s.binder] };
    }),
  removeBinder: (id) => set((s) => ({ binder: s.binder.filter((b) => b.id !== id) })),
  addWishlist: (item) => set((s) => ({ wishlist: [item, ...s.wishlist] })),
  removeWishlist: (id) => set((s) => ({ wishlist: s.wishlist.filter((w) => w.id !== id) })),
}));
