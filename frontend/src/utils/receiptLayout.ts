// Shared receipt layout: pure helpers that build the content of the supermarket sale receipt.
// This is the TypeScript twin of PrinterService.cs (ComputeReceiptTotals, BuildSaleReceiptLines, RenderReceiptPage):
// same sections, same order, same labels, so the preview shows what the thermal printer prints.
// Money is integer piasters end to end: no float math, only display strings are built here.

export const RECEIPT_CURRENCY = 'ج.م';
export const DEFAULT_RECEIPT_THANKS = 'شكراً لزيارتكم';
export const DEFAULT_DEVELOPER_SIGNATURE = 'نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965';
export const LEGACY_DEVELOPER_SIGNATURE = 'نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد';
export const LEGACY_RECEIPT_FOOTERS: readonly string[] = [
  'شكراً لتعاملكم معنا! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.',
  'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل وفقاً لسياسة المتجر.',
];
export const GENERAL_CASH_CUSTOMER_ID = 'cust_general_cash';
export const PRE_BILL_SALE_ID = 'PRE-BILL';
export const COLD_CHAIN_NOTICE = 'تنبيه: يحفظ في الثلاجة 2-8 مئوية';

export interface ReceiptItemInput {
  productName?: string | null;
  quantityMilli: number;
  unitPricePiasters: number;
  discountPiasters?: number | null;
  unit?: string | null;
  unitName?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  isColdChain?: boolean | null;
  notes?: string | null;
  modifiers?: ReadonlyArray<{ optionName?: string | null; extraPricePiasters?: number | null }> | null;
}

export interface ReceiptPaymentInput {
  method?: string | null;
  amountPiasters: number;
}

export interface ReceiptSaleInput {
  id?: string | null;
  invoiceNumber?: number | null;
  createdAt?: string | null;
  cashierName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  subtotalPiasters?: number | null;
  discountPiasters?: number | null;
  taxPiasters?: number | null;
  totalPiasters: number;
  paidPiasters?: number | null;
  changePiasters?: number | null;
  serviceFeePiasters?: number | null;
  serviceChargePiasters?: number | null;
  deliveryFeePiasters?: number | null;
  paymentMethod?: string | null;
  status?: string | null;
  notes?: string | null;
  orderType?: string | null;
  orderCallNumber?: number | null;
  tableName?: string | null;
  guestsCount?: number | null;
  waiterName?: string | null;
  hasColdChainItems?: boolean | null;
  items?: ReadonlyArray<ReceiptItemInput> | null;
  payments?: ReadonlyArray<ReceiptPaymentInput> | null;
  deliveryInfo?: {
    customerName?: string | null;
    customerPhone?: string | null;
    deliveryAddress?: string | null;
    landmark?: string | null;
    notes?: string | null;
  } | null;
}

export interface ReceiptStoreInput {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  header?: string | null;
  footer?: string | null;
  signature?: string | null;
}

export interface ReceiptLineModel {
  name: string;
  qty: string;
  price: string;
  total: string;
  discount: string;
  details: string[];
}

export interface ReceiptRow {
  label: string;
  value: string;
  emphasis: boolean;
}

export interface ReceiptPaymentLine {
  label: string;
  amount: number;
}

export interface ReceiptTotals {
  itemCount: number;
  pieceCount: number;
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
  tax: number;
  epayFee: number;
  payable: number;
  paid: number;
  change: number;
  deposited: number;
  remaining: number;
  payments: ReceiptPaymentLine[];
}

export interface ReceiptModel {
  storeName: string;
  address: string;
  phone: string;
  taxNumber: string;
  headerText: string;
  invoiceLabel: string;
  dateTime: string;
  cashier: string;
  orderMeta: string;
  customer: string;
  badges: string[];
  lines: ReceiptLineModel[];
  itemsCountText: string;
  piecesCountText: string;
  adjustmentRows: ReceiptRow[];
  grandTotal: string;
  taxText: string;
  epayFeeText: string;
  payableText: string;
  isPreBill: boolean;
  paymentRows: ReceiptRow[];
  deliveryTitle: string;
  deliveryLines: string[];
  coldChainNotice: string;
  notes: string;
  footer: string;
  signature: string;
  totals: ReceiptTotals;
}

// ---------------------------------------------------------------------------
// Formatting (integer math only)
// ---------------------------------------------------------------------------

function toInt(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function groupThousands(digits: string): string {
  if (digits.length <= 3) return digits;
  const first = digits.length % 3;
  const parts: string[] = [];
  if (first > 0) parts.push(digits.slice(0, first));
  for (let i = first; i < digits.length; i += 3) parts.push(digits.slice(i, i + 3));
  return parts.join(',');
}

/** 123456789 piasters => "1,234,567.89" (Latin digits, independent of the browser locale). */
export function formatReceiptMoney(piasters: number | null | undefined): string {
  const value = toInt(piasters);
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${value < 0 ? '-' : ''}${groupThousands(String(whole))}.${frac < 10 ? '0' : ''}${frac}`;
}

/** Quantity in milli-units: whole pieces without decimals, weights with three (1.250). */
export function formatReceiptQuantity(quantityMilli: number | null | undefined, forceDecimals = false): string {
  const value = toInt(quantityMilli);
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 1000);
  const frac = abs % 1000;
  let text = groupThousands(String(whole));
  if (frac !== 0 || forceDecimals) text += `.${String(frac).padStart(3, '0')}`;
  return value < 0 ? `-${text}` : text;
}

/** Mirror of PrinterService.FormatReceiptUnit. */
export function receiptUnitLabel(
  unitName: string | null | undefined,
  unit: string | null | undefined,
  quantityMilli: number
): string {
  const named = typeof unitName === 'string' && unitName.trim() !== '';
  const raw = (named ? (unitName as string) : unit ?? '').trim().toLowerCase();
  if (['piece', 'pc', 'pcs', 'item', 'unit', 'قطعة'].includes(raw)) return 'ق';
  if (['kg', 'kilo', 'kilogram'].includes(raw)) return 'كجم';
  if (['g', 'gm', 'gram'].includes(raw)) return 'جم';
  if (['l', 'liter', 'litre'].includes(raw)) return 'لتر';
  if (['m', 'meter'].includes(raw)) return 'متر';
  if (['box', 'carton'].includes(raw)) return 'علبة';
  if (raw === 'strip') return 'شريط';
  if (raw === 'bottle') return 'زجاجة';
  if (raw === 'capsule') return 'كبسولة';
  if (raw === 'tablet') return 'قرص';
  if (raw === 'sachet') return 'كيس';
  if (raw === 'ampoule') return 'أمبول';
  if (raw === 'vial') return 'فيال';
  if (named) return unitName as string;
  return (unit ?? '').toLowerCase() === 'kg' || toInt(quantityMilli) % 1000 !== 0 ? 'كجم' : 'ق';
}

export function formatReceiptQuantityWithUnit(
  quantityMilli: number,
  unitName: string | null | undefined,
  unit: string | null | undefined
): string {
  const label = receiptUnitLabel(unitName, unit, quantityMilli);
  return `${formatReceiptQuantity(quantityMilli, label === 'كجم')} ${label}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** yyyy/MM/dd HH:mm in local time (the same format the printer uses). */
export function formatReceiptDateTime(createdAt?: string | null, now: Date = new Date()): string {
  let date = createdAt ? new Date(createdAt) : now;
  if (Number.isNaN(date.getTime())) date = now;
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function receiptPaymentLabel(method: string | null | undefined): string {
  const m = (method ?? '').trim().toLowerCase();
  if (m === 'cash') return 'نقدي';
  if (m === 'card') return 'بطاقة';
  if (m === 'instapay') return 'إنستاباي';
  if (m === 'vodafone_cash' || m === 'wallet') return 'محفظة إلكترونية';
  if (m === 'insurance') return 'شركة التأمين';
  return 'المدفوع';
}

/** unit price x quantity, rounded half away from zero exactly like Money.MultiplyByMilliUnits. */
export function receiptLineGross(unitPricePiasters: number, quantityMilli: number): number {
  const product = toInt(unitPricePiasters) * toInt(quantityMilli);
  const sign = product < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(product) + 500) / 1000);
}

function isMeasureUnitLabel(label: string): boolean {
  return label === 'كجم' || label === 'جم' || label === 'لتر' || label === 'متر';
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

// ---------------------------------------------------------------------------
// Totals (straight from the stored sale, never recomputed)
// ---------------------------------------------------------------------------

export function computeReceiptTotals(sale: ReceiptSaleInput): ReceiptTotals {
  const t: ReceiptTotals = {
    itemCount: 0,
    pieceCount: 0,
    subtotal: 0,
    discountTotal: 0,
    serviceCharge: 0,
    deliveryFee: 0,
    total: 0,
    tax: 0,
    epayFee: 0,
    payable: 0,
    paid: 0,
    change: 0,
    deposited: 0,
    remaining: 0,
    payments: [],
  };

  let lineDiscounts = 0;
  let grossSum = 0;
  for (const item of sale.items ?? []) {
    if (!item) continue;
    t.itemCount += 1;
    lineDiscounts += Math.max(0, toInt(item.discountPiasters));
    grossSum += receiptLineGross(item.unitPricePiasters, item.quantityMilli);
    const label = receiptUnitLabel(item.unitName, item.unit, item.quantityMilli);
    const qty = toInt(item.quantityMilli);
    if (qty > 0 && qty % 1000 === 0 && !isMeasureUnitLabel(label)) t.pieceCount += qty / 1000;
  }

  t.subtotal = toInt(sale.subtotalPiasters) > 0 ? toInt(sale.subtotalPiasters) : grossSum;
  t.discountTotal = Math.max(0, toInt(sale.discountPiasters)) + lineDiscounts;
  t.serviceCharge = Math.max(0, toInt(sale.serviceChargePiasters));
  t.deliveryFee = Math.max(0, toInt(sale.deliveryFeePiasters));
  t.total = toInt(sale.totalPiasters);
  t.tax = Math.max(0, toInt(sale.taxPiasters));
  t.epayFee = Math.max(0, toInt(sale.serviceFeePiasters));
  t.payable = t.total + t.epayFee;

  let nonCredit = 0;
  let credit = 0;
  for (const p of sale.payments ?? []) {
    const amount = toInt(p?.amountPiasters);
    if (!p || amount <= 0) continue;
    if ((p.method ?? '').toLowerCase() === 'credit') {
      credit += amount;
    } else {
      nonCredit += amount;
      t.payments.push({ label: receiptPaymentLabel(p.method), amount });
    }
  }

  if (nonCredit === 0 && credit === 0) {
    let paid = toInt(sale.paidPiasters);
    if ((sale.paymentMethod ?? '').toLowerCase() === 'credit') {
      if (paid > 0) {
        nonCredit = paid;
        t.payments.push({ label: receiptPaymentLabel(null), amount: paid });
      }
    } else {
      if (paid <= 0) paid = t.total;
      nonCredit = paid;
      if (paid > 0) t.payments.push({ label: receiptPaymentLabel(sale.paymentMethod), amount: paid });
    }
  }

  t.paid = nonCredit;
  if (credit === 0 && t.paid < t.payable) credit = t.payable - t.paid;
  t.remaining = credit;

  const excess = t.paid - t.payable;
  if (excess > 0) {
    const customerId = clean(sale.customerId);
    const registered = customerId !== '' && customerId.toLowerCase() !== GENERAL_CASH_CUSTOMER_ID;
    const handedBack = Math.max(0, toInt(sale.changePiasters));
    if (registered) {
      t.change = Math.min(handedBack, excess);
      t.deposited = excess - t.change;
    } else {
      t.change = handedBack > 0 ? Math.min(handedBack, excess) : excess;
    }
  }

  return t;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function buildReceiptLines(sale: ReceiptSaleInput): ReceiptLineModel[] {
  const lines: ReceiptLineModel[] = [];
  for (const item of sale.items ?? []) {
    if (!item) continue;
    const details: string[] = [];
    if (clean(item.batchNumber) || clean(item.expiryDate)) {
      let batch = `تشغيلة: ${clean(item.batchNumber) || '---'}`;
      if (clean(item.expiryDate)) batch += ` | انتهاء: ${clean(item.expiryDate)}`;
      details.push(batch);
    }
    for (const mod of item.modifiers ?? []) {
      if (!mod || !clean(mod.optionName)) continue;
      let text = `+ ${clean(mod.optionName)}`;
      if (toInt(mod.extraPricePiasters) > 0) text += ` (+${formatReceiptMoney(mod.extraPricePiasters)})`;
      details.push(text);
    }
    if (clean(item.notes)) details.push(`ملاحظة: ${clean(item.notes)}`);

    lines.push({
      name: clean(item.productName) || 'صنف',
      qty: formatReceiptQuantityWithUnit(item.quantityMilli, item.unitName, item.unit),
      price: formatReceiptMoney(item.unitPricePiasters),
      total: formatReceiptMoney(receiptLineGross(item.unitPricePiasters, item.quantityMilli)),
      discount: toInt(item.discountPiasters) > 0 ? formatReceiptMoney(item.discountPiasters) : '',
      details,
    });
  }
  return lines;
}

export function buildOrderMetaText(sale: ReceiptSaleInput): string {
  const orderType = clean(sale.orderType).toLowerCase();
  const table = clean(sale.tableName);
  const waiter = clean(sale.waiterName);
  const hasCall = toInt(sale.orderCallNumber) > 0;
  if (!table && !hasCall && !waiter && orderType !== 'dine_in' && orderType !== 'delivery') return '';

  const parts: string[] = [];
  if (hasCall) parts.push(`نداء ${toInt(sale.orderCallNumber)}`);
  if (orderType === 'delivery') parts.push('توصيل');
  else if (table || orderType === 'dine_in') parts.push(table ? `طاولة ${table}` : 'صالة');
  if (waiter) parts.push(`الكابتن: ${waiter}`);
  if (table && toInt(sale.guestsCount) > 1) parts.push(`ضيوف: ${toInt(sale.guestsCount)}`);
  return parts.join(' - ');
}

function buildPaymentRows(t: ReceiptTotals): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const single = t.payments.length === 1;
  for (const p of t.payments) {
    const label = single && p.label !== 'المدفوع' ? `المدفوع (${p.label})` : p.label;
    rows.push({ label, value: formatReceiptMoney(p.amount), emphasis: false });
  }
  if (t.payments.length > 1) rows.push({ label: 'إجمالي المدفوع', value: formatReceiptMoney(t.paid), emphasis: true });
  if (t.change > 0) rows.push({ label: 'الباقي للعميل', value: formatReceiptMoney(t.change), emphasis: true });
  if (t.deposited > 0) rows.push({ label: 'مودع في حساب العميل', value: formatReceiptMoney(t.deposited), emphasis: false });
  if (t.remaining > 0) rows.push({ label: 'المتبقي (آجل على الحساب)', value: formatReceiptMoney(t.remaining), emphasis: true });
  return rows;
}

export function resolveReceiptFooter(footer: string | null | undefined): string {
  const text = clean(footer);
  if (text === '' || LEGACY_RECEIPT_FOOTERS.includes(text)) return DEFAULT_RECEIPT_THANKS;
  return text;
}

export function resolveReceiptSignature(signature: string | null | undefined): string {
  const text = clean(signature);
  if (text === '' || text === LEGACY_DEVELOPER_SIGNATURE) return DEFAULT_DEVELOPER_SIGNATURE;
  return text;
}

export interface BuildReceiptOptions {
  isCopy?: boolean;
  now?: Date;
}

export function buildReceiptModel(
  sale: ReceiptSaleInput,
  store: ReceiptStoreInput,
  options: BuildReceiptOptions = {}
): ReceiptModel {
  const t = computeReceiptTotals(sale);
  const isPreBill = sale.id === PRE_BILL_SALE_ID;
  const orderType = clean(sale.orderType).toLowerCase();
  const isDelivery = orderType === 'delivery';
  const invoiceNumber = toInt(sale.invoiceNumber);
  const status = clean(sale.status);

  const badges: string[] = [];
  if (options.isCopy) badges.push('نسخة - إعادة طباعة');
  if (isPreBill) badges.push('غير مدفوع - للمراجعة فقط');
  if (status.toUpperCase() === 'TEST_PILOT') badges.push('فاتورة تجريبية - تدريب');
  if (status.toLowerCase() === 'cancelled') badges.push('فاتورة ملغاة');

  let customer = '';
  if (!isDelivery && clean(sale.customerName) && clean(sale.customerId).toLowerCase() !== GENERAL_CASH_CUSTOMER_ID) {
    customer = `العميل: ${clean(sale.customerName)}`;
    if (clean(sale.customerPhone)) customer += ` (${clean(sale.customerPhone)})`;
  }

  const adjustmentRows: ReceiptRow[] = [];
  if (t.discountTotal > 0 || t.serviceCharge > 0 || t.deliveryFee > 0) {
    adjustmentRows.push({ label: 'الإجمالي قبل الخصم', value: formatReceiptMoney(t.subtotal), emphasis: false });
  }
  if (t.discountTotal > 0) adjustmentRows.push({ label: 'الخصم', value: `-${formatReceiptMoney(t.discountTotal)}`, emphasis: false });
  if (t.serviceCharge > 0) adjustmentRows.push({ label: 'خدمة الصالة', value: formatReceiptMoney(t.serviceCharge), emphasis: false });
  if (t.deliveryFee > 0) adjustmentRows.push({ label: 'رسوم التوصيل', value: formatReceiptMoney(t.deliveryFee), emphasis: false });

  let deliveryTitle = '';
  const deliveryLines: string[] = [];
  if (isDelivery) {
    const info = sale.deliveryInfo;
    const dCust = clean(info?.customerName) || clean(sale.customerName) || 'عميل دليفري';
    const dPhone = clean(info?.customerPhone) || clean(sale.customerPhone);
    deliveryTitle = `توصيل - العميل: ${dCust}${dPhone ? ` (${dPhone})` : ''}`;
    if (clean(info?.deliveryAddress)) deliveryLines.push(`العنوان: ${clean(info?.deliveryAddress)}`);
    if (clean(info?.landmark)) deliveryLines.push(`علامة مميزة: ${clean(info?.landmark)}`);
    if (clean(info?.notes)) deliveryLines.push(`ملاحظات: ${clean(info?.notes)}`);
  }

  const hasColdChain = !!sale.hasColdChainItems || (sale.items ?? []).some((item) => !!item?.isColdChain);

  return {
    storeName: clean(store.name) || 'متجر رفيق',
    address: clean(store.address),
    phone: clean(store.phone),
    taxNumber: clean(store.taxNumber),
    headerText: clean(store.header),
    invoiceLabel: isPreBill ? 'حساب مبدئي' : invoiceNumber > 0 ? `فاتورة رقم: ${invoiceNumber}` : 'فاتورة',
    dateTime: formatReceiptDateTime(sale.createdAt, options.now),
    cashier: clean(sale.cashierName) ? `الكاشير: ${clean(sale.cashierName)}` : '',
    orderMeta: buildOrderMetaText(sale),
    customer,
    badges,
    lines: buildReceiptLines(sale),
    itemsCountText: `عدد الأصناف: ${t.itemCount}`,
    piecesCountText: t.pieceCount > 0 && t.pieceCount !== t.itemCount ? `عدد القطع: ${t.pieceCount}` : '',
    adjustmentRows,
    grandTotal: formatReceiptMoney(t.total),
    taxText: t.tax > 0 ? formatReceiptMoney(t.tax) : '',
    epayFeeText: t.epayFee > 0 ? formatReceiptMoney(t.epayFee) : '',
    payableText: t.epayFee > 0 ? formatReceiptMoney(t.payable) : '',
    isPreBill,
    paymentRows: !isPreBill && (t.payments.length > 0 || t.remaining > 0) ? buildPaymentRows(t) : [],
    deliveryTitle,
    deliveryLines,
    coldChainNotice: hasColdChain ? COLD_CHAIN_NOTICE : '',
    notes: !isPreBill ? clean(sale.notes) : '',
    footer: resolveReceiptFooter(store.footer),
    signature: resolveReceiptSignature(store.signature),
    totals: t,
  };
}

// ---------------------------------------------------------------------------
// Table layout (preview): decide per line whether the name fits next to the numbers
// ---------------------------------------------------------------------------

export type ReceiptPaperWidth = '57mm' | '80mm';

// Characters per printed line at 203 dpi (same figures as the printer settings screen), minus a safety margin
// because the preview measures columns in "ch" units of a different font than the thermal printer.
export const RECEIPT_CHARS_PER_LINE: Record<ReceiptPaperWidth, number> = { '57mm': 32, '80mm': 46 };

export interface ReceiptTableLayout {
  /** false when qty | price | total cannot share one row: each line then shows "qty x price" and the total apart */
  columns: boolean;
  /** per line: true when the short name shares the row with the numbers (saves paper), false when it takes its own line */
  inline: boolean[];
  /** column widths in characters (so every row of the numbers block lines up) */
  qtyChars: number;
  priceChars: number;
  totalChars: number;
}

export function layoutReceiptTable(lines: ReadonlyArray<ReceiptLineModel>, paper: ReceiptPaperWidth): ReceiptTableLayout {
  const capacity = RECEIPT_CHARS_PER_LINE[paper];
  let qtyChars = 'الكمية'.length;
  let priceChars = 'السعر'.length;
  let totalChars = 'الإجمالي'.length;
  for (const line of lines) {
    qtyChars = Math.max(qtyChars, line.qty.length);
    priceChars = Math.max(priceChars, line.price.length);
    totalChars = Math.max(totalChars, line.total.length);
  }
  const cluster = qtyChars + priceChars + totalChars + 4;
  const columns = cluster <= capacity;
  // Arabic bold names are wider than the digits around them: 15% safety factor
  const inline = lines.map((line) => columns && Math.ceil(line.name.length * 1.15) + cluster + 2 <= capacity);
  return { columns, inline, qtyChars, priceChars, totalChars };
}

// ---------------------------------------------------------------------------
// Sample basket for the store-profile preview (a realistic sale: weight line, line + invoice discount, VAT, change)
// ---------------------------------------------------------------------------

export function buildSampleReceiptSale(): ReceiptSaleInput {
  return {
    id: 'sample',
    invoiceNumber: 1042,
    cashierName: 'أحمد',
    subtotalPiasters: 30500,
    discountPiasters: 300,
    taxPiasters: 3684,
    totalPiasters: 30000,
    paidPiasters: 35000,
    changePiasters: 5000,
    paymentMethod: 'cash',
    items: [
      { productName: 'جبنة عبور لاند 500 جم', quantityMilli: 1000, unitPricePiasters: 3800, unit: 'piece' },
      { productName: 'شاي العروسة 100 جم', quantityMilli: 2000, unitPricePiasters: 1500, unit: 'piece' },
      { productName: 'لحم مفروم بالوزن', quantityMilli: 750, unitPricePiasters: 28000, unit: 'kg' },
      { productName: 'سكر حر 1 كجم', quantityMilli: 1000, unitPricePiasters: 2700, discountPiasters: 200, unit: 'piece' },
    ],
    payments: [{ method: 'cash', amountPiasters: 35000 }],
  };
}
