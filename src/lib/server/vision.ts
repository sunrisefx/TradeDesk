import "server-only";
import { env } from "@/lib/server/env";
import type { CardLanguage, GradingCompany, ScanIdentity, Variant } from "@/lib/types";

// ════════════════════════════════════════════════════════════════════════════
// Vision AI — identifies a Pokémon card from a single photo.
// Primary: Claude (Messages API, forced tool call → guaranteed JSON shape).
// Alternate: Gemini Flash (JSON response mode).
// Plain fetch, no SDKs, so it runs on any Vercel runtime.
// ════════════════════════════════════════════════════════════════════════════

const LANGS: CardLanguage[] = ["EN", "JA", "KO", "ZH-CN", "ZH-TW"];
const VARIANT_IDS: Variant[] = ["normal", "holo", "reverse", "pokeball", "masterball", "first-edition", "shadowless", "stamped", "other"];
const GRADERS: GradingCompany[] = ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG", "OTHER"];

const SYSTEM_PROMPT = `You are an expert Pokémon TCG card identifier working at a busy card show.
You will receive ONE photo taken on an iPhone. The card is very often inside a penny sleeve, a top-loader, a binder pocket or a graded slab, under mixed convention lighting.

How to read the card:
- Focus on the single card closest to the centre of the frame. Ignore neighbouring binder pockets, hands, tables and price stickers.
- Plastic glare, scratches and reflections are NOT part of the card. Read through them; if a field is genuinely obscured, return null for it rather than guessing.
- Collector number: read it EXACTLY as printed in the bottom corner, keeping leading zeros and the slash total (e.g. "025/165", "199/165", "TG05/TG30", "GG44/GG70"). Promos look like "SVP 085", "SWSH020", "001/SV-P", "XY-P". Secret rares have a number above the total (e.g. "201/165").
- Set code: modern cards print a set code / regulation-mark block near the number (e.g. English "MEW", "PAF", "OBF", "SVI", "TWM"; Japanese "SV2a", "SV4a", "s12a", "SM12a"). Return what is printed. Set name: the expansion name if you can determine it.
- Language:
  • JA: hiragana/katakana (e.g. ピカチュウ, リザードン).
  • KO: hangul (e.g. 피카츄, 리자몽).
  • ZH-TW: Traditional characters (e.g. 寶可夢, 噴火龍, 皮卡丘 with 寶/龍/們 forms) — Taiwan/HK prints.
  • ZH-CN: Simplified characters (e.g. 宝可梦, 喷火龙, 们/龙 forms) — mainland China prints.
  • EN: English text.
  Use the attack/ability text, not just the name, to decide Simplified vs Traditional.
- nameLocalized: the card name exactly as printed. nameEnglish: the official English name of the same card (e.g. リザードンex → "Charizard ex", 皮卡丘 → "Pikachu").
- Rarity: interpret the rarity symbol or letters (●=Common, ◆=Uncommon, ★=Rare; Japanese C/U/R/RR/RRR/AR/SAR/SR/UR/HR/ACE/S/SSR/CHR/CSR/K/TR/PR). Return an English rarity name, e.g. "Special Illustration Rare", "Illustration Rare", "Ultra Rare", "Hyper Rare", "Double Rare", "Secret Rare", "Promo".
- variant (printing): "normal" (no foil), "holo" (foil only in the artwork / full-art foil), "reverse" (foil on the card body, artwork NOT foil), "pokeball" (reverse foil with a Poké Ball pattern), "masterball" (reverse foil with a Master Ball pattern), "first-edition" (1st Edition stamp), "shadowless" (Base Set without the art-box drop shadow), "stamped" (event/prerelease/staff/league stamp), "other". Full arts, illustration rares and secret rares are "holo".
- Graded slabs: if the card is in a PSA/BGS/CGC/SGC/ACE/TAG slab, set isGraded=true and read the company and numeric grade from the label (the label usually also states the set, number and language — prefer it).
- confidence: 0–1, your honest confidence that name + number + language are all correct.
- notes: one short sentence about anything the trader should double-check (e.g. "number partially hidden by glare").`;

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    nameLocalized: { type: ["string", "null"], description: "Card name exactly as printed" },
    nameEnglish: { type: ["string", "null"], description: "Official English card name" },
    setName: { type: ["string", "null"] },
    setCode: { type: ["string", "null"] },
    cardNumber: { type: ["string", "null"], description: "Collector number as printed, e.g. 025/165" },
    language: { type: ["string", "null"], enum: [...LANGS, null] },
    rarity: { type: ["string", "null"] },
    variant: { type: ["string", "null"], enum: [...VARIANT_IDS, null] },
    isGraded: { type: "boolean" },
    gradingCompany: { type: ["string", "null"], enum: [...GRADERS, null] },
    grade: { type: ["number", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    notes: { type: ["string", "null"] },
  },
  required: ["nameLocalized", "nameEnglish", "cardNumber", "language", "variant", "isGraded", "confidence"],
} as const;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export class VisionError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

function sanitize(raw: Record<string, unknown>): ScanIdentity {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const lang = str(raw.language)?.toUpperCase() as CardLanguage | undefined;
  const variant = str(raw.variant)?.toLowerCase() as Variant | undefined;
  const company = str(raw.gradingCompany)?.toUpperCase() as GradingCompany | undefined;
  const grade = typeof raw.grade === "number" && raw.grade > 0 && raw.grade <= 10 ? raw.grade : null;
  const conf = typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
  return {
    nameLocalized: str(raw.nameLocalized),
    nameEnglish: str(raw.nameEnglish),
    setName: str(raw.setName),
    setCode: str(raw.setCode),
    cardNumber: str(raw.cardNumber),
    language: lang && LANGS.includes(lang) ? lang : null,
    rarity: str(raw.rarity),
    variant: variant && VARIANT_IDS.includes(variant) ? variant : null,
    isGraded: raw.isGraded === true,
    gradingCompany: company && GRADERS.includes(company) ? company : null,
    grade,
    confidence: conf,
    notes: str(raw.notes),
  };
}

function userText(languageHint: CardLanguage | null): string {
  return languageHint
    ? `Identify this card. The trader believes it is a ${languageHint} print; verify that from the text.`
    : "Identify this card.";
}

async function identifyWithClaude(base64: string, mediaType: ImageMediaType, hint: CardLanguage | null): Promise<ScanIdentity> {
  if (!env.anthropicKey) throw new VisionError("ANTHROPIC_API_KEY is not set", 500);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "record_card",
          description: "Record the identified Pokémon card.",
          input_schema: TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "record_card" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: userText(hint) },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new VisionError(`Claude vision error ${res.status}: ${detail.slice(0, 300)}`, res.status === 429 ? 429 : 502);
  }
  const data = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[] };
  const tool = data.content.find((b) => b.type === "tool_use");
  if (!tool?.input) throw new VisionError("Claude returned no card data");
  return sanitize(tool.input);
}

async function identifyWithGemini(base64: string, mediaType: ImageMediaType, hint: CardLanguage | null): Promise<ScanIdentity> {
  if (!env.geminiKey) throw new VisionError("GEMINI_API_KEY is not set", 500);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mediaType, data: base64 } },
            {
              text: `${userText(hint)}\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(TOOL_SCHEMA)}`,
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 700 },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new VisionError(`Gemini vision error ${res.status}: ${detail.slice(0, 300)}`, res.status === 429 ? 429 : 502);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
    return sanitize(JSON.parse(cleaned) as Record<string, unknown>);
  } catch {
    throw new VisionError("Gemini returned unparseable JSON");
  }
}

export async function identifyCard(
  base64: string,
  mediaType: ImageMediaType,
  languageHint: CardLanguage | null,
): Promise<{ identity: ScanIdentity; provider: string; model: string }> {
  const primary = env.visionProvider === "gemini" ? "gemini" : "anthropic";
  const order = primary === "gemini" ? (["gemini", "anthropic"] as const) : (["anthropic", "gemini"] as const);
  let lastErr: unknown;
  for (const p of order) {
    const configured = p === "anthropic" ? env.anthropicKey : env.geminiKey;
    if (!configured) continue;
    try {
      const identity =
        p === "anthropic"
          ? await identifyWithClaude(base64, mediaType, languageHint)
          : await identifyWithGemini(base64, mediaType, languageHint);
      return { identity, provider: p, model: p === "anthropic" ? env.anthropicModel : env.geminiModel };
    } catch (e) {
      lastErr = e; // fall through to the other provider if it's configured
    }
  }
  if (lastErr) throw lastErr;
  throw new VisionError("No vision provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY.", 500);
}
