import { NextResponse, type NextRequest } from "next/server";
import { identifyCard, type ImageMediaType } from "@/lib/server/vision";
import { resolveIdentity } from "@/lib/server/catalog/resolve";
import { getAggregatedPrice } from "@/lib/server/pricing/aggregate";
import { handle, jsonError } from "@/lib/server/http";
import { parseLanguage } from "@/lib/server/validate";
import type { GradeInfo } from "@/lib/types";

// POST /api/scan
// body: { image: "<base64 jpeg, no data: prefix>", mediaType?: "image/jpeg", languageHint?: "JA" }
// → { identity, matches[], price, timings }

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_BASE64 = 5_500_000; // ≈4MB binary; client sends ~250–500KB

export const POST = handle(async (req: NextRequest) => {
  const t0 = Date.now();
  const body = (await req.json().catch(() => null)) as { image?: string; mediaType?: string; languageHint?: string } | null;
  let image = body?.image;
  if (!image || typeof image !== "string") return jsonError("image (base64) is required");
  image = image.replace(/^data:image\/\w+;base64,/, "");
  if (image.length > MAX_BASE64) return jsonError("Image too large — the client should downscale before upload", 413);

  const mediaType: ImageMediaType = (["image/jpeg", "image/png", "image/webp"] as const).includes(body?.mediaType as ImageMediaType)
    ? (body!.mediaType as ImageMediaType)
    : "image/jpeg";
  const hint = parseLanguage(body?.languageHint);

  const { identity, provider, model } = await identifyCard(image, mediaType, hint);
  const t1 = Date.now();

  if (!identity.nameLocalized && !identity.nameEnglish) {
    return NextResponse.json({ identity, matches: [], price: null, provider, model, timings: { visionMs: t1 - t0 } });
  }

  const matches = await resolveIdentity(identity);
  const t2 = Date.now();

  const grade: GradeInfo | null =
    identity.isGraded && identity.gradingCompany && identity.grade ? { company: identity.gradingCompany, grade: identity.grade } : null;
  const price = matches[0] ? await getAggregatedPrice(matches[0].card, { grade }).catch(() => null) : null;
  const t3 = Date.now();

  return NextResponse.json({
    identity,
    matches,
    price,
    grade,
    provider,
    model,
    timings: { visionMs: t1 - t0, catalogMs: t2 - t1, pricingMs: t3 - t2, totalMs: t3 - t0 },
  });
});
