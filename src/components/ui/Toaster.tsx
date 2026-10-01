"use client";

import { useToast } from "@/store/toast";

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-safe z-[70] flex flex-col items-center gap-2 px-4 pt-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-sheet rounded-full px-4 py-2 text-sm font-semibold shadow-xl ${
            t.tone === "good" ? "bg-good text-ink" : t.tone === "bad" ? "bg-bad text-ink" : "bg-white text-ink"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
