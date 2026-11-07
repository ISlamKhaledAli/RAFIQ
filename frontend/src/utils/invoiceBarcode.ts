import { convertArabicLayoutToBarcode } from './barcodeReader.ts';

export interface InvoiceBarcodeMatch {
  type: 'sale' | 'return';
  invoiceNumber?: number;
  rawId?: string;
  originalQuery: string;
}

/**
 * فحص وتفكيك باركود الفاتورة أو المرتجع الرسمي المميز لنظام رفيق
 * يتعرف بدقة وفورية على الصيغ المعتمدة:
 * 1. فواتير البيع: RFQ-INV-00001001 أو RFQ-00001001 أو INV-00001001 أو INV1001
 * 2. المعرّف الفريد UUID مثل RFQ-INV-d948df92-... أو INV-d948df92-...
 * 3. باركود إيصال المرتجع: RFQ-RET-00000123 أو RFQ-RET-123 أو RET-000123 أو RET123
 * 4. الحصانة التامة من لوحة المفاتيح العربية:
 *    إذا كان الكاشير يعمل باللغة العربية، يتم فك الأحرف تلقائياً:
 *    (قبض-هىر-00001001 -> RFQ-INV-00001001) و (هىر-00001001 -> INV-00001001)
 *    و (قبض-قثف-00000123 -> RFQ-RET-00000123)
 */
export function parseInvoiceBarcode(rawInput: string): InvoiceBarcodeMatch | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // تحويل لوحة المفاتيح العربية في حال كان الكاشير يعمل باللغة العربية
  const normalized = convertArabicLayoutToBarcode(trimmed).toUpperCase();

  // 1. فحص باركود فواتير البيع (RFQ-INV- / RFQ- / INV- / #)
  // الصيغة الرسمية لمشروع رفيق: RFQ-INV-00001234 أو RFQ-00001234 أو INV-00001234 أو #1234
  const invPrefixMatch = normalized.match(/^(?:(?:RFQ-INV|RFQ|INV)-?|#)([0-9]+)$/i);
  if (invPrefixMatch && invPrefixMatch[1]) {
    const num = parseInt(invPrefixMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      return {
        type: 'sale',
        invoiceNumber: num,
        originalQuery: trimmed,
      };
    }
  }

  // الصيغة بالمعرّف الكامل UUID
  const invUuidMatch = normalized.match(/^(?:(?:RFQ-INV|RFQ|INV)-?)([A-F0-9-]{32,36})$/i);
  if (invUuidMatch && invUuidMatch[1]) {
    return {
      type: 'sale',
      rawId: invUuidMatch[1].toLowerCase(),
      originalQuery: trimmed,
    };
  }

  // 2. فحص باركود إيصالات المرتجع (RFQ-RET- / RET-)
  // الصيغة الرسمية: RFQ-RET-00000123 أو RET-000123 أو RET123
  const retPrefixMatch = normalized.match(/^(?:(?:RFQ-RET|RET)-?)([0-9]+)$/i);
  if (retPrefixMatch && retPrefixMatch[1]) {
    const num = parseInt(retPrefixMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      return {
        type: 'return',
        invoiceNumber: num,
        originalQuery: trimmed,
      };
    }
  }

  return null;
}

/**
 * توليد الباركود النصي المميز لفواتير بيع نظام رفيق بنظام Code 128
 * البصمة الرسمية المعتمدة: "RFQ-INV-00001001"
 */
export function formatInvoiceBarcode(invoiceNumber: number | string | null | undefined): string {
  if (invoiceNumber === null || invoiceNumber === undefined) return '';
  const num = typeof invoiceNumber === 'number' ? invoiceNumber : parseInt(String(invoiceNumber).trim(), 10);
  if (!isNaN(num) && num > 0) {
    return `RFQ-INV-${String(num).padStart(8, '0')}`;
  }
  const str = String(invoiceNumber).trim().toUpperCase();
  if (str.startsWith('RFQ-INV-')) return str;
  if (str.startsWith('RFQ-')) return str.replace(/^RFQ-/, 'RFQ-INV-');
  if (str.startsWith('INV-')) return `RFQ-${str}`;
  return `RFQ-INV-${str}`;
}

/**
 * توليد الباركود النصي المميز لإيصالات مرتجعات نظام رفيق بنظام Code 128
 * البصمة الرسمية المعتمدة: "RFQ-RET-00000123"
 */
export function formatReturnBarcode(returnNumber: number | string | null | undefined): string {
  if (returnNumber === null || returnNumber === undefined) return '';
  const num = typeof returnNumber === 'number' ? returnNumber : parseInt(String(returnNumber).trim(), 10);
  if (!isNaN(num) && num > 0) {
    return `RFQ-RET-${String(num).padStart(8, '0')}`;
  }
  const str = String(returnNumber).trim().toUpperCase();
  if (str.startsWith('RFQ-RET-')) return str;
  if (str.startsWith('RET-')) return `RFQ-${str}`;
  return `RFQ-RET-${str}`;
}

/**
 * فحص الأرقام المتطابقة مع فواتير قديمة طُبعت بأصفار بادئة (مثل 00001042)
 * تُستخدم حصراً كخيار تراجع ذكي في شاشة البيع عند فشل العثور على صنف بهذا الباركود.
 */
export function extractLegacyPaddedInvoiceNumber(rawInput: string): number | null {
  if (!rawInput) return null;
  const trimmed = convertArabicLayoutToBarcode(rawInput.trim());
  if (/^0{2,}[1-9][0-9]*$/.test(trimmed) && trimmed.length <= 10) {
    const num = parseInt(trimmed, 10);
    return !isNaN(num) && num > 0 ? num : null;
  }
  return null;
}

