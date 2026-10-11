import { normalizeSearchText } from './digits';

export interface SearchColorKeyword {
  code: string;
  /** names + aliases, any language */
  keywords: string[];
}

export interface ParsedSearchQuery {
  /** Remaining free-text tokens (all must match the product text) */
  textTokens: string[];
  /** Storage capacities in GB found in the query (e.g. "256", "1tb", "۵۱۲ گیگ") */
  storages: number[];
  /** Color codes whose name/alias appears in the query */
  colorCodes: string[];
  normalized: string;
}

const GB_UNITS = new Set(['gb', 'g', 'gig', 'گیگ', 'گیگابایت', 'گیگا']);
const TB_UNITS = new Set(['tb', 't', 'tera', 'ترا', 'ترابایت']);
const KNOWN_GB = new Set([64, 128, 256, 512]);

/** Parses one token (or number+unit pair) into a capacity in GB. */
function storageFrom(numberPart: string, unit?: string): number | null {
  const n = Number(numberPart);
  if (!Number.isInteger(n) || n <= 0) return null;
  if (unit && TB_UNITS.has(unit)) return n <= 4 ? n * 1024 : null;
  if (unit && GB_UNITS.has(unit)) return KNOWN_GB.has(n) || n === 1024 || n === 2048 ? n : null;
  if (!unit && KNOWN_GB.has(n)) return n;
  return null;
}

/**
 * Splits a customer query such as «iPhone 17 Pro Max 256 مشکی» into
 * text tokens, storage capacities and colour codes.
 */
export function parseSearchQuery(query: string, colors: SearchColorKeyword[] = []): ParsedSearchQuery {
  const normalized = normalizeSearchText(query);
  let tokens = normalized ? normalized.split(' ') : [];
  const storages = new Set<number>();
  const colorCodes = new Set<string>();

  // 1) storage: "256gb" | "256 gb" | "1tb" | "1 ترابایت" | "256"
  const rest: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const glued = /^(\d+)(gb|g|tb|t)$/.exec(t);
    if (glued) {
      const cap = storageFrom(glued[1]!, glued[2]);
      if (cap) {
        storages.add(cap);
        continue;
      }
    }
    if (/^\d+$/.test(t)) {
      const next = tokens[i + 1];
      if (next && (GB_UNITS.has(next) || TB_UNITS.has(next))) {
        const cap = storageFrom(t, next);
        if (cap) {
          storages.add(cap);
          i++;
          continue;
        }
      }
      const cap = storageFrom(t);
      if (cap) {
        storages.add(cap);
        continue;
      }
    }
    rest.push(t);
  }
  tokens = rest;

  // 2) colours: longest keyword match first (e.g. "deep blue" before "blue")
  const keywordIndex: { words: string[]; code: string }[] = [];
  for (const c of colors) {
    for (const k of c.keywords) {
      const words = normalizeSearchText(k).split(' ').filter(Boolean);
      if (words.length) keywordIndex.push({ words, code: c.code });
    }
  }
  keywordIndex.sort((a, b) => b.words.length - a.words.length);

  const used = new Array(tokens.length).fill(false);
  for (const { words, code } of keywordIndex) {
    for (let i = 0; i + words.length <= tokens.length; i++) {
      if (used.slice(i, i + words.length).some(Boolean)) continue;
      if (words.every((w, j) => tokens[i + j] === w)) {
        colorCodes.add(code);
        for (let j = 0; j < words.length; j++) used[i + j] = true;
      }
    }
  }

  const textTokens = tokens.filter((_, i) => !used[i]);
  return { textTokens, storages: [...storages], colorCodes: [...colorCodes], normalized };
}

/** Builds the denormalized `Product.searchText` column. */
export function buildSearchText(parts: Array<string | number | null | undefined>): string {
  return normalizeSearchText(parts.filter((p) => p !== null && p !== undefined && p !== '').join(' '));
}
