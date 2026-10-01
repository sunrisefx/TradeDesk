"use client";

import type { ReactNode } from "react";
import { LANGUAGES, VARIANTS, type CardLanguage, type CardRef, type Variant } from "@/lib/types";

/** Card image with a graceful placeholder (many Asian prints have no catalog image). */
export function CardThumb({ card, className = "", rounded = "rounded-md" }: { card: Pick<CardRef, "imageUrl" | "name" | "nameEn">; className?: string; rounded?: string }) {
  if (card.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote catalog art; skip Vercel image optimisation quota
      <img
        src={card.imageUrl.replace("/high.webp", "/low.webp")}
        alt={card.nameEn || card.name}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`aspect-[63/88] bg-raised object-cover ${rounded} ${className}`}
      />
    );
  }
  return (
    <div className={`grid aspect-[63/88] place-items-center bg-raised p-1 text-center text-[10px] leading-tight text-mute ${rounded} ${className}`}>
      {card.name || card.nameEn}
    </div>
  );
}

const LANG_COLORS: Record<CardLanguage, string> = {
  EN: "bg-sky-500/15 text-sky-300",
  JA: "bg-rose-500/15 text-rose-300",
  KO: "bg-indigo-500/15 text-indigo-300",
  "ZH-CN": "bg-amber-500/15 text-amber-300",
  "ZH-TW": "bg-orange-500/15 text-orange-300",
};

export function LangBadge({ lang, className = "" }: { lang: CardLanguage; className?: string }) {
  const l = LANGUAGES.find((x) => x.code === lang);
  return <span className={`inline-flex items-center rounded px-1 py-px text-[10px] font-semibold ${LANG_COLORS[lang]} ${className}`}>{l?.short ?? lang}</span>;
}

export function VariantBadge({ variant, className = "" }: { variant: Variant; className?: string }) {
  if (variant === "normal") return null;
  const v = VARIANTS.find((x) => x.id === variant);
  const tone =
    variant === "masterball" ? "bg-fuchsia-500/20 text-fuchsia-200" : variant === "pokeball" ? "bg-red-500/20 text-red-200" : "bg-white/10 text-soft";
  return <span className={`inline-flex rounded px-1 py-px text-[10px] font-semibold ${tone} ${className}`}>{v?.short ?? variant}</span>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`press flex-1 rounded-lg font-semibold whitespace-nowrap ${size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} ${
            value === o.value ? "bg-white text-ink" : "text-soft"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, className = "" }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`press shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
        active ? "border-white bg-white text-ink" : "border-line bg-raised text-soft"
      } ${className}`}
    >
      {children}
    </button>
  );
}
