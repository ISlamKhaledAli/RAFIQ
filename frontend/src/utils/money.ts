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
    .replace(/[،٫]/g, '.');
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

/**
 * Task 24-1 & 24-2: حساب قيمة الخصم بالقروش بناءً على النوع (مبلغ أو نسبة)
 * @param grossPiasters المبلغ الإجمالي قبل الخصم بالقروش
 * @param type نوع الخصم ('amount' بالمبلغ أو 'percent' كنسبة مئوية)
 * @param value القيمة المدخلة (مبلغ بالجنيه أو نسبة مئوية)
 * @returns قيمة الخصم الفعلية بالقروش (لا تتجاوز المبلغ الأصلي)
 */
export function calculateDiscountAmount(
  grossPiasters: number,
  type: 'amount' | 'percent',
  value: number
): number {
  if (grossPiasters <= 0 || value <= 0 || isNaN(value)) return 0;

  if (type === 'percent') {
    // Round to nearest integer piaster
    const discount = Math.round((grossPiasters * value) / 100);
    return Math.min(grossPiasters, Math.max(0, discount));
  } else {
    // value is in EGP pounds
    const piasters = Math.round(value * 100);
    return Math.min(grossPiasters, Math.max(0, piasters));
  }
}

/**
 * Task 24-2: توزيع خصم الفاتورة الإجمالي على بنود السلة بالتناسب مع قيمة كل بند
 * باستخدام خوارزمية أكبر باقٍ (Largest Remainder Method - Hamilton-Hare)
 * لمعالجة باقي القروش ومنع أي فروق أو كسور نهائياً.
 *
 * @param items مصفوفة البنود مع إجمالي كل بند قبل الخصم (بالقروش)
 * @param totalDiscountPiasters إجمالي الخصم المطلوب توزيعه (بالقروش)
 * @returns مصفوفة بقيم الخصم الموزعة على كل بند (مجموعها يطابق totalDiscountPiasters تماماً)
 */
export function distributeInvoiceDiscount(
  items: { grossPiasters: number }[],
  totalDiscountPiasters: number
): number[] {
  if (items.length === 0 || totalDiscountPiasters <= 0) {
    return items.map(() => 0);
  }

  const subtotalGross = items.reduce((sum, it) => sum + Math.max(0, it.grossPiasters), 0);
  if (subtotalGross <= 0) {
    return items.map(() => 0);
  }

  const actualDiscount = Math.min(totalDiscountPiasters, subtotalGross);

  // 1. Calculate integer share and remainder for each item
  const shares: number[] = [];
  const remainders: { index: number; remainder: number }[] = [];
  let sumDistributed = 0;

  for (let i = 0; i < items.length; i++) {
    const gross = Math.max(0, items[i].grossPiasters);
    const rawProduct = gross * actualDiscount;
    const share = Math.floor(rawProduct / subtotalGross);
    const rem = rawProduct % subtotalGross;

    shares.push(share);
    remainders.push({ index: i, remainder: rem });
    sumDistributed += share;
  }

  // 2. Distribute leftover piasters to items with the largest remainders
  const leftover = actualDiscount - sumDistributed;
  remainders.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < leftover && i < remainders.length; i++) {
    shares[remainders[i].index] += 1;
  }

  return shares;
}

