import React, { useState, useEffect, useMemo, type RefObject } from 'react';
import {
  RotateCcw,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  FileSpreadsheet,
  BookOpen,
  Printer,
  Save,
  CheckCircle,
  ZoomIn,
  ZoomOut,
  FileText
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { AppButton } from '../../components/AppButton';
import { ToggleRow, SettingsCard, ReceiptTextField } from './settingsParts';
import { UnsavedChangesChip } from '../../components/UnsavedChangesChip';
import { formatArabicCurrency, tafqeetCurrency } from '../../utils/money';
import { encodeInvoiceBarcode, layoutReceiptBarcode, RECEIPT_DPI } from '../../utils/receiptLayout';
import { rafiqAlert } from '../../utils/dialogService';
import { useMotionPanel } from '../../hooks/useMotionPanel';
import { usePrintReport } from '../../hooks/usePrintReport';

export type TemplateDocType =
  | 'return'
  | 'purchase'
  | 'receipt_voucher'
  | 'payment_voucher'
  | 'daily_closing'
  | 'quotation'
  | 'statement';

export interface InvoiceTemplatesTabProps {
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
  taxNumber?: string;
  storeLogoUrl?: string;
  saveBarRef?: RefObject<HTMLDivElement | null>;
  onOpenPrinterSettings?: () => void;
}

interface TemplateConfig {
  showLogo: boolean;
  showHeader: boolean;
  showTaxNumber: boolean;
  showCashier: boolean;
  showBarcode: boolean;
  showSignatures: boolean;
  showBreakdown: boolean;
  showTafqeet: boolean;
  paperWidth: '80mm' | '57mm' | 'a4';
  sampleMode: 'standard' | 'detailed';
  customHeader: string;
  customFooter: string;
  customNotes: string;
  validityDays: string;
}

const DEFAULT_CONFIGS: Record<TemplateDocType, TemplateConfig> = {
  return: {
    showLogo: true,
    showHeader: true,
    showTaxNumber: true,
    showCashier: true,
    showBarcode: true,
    showSignatures: false,
    showBreakdown: true,
    showTafqeet: false,
    paperWidth: '80mm',
    sampleMode: 'standard',
    customHeader: 'إشعار دائن ضريبي - مرتجع مبيعات معتمد',
    customFooter: 'الاستبدال والاسترجاع خلال 14 يوماً من تاريخ الشراء بموجب أصل الفاتورة وبحالتها الأصلية وفقاً لقانون حماية المستهلك.',
    customNotes: 'سبب المرتجع: رغبة العميل (الصنف بحالته الأصلية)',
    validityDays: '14',
  },
  purchase: {
    showLogo: true,
    showHeader: true,
    showTaxNumber: true,
    showCashier: true,
    showBarcode: true,
    showSignatures: true,
    showBreakdown: true,
    showTafqeet: true,
    paperWidth: 'a4',
    sampleMode: 'detailed',
    customHeader: 'فاتورة استلام وتوريد بضاعة - مشتريات مخزن',
    customFooter: 'البضاعة الموضحة أعلاه تم فحصها ومطابقتها لأمر الشراء واستلامها سليمة بحالة جيدة.',
    customNotes: 'تم الاستلام بمستودع الفرع الرئيسي - إذن إضافة رقم 042',
    validityDays: '30',
  },
  receipt_voucher: {
    showLogo: true,
    showHeader: true,
    showTaxNumber: true,
    showCashier: true,
    showBarcode: true,
    showSignatures: true,
    showBreakdown: true,
    showTafqeet: true,
    paperWidth: '80mm',
    sampleMode: 'standard',
    customHeader: 'إيصال استلام نقدية - سند قبض رسمي',
    customFooter: 'يعتبر هذا السند لاغياً إذا لم يكن ممهوراً بتوقيع الصراف وختم المحل الرسمي.',
    customNotes: 'سداد دفعة نقدية تحت الحساب لتسوية الرصيد الآجل',
    validityDays: '0',
  },
  payment_voucher: {
    showLogo: true,
    showHeader: true,
    showTaxNumber: true,
    showCashier: true,
    showBarcode: true,
    showSignatures: true,
    showBreakdown: true,
    showTafqeet: true,
    paperWidth: '80mm',
    sampleMode: 'standard',
    customHeader: 'إذن صرف نقدية - سند صرف معتمد',
    customFooter: 'تم الصرف بعد استيفاء الموافقات الإدارية والمستندات المؤيدة للصرف.',
    customNotes: 'صرف مستحقات فاتورة توريد رقم 5580',
    validityDays: '0',
  },
  daily_closing: {
    showLogo: true,
    showHeader: true,
    showTaxNumber: true,
    showCashier: true,
    showBarcode: false,
    showSignatures: true,
    showBreakdown: true,
    showTafqeet: false,
    paperWidth: '80mm',
    sampleMode: 'detailed',
    customHeader: 'تقرير تقفيل اليومية والوردية - زد ريبورت',
    customFooter: 'تقرير نهائي صادر من النظام المحاسبي الآلي بعد مراجعة النقدية والدرج.',
    customNotes: 'مطابقة تامة بين النقدية الفعلية والنقدية المتوقعة بالدرج',
    validityDays: '0',
  },
  quotation: {
    showLogo: true,
    showHeader: true,
    showTaxNumber: true,
    showCashier: true,
    showBarcode: true,
    showSignatures: true,
    showBreakdown: true,
    showTafqeet: true,
    paperWidth: 'a4',
    sampleMode: 'detailed',
    customHeader: 'عرض أسعار رسمي - Price Quotation',
    customFooter: 'الأسعار سارية لمدة 15 يوماً من تاريخ العرض وتخضع لتوفر الكميات. طريقة السداد: 50% مقدم و50% عند الاستلام.',
    customNotes: 'يشمل السعر التوصيل والتركيب وضمان شامل لمدة عام',
    validityDays: '15',
  },
  statement: {
    showLogo: true,
    showHeader: true,
    showTaxNumber: true,
    showCashier: false,
    showBarcode: false,
    showSignatures: true,
    showBreakdown: true,
    showTafqeet: false,
    paperWidth: 'a4',
    sampleMode: 'detailed',
    customHeader: 'كشف حساب مالي تفصيلي - Statement of Account',
    customFooter: 'يرجى مراجعة الحساب والمطابقة خلال 7 أيام من تاريخه، وتعتبر الأرصدة نهائية ما لم يرد اعتراض كتابي.',
    customNotes: 'جميع العمليات مقيدة بالجنيه المصري ومطابقة لقيود اليومية',
    validityDays: '7',
  },
};

const DOC_METAS: Record<TemplateDocType, { label: string; icon: React.ComponentType<{ className?: string }>; hint: string; supportedPapers: ('80mm' | '57mm' | 'a4')[] }> = {
  return: {
    label: 'مرتجع مبيعات',
    icon: RotateCcw,
    hint: 'إيصال استرداد بضاعة ونقدية مع إشارة للفاتورة الأصلية',
    supportedPapers: ['80mm', '57mm', 'a4'],
  },
  purchase: {
    label: 'فاتورة مشتريات',
    icon: ShoppingBag,
    hint: 'فاتورة استلام بضاعة من المورد مع رصيد آجل ومخزن',
    supportedPapers: ['a4', '80mm'],
  },
  receipt_voucher: {
    label: 'سند قبض عميل',
    icon: ArrowDownLeft,
    hint: 'إيصال استلام أموال وسداد حساب عميل مع تفقيط بالكلمات',
    supportedPapers: ['80mm', 'a4'],
  },
  payment_voucher: {
    label: 'سند صرف نقدية',
    icon: ArrowUpRight,
    hint: 'إذن خروج نقدية لمورد أو مصروف من الدرج / الخزينة',
    supportedPapers: ['80mm', 'a4'],
  },
  daily_closing: {
    label: 'إغلاق اليومية (زد ريبورت)',
    icon: CalendarCheck,
    hint: 'تقرير إغلاق الوردية ومطابقة عهدة الدرج والمبيعات',
    supportedPapers: ['80mm', '57mm', 'a4'],
  },
  quotation: {
    label: 'عرض أسعار',
    icon: FileSpreadsheet,
    hint: 'عرض أسعار تجاري رسمي للعميل مع الشروط والختم',
    supportedPapers: ['a4', '80mm'],
  },
  statement: {
    label: 'كشف حساب',
    icon: BookOpen,
    hint: 'كشف حساب حركات مدين ودائن ورصيد تراكمي للعميل أو المورد',
    supportedPapers: ['a4'],
  },
};

/** Barcode simulator helper */
const BarcodeSnippet: React.FC<{ value: string; paperWidth: string }> = ({ value, paperWidth }) => {
  const is57mm = paperWidth === '57mm';
  const bits = encodeInvoiceBarcode(value);
  if (!bits) {
    return (
      <div className="text-center font-mono text-micro font-bold py-1 border border-neutral-300 rounded">
        *{value}*
      </div>
    );
  }
  const layout = layoutReceiptBarcode(bits.length, is57mm ? '57mm' : '80mm');
  const mm = (dots: number) => `${((dots * 25.4) / RECEIPT_DPI).toFixed(2)}mm`;
  const bars: Array<{ x: number; width: number }> = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    let run = 1;
    while (bits[i + run] === '1') run++;
    bars.push({ x: i, width: run });
    i += run - 1;
  }

  return (
    <div className="mt-2 text-center select-text">
      <svg
        role="img"
        aria-label={`باركود المستند ${value}`}
        className="block mx-auto"
        style={{ width: mm(layout.widthDots), height: is57mm ? '18px' : '26px' }}
        viewBox={`0 0 ${bits.length} 1`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={1} fill="currentColor" />
        ))}
      </svg>
      <div className="text-micro font-mono font-bold tracking-wider text-black mt-0.5">
        {value}
      </div>
    </div>
  );
};

export const InvoiceTemplatesTab: React.FC<InvoiceTemplatesTabProps> = ({
  storeName = 'متجر رفيق التجاري',
  storePhone = '01012345678',
  storeAddress = 'شارع الجمهورية، وسط البلد، القاهرة',
  taxNumber = '100-245-891',
  storeLogoUrl = '/receipt_logo_square.png',
  saveBarRef,
  onOpenPrinterSettings,
}) => {
  const [activeDoc, setActiveDoc] = useState<TemplateDocType>('return');
  const [configs, setConfigs] = useState<Record<TemplateDocType, TemplateConfig>>(DEFAULT_CONFIGS);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string>('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Load saved preferences from SQLite settings
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const settings = await invoke<Record<string, string>>('settings:getAll');
        if (!mounted || !settings) return;

        const next = { ...DEFAULT_CONFIGS };
        (Object.keys(DEFAULT_CONFIGS) as TemplateDocType[]).forEach((doc) => {
          const prefix = `doc_template_${doc}_`;
          const current = { ...DEFAULT_CONFIGS[doc] };

          if (settings[`${prefix}paper`]) current.paperWidth = settings[`${prefix}paper`] as any;
          if (settings[`${prefix}show_logo`] !== undefined) current.showLogo = settings[`${prefix}show_logo`] === '1';
          if (settings[`${prefix}show_header`] !== undefined) current.showHeader = settings[`${prefix}show_header`] === '1';
          if (settings[`${prefix}show_tax`] !== undefined) current.showTaxNumber = settings[`${prefix}show_tax`] === '1';
          if (settings[`${prefix}show_cashier`] !== undefined) current.showCashier = settings[`${prefix}show_cashier`] === '1';
          if (settings[`${prefix}show_barcode`] !== undefined) current.showBarcode = settings[`${prefix}show_barcode`] === '1';
          if (settings[`${prefix}show_signatures`] !== undefined) current.showSignatures = settings[`${prefix}show_signatures`] === '1';
          if (settings[`${prefix}show_breakdown`] !== undefined) current.showBreakdown = settings[`${prefix}show_breakdown`] === '1';
          if (settings[`${prefix}show_tafqeet`] !== undefined) current.showTafqeet = settings[`${prefix}show_tafqeet`] === '1';
          if (settings[`${prefix}custom_header`] !== undefined) current.customHeader = settings[`${prefix}custom_header`];
          if (settings[`${prefix}custom_footer`] !== undefined) current.customFooter = settings[`${prefix}custom_footer`];
          if (settings[`${prefix}custom_notes`] !== undefined) current.customNotes = settings[`${prefix}custom_notes`];
          if (settings[`${prefix}validity_days`] !== undefined) current.validityDays = settings[`${prefix}validity_days`];

          next[doc] = current;
        });

        setConfigs(next);
        setBaselineSnapshot(JSON.stringify(next));
      } catch (err) {
        console.error('Failed to load document templates settings:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const currentConfig = configs[activeDoc];
  const activeMeta = DOC_METAS[activeDoc];
  const motionPanel = useMotionPanel(activeDoc);
  const { print: triggerPrint } = usePrintReport({
    reportName: `نموذج ${activeMeta.label}`,
    kind: 'compact',
    paper: currentConfig.paperWidth === 'a4' ? 'a4' : 'roll',
  });
  const isDirty = useMemo(() => {
    return baselineSnapshot !== '' && JSON.stringify(configs) !== baselineSnapshot;
  }, [configs, baselineSnapshot]);

  const updateCurrentConfig = (patch: Partial<TemplateConfig>) => {
    setConfigs((prev) => ({
      ...prev,
      [activeDoc]: {
        ...prev[activeDoc],
        ...patch,
      },
    }));
  };

  const handleSave = async () => {
    setSaveLoading(true);
    setSaveSuccess(false);
    try {
      const payload: Record<string, string> = {};
      (Object.keys(configs) as TemplateDocType[]).forEach((doc) => {
        const c = configs[doc];
        const prefix = `doc_template_${doc}_`;
        payload[`${prefix}paper`] = c.paperWidth;
        payload[`${prefix}show_logo`] = c.showLogo ? '1' : '0';
        payload[`${prefix}show_header`] = c.showHeader ? '1' : '0';
        payload[`${prefix}show_tax`] = c.showTaxNumber ? '1' : '0';
        payload[`${prefix}show_cashier`] = c.showCashier ? '1' : '0';
        payload[`${prefix}show_barcode`] = c.showBarcode ? '1' : '0';
        payload[`${prefix}show_signatures`] = c.showSignatures ? '1' : '0';
        payload[`${prefix}show_breakdown`] = c.showBreakdown ? '1' : '0';
        payload[`${prefix}show_tafqeet`] = c.showTafqeet ? '1' : '0';
        payload[`${prefix}custom_header`] = c.customHeader;
        payload[`${prefix}custom_footer`] = c.customFooter;
        payload[`${prefix}custom_notes`] = c.customNotes;
        payload[`${prefix}validity_days`] = c.validityDays;
      });

      await invoke('settings:updateBatch', { settings: payload });
      setBaselineSnapshot(JSON.stringify(configs));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save templates:', err);
      void rafiqAlert({
        title: 'خطأ في الحفظ',
        message: 'تعذر حفظ إعدادات النماذج في قاعدة البيانات.',
        variant: 'error',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleResetCurrent = () => {
    setConfigs((prev) => ({
      ...prev,
      [activeDoc]: { ...DEFAULT_CONFIGS[activeDoc] },
    }));
  };

  const handleTestPrint = () => {
    void triggerPrint();
  };

  // --------------------------------------------------------------------------
  // Document Live Renderers (Simulating Exact Physical Print Format)
  // --------------------------------------------------------------------------

  // 1. Return Receipt (مرتجع مبيعات)
  const renderReturnContent = () => {
    const is57mm = currentConfig.paperWidth === '57mm';
    const isA4 = currentConfig.paperWidth === 'a4';

    const items = currentConfig.sampleMode === 'detailed'
      ? [
          { name: 'حليب كامل الدسم 1 لتر - جهينة', qty: '2 علبة', price: '45.00', total: '90.00', reason: 'رغبة العميل' },
          { name: 'جبنة بيضاء فيتا 500 جم - دومتي', qty: '1 عبوة', price: '38.50', total: '38.50', reason: 'عيب تغليف' },
          { name: 'شاي أسود ناعم 250 جم - العروسة', qty: '1 باكت', price: '55.00', total: '55.00', reason: 'صنف زائد' },
        ]
      : [
          { name: 'زيت عباد الشمس 800 مل - عافية', qty: '2 زجاجة', price: '75.00', total: '150.00', reason: 'رغبة العميل' },
        ];

    const subtotal = currentConfig.sampleMode === 'detailed' ? '183.50' : '150.00';
    const vat = currentConfig.sampleMode === 'detailed' ? '25.69' : '21.00';
    const grandTotal = currentConfig.sampleMode === 'detailed' ? '183.50' : '150.00';

    return (
      <div className={`text-black font-sans leading-relaxed select-text ${is57mm ? 'text-micro' : 'text-xs'}`} dir="rtl">
        {/* Header */}
        {currentConfig.showLogo && storeLogoUrl && (
          <div className="flex justify-center mb-1.5">
            <img src={storeLogoUrl} alt="Logo" className={`object-contain max-h-[2.75rem] ${is57mm ? 'max-w-[5rem]' : 'max-w-[7.5rem]'}`} />
          </div>
        )}
        <div className={`text-center font-bold break-words ${is57mm ? 'text-xs' : 'text-sm'}`}>{storeName}</div>
        {currentConfig.showHeader && (
          <>
            {storeAddress && <div className="text-center text-micro break-words text-neutral-600">{storeAddress}</div>}
            {storePhone && <div className="text-center text-micro font-mono text-neutral-600">هاتف: {storePhone}</div>}
          </>
        )}
        {currentConfig.showTaxNumber && taxNumber && (
          <div className="text-center text-micro font-mono text-neutral-600">الرقم الضريبي: {taxNumber}</div>
        )}

        <div className="border-t border-dashed border-black my-2" />

        {/* Badge & Doc Type */}
        <div className="bg-black text-white text-center font-bold py-1 px-2 my-1 text-xs">
          {currentConfig.customHeader || 'فاتورة مرتجع مبيعات معتمدة'}
        </div>

        <div className="flex justify-between items-baseline mt-1.5 font-bold">
          <span>رقم المرتجع: RET-2026-0048</span>
          <span dir="ltr" className="font-mono text-micro">11/11/2026 14:35</span>
        </div>
        <div className="flex justify-between items-baseline text-micro text-neutral-700">
          <span>فاتورة البيع الأصلية:</span>
          <span className="font-mono font-bold">INV-10824</span>
        </div>
        {currentConfig.showCashier && (
          <div className="flex justify-between items-baseline text-micro text-neutral-700">
            <span>الكاشير المسؤول:</span>
            <span>أحمد محمود (نقطة #1)</span>
          </div>
        )}
        <div className="flex justify-between items-baseline text-micro text-neutral-700">
          <span>طريقة رد المبلغ:</span>
          <span className="font-bold">نقداً من الدرج</span>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Items Table */}
        <div className="font-bold border-b-2 border-black pb-1 mb-1.5 flex justify-between">
          <span>الصنف المسترد</span>
          <span className="grid grid-cols-3 gap-2 font-mono text-left" style={{ width: is57mm ? '110px' : '150px' }}>
            <span>الكمية</span>
            <span className="text-right">السعر</span>
            <span className="text-right">المسترد</span>
          </span>
        </div>

        <div className="space-y-1">
          {items.map((it, idx) => (
            <div key={idx} className="border-b border-neutral-200 pb-1">
              <div className="flex justify-between items-baseline">
                <span className="font-medium break-words max-w-[8.75rem]">{it.name}</span>
                <span className="grid grid-cols-3 gap-2 font-mono text-left" style={{ width: is57mm ? '110px' : '150px' }}>
                  <span>{it.qty}</span>
                  <span className="text-right">{it.price}</span>
                  <span className="text-right font-bold text-danger">{it.total}</span>
                </span>
              </div>
              {currentConfig.customNotes && (
                <div className="text-micro text-neutral-500 mt-0.5">{it.reason}</div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Totals */}
        <div className="space-y-1 font-mono">
          <div className="flex justify-between items-baseline text-xs">
            <span className="font-sans">إجمالي الأصناف المرتجعة:</span>
            <span>{subtotal} ج.م</span>
          </div>
          {currentConfig.showBreakdown && (
            <div className="flex justify-between items-baseline text-micro text-neutral-600">
              <span className="font-sans">ضريبة القيمة المضافة المستردة:</span>
              <span>{vat} ج.م</span>
            </div>
          )}
          <div className="flex justify-between items-baseline font-bold text-sm border-t-2 border-black pt-1">
            <span className="font-sans">صافي المبلغ المنصرف للعميل:</span>
            <span className="text-danger">{grandTotal} ج.م</span>
          </div>
        </div>

        {currentConfig.showTafqeet && (
          <div className="bg-neutral-100 p-1.5 text-center text-micro font-bold mt-2 border border-neutral-300">
            {tafqeetCurrency(Math.round(parseFloat(grandTotal) * 100))}
          </div>
        )}

        {/* Policy Footer */}
        {currentConfig.customFooter && (
          <div className="text-center text-micro text-neutral-700 mt-2.5 pt-2 border-t border-dashed border-black leading-snug">
            {currentConfig.customFooter}
          </div>
        )}

        {/* Signatures */}
        {currentConfig.showSignatures && (
          <div className="mt-4 pt-2 border-t border-dashed border-black grid grid-cols-2 text-center text-micro gap-2">
            <div>
              <div className="font-bold">توقيع المستلم (العميل)</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
            <div>
              <div className="font-bold">اعتماد الصراف / المشرف</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
          </div>
        )}

        {/* Barcode */}
        {currentConfig.showBarcode && !isA4 && (
          <BarcodeSnippet value="RFQ-RET-2026-0048" paperWidth={currentConfig.paperWidth} />
        )}
      </div>
    );
  };

  // 2. Purchase Invoice (فاتورة مشتريات وتوريد)
  const renderPurchaseContent = () => {
    const isA4 = currentConfig.paperWidth === 'a4';

    const items = [
      { code: 'PRD-101', name: 'أرز فاخر عريض الحبة 1 كجم - الضحى', batch: 'B26-04', expiry: '11/2027', unitName: 'كرتونة 10ك', qty: 20, cost: '320.00', total: '6,400.00' },
      { code: 'PRD-102', name: 'مكرونة فرن 400 جم - الملكة', batch: 'B26-09', expiry: '08/2027', unitName: 'كرتونة 20ك', qty: 15, cost: '210.00', total: '3,150.00' },
      { code: 'PRD-103', name: 'سمن نباتي نقي 700 جم - كريستال', batch: 'B26-01', expiry: '12/2026', unitName: 'كرتونة 6ع', qty: 10, cost: '480.00', total: '4,800.00' },
    ];

    const gross = '14,350.00';
    const discount = '350.00';
    const vat = '1,960.00';
    const net = '15,960.00';
    const paid = '10,000.00';
    const remaining = '5,960.00';

    return (
      <div className="text-black font-sans leading-relaxed select-text text-xs" dir="rtl">
        {/* Letterhead */}
        <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3">
          <div>
            <div className="text-base font-extrabold">{storeName}</div>
            <div className="text-micro text-neutral-600">{storeAddress}</div>
            <div className="text-micro font-mono text-neutral-600">هاتف: {storePhone} | الرقم الضريبي: {taxNumber}</div>
          </div>
          {currentConfig.showLogo && storeLogoUrl && (
            <img src={storeLogoUrl} alt="Logo" className="max-h-12 object-contain" />
          )}
        </div>

        {/* Title */}
        <div className="bg-neutral-100 border border-neutral-300 py-1.5 px-3 text-center mb-3">
          <span className="font-extrabold text-sm">{currentConfig.customHeader || 'فاتورة استلام بضاعة ومشتريات مورد'}</span>
        </div>

        {/* Meta Grid */}
        <div className="grid grid-cols-2 gap-2 p-2.5 bg-neutral-50 border border-neutral-300 rounded mb-3 text-micro">
          <div>
            <span className="text-neutral-600">المورد: </span>
            <span className="font-bold text-xs">شركة الأهرام للتوزيع والتوكيلات التجارية</span>
          </div>
          <div>
            <span className="text-neutral-600">رقم الفاتورة الداخلية: </span>
            <span className="font-mono font-bold">PUR-2026-0091</span>
          </div>
          <div>
            <span className="text-neutral-600">رقم فاتورة المورد: </span>
            <span className="font-mono font-bold">SUP-BILL-7721</span>
          </div>
          <div>
            <span className="text-neutral-600">تاريخ ووقت الاستلام: </span>
            <span className="font-mono">11/11/2026 11:20 ص</span>
          </div>
          <div>
            <span className="text-neutral-600">أمين المخزن / المستلم: </span>
            <span>محمود إبراهيم (مخزن رئيسي)</span>
          </div>
          <div>
            <span className="text-neutral-600">حالة السداد: </span>
            <span className="font-bold text-amber-700">سداد جزئي (آجل متبقي)</span>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-micro border-collapse mb-3">
          <thead>
            <tr className="bg-neutral-200 border border-black font-bold text-center">
              <th className="p-1 border border-neutral-400">#</th>
              <th className="p-1 border border-neutral-400 text-right">الصنف والبيان</th>
              {currentConfig.showBreakdown && <th className="p-1 border border-neutral-400">التشغيلة / الصلاحية</th>}
              <th className="p-1 border border-neutral-400">الوحدة</th>
              <th className="p-1 border border-neutral-400">الكمية</th>
              <th className="p-1 border border-neutral-400 text-left font-mono">سعر الشراء</th>
              <th className="p-1 border border-neutral-400 text-left font-mono">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-b border-neutral-300 text-center">
                <td className="p-1 border-x border-neutral-300 font-mono">{idx + 1}</td>
                <td className="p-1 border-x border-neutral-300 text-right font-medium">{it.name}</td>
                {currentConfig.showBreakdown && (
                  <td className="p-1 border-x border-neutral-300 font-mono text-micro text-neutral-600">
                    {it.batch} | {it.expiry}
                  </td>
                )}
                <td className="p-1 border-x border-neutral-300">{it.unitName}</td>
                <td className="p-1 border-x border-neutral-300 font-mono font-bold">{it.qty}</td>
                <td className="p-1 border-x border-neutral-300 text-left font-mono">{it.cost}</td>
                <td className="p-1 border-x border-neutral-300 text-left font-mono font-bold">{it.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial Summary */}
        <div className="flex justify-end mb-3">
          <div className="w-64 space-y-1 font-mono text-micro bg-neutral-50 p-2.5 border border-neutral-300 rounded">
            <div className="flex justify-between">
              <span className="font-sans">إجمالي الفاتورة:</span>
              <span>{gross} ج.م</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span className="font-sans">خصم تجاري ممنوح:</span>
              <span>- {discount} ج.م</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span className="font-sans">ضريبة القيمة المضافة (14%):</span>
              <span>+ {vat} ج.م</span>
            </div>
            <div className="flex justify-between font-bold text-xs border-t border-black pt-1">
              <span className="font-sans">الصافي الإجمالي المستحق:</span>
              <span>{net} ج.م</span>
            </div>
            <div className="flex justify-between text-emerald-800 font-bold border-t border-neutral-300 pt-1">
              <span className="font-sans">المسدد نقداً من الخزينة:</span>
              <span>{paid} ج.م</span>
            </div>
            <div className="flex justify-between text-danger font-extrabold border-t border-neutral-300 pt-1">
              <span className="font-sans">الرصيد المتبقي للمورد:</span>
              <span>{remaining} ج.م</span>
            </div>
          </div>
        </div>

        {currentConfig.showTafqeet && (
          <div className="bg-neutral-100 p-2 text-micro font-bold border border-neutral-300 rounded mb-3">
            المبلغ بالحروف: {tafqeetCurrency(1596000)}
          </div>
        )}

        {currentConfig.customFooter && (
          <div className="text-micro text-neutral-600 italic border-t border-neutral-300 pt-2 mb-4">
            {currentConfig.customFooter}
          </div>
        )}

        {/* Signatures */}
        {currentConfig.showSignatures && (
          <div className="grid grid-cols-3 gap-4 text-center text-micro pt-3 border-t-2 border-black">
            <div>
              <div className="font-bold">أمين المخزن المستلم</div>
              <div className="mt-8 border-b border-black" />
            </div>
            <div>
              <div className="font-bold">المحاسب المسؤول</div>
              <div className="mt-8 border-b border-black" />
            </div>
            <div>
              <div className="font-bold">مندوب المورد المسلّم</div>
              <div className="mt-8 border-b border-black" />
            </div>
          </div>
        )}

        {currentConfig.showBarcode && !isA4 && (
          <BarcodeSnippet value="RFQ-PUR-2026-0091" paperWidth={currentConfig.paperWidth} />
        )}
      </div>
    );
  };

  // 3. Customer Cash Receipt Voucher (سند قبض نقدية)
  const renderReceiptVoucherContent = () => {
    const is57mm = currentConfig.paperWidth === '57mm';
    const amountPiasters = 250000; // 2,500.00 EGP
    const balanceBefore = 840000; // 8,400.00 EGP
    const balanceAfter = 590000;  // 5,900.00 EGP

    return (
      <div className={`text-black font-sans leading-relaxed select-text ${is57mm ? 'text-micro' : 'text-xs'}`} dir="rtl">
        {/* Header */}
        {currentConfig.showLogo && storeLogoUrl && (
          <div className="flex justify-center mb-1.5">
            <img src={storeLogoUrl} alt="Logo" className="max-h-11 object-contain" />
          </div>
        )}
        <div className="text-center font-bold text-sm">{storeName}</div>
        {currentConfig.showHeader && (
          <div className="text-center text-micro text-neutral-600">{storeAddress} | هاتف: {storePhone}</div>
        )}

        <div className="border-t border-dashed border-black my-2" />

        {/* Badge */}
        <div className="bg-black text-white text-center font-bold py-1 px-2 my-1 text-xs">
          {currentConfig.customHeader || 'سند قبض نقدية - إيصال استلام أموال'}
        </div>

        <div className="flex justify-between items-baseline font-bold mt-1.5">
          <span>رقم السند: REC-2026-1044</span>
          <span dir="ltr" className="font-mono text-micro">11/11/2026 15:10</span>
        </div>

        {/* Voucher Body Box */}
        <div className="bg-neutral-50 p-2.5 rounded border border-neutral-300 my-2 space-y-1.5 text-micro">
          <div className="flex justify-between border-b border-neutral-200 pb-1">
            <span className="text-neutral-600">وصلنا من السيد / العميل:</span>
            <span className="font-bold text-xs">الحاج عادل عبد الرحمن</span>
          </div>
          <div className="flex justify-between border-b border-neutral-200 pb-1">
            <span className="text-neutral-600">رقم الهاتف:</span>
            <span className="font-mono">01224567890</span>
          </div>
          <div className="flex justify-between items-baseline border-b border-neutral-200 pb-1">
            <span className="text-neutral-600 font-bold">المبلغ المقبوض:</span>
            <span className="font-mono font-extrabold text-sm text-emerald-800">
              {formatArabicCurrency(amountPiasters)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600">البيان وملاحظات السند:</span>
            <span className="font-medium text-right max-w-[11.25rem]">
              {currentConfig.customNotes || 'سداد دفعة تحت الحساب للرصيد الآجل'}
            </span>
          </div>
        </div>

        {/* Tafqeet Words */}
        {currentConfig.showTafqeet && (
          <div className="p-1.5 bg-neutral-100 border border-neutral-300 rounded font-bold text-micro text-center mb-2">
            {tafqeetCurrency(amountPiasters)}
          </div>
        )}

        {/* Ledger Balance Breakdown */}
        {currentConfig.showBreakdown && (
          <div className="border border-neutral-300 rounded p-2 text-micro bg-neutral-50 space-y-1 font-mono mb-2">
            <div className="flex justify-between">
              <span className="font-sans text-neutral-600">الرصيد السابق قبل السداد:</span>
              <span>{formatArabicCurrency(balanceBefore)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-bold">
              <span className="font-sans">المبلغ المدفوع بهذا السند:</span>
              <span>- {formatArabicCurrency(amountPiasters)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs border-t border-black pt-1">
              <span className="font-sans">الرصيد المتبقي على العميل:</span>
              <span className="text-danger">{formatArabicCurrency(balanceAfter)}</span>
            </div>
          </div>
        )}

        {currentConfig.customFooter && (
          <div className="text-center text-micro text-neutral-600 mt-2 border-t border-dashed border-black pt-1.5 leading-snug">
            {currentConfig.customFooter}
          </div>
        )}

        {/* Signatures */}
        {currentConfig.showSignatures && (
          <div className="mt-4 pt-2 border-t border-dashed border-black grid grid-cols-2 text-center text-micro gap-3">
            <div>
              <div className="font-bold">توقيع المسلّم (العميل)</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
            <div>
              <div className="font-bold">توقيع المستلم (الصراف)</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
          </div>
        )}

        {currentConfig.showBarcode && (
          <BarcodeSnippet value="RFQ-REC-2026-1044" paperWidth={currentConfig.paperWidth} />
        )}
      </div>
    );
  };

  // 4. Cash Payment / Expense Voucher (سند صرف نقدية)
  const renderPaymentVoucherContent = () => {
    const is57mm = currentConfig.paperWidth === '57mm';
    const amountPiasters = 75000; // 750.00 EGP

    return (
      <div className={`text-black font-sans leading-relaxed select-text ${is57mm ? 'text-micro' : 'text-xs'}`} dir="rtl">
        {currentConfig.showLogo && storeLogoUrl && (
          <div className="flex justify-center mb-1.5">
            <img src={storeLogoUrl} alt="Logo" className="max-h-11 object-contain" />
          </div>
        )}
        <div className="text-center font-bold text-sm">{storeName}</div>
        {currentConfig.showHeader && (
          <div className="text-center text-micro text-neutral-600">{storeAddress} | هاتف: {storePhone}</div>
        )}

        <div className="border-t border-dashed border-black my-2" />

        <div className="bg-black text-white text-center font-bold py-1 px-2 my-1 text-xs">
          {currentConfig.customHeader || 'إذن صرف نقدية - سند صرف معتمد'}
        </div>

        <div className="flex justify-between items-baseline font-bold mt-1.5">
          <span>رقم السند: PAY-2026-0819</span>
          <span dir="ltr" className="font-mono text-micro">11/11/2026 12:40</span>
        </div>

        <div className="bg-neutral-50 p-2.5 rounded border border-neutral-300 my-2 space-y-1.5 text-micro">
          <div className="flex justify-between border-b border-neutral-200 pb-1">
            <span className="text-neutral-600">يصرف للسيد / الجهة:</span>
            <span className="font-bold text-xs">شركة النور للصيانة والخدمات</span>
          </div>
          <div className="flex justify-between border-b border-neutral-200 pb-1">
            <span className="text-neutral-600">جهة الخروج (الخزينة):</span>
            <span className="font-bold text-emerald-800">درج الكاشير الرئيسي (عهدة وردية #1)</span>
          </div>
          <div className="flex justify-between items-baseline border-b border-neutral-200 pb-1">
            <span className="text-neutral-600 font-bold">المبلغ المصروف:</span>
            <span className="font-mono font-extrabold text-sm text-danger">
              {formatArabicCurrency(amountPiasters)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600">البيان وسبب الصرف:</span>
            <span className="font-medium text-right max-w-[11.25rem]">
              {currentConfig.customNotes || 'صيانة تكييفات الفرع وتغيير فلاتر الهواء'}
            </span>
          </div>
        </div>

        {currentConfig.showTafqeet && (
          <div className="p-1.5 bg-neutral-100 border border-neutral-300 rounded font-bold text-micro text-center mb-2">
            {tafqeetCurrency(amountPiasters)}
          </div>
        )}

        {currentConfig.customFooter && (
          <div className="text-center text-micro text-neutral-600 mt-2 border-t border-dashed border-black pt-1.5 leading-snug">
            {currentConfig.customFooter}
          </div>
        )}

        {currentConfig.showSignatures && (
          <div className="mt-4 pt-2 border-t border-dashed border-black grid grid-cols-3 text-center text-micro gap-2">
            <div>
              <div className="font-bold">المحاسب المُنظم</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
            <div>
              <div className="font-bold">اعتماد الإدارة</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
            <div>
              <div className="font-bold">المستلم للنقدية</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
          </div>
        )}

        {currentConfig.showBarcode && (
          <BarcodeSnippet value="RFQ-PAY-2026-0819" paperWidth={currentConfig.paperWidth} />
        )}
      </div>
    );
  };

  // 5. Daily Closing / Shift Z-Report (تقرير إغلاق اليومية والوردية)
  const renderDailyClosingContent = () => {
    const is57mm = currentConfig.paperWidth === '57mm';

    return (
      <div className={`text-black font-sans leading-relaxed select-text ${is57mm ? 'text-micro' : 'text-xs'}`} dir="rtl">
        {currentConfig.showLogo && storeLogoUrl && (
          <div className="flex justify-center mb-1.5">
            <img src={storeLogoUrl} alt="Logo" className="max-h-11 object-contain" />
          </div>
        )}
        <div className="text-center font-bold text-sm">{storeName}</div>
        {currentConfig.showHeader && (
          <div className="text-center text-micro text-neutral-600">{storeAddress} | هاتف: {storePhone}</div>
        )}

        <div className="border-t border-dashed border-black my-2" />

        <div className="bg-black text-white text-center font-bold py-1 px-2 my-1 text-xs">
          {currentConfig.customHeader || 'تقرير تقفيل اليومية والوردية - زد ريبورت'}
        </div>

        <div className="flex justify-between items-baseline font-bold mt-1.5 text-micro">
          <span>الوردية: رقم 058 (مسائي)</span>
          <span>الكاشير: أحمد محمود</span>
        </div>
        <div className="flex justify-between items-baseline text-micro text-neutral-600 font-mono">
          <span>بدء: 11/11/2026 09:00 ص</span>
          <span>إغلاق: 11/11/2026 17:00 م</span>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Sales Overview */}
        <div className="font-bold text-xs mb-1">ملخص المبيعات والإيرادات:</div>
        <div className="space-y-1 font-mono text-micro">
          <div className="flex justify-between">
            <span className="font-sans">عدد الفواتير المنفذة:</span>
            <span>68 فاتورة</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans">إجمالي المبيعات الإجمالية:</span>
            <span>14,250.00 ج.م</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span className="font-sans">إجمالي الخصومات الممنوحة:</span>
            <span>- 350.00 ج.م</span>
          </div>
          <div className="flex justify-between text-danger">
            <span className="font-sans">إجمالي المرتجعات (3 فواتير):</span>
            <span>- 600.00 ج.م</span>
          </div>
          <div className="flex justify-between font-bold text-xs border-t border-black pt-1">
            <span className="font-sans">صافي المبيعات المحققة:</span>
            <span>13,300.00 ج.م</span>
          </div>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Methods Breakdown */}
        <div className="font-bold text-xs mb-1">طرق الدفع والتحصيل:</div>
        <div className="space-y-1 font-mono text-micro">
          <div className="flex justify-between">
            <span className="font-sans">مبيعات نقدية (كاش):</span>
            <span>9,800.00 ج.م</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans">بطاقات دفع إلكتروني (فيزا):</span>
            <span>2,500.00 ج.م</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans">محافظ إلكترونية (فودافون كاش):</span>
            <span>1,000.00 ج.م</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span className="font-sans">مبيعات آجلة (على الحساب):</span>
            <span>0.00 ج.م</span>
          </div>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Drawer Audit */}
        <div className="font-bold text-xs mb-1">مطابقة وتسوية درج النقدية:</div>
        <div className="space-y-1 font-mono text-micro bg-neutral-50 p-2 border border-neutral-300 rounded">
          <div className="flex justify-between">
            <span className="font-sans">الرصيد الافتتاحي للدرج (عهدة):</span>
            <span>500.00 ج.م</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans">المقبوضات النقدية:</span>
            <span>+ 9,800.00 ج.م</span>
          </div>
          <div className="flex justify-between text-danger">
            <span className="font-sans">مصروفات نقدية منصرفة من الدرج:</span>
            <span>- 400.00 ج.م</span>
          </div>
          <div className="flex justify-between text-danger">
            <span className="font-sans">مرتجعات نقدية منصرفة من الدرج:</span>
            <span>- 600.00 ج.م</span>
          </div>
          <div className="flex justify-between font-bold border-t border-neutral-300 pt-1">
            <span className="font-sans">النقدية المتوقعة بالدرج:</span>
            <span>9,300.00 ج.م</span>
          </div>
          <div className="flex justify-between font-bold text-emerald-800">
            <span className="font-sans">النقدية الفعلية المحصورة بالعد:</span>
            <span>9,300.00 ج.م</span>
          </div>
          <div className="flex justify-between font-extrabold text-xs border-t-2 border-black pt-1 text-emerald-800">
            <span className="font-sans">حالة المطابقة:</span>
            <span>0.00 ج.م (مطابق تماماً)</span>
          </div>
        </div>

        {/* Categories breakdown */}
        {currentConfig.showBreakdown && (
          <div className="mt-2.5">
            <div className="font-bold text-xs mb-1">مبيعات الأقسام الرئيسية:</div>
            <div className="space-y-1 font-mono text-micro">
              <div className="flex justify-between">
                <span className="font-sans">بقالة ومواد غذائية:</span>
                <span>6,200.00 ج.م (46%)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans">ألبان ومجمدات:</span>
                <span>4,100.00 ج.م (31%)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans">منظفات وورقيات:</span>
                <span>3,000.00 ج.م (23%)</span>
              </div>
            </div>
          </div>
        )}

        {currentConfig.customFooter && (
          <div className="text-center text-micro text-neutral-600 mt-2.5 border-t border-dashed border-black pt-1.5 leading-snug">
            {currentConfig.customFooter}
          </div>
        )}

        {currentConfig.showSignatures && (
          <div className="mt-4 pt-2 border-t border-dashed border-black grid grid-cols-2 text-center text-micro gap-3">
            <div>
              <div className="font-bold">توقيع كاشير الوردية</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
            <div>
              <div className="font-bold">اعتماد المشرف المالي</div>
              <div className="h-6 border-b border-dotted border-black mt-1" />
            </div>
          </div>
        )}
      </div>
    );
  };

  // 6. Price Quotation (عرض أسعار رسمي)
  const renderQuotationContent = () => {
    const items = [
      { code: 'Q-01', name: 'جهاز نقطة بيع متكامل شاشة لمس 15 بوصة', qty: 2, price: '18,500.00', total: '37,000.00' },
      { code: 'Q-02', name: 'طابعة فواتير حرارية USB / LAN 80mm عالية السرعة', qty: 2, price: '3,200.00', total: '6,400.00' },
      { code: 'Q-03', name: 'قارئ باركود ليزري أوتوماتيكي مع حامل مكتبي', qty: 2, price: '1,450.00', total: '2,900.00' },
      { code: 'Q-04', name: 'درج نقدية معدني ثقيل 5 خانات فتح تلقائي RJ11', qty: 2, price: '1,850.00', total: '3,700.00' },
    ];

    const subtotal = '50,000.00';
    const vat = '7,000.00';
    const grand = '57,000.00';

    return (
      <div className="text-black font-sans leading-relaxed select-text text-xs" dir="rtl">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3">
          <div>
            <div className="text-base font-extrabold">{storeName}</div>
            <div className="text-micro text-neutral-600">{storeAddress}</div>
            <div className="text-micro font-mono text-neutral-600">هاتف: {storePhone} | الرقم الضريبي: {taxNumber}</div>
          </div>
          {currentConfig.showLogo && storeLogoUrl && (
            <img src={storeLogoUrl} alt="Logo" className="max-h-12 object-contain" />
          )}
        </div>

        <div className="bg-neutral-100 border border-neutral-300 py-1.5 px-3 text-center mb-3">
          <span className="font-extrabold text-sm">{currentConfig.customHeader || 'عرض أسعار تجاري رسمي - Price Quotation'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-2.5 bg-neutral-50 border border-neutral-300 rounded mb-3 text-micro">
          <div>
            <span className="text-neutral-600">مقدم إلى السيد / الشركة: </span>
            <span className="font-bold text-xs">سوبر ماركت الإيمان والتقوى</span>
          </div>
          <div>
            <span className="text-neutral-600">رقم عرض الأسعار: </span>
            <span className="font-mono font-bold">QUO-2026-0118</span>
          </div>
          <div>
            <span className="text-neutral-600">تاريخ العرض: </span>
            <span className="font-mono">11/11/2026</span>
          </div>
          <div>
            <span className="text-neutral-600">صلاحية العرض: </span>
            <span className="font-bold text-brand">صالح لمدة {currentConfig.validityDays || '15'} يوماً من تاريخه</span>
          </div>
        </div>

        <table className="w-full text-micro border-collapse mb-3">
          <thead>
            <tr className="bg-neutral-200 border border-black font-bold text-center">
              <th className="p-1 border border-neutral-400">#</th>
              <th className="p-1 border border-neutral-400 text-right">بيان الصنف والمواصفات</th>
              <th className="p-1 border border-neutral-400">الكمية</th>
              <th className="p-1 border border-neutral-400 text-left font-mono">سعر الوحدة</th>
              <th className="p-1 border border-neutral-400 text-left font-mono">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-b border-neutral-300 text-center">
                <td className="p-1 border-x border-neutral-300 font-mono">{idx + 1}</td>
                <td className="p-1 border-x border-neutral-300 text-right font-medium">{it.name}</td>
                <td className="p-1 border-x border-neutral-300 font-mono font-bold">{it.qty}</td>
                <td className="p-1 border-x border-neutral-300 text-left font-mono">{it.price}</td>
                <td className="p-1 border-x border-neutral-300 text-left font-mono font-bold">{it.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-3">
          <div className="w-64 space-y-1 font-mono text-micro bg-neutral-50 p-2.5 border border-neutral-300 rounded">
            <div className="flex justify-between">
              <span className="font-sans">المجموع الفرعي:</span>
              <span>{subtotal} ج.م</span>
            </div>
            {currentConfig.showBreakdown && (
              <div className="flex justify-between text-neutral-600">
                <span className="font-sans">ضريبة القيمة المضافة (14%):</span>
                <span>+ {vat} ج.م</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xs border-t border-black pt-1 text-emerald-800">
              <span className="font-sans">إجمالي العرض النهائي:</span>
              <span>{grand} ج.م</span>
            </div>
          </div>
        </div>

        {currentConfig.showTafqeet && (
          <div className="bg-neutral-100 p-2 text-micro font-bold border border-neutral-300 rounded mb-3">
            المبلغ بالحروف: {tafqeetCurrency(5700000)}
          </div>
        )}

        {currentConfig.customFooter && (
          <div className="text-micro text-neutral-600 border-t border-neutral-300 pt-2 mb-4 leading-relaxed">
            <span className="font-bold">الشروط والأحكام: </span>
            {currentConfig.customFooter}
          </div>
        )}

        {currentConfig.showSignatures && (
          <div className="grid grid-cols-2 gap-8 text-center text-micro pt-3 border-t-2 border-black">
            <div>
              <div className="font-bold">إدارة المبيعات والتسويق</div>
              <div className="mt-8 border-b border-black" />
            </div>
            <div>
              <div className="font-bold">اعتماد العميل والموافقة على العرض</div>
              <div className="mt-8 border-b border-black" />
            </div>
          </div>
        )}
      </div>
    );
  };

  // 7. Statement of Account (كشف حساب عميل / مورد)
  const renderStatementContent = () => {
    const rows = [
      { date: '01/11/2026', doc: 'رصيد افتتاحي سابق', ref: 'BAL-START', debit: '5,000.00', credit: '0.00', balance: '5,000.00' },
      { date: '03/11/2026', doc: 'فاتورة مبيعات آجل', ref: 'INV-10790', debit: '3,200.00', credit: '0.00', balance: '8,200.00' },
      { date: '05/11/2026', doc: 'سند قبض نقدي', ref: 'REC-1011', debit: '0.00', credit: '4,000.00', balance: '4,200.00' },
      { date: '08/11/2026', doc: 'فاتورة مبيعات آجل', ref: 'INV-10820', debit: '2,500.00', credit: '0.00', balance: '6,700.00' },
      { date: '10/11/2026', doc: 'مرتجع مبيعات', ref: 'RET-0041', debit: '0.00', credit: '700.00', balance: '6,000.00' },
    ];

    return (
      <div className="text-black font-sans leading-relaxed select-text text-xs" dir="rtl">
        <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3">
          <div>
            <div className="text-base font-extrabold">{storeName}</div>
            <div className="text-micro text-neutral-600">{storeAddress}</div>
            <div className="text-micro font-mono text-neutral-600">هاتف: {storePhone} | الرقم الضريبي: {taxNumber}</div>
          </div>
          {currentConfig.showLogo && storeLogoUrl && (
            <img src={storeLogoUrl} alt="Logo" className="max-h-12 object-contain" />
          )}
        </div>

        <div className="bg-neutral-100 border border-neutral-300 py-1.5 px-3 text-center mb-3">
          <span className="font-extrabold text-sm">{currentConfig.customHeader || 'كشف حساب مالي تفصيلي - Statement of Account'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-2.5 bg-neutral-50 border border-neutral-300 rounded mb-3 text-micro">
          <div>
            <span className="text-neutral-600">اسم الحساب / العميل: </span>
            <span className="font-bold text-xs">الحاج عادل عبد الرحمن (حساب رقم 301)</span>
          </div>
          <div>
            <span className="text-neutral-600">الفترة من: </span>
            <span className="font-mono">01/11/2026</span>
            <span className="text-neutral-600"> إلى: </span>
            <span className="font-mono">11/11/2026</span>
          </div>
          <div>
            <span className="text-neutral-600">حد الائتمان المسموح: </span>
            <span className="font-mono font-bold">15,000.00 ج.م</span>
          </div>
          <div>
            <span className="text-neutral-600">الرصيد الختامي الحالي: </span>
            <span className="font-mono font-extrabold text-danger text-xs">6,000.00 ج.م (مدين)</span>
          </div>
        </div>

        <table className="w-full text-micro border-collapse mb-3">
          <thead>
            <tr className="bg-neutral-200 border border-black font-bold text-center">
              <th className="p-1 border border-neutral-400">التاريخ</th>
              <th className="p-1 border border-neutral-400 text-right">نوع الحركة والمستند</th>
              <th className="p-1 border border-neutral-400">رقم المرجع</th>
              <th className="p-1 border border-neutral-400 text-left font-mono">مدين (+)</th>
              <th className="p-1 border border-neutral-400 text-left font-mono">دائن (-)</th>
              <th className="p-1 border border-neutral-400 text-left font-mono">الرصيد التراكمي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-b border-neutral-300 text-center">
                <td className="p-1 border-x border-neutral-300 font-mono text-micro">{r.date}</td>
                <td className="p-1 border-x border-neutral-300 text-right font-medium">{r.doc}</td>
                <td className="p-1 border-x border-neutral-300 font-mono text-micro">{r.ref}</td>
                <td className="p-1 border-x border-neutral-300 text-left font-mono">{r.debit !== '0.00' ? r.debit : '-'}</td>
                <td className="p-1 border-x border-neutral-300 text-left font-mono text-emerald-800">{r.credit !== '0.00' ? r.credit : '-'}</td>
                <td className="p-1 border-x border-neutral-300 text-left font-mono font-bold">{r.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-3">
          <div className="w-64 space-y-1 font-mono text-micro bg-neutral-50 p-2.5 border border-neutral-300 rounded">
            <div className="flex justify-between">
              <span className="font-sans">إجمالي حركات المدين:</span>
              <span>10,700.00 ج.م</span>
            </div>
            <div className="flex justify-between text-emerald-800">
              <span className="font-sans">إجمالي السدادات الدائنة:</span>
              <span>- 4,700.00 ج.م</span>
            </div>
            <div className="flex justify-between font-bold text-xs border-t-2 border-black pt-1 text-danger">
              <span className="font-sans">صافي الرصيد المستحق:</span>
              <span>6,000.00 ج.م</span>
            </div>
          </div>
        </div>

        {currentConfig.customFooter && (
          <div className="text-micro text-neutral-600 border-t border-neutral-300 pt-2 mb-4 leading-relaxed">
            {currentConfig.customFooter}
          </div>
        )}

        {currentConfig.showSignatures && (
          <div className="grid grid-cols-2 gap-8 text-center text-micro pt-3 border-t-2 border-black">
            <div>
              <div className="font-bold">إدارة الحسابات والمالية</div>
              <div className="mt-8 border-b border-black" />
            </div>
            <div>
              <div className="font-bold">توقيع العميل بالمطابقة والاعتماد</div>
              <div className="mt-8 border-b border-black" />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCurrentPreview = () => {
    switch (activeDoc) {
      case 'return':
        return renderReturnContent();
      case 'purchase':
        return renderPurchaseContent();
      case 'receipt_voucher':
        return renderReceiptVoucherContent();
      case 'payment_voucher':
        return renderPaymentVoucherContent();
      case 'daily_closing':
        return renderDailyClosingContent();
      case 'quotation':
        return renderQuotationContent();
      case 'statement':
        return renderStatementContent();
      default:
        return null;
    }
  };

  return (
    <div {...motionPanel} className="space-y-6">
      {/* 1. Document Selector Ribbon */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-xs rounded-2xl p-2.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {(Object.keys(DOC_METAS) as TemplateDocType[]).map((type) => {
            const meta = DOC_METAS[type];
            const Icon = meta.icon;
            const isSelected = activeDoc === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setActiveDoc(type)}
                className={`flex items-center gap-2 h-10 px-3.5 rounded-xl border text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-brand text-white border-brand shadow-xs dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/40'
                    : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-brand-soft/50 dark:hover:bg-brand-dark-soft/50'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white dark:text-brand-bright' : 'text-brand dark:text-brand-bright'}`} />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Split Screen: Controls on Left, Sticky Real Paper Preview on Right */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Controls Column (7 Columns) */}
        <div className="col-span-12 xl:col-span-7 space-y-5">
          {/* Document Header & Paper Settings */}
          <SettingsCard
            icon={activeMeta.icon}
            title={`تخصيص نموذج: ${activeMeta.label}`}
            description={activeMeta.hint}
            action={
              <div className="flex items-center gap-1.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-1 rounded-xl">
                {activeMeta.supportedPapers.map((pw) => (
                  <button
                    key={pw}
                    type="button"
                    aria-pressed={currentConfig.paperWidth === pw}
                    onClick={() => updateCurrentConfig({ paperWidth: pw })}
                    className={`px-2.5 py-1 text-micro font-bold rounded-lg cursor-pointer transition-colors ${
                      currentConfig.paperWidth === pw
                        ? 'bg-brand text-white shadow-xs dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/40'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    {pw === '80mm' ? 'بون 80 مم' : pw === '57mm' ? 'بون 57 مم' : 'ورق A4'}
                  </button>
                ))}
              </div>
            }
          >
            {/* Sample Data Mode Selector */}
            <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3.5">
              <div>
                <div className="text-xs font-bold text-ink dark:text-ink-dark">نمط بيانات المعاينة التجريبية</div>
                <div className="text-micro text-ink-muted dark:text-ink-dark-muted">اختر كثافة البيانات لفحص شكل الورقة مع سطور متعددة أو صنف فردي.</div>
              </div>
              <div className="inline-flex rounded-xl border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-0.5 text-micro">
                <button
                  type="button"
                  aria-pressed={currentConfig.sampleMode === 'standard'}
                  onClick={() => updateCurrentConfig({ sampleMode: 'standard' })}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                    currentConfig.sampleMode === 'standard'
                      ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-2xs'
                      : 'text-ink-muted dark:text-ink-dark-muted'
                  }`}
                >
                  صنف فردي
                </button>
                <button
                  type="button"
                  aria-pressed={currentConfig.sampleMode === 'detailed'}
                  onClick={() => updateCurrentConfig({ sampleMode: 'detailed' })}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                    currentConfig.sampleMode === 'detailed'
                      ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-2xs'
                      : 'text-ink-muted dark:text-ink-dark-muted'
                  }`}
                >
                  أصناف متعددة
                </button>
              </div>
            </div>

            {/* Display Toggles */}
            <div className="space-y-3 pt-1">
              <ToggleRow
                title="إظهار شعار المتجر"
                description="يُطبع الشعار المعتمد في ترويسة النموذج أعلى البيانات."
                checked={currentConfig.showLogo}
                onChange={(next) => updateCurrentConfig({ showLogo: next })}
              />
              <ToggleRow
                title="إظهار ترويسة المتجر (العنوان والهاتف)"
                description="يُطبع العنوان ورقم الهاتف أسفل اسم المتجر مباشرة."
                checked={currentConfig.showHeader}
                onChange={(next) => updateCurrentConfig({ showHeader: next })}
              />
              <ToggleRow
                title="إظهار الرقم الضريبي"
                description="يُطبع الرقم الضريبي للمتجر لضمان الامتثال الضريبي."
                checked={currentConfig.showTaxNumber}
                onChange={(next) => updateCurrentConfig({ showTaxNumber: next })}
              />
              <ToggleRow
                title="إظهار اسم الكاشير / المسؤول"
                description="يُظهر اسم الموظف أو المستخدم الذي أنشأ المستند في النظام."
                checked={currentConfig.showCashier}
                onChange={(next) => updateCurrentConfig({ showCashier: next })}
              />
              <ToggleRow
                title="إظهار الباركود وكود المستند"
                description="يُطبع باركود Code 128 لتسهيل المسح السريع لاحقاً عبر الماسح الضوئي."
                checked={currentConfig.showBarcode}
                onChange={(next) => updateCurrentConfig({ showBarcode: next })}
              />
              <ToggleRow
                title="إظهار تفصيل الضرائب والخصومات والأرصدة"
                description="إظهار تفريغ القيمة المضافة والرصيد السابق والمتبقي بدقة."
                checked={currentConfig.showBreakdown}
                onChange={(next) => updateCurrentConfig({ showBreakdown: next })}
              />
              <ToggleRow
                title="إظهار خانات التوقيع والاعتماد والختم"
                description="يُنشئ خطوط ومربعات مخصصة لتوقيع العميل أو المشرف أو أمين المخزن."
                checked={currentConfig.showSignatures}
                onChange={(next) => updateCurrentConfig({ showSignatures: next })}
              />
              <ToggleRow
                title="تفقيط المبالغ المالية بالكلمات العربية"
                description="كتابة المبالغ الإجمالية بالحروف باللغة العربية منعاً لأي لبس في الأصفار."
                checked={currentConfig.showTafqeet}
                onChange={(next) => updateCurrentConfig({ showTafqeet: next })}
              />
            </div>
          </SettingsCard>

          {/* Custom Texts & Policies */}
          <SettingsCard
            icon={FileText}
            title="النصوص والسياسات المخصصة للنموذج"
            description="الترويسة والشروط والأحكام الخاصة التي تظهر مطبوعة في هذا المستند."
          >
            <ReceiptTextField
              label="عنوان الترويسة المخصص"
              value={currentConfig.customHeader}
              onChange={(next) => updateCurrentConfig({ customHeader: next })}
              placeholder="مثال: فاتورة استلام بضاعة ومشتريات مورد"
              rows={1}
              hint="العنوان البارز في أعلى المستند أسفل الترويسة الرئيسية."
              error=""
            />

            <div className="space-y-1.5">
              <label htmlFor="template-footer-text" className="block text-xs font-bold text-ink dark:text-ink-dark">
                نص الشروط والسياسات المطبوعة في التذييل
              </label>
              <textarea
                id="template-footer-text"
                rows={3}
                value={currentConfig.customFooter}
                onChange={(e) => updateCurrentConfig({ customFooter: e.target.value })}
                placeholder="اكتب سياسة الاسترجاع، الشروط والأحكام، أو الملاحظات الرسمية..."
                className="w-full text-xs rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 p-3 text-ink dark:text-ink-dark focus:outline-none focus:ring-2 focus:ring-brand/30 leading-relaxed resize-none"
              />
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">
                يظهر هذا النص مطبوعاً في أسفل النموذج كشروط استرجاع أو بنود تعاقدية ملزمة.
              </p>
            </div>

            {activeDoc === 'quotation' && (
              <div className="w-48">
                <label htmlFor="template-validity-days" className="block text-xs font-bold text-ink dark:text-ink-dark mb-1">
                  مدة سريان العرض (بالأيام)
                </label>
                <input
                  id="template-validity-days"
                  type="text"
                  value={currentConfig.validityDays}
                  onChange={(e) => updateCurrentConfig({ validityDays: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 text-xs font-mono font-bold text-ink dark:text-ink-dark focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="15"
                />
              </div>
            )}
          </SettingsCard>

          {/* Action & Persistence Bar */}
          <div
            ref={saveBarRef}
            className="sticky bottom-0 z-10 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-md rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <UnsavedChangesChip dirty={isDirty && !saveLoading} />
              {saveSuccess && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-paid dark:text-paid-bright animate-in fade-in">
                  <CheckCircle className="w-4 h-4" />
                  <span>تم حفظ التخصيصات بنجاح</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <AppButton
                type="button"
                variant="subtle"
                size="md"
                onClick={handleResetCurrent}
                disabled={saveLoading}
              >
                استعادة الافتراضي
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="md"
                icon={Printer}
                onClick={handleTestPrint}
              >
                معاينة الطباعة
              </AppButton>
              <AppButton
                type="button"
                variant="primary"
                size="md"
                icon={Save}
                loading={saveLoading}
                disabled={!isDirty}
                onClick={() => void handleSave()}
              >
                حفظ التخصيصات
              </AppButton>
            </div>
          </div>
        </div>

        {/* Live Sticky Preview Column (5 Columns) */}
        <aside className="col-span-12 xl:col-span-5 xl:sticky xl:top-0">
          <SettingsCard
            icon={FileSpreadsheet}
            title="معاينة المستند المباشرة"
            description="محاكاة واقعية لما سيطبع على الورق، تتحدث لحظياً مع كل خيار."
            action={
              <div className="flex items-center gap-2">
                <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark px-2.5 py-1 rounded-lg">
                  {currentConfig.paperWidth === '80mm' ? 'بون 80 مم' : currentConfig.paperWidth === '57mm' ? 'بون 57 مم' : 'ورق A4'}
                </span>
                <div className="flex items-center gap-0.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-0.5 rounded-lg">
                  <button
                    type="button"
                    title="تصغير المعاينة"
                    aria-label="تصغير المعاينة"
                    onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                    className="p-1 hover:bg-surface dark:hover:bg-surface-dark-2 rounded text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-micro font-mono font-bold px-1 text-ink dark:text-ink-dark">{zoomLevel}%</span>
                  <button
                    type="button"
                    title="تكبير المعاينة"
                    aria-label="تكبير المعاينة"
                    onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                    className="p-1 hover:bg-surface dark:hover:bg-surface-dark-2 rounded text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            }
          >
            {/* The Simulation Surface: High-Contrast Real Paper Texture */}
            <div className="flex justify-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4 overflow-x-auto min-h-[30rem]">
              <div
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                }}
                className={`bg-white text-black p-4 shadow-md border border-neutral-300 transition-all ${
                  currentConfig.paperWidth === '57mm'
                    ? 'w-[13.75rem] text-micro'
                    : currentConfig.paperWidth === '80mm'
                    ? 'w-[19rem] text-xs'
                    : 'w-[30rem] text-xs'
                }`}
              >
                {renderCurrentPreview()}
              </div>
            </div>

            <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed m-0">
              الأسماء والأصناف في هذه المعاينة أمثلة استرشادية، ويطبع المستند بيانات الحركات الفعلية عند إجرائها.
            </p>

            {onOpenPrinterSettings && (
              <AppButton variant="secondary" icon={Printer} onClick={onOpenPrinterSettings} className="self-start">
                ضبط طابعة الفواتير وهوامش الورق
              </AppButton>
            )}
          </SettingsCard>
        </aside>
      </div>
    </div>
  );
};
