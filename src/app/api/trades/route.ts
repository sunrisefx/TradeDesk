import { NextResponse, type NextRequest } from "next/server";
import { requireDb } from "@/lib/server/db";
import { handle, jsonError } from "@/lib/server/http";
import { parseCard, parseCondition, parseMoney } from "@/lib/server/validate";
import { cardKey, type CardRef, type Condition, type Equity, type TradeRecordSummary, type TradeSide } from "@/lib/types";

// GET  /api/trades → { trades: TradeRecordSummary[] }  (most recent 100)
// POST /api/trades → completes a trade atomically via the complete_trade() SQL function:
//   records it, removes offered cards from the binder, adds received cards.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TradeRow {
  id: string;
  created_at: string;
  location: string | null;
  counterparty: string | null;
  preset: { label?: string };
  offered_total_usd: string | number;
  received_total_usd: string | number;
  cash_delta_usd: string | number;
  net_usd: string | number;
  equity: Equity;
  trade_lines: { side: TradeSide; card: CardRef; condition: Condition; quantity: number; adjusted_usd: string | number }[];
}

export const GET = handle(async () => {
  const { data, error } = await requireDb()
    .from("trades")
    .select("*, trade_lines(side, card, condition, quantity, adjusted_usd)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const trades: TradeRecordSummary[] = (data as TradeRow[]).map((t) => ({
    id: t.id,
    createdAt: t.created_at,
    location: t.location,
    counterparty: t.counterparty,
    presetLabel: t.preset?.label ?? "",
    offeredTotalUsd: Number(t.offered_total_usd),
    receivedTotalUsd: Number(t.received_total_usd),
    cashDeltaUsd: Number(t.cash_delta_usd),
    netUsd: Number(t.net_usd),
    equity: t.equity,
    lines: t.trade_lines.map((l) => ({ side: l.side, card: l.card, condition: l.condition, quantity: l.quantity, adjustedUsd: Number(l.adjusted_usd) })),
  }));
  return NextResponse.json({ trades });
});

export const POST = handle(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) return jsonError("lines[] required");

  const lines = (body.lines as Record<string, unknown>[]).map((l) => {
    const card = parseCard(l.card);
    if (!card) throw Object.assign(new Error("invalid card in lines"), { status: 400 });
    const side = l.side === "offer" ? "offer" : "receive";
    return {
      side,
      card,
      cardKey: cardKey(card),
      condition: parseCondition(l.condition),
      quantity: Math.max(1, Number(l.quantity) || 1),
      marketUsd: parseMoney(l.marketUsd),
      adjustedUsd: parseMoney(l.adjustedUsd) ?? 0,
      binderItemId: typeof l.binderItemId === "string" && /^[0-9a-f-]{36}$/i.test(l.binderItemId) ? l.binderItemId : null,
    };
  });

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const payload = {
    location: typeof body.location === "string" ? body.location.slice(0, 120) : null,
    counterparty: typeof body.counterparty === "string" ? body.counterparty.slice(0, 120) : null,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
    preset: body.preset ?? {},
    displayCurrency: typeof body.displayCurrency === "string" ? body.displayCurrency : "USD",
    fxRate: num(body.fxRate) || 1,
    offeredTotalUsd: num(body.offeredTotalUsd),
    receivedTotalUsd: num(body.receivedTotalUsd),
    cashDeltaUsd: num(body.cashDeltaUsd),
    netUsd: num(body.netUsd),
    equity: ["favorable", "fair", "unfavorable"].includes(body.equity as string) ? body.equity : "fair",
    addReceivedToBinder: body.addReceivedToBinder !== false,
    lines,
  };

  const { data, error } = await requireDb().rpc("complete_trade", { payload });
  if (error) throw error;
  return NextResponse.json({ id: data as string }, { status: 201 });
});
