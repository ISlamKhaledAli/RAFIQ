import React, { useState, useEffect } from 'react';
import { 
  Store, 
  ShoppingCart, 
  Milk, 
  Printer, 
  HardDrive, 
  ArrowLeft, 
  ArrowRight, 
  Loader2, 
  ShieldCheck, 
  X,
  Smartphone,
  Apple,
  BookOpen,
  Flame,
  Shirt,
  Check,
  Info,
  Pill,
  Coffee,
  Upload,
  Download,
  RotateCcw,
  Image as ImageIcon,
  KeyRound
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { ToggleSwitch } from './ToggleSwitch';
import { rafiqAlert } from '../utils/dialogService';
import { processUploadedLogo } from '../utils/thermalImageOptimizer';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { INITIAL_STORE_TEMPLATES, type StoreTemplateDto } from '../constants/storeTemplates';
import { ExcelImportModal } from './ExcelImportModal';
import { downloadExcelTemplate } from '../utils/excelImport';
import type { Product, Category } from '../types/models';
export type { StoreTemplateDto };

export interface FirstRunWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
  isFirstRun?: boolean;
}

export const FirstRunWizardModal: React.FC<FirstRunWizardModalProps> = ({
  isOpen,
  onClose,
  onCompleted,
  isFirstRun = false,
}) => {
  const WIZARD_STORAGE_KEY = 'rafiq_wizard_state';

  // Read saved state if available
  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.step && [1, 2, 3, 4].includes(parsed.step)) return parsed.step;
      }
    } catch {
      // ignore
    }
    return 1;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !isFirstRun && !loading,
    onDismiss: onClose,
    isDirty: false,
  });

  // Templates
  const [templates, setTemplates] = useState<StoreTemplateDto[]>(INITIAL_STORE_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.selectedTemplateId) return parsed.selectedTemplateId;
      }
    } catch {
      // ignore
    }
    return 'supermarket';
  });

  // Step 2: Store Profile
  const [storeName, setStoreName] = useState(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.storeName) return parsed.storeName;
      }
    } catch {
      // ignore
    }
    return 'متجر رفيق';
  });
  const [phone, setPhone] = useState(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.phone) return parsed.phone;
      }
    } catch {
      // ignore
    }
    return '01012345678';
  });
  const [address, setAddress] = useState(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.address) return parsed.address;
      }
    } catch {
      // ignore
    }
    return 'الشارع الرئيسي - وسط البلد';
  });
  const [receiptHeader, setReceiptHeader] = useState(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.receiptHeader) return parsed.receiptHeader;
      }
    } catch {
      // ignore
    }
    return 'أهلاً بكم في متجرنا';
  });
  const [receiptFooter, setReceiptFooter] = useState(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.receiptFooter) return parsed.receiptFooter;
      }
    } catch {
      // ignore
    }
    return 'شكراً لزيارتكم — الاستبدال خلال 3 أيام بالإيصال';
  });

  const [showReceiptLogo, setShowReceiptLogo] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.showReceiptLogo !== undefined) return Boolean(parsed.showReceiptLogo);
      }
    } catch {
      // ignore
    }
    return true;
  });

  const [storeLogoUrl, setStoreLogoUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.storeLogoUrl) {
          return parsed.storeLogoUrl === '/logo.png' || parsed.storeLogoUrl === '/receipt_logo.png'
            ? '/receipt_logo_square.png'
            : parsed.storeLogoUrl;
        }
      }
    } catch {
      // ignore
    }
    return '/receipt_logo_square.png';
  });
  const [isLogoOptimizing, setIsLogoOptimizing] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      void rafiqAlert({
        title: 'صيغة غير مدعومة',
        message: 'يرجى اختيار ملف صورة صالح (PNG أو JPG أو WEBP).',
        variant: 'warning',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      void rafiqAlert({
        title: 'حجم الصورة كبير',
        message: 'حجم ملف الشعار يتجاوز 5 ميجابايت. يرجى اختيار صورة أصغر حجماً لتفادي بطء الطباعة.',
        variant: 'warning',
      });
      return;
    }

    setIsLogoOptimizing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        try {
          const processed = await processUploadedLogo(reader.result, 240);
          setStoreLogoUrl(processed);
        } catch {
          setStoreLogoUrl(reader.result);
        } finally {
          setIsLogoOptimizing(false);
        }
      } else {
        setIsLogoOptimizing(false);
      }
    };
    reader.onerror = () => {
      setIsLogoOptimizing(false);
      void rafiqAlert({
        title: 'فشل قراءة الملف',
        message: 'تعذر قراءة ملف الصورة المختارة. يرجى إعادة المحاولة.',
        variant: 'error',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    setStoreLogoUrl('/receipt_logo_square.png');
  };

  // Step 3: Hardware & Backup
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.selectedPrinter) return parsed.selectedPrinter;
      }
    } catch {
      // ignore
    }
    return '';
  });
  const [backupFolder, setBackupFolder] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.backupFolder) return parsed.backupFolder;
      }
    } catch {
      // ignore
    }
    return 'D:\\RafiqBackups';
  });

  // Sync to localStorage
  useEffect(() => {
    try {
      const data = {
        step,
        selectedTemplateId,
        storeName,
        phone,
        address,
        receiptHeader,
        receiptFooter,
        showReceiptLogo,
        storeLogoUrl,
        selectedPrinter,
        backupFolder,
      };
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [step, selectedTemplateId, storeName, phone, address, receiptHeader, receiptFooter, showReceiptLogo, storeLogoUrl, selectedPrinter, backupFolder]);

  // Excel Import on Step 4
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [existingCategories, setExistingCategories] = useState<Category[]>([]);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const refreshCatalogStats = async () => {
    try {
      const [prods, cats] = await Promise.all([
        invoke<Product[]>('products:getAll', { limit: 10000 }).catch(() => []),
        invoke<Category[]>('categories:getAll', { includeArchived: false }).catch(() => []),
      ]);
      if (Array.isArray(prods)) setExistingProducts(prods);
      if (Array.isArray(cats)) setExistingCategories(cats);
    } catch (err: unknown) {
      console.error('Failed to load existing catalog stats:', err);
    }
  };

  useEffect(() => {
    if (isOpen && step === 4) {
      void refreshCatalogStats();
    }
  }, [isOpen, step]);

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await downloadExcelTemplate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل تحميل النموذج',
        message: `تعذر تحميل ملف نموذج Excel: ${msg}`,
        variant: 'error',
      });
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImportSuccess = (summary: string) => {
    void refreshCatalogStats();
    void rafiqAlert({
      title: 'اكتمل استيراد الأصناف بنجاح',
      message: summary,
      variant: 'info',
    });
  };

  // Result state
  const [appliedStats, setAppliedStats] = useState<{ categoriesCount: number; quickItemsCount: number; productsCount: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [tplList, printerList, appSettings] = await Promise.all([
          invoke<StoreTemplateDto[]>('templates:getAll'),
          invoke<{ name: string; isDefault: boolean }[]>('printer:list'),
          invoke<Record<string, string>>('settings:getAll').catch(() => ({} as Record<string, string>)),
        ]);

        if (active) {
          if (appSettings) {
            if (appSettings.show_receipt_logo !== undefined && !localStorage.getItem(WIZARD_STORAGE_KEY)) {
              setShowReceiptLogo(appSettings.show_receipt_logo !== '0');
            }
            if (appSettings.store_logo_url && appSettings.store_logo_url !== '/receipt_logo_square.png') {
              setStoreLogoUrl(appSettings.store_logo_url);
            } else if (appSettings.store_logo_url && !localStorage.getItem(WIZARD_STORAGE_KEY)) {
              setStoreLogoUrl(appSettings.store_logo_url);
            }
          }
          if (Array.isArray(tplList) && tplList.length > 0) {
            const cleanList = tplList.filter((t) => t.id !== 'accessories_gifts');
            if (cleanList.length > 0) {
              setTemplates(cleanList);
              setSelectedTemplateId((prev) => cleanList.some((t) => t.id === prev) ? prev : cleanList[0].id);
            }
          }
          if (Array.isArray(printerList)) {
            setPrinters(printerList);
            const def = printerList.find((p) => p.isDefault);
            setSelectedPrinter(def ? def.name : (printerList.length > 0 ? printerList[0].name : ''));
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load initial wizard data:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  // Update receipt defaults when template changes
  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      if (tpl.defaultSettings?.receipt_header) {
        setReceiptHeader(tpl.defaultSettings.receipt_header);
      }
      if (tpl.defaultSettings?.receipt_footer) {
        setReceiptFooter(tpl.defaultSettings.receipt_footer);
      }
      if (storeName === 'متجر رفيق' || storeName === 'سوبر ماركت النور' || storeName.includes('رفيق')) {
        if (id === 'phones_electronics') setStoreName('متجر رفيق للهواتف والإلكترونيات');
        else if (id === 'dairy_bakery') setStoreName('ألبان ومخبوزات رفيق');
        else if (id === 'produce_butchery') setStoreName('أسواق رفيق للخضار والفاكهة');
        else if (id === 'stationery_gifts') setStoreName('مكتبة رفيق للقرطاسية والهدايا');
        else if (id === 'toys_kids') setStoreName('متجر عالم الألعاب والهدايا');
        else if (id === 'spices_roastery') setStoreName('عطارة ومحامص رفيق');
        else if (id === 'clothing_apparel') setStoreName('متاجر رفيق للأزياء');
        else if (id === 'supermarket') setStoreName('سوبر ماركت النور');
        else if (id === 'pharmacy') setStoreName('صيدلية رفيق الحديثة');
        else if (id === 'cafe_restaurant') setStoreName('كافيه ومطعم رفيق');
        else setStoreName('متجر رفيق');
      }
    }
  };

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await invoke('templates:apply', {
        templateId: selectedTemplateId,
        storeName: storeName.trim(),
        storePhone: phone.trim(),
        storeAddress: address.trim(),
        receiptHeader: receiptHeader.trim(),
        receiptFooter: receiptFooter.trim(),
        showReceiptLogo: showReceiptLogo ? '1' : '0',
        storeLogoUrl: storeLogoUrl,
        defaultPrinter: selectedPrinter,
        backupFolder: backupFolder.trim(),
        seedInitialProducts: false,
      });

      try {
        await invoke('settings:save', {
          store_name: storeName.trim(),
          store_phone: phone.trim(),
          store_address: address.trim(),
          receipt_header: receiptHeader.trim(),
          receipt_footer: receiptFooter.trim(),
          show_receipt_logo: showReceiptLogo ? '1' : '0',
          store_logo_url: storeLogoUrl,
          default_printer_name: selectedPrinter,
          backup_target_folder: backupFolder.trim(),
        });
      } catch {
        // ignore
      }

      if (res && res.success) {
        setAppliedStats({
          categoriesCount: res?.categoriesCount !== undefined ? res.categoriesCount : existingCategories.length,
          quickItemsCount: res?.quickItemsCount ?? 0,
          productsCount: res?.productsCount !== undefined ? res.productsCount : existingProducts.length,
        });
        try {
          localStorage.setItem('rafiq_first_run_completed', 'true');
          if (isFirstRun) {
            localStorage.setItem('rafiq_show_guided_tour', 'true');
          }
          localStorage.removeItem(WIZARD_STORAGE_KEY);
        } catch {
          // ignore
        }
        setTimeout(() => {
          onCompleted();
        }, 1800);
      } else {
        setError(res?.message || 'فشل تطبيق القالب');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const getTemplateIcon = (iconName: string, isSelected: boolean) => {
    const iconClass = isSelected ? 'w-6 h-6 text-brand dark:text-brand-bright' : 'w-6 h-6 text-ink-muted dark:text-ink-dark-muted';
    switch (iconName) {
      case 'shopping-cart':
      case 'storefront':
        return <ShoppingCart className={iconClass} />;
      case 'smartphone':
      case 'phone':
        return <Smartphone className={iconClass} />;
      case 'milk':
      case 'bakery_dining':
        return <Milk className={iconClass} />;
      case 'apple':
      case 'produce':
      case 'nutrition':
        return <Apple className={iconClass} />;
      case 'book':
      case 'stationery':
      case 'menu_book':
        return <BookOpen className={iconClass} />;
      case 'flame':
      case 'spices':
      case 'local_fire_department':
        return <Flame className={iconClass} />;
      case 'shirt':
      case 'clothing':
      case 'checkroom':
        return <Shirt className={iconClass} />;
      case 'pill':
      case 'pharmacy':
        return <Pill className={iconClass} />;
      case 'coffee':
      case 'cafe':
      case 'cafe_restaurant':
        return <Coffee className={iconClass} />;
      default:
        return <Store className={iconClass} />;
    }
  };

  if (!isOpen) return null;

  // STEP RENDERER HELPER
  const renderStepBody = () => {
    if (step === 1) {
      return (
        <div className="flex flex-col gap-4">
          {/* Info banner */}
          <div className="bg-brand-soft dark:bg-brand-dark-soft border border-brand/50 dark:border-brand/40 rounded-[6px] p-3.5 flex items-center gap-3 shrink-0">
            <Info className="w-5 h-5 text-brand dark:text-brand-bright shrink-0" />
            <span className="text-[14px] text-brand dark:text-brand-bright font-medium">
              اختر نشاط محلك لضبط ميزات البيع والخصائص التشغيلية المناسبة لطبيعة تجارتك
            </span>
          </div>

          {/* 2-column grid of template cards, 16px gap */}
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5 sm:gap-4 pb-2">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl.id)}
                  className={`relative rounded-[6px] p-3.5 sm:p-4 flex flex-col gap-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-brand-soft dark:bg-brand-dark-soft border-2 border-brand dark:border-brand-bright shadow-2xs'
                      : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand shadow-2xs'
                  }`}
                >
                  {/* Selected badge in top-left corner */}
                  {isSelected && (
                    <div className="absolute top-3.5 left-3.5 flex items-center gap-1 text-brand dark:text-brand-bright text-[12px] font-semibold bg-white/90 dark:bg-surface-dark-2/90 px-2 py-0.5 rounded-[4px] border border-brand/20 dark:border-brand-bright/20 shadow-2xs">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>تم الاختيار</span>
                    </div>
                  )}

                  <div className={`flex items-center gap-3 ${isSelected ? 'pl-24' : ''}`}>
                    
                    {getTemplateIcon(tpl.icon, isSelected)}
                    <span className="text-[16px] font-bold text-ink dark:text-ink-dark">
                      {tpl.name}
                    </span>
                  </div>

                  <p className="text-[12px] text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                    {tpl.description}
                  </p>

                  {/* Summary Feature Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {tpl.featuresSummary?.map((feat, idx) => (
                      <span key={idx} className="text-[12px] text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark rounded-[6px] px-2 py-0.5 bg-white dark:bg-surface-dark-2 font-medium">
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start pb-2">
          {/* LEFT FORM CARD (7 columns in RTL) */}
          <div className="xl:col-span-7 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 flex flex-col gap-4 shadow-2xs">
            {/* Header Card matching StoreProfileTab */}
            <div className="flex items-center gap-2.5 border-b border-line dark:border-line-dark pb-3.5">
              <div className="w-8 h-8 rounded-lg bg-brand/10 dark:bg-brand-bright/15 text-brand dark:text-brand-bright flex items-center justify-center font-bold">
                <Store className="w-4 h-4 text-brand dark:text-brand-bright" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">بيانات وتفاصيل المحل</h3>
                <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">بتظهر في وصل الكاشير الحراري وفواتير البيع للزبائن</span>
              </div>
            </div>

            {/* Section: Basic Identity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink dark:text-ink-dark">
                  اسم المحل أو المنشأة <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="مثلاً: متجر رفيق / مؤسسة النور"
                  className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink dark:text-ink-dark">
                  رقم الهاتف للتواصل <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="مثلاً: 01012345678"
                  dir="ltr"
                  className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors text-right tabular-nums font-mono"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">العنوان والفرع</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثلاً: 23 شارع الجمهورية - وسط البلد"
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">كلام الترحيب أول الوصل (الترويسة)</label>
              <input
                type="text"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
                placeholder="مثلاً: أهلاً بكم في متجرنا"
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">شروط الاسترجاع والاستبدال آخر الوصل (التذييل)</label>
              <textarea
                rows={2}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="مثلاً: شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بالفاتورة."
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded p-2.5 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Section: Receipt Logo Customization */}
            <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-lg border border-line dark:border-line-dark flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span className="font-bold text-ink dark:text-ink-dark text-xs">شعار المتجر أعلى الإيصال الحراري</span>
                </div>
                <ToggleSwitch
                  checked={showReceiptLogo}
                  onChange={(next) => setShowReceiptLogo(next)}
                  title={showReceiptLogo ? 'مفعّل (طباعة الشعار أعلى الوصل)' : 'معطّل (إلغاء طباعة الشعار)'}
                />
              </div>

              {showReceiptLogo ? (
                <div className="flex flex-col gap-3 pt-1 border-t border-line dark:border-line-dark">
                  {/* Controls and current preview */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-surface dark:bg-surface-dark p-3 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-lg border border-line dark:border-line-dark bg-white dark:bg-surface-dark-3 p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                        <img
                          src={storeLogoUrl}
                          alt="معاينة الشعار"
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/receipt_logo_square.png';
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-ink dark:text-ink-dark">
                          {storeLogoUrl !== '/receipt_logo_square.png' && storeLogoUrl !== '/receipt_logo.png' && storeLogoUrl !== '/logo.png'
                            ? 'شعار المتجر (يظهر في الإيصالات وفواتير البيع)'
                            : 'شعار رفيق المعتمد (الافتراضي)'}
                        </span>
                        <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                          {storeLogoUrl !== '/receipt_logo_square.png' && storeLogoUrl !== '/receipt_logo.png' && storeLogoUrl !== '/logo.png'
                            ? 'يتم الحفاظ على الألوان والتفاصيل الطبيعية للشعار بدقة عالية متوافقة مع الطباعة'
                            : 'الشعار الرسمي المعتمد لنظام رفيق بكامل ألوانه الطبيعية'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-2">
                      <label className="px-3.5 py-2 bg-brand text-white hover:bg-brand-hover rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isLogoOptimizing ? 'جاري الرفع...' : 'رفع شعار جديد'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={isLogoOptimizing}
                        />
                      </label>

                      {storeLogoUrl !== '/receipt_logo_square.png' && storeLogoUrl !== '/receipt_logo.png' && storeLogoUrl !== '/logo.png' && (
                        <button
                          type="button"
                          onClick={handleResetLogo}
                          className="px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 text-ink-muted hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark border border-line dark:border-line-dark rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="استعادة شعار رفيق الافتراضي المعتمد"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>استعادة الشعار الافتراضي</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Technical Recommended Dimensions Banner */}
                  <div className="bg-brand-soft/40 dark:bg-brand-dark/20 border border-brand/20 dark:border-brand-bright/20 rounded-lg p-2.5 text-[11px] leading-relaxed text-ink dark:text-ink-dark flex items-start gap-2">
                    <Info className="w-4 h-4 text-brand dark:text-brand-bright shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <div className="font-bold text-brand dark:text-brand-bright">
                        إرشادات شعار الإيصال وفواتير البيع:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-ink-muted dark:text-ink-muted-dark text-[10.5px]">
                        <li>
                          <strong className="text-ink dark:text-ink-dark">المقاس القياسي الموصى به:</strong> تصميم مربع بدقة <span dir="ltr" className="font-mono font-semibold">120 × 120</span> حتى <span dir="ltr" className="font-mono font-semibold">240 × 240</span> بكسل لملاءمة مثالية لورق 80 مم و 57 مم.
                        </li>
                        <li>
                          <strong className="text-ink dark:text-ink-dark">نقاء الألوان والجودة:</strong> يحتفظ النظام بكامل ألوان الشعار الطبيعية ونقاء خطوطه وتفاصيله؛ وتقوم الطابعة الحرارية بتدريج الظلال تلقائياً بأعلى نقاء ممكن.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark p-2.5 rounded border border-line dark:border-line-dark text-center">
                  تم إلغاء طباعة الشعار — سيتم إصدار الإيصال باسم المتجر والعناوين مباشرة دون صورة في الترويسة.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT CARD (5 columns in RTL): Live Receipt Preview (80 mm) */}
          <div className="xl:col-span-5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-4 sm:p-6 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-ink dark:text-ink-dark leading-tight">
                معاينة حية لإيصال الكاشير (80 مم)
              </h2>
              <span className="text-[11px] text-brand dark:text-brand-bright border border-brand/40 dark:border-brand-bright/40 bg-brand-soft dark:bg-brand-dark-soft px-2 py-0.5 rounded-[6px] font-medium">
                تحديث فوري
              </span>
            </div>

            {/* Preview background container */}
            <div className="bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-[6px] p-4 flex justify-center items-start overflow-hidden">
              {/* Receipt Sheet (280px wide, paper) */}
              <div className="w-full max-w-[280px] mx-auto bg-white border border-line rounded-t-[4px] p-4 text-[11px] font-mono leading-relaxed text-ink relative pb-6 select-none shadow-sm">
                {/* Centered Header Block */}
                <div className="text-center flex flex-col gap-0.5 items-center">
                  {showReceiptLogo && (
                    <div className="flex justify-center mb-1.5">
                      <img
                        src={storeLogoUrl}
                        alt="شعار المتجر"
                        className="max-h-12 max-w-[140px] object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/receipt_logo_square.png';
                        }}
                      />
                    </div>
                  )}
                  <div className="font-bold text-[14px] text-ink font-sans">
                    {storeName || 'متجر رفيق'}
                  </div>
                  <div className="text-[11px] tabular-nums font-mono">
                    هاتف: {phone || '01012345678'}
                  </div>
                  {address && <div className="text-[11px]">{address}</div>}
                  <div className="text-[11px] font-sans text-ink-muted mt-0.5">
                    {receiptHeader || 'أهلاً بكم في متجرنا'}
                  </div>
                </div>

                {/* Dotted separator */}
                <div className="border-b border-dashed border-ink/40 my-2.5" />

                {/* Invoice meta */}
                <div className="flex justify-between items-center tabular-nums text-[10.5px]">
                  <span className="font-semibold">فاتورة: #000101</span>
                  <span>{new Date().toLocaleDateString('ar-EG-u-nu-latn')}</span>
                </div>

                {/* Dotted separator */}
                <div className="border-b border-dashed border-ink/40 my-2.5" />

                {/* Item lines */}
                <div className="flex flex-col gap-1 text-[10.5px] tabular-nums">
                  <div className="flex justify-between items-center font-sans">
                    <span className="truncate max-w-[160px]">لبن جهينة كامل الدسم 1 لتر</span>
                    <span className="font-mono">32.00 ج.م</span>
                  </div>
                  <div className="flex justify-between items-center font-sans">
                    <span className="truncate max-w-[160px]">شيبسي 30 جم</span>
                    <span className="font-mono">10.00 ج.م</span>
                  </div>
                </div>

                {/* Dotted separator */}
                <div className="border-b border-dashed border-ink/40 my-2.5" />

                {/* Total line in bold */}
                <div className="flex justify-between items-center font-bold text-[12px] tabular-nums">
                  <span className="font-sans">الإجمالي:</span>
                  <span>42.00 ج.م</span>
                </div>

                {/* Dotted separator */}
                <div className="border-b border-dashed border-ink/40 my-2.5" />

                {/* Return policy centered */}
                <div className="text-center font-sans text-[10px] text-ink-muted leading-tight px-1 mt-1">
                  {receiptFooter || 'شكراً لزيارتكم — الاستبدال خلال 3 أيام بالإيصال'}
                </div>

                {/* Developer signature */}
                <div className="border-t border-dashed border-ink/40 my-2 pt-1.5" />
                <div className="text-center font-sans text-[8.5px] text-ink-muted leading-tight px-1">
                  نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965
                </div>

                {/* Zigzag torn bottom edge */}
                <div className="absolute -bottom-2.5 left-0 right-0 h-2.5 zigzag-bottom" />
              </div>
            </div>

            {/* Note under preview */}
            <p className="text-[12px] text-ink-muted dark:text-ink-dark-muted text-center">
              معاينة تقريبية على ورق حراري قياسي 80 مم مع محاذاة تلقائية للنصوص
            </p>
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="flex flex-col gap-4 max-w-[800px] mx-auto w-full py-2">
          {/* Card 1: Thermal Receipt Printer */}
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-6 flex flex-col shadow-2xs">
            <div className="flex items-start gap-3.5 mb-5">
              <div className="w-10 h-10 rounded-[6px] border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-dark-muted shrink-0 bg-canvas dark:bg-canvas-dark">
                <Printer className="w-5 h-5 text-ink-muted dark:text-ink-dark-muted" />
              </div>
              <div>
                <h3 className="text-ink dark:text-ink-dark text-[16px] font-semibold">
                  طابعة الفواتير الافتراضية (Thermal Receipt Printer)
                </h3>
                <p className="text-ink-muted dark:text-ink-dark-muted text-[13px] mt-1">
                  حدد الطابعة المتصلة بجهاز الكاشير للطباعة السريعة فور الضغط على زر الدفع
                </p>
              </div>
            </div>

            <div>
              <label className="block text-ink-muted dark:text-ink-dark-muted text-[12px] font-medium mb-1.5">
                طابعة الكاشير المعتمدة
              </label>
              <CustomSelect
                value={selectedPrinter}
                onChange={(val) => setSelectedPrinter(val)}
                placeholder="-- بدون طابعة افتراضية (معاينة فقط) --"
                size="lg"
                options={[
                  { value: '', label: '-- بدون طابعة افتراضية (معاينة فقط) --' },
                  ...printers.map((p) => ({
                    value: p.name,
                    label: p.name,
                    badge: p.isDefault ? 'الافتراضية في ويندوز' : undefined
                  }))
                ]}
              />
            </div>
          </div>

          {/* Card 2: Backup Folder */}
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-6 flex flex-col shadow-2xs">
            <div className="flex items-start gap-3.5 mb-5">
              <div className="w-10 h-10 rounded-[6px] border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-dark-muted shrink-0 bg-canvas dark:bg-canvas-dark">
                <HardDrive className="w-5 h-5 text-ink-muted dark:text-ink-dark-muted" />
              </div>
              <div>
                <h3 className="text-ink dark:text-ink-dark text-[16px] font-semibold">
                  مسار النسخ الاحتياطي التلقائي للبيانات (Backup Folder)
                </h3>
                <p className="text-ink-muted dark:text-ink-dark-muted text-[13px] mt-1">
                  يُفضل اختيار مسار على قرص غير قرص النظام (مثل القرص D أو فلاشة USB) لحماية قاعدة بياناتك من مشاكل الويندوز
                </p>
              </div>
            </div>

            <div>
              <label className="block text-ink-muted dark:text-ink-dark-muted text-[12px] font-medium mb-1.5">
                مجلد النسخ الاحتياطي التلقائي
              </label>
              <input
                type="text"
                value={backupFolder}
                onChange={(e) => setBackupFolder(e.target.value)}
                className="w-full h-[44px] px-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] text-[13px] font-mono text-ink dark:text-ink-dark outline-none focus:border-brand dark:focus:border-brand-bright"
                placeholder="D:\RafiqBackups"
              />
            </div>
          </div>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="flex flex-col gap-5 max-w-[860px] mx-auto w-full py-2">
          {/* 3-Column Summary Grid (6 cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {/* Card 1 */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted dark:text-ink-dark-muted text-[12px] font-medium">النشاط التجاري المختار</span>
              <span className="text-brand dark:text-brand-bright text-[16px] font-semibold mt-2">
                {selectedTemplate?.name}
              </span>
            </div>

            {/* Card 2 */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted dark:text-ink-dark-muted text-[12px] font-medium">اسم المنشأة</span>
              <span className="text-ink dark:text-ink-dark text-[16px] font-semibold mt-2 truncate">
                {storeName}
              </span>
            </div>

            {/* Card 3 */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted dark:text-ink-dark-muted text-[12px] font-medium">طابعة الفواتير</span>
              <span className="text-ink dark:text-ink-dark text-[16px] font-semibold mt-2 font-mono truncate">
                {selectedPrinter || 'معاينة فقط'}
              </span>
            </div>

            {/* Card 4 */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted dark:text-ink-dark-muted text-[12px] font-medium">حالة قاعدة البيانات</span>
              <span className="text-paid dark:text-paid-bright text-[15px] font-bold mt-2 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-paid dark:text-paid-bright" />
                <span>{existingProducts.length > 0 ? 'محملة بالأصناف وجاهزة للبيع' : 'جاهزة لتسجيل بضاعتك'}</span>
              </span>
            </div>

            {/* Card 5 */}
            <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted dark:text-ink-dark-muted text-[12px] font-medium">الأقسام والأصناف المسجلة</span>
              <span className={`text-[15px] font-semibold mt-2 font-mono ${existingProducts.length > 0 ? 'text-paid dark:text-paid-bright font-bold' : 'text-ink dark:text-ink-dark'}`}>
                {existingCategories.length} أقسام · {existingProducts.length} أصناف
              </span>
            </div>

            {/* Card 6 (Actionable Import Card) */}
            <div className="bg-brand-soft dark:bg-brand-dark-soft border border-brand dark:border-brand-bright rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-brand dark:text-brand-bright text-[12px] font-medium">إدخال بضاعتك وأقسامك</span>
                <span className="text-[10px] font-semibold text-brand dark:text-brand-bright bg-white dark:bg-surface-dark border border-brand/40 dark:border-brand-bright/40 px-1.5 py-0.5 rounded-[3px]">
                  {existingProducts.length > 0 ? `${existingProducts.length} صنف مسجل` : 'تسجيل حر'}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex-1 h-9 px-2.5 bg-brand dark:bg-brand-bright text-white dark:text-surface-dark text-xs font-semibold rounded-[4px] hover:bg-brand-dark dark:hover:bg-brand-bright/90 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{existingProducts.length > 0 ? 'استيراد المزيد من Excel' : 'استيراد ملف Excel الآن'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                  title="تحميل نموذج Excel فارغ معتمد لتسجيل الأصناف"
                  className="h-9 px-2.5 bg-white dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright text-xs font-medium rounded-[4px] flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {downloadingTemplate ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="text-[11px] hidden sm:inline">النموذج</span>
                </button>
              </div>
            </div>
          </div>

          {/* Clean Slate Reassurance Card */}
          <div className="bg-paid-soft dark:bg-paid-dark-soft border border-paid/40 dark:border-paid/40 rounded-[6px] p-5 flex items-start gap-4 shadow-2xs">
            <div className="w-8 h-8 rounded-[6px] bg-paid text-white flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <h4 className="text-ink dark:text-ink-dark text-[16px] font-semibold">
                {existingProducts.length > 0
                  ? `تم تجهيز ${existingProducts.length} صنف بنجاح وجاهزة للبيع فوراً`
                  : 'جاهز تماماً لبدء تسجيل أصناف وبضاعة محلك'}
              </h4>
              <p className="text-ink-muted dark:text-ink-dark-muted text-[13px] mt-1 leading-relaxed">
                {existingProducts.length > 0
                  ? 'تم ربط وتجهيز الأقسام والأصناف المستوردة بنجاح، ويمكنك الآن الانتقال مباشرة لنقطة البيع وبدء إصدار الفواتير أو إضافة واستيراد المزيد لاحقاً.'
                  : 'تم ضبط وتفعيل ميزات البيع المناسبة لنشاطك، ويمكنك الآن البدء مباشرة في إضافة بضاعتك وترتيب أقسامك أو استيرادها بكل حرية وسهولة.'}
              </p>
            </div>
          </div>

          {/* Reassurance Line */}
          <div className="flex items-center gap-2.5 px-1 text-ink-muted dark:text-ink-dark-muted text-[13px]">
            <ShieldCheck className="w-5 h-5 text-paid dark:text-paid-bright shrink-0" />
            <span>يمكنك في أي وقت تفعيل أو إيقاف أي ميزة وإضافة وتعديل أقسامك وبضاعتك</span>
          </div>
        </div>
      );
    }

    return null;
  };

  // --------------------------------------------------------------------------
  // FULL SCREEN WORKSPACE VIEW (FOR FIRST RUN ONBOARDING - Matching 1_2_pos & 3_4_pos)
  // --------------------------------------------------------------------------
  if (isFirstRun) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col lg:flex-row bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark select-none overflow-hidden font-sans" dir="rtl">
        {/* TOP MOBILE / TABLET HEADER (< lg) */}
        <div className="lg:hidden h-14 bg-[#0B4F42] text-white px-4 flex items-center justify-between shrink-0 shadow-sm z-30">
          <div className="flex items-center gap-2">
            <img 
              src="/logo_full_white.png" 
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo_white.png'; }} 
              alt="RAFIQ Point of Sale Logo" 
              className="w-[110px] h-auto object-contain block drop-shadow-sm" 
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/90 font-medium">خطوة {step} من 4</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    step === n ? 'bg-white' : step > n ? 'bg-white/70' : 'bg-white/25'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
        {/* RIGHT SIDE PANEL (360px wide, solid #0B4F42, matching designs) */}
        <aside className="hidden lg:flex w-[280px] xl:w-[320px] 2xl:w-[360px] h-full bg-[#0B4F42] text-white flex-col justify-between p-5 xl:p-8 shrink-0 relative z-20 select-none overflow-y-auto">
          <div className="flex flex-col">
            {/* RAFIQ Brand Header: Clean transparent emblem on #0B4F42 */}
            <div className="mb-6 flex items-center">
              <img 
                src="/logo_full_white.png" 
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo_white.png'; }} 
                alt="RAFIQ Point of Sale Logo" 
                className="w-[160px] h-auto object-contain block drop-shadow-sm" 
              />
            </div>

            {/* Welcome block */}
            <div className="border border-white/20 rounded-[6px] p-3.5 xl:p-4 mb-4 xl:mb-8 bg-white/[0.04]">
              <h2 className="text-white text-[16px] font-semibold mb-1">تخصيص النظام وتجهيز المحل</h2>
              <p className="text-white/75 text-[13px]">4 خطوات سهلة وتبقى جاهز تبيع</p>
            </div>

            {/* Vertical Stepper (4 steps) */}
            <div className="relative flex flex-col gap-4 xl:gap-6 pr-1">
              {/* Continuous vertical line behind badges */}
              <div className="absolute top-4 right-[13px] bottom-4 w-[1px] bg-white/25 -z-0 pointer-events-none" />

              {[
                { num: 1, title: 'نوع النشاط والميزات التشغيلية', desc: 'تحديد نشاط المحل وضبط الميزات التشغيلية' },
                { num: 2, title: 'بيانات المحل والفاتورة', desc: 'الاسم، الهاتف، وترويسة الإيصال' },
                { num: 3, title: 'الأجهزة وحفظ البيانات', desc: 'طابعة الكاشير ومسار النسخ الاحتياطي' },
                { num: 4, title: 'المراجعة وتأكيد البدء', desc: 'اعتماد التجهيزات والانتقال للكاشير' },
              ].map((s) => {
                const isPassed = appliedStats ? true : step > s.num;
                const isActive = !appliedStats && step === s.num;

                return (
                  <div key={s.num} className="flex items-start gap-3.5 relative z-10">
                    {/* Badge */}
                    {isPassed ? (
                      <div className="w-7 h-7 rounded-[4px] border border-white flex items-center justify-center shrink-0 bg-[#0B4F42] text-white">
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    ) : isActive ? (
                      <div className="w-7 h-7 rounded-[4px] bg-white text-brand font-bold text-[13px] flex items-center justify-center shrink-0 tabular-nums shadow-sm">
                        {s.num}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-[4px] border border-white/40 text-white/60 font-semibold text-[13px] flex items-center justify-center shrink-0 tabular-nums bg-[#0B4F42]">
                        {s.num}
                      </div>
                    )}

                    {/* Step Title & Subtitle */}
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[14px] font-semibold ${
                          isActive ? 'text-white' : isPassed ? 'text-white' : 'text-white/60'
                        }`}>
                          {s.title}
                        </span>
                      </div>
                      <span className={`text-[12px] leading-relaxed ${
                        isActive ? 'text-white/70' : isPassed ? 'text-white/75' : 'text-white/50'
                      }`}>
                        {s.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Assurance items */}
          <div className="pt-4 xl:pt-6 border-t border-white/15 flex flex-col gap-2 xl:gap-2.5">
            <div className="flex items-center gap-2.5 text-white">
              <Check className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              <span className="text-[13px] text-white/90">يعمل أوفلاين 100% بدون أي إنترنت</span>
            </div>
            <div className="flex items-center gap-2.5 text-white">
              <Check className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              <span className="text-[13px] text-white/90">حماية مالية فائقة وتخزين محلي آمن</span>
            </div>
            <div className="flex items-center gap-2.5 text-white">
              <Check className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              <span className="text-[13px] text-white/90">جميع الإعدادات والأسعار قابلة للتعديل لاحقاً</span>
            </div>
          </div>
        </aside>

        {/* LEFT WORKING AREA (Matching 1_2_pos & 3_4_pos) */}
        {appliedStats ? (
          /* SUCCESS WORKING AREA (Replacing whole working area when completed) */
          <main className="flex-1 h-full bg-canvas dark:bg-canvas-dark flex flex-col items-center justify-center p-12 select-none">
            <div className="w-full max-w-[520px] px-4 flex flex-col items-center text-center">
              {/* 64px Outline Check in --paid */}
              <div className="w-16 h-16 rounded-[8px] border-2 border-paid/30 bg-white dark:bg-surface-dark flex items-center justify-center text-paid dark:text-paid-bright mb-6 shadow-sm">
                <Check className="w-10 h-10 text-paid dark:text-paid-bright stroke-[2.5]" />
              </div>

              {/* Title */}
              <h1 className="text-ink dark:text-ink-dark text-[28px] font-semibold mb-3">
                تم تهيئة وتجهيز النظام بنجاح!
              </h1>

              {/* Description */}
              <p className="text-ink-muted dark:text-ink-dark-muted text-[14px] leading-relaxed mb-8">
                تم ضبط ميزات نشاطك بنجاح، وقاعدة البيانات جاهزة للعمل. جاري نقلك لشاشة نقطة البيع…
              </p>

              {/* 44px Progress Strip */}
              <div className="w-full h-[44px] bg-brand-soft dark:bg-brand-dark-soft border border-brand dark:border-brand-bright rounded-[6px] px-4 flex items-center justify-between relative overflow-hidden shadow-2xs">
                <span className="text-ink dark:text-ink-dark text-[13px] font-medium z-10">جاري تحميل بيانات المتجر الجديد…</span>
                <div className="flex items-center gap-2 z-10 font-mono text-[12px] text-brand dark:text-brand-bright font-semibold">
                  <span className="tabular-nums">100%</span>
                </div>
                {/* Indeterminate Animated Progress Bar at Bottom of Strip */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand/20 dark:bg-brand-bright/20 overflow-hidden">
                  <div className="h-full bg-brand dark:bg-brand-bright w-2/3 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          </main>
        ) : (
          <main className="flex-1 h-full flex flex-col bg-canvas dark:bg-canvas-dark overflow-hidden">
            {/* STEP HEADER (72px, --surface, 1px bottom border) */}
            <header className="h-[64px] sm:h-[72px] px-4 sm:px-6 lg:px-8 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex items-center justify-between shrink-0 shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-brand dark:text-brand-bright border border-brand/40 dark:border-brand-bright/40 bg-brand-soft dark:bg-brand-dark-soft px-2.5 py-0.5 rounded-[6px] font-medium">
                  الخطوة {step} من 4
                </span>
                <div>
                  <h1 className="text-[16px] sm:text-[18px] font-semibold text-ink dark:text-ink-dark leading-tight">
                    {step === 1 && 'اختر نوع نشاط محلك التجاري'}
                    {step === 2 && 'بيانات المتجر وهوية الفاتورة'}
                    {step === 3 && 'طابعة الفواتير والنسخ الاحتياطي'}
                    {step === 4 && 'مراجعة التجهيزات والبدء الفعلي'}
                  </h1>
                  <p className="text-[11px] sm:text-[13px] text-ink-muted dark:text-ink-dark-muted mt-0.5 line-clamp-1 sm:line-clamp-none">
                    {step === 1 && 'سيقوم رفيق بضبط خصائص وميزات البيع المناسبة لنشاطك التجاري للبدء الفوري'}
                    {step === 2 && 'المعلومات اللي هتظهر في رأس وتذييل إيصال الكاشير للزبون'}
                    {step === 3 && 'حدد طابعة الإيصالات الحرارية ومسار النسخ الاحتياطي التلقائي لحماية بياناتك'}
                    {step === 4 && 'تأكيد الخيارات واعتماد التجهيز لفتح شاشة الكاشير وبدء البيع فوراً'}
                  </p>
                </div>
              </div>

              <div className="hidden sm:block">
                {step === 1 && (
                  <span className="text-[12px] text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark rounded-[6px] px-2.5 py-1 bg-surface dark:bg-surface-dark tabular-nums">
                    {templates.length} قوالب متخصصة
                  </span>
                )}
                {step === 2 && (
                  <span className="text-[12px] text-brand dark:text-brand-bright border border-brand/40 dark:border-brand-bright/40 bg-brand-soft dark:bg-brand-dark-soft px-2.5 py-1 rounded-[6px] font-medium">
                    معاينة حية للإيصال (80 مم)
                  </span>
                )}
                {step === 3 && (
                  <span className="text-[12px] text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark rounded-[6px] px-2.5 py-1 bg-surface dark:bg-surface-dark tabular-nums">
                    {printers.length} طابعة مكتشفة
                  </span>
                )}
                {step === 4 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('rafiq:open-license'))}
                      className="text-[12px] text-brand dark:text-brand-bright border border-brand/40 dark:border-brand-bright/40 bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand hover:text-white px-2.5 py-1 rounded-[6px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      title="فتح نافذة تفعيل ترخيص البرنامج"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>تفعيل الترخيص</span>
                    </button>
                    <span className="text-[12px] text-brand dark:text-brand-bright border border-brand/40 dark:border-brand-bright/40 bg-brand-soft dark:bg-brand-dark-soft px-2.5 py-1 rounded-[6px] font-medium">
                      جاهز للاعتماد والتشغيل
                    </span>
                  </div>
                )}
              </div>
            </header>

            {/* STEP BODY (scrolls internally, 24px padding) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
              {error && (
                <div className="p-3.5 bg-danger-soft dark:bg-danger-dark-soft border border-danger/40 dark:border-danger/40 rounded-[6px] text-xs text-danger dark:text-danger-bright flex items-center gap-2">
                  <span className="font-bold">تنبيه:</span>
                  <span>{error}</span>
                </div>
              )}

              {renderStepBody()}
            </div>

            {/* STEP FOOTER (80px, --surface, 1px top border) */}
            <footer className="min-h-[72px] sm:h-[80px] px-4 sm:px-6 lg:px-8 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shrink-0 shadow-2xs">
              <div className="text-ink-muted dark:text-ink-dark-muted text-xs sm:text-[14px] flex items-center gap-1.5 truncate">
                <span className="hidden md:inline">النشاط المختار: </span>
                <span className="font-semibold text-ink dark:text-ink-dark truncate max-w-[140px] sm:max-w-xs">{selectedTemplate?.name}</span>
                <span className="mx-2">·</span>
                <span className="font-semibold text-paid dark:text-paid-bright">جاهز للبدء والبيع</span>
              </div>

              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((prev) => (prev - 1) as any)}
                    disabled={loading}
                    className="h-[40px] sm:h-[44px] px-3.5 sm:px-5 border border-line dark:border-line-dark rounded-[6px] bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-xs sm:text-[14px] font-medium flex items-center gap-1.5 sm:gap-2 hover:bg-canvas dark:hover:bg-canvas-dark cursor-pointer transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>السابق</span>
                  </button>
                )}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 2 && !storeName.trim()) {
                        setError('اسم المحل مطلوب للمتابعة.');
                        return;
                      }
                      setError(null);
                      setStep((prev) => (prev + 1) as any);
                    }}
                    className="h-[44px] px-6 bg-brand hover:bg-brand-hover text-white text-[14px] font-semibold rounded-[6px] flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
                  >
                    <span>
                      {step === 1 && 'المتابعة لبيانات الفاتورة'}
                      {step === 2 && 'المتابعة لإعدادات الأجهزة'}
                      {step === 3 && 'المتابعة للمراجعة والبدء'}
                    </span>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleApply()}
                    disabled={loading}
                    className="h-[40px] sm:h-[44px] px-4 sm:px-7 bg-paid hover:bg-paid-hover text-white text-xs sm:text-[14px] font-bold rounded-[6px] flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
                    <span>تجهيز النظام وبدء نقطة البيع فوراً</span>
                  </button>
                )}
              </div>
            </footer>
          </main>
        )}
        {isImportModalOpen && (
          <ExcelImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={handleImportSuccess}
            existingProducts={existingProducts}
            categories={existingCategories}
            zIndexClass="z-[10001]"
          />
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MODAL DIALOG VIEW (WHEN OPENED FROM SETTINGS - Matching 1_4 design)
  // --------------------------------------------------------------------------
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs text-ink dark:text-ink-dark select-none font-sans" 
      dir="rtl"
      onClick={handleBackdropClick}
    >
      {/* MODAL CONTAINER (896px wide, max 85vh, 8px radius, 1px line border, modal-shadow) */}
      <div 
        className="w-full max-w-[896px] max-h-[92vh] sm:max-h-[85vh] bg-surface dark:bg-surface-dark rounded-[8px] border border-line dark:border-line-dark shadow-2xl flex flex-col overflow-hidden m-2 sm:m-0"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. MODAL HEADER (72px, --surface, 1px bottom border) */}
        <div className="h-[72px] bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-6 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[20px] font-semibold text-ink dark:text-ink-dark">معالج التجهيز السريع للنظام</h2>
            <p className="text-[13px] text-ink-muted dark:text-ink-dark-muted mt-0.5">تهيئة وتجهيز النظام حسب نشاط محلك</p>
          </div>
          {/* 44px dismiss button */}
          <button
            type="button"
            onClick={requestClose}
            className="w-11 h-11 border border-line dark:border-line-dark rounded-[6px] bg-surface dark:bg-surface-dark hover:bg-canvas dark:hover:bg-canvas-dark text-ink dark:text-ink-dark flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق المعالج"
          >
            <X className="w-5 h-5 text-ink dark:text-ink-dark" />
          </button>
        </div>

        {/* 2. HORIZONTAL STEPPER (64px, --surface-2, 1px bottom border) */}
        <div className="h-[64px] bg-[#F9FAFA] dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-8 flex items-center justify-between shrink-0">
          {/* Step 1: نوع المحل */}
          <div className="flex items-center gap-2.5">
            {step > 1 ? (
              <div className="w-6 h-6 rounded-[4px] border border-brand dark:border-brand-bright bg-white dark:bg-surface-dark text-brand dark:text-brand-bright flex items-center justify-center font-bold text-xs">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            ) : (
              <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
                step === 1 ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark' : 'border border-line dark:border-line-dark bg-white dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted'
              }`}>
                1
              </div>
            )}
            <span className={`text-sm ${step === 1 ? 'font-bold text-brand dark:text-brand-bright' : step > 1 ? 'font-medium text-brand dark:text-brand-bright' : 'font-medium text-ink-muted dark:text-ink-dark-muted'}`}>
              نوع المحل
            </span>
          </div>

          {/* Connector 1-2 */}
          <div className={`flex-1 h-px mx-4 ${step > 1 ? 'bg-brand/40 dark:bg-brand-bright/40' : 'bg-line dark:bg-line-dark'}`} />

          {/* Step 2: بيانات الفاتورة */}
          <div className="flex items-center gap-2.5">
            {step > 2 ? (
              <div className="w-6 h-6 rounded-[4px] border border-brand dark:border-brand-bright bg-white dark:bg-surface-dark text-brand dark:text-brand-bright flex items-center justify-center font-bold text-xs">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            ) : (
              <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
                step === 2 ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark' : 'border border-line dark:border-line-dark bg-white dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted'
              }`}>
                2
              </div>
            )}
            <span className={`text-sm ${step === 2 ? 'font-bold text-brand dark:text-brand-bright' : step > 2 ? 'font-medium text-brand dark:text-brand-bright' : 'font-medium text-ink-muted dark:text-ink-dark-muted'}`}>
              بيانات الفاتورة
            </span>
          </div>

          {/* Connector 2-3 */}
          <div className={`flex-1 h-px mx-4 ${step > 2 ? 'bg-brand/40 dark:bg-brand-bright/40' : 'bg-line dark:bg-line-dark'}`} />

          {/* Step 3: الأجهزة */}
          <div className="flex items-center gap-2.5">
            {step > 3 ? (
              <div className="w-6 h-6 rounded-[4px] border border-brand dark:border-brand-bright bg-white dark:bg-surface-dark text-brand dark:text-brand-bright flex items-center justify-center font-bold text-xs">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            ) : (
              <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
                step === 3 ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark' : 'border border-line dark:border-line-dark bg-white dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted'
              }`}>
                3
              </div>
            )}
            <span className={`text-sm ${step === 3 ? 'font-bold text-brand dark:text-brand-bright' : step > 3 ? 'font-medium text-brand dark:text-brand-bright' : 'font-medium text-ink-muted dark:text-ink-dark-muted'}`}>
              الأجهزة
            </span>
          </div>

          {/* Connector 3-4 */}
          <div className={`flex-1 h-px mx-4 ${step > 3 ? 'bg-brand/40 dark:bg-brand-bright/40' : 'bg-line dark:bg-line-dark'}`} />

          {/* Step 4: المراجعة */}
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
              step === 4 ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark' : 'border border-line dark:border-line-dark bg-white dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted'
            }`}>
              4
            </div>
            <span className={`text-sm ${step === 4 ? 'font-bold text-brand dark:text-brand-bright' : 'font-medium text-ink-muted dark:text-ink-dark-muted'}`}>
              المراجعة
            </span>
          </div>
        </div>

        {/* 3. MODAL BODY (Scrolls internally, 24px padding) */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-canvas dark:bg-canvas-dark">
          {error && (
            <div className="p-3.5 bg-danger-soft dark:bg-danger-dark-soft border border-danger/40 dark:border-danger/40 rounded-[6px] text-xs text-danger dark:text-danger-bright flex items-center gap-2">
              <span className="font-bold">تنبيه:</span>
              <span>{error}</span>
            </div>
          )}

          {renderStepBody()}
        </div>

        {/* 4. MODAL FOOTER (72px, --surface, 1px top border) */}
        <div className="h-[72px] bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark px-6 flex items-center justify-between shrink-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => (prev - 1) as any)}
              disabled={loading}
              className="h-[44px] px-5 border border-line dark:border-line-dark rounded-[6px] bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-[14px] font-medium flex items-center gap-2 hover:bg-canvas dark:hover:bg-canvas-dark cursor-pointer transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>السابق</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 2 && !storeName.trim()) {
                  setError('اسم المحل مطلوب للمتابعة.');
                  return;
                }
                setError(null);
                setStep((prev) => (prev + 1) as any);
              }}
              className="h-[44px] px-6 bg-brand hover:bg-brand-hover text-white text-[14px] font-semibold rounded-[6px] flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
            >
              <span>التالي</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={loading}
              className="h-[44px] px-7 bg-paid hover:bg-paid-hover text-white text-[14px] font-bold rounded-[6px] flex items-center gap-2 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
              <span>تجهيز النظام والبدء الآن</span>
            </button>
          )}
        </div>
      </div>
        {isImportModalOpen && (
          <ExcelImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={handleImportSuccess}
            existingProducts={existingProducts}
            categories={existingCategories}
            zIndexClass="z-[10001]"
          />
        )}
    </div>
  );
};
