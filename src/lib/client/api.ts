"use client";

import type {
  AggregatedPrice,
  BinderItem,
  CardLanguage,
  CardRef,
  CatalogMatch,
  Condition,
  FxRates,
  GradeInfo,
  ScanIdentity,
  TradeRecordSummary,
  WishlistItem,
} from "@/lib/types";

// Typed client for our own route handlers.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && path !== "/api/auth") {
    // Session expired — bounce to the lock screen.
    if (typeof window !== "undefined") window.location.href = `/unlock?next=${encodeURIComponent(location.pathname)}`;
    throw new ApiError("locked", 401);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data;
}

export interface ScanResponse {
  identity: ScanIdentity;
  matches: CatalogMatch[];
  price: AggregatedPrice | null;
  grade: GradeInfo | null;
  provider: string;
  model: string;
  timings: Record<string, number>;
}

export const api = {
  scan: (image: string, languageHint: CardLanguage | null, signal?: AbortSignal) =>
    call<ScanResponse>("/api/scan", { method: "POST", json: { image, mediaType: "image/jpeg", languageHint }, signal }),

  search: (q: string, lang: CardLanguage, signal?: AbortSignal) =>
    call<{ results: CardRef[] }>(`/api/search?q=${encodeURIComponent(q)}&lang=${lang}`, { signal }),

  prices: (items: { card: CardRef; grade?: GradeInfo | null }[], opts: { fresh?: boolean; history?: boolean } = {}) =>
    call<{ prices: Record<string, AggregatedPrice> }>("/api/prices", { method: "POST", json: { items, ...opts } }),

  fx: () => call<FxRates>("/api/fx"),

  binder: {
    list: () => call<{ items: BinderItem[] }>("/api/binder"),
    add: (body: {
      card: CardRef;
      condition?: Condition;
      grade?: GradeInfo | null;
      quantity?: number;
      forTrade?: boolean;
      priceUsd?: number | null;
    }) => call<{ item: BinderItem; merged: boolean }>("/api/binder", { method: "POST", json: body }),
    update: (id: string, patch: Partial<{ condition: Condition; quantity: number; forTrade: boolean; grade: GradeInfo | null; notes: string; variant: string }>) =>
      call<{ item: BinderItem }>(`/api/binder/${id}`, { method: "PATCH", json: patch }),
    remove: (id: string) => call<{ ok: true }>(`/api/binder/${id}`, { method: "DELETE" }),
    reprice: () => call<{ updated: number; failed: number; remaining: number }>("/api/binder/reprice", { method: "POST" }),
  },

  wishlist: {
    list: () => call<{ items: WishlistItem[] }>("/api/wishlist"),
    add: (body: { card: CardRef; anyLanguage?: boolean; anyVariant?: boolean; maxPriceUsd?: number | null; priority?: 1 | 2 | 3 }) =>
      call<{ item: WishlistItem }>("/api/wishlist", { method: "POST", json: body }),
    remove: (id: string) => call<{ ok: true }>(`/api/wishlist/${id}`, { method: "DELETE" }),
  },

  trades: {
    list: () => call<{ trades: TradeRecordSummary[] }>("/api/trades"),
    complete: (payload: unknown) => call<{ id: string }>("/api/trades", { method: "POST", json: payload }),
  },

  unlock: (passcode: string) => call<{ ok: true }>("/api/auth", { method: "POST", json: { passcode } }),
  lock: () => call<{ ok: true }>("/api/auth", { method: "DELETE" }),
};
