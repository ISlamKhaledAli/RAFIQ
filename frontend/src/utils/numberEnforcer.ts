/**
 * نظام فرض الأرقام القياسية الموحدة (0-9) لمشروع رفيق (Rafiq POS)
 * يضمن هذا الملف توحيد كافة الأرقام عبر النظام بالكامل ومنع ظهور أي أرقام مشرقية (٠-٩)
 * نهائياً وبشكل قطعي ودائم، عبر طبقات حماية متعددة:
 * 1. ترقيع دوال التحويل في محرك الجافاسكريبت (Date / Number / Intl)
 * 2. التقاط وتصحيح مدخلات لوحة المفاتيح العربية في حقول الإدخال فورياً
 * 3. مراقبة شجرة الـ DOM عبر MutationObserver لمنع تسرب أي أرقام من خوادم أو مكونات خارجية
 */

/**
 * تحويل الأرقام العربية المشرقية (٠-٩) والفارسية (۰-۹) إلى أرقام لاتينية قياسية (0-9)
 * مع الحفاظ الكامل على الحروف والنصوص العربية
 */
export function normalizeArabicDigits(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : String(str);
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/(\d)\u066B(\d)/g, '$1.$2'); // تحويل الفاصلة العشرية العربية بين الأرقام إلى نقطة
}

/**
 * تنظيف وتوحيد المدخلات الرقمية والأسعار والأوزان
 * تحول الأرقام والفواصل العربية (، ٫) إلى نقطة عشرية
 */
export function normalizeNumericInput(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : String(str);
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[،٫]/g, '.');
}

/**
 * تثبيت حماية الأرقام القياسية في محرك الجافاسكريبت والـ DOM
 */
export function installGlobalNumeralEnforcer(): void {
  const globalScope: any = typeof globalThis !== 'undefined' 
    ? globalThis 
    : typeof window !== 'undefined' 
      ? window 
      : null;
  if (!globalScope) return;

  // منع التثبيت المتكرر
  if (globalScope.__rafiq_numeral_enforcer_installed__) return;
  globalScope.__rafiq_numeral_enforcer_installed__ = true;

  // 1. ترقيع Number.prototype.toLocaleString
  const origNumberToLocaleString = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locales?: string | string[], options?: Intl.NumberFormatOptions) {
    let safeLocales: string | string[] = locales || 'en-US';
    const safeOptions: Intl.NumberFormatOptions = options ? { ...options } : {};

    if (typeof safeLocales === 'string' && safeLocales.startsWith('ar')) {
      if (!safeLocales.includes('-u-nu-latn')) {
        safeLocales = `${safeLocales}-u-nu-latn`;
      }
      safeOptions.numberingSystem = 'latn';
    }

    try {
      const res = origNumberToLocaleString.call(this, safeLocales, safeOptions);
      return normalizeArabicDigits(res);
    } catch {
      return normalizeArabicDigits(origNumberToLocaleString.call(this, 'en-US', options));
    }
  };

  // 2. ترقيع Date.prototype.toLocaleString
  const origDateToLocaleString = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    let safeLocales: string | string[] = locales || 'ar-EG-u-nu-latn';
    const safeOptions: Intl.DateTimeFormatOptions = options ? { ...options } : {};

    if (typeof safeLocales === 'string' && safeLocales.startsWith('ar') && !safeLocales.includes('-u-nu-latn')) {
      safeLocales = `${safeLocales}-u-nu-latn`;
    }
    safeOptions.numberingSystem = 'latn';

    try {
      const res = origDateToLocaleString.call(this, safeLocales, safeOptions);
      return normalizeArabicDigits(res);
    } catch {
      return normalizeArabicDigits(origDateToLocaleString.call(this, 'en-US', options));
    }
  };

  // 3. ترقيع Date.prototype.toLocaleDateString
  const origDateToLocaleDateString = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    let safeLocales: string | string[] = locales || 'ar-EG-u-nu-latn';
    const safeOptions: Intl.DateTimeFormatOptions = options ? { ...options } : {};

    if (typeof safeLocales === 'string' && safeLocales.startsWith('ar') && !safeLocales.includes('-u-nu-latn')) {
      safeLocales = `${safeLocales}-u-nu-latn`;
    }
    safeOptions.numberingSystem = 'latn';

    try {
      const res = origDateToLocaleDateString.call(this, safeLocales, safeOptions);
      return normalizeArabicDigits(res);
    } catch {
      return normalizeArabicDigits(origDateToLocaleDateString.call(this, 'en-US', options));
    }
  };

  // 4. ترقيع Date.prototype.toLocaleTimeString
  const origDateToLocaleTimeString = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleTimeString = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    let safeLocales: string | string[] = locales || 'ar-EG-u-nu-latn';
    const safeOptions: Intl.DateTimeFormatOptions = options ? { ...options } : {};

    if (typeof safeLocales === 'string' && safeLocales.startsWith('ar') && !safeLocales.includes('-u-nu-latn')) {
      safeLocales = `${safeLocales}-u-nu-latn`;
    }
    safeOptions.numberingSystem = 'latn';

    try {
      const res = origDateToLocaleTimeString.call(this, safeLocales, safeOptions);
      return normalizeArabicDigits(res);
    } catch {
      return normalizeArabicDigits(origDateToLocaleTimeString.call(this, 'en-US', options));
    }
  };

  // 5. ترقيع Intl.NumberFormat
  if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
    const origNumberFormatDescriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'format');
    if (origNumberFormatDescriptor && origNumberFormatDescriptor.get) {
      const origGet = origNumberFormatDescriptor.get;
      Object.defineProperty(Intl.NumberFormat.prototype, 'format', {
        get() {
          const boundFormat = origGet.call(this);
          return function (this: any, n: number | bigint) {
            return normalizeArabicDigits(boundFormat(n));
          };
        },
        configurable: true,
        enumerable: false,
      });
    }

    const OrigNumberFormat = Intl.NumberFormat;
    const PatchedNumberFormat = function (this: any, locales?: string | string[], options?: Intl.NumberFormatOptions) {
      let safeLocales: string | string[] = locales || 'en-US';
      const safeOptions: Intl.NumberFormatOptions = options ? { ...options } : {};

      if (typeof safeLocales === 'string' && safeLocales.startsWith('ar')) {
        if (!safeLocales.includes('-u-nu-latn')) {
          safeLocales = `${safeLocales}-u-nu-latn`;
        }
        safeOptions.numberingSystem = 'latn';
      }

      return new (OrigNumberFormat as any)(safeLocales, safeOptions);
    } as any;

    PatchedNumberFormat.prototype = OrigNumberFormat.prototype;
    PatchedNumberFormat.supportedLocalesOf = OrigNumberFormat.supportedLocalesOf;
    (Intl as any).NumberFormat = PatchedNumberFormat;
  }

  // 6. ترقيع Intl.DateTimeFormat
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    const origDateTimeFormatDescriptor = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
    if (origDateTimeFormatDescriptor && origDateTimeFormatDescriptor.get) {
      const origGet = origDateTimeFormatDescriptor.get;
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
        get() {
          const boundFormat = origGet.call(this);
          return function (this: any, d?: Date | number) {
            return normalizeArabicDigits(boundFormat(d));
          };
        },
        configurable: true,
        enumerable: false,
      });
    }

    const OrigDateTimeFormat = Intl.DateTimeFormat;
    const PatchedDateTimeFormat = function (this: any, locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      let safeLocales: string | string[] = locales || 'ar-EG-u-nu-latn';
      const safeOptions: Intl.DateTimeFormatOptions = options ? { ...options } : {};

      if (typeof safeLocales === 'string' && safeLocales.startsWith('ar') && !safeLocales.includes('-u-nu-latn')) {
        safeLocales = `${safeLocales}-u-nu-latn`;
      }
      safeOptions.numberingSystem = 'latn';

      return new (OrigDateTimeFormat as any)(safeLocales, safeOptions);
    } as any;

    PatchedDateTimeFormat.prototype = OrigDateTimeFormat.prototype;
    PatchedDateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;
    (Intl as any).DateTimeFormat = PatchedDateTimeFormat;
  }

  // 7. التقاط وتصحيح مدخلات لوحة المفاتيح العربية في حقول الإدخال تلقائياً
  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || !('value' in target) || typeof target.value !== 'string') return;

    if (/[\u0660-\u0669\u06F0-\u06F9]/.test(target.value)) {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const normalized = normalizeArabicDigits(target.value);

      // استخدام setter الأصلي لتحديث حالة React Controlled Components
      const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(target, normalized);
      } else {
        target.value = normalized;
      }

      if (start !== null && end !== null) {
        target.setSelectionRange(start, end);
      }

      // إطلاق حدث input لضمان تحديث الـ state في React
      const evt = new Event('input', { bubbles: true });
      target.dispatchEvent(evt);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('input', handleInputChange, true);
    window.addEventListener('change', handleInputChange, true);
  }

  // 8. مراقبة الـ DOM عبر MutationObserver كشبكة أمان نهائية
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const sanitizeNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue && /[\u0660-\u0669\u06F0-\u06F9]/.test(node.nodeValue)) {
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) return;
          node.nodeValue = normalizeArabicDigits(node.nodeValue);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        for (let i = 0; i < el.childNodes.length; i++) {
          sanitizeNode(el.childNodes[i]);
        }
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            sanitizeNode(m.addedNodes[j]);
          }
        } else if (m.type === 'characterData') {
          if (m.target.nodeValue && /[\u0660-\u0669\u06F0-\u06F9]/.test(m.target.nodeValue)) {
            m.target.nodeValue = normalizeArabicDigits(m.target.nodeValue);
          }
        }
      }
    });

    const initObserver = () => {
      if (document.documentElement) {
        // فحص مبدئي لما هو موجود بالفعل
        sanitizeNode(document.documentElement);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initObserver);
    } else {
      initObserver();
    }
  }
}

// تنفيذ التثبيت الفوري بمجرد استيراد الملف
installGlobalNumeralEnforcer();
