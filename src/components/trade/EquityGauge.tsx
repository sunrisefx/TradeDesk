"use client";

import type { Equity } from "@/lib/types";

const RANGE = 30; // gauge spans −30% … +30% net

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

const LABEL: Record<Equity, string> = { favorable: "Favorable", fair: "Fair", unfavorable: "Unfavorable", empty: "—" };
const TONE: Record<Equity, string> = { favorable: "text-good", fair: "text-fair", unfavorable: "text-bad", empty: "text-mute" };

/** Semicircular trade-equity meter: red (bad) ← amber (fair band) → green (good). */
export function EquityGauge({ netPct, equity, fairBandPct, size = 112 }: { netPct: number; equity: Equity; fairBandPct: number; size?: number }) {
  const w = 120;
  const h = 70;
  const cx = 60;
  const cy = 62;
  const r = 48;
  const band = Math.min(85, (fairBandPct / RANGE) * 90);
  const clamped = Math.max(-RANGE, Math.min(RANGE, equity === "empty" ? 0 : netPct));
  const angle = (clamped / RANGE) * 90;
  const tip = polar(cx, cy, r - 8, angle);

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} role="img" aria-label={`Trade is ${LABEL[equity]}, ${netPct}%`}>
        <path d={arc(cx, cy, r, -90, -band)} stroke="var(--color-bad)" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.9} />
        <path d={arc(cx, cy, r, -band, band)} stroke="var(--color-fair)" strokeWidth={9} fill="none" opacity={0.95} />
        <path d={arc(cx, cy, r, band, 90)} stroke="var(--color-good)" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.9} />
        <line
          x1={cx}
          y1={cy}
          x2={tip.x}
          y2={tip.y}
          stroke="white"
          strokeWidth={3.5}
          strokeLinecap="round"
          style={{ transition: "all 350ms cubic-bezier(.2,.8,.2,1)" }}
        />
        <circle cx={cx} cy={cy} r={5} fill="white" />
      </svg>
      <div className={`-mt-1 text-xs font-bold tracking-wide uppercase ${TONE[equity]}`}>{LABEL[equity]}</div>
    </div>
  );
}
