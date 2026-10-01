import "server-only";
import {
  emptyCard,
  parseCardNumber,
  stripLeadingZeros,
  type CardLanguage,
  type CardRef,
  type CatalogMatch,
  type ScanIdentity,
  type Variant,
} from "@/lib/types";
import {
  TCGDEX_LANG,
  baseSearchName,
  getCard,
  listSets,
  searchCards,
  setIdFromCardId,
  tcgdexImage,
  type TcgdexBrief,
  type TcgdexSetBrief,
} from "./tcgdex";

// ════════════════════════════════════════════════════════════════════════════
// Catalog resolution: turn a fuzzy vision read (or a typed query) into ranked,
// concrete card prints.
// ════════════════════════════════════════════════════════════════════════════

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・·'’\-_.:]/g, "");
}

function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  // bigram Dice coefficient — works for CJK too since we compare code points
  const grams = (s: string) => {
    const m = new Map<string, number>();
    const cps = [...s];
    for (let i = 0; i < cps.length - 1; i++) {
      const g = cps[i] + cps[i + 1];
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) ?? 0);
  const total = [...x].length - 1 + ([...y].length - 1);
  return total > 0 ? (2 * inter) / total : 0;
}

function briefToCard(
  b: TcgdexBrief,
  lang: string,
  language: CardLanguage,
  sets: Map<string, TcgdexSetBrief>,
  extra: Partial<CardRef> = {},
): CardRef {
  const setId = setIdFromCardId(b.id);
  const set = sets.get(setId);
  const official = set?.cardCount?.official;
  const number = official ? `${b.localId}/${String(official).padStart(b.localId.length >= 3 ? 3 : 0, "0")}` : b.localId;
  return emptyCard({
    catalogId: b.id,
    catalogLang: lang,
    name: b.name,
    nameEn: language === "EN" ? b.name : "",
    setId,
    setName: set?.name ?? null,
    number,
    language,
    imageUrl: tcgdexImage(b.image, "high"),
    ...extra,
  });
}

/**
 * Score candidates against the identity read off the card.
 * Weights: collector number (50) > printed set total (25) > name (15) > set name/code (10).
 */
function scoreCandidates(
  briefs: TcgdexBrief[],
  sets: Map<string, TcgdexSetBrief>,
  want: { name: string; local: string | null; total: string | null; setName: string | null; setCode: string | null },
): { brief: TcgdexBrief; score: number; reason: string[] }[] {
  return briefs
    .map((brief) => {
      const reason: string[] = [];
      let score = 0;
      const set = sets.get(setIdFromCardId(brief.id));
      if (want.local && stripLeadingZeros(brief.localId.toUpperCase()) === want.local) {
        score += 50;
        reason.push("number");
      }
      if (want.total && set?.cardCount?.official && String(set.cardCount.official) === want.total) {
        score += 25;
        reason.push("set size");
      }
      const ns = similarity(brief.name, want.name);
      score += Math.round(ns * 15);
      if (ns > 0.8) reason.push("name");
      if (set && (want.setName || want.setCode)) {
        const ss = Math.max(
          want.setName ? similarity(set.name, want.setName) : 0,
          want.setCode ? (norm(set.id).includes(norm(want.setCode)) ? 1 : 0) : 0,
        );
        score += Math.round(ss * 10);
        if (ss > 0.7) reason.push("set");
      }
      return { brief, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

export async function resolveIdentity(id: ScanIdentity, limit = 6): Promise<CatalogMatch[]> {
  const language: CardLanguage = id.language ?? "EN";
  const { local, total } = parseCardNumber(id.cardNumber);
  const variant: Variant = id.variant ?? "normal";
  const nativeLang = TCGDEX_LANG[language];

  const attempts: { lang: string; name: string; viaEnglish: boolean }[] = [];
  if (id.nameLocalized) attempts.push({ lang: nativeLang, name: id.nameLocalized, viaEnglish: false });
  if (language !== "EN" && id.nameEnglish) attempts.push({ lang: "en", name: id.nameEnglish, viaEnglish: true });
  if (language === "EN" && id.nameEnglish && id.nameEnglish !== id.nameLocalized)
    attempts.push({ lang: "en", name: id.nameEnglish, viaEnglish: false });

  for (const attempt of attempts) {
    const sets = await listSets(attempt.lang);
    const query = baseSearchName(attempt.name) || attempt.name;

    // Narrow by number first (Pikachu has hundreds of prints); widen if that finds nothing.
    let briefs = local ? await searchCards(attempt.lang, { name: query, localId: local, limit: 80 }) : [];
    if (briefs.length === 0) briefs = await searchCards(attempt.lang, { name: query, limit: 120 });
    if (briefs.length === 0) continue;

    const scored = scoreCandidates(briefs, sets, {
      name: attempt.name,
      // Japanese/Asian numbering differs from the English print, so don't trust it on the fallback pass.
      local: attempt.viaEnglish ? null : local,
      total: attempt.viaEnglish ? null : total,
      setName: attempt.viaEnglish ? null : id.setName,
      setCode: id.setCode,
    }).slice(0, limit);

    // Hydrate the top hit for rarity + authoritative set info.
    const top = scored[0] ? await getCard(attempt.lang, scored[0].brief.id) : null;

    return scored.map((s, i) => {
      const card = briefToCard(s.brief, attempt.lang, language, sets, {
        variant,
        rarity: i === 0 ? (top?.rarity ?? id.rarity) : id.rarity,
        setCode: id.setCode,
      });
      if (attempt.viaEnglish) {
        // We matched the English print as a reference. Keep the printed identity of the physical card.
        card.name = id.nameLocalized ?? s.brief.name;
        card.nameEn = s.brief.name;
        card.number = id.cardNumber ?? card.number;
        card.setName = id.setName ?? card.setName;
      } else {
        card.nameEn = id.nameEnglish ?? (language === "EN" ? s.brief.name : "");
      }
      if (i === 0 && top?.set?.name) card.setName = attempt.viaEnglish ? card.setName : top.set.name;
      const penalty = attempt.viaEnglish ? 25 : 0;
      return {
        card,
        score: Math.max(0, Math.min(100, s.score - penalty)),
        reason: attempt.viaEnglish
          ? "Matched to the English print (no native-language catalog entry)"
          : s.reason.length
            ? `Matched on ${s.reason.join(", ")}`
            : "Name match only",
      };
    });
  }

  // Nothing in the catalog: return the raw read so the user can still trade/price it.
  if (id.nameLocalized || id.nameEnglish) {
    return [
      {
        card: emptyCard({
          name: id.nameLocalized ?? id.nameEnglish ?? "",
          nameEn: id.nameEnglish ?? id.nameLocalized ?? "",
          setName: id.setName,
          setCode: id.setCode,
          number: id.cardNumber,
          language,
          rarity: id.rarity,
          variant,
        }),
        score: 20,
        reason: "Not found in catalog — using scanned details",
      },
    ];
  }
  return [];
}

/** Manual search / autocomplete. Accepts "pikachu", "pikachu 25", "charizard 199/165", "ピカチュウ". */
export async function searchCatalog(raw: string, language: CardLanguage, limit = 24): Promise<CardRef[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const numMatch = q.match(/(?:^|\s)#?([A-Za-z-]*\d+[A-Za-z]?(?:\s*\/\s*[A-Za-z0-9-]+)?)\s*$/);
  const numberPart = numMatch ? numMatch[1] : null;
  const namePart = (numberPart ? q.slice(0, q.length - numMatch![0].length) : q).trim();
  if (!namePart) return [];
  const { local, total } = parseCardNumber(numberPart);

  const tryLangs = language === "EN" ? ["en"] : [TCGDEX_LANG[language], "en"];
  for (const lang of tryLangs) {
    const sets = await listSets(lang);
    const briefs = await searchCards(lang, { name: baseSearchName(namePart) || namePart, localId: local ?? undefined, limit: 80 });
    if (!briefs.length) continue;
    const scored = scoreCandidates(briefs, sets, { name: namePart, local, total, setName: null, setCode: null });
    return scored.slice(0, limit).map((s) => {
      const c = briefToCard(s.brief, lang, language, sets);
      if (lang === "en") c.nameEn = s.brief.name;
      return c;
    });
  }
  return [];
}
