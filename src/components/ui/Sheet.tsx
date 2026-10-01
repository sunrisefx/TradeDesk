"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

/** iOS-style bottom sheet. Locks body scroll while open; respects the home indicator. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  full = false,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  full?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`animate-sheet relative flex flex-col rounded-t-3xl border-t border-line bg-panel pl-safe pr-safe ${
          full ? "h-[94dvh]" : "max-h-[90dvh]"
        }`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" />
        {title != null && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
            <div className="min-w-0 text-lg font-semibold">{title}</div>
            <button onClick={onClose} className="press grid h-9 w-9 place-items-center rounded-full bg-raised text-soft" aria-label="Close">
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-4 pt-3 pb-safe">
            <div className="pb-3">{footer}</div>
          </div>
        ) : (
          <div className="pb-safe" />
        )}
      </div>
    </div>
  );
}
