"use client";

import type { PricePoint } from "@/lib/types";

/** Tiny line chart of price history. Colour follows direction (first → last). */
export function Sparkline({ points, width = 140, height = 36 }: { points: PricePoint[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.usd);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Price history">
      <path d={d} fill="none" stroke={up ? "var(--color-good)" : "var(--color-bad)"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
