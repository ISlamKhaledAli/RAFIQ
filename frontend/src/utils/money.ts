/**
 * وحدة الحسابات المالية الدقيقة لمشروع رفيق (Rafiq POS)
 * تلتزم بحساب وتخزين كل المبالغ بالقروش (Piasters) كأعداد صحيحة
 * تمنع أي تراكم لأخطاء الفاصلة العشرية في العمليات الحسابية
 */

/**
 * تحويل الجنيهات إلى قروش مع التقريب لأقرب قرش صحيح
 * @param pounds المبلغ بالجنيه (مثال: 15.50)
 * @returns المبلغ بالقروش كعدد صحيح (مثال: 1550)
 */
export function poundsToPiasters(pounds: number | string): number {
  const num = typeof pounds === 'string' ? parseFloat(pounds.replace(/,/g, '')) : pounds;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * تحويل القروش إلى جنيهات
 * @param piasters المبلغ بالقروش (مثال: 1550)
 * @returns المبلغ بالجنيه (مثال: 15.5)
 */
export function piastersToPounds(piasters: number): number {
  return piasters / 100;
}

/**
 * تنسيق المبلغ بالقروش للعرض بالعربية مع رمز العملة
 * @param piasters المبلغ بالقروش
 * @param includeSymbol إضافة "ج.م"
 */
export function formatArabicCurrency(piasters: number, includeSymbol = true): string {
  const pounds = piastersToPounds(piasters);
  const formatted = pounds.toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return includeSymbol ? `${formatted} ج.م` : formatted;
}

/**
 * ضرب السعر في كمية بالملي-وحدة (مثلاً: 1000 = 1 قطعة أو 1 كجم)
 */
export function calculateLineTotal(unitPricePiasters: number, quantityMilli: number, discountPiasters = 0): number {
  const gross = Math.round((unitPricePiasters * quantityMilli) / 1000);
  return Math.max(0, gross - discountPiasters);
}
