/**
 * وحدة الحسابات المالية الدقيقة لمشروع رفيق (Rafiq POS)
 * تلتزم بحساب وتخزين كل المبالغ بالقروش (Piasters) كأعداد صحيحة
 * تمنع أي تراكم لأخطاء الفاصلة العشرية في العمليات الحسابية
 */

import { normalizeArabicDigits, normalizeNumericInput } from './numberEnforcer.ts';

export { normalizeArabicDigits, normalizeNumericInput };

/**
 * تحويل الأرقام العربية المشرقية والفارسية والفاصلة العربية إلى أرقام قياسية (Feature #130 / Task 130-1)
 * @param str النص الذي قد يحتوي على أرقام ٠-٩ أو ۰-۹ أو فواصل ،
 * @returns النص بأرقام لاتينية 0-9 مع نقطة عشرية .
 */
export function normalizeArabicNumerals(str: string | number | null | undefined): string {
  return normalizeNumericInput(str);
}

/**
 * توحيد الحروف والنصوص العربية للبحث المطابق (الألف والتاء المربوطة والياء وإزالة التشكيل والتطويل)
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u0652]/g, '') // Remove Tashkeel
    .replace(/\u0640/g, '') // Remove Tatweel
    .replace(/[أإآٱ]/g, 'ا') // Normalize Alef
    .replace(/ة/g, 'ه') // Normalize Teh Marbuta
    .replace(/ى/g, 'ي') // Normalize Alef Maksura
    .toLowerCase()
    .trim();
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
 * تنسيق نص رقمي أو قيمة بفواصل الآلاف الرياضية القياسية (,)
 * يحافظ تماماً على الفاصلة العشرية والأرقام غير المكتملة أثناء الكتابة الفورية
 * مثال:
 * "1234567" -> "1,234,567"
 * "1234567." -> "1,234,567."
 * "1234567.5" -> "1,234,567.5"
 */
export function formatThousands(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  const str = typeof val === 'number' ? val.toString() : normalizeNumericInput(val);
  let clean = str.replace(/,/g, '');
  if (!clean) return '';

  const isNegative = clean.startsWith('-');
  if (isNegative) clean = clean.substring(1);

  if (clean === '.') {
    return (isNegative ? '-' : '') + '0.';
  }

  const parts = clean.split('.');
  let integerPart = parts[0] || '0';
  const decimalPart = parts[1];

  // إزالة الأصفار الزائدة من البداية باستثناء الصفر المنفرد
  if (integerPart.length > 1 && integerPart.startsWith('0')) {
    integerPart = integerPart.replace(/^0+/, '') || '0';
  }

  // إضافة فواصل الآلاف
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  let result = (isNegative ? '-' : '') + formattedInteger;
  if (parts.length > 1) {
    result += '.' + decimalPart.slice(0, 2);
  } else if (clean.endsWith('.')) {
    result += '.';
  }
  return result;
}

/**
 * تفقيط المبالغ المالية بالقروش إلى كلمات باللغة العربية (بالجنيه والقرش)
 * يفيد الكاشير والمحاسب في التأكد الفوري من صحة الأرقام الكبيرة ومنع خطأ زيادة أو نقصان الأصفار
 * مثال: 155050 -> "فقط ألف وخمسمائة وخمسون جنيهاً مصرياً وخمسون قرشاً لا غير"
 */
export function tafqeetCurrency(piasters: number | null | undefined): string {
  if (piasters === null || piasters === undefined || isNaN(piasters)) return '';
  const absPiasters = Math.abs(Math.round(piasters));
  if (absPiasters === 0) return 'صفر جنيه';

  const pounds = Math.floor(absPiasters / 100);
  const remPiasters = absPiasters % 100;

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertGroup(n: number): string {
    if (n === 0) return '';
    let result = '';
    const h = Math.floor(n / 100);
    const rem = n % 100;

    if (h > 0) {
      result += hundreds[h];
    }

    if (rem > 0) {
      if (result) result += ' و';
      if (rem < 20) {
        result += ones[rem];
      } else {
        const o = rem % 10;
        const t = Math.floor(rem / 10);
        if (o > 0) {
          result += ones[o] + ' و' + tens[t];
        } else {
          result += tens[t];
        }
      }
    }
    return result;
  }

  function convertPounds(p: number): string {
    if (p === 0) return '';
    if (p === 1) return 'جنيه واحد';
    if (p === 2) return 'جنيهان';

    const billions = Math.floor(p / 1000000000);
    const millions = Math.floor((p % 1000000000) / 1000000);
    const thousands = Math.floor((p % 1000000) / 1000);
    const rem = p % 1000;

    const parts: string[] = [];

    if (billions > 0) {
      if (billions === 1) parts.push('مليار');
      else if (billions === 2) parts.push('ملياران');
      else if (billions >= 3 && billions <= 10) parts.push(convertGroup(billions) + ' مليارات');
      else parts.push(convertGroup(billions) + ' ملياراً');
    }

    if (millions > 0) {
      if (millions === 1) parts.push('مليون');
      else if (millions === 2) parts.push('مليونان');
      else if (millions >= 3 && millions <= 10) parts.push(convertGroup(millions) + ' ملايين');
      else parts.push(convertGroup(millions) + ' مليوناً');
    }

    if (thousands > 0) {
      if (thousands === 1) parts.push('ألف');
      else if (thousands === 2) parts.push('ألفان');
      else if (thousands >= 3 && thousands <= 10) parts.push(convertGroup(thousands) + ' آلاف');
      else parts.push(convertGroup(thousands) + ' ألفاً');
    }

    if (rem > 0) {
      parts.push(convertGroup(rem));
    }

    let poundsText = parts.join(' و');
    if (p >= 3 && p <= 10) {
      poundsText += ' جنيهات';
    } else {
      poundsText += ' جنيهاً مصرياً';
    }
    return poundsText;
  }

  function convertPiasters(c: number): string {
    if (c === 0) return '';
    if (c === 1) return 'قرش واحد';
    if (c === 2) return 'قرشان';
    const text = convertGroup(c);
    if (c >= 3 && c <= 10) return `${text} قروش`;
    return `${text} قرشاً`;
  }

  let finalPhrase = '';
  if (pounds > 0) {
    finalPhrase += convertPounds(pounds);
  }
  if (remPiasters > 0) {
    if (finalPhrase) finalPhrase += ' و';
    finalPhrase += convertPiasters(remPiasters);
  }

  const prefix = piasters < 0 ? 'سالب ' : '';
  return `فقط ${prefix}${finalPhrase} لا غير`;
}

/**
 * تنسيق المبلغ بالقروش للعرض بالعربية مع رمز العملة وفواصل الآلاف
 * @param piasters المبلغ بالقروش
 * @param includeSymbol إضافة "ج.م"
 */
export function formatArabicCurrency(piasters: number | null | undefined, includeSymbol = true): string {
  if (piasters === null || piasters === undefined || isNaN(piasters)) {
    return includeSymbol ? '0.00 ج.م' : '0.00';
  }
  const pounds = piastersToPounds(piasters);
  const formatted = pounds.toLocaleString('en-US', {
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

/**
 * تنسيق رقم قياسي مع فواصل آلاف ونظام أرقام لاتيني موحد
 */
export function formatNumber(
  val: number | string | null | undefined,
  minDecimals = 0,
  maxDecimals = 2
): string {
  if (val === null || val === undefined || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(normalizeArabicDigits(val));
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * تنسيق التاريخ بنظام أرقام لاتيني موحد مع أسماء الشهور/الأيام العربية
 */
export function formatDateOnly(date: string | Date | number | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * تنسيق الوقت بنظام أرقام لاتيني موحد
 */
export function formatTimeOnly(date: string | Date | number | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleTimeString('ar-EG-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * تنسيق التاريخ والوقت معاً بنظام أرقام لاتيني موحد
 */
export function formatDateTime(date: string | Date | number | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleString('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

