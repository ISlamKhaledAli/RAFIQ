import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { 
  CheckCircle, 
  Printer, 
  Activity, 
  Store, 
  HardDrive, 
  Barcode, 
  KeyRound, 
  FlaskConical 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useFeatures } from '../context/useFeatures';
import type { SystemInfo } from '../App';
import { BackupManager } from '../components/BackupManager';
import { rafiqAlert } from '../utils/dialogService';
import { BarcodeScannerSettingsModal } from '../components/BarcodeScannerSettingsModal';
import { PinSettingsModal } from '../components/PinSettingsModal';
import { FirstRunWizardModal } from '../components/FirstRunWizardModal';
import { DemoDataModal } from '../components/DemoDataModal';
import { GuidedTourModal } from '../components/GuidedTourModal';
import { SearchBenchmarkModal } from '../components/SearchBenchmarkModal';
import { UserManagerModal } from '../components/UserManagerModal';
import { LicenseModal } from '../components/LicenseModal';

import { StoreProfileTab } from './settings/StoreProfileTab';
import { PrinterSettingsTab } from './settings/PrinterSettingsTab';
import { ScannerSettingsTab } from './settings/ScannerSettingsTab';
import { SystemDiagnosticsTab } from './settings/SystemDiagnosticsTab';
import { SecuritySettingsTab } from './settings/SecuritySettingsTab';
import { DemoDataTab } from './settings/DemoDataTab';

export type SettingsSubTab = 'profile' | 'backup' | 'printer' | 'system' | 'scanner' | 'security' | 'demo';

export interface SettingsViewProps {
  sysInfo?: SystemInfo | null;
  activeSubTab?: SettingsSubTab;
  onSubTabChange?: (tab: SettingsSubTab) => void;
  initialSubTab?: SettingsSubTab;
}

export const SettingsView = ({ 
  sysInfo, 
  activeSubTab = 'profile', 
}: SettingsViewProps) => {
  const { flags, toggleFlag } = useFeatures();
  const subTab = activeSubTab;
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isUserManagerModalOpen, setIsUserManagerModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const [isBenchmarkModalOpen, setIsBenchmarkModalOpen] = useState(false);
  const [pinStatus, setPinStatus] = useState<any>(null);
  const [demoStatus, setDemoStatus] = useState<any>(null);
  const [storeName, setStoreName] = useState('متجر رفيق');
  const [cashierName, setCashierName] = useState('كاشير (1)');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('الفرع الرئيسي');
  const [taxNumber, setTaxNumber] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('أهلاً بكم في متجرنا');
  const [receiptFooter, setReceiptFooter] = useState('شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
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
          if (settings.cashier_name) setCashierName(settings.cashier_name);
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

  // Auto-fetch data on subTab changes
  useEffect(() => {
    let isMounted = true;
    if (subTab === 'security') {
      void invoke('security:getStatus').then((res) => {
        if (isMounted && res) setPinStatus(res);
      }).catch(() => {});
    } else if (subTab === 'demo') {
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
    setSaveLoading(true);
    try {
      const payload: Record<string, string> = {
        store_name: storeName.trim(),
        cashier_name: cashierName.trim(),
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
      void rafiqAlert({
        title: 'فشل حفظ الإعدادات',
        message: `فشل حفظ الإعدادات: ${msg}`,
        variant: 'error',
      });
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
        printer_auto_print: autoPrintOnSale ? '1' : '0',
        printer_open_drawer: openDrawerOnSale ? '1' : '0',
      });
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

  const handleToggleNegativeStock = async (newVal: boolean) => {
    setAllowNegativeStock(newVal);
    try {
      await invoke('settings:save', {
        allow_negative_stock: newVal ? '1' : '0'
      });
    } catch (err) {
      console.error('Failed to auto-save negative stock setting:', err);
    }
  };

  const handleToggleAutoPrint = async (newVal: boolean) => {
    setAutoPrintOnSale(newVal);
    try {
      localStorage.setItem('rafiq_pos_printer_auto_print', newVal ? '1' : '0');
      await invoke('settings:save', {
        printer_auto_print: newVal ? '1' : '0'
      });
    } catch (err) {
      console.error('Failed to auto-save auto-print setting:', err);
    }
  };

  const handleToggleOpenDrawer = async (newVal: boolean) => {
    setOpenDrawerOnSale(newVal);
    try {
      await invoke('settings:save', {
        printer_open_drawer: newVal ? '1' : '0'
      });
    } catch (err) {
      console.error('Failed to auto-save open drawer setting:', err);
    }
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

  const runBenchmarkTest = () => {
    setIsBenchmarkModalOpen(true);
  };

  const SUB_TAB_CONFIG: Record<SettingsSubTab, { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
    profile: {
      title: 'بيانات المحل وتخصيص الفاتورة',
      subtitle: 'اسم المتجر، رقم الهاتف، العنوان، الرقم الضريبي، وترويسة وتذييل إيصال الكاشير',
      icon: Store,
    },
    backup: {
      title: 'النسخ الاحتياطي وحماية البيانات',
      subtitle: 'أخذ نسخة احتياطية محلية، جدول التنبيه الدوري، واستعادة البيانات بأمان',
      icon: HardDrive,
    },
    printer: {
      title: 'إعدادات الطابعة ومقاس الورق',
      subtitle: 'تحديد طابعة الإيصالات الحرارية، مقاس بكرة الورق (80mm/57mm)، والطباعة التلقائية',
      icon: Printer,
    },
    system: {
      title: 'مفاتيح الميزات وفحص النظام',
      subtitle: 'تشخيص الجسر (IPC)، فحص قاعدة البيانات SQLite، وتفعيل الميزات المتقدمة',
      icon: Activity,
    },
    scanner: {
      title: 'قارئ الباركود والماسح الضوئي',
      subtitle: 'فحص استجابة القارئ السلكي أو اللاسلكي وضبط إعدادات الـ Wedge والبادئة واللاحقة',
      icon: Barcode,
    },
    security: {
      title: 'أمان النظام وقفل الشاشات الحساسة',
      subtitle: 'حماية تعديل الأسعار، تقارير الأرباح، تسوية المخزون، واسترجاع الطوارئ بالرمز',
      icon: KeyRound,
    },
    demo: {
      title: 'البيانات التجريبية والتدريب',
      subtitle: 'تجربة البرنامج وتدريب الكاشير ببيانات نموذجية ومسحها ذرياً دون المساس بالبيانات الحقيقية',
      icon: FlaskConical,
    },
  };

  const currentTabConfig = SUB_TAB_CONFIG[subTab] || SUB_TAB_CONFIG.profile;
  const TabIcon = currentTabConfig.icon;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] p-4 gap-3.5 overflow-y-auto select-none">
      {/* 1. Top Header */}
      <div className="h-16 bg-white border border-[#E2E8F0] shadow-xs rounded-2xl px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#006D41] border border-emerald-200/80 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <TabIcon className="w-5 h-5 text-[#006D41]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#52605D]">إعدادات المحل والصيانة</span>
              <span className="text-[#52605D]/40 font-bold">/</span>
              <h2 className="text-sm font-black text-[#0F172A] leading-tight m-0">
                {currentTabConfig.title}
              </h2>
            </div>
            <p className="text-[11px] text-[#52605D] m-0 mt-0.5">
              {currentTabConfig.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLicenseModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#006D41] hover:bg-emerald-100/80 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="إدارة وتفعيل ترخيص رفيق POS"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#006D41]" />
            <span>ترخيص البرنامج</span>
          </button>

          {saved && (
            <div className="flex items-center gap-1.5 text-xs text-[#006D41] font-bold bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-xl animate-in fade-in shadow-2xs">
              <CheckCircle className="w-4 h-4 text-[#006D41]" />
              <span>تم حفظ الإعدادات بنجاح</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Sub-Tab Views */}
      {subTab === 'backup' && <BackupManager />}

      {subTab === 'printer' && (
        <PrinterSettingsTab
          printersList={printersList}
          selectedPrinter={selectedPrinter}
          setSelectedPrinter={setSelectedPrinter}
          paperWidth={paperWidth}
          setPaperWidth={setPaperWidth}
          autoPrintOnSale={autoPrintOnSale}
          setAutoPrintOnSale={setAutoPrintOnSale}
          onToggleAutoPrint={handleToggleAutoPrint}
          openDrawerOnSale={openDrawerOnSale}
          setOpenDrawerOnSale={setOpenDrawerOnSale}
          onToggleOpenDrawer={handleToggleOpenDrawer}
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
          cashierName={cashierName}
          setCashierName={setCashierName}
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
          allowNegativeStock={allowNegativeStock}
          setAllowNegativeStock={setAllowNegativeStock}
          onToggleNegativeStock={handleToggleNegativeStock}
          defaultCustomerCreditLimitEgp={defaultCustomerCreditLimitEgp}
          setDefaultCustomerCreditLimitEgp={setDefaultCustomerCreditLimitEgp}
          saveLoading={saveLoading}
          handleSave={handleSave}
          onOpenWizard={() => setIsWizardOpen(true)}
        />
      )}

      {subTab === 'system' && (
        <SystemDiagnosticsTab
          sysInfo={sysInfo}
          flags={flags}
          toggleFlag={toggleFlag}
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
        />
      )}

      {subTab === 'security' && (
        <SecuritySettingsTab
          pinStatus={pinStatus}
          onOpenPinModal={() => setIsPinModalOpen(true)}
          onOpenUserManagerModal={() => setIsUserManagerModalOpen(true)}
        />
      )}

      {subTab === 'demo' && (
        <DemoDataTab
          demoStatus={demoStatus}
          onOpenTourModal={() => setIsTourModalOpen(true)}
          onOpenDemoModal={() => setIsDemoModalOpen(true)}
        />
      )}

      {/* Modals */}
      <BarcodeScannerSettingsModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
      />

      <PinSettingsModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onStatusChanged={loadPinStatus}
      />

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

      <UserManagerModal
        isOpen={isUserManagerModalOpen}
        onClose={() => setIsUserManagerModalOpen(false)}
      />

      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
      />
    </div>
  );
};
