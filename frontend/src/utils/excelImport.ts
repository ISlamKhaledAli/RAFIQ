import * as XLSX from 'xlsx';
import type { Product, Category } from '../types/models';
import { poundsToPiasters, normalizeArabicNumerals } from './money';
import { invoke } from '../bridge/ipc';

export interface RawImportRow {
  rowIndex: number;
  name: string;
  barcode: string;
  additionalBarcodes: string[];
  categoryName: string;
  unit: 'piece' | 'kg';
  pricePounds: number;
  costPounds: number;
  stockQuantity: number;
  minStockQuantity: number;
  taxRatePercent: number;
  internalCode: string;
  taxCategoryCode: string;
}

export interface ValidatedImportRow {
  rowIndex: number;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  data: RawImportRow;
  payload: {
    name: string;
    barcode: string | null;
    barcodes: string[];
    categoryName: string;
    unit: 'piece' | 'kg';
    pricePiasters: number;
    costPiasters: number;
    stockQuantityMilli: number;
    minStockQuantityMilli: number;
    taxRatePercent: number;
    internalCode: string;
    taxCategoryCode: string;
  };
}

// Flexible column name matching for Arabic & English supermarket templates
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['اسم الصنف', 'الاسم', 'اسم المنتج', 'السلعة', 'الصنف', 'product name', 'name', 'item name'],
  barcode: ['الباركود الرئيسي', 'الباركود', 'كود الصنف', 'الكود', 'barcode', 'code', 'upc', 'ean'],
  additionalBarcodes: ['باركودات إضافية', 'باركودات اضافية', 'اكواد اضافية', 'additional barcodes', 'other barcodes'],
  category: ['القسم / التصنيف', 'القسم', 'التصنيف', 'الفئة', 'المجموعة', 'category', 'group'],
  unit: ['الوحدة', 'نوع البيع', 'نوع الوحدة', 'unit', 'type'],
  price: ['سعر البيع', 'السعر', 'سعر البيع للجمهور', 'سعر القطعة', 'سعر الكيلو', 'selling price', 'price'],
  cost: ['سعر التكلفة', 'التكلفة', 'سعر الشراء', 'سعر الجملة', 'تكلفة الشراء', 'cost price', 'cost'],
  stock: ['الرصيد الافتتاحي', 'الرصيد', 'الكمية', 'الكمية الافتتاحية', 'المخزون', 'stock', 'quantity', 'qty'],
  minStock: ['حد الطلب الأدنى', 'حد الطلب الادنى', 'حد الطلب', 'الحد الأدنى', 'الحد الادنى', 'تنبيه النقص', 'min stock', 'reorder point'],
  tax: ['نسبة الضريبة', 'الضريبة', 'نسبة الضريبة %', 'ضريبة', 'tax', 'vat'],
  internalCode: ['كود الصنف الداخلي', 'كود داخلي', 'sku', 'internal code'],
  taxCode: ['كود التصنيف الضريبي', 'كود ضريبي', 'gs1', 'egs', 'tax code'],
};

function matchHeader(cellValue: string): string | null {
  if (!cellValue) return null;
  const clean = cellValue.toString().trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => clean === alias.toLowerCase())) {
      return key;
    }
  }
  return null;
}

/**
 * تحميل ملف Base64 كملف محلي في المتصفح / WebView2
 */
export function downloadBase64File(base64: string, fileName: string, mimeType: string = 'application/octet-stream'): void {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * توليد وتحميل قالب إكسل رسمي باللغة العربية مع تنسيقات ألوان احترافية (ClosedXML / RTL)
 */
export async function downloadExcelTemplate(): Promise<void> {
  try {
    const res = await invoke<{ success: boolean; base64?: string; fileName?: string }>('excel:getTemplate');
    if (res && res.base64) {
      downloadBase64File(
        res.base64,
        res.fileName || 'قالب_استيراد_المنتجات_رفيق_POS.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return;
    }
  } catch {
    // Fallback to client-side SheetJS below
  }
  const headers = [
    'اسم الصنف *',
    'الباركود الرئيسي',
    'باركودات إضافية (مفصولة بفاصلة)',
    'القسم / التصنيف',
    'الوحدة (قطعة / كجم)',
    'سعر البيع (بالجنيه) *',
    'سعر التكلفة (بالجنيه)',
    'الرصيد الافتتاحي',
    'حد الطلب الأدنى',
    'نسبة الضريبة (%)',
    'كود الصنف الداخلي (SKU)',
    'كود التصنيف الضريبي (GS1/EGS)',
  ];

  const sampleRows = [
    [
      'شاي العروسة ناعم 250 جم',
      '6223000123456',
      '6223000123457, 6223000123458',
      'بقالة ومشروبات',
      'قطعة',
      35.00,
      28.50,
      50,
      10,
      0,
      'TEA-AR-250',
      'EG-100000-01'
    ],
    [
      'طماطم بلدي طازجة درجة أولى',
      '200123456789',
      '',
      'خضار وفاكهة',
      'كجم',
      15.00,
      10.00,
      35.5,
      5,
      0,
      'VEG-TOM-01',
      ''
    ],
    [
      'لبن جهينة كامل الدسم 1 لتر',
      '6221000543210',
      '',
      'ألبان وأجبان',
      'قطعة',
      42.00,
      34.00,
      24,
      6,
      0,
      'DRY-JOH-01',
      ''
    ],
    [
      'جبنة بيضاء رومي قديمة بالوزن',
      '200987654321',
      '',
      'ألبان وأجبان',
      'كجم',
      320.00,
      260.00,
      12.25,
      2.5,
      0,
      'CHS-ROM-01',
      ''
    ]
  ];

  const wsData = [headers, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths for comfortable reading
  ws['!cols'] = [
    { wch: 30 }, // اسم الصنف
    { wch: 18 }, // الباركود
    { wch: 25 }, // باركودات إضافية
    { wch: 18 }, // القسم
    { wch: 15 }, // الوحدة
    { wch: 18 }, // سعر البيع
    { wch: 18 }, // سعر التكلفة
    { wch: 16 }, // الرصيد الافتتاحي
    { wch: 16 }, // حد الطلب
    { wch: 15 }, // نسبة الضريبة
    { wch: 20 }, // كود الصنف الداخلي
    { wch: 24 }, // كود التصنيف الضريبي
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'قالب المنتجات');

  // Trigger browser download
  XLSX.writeFile(wb, 'قالب_استيراد_المنتجات_رفيق_POS.xlsx');
}

/**
 * تصدير كامل أصناف النظام إلى ملف إكسل احترافي ملون ومفصل مع هوامش الربح
 */
export async function exportProductsToExcel(): Promise<{ success: boolean; count?: number; message?: string }> {
  try {
    const res = await invoke<{ success: boolean; base64?: string; fileName?: string; count?: number }>('excel:exportProducts');
    if (res && res.base64) {
      downloadBase64File(
        res.base64,
        res.fileName || 'كتالوج_أصناف_رفيق.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return { success: true, count: res.count };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
  return { success: false, message: 'تعذر توليد ملف الإكسل' };
}

/**
 * تصدير تقرير بالأصناف المرفوضة التي تحتوي على أخطاء لإصلاحها
 */
export function downloadErrorReport(errorRows: ValidatedImportRow[]): void {
  if (errorRows.length === 0) return;

  const headers = [
    'رقم الصف بالملف',
    'سبب الرفض والخطأ',
    'اسم الصنف',
    'الباركود الرئيسي',
    'سعر البيع',
    'سعر التكلفة',
    'الوحدة',
    'الرصيد الافتتاحي',
  ];

  const data = errorRows.map((r) => [
    r.rowIndex,
    [...r.errors, ...r.warnings].join(' | '),
    r.data.name,
    r.data.barcode,
    r.data.pricePounds,
    r.data.costPounds,
    r.data.unit === 'kg' ? 'كجم' : 'قطعة',
    r.data.stockQuantity,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 45 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'أخطاء الاستيراد');
  XLSX.writeFile(wb, 'تقرير_أخطاء_استيراد_المنتجات.xlsx');
}

/**
 * قراءة ملف إكسل أو CSV بأمان واستخراج الصفوف
 */
export async function parseExcelOrCsvFile(file: File): Promise<RawImportRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, raw: false });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('الملف فارغ ولا يحتوي على أي أوراق عمل');
  }

  const sheet = workbook.Sheets[firstSheetName];
  // Parse rows as raw 2D array of strings
  const sheetRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', blankrows: false });

  if (!sheetRows || sheetRows.length < 2) {
    throw new Error('الملف لا يحتوي على صفوف بيانات كافية (يجب وجود صف عناوين وصف بيانات واحد على الأقل)');
  }

  const headerRow = sheetRows[0] as string[];
  const columnMapping: Record<string, number> = {};

  headerRow.forEach((cell, colIndex) => {
    if (cell) {
      const matchedKey = matchHeader(cell);
      if (matchedKey && !(matchedKey in columnMapping)) {
        columnMapping[matchedKey] = colIndex;
      }
    }
  });

  if (!('name' in columnMapping)) {
    throw new Error('لم يتم العثور على عمود "اسم الصنف" في ملف الإكسل. يرجى استخدام القالب المعتمد.');
  }

  const resultRows: RawImportRow[] = [];

  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || row.length === 0) continue;

    // Check if entire row is empty
    const hasAnyContent = row.some((cell) => cell !== null && cell !== undefined && cell.toString().trim() !== '');
    if (!hasAnyContent) continue;

    const getCellString = (key: string): string => {
      const idx = columnMapping[key];
      if (idx === undefined || idx >= row.length) return '';
      const val = row[idx];
      return val !== null && val !== undefined ? val.toString().trim() : '';
    };

    const getCellNumber = (key: string, defaultValue = 0): number => {
      const str = getCellString(key);
      if (!str) return defaultValue;
      const normalized = normalizeArabicNumerals(str).replace(/,/g, '');
      const num = parseFloat(normalized);
      return isNaN(num) ? defaultValue : num;
    };

    const rawName = getCellString('name');
    const rawBarcode = getCellString('barcode');
    const rawAdditionalCodes = getCellString('additionalBarcodes');
    const categoryName = getCellString('category') || 'عام';
    const rawUnit = getCellString('unit').toLowerCase();
    const isKg = rawUnit === 'كجم' || rawUnit === 'كيلو' || rawUnit === 'وزن' || rawUnit === 'kg' || rawUnit === 'gram' || rawUnit === 'جم';

    const pricePounds = getCellNumber('price', 0);
    const costPounds = getCellNumber('cost', 0);
    const stockQuantity = getCellNumber('stock', 0);
    const minStockQuantity = getCellNumber('minStock', 5);
    const taxRatePercent = Math.round(getCellNumber('tax', 0));
    const internalCode = getCellString('internalCode');
    const taxCategoryCode = getCellString('taxCode');

    // Split additional barcodes by comma or semicolon
    const additionalCodes = rawAdditionalCodes
      ? rawAdditionalCodes.split(/[,;\n]/).map((c) => normalizeArabicNumerals(c.trim())).filter(Boolean)
      : [];

    resultRows.push({
      rowIndex: i + 1, // 1-indexed Excel row
      name: rawName,
      barcode: normalizeArabicNumerals(rawBarcode),
      additionalBarcodes: additionalCodes,
      categoryName,
      unit: isKg ? 'kg' : 'piece',
      pricePounds,
      costPounds,
      stockQuantity,
      minStockQuantity,
      taxRatePercent,
      internalCode,
      taxCategoryCode,
    });
  }

  return resultRows;
}

/**
 * التحقق الصارم من الصفوف وكشف الأخطاء والتكرارات والتنبيهات
 */
export function validateImportRows(
  rows: RawImportRow[],
  existingProducts: Product[],
  categories: Category[]
): ValidatedImportRow[] {
  // Build lookup index of existing barcodes
  const dbBarcodeOwners = new Map<string, string>();
  for (const prod of existingProducts) {
    if (prod.barcode) {
      dbBarcodeOwners.set(prod.barcode.toLowerCase(), prod.name);
    }
    if (prod.barcodes) {
      for (const b of prod.barcodes) {
        if (b) dbBarcodeOwners.set(b.toLowerCase(), prod.name);
      }
    }
  }

  // Build category lookup
  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    categoryMap.set(cat.name.trim().toLowerCase(), cat.id);
  }

  // Track in-file barcodes to catch duplicates inside the file
  const seenFileBarcodes = new Map<string, number>();

  const validated: ValidatedImportRow[] = [];

  for (const row of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate Product Name
    if (!row.name || !row.name.trim()) {
      errors.push('اسم الصنف مطلوب ولا يمكن تركه فارغاً');
    }

    // 2. Validate Prices
    if (row.pricePounds < 0) {
      errors.push('سعر البيع لا يمكن أن يكون سالباً');
    }
    if (row.costPounds < 0) {
      errors.push('سعر التكلفة لا يمكن أن يكون سالباً');
    }

    const pricePiasters = poundsToPiasters(row.pricePounds);
    const costPiasters = poundsToPiasters(row.costPounds);

    if (pricePiasters > 0 && costPiasters > 0 && pricePiasters < costPiasters) {
      warnings.push(`سعر البيع (${row.pricePounds.toFixed(2)} ج.م) أقل من التكلفة (${row.costPounds.toFixed(2)} ج.م)`);
    }

    // 3. Validate Stock & Min Stock
    if (row.stockQuantity < 0) {
      errors.push('الرصيد الافتتاحي لا يمكن أن يكون سالباً');
    }
    if (row.minStockQuantity < 0) {
      errors.push('الحد الأدنى للمخزون لا يمكن أن يكون سالباً');
    }

    const stockMilli = Math.round(row.stockQuantity * 1000);
    const minStockMilli = Math.round(row.minStockQuantity * 1000);

    // 4. Validate Barcodes
    const allRowBarcodes = [
      ...(row.barcode ? [row.barcode] : []),
      ...row.additionalBarcodes
    ];

    for (const bc of allRowBarcodes) {
      const lower = bc.toLowerCase();
      // Check in-file collision
      if (seenFileBarcodes.has(lower)) {
        const prevRow = seenFileBarcodes.get(lower);
        errors.push(`الباركود (${bc}) مكرر داخل هذا الملف في الصف رقم ${prevRow}`);
      } else {
        seenFileBarcodes.set(lower, row.rowIndex);
      }

      // Check database collision
      if (dbBarcodeOwners.has(lower)) {
        const ownerName = dbBarcodeOwners.get(lower);
        warnings.push(`الباركود (${bc}) مسجل مسبقاً في النظام للمنتج: "${ownerName}"`);
      }
    }

    let status: 'valid' | 'warning' | 'error' = 'valid';
    if (errors.length > 0) {
      status = 'error';
    } else if (warnings.length > 0) {
      status = 'warning';
    }

    validated.push({
      rowIndex: row.rowIndex,
      status,
      errors,
      warnings,
      data: row,
      payload: {
        name: row.name.trim(),
        barcode: row.barcode ? row.barcode.trim() : null,
        barcodes: allRowBarcodes,
        categoryName: row.categoryName,
        unit: row.unit,
        pricePiasters,
        costPiasters,
        stockQuantityMilli: stockMilli,
        minStockQuantityMilli: minStockMilli,
        taxRatePercent: row.taxRatePercent,
        internalCode: row.internalCode.trim(),
        taxCategoryCode: row.taxCategoryCode.trim(),
      },
    });
  }

  return validated;
}
