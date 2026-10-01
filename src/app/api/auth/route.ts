import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/server/env";
import { SESSION_COOKIE, SESSION_MAX_AGE, expectedSessionToken, safeEqual } from "@/lib/server/session";

// POST   /api/auth  body: { passcode } → sets the session cookie
// DELETE /api/auth  → clears it (lock the app)

export const runtime = "nodejs";

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: NextRequest) {
  if (!env.appPasscode) return NextResponse.json({ ok: true, open: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { passcode?: string } | null;
  const given = typeof body?.passcode === "string" ? body.passcode.trim() : "";
  if (!safeEqual(given, env.appPasscode)) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }
  attempts.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await expectedSessionToken(env.appPasscode, env.sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
