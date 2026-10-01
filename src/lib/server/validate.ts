import "server-only";
import {
  CONDITIONS,
  LANGUAGES,
  VARIANTS,
  type CardLanguage,
  type CardRef,
  type Condition,
  type GradeInfo,
  type GradingCompany,
  type Variant,
} from "@/lib/types";

// Small hand-rolled validators for request bodies (keeps the dependency list short).

const LANG_CODES = LANGUAGES.map((l) => l.code);
const VARIANT_IDS = VARIANTS.map((v) => v.id);
const GRADERS: GradingCompany[] = ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG", "OTHER"];

const s = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function parseLanguage(v: unknown): CardLanguage | null {
  return typeof v === "string" && LANG_CODES.includes(v as CardLanguage) ? (v as CardLanguage) : null;
}
export function parseVariant(v: unknown): Variant | null {
  return typeof v === "string" && VARIANT_IDS.includes(v as Variant) ? (v as Variant) : null;
}
export function parseCondition(v: unknown): Condition {
  return typeof v === "string" && CONDITIONS.includes(v as Condition) ? (v as Condition) : "NM";
}
export function parseGrade(v: unknown): GradeInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const company = typeof o.company === "string" ? (o.company.toUpperCase() as GradingCompany) : null;
  const grade = typeof o.grade === "number" ? o.grade : Number(o.grade);
  if (!company || !GRADERS.includes(company) || !Number.isFinite(grade) || grade <= 0 || grade > 10) return null;
  return { company, grade };
}

export function parseCard(v: unknown): CardRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = s(o.name);
  const nameEn = s(o.nameEn);
  if (!name && !nameEn) return null;
  const img = s(o.imageUrl, 500);
  return {
    catalogId: s(o.catalogId, 80),
    catalogLang: s(o.catalogLang, 10),
    name: name ?? nameEn!,
    nameEn: nameEn ?? name!,
    setId: s(o.setId, 80),
    setName: s(o.setName),
    setCode: s(o.setCode, 40),
    number: s(o.number, 40),
    language: parseLanguage(o.language) ?? "EN",
    rarity: s(o.rarity, 80),
    variant: parseVariant(o.variant) ?? "normal",
    imageUrl: img && /^https:\/\//.test(img) ? img : null,
  };
}

export function parseMoney(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}
