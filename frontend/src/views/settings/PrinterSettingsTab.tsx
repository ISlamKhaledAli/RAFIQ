import { useState, useEffect, type RefObject } from 'react';
import { 
  Cpu, 
  Zap, 
  CheckCircle, 
  Save,
  Server,
  Tag,
  Printer,
  ScrollText,
  LayoutGrid,
  UtensilsCrossed,
  Gauge,
  Sliders
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';
import { DRAWER_PULSE_MAX_MS, DRAWER_PULSE_MIN_MS, DRAWER_PULSE_PRESETS, formatDrawerPulse, normalizeDrawerPulse } from '../../utils/drawerPulse';
import { invoke } from '../../bridge/ipc';
import { rafiqAlert } from '../../utils/dialogService';
import { useFeatures } from '../../context/useFeatures';
import { normalizeReportPaper, type ReportPaper } from '../../utils/printReport';
import { UnsavedChangesChip } from '../../components/UnsavedChangesChip';
import { AppButton } from '../../components/AppButton';
import type { PrinterExtras } from './usePrinterExtras';

interface PrinterSettingsTabProps {
  printersList: { name: string; isDefault: boolean; isOnline: boolean }[];
  selectedPrinter: string;
  setSelectedPrinter: (val: string) => void;
  paperWidth: '80mm' | '57mm' | 'a4';
  setPaperWidth: (val: '80mm' | '57mm' | 'a4') => void;
  reportPaperSize: ReportPaper;
  setReportPaperSize: (val: ReportPaper) => void;
  autoPrintOnSale: boolean;
  setAutoPrintOnSale: (val: boolean) => void;
  onToggleAutoPrint?: (val: boolean) => void;
  openDrawerOnSale: boolean;
  setOpenDrawerOnSale: (val: boolean) => void;
  onToggleOpenDrawer?: (val: boolean) => void;
  drawerPulseMs?: string;
  setDrawerPulseMs?: (val: string) => void;
  onChangeDrawerPulse?: (val: string) => void;
  drawerPin?: string;
  setDrawerPin?: (val: string) => void;
  onChangeDrawerPin?: (val: string) => void;
  printersLoading: boolean;
  testPrinting: boolean;
  printerSaveSuccess: boolean;
  testPrintMessage: { text: string; isError: boolean } | null;
  fetchPrinters: () => Promise<void>;
  onTestPrint: () => Promise<void>;
  onSavePrinterSettings: () => Promise<boolean>;
  saveLoading: boolean;
  /** Barcode-label printer and kitchen routing choices, kept by the settings page */
  extras: PrinterExtras;
  /** true when anything on this screen differs from what is saved */
  dirty: boolean;
  /** Goes on the save button's wrapper: the settings page scrolls to it and rings it when the user stays */
  saveBarRef: RefObject<HTMLDivElement | null>;
}

type LabelSizeOption = { value: string; hint: string } & (
  | { kind: 'roll'; w: number; h: number }
  | { kind: 'sheet'; cols: number; rows: number }
);

const LABEL_ROLL_OPTIONS: LabelSizeOption[] = [
  { value: '38x25', kind: 'roll', w: 38, h: 25, hint: 'بكرة صغيرة قياسية: التجزئة والملابس واللعب' },
  { value: '40x30', kind: 'roll', w: 40, h: 30, hint: 'بكرة رول متوسطة' },
  { value: '50x25', kind: 'roll', w: 50, h: 25, hint: 'بكرة عريضة مدمجة' },
  { value: '50x30', kind: 'roll', w: 50, h: 30, hint: 'بكرة عريضة قياسية' },
  { value: '50x40', kind: 'roll', w: 50, h: 40, hint: 'استيكر رف ومخزن كبير' },
];

const LABEL_SHEET_OPTIONS: LabelSizeOption[] = [
  { value: 'a4_24', kind: 'sheet', cols: 3, rows: 8, hint: '3 أعمدة × 8 صفوف في الورقة' },
  { value: 'a4_40', kind: 'sheet', cols: 4, rows: 10, hint: '4 أعمدة × 10 صفوف في الورقة' },
];

/** Outline of one sticker drawn in the same proportions as the real size (roll) or the A4 grid (sheet) */
const LabelSizePreview = ({ option }: { option: LabelSizeOption }) => {
  if (option.kind === 'sheet') {
    const pageW = 31;
    const pageH = 42;
    const gap = 1.2;
    const cellW = (pageW - 4 - gap * (option.cols - 1)) / option.cols;
    const cellH = (pageH - 4 - gap * (option.rows - 1)) / option.rows;
    return (
      <svg viewBox="0 0 56 44" className="w-14 h-11 shrink-0" aria-hidden="true">
        <rect x={(56 - pageW) / 2} y={1} width={pageW} height={pageH} rx={1.5} className="fill-surface dark:fill-surface-dark stroke-current" strokeWidth={1.2} />
        {Array.from({ length: option.rows * option.cols }, (_, i) => (
          <rect
            key={i}
            x={(56 - pageW) / 2 + 2 + (i % option.cols) * (cellW + gap)}
            y={3 + Math.floor(i / option.cols) * (cellH + gap)}
            width={cellW}
            height={cellH}
            rx={0.6}
            className="fill-current opacity-25"
          />
        ))}
      </svg>
    );
  }
  const scale = 0.85;
  const w = option.w * scale;
  const h = option.h * scale;
  const x = (56 - w) / 2;
  const y = (44 - h) / 2;
  return (
    <svg viewBox="0 0 56 44" className="w-14 h-11 shrink-0" aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} rx={2} className="fill-surface dark:fill-surface-dark stroke-current" strokeWidth={1.2} />
      <rect x={x + 3} y={y + 3} width={w * 0.55} height={1.6} rx={0.8} className="fill-current opacity-40" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={x + 3 + i * ((w - 6) / 9)} y={y + h * 0.4} width={i % 3 === 0 ? 1.6 : 0.9} height={h * 0.32} className="fill-current opacity-60" />
      ))}
      <rect x={x + w * 0.5} y={y + h - 4.2} width={w * 0.5 - 3} height={1.6} rx={0.8} className="fill-current opacity-40" />
    </svg>
  );
};

export const PrinterSettingsTab = ({
  printersList,
  selectedPrinter,
  setSelectedPrinter,
  paperWidth,
  setPaperWidth,
  reportPaperSize,
  setReportPaperSize,
  autoPrintOnSale,
  setAutoPrintOnSale,
  onToggleAutoPrint,
  openDrawerOnSale,
  setOpenDrawerOnSale,
  onToggleOpenDrawer,
  drawerPulseMs = '30',
  setDrawerPulseMs,
  onChangeDrawerPulse,
  drawerPin = '0',
  setDrawerPin,
  onChangeDrawerPin,
  printersLoading,
  testPrinting,
  printerSaveSuccess,
  testPrintMessage,
  fetchPrinters,
  onTestPrint,
  onSavePrinterSettings,
  saveLoading,
  extras,
  dirty,
  saveBarRef,
}: PrinterSettingsTabProps) => {
  const { isEnabled } = useFeatures();
  const showKotPrinter = isEnabled('feature_kitchen_printer');
  const {
    labelPrinter,
    setLabelPrinter,
    labelPaperSize,
    setLabelPaperSize,
    kotKitchenPrinter,
    setKotKitchenPrinter,
    kotBarPrinter,
    setKotBarPrinter,
    kotAutoPrintOnSale,
    setKotAutoPrintOnSale,
    kotCategoryRoutes,
    setKotCategoryRoutes,
  } = extras;

  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [labelTestPrinting, setLabelTestPrinting] = useState(false);
  const [labelTestMessage, setLabelTestMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [drawerTesting, setDrawerTesting] = useState(false);
  const [drawerTestMessage, setDrawerTestMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [customPulse, setCustomPulse] = useState<string>(String(normalizeDrawerPulse(drawerPulseMs)));

  // Same order the host uses when a sticker is printed: chosen sticker printer, then the receipt printer, then the Windows default
  const labelPrinterSource = labelPrinter ? 'chosen' : selectedPrinter ? 'receipt' : 'windows';
  const effectiveLabelPrinter = labelPrinter || selectedPrinter || printersList.find((p) => p.isDefault)?.name || '';
  const effectiveLabelPrinterInfo = printersList.find((p) => p.name === effectiveLabelPrinter);
  const labelSizeKnown = [...LABEL_ROLL_OPTIONS, ...LABEL_SHEET_OPTIONS].some((o) => o.value === labelPaperSize);

  useEffect(() => {
    if (drawerPulseMs) {
      setCustomPulse(String(normalizeDrawerPulse(drawerPulseMs)));
    }
  }, [drawerPulseMs]);

  const handleTestLabel = async () => {
    setLabelTestPrinting(true);
    setLabelTestMessage(null);
    try {
      const res = await invoke<{ success: boolean; message: string; printerUsed: string }>('printer:testLabel', {
        printerName: labelPrinter || selectedPrinter,
        paperSize: labelPaperSize,
      });
      if (res && res.success) {
        setLabelTestMessage({ text: `تم إرسال الملصق التجريبي إلى: ${res.printerUsed}`, isError: false });
      } else {
        setLabelTestMessage({ text: res?.message || 'فشلت تجربة طباعة الملصق', isError: true });
      }
    } catch (err: unknown) {
      setLabelTestMessage({ text: err instanceof Error ? err.message : 'فشلت تجربة الطباعة', isError: true });
    } finally {
      setLabelTestPrinting(false);
    }
  };

  const handleTestDrawer = async (pulseOverride?: string) => {
    if (!selectedPrinter) {
      void rafiqAlert({
        title: 'تنبيه',
        message: 'يرجى اختيار طابعة فواتير أولاً لتجربة نبضة فتح الدرج.',
        variant: 'warning',
      });
      return;
    }
    const pulseToUse = normalizeDrawerPulse(pulseOverride || drawerPulseMs);
    const pinToUse = Number(drawerPin || '0');
    setDrawerTesting(true);
    setDrawerTestMessage(null);
    try {
      const res = await invoke<{ success: boolean; message: string; printerUsed: string }>('printer:kickDrawer', {
        printerName: selectedPrinter,
        pulseMs: pulseToUse,
        pin: pinToUse,
      });
      if (res && res.success) {
        setDrawerTestMessage({
          text: res.message || `تم إرسال نبضة فتح الدرج (${pulseToUse} مللي ثانية)`,
          isError: false,
        });
      } else {
        setDrawerTestMessage({
          text: res?.message || 'تعذر فتح درج النقدية. تأكد من توصيل كابل RJ11 بالدرج والطابعة.',
          isError: true,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDrawerTestMessage({ text: `فشل فتح الدرج: ${msg}`, isError: true });
    } finally {
      setDrawerTesting(false);
    }
  };

  return (
    <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-subtle p-5 sm:p-6 flex flex-col gap-6 text-xs text-ink dark:text-ink-dark">
      {/* Top actions (page title and description live in the settings page header) */}
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-4 border-b border-line dark:border-line-dark pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <AppButton
            variant="successSoft"
            icon={Server}
            onClick={() => setIsHardwareModalOpen(true)}
            title="عرض قائمة الطابعات والأجهزة المعتمدة والمجربة مع طريقة إعدادها"
          >
            الأجهزة والطابعات المعتمدة
          </AppButton>

          <AppButton
            variant="secondary"
            icon={Cpu}
            loading={printersLoading}
            onClick={fetchPrinters}
            title="إعادة فحص الطابعات المتصلة بالجهاز"
          >
            تحديث وبحث الطابعات
          </AppButton>

          <AppButton variant="primary" icon={Zap} loading={testPrinting} disabled={!selectedPrinter} onClick={onTestPrint}>
            {testPrinting ? 'جاري إرسال التجربة...' : 'تجربة طباعة وصل'}
          </AppButton>
        </div>
      </div>

      {testPrintMessage && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
          testPrintMessage.isError
            ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright'
            : 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-bright/30 text-paid dark:text-paid-bright'
        }`}>
          {testPrintMessage.isError ? <Zap className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
          <span>{testPrintMessage.text}</span>
        </div>
      )}

      {printerSaveSuccess && (
        <div className="p-3 bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-bright/30 text-paid dark:text-paid-bright rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>تم حفظ إعدادات الطابعة</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-6">
        {/* Left: Printer & Paper Selection */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">طابعة فواتير ووصولات الكاشير</label>
            <CustomSelect
              value={selectedPrinter}
              onChange={(val) => setSelectedPrinter(val)}
              options={
                printersList.length === 0
                  ? [{ value: '', label: 'مافيش طابعات متعرفة على الجهاز (أو جاري الفحص...)' }]
                  : printersList.map((p) => ({
                      value: p.name,
                      label: `${p.name} ${p.isDefault ? '(الافتراضية في الويندوز)' : ''}`
                    }))
              }
              size="lg"
              placeholder="اختار طابعة الفواتير..."
            />
            <p className="text-micro text-ink-muted dark:text-ink-muted-dark mt-1.5 m-0 leading-relaxed">
              رفيق بيدعم كل طابعات الـ USB والشبكة وطابعات الكاشير الحرارية (Xprinter, Rongta, Epson, Bixolon, Sunmi وغيرها) بدون أي تعريفات معقدة.
            </p>
          </div>

          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2.5">مقاس بكرة ورق الفاتورة</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: '80mm', title: '80 مم (حراري عريض)', desc: 'المقاس القياسي لأغلب طابعات الكاشير' },
                { id: '57mm', title: '57 مم (حراري صغير)', desc: 'بكرات الفواتير الصغيرة (طابعات فوري والمحمولة)' },
                { id: 'a4', title: 'طابعة عادية (ليزر / نفث حبر)', desc: 'الوصل يُطبع بعرض 80 مم على الطابعة العادية. لا يغيّر ورق التقارير' },
              ].map((pw) => (
                <div
                  key={pw.id}
                  onClick={() => setPaperWidth(pw.id as '80mm' | '57mm' | 'a4')}
                  className={`p-4 rounded-lg border cursor-pointer flex flex-col gap-1.5 transition-all ${
                    paperWidth === pw.id
                      ? 'bg-brand/10 dark:bg-brand-dark-soft border-brand dark:border-brand-bright text-brand dark:text-brand-bright font-bold shadow-xs'
                      : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark text-ink dark:text-ink-dark'
                  }`}
                >
                  <span className="font-bold text-xs">{pw.title}</span>
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">{pw.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">مقاس ورق التقارير</label>
            <CustomSelect
              value={reportPaperSize}
              onChange={(val) => setReportPaperSize(normalizeReportPaper(val))}
              options={[
                { value: 'a4', label: 'A4 (للتقارير الكاملة)' },
                { value: '80mm', label: '80 مم (طابعة الكاشير)' },
                { value: '58mm', label: '58 مم (طابعة الكاشير الصغيرة)' },
              ]}
              size="lg"
            />
            <p className="text-micro text-ink-muted dark:text-ink-muted-dark mt-1.5 m-0 leading-relaxed">
              A4 هو المناسب للتقارير الكاملة. مقاس 80 أو 58 مم يؤثر فقط على التقارير القصيرة المضغوطة (كشف حساب الزبون، سند القبض، إيصال الخدمات الإلكترونية). التقارير ذات الجداول العريضة تُطبع دائماً على ورق A4.
            </p>
          </div>

          {/* Barcode label printer and sticker size */}
          <div className="p-5 rounded-lg border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex items-start gap-3 flex-1 min-w-[16rem]">
                <div className="w-8 h-8 rounded-md bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold shrink-0">
                  <Tag className="w-4 h-4 text-brand dark:text-brand-bright" />
                </div>
                <div className="min-w-0">
                  <h4 className="t-label text-ink dark:text-ink-dark m-0">طابعة استيكرات الباركود والأسعار</h4>
                  <p className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 mt-1">تحديد طابعة استيكرات البضاعة ومقاس بكرة الباركود</p>
                </div>
              </div>

              <AppButton variant="secondary" icon={Zap} loading={labelTestPrinting} disabled={printersList.length === 0} onClick={handleTestLabel}>
                {labelTestPrinting ? 'جاري إرسال الاستيكر...' : 'طباعة استيكر تجريبي'}
              </AppButton>
            </div>

            {labelTestMessage && (
              <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
                labelTestMessage.isError
                  ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                  : 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-bright/30 text-paid dark:text-paid-bright'
              }`}>
                {labelTestMessage.isError ? <Zap className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
                <span>{labelTestMessage.text}</span>
              </div>
            )}

            <div>
              <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">طابعة استيكرات الباركود</label>
              <CustomSelect
                value={labelPrinter}
                onChange={(val) => setLabelPrinter(val)}
                options={[
                  { value: '', label: 'استخدام طابعة الإيصالات أو طابعة ويندوز الافتراضية' },
                  ...printersList.map((p) => ({
                    value: p.name,
                    label: `${p.name} ${p.isDefault ? '(الافتراضية في ويندوز)' : ''}`,
                  })),
                ]}
                size="lg"
                placeholder="اختر طابعة الباركود (Zebra, Xprinter, TSC...)"
              />
              <div className="mt-2 p-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark flex items-center justify-center shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-ink dark:text-ink-dark truncate">
                    {effectiveLabelPrinter || 'لا توجد طابعة متاحة'}
                  </div>
                  <div className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                    {labelPrinterSource === 'chosen' && 'طابعة الاستيكرات المختارة'}
                    {labelPrinterSource === 'receipt' && 'لم تُحدد طابعة استيكرات، فيُستخدم طابعة الإيصالات'}
                    {labelPrinterSource === 'windows' && (effectiveLabelPrinter ? 'لم تُحدد طابعة، فيُستخدم الافتراضي في ويندوز' : 'اضغط تحديث وبحث الطابعات أعلى الصفحة')}
                  </div>
                </div>
                {effectiveLabelPrinterInfo && (
                  <span className={`px-2 py-0.5 rounded-md border text-micro font-bold whitespace-nowrap ${
                    effectiveLabelPrinterInfo.isOnline
                      ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-bright/30 text-paid dark:text-paid-bright'
                      : 'bg-warn-soft dark:bg-warn-dark-soft border-warn/30 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
                  }`}>
                    {effectiveLabelPrinterInfo.isOnline ? 'متصلة' : 'غير متصلة'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2.5">المقاس الافتراضي لاستيكر الباركود</label>
              <div role="radiogroup" aria-label="المقاس الافتراضي لاستيكر الباركود" className="flex flex-col gap-3">
                {[
                  { id: 'roll', title: 'بكرة رول (استيكر منفصل)', icon: ScrollText, options: LABEL_ROLL_OPTIONS, grid: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2' },
                  { id: 'sheet', title: 'ورق A4 استيكرات (شيت)', icon: LayoutGrid, options: LABEL_SHEET_OPTIONS, grid: 'grid-cols-2' },
                ].map((group) => (
                  <div key={group.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-micro font-bold text-ink-muted dark:text-ink-muted-dark">
                      <group.icon className="w-3.5 h-3.5" />
                      <span>{group.title}</span>
                    </div>
                    <div className={`grid gap-2 ${group.grid}`}>
                      {group.options.map((opt) => {
                        const isSelected = labelPaperSize === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => setLabelPaperSize(opt.value)}
                            className={`relative p-2.5 rounded-lg border text-right flex items-center gap-2.5 transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-brand/10 dark:bg-brand-dark-soft border-brand dark:border-brand-bright text-brand dark:text-brand-bright shadow-2xs ring-1 ring-brand/30'
                                : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-line-hover text-ink-muted dark:text-ink-muted-dark'
                            }`}
                          >
                            <LabelSizePreview option={opt} />
                            <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                              <span className="flex items-center justify-between gap-1">
                                <span className={`text-sm font-black tracking-tight tabular-nums ${isSelected ? '' : 'text-ink dark:text-ink-dark'}`}>
                                  {opt.kind === 'roll' ? (
                                    <><span dir="ltr">{opt.w}×{opt.h}</span> مم</>
                                  ) : (
                                    <>A4 · {opt.cols * opt.rows} استيكر</>
                                  )}
                                </span>
                                {isSelected && <CheckCircle className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />}
                              </span>
                              <span className="text-micro leading-relaxed text-ink-muted dark:text-ink-muted-dark">{opt.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {!labelSizeKnown && (
                <p className="text-micro text-warn dark:text-warn-bright mt-2 m-0 leading-relaxed">
                  المقاس المحفوظ حالياً ({labelPaperSize}) غير ضمن الخيارات أعلاه. اختر أحد المقاسات لاستبداله.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Automation & Drawer Toggles */}
        <div className="flex flex-col gap-5">
          <label className="block text-ink dark:text-ink-dark font-semibold text-xs -mb-2">خيارات وأتمتة الكاشير والدرج</label>
          
          <div 
            onClick={() => {
              const next = !autoPrintOnSale;
              setAutoPrintOnSale(next);
              if (onToggleAutoPrint) onToggleAutoPrint(next);
            }}
            className={`p-4 rounded-lg border cursor-pointer flex items-center justify-between gap-4 transition-all ${
              autoPrintOnSale ? 'bg-brand/5 dark:bg-brand-dark-soft/40 border-brand/40 dark:border-brand-bright/40' : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark'
            }`}
          >
            <div className="flex flex-col gap-1">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">طباعة وصل فورية أول ما البيع يخلص</span>
              <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                إرسال أمر الطباعة تلقائياً أول ما تدوس تأكيد الدفع من غير ما يفتح شاشة معاينة
              </span>
            </div>
            <ToggleSwitch
              checked={autoPrintOnSale}
              onChange={(next) => {
                setAutoPrintOnSale(next);
                if (onToggleAutoPrint) onToggleAutoPrint(next);
              }}
            />
          </div>

          <div 
            onClick={() => {
              const next = !openDrawerOnSale;
              setOpenDrawerOnSale(next);
              if (onToggleOpenDrawer) onToggleOpenDrawer(next);
            }}
            className={`p-4 rounded-lg border cursor-pointer flex items-center justify-between gap-4 transition-all ${
              openDrawerOnSale ? 'bg-brand/5 dark:bg-brand-dark-soft/40 border-brand/40 dark:border-brand-bright/40' : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark'
            }`}
          >
            <div className="flex flex-col gap-1">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">فتح درج النقدية والفلوس تلقائياً مع البيع</span>
              <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                إرسال نبضة فتح الدرج تلقائياً مع كل عملية بيع كاش
              </span>
            </div>
            <ToggleSwitch
              checked={openDrawerOnSale}
              onChange={(next) => {
                setOpenDrawerOnSale(next);
                if (onToggleOpenDrawer) onToggleOpenDrawer(next);
              }}
            />
          </div>

          {/* Cash drawer pulse control and test */}
          <div className="p-5 rounded-lg border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex items-start gap-3 flex-1 min-w-[16rem]">
                <div className="w-8 h-8 rounded-md bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold shrink-0">
                  <Gauge className="w-4 h-4 text-brand dark:text-brand-bright" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink dark:text-ink-dark text-xs">
                      قوة نبضة فتح الدرج
                    </span>
                  </div>
                  <p className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 mt-1">
                    مدة الإشارة الكهربائية التي تفتح الدرج. ابدأ بالافتراضية، وإذا لم يفتح الدرج جرّب الدرجة التالية.
                  </p>
                </div>
              </div>

              <AppButton
                variant="secondary"
                icon={Zap}
                loading={drawerTesting}
                disabled={!selectedPrinter}
                onClick={() => void handleTestDrawer()}
                title="إرسال نبضة فورية لاختبار فتح الدرج بالقوة المحددة حالياً"
              >
                {drawerTesting ? 'جاري الفتح...' : `تجربة النبضة الحالية (${formatDrawerPulse(normalizeDrawerPulse(drawerPulseMs))})`}
              </AppButton>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DRAWER_PULSE_PRESETS.map((opt) => {
                const isSelected = normalizeDrawerPulse(drawerPulseMs) === opt.ms;
                return (
                  <div
                    key={opt.ms}
                    onClick={() => {
                      setDrawerPulseMs?.(String(opt.ms));
                      if (onChangeDrawerPulse) onChangeDrawerPulse(String(opt.ms));
                    }}
                    className={`p-3 rounded-lg border text-right flex flex-col justify-between gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand/10 dark:bg-brand-dark-soft border-brand dark:border-brand-bright text-brand dark:text-brand-bright shadow-2xs ring-1 ring-brand/30'
                        : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-line-hover text-ink dark:text-ink-dark'
                    }`}
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black tracking-tight tabular-nums">{formatDrawerPulse(opt.ms)}</span>
                        {isSelected ? (
                          <CheckCircle className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                        ) : (
                          <span className="text-micro font-bold text-ink-muted dark:text-ink-muted-dark whitespace-nowrap">{opt.label}</span>
                        )}
                      </div>
                      <span className="text-micro text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                        {opt.hint}
                      </span>
                    </div>

                    <AppButton
                      variant="secondary"
                      size="sm"
                      fullWidth
                      icon={Zap}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDrawerPulseMs?.(String(opt.ms));
                        if (onChangeDrawerPulse) onChangeDrawerPulse(String(opt.ms));
                        void handleTestDrawer(String(opt.ms));
                      }}
                      disabled={drawerTesting || !selectedPrinter}
                      className="mt-1"
                      title={`تجربة فتح الدرج بنبضة ${formatDrawerPulse(opt.ms)} فوراً`}
                    >
                      تجربة
                    </AppButton>
                  </div>
                );
              })}
            </div>

            {/* Custom Milliseconds Input + Port Pin Configuration */}
            <div className="grid grid-cols-1 gap-4 pt-4 border-t border-line dark:border-line-dark">
              {/* Custom ms input */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>رقم مخصص بالمللي ثانية (من 2 إلى 250، أرقام زوجية فقط)</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[9rem]">
                    <input
                      type="number"
                      min={DRAWER_PULSE_MIN_MS}
                      max={DRAWER_PULSE_MAX_MS}
                      step={2}
                      value={customPulse}
                      onChange={(e) => setCustomPulse(e.target.value)}
                      placeholder="مثال: 30 أو 40 أو 80"
                      className="w-full h-10 px-3 text-sm rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark font-mono font-bold focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-micro text-ink-muted dark:text-ink-muted-dark font-bold">
                      مللي ثانية
                    </span>
                  </div>
                  <AppButton
                    variant="secondary"
                    icon={Zap}
                    onClick={() => {
                      const safeVal = String(normalizeDrawerPulse(customPulse));
                      setCustomPulse(safeVal);
                      setDrawerPulseMs?.(safeVal);
                      if (onChangeDrawerPulse) onChangeDrawerPulse(safeVal);
                      void handleTestDrawer(safeVal);
                    }}
                    disabled={drawerTesting || !selectedPrinter}
                    title="تجربة الرقم المكتوب فوراً"
                  >
                    تجربة
                  </AppButton>
                  <AppButton
                    variant="soft"
                    onClick={() => {
                      const safeVal = String(normalizeDrawerPulse(customPulse));
                      setCustomPulse(safeVal);
                      setDrawerPulseMs?.(safeVal);
                      if (onChangeDrawerPulse) onChangeDrawerPulse(safeVal);
                    }}
                    title="تثبيت هذا الرقم كنبضة افتراضية"
                  >
                    تثبيت
                  </AppButton>
                </div>
              </div>

              {/* Port Pin Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-ink dark:text-ink-dark flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span>منفذ توصيل كابل الدرج (RJ11 Pin)</span>
                  <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-normal">منفذ 1 هو القياسي لمنع النبض المزدوج</span>
                </label>
                <CustomSelect
                  value={drawerPin || '0'}
                  onChange={(val) => {
                    setDrawerPin?.(val);
                    if (onChangeDrawerPin) onChangeDrawerPin(val);
                  }}
                  options={[
                    { value: '0', label: 'منفذ 1 (Pin 2 - القياسي لمعظم الأدراج وطابعات نقاط البيع)' },
                    { value: '1', label: 'منفذ 2 (Pin 5 - للأدراج المتصلة بالمنفذ الثاني)' },
                    { value: '2', label: 'كلا المنفذين معاً (Pin 2 + Pin 5)' },
                  ]}
                  size="lg"
                />
              </div>
            </div>

            {/* Drawer Test Result Message */}
            {drawerTestMessage && (
              <div className={`p-2.5 rounded-md text-micro font-semibold flex items-center gap-2 border mt-1 ${
                drawerTestMessage.isError
                  ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                  : 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-bright/30 text-paid dark:text-paid-bright'
              }`}>
                {drawerTestMessage.isError ? (
                  <Zap className="w-4 h-4 shrink-0 text-danger dark:text-danger-bright" />
                ) : (
                  <CheckCircle className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
                )}
                <span>{drawerTestMessage.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature #198: Kitchen & Bar KOT Printer Routing */}
      {showKotPrinter && (
        <div className="border-t border-line dark:border-line-dark pt-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold shrink-0">
                <UtensilsCrossed className="w-4 h-4 text-brand dark:text-brand-bright" />
              </div>
              <div>
                <h4 className="t-label text-ink dark:text-ink-dark m-0">توجيه طابعات المطبخ والبار</h4>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 mt-0.5">
                  طباعة بون التحضير للمطبخ والبار بدون أسعار وبخط واضح مع توجيه كل قسم للطابعة المناسبة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-ink dark:text-ink-dark">طباعة تذكرة المطبخ تلقائياً مع الفاتورة:</span>
              <ToggleSwitch checked={kotAutoPrintOnSale} onChange={(next) => setKotAutoPrintOnSale(next)} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">طابعة المطبخ الساخن</label>
              <CustomSelect
                value={kotKitchenPrinter}
                onChange={(val) => setKotKitchenPrinter(val)}
                options={[
                  { value: '', label: 'استخدام طابعة الكاشير الافتراضية' },
                  ...printersList.map((p) => ({
                    value: p.name,
                    label: `${p.name} ${p.isDefault ? '(الافتراضية)' : ''}`,
                  })),
                ]}
                size="lg"
              />
            </div>

            <div>
              <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">طابعة البار والمشروبات</label>
              <CustomSelect
                value={kotBarPrinter}
                onChange={(val) => setKotBarPrinter(val)}
                options={[
                  { value: '', label: 'نفس طابعة المطبخ / الكاشير' },
                  ...printersList.map((p) => ({
                    value: p.name,
                    label: `${p.name} ${p.isDefault ? '(الافتراضية)' : ''}`,
                  })),
                ]}
                size="lg"
              />
            </div>
          </div>

          {kotCategoryRoutes.length > 0 && (
            <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-lg border border-line dark:border-line-dark space-y-3">
              <div className="text-xs font-bold text-ink dark:text-ink-dark">توجيه الأقسام:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {kotCategoryRoutes.map((cat, idx) => (
                  <div key={cat.categoryId} className="p-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-between gap-3">
                    <span className="font-bold text-xs text-ink dark:text-ink-dark truncate">{cat.categoryName}</span>
                    <div className="w-32 shrink-0">
                      <CustomSelect
                        value={cat.kotStation || 'kitchen'}
                        onChange={(st) => {
                          setKotCategoryRoutes((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, kotStation: st } : item))
                          );
                        }}
                        options={[
                          { value: 'kitchen', label: 'المطبخ' },
                          { value: 'bar', label: 'البار' },
                          { value: 'none', label: 'بدون طباعة للمطبخ' },
                        ]}
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={saveBarRef} className="flex flex-col gap-2 rounded-xl">
        <UnsavedChangesChip dirty={dirty} />
        <AppButton variant="primary" size="lg" fullWidth icon={Save} loading={saveLoading} onClick={() => void onSavePrinterSettings()}>
          {saveLoading ? 'جاري الحفظ...' : 'حفظ وتفعيل كافة إعدادات الطابعات والاستيكرات'}
        </AppButton>
      </div>

      <CertifiedHardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        initialCategory="printer"
      />
    </div>
  );
};
