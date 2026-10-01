"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTrade } from "@/store/trade";
import { Icon, type IconName } from "@/components/ui/Icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Trade", icon: "trade" },
  { href: "/scan", label: "Scan", icon: "camera" },
  { href: "/binder", label: "Binder", icon: "grid" },
  { href: "/wishlist", label: "Wishlist", icon: "star" },
  { href: "/history", label: "History", icon: "clock" },
];

export function BottomNav() {
  const path = usePathname();
  const tradeCount = useTrade((s) => s.lines.length);
  if (path.startsWith("/unlock")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-ink/90 pb-safe backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`press relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-gold" : "text-mute"}`}
            >
              <Icon name={t.icon} size={24} strokeWidth={active ? 2.4 : 2} />
              {t.label}
              {t.href === "/" && tradeCount > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-ink">
                  {tradeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
