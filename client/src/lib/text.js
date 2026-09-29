// text.js — text normalisation for import, answers and search.
// Everything user-typed is NFC-normalised; search is
// accent-insensitive (NFD strip); sorting uses Intl.Collator.
export function toNFC(s) {
  return String(s == null ? '' : s).normalize('NFC');
}

export function stripAccents(s) {
  return toNFC(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normSearch(s) {
  return stripAccents(s).toLowerCase();
}

// Accent- and case-insensitive substring match.
export function matchesQuery(haystack, query) {
  const q = normSearch(query).trim();
  if (!q) return true;
  return normSearch(haystack).includes(q);
}

export function localeCollator(lang) {
  try {
    return new Intl.Collator(lang || undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: 'base' });
  }
}

export function sortByName(items, getName, lang) {
  const c = localeCollator(lang);
  return [...items].sort((a, b) => c.compare(getName(a), getName(b)));
}

// Normalise a card side on import: NFC + trim + collapse
// interior whitespace. Empty/whitespace-only becomes ''.
export function normCardSide(s) {
  return toNFC(s).replace(/\s+/g, ' ').trim();
}

// Guard: ignore over-long sides (paste accidents) at import.
export const MAX_SIDE_LEN = 2000;

export function sideTooLong(s) {
  return toNFC(s).length > MAX_SIDE_LEN;
}
