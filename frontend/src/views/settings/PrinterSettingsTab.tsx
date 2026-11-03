import { useState, useEffect } from 'react';
import { 
  Printer, 
  Cpu, 
  Zap, 
  CheckCircle, 
  Save,
  Server,
  Tag,
  UtensilsCrossed,
  Gauge,
  Sliders
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { CertifiedHardwareModal } from '../../components/CertifiedHardwareModal';
import { invoke } from '../../bridge/ipc';
import { rafiqAlert } from '../../utils/dialogService';
import { useFeatures } from '../../context/useFeatures';
import type { KotRoutingConfig, CategoryKotRoute } from '../../types/cafe';

interface PrinterSettingsTabProps {
  printersList: { name: string; isDefault: boolean; isOnline: boolean }[];
  selectedPrinter: string;
  setSelectedPrinter: (val: string) => void;
  paperWidth: '80mm' | '57mm' | 'a4';
  setPaperWidth: (val: '80mm' | '57mm' | 'a4') => void;
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
  onSavePrinterSettings: () => Promise<void>;
  saveLoading: boolean;
}

export const PrinterSettingsTab = ({
  printersList,
  selectedPrinter,
  setSelectedPrinter,
  paperWidth,
  setPaperWidth,
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
}: PrinterSettingsTabProps) => {
  const { isEnabled } = useFeatures();
  const showKotPrinter = isEnabled('feature_kitchen_printer');

  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [labelPrinter, setLabelPrinter] = useState('');
  const [labelPaperSize, setLabelPaperSize] = useState('38x25');
  const [labelTestPrinting, setLabelTestPrinting] = useState(false);
  const [labelTestMessage, setLabelTestMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [drawerTesting, setDrawerTesting] = useState(false);
  const [drawerTestMessage, setDrawerTestMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [customPulse, setCustomPulse] = useState<string>(drawerPulseMs || '30');

  useEffect(() => {
    if (drawerPulseMs) {
      setCustomPulse(drawerPulseMs);
    }
  }, [drawerPulseMs]);

  // KOT Routing State
  const [kotKitchenPrinter, setKotKitchenPrinter] = useState('');
  const [kotBarPrinter, setKotBarPrinter] = useState('');
  const [kotAutoPrintOnSale, setKotAutoPrintOnSale] = useState(true);
  const [kotCategoryRoutes, setKotCategoryRoutes] = useState<CategoryKotRoute[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const s = await invoke<Record<string, string>>('settings:getAll');
        if (s) {
          if (s.default_label_printer_name) setLabelPrinter(s.default_label_printer_name);
          if (s.default_label_paper_size) setLabelPaperSize(s.default_label_paper_size);
        }
      } catch {
        // ignore
      }
      if (showKotPrinter) {
        try {
          const kotCfg = await invoke<KotRoutingConfig>('printer:getKOTRouting', {});
          if (kotCfg) {
            setKotKitchenPrinter(kotCfg.kitchenPrinterName || '');
            setKotBarPrinter(kotCfg.barPrinterName || '');
            setKotAutoPrintOnSale(kotCfg.autoPrintOnSale !== false);
            setKotCategoryRoutes(kotCfg.categoryRoutes || []);
          }
        } catch {
          // ignore
        }
      }
    })();
  }, [showKotPrinter]);

  const handleSaveAll = async () => {
    try {
      await invoke('settings:updateBatch', {
        settings: {
          default_label_printer_name: labelPrinter,
          default_label_paper_size: labelPaperSize,
        },
      });
    } catch (err: unknown) {
      void rafiqAlert({
        title: 'فشل حفظ طابعة الملصقات',
        message: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    }
    if (showKotPrinter) {
      try {
        await invoke('printer:saveKOTRouting', {
          kitchenPrinterName: kotKitchenPrinter,
          barPrinterName: kotBarPrinter,
          paperWidth: paperWidth === '57mm' ? '57mm' : '80mm',
          autoPrintOnSale: kotAutoPrintOnSale,
          singlePrinterCutBetweenStations: true,
          categoryRoutes: kotCategoryRoutes,
        });
      } catch (err: unknown) {
        void rafiqAlert({
          title: 'فشل حفظ توجيه طابعات المطبخ',
          message: err instanceof Error ? err.message : String(err),
          variant: 'error',
        });
      }
    }
    await onSavePrinterSettings();
  };

  const handleTestLabel = async () => {
    setLabelTestPrinting(true);
    setLabelTestMessage(null);
    try {
      const res = await invoke<{ success: boolean; message: string; printerUsed: string }>('printer:testLabel', {
        printerName: labelPrinter || selectedPrinter,
        paperSize: labelPaperSize,
      });
      if (res && res.success) {
        setLabelTestMessage({ text: `تم إرسال الملصق التجريبي بنجاح إلى: ${res.printerUsed}`, isError: false });
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
    const pulseToUse = Number(pulseOverride || drawerPulseMs || '30');
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
          text: res.message || `تم إرسال نبضة فتح درج النقدية بنجاح بقوة (${pulseToUse} مللي ثانية)!`,
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
    <div className="bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark shadow-subtle p-5 flex flex-col gap-5 text-xs text-ink dark:text-ink-dark">
      {/* Top Header Card */}
      <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
            <Printer className="w-5 h-5 text-brand dark:text-brand-bright" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">طابعة فواتير الكاشير ومقاس البكرة</h3>
            <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0">تحديد طابعة الفواتير والوصل الحراري، مقاس البكرة (80مم / 57مم)، والطباعة التلقائية</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHardwareModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-paid-soft dark:bg-paid-dark-soft hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80 border border-paid/30 dark:border-paid-bright/30 text-paid dark:text-paid-bright text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="عرض قائمة الطابعات والأجهزة المعتمدة والمجربة مع طريقة إعدادها"
          >
            <Server className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
            <span>الأجهزة والطابعات المعتمدة</span>
          </button>

          <button
            type="button"
            onClick={fetchPrinters}
            disabled={printersLoading}
            className="px-3 py-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="إعادة فحص الطابعات المتصلة بالجهاز"
          >
            <Cpu className={`w-3.5 h-3.5 ${printersLoading ? 'animate-spin' : ''}`} />
            <span>تحديث وبحث الطابعات</span>
          </button>

          <button
            type="button"
            onClick={onTestPrint}
            disabled={testPrinting || !selectedPrinter}
            className="px-4 py-1.5 rounded-lg bg-brand dark:bg-brand-dark hover:bg-brand-dark dark:hover:bg-brand disabled:bg-surface-2 dark:disabled:bg-surface-dark-2 disabled:text-ink-muted dark:disabled:text-ink-muted-dark text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{testPrinting ? 'جاري إرسال التجربة...' : 'تجربة طباعة وصل (Test Print)'}</span>
          </button>
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
          <span>تم حفظ وتفعيل إعدادات طابعة الفواتير بنجاح!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Printer & Paper Selection */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">طابعة فواتير ووصولات الكاشير</label>
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
            <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark mt-1.5 m-0 leading-relaxed">
              رفيق بيدعم كل طابعات الـ USB والشبكة وطابعات الكاشير الحرارية (Xprinter, Rongta, Epson, Bixolon, Sunmi وغيرها) بدون أي تعريفات معقدة.
            </p>
          </div>

          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-2">مقاس بكرة ورق الفاتورة</label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: '80mm', title: '80 مم (حراري عريض)', desc: 'المقاس القياسي لأغلب طابعات الكاشير' },
                { id: '57mm', title: '57 مم (حراري صغير)', desc: 'بكرات الفواتير الصغيرة (طابعات فوري والمحمولة)' },
                { id: 'a4', title: 'A4 (ورق عادي)', desc: 'ورق طباعة فواتير وتقارير كبيرة A4' },
              ].map((pw) => (
                <div
                  key={pw.id}
                  onClick={() => setPaperWidth(pw.id as '80mm' | '57mm' | 'a4')}
                  className={`p-3 rounded-lg border cursor-pointer flex flex-col gap-1 transition-all ${
                    paperWidth === pw.id
                      ? 'bg-brand/10 dark:bg-brand-dark-soft border-brand dark:border-brand-bright text-brand dark:text-brand-bright font-bold shadow-xs'
                      : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark hover:border-line-hover dark:hover:border-line-dark text-ink dark:text-ink-dark'
                  }`}
                >
                  <span className="font-bold text-xs">{pw.title}</span>
                  <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark leading-tight">{pw.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Automation & Drawer Toggles */}
        <div className="flex flex-col gap-4">
          <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-0.5">خيارات وأتمتة الكاشير والدرج</label>
          
          <div 
            onClick={() => {
              const next = !autoPrintOnSale;
              setAutoPrintOnSale(next);
              if (onToggleAutoPrint) onToggleAutoPrint(next);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              autoPrintOnSale ? 'bg-brand/5 dark:bg-brand-dark-soft/40 border-brand/40 dark:border-brand-bright/40' : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">طباعة وصل فورية أول ما البيع يخلص</span>
              <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
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
            className={`p-3.5 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-all ${
              openDrawerOnSale ? 'bg-brand/5 dark:bg-brand-dark-soft/40 border-brand/40 dark:border-brand-bright/40' : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">فتح درج النقدية والفلوس تلقائياً مع البيع (Cash Drawer)</span>
              <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
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

          {/* Cash Drawer Pulse Duration Control & Test */}
          <div className="p-4 rounded-lg border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
                  <Gauge className="w-4 h-4 text-brand dark:text-brand-bright" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink dark:text-ink-dark text-xs">
                      قوة ومدة نبضة فتح الدرج (Pulse Duration)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20">
                      تبدأ من 2 مللي ثانية (الأهدأ)
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-tight m-0">
                    التحكم الدقيق في زمن الشرارة الكهربائية لملف الدرج (Solenoid)؛ تم تقليل الحد الأدنى وإلغاء كود الرنين القديم تماماً لمنع قفز الدرج وارتداده العنيف.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleTestDrawer()}
                disabled={drawerTesting || !selectedPrinter}
                className="px-3 py-1.5 rounded-lg bg-surface dark:bg-surface-dark hover:bg-white dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                title="إرسال نبضة فورية لاختبار فتح الدرج بالقوة المحددة حالياً"
              >
                <Zap className={'w-3.5 h-3.5 text-brand dark:text-brand-bright ' + (drawerTesting ? 'animate-spin' : '')} />
                <span>{drawerTesting ? 'جاري الفتح...' : `تجربة النبضة الحالية (${drawerPulseMs || '30'} ms)`}</span>
              </button>
            </div>

            {/* Note badge */}
            <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-start gap-2 text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
              <Sliders className="w-4 h-4 text-brand dark:text-brand-bright shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink dark:text-ink-dark font-bold">طريقة التجربة السريعة: </strong>
                اضغط على زر <span className="font-bold text-brand dark:text-brand-bright">[تجربة]</span> في أي كارت أدناه لاختبار النبضة فوراً دون الحاجة لتغيير الشاشة. ابدأ من درجة <strong className="text-brand dark:text-brand-bright">2 ms</strong> أو <strong className="text-brand dark:text-brand-bright">5 ms</strong>؛ إذا فتح الدرج بهدوء فاختره، وإذا لم يفتح انتقل للدرجة التالية تدريجياً.
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1">
              {[
                { id: '2', title: '2 ms', tag: 'الأهدأ إطلاقاً', label: 'أقل نبضة ممكنة', desc: 'للأدراج ذات السوستة القوية؛ تفتح بهدوء وتمنع الارتداد تماماً' },
                { id: '5', title: '5 ms', tag: 'خفيفة جداً', label: 'حساسة وخفيفة', desc: 'للأدراج الخفيفة لمنع الصدمة والصوت العالي' },
                { id: '10', title: '10 ms', tag: 'هادئة', label: 'خفيفة ومعتدلة', desc: 'للأدراج القياسية لفتح هادئ وغير مزعج' },
                { id: '20', title: '20 ms', tag: 'معتدلة', label: 'متوسطة', desc: 'مناسبة لمعظم الأدراج الجديدة' },
                { id: '30', title: '30 ms', tag: 'متوازنة', label: 'الافتراضي القياسي', desc: 'النبضة الشائعة لطابعات الفواتير' },
                { id: '50', title: '50 ms', tag: 'قوية', label: 'سريعة وقوية', desc: 'للأدراج الثقيلة أو المشدودة' },
                { id: '100', title: '100 ms', tag: 'أقصى قوة', label: 'للأدراج الكبيرة', desc: 'للأدراج الكبيرة جداً وممتلئة النقدية' },
              ].map((opt) => {
                const isSelected = (drawerPulseMs || '30') === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      setDrawerPulseMs?.(opt.id);
                      if (onChangeDrawerPulse) onChangeDrawerPulse(opt.id);
                    }}
                    className={`p-2 rounded-lg border text-right flex flex-col justify-between gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand/10 dark:bg-brand-dark-soft border-brand dark:border-brand-bright text-brand dark:text-brand-bright shadow-2xs ring-1 ring-brand/30'
                        : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-line-hover text-ink dark:text-ink-dark'
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black tracking-tight">{opt.title}</span>
                        {isSelected ? (
                          <CheckCircle className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                        ) : (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark">
                            {opt.tag}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-ink dark:text-ink-dark">{opt.label}</span>
                      <span className="text-[9px] text-ink-muted dark:text-ink-muted-dark leading-tight line-clamp-2">
                        {opt.desc}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDrawerPulseMs?.(opt.id);
                        if (onChangeDrawerPulse) onChangeDrawerPulse(opt.id);
                        void handleTestDrawer(opt.id);
                      }}
                      disabled={drawerTesting || !selectedPrinter}
                      className="mt-1 w-full py-1 px-1.5 rounded bg-surface-2 dark:bg-surface-dark-2 hover:bg-white dark:hover:bg-surface-dark border border-line dark:border-line-dark hover:border-brand text-ink dark:text-ink-dark text-[10px] font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                      title={`تجربة فتح الدرج بقوة ${opt.title} فوراً`}
                    >
                      <Zap className="w-2.5 h-2.5 text-brand dark:text-brand-bright" />
                      <span>تجربة</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Custom Milliseconds Input + Port Pin Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-line dark:border-line-dark">
              {/* Custom ms input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>تحديد رقم مخصص بالميللي ثانية (2 - 250 ms)</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={2}
                      max={250}
                      value={customPulse}
                      onChange={(e) => setCustomPulse(e.target.value)}
                      placeholder="مثال: 3 أو 4 أو 8"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark font-mono font-bold focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted dark:text-ink-muted-dark font-bold">
                      ms
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const valNum = parseInt(customPulse, 10);
                      const safeVal = isNaN(valNum) || valNum < 2 ? '2' : (valNum > 250 ? '250' : String(valNum));
                      setCustomPulse(safeVal);
                      setDrawerPulseMs?.(safeVal);
                      if (onChangeDrawerPulse) onChangeDrawerPulse(safeVal);
                      void handleTestDrawer(safeVal);
                    }}
                    disabled={drawerTesting || !selectedPrinter}
                    className="px-3 py-1.5 rounded-lg bg-surface dark:bg-surface-dark hover:bg-white dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                    title="تجربة الرقم المكتوب فوراً"
                  >
                    <Zap className="w-3 h-3 text-brand dark:text-brand-bright" />
                    <span>تجربة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const valNum = parseInt(customPulse, 10);
                      const safeVal = isNaN(valNum) || valNum < 2 ? '2' : (valNum > 250 ? '250' : String(valNum));
                      setCustomPulse(safeVal);
                      setDrawerPulseMs?.(safeVal);
                      if (onChangeDrawerPulse) onChangeDrawerPulse(safeVal);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand/20 border border-brand/30 text-brand dark:text-brand-bright text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                    title="تثبيت هذا الرقم كنبضة افتراضية"
                  >
                    تثبيت
                  </button>
                </div>
              </div>

              {/* Port Pin Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-ink dark:text-ink-dark flex items-center justify-between">
                  <span>منفذ توصيل كابل الدرج (RJ11 Pin)</span>
                  <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark font-normal">منفذ 1 هو القياسي لمنع النبض المزدوج</span>
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
                  size="md"
                />
              </div>
            </div>

            {/* Drawer Test Result Message */}
            {drawerTestMessage && (
              <div className={`p-2.5 rounded-md text-[11px] font-semibold flex items-center gap-2 border mt-1 ${
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

      {/* Feature #57: Barcode Label Printer Settings */}
      <div className="border-t border-line dark:border-line-dark pt-5 mt-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
              <Tag className="w-4 h-4 text-brand dark:text-brand-bright" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink dark:text-ink-dark m-0">طابعة استيكرات الباركود والأسعار</h4>
              <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0">تحديد طابعة استيكرات البضاعة ومقاس بكرة الباركود (Roll & Sheet)</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestLabel}
            disabled={labelTestPrinting || printersList.length === 0}
            className="px-3 py-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 text-brand dark:text-brand-bright ${labelTestPrinting ? 'animate-spin' : ''}`} />
            <span>{labelTestPrinting ? 'جاري إرسال الاستيكر...' : 'طباعة استيكر تجريبي'}</span>
          </button>
        </div>

        {labelTestMessage && (
          <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
            labelTestMessage.isError
              ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright'
              : 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-bright/30 text-paid dark:text-paid-bright'
          }`}>
            <span>{labelTestMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">طابعة استيكرات الباركود</label>
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
              size="md"
              placeholder="اختر طابعة الباركود (Zebra, Xprinter, TSC...)"
            />
          </div>

          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">المقاس الافتراضي لاستيكر الباركود</label>
            <CustomSelect
              value={labelPaperSize}
              onChange={(val) => setLabelPaperSize(val)}
              options={[
                { value: '38x25', label: '38×25 مم (بكرة رول قياسية صغيرة - محلات التجزئة والملابس واللعب)' },
                { value: '40x30', label: '40×30 مم (بكرة رول متوسطة)' },
                { value: '50x25', label: '50×25 مم (بكرة رول عريضة مدمجة)' },
                { value: '50x30', label: '50×30 مم (بكرة رول عريضة قياسية)' },
                { value: '50x40', label: '50×40 مم (استيكر رف ومخزن كبير)' },
                { value: 'a4_24', label: 'ورق A4 استيكرات (24 استيكر بالورقة: 3 أعمدة × 8 صفوف)' },
                { value: 'a4_40', label: 'ورق A4 استيكرات (40 استيكر بالورقة: 4 أعمدة × 10 صفوف)' },
              ]}
              size="md"
              placeholder="اختر مقاس ورق الباركود..."
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saveLoading}
          className="mt-2 h-11 bg-brand dark:bg-brand-dark hover:bg-brand-dark dark:hover:bg-brand text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتفعيل كافة إعدادات الطابعات والاستيكرات'}</span>
        </button>
      </div>

      {/* Feature #198: Kitchen & Bar KOT Printer Routing */}
      {showKotPrinter && (
        <div className="border-t border-line dark:border-line-dark pt-5 mt-1 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
                <UtensilsCrossed className="w-4 h-4 text-brand dark:text-brand-bright" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink dark:text-ink-dark m-0">توجيه طابعات المطبخ والبار (Kitchen & Bar KOT)</h4>
                <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0">
                  طباعة بون التحضير للمطبخ والبار بدون أسعار وبخط واضح مع توجيه كل قسم للطابعة المناسبة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink">طباعة KOT تلقائياً مع الفاتورة:</span>
              <ToggleSwitch checked={kotAutoPrintOnSale} onChange={(next) => setKotAutoPrintOnSale(next)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">طابعة المطبخ الساخن (Kitchen Printer)</label>
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
                size="md"
              />
            </div>

            <div>
              <label className="block text-ink dark:text-ink-dark font-semibold text-xs mb-1.5">طابعة البار والمشروبات (Bar Printer)</label>
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
                size="md"
              />
            </div>
          </div>

          {kotCategoryRoutes.length > 0 && (
            <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-lg border border-line dark:border-line-dark space-y-2">
              <div className="text-xs font-bold text-ink">توجيه الأقسام (Categories Routing):</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {kotCategoryRoutes.map((cat, idx) => (
                  <div key={cat.categoryId} className="p-2 rounded bg-surface border border-line flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-ink truncate">{cat.categoryName}</span>
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
                          { value: 'none', label: 'بدون KOT' },
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

      <CertifiedHardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        initialCategory="printer"
      />
    </div>
  );
};
