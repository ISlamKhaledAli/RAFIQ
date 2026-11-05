import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { 
  Printer, 
  Store, 
  HardDrive, 
  ClipboardList,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useAuth } from '../context/useAuth';
import { DRAWER_PULSE_DEFAULT_MS, normalizeDrawerPulse } from '../utils/drawerPulse';
import { getAllowedSettingsSubTabs, resolveSettingsSubTab } from '../utils/settingsAccess';
import { BackupManager } from '../components/BackupManager';
import { rafiqAlert } from '../utils/dialogService';

import { StoreProfileTab } from './settings/StoreProfileTab';
import { SalesPoliciesTab } from './settings/SalesPoliciesTab';
import { PrinterSettingsTab } from './settings/PrinterSettingsTab';
import { DEFAULT_DEVELOPER_SIGNATURE, normalizeReceiptText, receiptTextLimitError, resolveReceiptFooter, resolveReceiptSignature } from '../utils/receiptLayout';
import { invalidateReportPaperCache, normalizeReportPaper, type ReportPaper } from '../utils/printReport';

/** Owner-facing screens only: everything reserved for the root account lives in the root console (views/root). */
export type SettingsSubTab = 'profile' | 'policies' | 'backup' | 'printer';

export interface SettingsViewProps {
  activeSubTab?: SettingsSubTab;
  onSubTabChange?: (tab: SettingsSubTab) => void;
  initialSubTab?: SettingsSubTab;
  onOpenLicenseModal?: () => void;
}

export const SettingsView = ({ 
  activeSubTab = 'profile', 
  onSubTabChange,
  onOpenLicenseModal, 
}: SettingsViewProps) => {
  const { isRoot, isAdmin, hasPermission } = useAuth();
  const allowedSubTabs = getAllowedSettingsSubTabs({ isRoot, isAdmin, hasPermission });
  const subTab: SettingsSubTab = resolveSettingsSubTab(activeSubTab, allowedSubTabs);
  const [storeName, setStoreName] = useState('متجر رفيق');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [showReceiptLogo, setShowReceiptLogo] = useState(true);
  const [showReceiptCashier, setShowReceiptCashier] = useState(true);
  const [storeLogoUrl, setStoreLogoUrl] = useState('/receipt_logo_square.png');
  // Developer signature: edited on the root console, only read here to draw the receipt preview
  const [developerSignature, setDeveloperSignature] = useState(DEFAULT_DEVELOPER_SIGNATURE);
  const [developerSignatureVisible, setDeveloperSignatureVisible] = useState(true);
  const [developerSignatureImage, setDeveloperSignatureImage] = useState('');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [requireOpenShiftToSell, setRequireOpenShiftToSell] = useState(true);
  const [defaultCustomerCreditLimitEgp, setDefaultCustomerCreditLimitEgp] = useState(1000);

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
  const [drawerPulseMs, setDrawerPulseMs] = useState<string>(String(DRAWER_PULSE_DEFAULT_MS));
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
          if (settings.default_printer_name) setSelectedPrinter(settings.default_printer_name);
          if (settings.receipt_paper_width) setPaperWidth(settings.receipt_paper_width as '80mm' | '57mm' | 'a4');
          if (settings.report_paper_size) setReportPaperSize(normalizeReportPaper(settings.report_paper_size));
          if (settings.printer_auto_print !== undefined) setAutoPrintOnSale(settings.printer_auto_print === '1');
          if (settings.printer_open_drawer !== undefined) setOpenDrawerOnSale(settings.printer_open_drawer === '1');
          if (settings.drawer_pulse_ms) setDrawerPulseMs(String(normalizeDrawerPulse(settings.drawer_pulse_ms)));
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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (receiptTextLimitError(receiptHeader) || receiptTextLimitError(receiptFooter)) {
      void rafiqAlert({ title: 'نص الوصل طويل', message: 'قصّر نصوص الترحيب أو التذييل (الحد الأقصى 300 حرف و4 أسطر) ثم احفظ مرة أخرى.', variant: 'error' });
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
              <span aria-hidden="true" className="text-ink-muted dark:text-ink-muted-dark font-bold">/</span>
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
          developerSignatureVisible={developerSignatureVisible}
          developerSignatureImage={developerSignatureImage}
          paperWidth={paperWidth}
          dirty={profileDirty}
          saved={savedTab === 'profile'}
          saveLoading={saveLoading}
          handleSave={handleSave}
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
    </div>
  );
};
