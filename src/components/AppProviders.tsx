"use client";

import { useEffect, type ReactNode } from "react";
import { useFxBootstrap } from "@/hooks/useMoney";
import { useSettings } from "@/store/settings";
import { useTrade } from "@/store/trade";
import { Toaster } from "@/components/ui/Toaster";
import { BottomNav } from "@/components/nav/BottomNav";
import { InstallHint } from "@/components/pwa/InstallHint";

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Persisted stores hydrate after mount so server and first client render match.
    void useSettings.persist.rehydrate();
    void useTrade.persist.rehydrate();

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  useFxBootstrap();

  return (
    <>
      {children}
      <BottomNav />
      <Toaster />
      <InstallHint />
    </>
  );
}
