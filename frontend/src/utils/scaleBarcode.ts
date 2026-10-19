/**
 * Rafiq POS - Scale Barcode Parser (ميزان الباركود الإلكتروني)
 * Standards: GS1 Variable Measure Barcodes (EAN-13 starting with 20, 21, 22)
 * Format: [PP][IIIII][WWWWW][C]
 * PP: Prefix (20, 21, 22)
 * IIIII: 5-digit Product PLU code (e.g. 00045)
 * WWWWW: 5-digit Weight in grams (e.g. 01250 = 1250g = 1.250kg = 1,250,000 milli)
 * C: Check digit
 */

export interface ParsedScaleBarcode {
  isScaleBarcode: boolean;
  prefix: string;
  itemPlu: string;        // e.g. "00045"
  itemPluTrimmed: string; // e.g. "45"
  weightGrams: number;    // e.g. 1250
  weightMilli: number;    // e.g. 1250 (1250 milli-units = 1.250 kg)
  weightKg: number;       // e.g. 1.250
  pricePiasters: number;  // e.g. 1250 piasters if scale barcode encodes price
  fullBarcode: string;
}

export function parseScaleBarcode(rawBarcode: string): ParsedScaleBarcode | null {
  if (!rawBarcode || typeof rawBarcode !== 'string') return null;
  const bc = rawBarcode.trim();

  // Must be 13 numeric digits and start with standard scale prefixes 20, 21, 22, or 99
  if (bc.length !== 13 || !/^\d{13}$/.test(bc)) return null;

  const prefix = bc.substring(0, 2);
  if (prefix !== '20' && prefix !== '21' && prefix !== '22' && prefix !== '99') {
    return null;
  }

  // PLU code is digits 2 to 7 (5 digits)
  const itemPlu = bc.substring(2, 7);
  const itemPluTrimmed = itemPlu.replace(/^0+/, '') || '0';
  // A valid scale barcode must have a non-zero PLU (internal barcodes 2000000000015 have PLU 00000)
  if (itemPluTrimmed === '0') {
    return null;
  }

  // Weight / Amount payload is digits 7 to 12 (5 digits, in grams or piasters)
  const weightStr = bc.substring(7, 12);
  const weightGrams = parseInt(weightStr, 10);
  if (isNaN(weightGrams) || weightGrams <= 0) {
    return null;
  }

  return {
    isScaleBarcode: true,
    prefix,
    itemPlu,
    itemPluTrimmed,
    weightGrams,
    weightMilli: weightGrams,
    weightKg: weightGrams / 1000.0,
    pricePiasters: weightGrams,
    fullBarcode: bc,
  };
}
