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
 * تحويل الجنيهات إلى قروش مع التقريب لأقرب قرش صحيح (نصف القرش يُقرَّب بعيداً عن الصفر)
 * يعتمد على تحليل الأرقام العشرية كنص حتى لا يظهر خطأ الفاصلة العائمة (مثال: 1.005 -> 101 وليس 100)
 * @param pounds المبلغ بالجنيه (مثال: 15.50)
 * @returns المبلغ بالقروش كعدد صحيح (مثال: 1550)
 */
export function poundsToPiasters(pounds: number | string): number {
  return decimalToScaledInteger(pounds, 2);
}

/**
 * القيمة العشرية كعدد صحيح مضروب في 10^decimals بالتقريب لأقرب وحدة (نصف الوحدة بعيداً عن الصفر)
 * قراءة نصية بلا أي ضرب عائم؛ هي أساس poundsToPiasters (decimals = 2) وحساب نسبة الخصم (decimals = 3)
 */
function decimalToScaledInteger(value: number | string, decimals: number): number {
  const normalized = typeof value === 'string' ? normalizeArabicNumerals(value).replace(/,/g, '').trim() : String(value);
  const match = /^([+-]?)(\d*)\.?(\d*)(?:[eE]([+-]?\d+))?/.exec(normalized);
  if (!match) return 0;

  const intPart = match[2];
  const fracPart = match[3];
  if (intPart.length + fracPart.length === 0) return 0;

  const negative = match[1] === '-';
  const exponent = match[4] ? parseInt(match[4], 10) : 0;
  // value = digits x 10^(exponent - fracLen); scaled = value x 10^decimals
  const digits = (intPart + fracPart).replace(/^0+(?=\d)/, '');
  const scale = exponent - fracPart.length + decimals;

  let scaled: number;
  if (scale >= 0) {
    if (scale > 30) return 0;
    scaled = Number(digits + '0'.repeat(scale));
  } else {
    const cut = digits.length + scale;
    const kept = cut > 0 ? digits.slice(0, cut) : '0';
    const nextDigit = cut >= 0 && cut < digits.length ? digits.charCodeAt(cut) - 48 : 0;
    scaled = Number(kept) + (nextDigit >= 5 ? 1 : 0);
  }

  if (!Number.isFinite(scaled) || scaled === 0) return 0;
  return negative ? -scaled : scaled;
}

export const MAX_MONEY_INTEGER_DIGITS = 11;
const MONEY_TEXT_PATTERN = new RegExp(`^-?[0-9]{0,${MAX_MONEY_INTEGER_DIGITS}}(?:\\.[0-9]{0,2})?$`);

/**
 * هل النص (بعد التوحيد وإزالة الفواصل) مقبول كمبلغ بالجنيه؟ حتى 11 خانة صحيحة وخانتين عشريتين
 * الحد يبقي القروش ضمن الأعداد الصحيحة الآمنة ويمنع تفقيط أرقام خيالية
 */
export function isValidMoneyText(text: string): boolean {
  return MONEY_TEXT_PATTERN.test(text);
}

const warnedSafePiasters = new Set<string>();

/**
 * حارس الحدود لأي مبلغ قادم من الجسر أو الحقول: يعيد قروشاً صحيحة آمنة أو 0
 * القيم غير الرقمية أو اللانهائية أو الأكبر من أكبر عدد صحيح آمن تعاد 0 مع تحذير للمطور (مرة لكل مصدر) حتى لا يُخفى خطأ العقد
 * @param value القيمة الخام
 * @param source اسم الحقل أو المصدر لتوضيح التحذير
 */
export function toSafePiasters(value: unknown, source = 'unknown'): number {
  if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
    const rounded = Math.sign(value) * Math.round(Math.abs(value));
    return rounded === 0 ? 0 : rounded;
  }
  if (import.meta.env?.PROD !== true && !warnedSafePiasters.has(source)) {
    warnedSafePiasters.add(source);
    console.warn(`[money] مبلغ غير صالح من "${source}" (${String(value)}) تم اعتباره 0`);
  }
  return 0;
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
  if (typeof val === 'number' && !Number.isFinite(val)) return '';
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
  if (typeof piasters !== 'number' || !Number.isFinite(piasters)) return '';
  const absPiasters = Math.abs(Math.round(piasters));
  if (absPiasters === 0) return 'صفر جنيه';

  const pounds = Math.floor(absPiasters / 100);
  const remPiasters = absPiasters % 100;
  // Beyond the trillions the words table ends: no tafqeet is better than a wrong one (callers already treat '' as "no words")
  if (pounds >= 1000000000000) return '';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  // construct: the counted noun follows directly, so a dual loses its nun (مائتا، اثنا) as Arabic grammar requires
  function convertGroup(n: number, construct = false): string {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const rem = n % 100;

    let hundredWord = '';
    if (h > 0) {
      hundredWord = construct && h === 2 && rem === 0 ? 'مائتا' : hundreds[h];
    }

    let remWord = '';
    if (rem > 0) {
      if (rem < 20) {
        remWord = construct && rem === 2 ? 'اثنا' : ones[rem];
      } else {
        const o = rem % 10;
        const t = Math.floor(rem / 10);
        remWord = o > 0 ? ones[o] + ' و' + tens[t] : tens[t];
      }
    }
    return hundredWord && remWord ? hundredWord + ' و' + remWord : hundredWord + remWord;
  }

  const scales = [
    { size: 1000000000, one: 'مليار', dual: 'ملياران', dualConstruct: 'مليارا', few: 'مليارات', many: 'ملياراً' },
    { size: 1000000, one: 'مليون', dual: 'مليونان', dualConstruct: 'مليونا', few: 'ملايين', many: 'مليوناً' },
    { size: 1000, one: 'ألف', dual: 'ألفان', dualConstruct: 'ألفا', few: 'آلاف', many: 'ألفاً' },
  ];

  // Words of a whole number; nounFollows = the counted noun comes right after the last word
  function convertNumberWords(n: number, nounFollows: boolean): string {
    const parts: string[] = [];
    let rest = n;
    for (const scale of scales) {
      const count = Math.floor(rest / scale.size);
      rest = rest % scale.size;
      if (count === 0) continue;
      const isLast = rest === 0;
      const last2 = count % 100;
      if (count === 1) parts.push(scale.one);
      else if (count === 2) parts.push(isLast && nounFollows ? scale.dualConstruct : scale.dual);
      else if (last2 >= 3 && last2 <= 10) parts.push(convertGroup(count) + ' ' + scale.few);
      else if (last2 >= 11) parts.push(convertGroup(count) + ' ' + (isLast && nounFollows ? scale.one : scale.many));
      else parts.push(convertGroup(count, last2 !== 1) + ' ' + scale.one);
    }
    if (rest > 0) parts.push(convertGroup(rest, nounFollows));
    return parts.join(' و');
  }

  function convertPounds(p: number): string {
    if (p === 0) return '';
    if (p === 1) return 'جنيه واحد';
    if (p === 2) return 'جنيهان';

    // The counted noun agrees with the last two digits: 1-2 stand apart, 3-10 plural, 11-99 singular accusative, round numbers singular
    const last2 = p % 100;
    if (last2 === 1 || last2 === 2) {
      return convertNumberWords(p - last2, false) + ' و' + (last2 === 1 ? 'جنيه واحد' : 'جنيهان');
    }
    if (last2 >= 3 && last2 <= 10) return convertNumberWords(p, false) + ' جنيهات';
    if (last2 >= 11) return convertNumberWords(p, false) + ' جنيهاً مصرياً';
    return convertNumberWords(p, true) + ' جنيه';
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
  if (typeof piasters !== 'number' || !Number.isFinite(piasters)) {
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
/**
 * Total discount on a sale for display: `discountPiasters` is the invoice-level discount only,
 * line discounts live on the items. Mirrors the server receipt (PrinterService).
 */
export function totalSaleDiscountPiasters(sale: {
  discountPiasters?: number;
  items?: ReadonlyArray<{ discountPiasters?: number }> | null;
}): number {
  const lineDiscounts = (sale.items || []).reduce((sum, item) => sum + (item.discountPiasters || 0), 0);
  return (sale.discountPiasters || 0) + lineDiscounts;
}

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
  if (!Number.isFinite(value)) return grossPiasters;

  if (type === 'percent') {
    // Exact: percent in thousandths x gross piasters, rounded half up to the nearest piaster (no float product)
    const percentThousandths = decimalToScaledInteger(value, 3);
    const gross = Math.round(grossPiasters);
    const discount = Number((BigInt(gross) * BigInt(percentThousandths) + 50000n) / 100000n);
    return Math.min(grossPiasters, Math.max(0, discount));
  } else {
    // value is in EGP pounds; same decimal reading as poundsToPiasters (1.005 -> 101 piasters)
    const piasters = poundsToPiasters(value);
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

