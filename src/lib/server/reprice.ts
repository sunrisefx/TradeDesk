import "server-only";
import { requireDb, rowToCard, type BinderRow } from "@/lib/server/db";
import { getAggregatedPrice } from "@/lib/server/pricing/aggregate";
import { gradeKey } from "@/lib/trade/math";

/**
 * Refresh last_price_usd for the binder items priced longest ago.
 * Used by the daily Vercel Cron and the "Refresh values" button.
 */
export async function repriceBinder(limit = 60, budgetMs = 50_000): Promise<{ updated: number; failed: number; remaining: number }> {
  const sb = requireDb();
  const started = Date.now();
  const { data, error } = await sb
    .from("binder_items")
    .select("*")
    .order("last_priced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as BinderRow[];

  let updated = 0;
  let failed = 0;
  let idx = 0;
  async function worker() {
    while (idx < rows.length && Date.now() - started < budgetMs) {
      const r = rows[idx++];
      try {
        const grade = r.grading_company && r.grade != null ? { company: r.grading_company, grade: Number(r.grade) } : null;
        const p = await getAggregatedPrice(rowToCard(r), { grade, fresh: true });
        const usd = (grade ? p.gradedUsd[gradeKey(grade)] : undefined) ?? p.usd;
        await sb
          .from("binder_items")
          .update({ last_price_usd: usd, last_priced_at: new Date().toISOString() })
          .eq("id", r.id);
        if (usd != null) updated++;
      } catch {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  return { updated, failed, remaining: Math.max(0, rows.length - idx) };
}
