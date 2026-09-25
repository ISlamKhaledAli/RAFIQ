/**
 * وحدة الحسابات المالية الدقيقة لمشروع رفيق (Rafiq POS)
 * تلتزم بحساب وتخزين كل المبالغ بالقروش (Piasters) كأعداد صحيحة
 * تمنع أي تراكم لأخطاء الفاصلة العشرية في العمليات الحسابية
 */

/**
 * تحويل الأرقام العربية المشرقية والفارسية والفاصلة العربية إلى أرقام قياسية (Feature #130 / Task 130-1)
 * @param str النص الذي قد يحتوي على أرقام ٠-٩ أو ۰-۹ أو فواصل ،
 * @returns النص بأرقام لاتينية 0-9 مع نقطة عشرية .
 */
export function normalizeArabicNumerals(str: string): string {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString())
    .replace(/[۰-۹]/g, (d) => (d.charCodeAt(0) - 1776).toString())
    .replace(/[،]/g, '.');
}

/**
 * تحويل الجنيهات إلى قروش مع التقريب لأقرب قرش صحيح
 * @param pounds المبلغ بالجنيه (مثال: 15.50)
 * @returns المبلغ بالقروش كعدد صحيح (مثال: 1550)
 */
export function poundsToPiasters(pounds: number | string): number {
  const normalized = typeof pounds === 'string' ? normalizeArabicNumerals(pounds) : pounds;
  const num = typeof normalized === 'string' ? parseFloat(normalized.replace(/,/g, '')) : normalized;
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

/**
 * حساب قيمة الضريبة بالقروش من إجمالي المبلغ بعد الخصم (Feature #6)
 * @param totalPiasters المبلغ الإجمالي بعد الخصم
 * @param taxRatePercent نسبة الضريبة كنسبة مئوية (مثال: 14 لـ 14%)
 * @param priceIncludesTax هل السعر شامل الضريبة (افتراضي في مصر)
 */
export function calculateTaxPiasters(
  totalPiasters: number,
  taxRatePercent: number,
  priceIncludesTax = true
): number {
  if (taxRatePercent <= 0 || totalPiasters <= 0) return 0;
  if (priceIncludesTax) {
    const net = (totalPiasters * 100) / (100 + taxRatePercent);
    const netPiasters = Math.round(net);
    return Math.max(0, totalPiasters - netPiasters);
  } else {
    return Math.round((totalPiasters * taxRatePercent) / 100);
  }
}
