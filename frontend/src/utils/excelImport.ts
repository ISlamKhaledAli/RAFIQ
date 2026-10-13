import type { Product, Category } from '../types/models';
import { poundsToPiasters, normalizeArabicNumerals, normalizeArabicText } from './money';
import { invoke } from '../bridge/ipc';

async function getXlsx() {
  return await import('xlsx');
}

export interface RawImportRow {
  rowIndex: number;
  name: string;
  barcode: string;
  additionalBarcodes: string[];
  categoryName: string;
  unit: 'piece' | 'kg';
  variantColor?: string;
  variantSize?: string;
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
    variantColor?: string;
    variantSize?: string;
    pricePiasters: number;
    costPiasters: number;
    stockQuantityMilli: number;
    minStockQuantityMilli: number;
    taxRatePercent: number;
    internalCode: string;
    taxCategoryCode: string;
  };
}

// Flexible column name matching for Arabic & English retail & supermarket templates
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['اسم الصنف', 'الاسم', 'اسم المنتج', 'السلعة', 'الصنف', 'product name', 'name', 'item name'],
  barcode: ['الباركود الرئيسي', 'الباركود', 'كود الصنف', 'الكود', 'barcode', 'code', 'upc', 'ean'],
  additionalBarcodes: ['باركودات إضافية', 'باركودات اضافية', 'اكواد اضافية', 'additional barcodes', 'other barcodes'],
  category: ['القسم / التصنيف', 'القسم', 'التصنيف', 'الفئة', 'المجموعة', 'category', 'group'],
  unit: ['الوحدة', 'نوع البيع', 'نوع الوحدة', 'unit', 'type'],
  color: ['اللون', 'لون', 'color', 'colour'],
  size: ['المقاس', 'مقاس', 'الحجم', 'size'],
  price: ['سعر البيع', 'السعر', 'سعر البيع للجمهور', 'سعر القطعة', 'سعر الكيلو', 'selling price', 'price'],
  cost: ['سعر التكلفة', 'التكلفة', 'سعر الشراء', 'سعر الجملة', 'تكلفة الشراء', 'cost price', 'cost'],
  stock: ['الرصيد الافتتاحي', 'الرصيد الحالي', 'الرصيد', 'الكمية', 'الكمية الافتتاحية', 'المخزون', 'stock', 'quantity', 'qty'],
  minStock: ['حد الطلب الأدنى', 'حد الطلب الادنى', 'حد الطلب', 'الحد الأدنى', 'الحد الادنى', 'تنبيه النقص', 'min stock', 'reorder point'],
  tax: ['نسبة الضريبة', 'الضريبة', 'ضريبة', 'tax', 'vat'],
  internalCode: ['كود الصنف الداخلي', 'كود الصنف', 'كود داخلي', 'sku', 'internal code'],
  taxCode: ['كود التصنيف الضريبي', 'كود ضريبي', 'gs1', 'egs', 'tax code'],
};

function matchHeader(cellValue: string): string | null {
  if (!cellValue) return null;
  const raw = cellValue.toString().trim().toLowerCase();
  const clean = raw.replace(/[*()（）]/g, '').replace(/\s+/g, ' ').trim();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const cleanAlias = alias.toLowerCase().replace(/[*()（）]/g, '').trim();
      if (clean === cleanAlias || raw === cleanAlias || clean.includes(cleanAlias) || raw.includes(cleanAlias)) {
        return key;
      }
    }
  }
  return null;
}

/**
 * تنظيف وتصحيح نصوص الباركود القادمة من ملفات الإكسل
 * يعالج الترقيم العلمي (Scientific Notation مثل 6.223E+12) ونهايات الأرقام العشرية (.0)
 */
export function cleanExcelBarcode(raw: string): string {
  if (!raw) return '';
  let str = normalizeArabicNumerals(raw).trim();
  if (/^\d+\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
  }
  if (/^[0-9]+(\.[0-9]+)?[eE]\+[0-9]+$/.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {
      // fallback to original
    }
  }
  return str;
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
  const XLSX = await getXlsx();

  const standardHeaders = [
    'م',
    'اسم الصنف *',
    'الباركود الرئيسي',
    'باركودات إضافية (مفصولة بفاصلة)',
    'الوحدة (قطعة / كجم)',
    'سعر البيع (بالجنيه) *',
    'سعر التكلفة (بالجنيه)',
    'الرصيد الافتتاحي',
    'حد الطلب الأدنى',
    'هامش الربح للقطعة (ج.م)',
    'نسبة الربح (%)',
    'إجمالي قيمة التكلفة (ج.م)',
    'إجمالي القيمة البيعية (ج.م)',
    'إجمالي الربح المتوقع (ج.م)',
    'حالة المخزون التلقائية',
    'نسبة الضريبة (%)',
    'كود الصنف الداخلي (SKU)',
    'اللون (اختياري / للملابس)',
    'المقاس (اختياري / للملابس)',
    'كود التصنيف الضريبي (GS1/EGS)',
  ];

  const standardColWidths = [
    { wch: 6 },
    { wch: 38 },
    { wch: 20 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
  ];

  function buildSheetJsProductSheet(sheetTitle: string, itemsList: any[]) {
    const titleRow = [`رفيق POS - ${sheetTitle}`];
    const subRow = [
      'تعليمات هامة: الأعمدة المميزة بنجمة (*) إلزامية | اسم التابة يمثل القسم تلقائياً | الباركودات تحفظ كنص | المبالغ بالجنيه المصري | الأعمدة تتحدث بمعادلات إكسل التلقائية'
    ];

    const dataRows = itemsList.map((item, idx) => {
      const r = idx + 4;
      const price = Number(item.price || 0);
      const cost = Number(item.cost || 0);
      const stock = Number(item.stock || 0);
      const minStock = Number(item.minStock || 0);
      const unitMargin = price - cost;
      const marginPct = cost > 0 ? unitMargin / cost : 0;
      const totalCost = stock * cost;
      const totalRetail = stock * price;
      const totalProfit = totalRetail - totalCost;
      const statusText = stock <= 0 ? 'نفد من المخزن' : (stock <= minStock ? 'قارب على النفاد' : 'متوفر بالمخزن');

      return [
        idx + 1,
        item.name || '',
        item.barcode ? String(item.barcode) : '',
        item.additionalBarcodes ? String(item.additionalBarcodes) : '',
        item.unit || 'قطعة',
        price,
        cost,
        stock,
        minStock,
        { f: `F${r}-G${r}`, t: 'n', v: Number(unitMargin.toFixed(2)) },
        { f: `IF(G${r}>0, (F${r}-G${r})/G${r}, 0)`, t: 'n', v: Number(marginPct.toFixed(4)), z: '0.0%' },
        { f: `H${r}*G${r}`, t: 'n', v: Number(totalCost.toFixed(2)), z: '#,##0.00' },
        { f: `H${r}*F${r}`, t: 'n', v: Number(totalRetail.toFixed(2)), z: '#,##0.00' },
        { f: `M${r}-L${r}`, t: 'n', v: Number(totalProfit.toFixed(2)), z: '#,##0.00' },
        { f: `IF(H${r}<=0, "نفد من المخزن", IF(H${r}<=I${r}, "قارب على النفاد", "متوفر بالمخزن"))`, t: 's', v: statusText },
        Number(item.taxRate || 0),
        item.sku || `SKU-${String(idx + 1).padStart(4, '0')}`,
        item.color || '',
        item.size || '',
        item.taxCategoryCode || '',
      ];
    });

    const lastDataRow = itemsList.length + 3;
    const sumRowIdx = itemsList.length + 4;
    const summaryRow = [
      'الإجمالي',
      `إجمالي ${itemsList.length} صنف مسجل`,
      '',
      '',
      '',
      { f: `AVERAGE(F4:F${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `AVERAGE(G4:G${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `SUM(H4:H${lastDataRow})`, t: 'n', z: '#,##0.##' },
      '',
      { f: `AVERAGE(J4:J${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `IF(L${sumRowIdx}>0, N${sumRowIdx}/L${sumRowIdx}, 0)`, t: 'n', z: '0.0%' },
      { f: `SUM(L4:L${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `SUM(M4:M${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `SUM(N4:N${lastDataRow})`, t: 'n', z: '#,##0.00' },
      'محسوب بالمعادلات',
      '',
      '',
      '',
      '',
      '',
    ];

    const allRows = [titleRow, subRow, standardHeaders, ...dataRows, summaryRow];
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 19 } },
    ];
    ws['!cols'] = standardColWidths;
    ws['!views'] = [{ rightToLeft: true }];
    return ws;
  }

  // Sample data across diverse categories (stock set to 0 by default so merchant enters actual inventory)
  const sampleGrocery = [
    { name: 'شاي العروسة ناعم 250 جم', barcode: '6223000123456', additionalBarcodes: '6223000123457', category: 'بقالة ومشروبات', unit: 'قطعة', price: 35.0, cost: 28.5, stock: 0, minStock: 10, sku: 'TEA-AR-250', taxCategoryCode: 'EG-100000-01' },
    { name: 'سكر أبيض فاخر 1 كجم', barcode: '6223000987654', category: 'بقالة ومشروبات', unit: 'قطعة', price: 27.0, cost: 22.0, stock: 0, minStock: 15, sku: 'SGR-01' },
    { name: 'زيت خليط قلية ممتاز 700 مل', barcode: '6224000112233', category: 'بقالة ومشروبات', unit: 'قطعة', price: 55.0, cost: 46.0, stock: 0, minStock: 8, sku: 'OIL-700' },
  ];

  const sampleClothing = [
    { name: 'تيشيرت بولو كاجوال رجالي', barcode: '6225501100026', category: 'ملابس وأحذية', unit: 'قطعة', price: 220.0, cost: 140.0, stock: 0, minStock: 5, color: 'كحلي', size: 'L', sku: 'POLO-NV-L' },
    { name: 'بنطلون جينز كلاسيك شبابي', barcode: '6225502200031', category: 'ملابس وأحذية', unit: 'قطعة', price: 350.0, cost: 230.0, stock: 0, minStock: 4, color: 'أزرق غامق', size: '34', sku: 'JNS-BLU-34' },
    { name: 'حذاء رياضي كوتشي كاجوال', barcode: '6225504400017', category: 'ملابس وأحذية', unit: 'قطعة', price: 320.0, cost: 200.0, stock: 0, minStock: 3, color: 'أسود', size: '42', sku: 'SHOE-BK-42' },
  ];

  const sampleDairy = [
    { name: 'جبنة بيضاء رومي قديمة بالوزن', barcode: '200987654321', category: 'ألبان وأجبان', unit: 'كجم', price: 320.0, cost: 260.0, stock: 0, minStock: 3, sku: 'CHS-ROM-01', taxCategoryCode: 'EG-100000-03' },
    { name: 'حليب كامل الدسم مبستر 1 لتر', barcode: '6221000123987', category: 'ألبان وأجبان', unit: 'قطعة', price: 38.0, cost: 31.0, stock: 0, minStock: 10, sku: 'MLK-1L' },
    { name: 'جبنة فيتا دومتي أبيض 500 جم', barcode: '6221000456123', category: 'ألبان وأجبان', unit: 'قطعة', price: 42.0, cost: 34.0, stock: 0, minStock: 12, sku: 'CHS-DOM-500' },
  ];

  const sampleCleaning = [
    { name: 'صابون سائل بريل بالليمون 1 لتر', barcode: '6222000554433', category: 'منظفات وعناية', unit: 'قطعة', price: 42.0, cost: 35.0, stock: 0, minStock: 5, sku: 'CLN-PRL-01', taxCategoryCode: 'EG-100000-05' },
    { name: 'مسحوق غسيل أوتوماتيك أريال 2.5 كجم', barcode: '6222000889911', category: 'منظفات وعناية', unit: 'قطعة', price: 175.0, cost: 145.0, stock: 0, minStock: 5, sku: 'DET-ARL-25' },
  ];

  const wb = XLSX.utils.book_new();

  // Category Tabs directly: Each department has its own tab with products and formulas
  XLSX.utils.book_append_sheet(wb, buildSheetJsProductSheet('قسم: بقالة ومشروبات', sampleGrocery), 'بقالة ومشروبات');
  XLSX.utils.book_append_sheet(wb, buildSheetJsProductSheet('قسم: ملابس وأحذية', sampleClothing), 'ملابس وأحذية');
  XLSX.utils.book_append_sheet(wb, buildSheetJsProductSheet('قسم: ألبان وأجبان', sampleDairy), 'ألبان وأجبان');
  XLSX.utils.book_append_sheet(wb, buildSheetJsProductSheet('قسم: منظفات وعناية', sampleCleaning), 'منظفات وعناية');

  // Trigger browser download
  XLSX.writeFile(wb, 'قالب_استيراد_المنتجات_رفيق_POS.xlsx');
}

function getFormattedTimestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

async function exportProductsViaSheetJs(products: Product[], catMap: Map<string, string>): Promise<void> {
  const XLSX = await getXlsx();

  const standardHeaders = [
    'م',
    'اسم الصنف *',
    'الباركود الرئيسي',
    'باركودات إضافية (مفصولة بفاصلة)',
    'الوحدة (قطعة / كجم)',
    'سعر البيع (بالجنيه) *',
    'سعر التكلفة (بالجنيه)',
    'الرصيد الافتتاحي',
    'حد الطلب الأدنى',
    'هامش الربح للقطعة (ج.م)',
    'نسبة الربح (%)',
    'إجمالي قيمة التكلفة (ج.م)',
    'إجمالي القيمة البيعية (ج.م)',
    'إجمالي الربح المتوقع (ج.م)',
    'حالة المخزون التلقائية',
    'نسبة الضريبة (%)',
    'كود الصنف الداخلي (SKU)',
    'اللون (اختياري / للملابس)',
    'المقاس (اختياري / للملابس)',
    'كود التصنيف الضريبي (GS1/EGS)',
  ];

  const standardColWidths = [
    { wch: 6 },
    { wch: 38 },
    { wch: 20 },
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
  ];

  function buildSheetJsProductSheet(sheetTitle: string, prods: Product[]) {
    const titleRow = [`رفيق POS - ${sheetTitle}`];
    const subRow = [
      `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} | اسم التابة يمثل القسم تلقائياً | إجمالي الأصناف: ${prods.length} صنف | المبالغ بالجنيه المصري | المعادلات تتحدث تلقائياً`
    ];

    const dataRows = prods.map((prod, idx) => {
      const r = idx + 4;
      const price = (prod.pricePiasters || 0) / 100.0;
      const cost = (prod.costPiasters || 0) / 100.0;
      const stock = (prod.stockQuantityMilli || 0) / 1000.0;
      const minStock = (prod.minStockQuantityMilli || 0) / 1000.0;
      const unitMargin = price - cost;
      const marginPct = cost > 0 ? unitMargin / cost : 0;
      const totalCost = stock * cost;
      const totalRetail = stock * price;
      const totalProfit = totalRetail - totalCost;
      const statusText = stock <= 0 ? 'نفد من المخزن' : (stock <= minStock ? 'قارب على النفاد' : 'متوفر بالمخزن');

      const extraBarcodes = Array.isArray(prod.barcodes) ? prod.barcodes.filter(Boolean).join(', ') : '';

      return [
        idx + 1,
        prod.name || '',
        prod.barcode || '',
        extraBarcodes,
        prod.unit === 'kg' ? 'كجم' : 'قطعة',
        price,
        cost,
        stock,
        minStock,
        { f: `F${r}-G${r}`, t: 'n', v: Number(unitMargin.toFixed(2)) },
        { f: `IF(G${r}>0, (F${r}-G${r})/G${r}, 0)`, t: 'n', v: Number(marginPct.toFixed(4)), z: '0.0%' },
        { f: `H${r}*G${r}`, t: 'n', v: Number(totalCost.toFixed(2)), z: '#,##0.00' },
        { f: `H${r}*F${r}`, t: 'n', v: Number(totalRetail.toFixed(2)), z: '#,##0.00' },
        { f: `M${r}-L${r}`, t: 'n', v: Number(totalProfit.toFixed(2)), z: '#,##0.00' },
        { f: `IF(H${r}<=0, "نفد من المخزن", IF(H${r}<=I${r}, "قارب على النفاد", "متوفر بالمخزن"))`, t: 's', v: statusText },
        Number(prod.taxRatePercent || 0),
        prod.internalCode || '',
        prod.variantColor || '',
        prod.variantSize || '',
        '',
      ];
    });

    const lastDataRow = prods.length + 3;
    const sumRowIdx = prods.length + 4;
    const summaryRow = [
      'الإجمالي',
      `إجمالي ${prods.length} صنف مسجل`,
      '',
      '',
      '',
      { f: `AVERAGE(F4:F${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `AVERAGE(G4:G${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `SUM(H4:H${lastDataRow})`, t: 'n', z: '#,##0.##' },
      '',
      { f: `AVERAGE(J4:J${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `IF(L${sumRowIdx}>0, N${sumRowIdx}/L${sumRowIdx}, 0)`, t: 'n', z: '0.0%' },
      { f: `SUM(L4:L${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `SUM(M4:M${lastDataRow})`, t: 'n', z: '#,##0.00' },
      { f: `SUM(N4:N${lastDataRow})`, t: 'n', z: '#,##0.00' },
      'محسوب بمعادلات إكسل',
      '',
      '',
      '',
      '',
      '',
    ];

    const allRows = [titleRow, subRow, standardHeaders, ...dataRows, summaryRow];
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 19 } },
    ];
    ws['!cols'] = standardColWidths;
    ws['!views'] = [{ rightToLeft: true }];
    return ws;
  }

  // 1. Group products by category
  const categoryGroups = new Map<string, Product[]>();
  products.forEach((p) => {
    const cat = ((p.categoryId && catMap.get(p.categoryId)) || 'عام').trim();
    if (!categoryGroups.has(cat)) {
      categoryGroups.set(cat, []);
    }
    categoryGroups.get(cat)!.push(p);
  });

  const categoriesList = Array.from(categoryGroups.keys());

  const wb = XLSX.utils.book_new();

  // Clean sheet names
  const usedSheetNames = new Set<string>();
  const categorySheetNames = new Map<string, string>();
  categoriesList.forEach((cat) => {
    let clean = cat.replace(/[\\/?*:[\]']/g, '_').trim();
    if (clean.length > 28) clean = clean.substring(0, 28);
    let sName = clean;
    let counter = 1;
    while (usedSheetNames.has(sName)) {
      sName = `${clean.substring(0, 24)}_${counter++}`;
    }
    usedSheetNames.add(sName);
    categorySheetNames.set(cat, sName);
  });

  if (categoriesList.length === 0) {
    const wsDefault = buildSheetJsProductSheet('قائمة أصناف المتجر', products);
    XLSX.utils.book_append_sheet(wb, wsDefault, 'الأصناف_العامة');
  } else {
    // Dedicated Category Tabs Only - Each category has its own sheet with its items and formulas
    categoriesList.forEach((cat) => {
      const catProds = categoryGroups.get(cat) || [];
      const catSheetName = categorySheetNames.get(cat) || cat;
      const wsCategory = buildSheetJsProductSheet(`قائمة أصناف قسم: [${cat}]`, catProds);
      XLSX.utils.book_append_sheet(wb, wsCategory, catSheetName);
    });
  }

  XLSX.writeFile(wb, `كتالوج_أصناف_رفيق_${getFormattedTimestamp()}.xlsx`);
}


async function exportCustomersViaSheetJs(customers: any[]): Promise<void> {
  const XLSX = await getXlsx();
  const headers = [
    'م',
    'اسم العميل',
    'رقم الهاتف',
    'الرصيد المستحق الحالي (ج.م)',
    'حد الائتمان / التنبيه (ج.م)',
    'حالة الحساب',
    'ملاحظات',
  ];

  const rows = customers.map((c, idx) => {
    const balPounds = (c.balancePiasters || 0) / 100.0;
    const limitPounds = (c.creditLimitPiasters || 0) / 100.0;
    let statusText = 'مسدد بالكامل';
    if (c.balancePiasters > c.creditLimitPiasters && c.creditLimitPiasters > 0) {
      statusText = 'تجاوز حد الائتمان';
    } else if (c.balancePiasters > 0) {
      statusText = 'عليه رصيد مدين';
    }

    return [
      idx + 1,
      c.name || '',
      c.phone || '',
      balPounds,
      limitPounds,
      statusText,
      c.notes || '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 20 },
    { wch: 24 },
    { wch: 24 },
    { wch: 22 },
    { wch: 35 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'حسابات_العملاء');
  XLSX.writeFile(wb, `سجل_عملاء_رفيق_${getFormattedTimestamp()}.xlsx`);
}


/**
 * تصدير كامل أصناف النظام إلى ملف إكسل احترافي ملون ومفصل مع هوامش الربح
 */
export async function exportProductsToExcel(): Promise<{ success: boolean; count?: number; message?: string }> {
  try {
    const res = await invoke<{ success: boolean; base64?: string; fileName?: string; count?: number }>(
      'excel:exportProducts',
      undefined,
      120000
    );
    if (res && res.base64) {
      downloadBase64File(
        res.base64,
        res.fileName || 'كتالوج_أصناف_رفيق.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return { success: true, count: res.count };
    }
  } catch (err: unknown) {
    console.warn('Native excel export failed, attempting client-side fallback:', err);
  }

  // Client-side SheetJS fallback
  try {
    const products = await invoke<Product[]>('products:getAll', { limit: 50000 });
    const categories = await invoke<Category[]>('categories:getAll', { includeInactive: true });
    const catMap = new Map<string, string>();
    if (Array.isArray(categories)) {
      categories.forEach((c) => catMap.set(c.id, c.name));
    }

    if (Array.isArray(products) && products.length > 0) {
      await exportProductsViaSheetJs(products, catMap);
      return { success: true, count: products.length };
    }
  } catch (fallbackErr: unknown) {
    const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    return { success: false, message: msg };
  }

  return { success: false, message: 'تعذر توليد ملف الإكسل' };
}

/**
 * تصدير كشف حسابات وأرصدة العملاء والديون إلى ملف إكسل
 */
export async function exportCustomersToExcel(): Promise<{ success: boolean; count?: number; message?: string }> {
  try {
    const res = await invoke<{ success: boolean; base64?: string; fileName?: string; count?: number }>(
      'excel:exportCustomers',
      undefined,
      120000
    );
    if (res && res.base64) {
      downloadBase64File(
        res.base64,
        res.fileName || 'سجل_عملاء_رفيق.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return { success: true, count: res.count };
    }
  } catch (err: unknown) {
    console.warn('Native customer excel export failed, attempting fallback:', err);
  }

  // Client-side SheetJS fallback
  try {
    const customers = await invoke<any[]>('customers:getAll');
    if (Array.isArray(customers) && customers.length > 0) {
      await exportCustomersViaSheetJs(customers);
      return { success: true, count: customers.length };
    }
  } catch (fallbackErr: unknown) {
    const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    return { success: false, message: msg };
  }

  return { success: false, message: 'تعذر تصدير بيانات العملاء' };
}


/**
 * تصدير تقرير بالأصناف المرفوضة التي تحتوي على أخطاء لإصلاحها
 */
export async function downloadErrorReport(errorRows: ValidatedImportRow[]): Promise<void> {
  if (errorRows.length === 0) return;
  const XLSX = await getXlsx();

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
  const XLSX = await getXlsx();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, raw: false });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('الملف فارغ ولا يحتوي على أي أوراق عمل');
  }

  const resultRows: RawImportRow[] = [];
  const seenKeys = new Set<string>();
  let globalRowCounter = 1;

  // أسماء الشيتات الاسترشادية والملخصات التي يتم تخطيها تلقائياً إذا كانت لا تحوي أصنافاً
  const isIgnoredSheetName = (sheetName: string): boolean => {
    const s = sheetName.trim();
    return s.startsWith('ملخص') || s.startsWith('لوحة') || s.includes('دليل') || s.includes('تعليمات') || s.includes('تقرير_الأخطاء') || s.toLowerCase() === 'readme';
  };

  // الشيتات الجامعة التي لا يمثل اسمها قسماً مستقلاً
  const isGenericMasterSheet = (sheetName: string): boolean => {
    const s = sheetName.trim();
    return s === 'كافة_الأصناف' || s === 'كل الأصناف' || s === 'كتالوج_الأصناف' || s === 'المنتجات_والمخزون' || s === 'Sheet1' || s === 'Sheet' || s === 'قالب_الأصناف_المعتمد' || s === 'قالب المنتجات';
  };

  for (const sheetName of workbook.SheetNames) {
    if (isIgnoredSheetName(sheetName)) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const sheetRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', blankrows: false });
    if (!sheetRows || sheetRows.length < 2) continue;

    // البحث عن صف العناوين في أول 10 صفوف
    let headerRowIndex = -1;
    const columnMapping: Record<string, number> = {};

    for (let r = 0; r < Math.min(sheetRows.length, 10); r++) {
      const candidateRow = sheetRows[r] as string[];
      if (!candidateRow || !Array.isArray(candidateRow)) continue;

      for (let c = 0; c < candidateRow.length; c++) {
        const cell = candidateRow[c];
        if (cell && matchHeader(cell) === 'name') {
          headerRowIndex = r;
          break;
        }
      }

      if (headerRowIndex !== -1) {
        candidateRow.forEach((cell, colIndex) => {
          if (cell) {
            const matchedKey = matchHeader(cell);
            if (matchedKey && !(matchedKey in columnMapping)) {
              columnMapping[matchedKey] = colIndex;
            }
          }
        });
        break;
      }
    }

    // إذا لم تحتوي ورقة العمل على عمود "اسم الصنف"، نتخطاها بأمان
    if (headerRowIndex === -1 || !('name' in columnMapping)) {
      continue;
    }

    // تحديد القسم الافتراضي من اسم الشيت إن لم يحدد داخل الصف
    const defaultSheetCategory = isGenericMasterSheet(sheetName) ? '' : sheetName.trim();

    for (let i = headerRowIndex + 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      if (!row || row.length === 0) continue;

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
      // تخطي الصفوف الفارغة أو صفوف الإجماليات والمعادلات الملخصة
      if (!rawName || rawName.includes('الإجمالي') || rawName.includes('المجموع') || rawName.startsWith('إجمالي')) {
        continue;
      }

      const rawBarcode = getCellString('barcode');
      const rawAdditionalCodes = getCellString('additionalBarcodes');
      const rowCategory = getCellString('category');
      // اسم التابة يمثل القسم تلقائياً لكافة الأصناف بداخلها
      const categoryName = (defaultSheetCategory || rowCategory || 'عام').trim();
      const rawUnit = getCellString('unit').toLowerCase();
      const isKg = rawUnit === 'كجم' || rawUnit === 'كيلو' || rawUnit === 'وزن' || rawUnit === 'kg' || rawUnit === 'gram' || rawUnit === 'جم';
      const rawColor = getCellString('color');
      const rawSize = getCellString('size');

      const pricePounds = getCellNumber('price', 0);
      const costPounds = getCellNumber('cost', 0);
      const stockQuantity = getCellNumber('stock', 0);
      const minStockQuantity = getCellNumber('minStock', 5);
      const taxRatePercent = Math.round(getCellNumber('tax', 0));
      const internalCode = getCellString('internalCode');
      const taxCategoryCode = getCellString('taxCode');

      const normBarcode = cleanExcelBarcode(rawBarcode);
      const normSku = internalCode.trim().toLowerCase();
      const normName = normalizeArabicText(rawName).trim().toLowerCase();
      const normColor = (rawColor || '').trim().toLowerCase();
      const normSize = (rawSize || '').trim().toLowerCase();

      // منع التكرار بين الشيت المجمع وشيتات الأقسام
      const dedupKey = normBarcode
        ? `bc:${normBarcode}`
        : (normSku ? `sku:${normSku}` : `name:${normName}_${normColor}_${normSize}`);

      if (seenKeys.has(dedupKey)) {
        continue;
      }
      seenKeys.add(dedupKey);

      const additionalCodes = rawAdditionalCodes
        ? rawAdditionalCodes.split(/[,;\n]/).map((c) => cleanExcelBarcode(c)).filter(Boolean)
        : [];

      resultRows.push({
        rowIndex: globalRowCounter++,
        name: rawName,
        barcode: normBarcode,
        additionalBarcodes: additionalCodes,
        categoryName,
        unit: isKg ? 'kg' : 'piece',
        variantColor: rawColor || undefined,
        variantSize: rawSize || undefined,
        pricePounds,
        costPounds,
        stockQuantity,
        minStockQuantity,
        taxRatePercent,
        internalCode,
        taxCategoryCode,
      });
    }
  }

  if (resultRows.length === 0) {
    throw new Error('لم يتم العثور على أي صفوف أصناف صالحة في ملف الإكسل. يرجى التأكد من احتواء الملف على أعمدة الأصناف المعتمدة.');
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
  const dbNameVariantOwners = new Map<string, string>();

  for (const prod of existingProducts) {
    if (prod.barcode) {
      dbBarcodeOwners.set(prod.barcode.toLowerCase(), prod.name);
    }
    if (prod.barcodes) {
      for (const b of prod.barcodes) {
        if (b) dbBarcodeOwners.set(b.toLowerCase(), prod.name);
      }
    }
    const nvKey = `${normalizeArabicText(prod.name)}||${normalizeArabicText(prod.variantColor || '')}||${normalizeArabicText(prod.variantSize || '')}`;
    if (!dbNameVariantOwners.has(nvKey)) {
      dbNameVariantOwners.set(nvKey, prod.name);
    }
  }

  // Build category lookup with Arabic text normalization
  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    categoryMap.set(normalizeArabicText(cat.name), cat.id);
  }

  // Track in-file barcodes and name+variant combinations to catch intra-file duplicates
  const seenFileBarcodes = new Map<string, number>();
  const seenFileNameVariants = new Map<string, number>();

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

    const cleanColor = row.variantColor?.trim() || '';
    const cleanSize = row.variantSize?.trim() || '';
    const normName = normalizeArabicText(row.name);
    const nameVariantKey = `${normName}||${normalizeArabicText(cleanColor)}||${normalizeArabicText(cleanSize)}`;

    // 4. Validate Barcodes & Intra-file / DB Collision
    const allRowBarcodes = [
      ...(row.barcode ? [row.barcode] : []),
      ...row.additionalBarcodes
    ];

    if (allRowBarcodes.length > 0) {
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
    } else {
      // Barcode is absent: check duplicate name + variant
      if (seenFileNameVariants.has(nameVariantKey)) {
        const prevRow = seenFileNameVariants.get(nameVariantKey);
        const variantDesc = cleanColor || cleanSize ? ` (${cleanColor} / ${cleanSize})` : '';
        errors.push(`الصنف "${row.name}"${variantDesc} مكرر داخل هذا الملف في الصف رقم ${prevRow}`);
      } else {
        seenFileNameVariants.set(nameVariantKey, row.rowIndex);
      }

      if (dbNameVariantOwners.has(nameVariantKey)) {
        const variantDesc = cleanColor || cleanSize ? ` (${cleanColor} / ${cleanSize})` : '';
        warnings.push(`الصنف "${row.name}"${variantDesc} مسجل مسبقاً في النظام`);
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
        variantColor: cleanColor || undefined,
        variantSize: cleanSize || undefined,
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
