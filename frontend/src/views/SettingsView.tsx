import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { 
  Settings, 
  Save, 
  CheckCircle, 
  Database, 
  Printer, 
  Cpu, 
  Zap,
  Activity,
  Layers,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Package,
  ShieldCheck,
  Gauge,
  Store,
  HardDrive,
  Barcode,
  KeyRound,
  ShieldAlert,
  Sparkles,
  FlaskConical,
  Compass
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useFeatures } from '../context/useFeatures';
import type { SystemInfo } from '../App';
import { BackupManager } from '../components/BackupManager';
import { BarcodeScannerSettingsModal } from '../components/BarcodeScannerSettingsModal';
import { PinSettingsModal } from '../components/PinSettingsModal';
import { FirstRunWizardModal } from '../components/FirstRunWizardModal';
import { DemoDataModal } from '../components/DemoDataModal';
import { GuidedTourModal } from '../components/GuidedTourModal';

interface SettingsViewProps {
  sysInfo?: SystemInfo | null;
  initialSubTab?: 'profile' | 'backup' | 'printer' | 'system' | 'scanner' | 'security' | 'demo';
}

export const SettingsView = ({ sysInfo, initialSubTab = 'profile' }: SettingsViewProps) => {
  const { flags, toggleFlag } = useFeatures();
  const [subTab, setSubTab] = useState<'profile' | 'backup' | 'printer' | 'system' | 'scanner' | 'security' | 'demo'>(initialSubTab);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const [pinStatus, setPinStatus] = useState<any>(null);
  const [demoStatus, setDemoStatus] = useState<any>(null);
  const [storeName, setStoreName] = useState('سوبرماركت رفيق');
  const [phone, setPhone] = useState('01012345678');
  const [address, setAddress] = useState('فرع أسيوط الرئيسي - ش الجمهورية');
  const [taxNumber, setTaxNumber] = useState('123-456-789');
  const [receiptHeader, setReceiptHeader] = useState('أهلاً بكم في سوبرماركت رفيق');
  const [receiptFooter, setReceiptFooter] = useState('شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.');
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);
  const [defaultCustomerCreditLimitEgp, setDefaultCustomerCreditLimitEgp] = useState(1000);
  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Printer Settings State (Feature #53 / Tasks 53-1, 53-2, 53-3)
  const [printersList, setPrintersList] = useState<{ name: string; isDefault: boolean; isOnline: boolean }[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [paperWidth, setPaperWidth] = useState<'80mm' | '57mm' | 'a4'>('80mm');
  const [autoPrintOnSale, setAutoPrintOnSale] = useState<boolean>(true);
  const [openDrawerOnSale, setOpenDrawerOnSale] = useState<boolean>(false);
  const [printersLoading, setPrintersLoading] = useState<boolean>(false);
  const [testPrinting, setTestPrinting] = useState<boolean>(false);
  const [printerSaveSuccess, setPrinterSaveSuccess] = useState<boolean>(false);
  const [testPrintMessage, setTestPrintMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchPrinters = useCallback(async () => {
    setPrintersLoading(true);
    try {
      const list = await invoke<{ name: string; isDefault: boolean; isOnline: boolean }[]>('printer:list');
      if (Array.isArray(list)) {
        setPrintersList(list);
        setSelectedPrinter((current) => {
          if (current) return current;
          const def = list.find((p) => p.isDefault);
          return def ? def.name : (list.length > 0 ? list[0].name : '');
        });
      }
    } catch (err) {
      console.error('Failed to list printers:', err);
    } finally {
      setPrintersLoading(false);
    }
  }, []);

  // Load saved settings from SQLite DB on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [settings, list] = await Promise.all([
          invoke<Record<string, string>>('settings:getAll'),
          invoke<{ name: string; isDefault: boolean; isOnline: boolean }[]>('printer:list')
        ]);
        if (!active) return;
        if (settings) {
          if (settings.store_name) setStoreName(settings.store_name);
          if (settings.store_phone) setPhone(settings.store_phone);
          if (settings.store_address) setAddress(settings.store_address);
          if (settings.tax_number) setTaxNumber(settings.tax_number);
          if (settings.receipt_header) setReceiptHeader(settings.receipt_header);
          if (settings.receipt_footer) setReceiptFooter(settings.receipt_footer);
          if (settings.allow_negative_stock !== undefined) {
            setAllowNegativeStock(settings.allow_negative_stock === '1' || settings.allow_negative_stock === 'true');
          }
          if (settings.default_customer_credit_limit_egp) {
            const lim = Number(settings.default_customer_credit_limit_egp);
            if (!isNaN(lim) && lim >= 0) setDefaultCustomerCreditLimitEgp(lim);
          }
          if (settings.default_printer_name) setSelectedPrinter(settings.default_printer_name);
          if (settings.receipt_paper_width) setPaperWidth(settings.receipt_paper_width as '80mm' | '57mm' | 'a4');
          if (settings.printer_auto_print !== undefined) setAutoPrintOnSale(settings.printer_auto_print === '1');
          if (settings.printer_open_drawer !== undefined) setOpenDrawerOnSale(settings.printer_open_drawer === '1');
        }
        if (Array.isArray(list)) {
          setPrintersList(list);
          setSelectedPrinter((current) => {
            if (current) return current;
            const def = list.find((p) => p.isDefault);
            return def ? def.name : (list.length > 0 ? list[0].name : '');
          });
        }

        const secRes: any = await invoke('security:getStatus');
        if (active && secRes) {
          setPinStatus(secRes);
        }

        const dRes: any = await invoke('demo:getStatus');
        if (active && dRes) {
          setDemoStatus(dRes);
        }
      } catch (err: unknown) {
        console.error('Failed to load settings or printers from SQLite:', err);
      } finally {
        if (active) setPrintersLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadDemoStatus = useCallback(async () => {
    try {
      const res: any = await invoke('demo:getStatus');
      setDemoStatus(res);
    } catch (err) {
      console.error('Failed to load demo status:', err);
    }
  }, []);

  const loadPinStatus = useCallback(async () => {
    try {
      const res: any = await invoke('security:getStatus');
      setPinStatus(res);
    } catch (err) {
      console.error('Failed to load security status:', err);
    }
  }, []);

  // Maintenance & Diagnostics state
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const payload: Record<string, string> = {
        store_name: storeName.trim(),
        store_phone: phone.trim(),
        store_address: address.trim(),
        tax_number: taxNumber.trim(),
        receipt_header: receiptHeader.trim(),
        receipt_footer: receiptFooter.trim(),
        allow_negative_stock: allowNegativeStock ? '1' : '0',
        default_customer_credit_limit_egp: String(defaultCustomerCreditLimitEgp),
      };
      await invoke('settings:save', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`فشل حفظ الإعدادات: ${msg}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const runSqliteTest = async () => {
    setDiagnosticsLoading(true);
    try {
      const res: any = await invoke('db:testTransaction', { count: 10 });
      setDiagnosticResult(`نجاح المعاملة: ${res.message}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في المعاملة: ${msg}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const runPrinterTest = async () => {
    setDiagnosticsLoading(true);
    try {
      const res: any = await invoke('printer:test');
      setDiagnosticResult(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في الطابعة: ${msg}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const runPingTest = async () => {
    setDiagnosticsLoading(true);
    const start = performance.now();
    try {
      await invoke('system:ping', { timestamp: Date.now() });
      const latency = Math.round(performance.now() - start);
      setDiagnosticResult(`استجابة الجسر (IPC): تم الرد في ${latency} مللي ثانية`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في الجسر: ${msg}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);

  const runCreateSupportBundle = async () => {
    setSupportLoading(true);
    setSupportMessage(null);
    try {
      const res: any = await invoke('support:createBundle');
      if (res && res.success) {
        setSupportMessage(res.message);
      } else {
        setSupportMessage(res?.message || 'تعذر استخراج حزمة الدعم الفني');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSupportMessage(`خطأ في استخراج الحزمة: ${msg}`);
    } finally {
      setSupportLoading(false);
    }
  };

  const runBenchmarkTest = async () => {
    setDiagnosticsLoading(true);
    setDiagnosticResult('جاري تشغيل اختبار الحمل وتوليد 3,000 صنف تجريبي وقياس سرعة SQLite WAL...');
    try {
      const res: any = await invoke('benchmark:run', { productCount: 3000 });
      if (res && res.success) {
        setDiagnosticResult(res.summaryMessage);
      } else {
        setDiagnosticResult(res?.summaryMessage || 'فشل تشغيل اختبار الأداء');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في اختبار الحمل: ${msg}`);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas p-4 gap-3 overflow-y-auto select-none">
      {/* 1. Top Header */}
      <div className="h-[56px] bg-surface hairline-all rounded-[6px] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-ink leading-tight m-0">إعدادات المحل وأدوات النظام</h2>
            <p className="text-[11px] text-ink-muted m-0">تخصيص بيانات الفاتورة، النسخ الاحتياطي، وصيانة الأجهزة</p>
          </div>
        </div>

        {/* Sub-Tabs Selector */}
        <div className="flex items-center gap-1 bg-surface-2 p-1 rounded border border-line">
          <button
            type="button"
            onClick={() => setSubTab('profile')}
            className={`px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors ${
              subTab === 'profile'
                ? 'bg-surface text-brand shadow-xs border border-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>بيانات المحل والفاتورة</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('backup')}
            className={`px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors ${
              subTab === 'backup'
                ? 'bg-surface text-brand shadow-xs border border-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>النسخ الاحتياطي وحماية البيانات</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('printer');
              void fetchPrinters();
            }}
            className={`px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors ${
              subTab === 'printer'
                ? 'bg-surface text-brand shadow-xs border border-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>إعدادات الطابعة والورق (Feature #53)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('system')}
            className={`px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors ${
              subTab === 'system'
                ? 'bg-surface text-brand shadow-xs border border-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>مفاتيح الميزات وفحص النظام</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('scanner')}
            className={`px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors ${
              subTab === 'scanner'
                ? 'bg-surface text-brand shadow-xs border border-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Barcode className="w-3.5 h-3.5" />
            <span>قارئ الباركود (Wedge)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('security');
              void loadPinStatus();
            }}
            className={`px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors ${
              subTab === 'security'
                ? 'bg-surface text-brand shadow-xs border border-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>الرقم السري وأمان الشاشات (Feature #52)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('demo');
              void loadDemoStatus();
            }}
            className={`px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors ${
              subTab === 'demo'
                ? 'bg-surface text-brand shadow-xs border border-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>البيانات التجريبية والتدريب (Feature #113)</span>
            {demoStatus?.hasDemoData && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 text-xs text-paid font-bold bg-paid-soft border border-paid-border px-3 py-1.5 rounded-[4px]">
            <CheckCircle className="w-4 h-4" />
            <span>تم حفظ الإعدادات بنجاح</span>
          </div>
        )}
      </div>

      {/* 2. Sub-Tab Views */}
      {subTab === 'backup' && <BackupManager />}

      {/* Printer & Paper Configuration (Feature #53 / Tasks 53-1, 53-2, 53-3) */}
      {subTab === 'printer' && (
        <div className="bg-surface hairline-all rounded-[6px] p-6 flex flex-col gap-6 text-ink">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-brand-soft text-brand flex items-center justify-center">
                <Printer className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-ink m-0">إعدادات الطابعة الافتراضية ومقاس الورق (Feature #53 & #31)</h3>
                <p className="text-[12px] text-ink-muted m-0">تحديد طابعة الإيصالات الحرارية، مقاس بكرة الورق، والتحكم في الطباعة التلقائية</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchPrinters}
                disabled={printersLoading}
                className="px-3 py-2 rounded bg-surface-2 hover:bg-surface border border-line text-ink text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="إعادة فحص الطابعات المتصلة بالجهاز"
              >
                <Cpu className={`w-3.5 h-3.5 ${printersLoading ? 'animate-spin' : ''}`} />
                <span>تحديث الطابعات</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setTestPrinting(true);
                  setTestPrintMessage(null);
                  try {
                    const res = await invoke<{ success: boolean; message: string; printerUsed: string }>('printer:testPrint', {
                      printerName: selectedPrinter,
                      paperWidth,
                    });
                    if (res && res.success) {
                      setTestPrintMessage({ text: res.message, isError: false });
                    } else {
                      setTestPrintMessage({ text: res?.message || 'فشل أمر الطباعة التجريبية', isError: true });
                    }
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setTestPrintMessage({ text: `خطأ: ${msg}`, isError: true });
                  } finally {
                    setTestPrinting(false);
                  }
                }}
                disabled={testPrinting || !selectedPrinter}
                className="px-4 py-2 rounded bg-brand hover:bg-brand-hover disabled:bg-surface-2 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
              >
                <Zap className="w-4 h-4" />
                <span>{testPrinting ? 'جاري إرسال التجربة...' : 'طباعة صفحة اختبار (Test Print)'}</span>
              </button>
            </div>
          </div>

          {testPrintMessage && (
            <div className={`p-3 rounded text-xs font-semibold flex items-center gap-2 border ${
              testPrintMessage.isError ? 'bg-danger-soft border-danger-border text-danger' : 'bg-paid-soft border-paid-border text-paid'
            }`}>
              {testPrintMessage.isError ? <Zap className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
              <span>{testPrintMessage.text}</span>
            </div>
          )}

          {printerSaveSuccess && (
            <div className="p-3 bg-paid-soft border border-paid-border text-paid rounded text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>تم حفظ وتطبيق إعدادات الطابعة الافتراضية بنجاح!</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Printer & Paper Selection */}
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-ink font-semibold text-xs mb-1.5">الطابعة الافتراضية للفواتير والإيصالات</label>
                <select
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[40px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                >
                  {printersList.length === 0 ? (
                    <option value="">لا توجد طابعات مثبتة في النظام (أو جاري الفحص...)</option>
                  ) : (
                    printersList.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? '(الافتراضية في ويندوز)' : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[11px] text-ink-muted mt-1 m-0">
                  يدعم مشغّل رفيق طابعات USB والشبكة وطابعات الإيصالات الحرارية (Xprinter, Rongta, Epson, Bixolon, Sunmi وغيرها)
                </p>
              </div>

              <div>
                <label className="block text-ink font-semibold text-xs mb-2">مقاس ورق الإيصال (Paper Width)</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: '80mm', title: '80 مم (حراري)', desc: 'الأكثر شيوعاً بالسوبرماركت' },
                    { id: '57mm', title: '57 مم (حراري)', desc: 'بكرات الإيصالات الصغيرة' },
                    { id: 'a4', title: 'A4 (عادي)', desc: 'ورق تقارير وفواتير كاملة' },
                  ].map((pw) => (
                    <div
                      key={pw.id}
                      onClick={() => setPaperWidth(pw.id as '80mm' | '57mm' | 'a4')}
                      className={`p-3 rounded border cursor-pointer flex flex-col gap-1 transition-all ${
                        paperWidth === pw.id
                          ? 'bg-brand-soft/50 border-brand text-brand'
                          : 'bg-surface-2 border-line hover:border-line-hover text-ink'
                      }`}
                    >
                      <span className="font-bold text-[12px]">{pw.title}</span>
                      <span className="text-[10px] text-ink-muted">{pw.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Automation & Drawer Toggles */}
            <div className="flex flex-col gap-4">
              <label className="block text-ink font-semibold text-xs mb-0.5">خيارات التشغيل والأتمتة للكاشير</label>
              
              <div 
                onClick={() => setAutoPrintOnSale(!autoPrintOnSale)}
                className={`p-3.5 rounded border cursor-pointer flex items-center justify-between gap-3 transition-all ${
                  autoPrintOnSale ? 'bg-brand-soft/30 border-brand/40' : 'bg-surface-2 border-line'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-ink text-[12.5px]">طباعة فورية للإيصال عند إتمام البيع</span>
                  <span className="text-[11px] text-ink-muted">
                    إرسال أمر الطباعة تلقائياً للطابعة الافتراضية فور ضغط Enter على تأكيد الدفع دون الحاجة لفتح المعاينة
                  </span>
                </div>
                <button type="button" className="text-brand shrink-0">
                  {autoPrintOnSale ? <ToggleRight className="w-8 h-8 text-brand" /> : <ToggleLeft className="w-8 h-8 text-ink-muted" />}
                </button>
              </div>

              <div 
                onClick={() => setOpenDrawerOnSale(!openDrawerOnSale)}
                className={`p-3.5 rounded border cursor-pointer flex items-center justify-between gap-3 transition-all ${
                  openDrawerOnSale ? 'bg-brand-soft/30 border-brand/40' : 'bg-surface-2 border-line'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-ink text-[12.5px]">فتح درج النقدية الإلكتروني تلقائياً (Cash Drawer)</span>
                  <span className="text-[11px] text-ink-muted">
                    إرسال نبضة فتح الدرج (ESC/POS Pulse) مع كل عملية بيع نقدي
                  </span>
                </div>
                <button type="button" className="text-brand shrink-0">
                  {openDrawerOnSale ? <ToggleRight className="w-8 h-8 text-brand" /> : <ToggleLeft className="w-8 h-8 text-ink-muted" />}
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setSaveLoading(true);
                  try {
                    await invoke('settings:save', {
                      default_printer_name: selectedPrinter,
                      receipt_paper_width: paperWidth,
                      printer_auto_print: autoPrintOnSale ? '1' : '0',
                      printer_open_drawer: openDrawerOnSale ? '1' : '0',
                    });
                    setPrinterSaveSuccess(true);
                    setTimeout(() => setPrinterSaveSuccess(false), 3500);
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    alert(`فشل حفظ إعدادات الطابعة: ${msg}`);
                  } finally {
                    setSaveLoading(false);
                  }
                }}
                disabled={saveLoading}
                className="mt-2 h-[42px] bg-brand hover:bg-brand-hover text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتفعيل إعدادات الطابعة'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === 'scanner' && (
        <div className="bg-surface hairline-all rounded-[6px] p-6 flex flex-col gap-5 text-ink">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-brand-soft text-brand flex items-center justify-center">
                <Barcode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-ink m-0">إعدادات واختبار قارئ الباركود (Feature #131)</h3>
                <p className="text-[12px] text-ink-muted m-0">دعم قراءة الباركود بنسبة 100% مع لوحات المفاتيح العربية، تمييز السرعة، وضبط المعايير</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsScannerModalOpen(true)}
              className="px-4 py-2 rounded bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
            >
              <Zap className="w-4 h-4" />
              <span>فتح شاشة الفحص والتجربة الحية للقارئ</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-2 p-4 rounded border border-line flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <ShieldCheck className="w-4 h-4 text-brand" />
                <span>حماية لوحة المفاتيح العربية</span>
              </div>
              <p className="text-[11px] text-ink-muted m-0">
                مفعّلة دائماً عبر خريطة الأكواد الفيزيائية (DOM Physical Code Mapping). لن تتأثر قراءة الباركود حتى لو نسي الكاشير اللغة على العربية أو تم ضغط CapsLock.
              </p>
            </div>

            <div className="bg-surface-2 p-4 rounded border border-line flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Zap className="w-4 h-4 text-paid" />
                <span>التمييز الزمني الذكي (Timing Wedge)</span>
              </div>
              <p className="text-[11px] text-ink-muted m-0">
                النظام يقيس الفارق الزمني بين النبضات (&lt; 65ms) لتمييز المسح السريع عن الكتابة اليدوية وإضافة الصنف مباشرة للسلة بدون لمس الماوس.
              </p>
            </div>

            <div className="bg-surface-2 p-4 rounded border border-line flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Cpu className="w-4 h-4 text-brand" />
                <span>توافق العتاد (Hardware Compatibility)</span>
              </div>
              <p className="text-[11px] text-ink-muted m-0">
                يدعم كافة قارئات الباركود السلكية واللاسلكية وباركودات الميزان المدمجة ذات الـ 13 رقماً وCode 128 وCode 39.
              </p>
            </div>
          </div>
        </div>
      )}

      {subTab === 'profile' && (
        <div className="grid grid-cols-12 gap-4 flex-1">
          {/* RIGHT COLUMN: Store Profile Form (7 cols) */}
          <div className="col-span-7 flex flex-col gap-4">
            <form onSubmit={handleSave} className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3.5 text-[12px]">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-bold text-ink m-0">بيانات السوبرماركت والفاتورة</h3>
                  <span className="text-[11px] text-ink-muted">تنعكس فوراً على الإيصال المطبوع</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWizardOpen(true)}
                  className="px-2.5 py-1 bg-brand-soft hover:bg-brand/20 text-brand border border-brand/30 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>معالج نوع المحل (Setup Wizard)</span>
                </button>
              </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">اسم المحل *</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">رقم الهاتف *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">العنوان والفرع</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">الرقم الضريبي / السجل</label>
                <input
                  type="text"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-ink font-semibold mb-1">ترويسة الإيصال الحراري (السطر الترحيبي)</label>
              <input
                type="text"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
              />
            </div>

            <div>
              <label className="block text-ink font-semibold mb-1">تذييل الإيصال (سياسة الاستبدال والاسترجاع)</label>
              <textarea
                rows={2}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full bg-surface border border-line rounded p-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-sans resize-none"
              />
            </div>

            {/* Feature #30 / Task 30-2: Negative Stock Policy Setting */}
            <div className="bg-surface-2 p-3.5 rounded border border-line flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-ink text-[12.5px]">السماح بالبيع بالسالب عند نفاد المخزون (Feature #30)</span>
                <span className="text-[11px] text-ink-muted">
                  موصى به في بداية التشغيل. عند تفعيله، يسمح النظام بإتمام البيع حتى لو كان رصيد الصنف صفراً أو غير كافٍ مع إظهار تحذير للكاشير دون تعطيل حركة العمل.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAllowNegativeStock(!allowNegativeStock)}
                className="shrink-0 text-brand"
                title={allowNegativeStock ? 'مفعّل (السماح بالسالب مع تحذير)' : 'معطّل (منع البيع عند عدم كفاية الرصيد)'}
              >
                {allowNegativeStock ? (
                  <ToggleRight className="w-8 h-8 text-brand" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-ink-muted" />
                )}
              </button>
            </div>

            {/* Feature #110 / Task 110-1: Default Customer Credit Limit Setting */}
            <div className="bg-surface-2 p-3.5 rounded border border-line flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-ink text-[12.5px]">حد التنبيه الافتراضي للعملاء الجدد (Feature #110)</span>
                <span className="text-[11px] text-ink-muted">
                  المبلغ الافتراضي بالجنيه لحد مديونية العميل. عند تجاوزه يظهر تحذير واضح وقت البيع الآجل دون منع البيع.
                </span>
              </div>
              <div className="w-32 shrink-0 flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={defaultCustomerCreditLimitEgp}
                  onChange={(e) => setDefaultCustomerCreditLimitEgp(Number(e.target.value) || 0)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-2 text-[13px] text-ink focus:outline-none focus:border-brand font-mono text-center font-bold"
                />
                <span className="text-xs text-ink-muted shrink-0">ج.م</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={saveLoading}
              className="mt-1 h-[40px] bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded text-[13px] font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتطبيق بيانات المتجر في قاعدة البيانات'}</span>
            </button>
          </form>
        </div>

        {/* LEFT COLUMN: Real 80mm Live Thermal Receipt Preview (5 cols, matching folder 80) */}
        <div className="col-span-5 flex flex-col items-center justify-start">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-ink-muted">معاينة الإيصال الحراري الفعلي (80 مم)</span>
            <span className="text-[10px] font-mono bg-surface border border-line px-2 py-0.5 rounded text-ink-muted">
              203 DPI / 96 DPI Display
            </span>
          </div>

          {/* Realistic Receipt Canvas Paper */}
          <div className="w-[310px] bg-white text-black font-mono text-[12px] p-5 shadow-sm border border-line rounded flex flex-col relative select-text">
            {/* Top Zigzag Cut */}
            <div className="w-full h-2 receipt-zigzag mb-2 opacity-30"></div>

            {/* Receipt Header */}
            <div className="text-center flex flex-col gap-0.5">
              <h4 className="text-[16px] font-bold m-0 font-sans">{storeName || 'سوبرماركت رفيق'}</h4>
              <p className="text-[11px] text-gray-700 m-0">{address}</p>
              <p className="text-[11px] text-gray-700 m-0">هاتف: {phone}</p>
              <p className="text-[10px] text-gray-500 m-0">ر.ض: {taxNumber}</p>
              <p className="text-[11px] font-semibold text-gray-800 mt-1 border-t border-b border-dashed border-gray-400 py-1 font-sans">
                {receiptHeader}
              </p>
            </div>

            {/* Meta Row */}
            <div className="flex justify-between text-[10px] text-gray-600 my-2">
              <span>فاتورة: #1042</span>
              <span>2026/09/24 14:35</span>
            </div>

            {/* Table Line Items */}
            <div className="border-t border-dashed border-black pt-1 pb-1 flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between font-bold text-[10px] text-gray-600 pb-0.5">
                <span>الصنف</span>
                <span>الكمية × السعر</span>
                <span>الإجمالي</span>
              </div>
              <div className="flex justify-between">
                <span className="truncate max-w-[130px]">لبن جهينة 1 لتر</span>
                <span>1 × 42.00</span>
                <span className="font-bold">42.00</span>
              </div>
              <div className="flex justify-between">
                <span className="truncate max-w-[130px]">مياه بركة 1.5 لتر</span>
                <span>2 × 8.00</span>
                <span className="font-bold">16.00</span>
              </div>
              <div className="flex justify-between">
                <span className="truncate max-w-[130px]">عيش فينو 5 رغيف</span>
                <span>1 × 10.00</span>
                <span className="font-bold">10.00</span>
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-dashed border-black pt-1.5 flex flex-col gap-1 text-[12px]">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span>68.00 ج.م</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>الخصم:</span>
                <span>0.00 ج.م</span>
              </div>
              <div className="flex justify-between font-bold text-[15px] border-t border-black pt-1 mt-0.5">
                <span>الإجمالي المطلوب:</span>
                <span>68.00 ج.م</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-700">
                <span>المدفوع نقداً:</span>
                <span>70.00 ج.م</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-gray-900">
                <span>الباقي للعميل:</span>
                <span>2.00 ج.م</span>
              </div>
            </div>

            {/* Barcode Simulation */}
            <div className="my-3 flex flex-col items-center">
              <div className="h-9 w-44 bg-black flex items-center justify-center text-white text-[9px] font-mono tracking-widest">
                ||| | |||| | ||| |||| | ||
              </div>
              <span className="text-[9px] text-gray-500 mt-0.5">2026104200068</span>
            </div>

            {/* Receipt Footer */}
            <div className="text-center text-[10px] text-gray-700 border-t border-dashed border-gray-400 pt-1.5 font-sans leading-relaxed">
              {receiptFooter}
            </div>

            {/* Bottom Zigzag Cut */}
            <div className="w-full h-2 receipt-zigzag mt-3 opacity-30"></div>
          </div>
        </div>
      </div>
    )}

    {/* 3. SYSTEM & DIAGNOSTICS TAB */}
    {subTab === 'system' && (
      <div className="flex flex-col gap-4">
        {/* Feature Toggles Section (Feature #105: ملف تعريف المحل ومفاتيح تشغيل الميزات) */}
        <div className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3.5 text-[12px]">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-brand" />
              <h3 className="text-[13px] font-bold text-ink m-0">ملف تعريف المحل ومفاتيح الميزات (Feature Toggles)</h3>
            </div>
            <span className="text-[11px] text-ink-muted font-sans">تخصيص النظام حسب نوع ونشاط المحل</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                key: 'feature_scale_weight',
                title: 'دعم الميزان الإلكتروني وباركود الأوزان',
                description: 'قراءة باركود الأوزان تلقائياً (النوع 20-29) وحساب الوزن الصافي والسعر بالقروش.',
              },
              {
                key: 'feature_credit_debts',
                title: 'نظام البيع الآجل ودفتر ديون العملاء',
                description: 'تسجيل المبيعات على الحساب، ومتابعة كشف الحساب والحد الائتماني لكل عميل.',
              },
              {
                key: 'feature_fast_buttons',
                title: 'شبكة الأصناف السريعة (Fast Picks)',
                description: 'عرض قائمة بالأصناف الشائعة بدون باركود (خبز، خضار، منتجات يومية) على شاشة البيع.',
              },
              {
                key: 'feature_taxes',
                title: 'منظومة الضرائب والجاهزية للإيصال الإلكتروني',
                description: 'حساب ضريبة القيمة المضافة وإظهار حقول كود التصنيف الضريبي GS1/EGS للأصناف.',
              },
              {
                key: 'feature_expiry_dates',
                title: 'تتبع تواريخ الصلاحية وتنبيهات الرواكد',
                description: 'تسجيل تاريخ انتهاء الصلاحية لكل دفعة وتنبيه الكاشير قبل انتهاء صلاحية السلعة.',
              },
              {
                key: 'feature_multi_units',
                title: 'الوحدات المتعددة للأصناف (كرتونة / دستة / قطعة)',
                description: 'دعم بيع الصنف بأكثر من وحدة قياس مع تحويل تلقائي للرصيد وسعر خاص لكل وحدة.',
              },
            ].map((feat) => {
              const isEnabled = flags[feat.key] ?? false;
              return (
                <div
                  key={feat.key}
                  onClick={() => void toggleFlag(feat.key, !isEnabled)}
                  className={`p-3 rounded border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    isEnabled
                      ? 'bg-brand-soft/40 border-brand/30 hover:border-brand'
                      : 'bg-surface-2 border-line hover:border-line-hover opacity-75'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-[12.5px]">{feat.title}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                          isEnabled
                            ? 'bg-paid-soft text-paid border-paid-border'
                            : 'bg-surface text-ink-muted border-line'
                        }`}
                      >
                        {isEnabled ? 'مفعل' : 'معطل'}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
                      {feat.description}
                    </p>
                  </div>

                  <div className="shrink-0 pt-0.5">
                    {isEnabled ? (
                      <ToggleRight className="w-6 h-6 text-brand" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-ink-muted" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Maintenance & System Diagnostics Section */}
        <div className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3.5 text-[12px]">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand" />
              <h3 className="text-[13px] font-bold text-ink m-0">صيانة النظام وفحص الأجهزة</h3>
            </div>
            <span className="text-[11px] font-mono text-paid font-bold">SQLite WAL Active</span>
          </div>

          {/* Diagnostic Message Toast */}
          {diagnosticResult && (
            <div className="p-2.5 rounded bg-surface-2 border border-line text-ink font-mono text-[11px] flex items-center justify-between">
              <span>{diagnosticResult}</span>
              <button 
                onClick={() => setDiagnosticResult(null)}
                className="text-ink-muted hover:text-ink text-xs mr-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => void runPrinterTest()}
              disabled={diagnosticsLoading}
              className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
            >
              <Printer className="w-4 h-4 text-brand" />
              <span>اختبار الطابعة</span>
            </button>

            <button
              type="button"
              onClick={() => void runSqliteTest()}
              disabled={diagnosticsLoading}
              className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
            >
              <Database className="w-4 h-4 text-paid" />
              <span>المعاملة الذرية</span>
            </button>

            <button
              type="button"
              onClick={() => void runPingTest()}
              disabled={diagnosticsLoading}
              className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
            >
              <Zap className="w-4 h-4 text-amber-600" />
              <span>سرعة الجسر (IPC)</span>
            </button>

            <button
              type="button"
              onClick={() => void runBenchmarkTest()}
              disabled={diagnosticsLoading}
              className="h-[44px] bg-surface-2 hover:bg-surface border border-line text-ink rounded font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11.5px]"
            >
              <Gauge className="w-4 h-4 text-blue-600" />
              <span>اختبار الأداء والحمل</span>
            </button>
          </div>

          {/* Technical Specs Strip */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line text-[11px] font-mono text-ink-muted">
            <div className="flex items-center gap-1.5 p-2 rounded bg-surface-2 border border-line">
              <Cpu className="w-3.5 h-3.5 text-brand shrink-0" />
              <span className="truncate">{sysInfo?.osVersion ? sysInfo.osVersion.split(' ')[0] : 'Windows'}</span>
            </div>
            <div className="flex items-center gap-1.5 p-2 rounded bg-surface-2 border border-line">
              <Layers className="w-3.5 h-3.5 text-paid shrink-0" />
              <span className="truncate">{sysInfo?.isWebView2 ? 'Fixed 109' : 'Chrome/Edge'}</span>
            </div>
            <div className="flex items-center gap-1.5 p-2 rounded bg-surface-2 border border-line">
              <Database className="w-3.5 h-3.5 text-brand shrink-0" />
              <span className="truncate">Integer Piasters</span>
            </div>
          </div>

          {/* Support Bundle Section (Feature #111) */}
          <div className="mt-2 p-3 rounded bg-surface-2 hairline-all flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-brand" />
                <span className="font-bold text-ink text-[12px]">حزمة معلومات الدعم الفني وسجل الأخطاء</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-paid font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>محمية: خالية تماماً من بيانات العملاء</span>
              </div>
            </div>

            <p className="text-[11px] text-ink-muted leading-relaxed m-0 font-sans">
              عند مواجهة أي استفسار أو مشكلة تقنية، انقر على الزر لتوليد ملف مضغوط آمن على سطح المكتب يحتوي على سجل الأخطاء الفنية ومواصفات النظام لإرساله لفريق الدعم.
            </p>

            {supportMessage && (
              <div className="p-2.5 rounded bg-brand-soft border border-brand/30 text-ink text-[11px] flex items-center justify-between whitespace-pre-line">
                <span>{supportMessage}</span>
                <button
                  onClick={() => setSupportMessage(null)}
                  className="text-ink-muted hover:text-ink text-xs mr-2"
                >
                  ✕
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => void runCreateSupportBundle()}
              disabled={supportLoading}
              className="h-[38px] bg-brand hover:bg-brand-hover text-white rounded font-bold flex items-center justify-center gap-2 transition-colors text-[12px]"
            >
              <Package className="w-4 h-4" />
              <span>{supportLoading ? 'جاري تجهيز حزمة الدعم...' : 'جمع معلومات للدعم الفني (Support Bundle)'}</span>
            </button>
          </div>
        </div>
      </div>
    )}

      {/* 5. Security & Sensitive Screens PIN Protection (Feature #52 / Tasks 52-1, 52-2, 52-3, 52-4) */}
      {subTab === 'security' && (
        <div className="bg-surface hairline-all rounded-[6px] p-6 flex flex-col gap-6 text-ink">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded bg-brand-soft border border-brand/30 flex items-center justify-center text-brand">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-[14px] text-ink m-0">أمان النظام وقفل الشاشات الحساسة (Feature #52)</h3>
                <p className="text-[11px] text-ink-muted m-0">حماية تعديل الأسعار، تقارير الأرباح، تسوية المخزون، وتصفير قاعدة البيانات برقم سري</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPinModalOpen(true)}
              className="h-[34px] px-4 bg-brand hover:bg-brand-hover text-white rounded font-bold text-xs flex items-center gap-2 transition-colors shadow-xs"
            >
              <KeyRound className="w-4 h-4" />
              <span>{pinStatus?.isPinSet ? 'إدارة وتغيير الرقم السري' : 'تعيين رقم سري جديد'}</span>
            </button>
          </div>

          {/* Status Overview Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-muted font-bold">حالة الحماية:</span>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${pinStatus?.isPinSet ? (pinStatus?.isEnabled ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-400'}`} />
                <span className="text-xs font-bold text-ink">
                  {!pinStatus?.isPinSet ? 'غير منشأ' : (pinStatus?.isEnabled ? 'مفعل ونشط' : 'معطل مؤقتاً')}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-muted font-bold">خوارزمية التشفير (Task 52-1):</span>
              <span className="text-xs font-mono font-bold text-emerald-700">PBKDF2 Salted Hash (10,000 دورة)</span>
            </div>

            <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-muted font-bold">الحماية من التخمين (Brute-Force):</span>
              <span className="text-xs font-bold text-brand">قفل تصاعدي (30 ثانية - 5 دقائق)</span>
            </div>
          </div>

          {/* Protected Actions Preview */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-brand" />
              <span>العمليات المحمية حالياً بالرقم السري:</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {[
                { key: 'settings', label: 'شاشة الإعدادات العامة وقاعدة البيانات' },
                { key: 'reports', label: 'شاشة التقارير والأرباح المالية' },
                { key: 'product_edit', label: 'تعديل أسعار المنتجات وحذفها' },
                { key: 'stock_adjust', label: 'التسوية اليدوية للمخزون' },
                { key: 'db_recovery', label: 'استعادة وتصفير قاعدة البيانات' },
                { key: 'discounts', label: 'تطبيق الخصم اليدوي في الفاتورة' },
              ].map((item) => {
                const isItemProtected = pinStatus?.isPinSet && pinStatus?.isEnabled && pinStatus?.protectedActions?.[item.key];
                return (
                  <div key={item.key} className="p-2.5 rounded bg-surface-2 border border-line flex items-center justify-between">
                    <span className="text-ink">{item.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isItemProtected ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                      {isItemProtected ? 'محمي بالرقم السري' : 'متاح دون طلب رقم'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Emergency Recovery & Offline Supermarket Notes */}
          <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>ميزة استرجاع الطوارئ بدون فقدان بيانات (Task 52-4):</span>
            </div>
            <p className="text-amber-800 dark:text-amber-300 leading-relaxed m-0 text-[11.5px]">
              عند إنشاء الرقم السري أو تغييره، يولد النظام تلقائياً «رمز استرجاع طوارئ» فريداً يظهر لك مرة واحدة. في حال نسيان الكاشير أو صاحب المحل للرقم السري، يمكن الضغط على «نسيت الرقم السري» في نافذة الإدخال واستخدام رمز الطوارئ لإعادة التعيين فوراً دون الحاجة لاتصال بالإنترنت ودون إتلاف قاعدة البيانات.
            </p>
          </div>
        </div>
      )}

      {/* Subtab: Demo Data & Training (Feature #113 / Tasks 113-1, 113-2, 113-3, 113-4) */}
      {subTab === 'demo' && (
        <div className="flex flex-col gap-6 animate-fadeIn">
          {/* Header & Quick Actions */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-surface border border-line">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 flex items-center justify-center text-lg">
                <FlaskConical className="w-5 h-5 text-[#006d41]" />
              </div>
              <div>
                <h3 className="font-bold text-[14px] text-ink m-0">البيانات التجريبية وجولة النظام (Feature #113)</h3>
                <p className="text-[11px] text-ink-muted m-0">
                  تجربة البرنامج وتدريب الكاشير ببيانات نموذجية واضحة العلامة تُمسح بضغطة زر دون المساس ببيانات المحل الحقيقية
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsTourModalOpen(true)}
                className="h-[34px] px-3.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-[#006d41] border border-emerald-300 dark:border-emerald-800 rounded font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Compass className="w-4 h-4" />
                <span>بدء الجولة التعريفية (5 خطوات)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDemoModalOpen(true)}
                className="h-[34px] px-4 bg-brand hover:bg-brand-hover text-white rounded font-bold text-xs flex items-center gap-2 transition-colors shadow-xs"
              >
                <FlaskConical className="w-4 h-4" />
                <span>{demoStatus?.hasDemoData ? 'إدارة ومسح البيانات التجريبية' : 'تحميل بيانات تجريبية'}</span>
              </button>
            </div>
          </div>

          {/* Status Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-muted font-bold">حالة البيانات التجريبية:</span>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${demoStatus?.hasDemoData ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-xs font-bold text-ink">
                  {demoStatus?.hasDemoData ? 'نشطة في النظام (للتدريب)' : 'غير محملة'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-muted font-bold">الأصناف التجريبية المحملة:</span>
              <span className="text-xs font-bold text-ink">
                {demoStatus?.demoProductsCount || 0} منتج تجريبي
              </span>
            </div>

            <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-muted font-bold">الفواتير والعملاء التجريبيين:</span>
              <span className="text-xs font-bold text-ink">
                {demoStatus?.demoSalesCount || 0} فواتير | {demoStatus?.demoCustomersCount || 0} عملاء
              </span>
            </div>
          </div>

          {/* Isolation & Safety Invariant (Task 113-2 & 113-5) */}
          <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-emerald-900 dark:text-emerald-200 text-sm block">
                ضمان الأمان والعزل الكامل (Data Isolation Invariant):
              </span>
              <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed m-0">
                جميع الكيانات التجريبية تُميّز بمعرف خاص يبدأ بـ <code className="font-mono bg-emerald-200/60 dark:bg-emerald-900/60 px-1 py-0.5 rounded text-emerald-900 font-bold">demo_</code>.
                عند طلب مسح البيانات التجريبية، ينفذ النظام مسحاً ذرياً محصوراً في تلك السجلات فقط، وتبقى كافة فواتير وأصناف المحل الحقيقية سليمة ومحفوظة بنسبة 100%.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal (Feature #131) */}
      <BarcodeScannerSettingsModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
      />

      {/* PIN Settings Modal (Feature #52) */}
      <PinSettingsModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onStatusChanged={loadPinStatus}
      />

      {/* First Run Store Setup Wizard (Feature #106 / Task 106-4) */}
      <FirstRunWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onCompleted={() => {
          setIsWizardOpen(false);
          void loadPinStatus();
          void loadDemoStatus();
          window.location.reload();
        }}
      />

      {/* Demo Data Management Modal (Feature #113 / Task 113-3) */}
      <DemoDataModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        onStartTour={() => setIsTourModalOpen(true)}
        onDataChanged={loadDemoStatus}
      />

      {/* Guided Tour Modal (Feature #113 / Task 113-4) */}
      <GuidedTourModal
        isOpen={isTourModalOpen}
        onClose={() => setIsTourModalOpen(false)}
        onLoadDemoData={() => setIsDemoModalOpen(true)}
        hasDemoData={demoStatus?.hasDemoData}
      />
    </div>
  );
};
