import { NextResponse, type NextRequest } from "next/server";
import { searchCatalog } from "@/lib/server/catalog/resolve";
import { handle } from "@/lib/server/http";
import { parseLanguage } from "@/lib/server/validate";

// GET /api/search?q=charizard%20199&lang=EN → { results: CardRef[] }
// Powers the manual add / autocomplete modal (the fallback when the camera struggles).

export const runtime = "nodejs";

export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const lang = parseLanguage(req.nextUrl.searchParams.get("lang")) ?? "EN";
  const results = await searchCatalog(q.slice(0, 80), lang);
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
});
