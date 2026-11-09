import { formatUnitArabic } from './units.ts';

/**
 * عرض نصوص حركات المخزن بالعربية فقط.
 * القيم المخزنة (أكواد الحركة والوحدات) تبقى كما هي في قاعدة البيانات؛ التعريب هنا للعرض فقط.
 */

const ARABIC_LETTER = /[\u0600-\u06FF]/;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  INITIAL: 'رصيد افتتاحي',
  INITIAL_OPENING: 'رصيد افتتاحي',
  OPENING_BALANCE: 'رصيد افتتاحي',
  SALE: 'مبيعات كاشير',
  SALE_CANCEL: 'إلغاء فاتورة بيع',
  PURCHASE: 'استلام مشتريات',
  PURCHASE_RETURN: 'مرتجع مشتريات',
  ADJUSTMENT: 'تسوية جردية',
  INVENTORY_ADJUSTMENT: 'تسوية جردية',
  RETURN: 'مرتجع مبيعات',
  REFUND: 'مرتجع مبيعات',
  DAMAGED_RETURN: 'مرتجع تالف',
  DAMAGE: 'تالف',
  EXPIRED_WRITE_OFF: 'إعدام منتهي الصلاحية',
  UNIT_REBASE: 'إعادة ضبط الوحدات',
  PRODUCTION_CONSUMPTION: 'استهلاك خامات إنتاج',
  PRODUCTION_OUTPUT: 'ناتج إنتاج',
  RECIPE_SALE_CONSUMPTION: 'استهلاك مكونات وصفة',
  RECIPE_SALE_REVERSAL: 'عكس استهلاك وصفة',
  IN: 'إضافة مخزون',
  OUT: 'صرف مخزون',
};

const GENERIC_MOVEMENT_LABEL = 'حركة مخزون';

/** اسم الحركة بالعربية: يفضّل ما أرسله المضيف إن كان عربياً، ثم القاموس، ثم تسمية عامة بدل عرض الكود الإنجليزي. */
export function movementTypeLabel(movementType?: string | null, movementTypeArabic?: string | null): string {
  const arabic = (movementTypeArabic || '').trim();
  if (arabic && ARABIC_LETTER.test(arabic)) return arabic;
  const code = (movementType || '').trim().toUpperCase();
  if (!code) return GENERIC_MOVEMENT_LABEL;
  return MOVEMENT_TYPE_LABELS[code] || GENERIC_MOVEMENT_LABEL;
}

const LATIN_ONLY_IN_PARENS = /\(\s*([A-Za-z]+)\s*\)/g;
const BARE_UNIT_WORDS = /\b(?:pieces?|pcs|pc|kg)\b/gi;

/** تعريب ملاحظة حركة مخزون قد تحتوي رموزاً إنجليزية قديمة مثل (piece) أو [SURPLUS]؛ النص العربي والمجهول يمر كما هو. */
export function cleanMovementNote(note?: string | null): string {
  if (!note) return '';
  return note
    .replace(/\[\s*SURPLUS\s*\]/gi, '[فائض جردي]')
    .replace(/\[\s*SHORTAGE\s*\]/gi, '[عجز جردي]')
    .replace(LATIN_ONLY_IN_PARENS, (whole, word: string) => {
      const localized = formatUnitArabic(word);
      return localized === word ? whole : `(${localized})`;
    })
    .replace(BARE_UNIT_WORDS, (word) => formatUnitArabic(word));
}
