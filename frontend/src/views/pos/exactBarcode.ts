/**
 * The scan fast path (products:getByExactBarcode) is an equality lookup on indexed barcode columns.
 * Only text that can really be a barcode goes through it; names (spaces, Arabic letters) use the regular search.
 */
const MAX_BARCODE_LENGTH = 64;
const ARABIC_LETTERS = /[\u0621-\u064A]/;

export function isExactBarcodeCandidate(text: string): boolean {
  const code = text.trim();
  if (code.length === 0 || code.length > MAX_BARCODE_LENGTH) return false;
  if (/\s/.test(code)) return false;
  return !ARABIC_LETTERS.test(code);
}
