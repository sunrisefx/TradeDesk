"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * iOS Safari has no install prompt. Show a one-time hint explaining
 * Share → "Add to Home Screen" when running in the browser (not standalone).
 */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("td-install-dismissed") === "1";
    } catch {
      /* private mode */
    }
    if (ios && !standalone && !dismissed) setShow(true);
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem("td-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-nav-offset z-40 mb-3 rounded-2xl border border-line bg-raised p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold text-ink">
          <Icon name="share" />
        </div>
        <div className="flex-1 text-sm">
          <div className="font-semibold">Install TradeDesk</div>
          <div className="text-soft">
            Tap <b>Share</b> then <b>Add to Home Screen</b> for full-screen, one-tap access at the show.
          </div>
        </div>
        <button onClick={dismiss} className="text-mute" aria-label="Dismiss">
          <Icon name="x" size={18} />
        </button>
      </div>
    </div>
  );
}
