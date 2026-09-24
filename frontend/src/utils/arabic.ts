/**
 * Arabic Text Normalization and Matching Utilities
 * Specifically designed for High-Speed Supermarket POS Product Searches
 * (Feature #22 / Tasks 22-2 & 134-2)
 */

export function normalizeArabicText(text: string): string {
  if (!text) return '';

  let normalized = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // 1. Remove Tashkeel / Harakat (Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun)
    if (char >= '\u064B' && char <= '\u0652') {
      continue;
    }

    // 2. Remove Tatweel / Kashida
    if (char === '\u0640') {
      continue;
    }

    // 3. Normalize Alef variants (أ, إ, آ, ٱ) -> ا
    if (char === 'أ' || char === 'إ' || char === 'آ' || char === 'ٱ') {
      normalized += 'ا';
    }
    // 4. Normalize Teh Marbuta (ة) -> ه
    else if (char === 'ة') {
      normalized += 'ه';
    }
    // 5. Normalize Alef Maksura (ى) -> ي
    else if (char === 'ى') {
      normalized += 'ي';
    }
    else {
      normalized += char.toLowerCase();
    }
  }

  // 6. Collapse consecutive whitespace characters
  return normalized.replace(/\s+/g, ' ').trim();
}

/**
 * Checks if a candidate product name matches an Arabic search query
 * after normalizing both strings.
 */
export function matchesArabicQuery(productName: string, query: string): boolean {
  if (!query || !productName) return false;
  const normProduct = normalizeArabicText(productName);
  const normQuery = normalizeArabicText(query);
  return normProduct.includes(normQuery);
}
