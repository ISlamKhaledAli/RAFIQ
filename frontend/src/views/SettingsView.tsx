import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { 
  Printer, 
  Activity, 
  Store, 
  HardDrive, 
  Barcode, 
  KeyRound, 
  FlaskConical,
  SlidersHorizontal,
  ClipboardList,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useFeatures } from '../context/useFeatures';
import { useAuth } from '../context/useAuth';
import { getAllowedSettingsSubTabs } from '../utils/settingsAccess';
import type { SystemInfo } from '../App';
import { BackupManager } from '../components/BackupManager';
import { rafiqAlert } from '../utils/dialogService';
import { BarcodeScannerSettingsModal } from '../components/BarcodeScannerSettingsModal';
import { FirstRunWizardModal } from '../components/FirstRunWizardModal';
import { DemoDataModal } from '../components/DemoDataModal';
import { GuidedTourModal } from '../components/GuidedTourModal';
import { SearchBenchmarkModal } from '../components/SearchBenchmarkModal';

import { PinSettingsModal } from '../components/PinSettingsModal';

import { StoreProfileTab } from './settings/StoreProfileTab';
import { StoreFeaturesTab } from './settings/StoreFeaturesTab';
import { SalesPoliciesTab } from './settings/SalesPoliciesTab';
import { PrinterSettingsTab } from './settings/PrinterSettingsTab';
import { DEFAULT_DEVELOPER_SIGNATURE, normalizeReceiptText, receiptTextLimitError, resolveReceiptFooter, resolveReceiptSignature } from '../utils/receiptLayout';
import { invalidateReportPaperCache, normalizeReportPaper, type ReportPaper } from '../utils/printReport';
import { ScannerSettingsTab } from './settings/ScannerSettingsTab';
import { SystemDiagnosticsTab } from './settings/SystemDiagnosticsTab';
import { DemoDataTab } from './settings/DemoDataTab';

export type SettingsSubTab = 'profile' | 'policies' | 'features' | 'backup' | 'printer' | 'system' | 'scanner' | 'security' | 'demo';

export interface SettingsViewProps {
  sysInfo?: SystemInfo | null;
  activeSubTab?: SettingsSubTab;
  onSubTabChange?: (tab: SettingsSubTab) => void;
  initialSubTab?: SettingsSubTab;
  onOpenLicenseModal?: () => void;
}

export const SettingsView = ({ 
  sysInfo, 
  activeSubTab = 'profile', 
  onSubTabChange,
  onOpenLicenseModal, 
}: SettingsViewProps) => {
  const { flags, toggleFlag } = useFeatures();
  const { isRoot, isAdmin, hasPermission } = useAuth();
  const canManageFeatures = isRoot || hasPermission('settings.features');
  const allowedSubTabs = getAllowedSettingsSubTabs({ isRoot, isAdmin, hasPermission });
  const subTab: SettingsSubTab = allowedSubTabs.includes(activeSubTab) ? activeSubTab : (allowedSubTabs[0] || 'profile');
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const [isBenchmarkModalOpen, setIsBenchmarkModalOpen] = useState(false);
  const [demoStatus, setDemoStatus] = useState<any>(null);
  const [storeName, setStoreName] = useState('متجر رفيق');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [showReceiptLogo, setShowReceiptLogo] = useState(true);
  const [showReceiptCashier, setShowReceiptCashier] = useState(true);
  const [storeLogoUrl, setStoreLogoUrl] = useState('/receipt_logo_square.png');
  const [developerSignature, setDeveloperSignature] = useState(DEFAULT_DEVELOPER_SIGNATURE);
  // Root-only receipt signature switches: visible by default, '' = the built-in banner image
  const [developerSignatureVisible, setDeveloperSignatureVisible] = useState(true);
  const [developerSignatureImage, setDeveloperSignatureImage] = useState('');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [requireOpenShiftToSell, setRequireOpenShiftToSell] = useState(true);
  const [defaultCustomerCreditLimitEgp, setDefaultCustomerCreditLimitEgp] = useState(1000);
  const [storeInstapayAddress, setStoreInstapayAddress] = useState('');
  const [storeWalletNumber, setStoreWalletNumber] = useState('');

  // Which screen just saved (drives the "saved" confirmation on that screen only)
  const [savedTab, setSavedTab] = useState<SettingsSubTab | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  // Last saved credit limit and receipt/profile snapshot: the save buttons stay disabled until something really changed
  const [savedCreditLimitEgp, setSavedCreditLimitEgp] = useState(1000);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [profileBaseline, setProfileBaseline] = useState<string | null>(null);
  const profileSnapshot = JSON.stringify([
    storeName.trim(),
    phone.trim(),
    address.trim(),
    taxNumber.trim(),
    normalizeReceiptText(receiptHeader),
    normalizeReceiptText(receiptFooter),
    showReceiptLogo,
    showReceiptCashier,
    storeLogoUrl,
    storeInstapayAddress.trim(),
    storeWalletNumber.trim(),
    isRoot ? normalizeReceiptText(developerSignature) : '',
    isRoot ? developerSignatureVisible : true,
    isRoot ? developerSignatureImage : '',
  ]);
  // Until the stored values are known the screen stays saveable (never blocks a save by mistake)
  const profileDirty = profileBaseline === null || profileSnapshot !== profileBaseline;

  useEffect(() => {
    if (settingsLoaded && profileBaseline === null) setProfileBaseline(profileSnapshot);
  }, [settingsLoaded, profileBaseline, profileSnapshot]);

  // Printer Settings State (Feature #53 / Tasks 53-1, 53-2, 53-3)
  const [printersList, setPrintersList] = useState<{ name: string; isDefault: boolean; isOnline: boolean }[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [paperWidth, setPaperWidth] = useState<'80mm' | '57mm' | 'a4'>('80mm');
  const [reportPaperSize, setReportPaperSize] = useState<ReportPaper>('a4');
  const [autoPrintOnSale, setAutoPrintOnSale] = useState<boolean>(true);
  const [openDrawerOnSale, setOpenDrawerOnSale] = useState<boolean>(false);
  const [drawerPulseMs, setDrawerPulseMs] = useState<string>('30');
  const [drawerPin, setDrawerPin] = useState<string>('0');
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
          if (settings.store_type) {
            try {
              localStorage.setItem('rafiq_store_type', settings.store_type);
            } catch {
              // ignore
            }
          }
          if (settings.store_phone !== undefined) setPhone(settings.store_phone);
          if (settings.store_address !== undefined) setAddress(settings.store_address);
          if (settings.tax_number !== undefined) setTaxNumber(settings.tax_number);
          if (settings.receipt_header !== undefined) setReceiptHeader(settings.receipt_header);
          if (settings.receipt_footer !== undefined) setReceiptFooter(resolveReceiptFooter(settings.receipt_footer));
          if (settings.show_receipt_logo !== undefined) {
            setShowReceiptLogo(settings.show_receipt_logo === '1' || settings.show_receipt_logo === 'true');
          }
          setShowReceiptCashier(settings.receipt_show_cashier !== '0');
          if (settings.store_logo_url) {
            setStoreLogoUrl(
              settings.store_logo_url === '/logo.png' || settings.store_logo_url === '/receipt_logo.png'
                ? '/receipt_logo_square.png'
                : settings.store_logo_url
            );
          }
          if (settings.developer_signature) setDeveloperSignature(resolveReceiptSignature(settings.developer_signature));
          setDeveloperSignatureVisible(settings.developer_signature_visible !== '0');
          setDeveloperSignatureImage(settings.developer_signature_image ?? '');
          if (settings.allow_negative_stock !== undefined) {
            setAllowNegativeStock(settings.allow_negative_stock === '1' || settings.allow_negative_stock === 'true');
          }
          if (settings.require_open_shift_to_sell !== undefined) {
            setRequireOpenShiftToSell(settings.require_open_shift_to_sell === '1' || settings.require_open_shift_to_sell.toLowerCase() === 'true');
          }
          if (settings.default_customer_credit_limit_egp) {
            const lim = Number(settings.default_customer_credit_limit_egp);
            if (!isNaN(lim) && lim >= 0) {
              setDefaultCustomerCreditLimitEgp(lim);
              setSavedCreditLimitEgp(lim);
            }
          }
          if (settings.store_instapay_address) setStoreInstapayAddress(settings.store_instapay_address);
          if (settings.store_wallet_number) setStoreWalletNumber(settings.store_wallet_number);
          if (settings.default_printer_name) setSelectedPrinter(settings.default_printer_name);
          if (settings.receipt_paper_width) setPaperWidth(settings.receipt_paper_width as '80mm' | '57mm' | 'a4');
          if (settings.report_paper_size) setReportPaperSize(normalizeReportPaper(settings.report_paper_size));
          if (settings.printer_auto_print !== undefined) setAutoPrintOnSale(settings.printer_auto_print === '1');
          if (settings.printer_open_drawer !== undefined) setOpenDrawerOnSale(settings.printer_open_drawer === '1');
          if (settings.drawer_pulse_ms) setDrawerPulseMs(settings.drawer_pulse_ms);
          if (settings.drawer_pin) setDrawerPin(settings.drawer_pin);
        }
        setSettingsLoaded(true);
        if (Array.isArray(list)) {
          setPrintersList(list);
          setSelectedPrinter((current) => {
            if (current) return current;
            const def = list.find((p) => p.isDefault);
            return def ? def.name : (list.length > 0 ? list[0].name : '');
          });
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

  // Auto-fetch data on subTab changes
  useEffect(() => {
    let isMounted = true;
    if (subTab === 'demo') {
      void invoke('demo:getStatus').then((res) => {
        if (isMounted && res) setDemoStatus(res);
      }).catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [subTab]);

  // Maintenance & Diagnostics state
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (receiptTextLimitError(receiptHeader) || receiptTextLimitError(receiptFooter) || (isRoot && receiptTextLimitError(developerSignature))) {
      void rafiqAlert({ title: 'نص الوصل طويل', message: 'قصّر نصوص الترحيب أو التذييل أو التوقيع (الحد الأقصى 300 حرف و4 أسطر) ثم احفظ مرة أخرى.', variant: 'error' });
      return;
    }
    setSaveLoading(true);
    try {
      const payload: Record<string, string> = {
        store_name: storeName.trim(),
        store_phone: phone.trim(),
        store_address: address.trim(),
        tax_number: taxNumber.trim(),
        receipt_header: normalizeReceiptText(receiptHeader),
        receipt_footer: normalizeReceiptText(receiptFooter),
        show_receipt_logo: showReceiptLogo ? '1' : '0',
        receipt_show_cashier: showReceiptCashier ? '1' : '0',
        store_logo_url: storeLogoUrl,
        store_instapay_address: storeInstapayAddress.trim(),
        store_wallet_number: storeWalletNumber.trim(),
        ...(isRoot
          ? {
              developer_signature: normalizeReceiptText(developerSignature),
              developer_signature_visible: developerSignatureVisible ? '1' : '0',
              developer_signature_image: developerSignatureImage,
            }
          : {}),
      };
      await invoke('settings:save', payload);
      setProfileBaseline(profileSnapshot);
      setSavedTab('profile');
      setTimeout(() => setSavedTab(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل حفظ الإعدادات',
        message: `فشل حفظ الإعدادات: ${msg}`,
        variant: 'error',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // Sale/stock policies are admin-only on the server (IpcDispatcher settings allow-lists); toggles auto-save, the limit saves here
  const handleSavePolicies = async (e: FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      await invoke('settings:save', {
        allow_negative_stock: allowNegativeStock ? '1' : '0',
        require_open_shift_to_sell: requireOpenShiftToSell ? '1' : '0',
        default_customer_credit_limit_egp: String(defaultCustomerCreditLimitEgp),
      });
      setSavedCreditLimitEgp(defaultCustomerCreditLimitEgp);
      setSavedTab('policies');
      setTimeout(() => setSavedTab(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({ title: 'فشل حفظ السياسات', message: `فشل حفظ سياسات البيع والمخزون: ${msg}`, variant: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSavePrinterSettings = async () => {
    setSaveLoading(true);
    try {
      await invoke('settings:save', {
        default_printer_name: selectedPrinter,
        receipt_paper_width: paperWidth,
        report_paper_size: reportPaperSize,
        printer_auto_print: autoPrintOnSale ? '1' : '0',
        printer_open_drawer: openDrawerOnSale ? '1' : '0',
        drawer_pulse_ms: drawerPulseMs,
        drawer_pin: drawerPin,
      });
      invalidateReportPaperCache();
      setPrinterSaveSuccess(true);
      setTimeout(() => setPrinterSaveSuccess(false), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل حفظ إعدادات الطابعة',
        message: `فشل حفظ إعدادات الطابعة: ${msg}`,
        variant: 'error',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // Toggle auto-saves: on rejection (e.g. no permission) revert the switch and tell the user why
  const autoSaveSetting = async (payload: Record<string, string>, revert: () => void, label: string) => {
    try {
      await invoke('settings:save', payload);
    } catch (err: unknown) {
      revert();
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({ title: 'تعذر حفظ الإعداد', message: `${label}: ${msg}`, variant: 'error' });
    }
  };

  const handleToggleNegativeStock = async (newVal: boolean) => {
    setAllowNegativeStock(newVal);
    await autoSaveSetting({ allow_negative_stock: newVal ? '1' : '0' }, () => setAllowNegativeStock(!newVal), 'السماح بالبيع بالسالب');
  };

  const handleToggleRequireShift = async (newVal: boolean) => {
    setRequireOpenShiftToSell(newVal);
    await autoSaveSetting({ require_open_shift_to_sell: newVal ? '1' : '0' }, () => setRequireOpenShiftToSell(!newVal), 'إلزام فتح وردية قبل البيع');
  };

  const handleToggleAutoPrint = async (newVal: boolean) => {
    setAutoPrintOnSale(newVal);
    localStorage.setItem('rafiq_pos_printer_auto_print', newVal ? '1' : '0');
    await autoSaveSetting({ printer_auto_print: newVal ? '1' : '0' }, () => {
      setAutoPrintOnSale(!newVal);
      localStorage.setItem('rafiq_pos_printer_auto_print', newVal ? '0' : '1');
    }, 'الطباعة التلقائية للفاتورة');
  };

  const handleToggleOpenDrawer = async (newVal: boolean) => {
    setOpenDrawerOnSale(newVal);
    await autoSaveSetting({ printer_open_drawer: newVal ? '1' : '0' }, () => setOpenDrawerOnSale(!newVal), 'فتح الدرج تلقائياً');
  };

  const handleChangeDrawerPulse = async (newVal: string) => {
    const prev = drawerPulseMs;
    setDrawerPulseMs(newVal);
    await autoSaveSetting({ drawer_pulse_ms: newVal }, () => setDrawerPulseMs(prev), 'قوة ونبضة فتح الدرج');
  };

  const handleChangeDrawerPin = async (newVal: string) => {
    const prev = drawerPin;
    setDrawerPin(newVal);
    await autoSaveSetting({ drawer_pin: newVal }, () => setDrawerPin(prev), 'منفذ نبضة فتح الدرج');
  };

  const handleTestPrint = async () => {
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
      setDiagnosticResult(`سرعة استجابة النظام الداخلي: تم الرد في ${latency} مللي ثانية`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagnosticResult(`خطأ في الاتصال الداخلي: ${msg}`);
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

  const runBenchmarkTest = () => {
    setIsBenchmarkModalOpen(true);
  };

  const SUB_TAB_CONFIG: Record<SettingsSubTab, { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
    profile: {
      title: 'بيانات المحل وتفاصيل الفاتورة',
      subtitle: 'اسم المحل وعنوانه وتليفونه ورقمه الضريبي، وشعار الوصل ونصوصه مع معاينة مباشرة',
      icon: Store,
    },
    policies: {
      title: 'سياسات البيع والمخزون',
      subtitle: 'البيع بالسالب، إلزام الوردية، حد الدين للزبائن الجدد، وبيانات صرف أدوية الجدول للصيدليات',
      icon: ClipboardList,
    },
    features: {
      title: 'ميزات ونشاط المحل وتخصيص الواجهات',
      subtitle: 'تفعيل أو تعطيل الأقسام والخدمات والميزات المتقدمة حسب طبيعة ونشاط متجرك الفعلي',
      icon: SlidersHorizontal,
    },
    backup: {
      title: 'النسخ الاحتياطي وحماية البيانات',
      subtitle: 'حفظ نسخة من بيانات المحل على فلاشة أو قرص خارجي، واسترجاعها بأمان بدون إنترنت',
      icon: HardDrive,
    },
    printer: {
      title: 'إعدادات طابعة الفواتير والدرج',
      subtitle: 'اختيار طابعة الكاشير الحرارية، مقاس البكرة (80مم / 57مم)، وفتح درج النقدية تلقائياً',
      icon: Printer,
    },
    system: {
      title: 'فحص سرعة النظام ومفاتيح الميزات',
      subtitle: 'اختبار سرعة الجهاز وقاعدة البيانات وتفعيل ميزات المحل الإضافية',
      icon: Activity,
    },
    scanner: {
      title: 'قارئ الباركود والماسح الضوئي',
      subtitle: 'فحص استجابة قارئ الباركود وضبط سرعة الالتقاط والمسح السريع',
      icon: Barcode,
    },
    security: {
      title: 'أمان النظام وأرقام السر (PIN)',
      subtitle: 'حماية تعديل الأسعار، ومسح الفواتير، وتقارير الأرباح، وحسابات المستخدمين برقم سري',
      icon: KeyRound,
    },
    demo: {
      title: 'بيانات تجريبية وتدريب الكاشير',
      subtitle: 'تجربة برنامج رفيق وتدريب الكاشير ببيانات وهمية جاهزة ومسحها بضغطة زر دون لمس الحسابات الحقيقية',
      icon: FlaskConical,
    },
  };

  const currentTabConfig = SUB_TAB_CONFIG[subTab] || SUB_TAB_CONFIG.profile;
  const TabIcon = currentTabConfig.icon;

  return (
    <div className="flex flex-col h-full bg-canvas dark:bg-canvas-dark p-4 sm:p-5 gap-5 overflow-y-auto select-none">
      {/* 1. Top Header */}
      <div className="min-h-[4.5rem] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-xs rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-bright/20 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <TabIcon className="w-5 h-5 text-paid dark:text-paid-bright" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">إعدادات المحل والنظام</span>
              <span className="text-ink-muted/40 dark:text-ink-muted-dark/40 font-bold">/</span>
              <h2 className="t-page-title text-ink dark:text-ink-dark leading-tight m-0">
                {currentTabConfig.title}
              </h2>
            </div>
            <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 mt-1">
              {currentTabConfig.subtitle}
            </p>
          </div>
        </div>

      </div>

      {/* 2. Sub-Tab Views */}
      {subTab === 'backup' && <BackupManager onOpenLicenseModal={onOpenLicenseModal} />}

      {subTab === 'printer' && (
        <PrinterSettingsTab
          printersList={printersList}
          selectedPrinter={selectedPrinter}
          setSelectedPrinter={setSelectedPrinter}
          paperWidth={paperWidth}
          setPaperWidth={setPaperWidth}
          reportPaperSize={reportPaperSize}
          setReportPaperSize={setReportPaperSize}
          autoPrintOnSale={autoPrintOnSale}
          setAutoPrintOnSale={setAutoPrintOnSale}
          onToggleAutoPrint={handleToggleAutoPrint}
          openDrawerOnSale={openDrawerOnSale}
          setOpenDrawerOnSale={setOpenDrawerOnSale}
          onToggleOpenDrawer={handleToggleOpenDrawer}
          drawerPulseMs={drawerPulseMs}
          setDrawerPulseMs={setDrawerPulseMs}
          onChangeDrawerPulse={handleChangeDrawerPulse}
          drawerPin={drawerPin}
          setDrawerPin={setDrawerPin}
          onChangeDrawerPin={handleChangeDrawerPin}
          printersLoading={printersLoading}
          testPrinting={testPrinting}
          printerSaveSuccess={printerSaveSuccess}
          testPrintMessage={testPrintMessage}
          fetchPrinters={fetchPrinters}
          onTestPrint={handleTestPrint}
          onSavePrinterSettings={handleSavePrinterSettings}
          saveLoading={saveLoading}
        />
      )}

      {subTab === 'scanner' && (
        <ScannerSettingsTab onOpenScannerModal={() => setIsScannerModalOpen(true)} />
      )}

      {subTab === 'profile' && (
        <StoreProfileTab
          storeName={storeName}
          setStoreName={setStoreName}
          phone={phone}
          setPhone={setPhone}
          address={address}
          setAddress={setAddress}
          taxNumber={taxNumber}
          setTaxNumber={setTaxNumber}
          receiptHeader={receiptHeader}
          setReceiptHeader={setReceiptHeader}
          receiptFooter={receiptFooter}
          setReceiptFooter={setReceiptFooter}
          showReceiptLogo={showReceiptLogo}
          setShowReceiptLogo={setShowReceiptLogo}
          showReceiptCashier={showReceiptCashier}
          setShowReceiptCashier={setShowReceiptCashier}
          storeLogoUrl={storeLogoUrl}
          setStoreLogoUrl={setStoreLogoUrl}
          developerSignature={developerSignature}
          setDeveloperSignature={setDeveloperSignature}
          developerSignatureVisible={developerSignatureVisible}
          setDeveloperSignatureVisible={setDeveloperSignatureVisible}
          developerSignatureImage={developerSignatureImage}
          setDeveloperSignatureImage={setDeveloperSignatureImage}
          storeInstapayAddress={storeInstapayAddress}
          setStoreInstapayAddress={setStoreInstapayAddress}
          storeWalletNumber={storeWalletNumber}
          setStoreWalletNumber={setStoreWalletNumber}
          paperWidth={paperWidth}
          isRoot={isRoot}
          dirty={profileDirty}
          saved={savedTab === 'profile'}
          saveLoading={saveLoading}
          handleSave={handleSave}
          onOpenWizard={isRoot ? () => setIsWizardOpen(true) : undefined}
          onOpenPrinterSettings={onSubTabChange && allowedSubTabs.includes('printer') ? () => onSubTabChange('printer') : undefined}
        />
      )}

      {subTab === 'policies' && (
        <SalesPoliciesTab
          allowNegativeStock={allowNegativeStock}
          onToggleNegativeStock={handleToggleNegativeStock}
          requireOpenShiftToSell={requireOpenShiftToSell}
          onToggleRequireOpenShift={handleToggleRequireShift}
          defaultCustomerCreditLimitEgp={defaultCustomerCreditLimitEgp}
          setDefaultCustomerCreditLimitEgp={setDefaultCustomerCreditLimitEgp}
          creditLimitDirty={defaultCustomerCreditLimitEgp !== savedCreditLimitEgp}
          saveLoading={saveLoading}
          saved={savedTab === 'policies'}
          onSave={(e) => void handleSavePolicies(e)}
        />
      )}

      {subTab === 'features' && (
        <StoreFeaturesTab
          flags={flags}
          toggleFlag={toggleFlag}
          canManageFeatures={canManageFeatures}
          onOpenWizard={isRoot ? () => setIsWizardOpen(true) : undefined}
        />
      )}

      {isRoot && subTab === 'system' && (
        <SystemDiagnosticsTab
          sysInfo={sysInfo}
          flags={flags}
          toggleFlag={toggleFlag}
          canManageFeatures={canManageFeatures}
          diagnosticsLoading={diagnosticsLoading}
          diagnosticResult={diagnosticResult}
          setDiagnosticResult={setDiagnosticResult}
          runPrinterTest={runPrinterTest}
          runSqliteTest={runSqliteTest}
          runPingTest={runPingTest}
          runBenchmarkTest={runBenchmarkTest}
          supportLoading={supportLoading}
          supportMessage={supportMessage}
          setSupportMessage={setSupportMessage}
          runCreateSupportBundle={runCreateSupportBundle}
          onOpenWizard={isRoot ? () => setIsWizardOpen(true) : undefined}
        />
      )}

      {isRoot && subTab === 'security' && (
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-5 sm:p-6 flex flex-col gap-5 shadow-xs animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line dark:border-line-dark pb-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-bright/20 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <KeyRound className="w-5 h-5 text-paid dark:text-paid-bright" />
              </div>
              <div className="min-w-0">
                <h3 className="t-card-title text-ink dark:text-ink-dark m-0">حماية الشاشات والعمليات الحساسة بالرقم السري (PIN)</h3>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 mt-1">
                  قفل تعديل الأسعار، ومسح الفواتير، والتقارير المالية، واسترجاع قاعدة البيانات برقم سري مشفر.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPinModalOpen(true)}
              className="h-10 px-5 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
            >
              <KeyRound className="w-4 h-4" />
              <span>إعدادات وتغيير الرقم السري</span>
            </button>
          </div>
          <p className="text-sm text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0">
            يمكنك تفعيل أو تعطيل الحماية واختيار العمليات المحمية وتوليد كود الطوارئ لحماية متجرك من التلاعب غير المصرح به.
          </p>
        </div>
      )}

      {isRoot && subTab === 'demo' && (
        <DemoDataTab
          demoStatus={demoStatus}
          onOpenTourModal={() => setIsTourModalOpen(true)}
          onOpenDemoModal={() => setIsDemoModalOpen(true)}
        />
      )}

      {/* Modals */}
      <PinSettingsModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
      />

      <BarcodeScannerSettingsModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
      />

      <FirstRunWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onCompleted={() => {
          setIsWizardOpen(false);
          void loadDemoStatus();
          window.location.reload();
        }}
      />

      <DemoDataModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        onStartTour={() => setIsTourModalOpen(true)}
        onDataChanged={loadDemoStatus}
      />

      <GuidedTourModal
        isOpen={isTourModalOpen}
        onClose={() => setIsTourModalOpen(false)}
        onLoadDemoData={() => setIsDemoModalOpen(true)}
        hasDemoData={demoStatus?.hasDemoData}
      />

      <SearchBenchmarkModal
        isOpen={isBenchmarkModalOpen}
        onClose={() => setIsBenchmarkModalOpen(false)}
      />

    </div>
  );
};
