import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, expectedSessionToken, safeEqual } from "@/lib/server/session";

// Next.js 16 "proxy" (formerly middleware): gate the whole app behind APP_PASSCODE so
// nobody at the show can burn through your vision/pricing API credits.

export async function proxy(req: NextRequest) {
  const passcode = process.env.APP_PASSCODE?.trim();
  if (!passcode) return NextResponse.next(); // lock disabled (local dev)

  const token = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  const expected = await expectedSessionToken(passcode, process.env.SESSION_SECRET ?? "");
  if (token && safeEqual(token, expected)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except static assets, PWA files, the unlock screen, auth and cron endpoints.
    "/((?!_next/static|_next/image|icons/|splash/|manifest.json|sw.js|favicon.ico|robots.txt|unlock|api/auth|api/cron).*)",
  ],
};
