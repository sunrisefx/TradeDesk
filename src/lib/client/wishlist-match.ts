import { parseCardNumber, type CardRef, type WishlistItem } from "@/lib/types";

const n = (s: string | null | undefined) => (s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Does this card satisfy a wishlist entry?
 * Exact catalog id wins; otherwise English name + collector number (+ language/variant if the
 * wishlist entry pins them). Lets a Japanese card match a "any language" wishlist entry.
 */
export function matchWishlist(card: CardRef, wishlist: WishlistItem[]): WishlistItem | null {
  const num = parseCardNumber(card.number).local;
  for (const w of wishlist) {
    if (w.language && w.language !== card.language) continue;
    if (w.variant && w.variant !== card.variant) continue;
    if (w.catalogId && card.catalogId && w.catalogId === card.catalogId) return w;
    const sameName = n(w.nameEn) && n(w.nameEn) === n(card.nameEn);
    if (!sameName) continue;
    const wNum = parseCardNumber(w.number).local;
    // A wishlist entry without a number means "any print of this card".
    if (!wNum || (num && wNum === num)) return w;
  }
  return null;
}
