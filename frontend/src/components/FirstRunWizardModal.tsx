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
  Info
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { INITIAL_STORE_TEMPLATES, type StoreTemplateDto } from '../constants/storeTemplates';
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
  const [seedInitialProducts, setSeedInitialProducts] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.seedInitialProducts !== undefined) return parsed.seedInitialProducts;
      }
    } catch {
      // ignore
    }
    return true;
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
        selectedPrinter,
        backupFolder,
        seedInitialProducts
      };
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [step, selectedTemplateId, storeName, phone, address, receiptHeader, receiptFooter, selectedPrinter, backupFolder, seedInitialProducts]);

  // Result state
  const [appliedStats, setAppliedStats] = useState<{ categoriesCount: number; quickItemsCount: number; productsCount: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [tplList, printerList] = await Promise.all([
          invoke<StoreTemplateDto[]>('templates:getAll'),
          invoke<{ name: string; isDefault: boolean }[]>('printer:list'),
        ]);

        if (active) {
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
        defaultPrinter: selectedPrinter,
        backupFolder: backupFolder.trim(),
        seedInitialProducts: seedInitialProducts,
      });

      if (res && res.success) {
        setAppliedStats({
          categoriesCount: res.categoriesCount || 0,
          quickItemsCount: res.quickItemsCount || 0,
          productsCount: res.productsCount != null ? res.productsCount : (seedInitialProducts ? (selectedTemplate?.productsCount || 35) : 0),
        });
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
    const iconClass = isSelected ? 'w-6 h-6 text-brand' : 'w-6 h-6 text-ink-muted';
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
          <div className="bg-brand-soft border border-brand/50 rounded-[6px] p-3.5 flex items-center gap-3 shrink-0">
            <Info className="w-5 h-5 text-brand shrink-0" />
            <span className="text-[14px] text-brand font-medium">
              اختار القالب الأقرب لطبيعة محلك — تقدر تعدل كل حاجة بعد كده من الإعدادات
            </span>
          </div>

          {/* 2-column grid of template cards, 16px gap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl.id)}
                  className={`relative rounded-[6px] p-4 flex flex-col gap-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-brand-soft border-2 border-brand shadow-2xs'
                      : 'bg-surface border border-line hover:border-brand shadow-2xs'
                  }`}
                >
                  {/* Selected badge in top-left corner */}
                  {isSelected && (
                    <div className="absolute top-3.5 left-3.5 flex items-center gap-1 text-brand text-[12px] font-semibold bg-white/90 px-2 py-0.5 rounded-[4px] border border-brand/20 shadow-2xs">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>تم الاختيار</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {getTemplateIcon(tpl.icon, isSelected)}
                    <span className="text-[16px] font-bold text-ink">
                      {tpl.name}
                    </span>
                  </div>

                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    {tpl.description}
                  </p>

                  {/* Summary Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[12px] text-ink-muted border border-line rounded-[6px] px-2 py-0.5 tabular-nums bg-white font-medium">
                      {tpl.productsCount || 35} صنف جاهز للبيع
                    </span>
                    <span className="text-[12px] text-ink-muted border border-line rounded-[6px] px-2 py-0.5 tabular-nums bg-white font-medium">
                      {tpl.categories.length} أقسام
                    </span>
                    <span className="text-[12px] text-ink-muted border border-line rounded-[6px] px-2 py-0.5 tabular-nums bg-white font-medium">
                      {tpl.quickItems.length} أزرار سريعة
                    </span>
                    {tpl.featureFlags?.feature_scale_weight && (
                      <span className="text-[12px] text-brand border border-brand/40 bg-white font-medium rounded-[6px] px-2 py-0.5">
                        دعم الميزان
                      </span>
                    )}
                    {tpl.featureFlags?.feature_expiry_dates && (
                      <span className="text-[12px] text-brand border border-brand/40 bg-white font-medium rounded-[6px] px-2 py-0.5">
                        تاريخ الصلاحية
                      </span>
                    )}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-2">
          {/* LEFT FORM CARD (7 columns in RTL) */}
          <div className="lg:col-span-7 bg-surface border border-line rounded-[6px] p-6 flex flex-col gap-4 shadow-2xs">
            <h2 className="text-[18px] font-semibold text-ink leading-tight">
              معلومات المنشأة وعناوين الإيصال
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-ink-muted">
                  اسم المحل / المنشأة *
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full h-[44px] px-3.5 bg-surface border border-line rounded-[6px] text-[14px] text-ink font-semibold outline-none focus:border-brand"
                  placeholder="مثال: متجر رفيق / مؤسسة النور"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-ink-muted">
                  رقم الهاتف / خدمة العملاء *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-[44px] px-3.5 bg-surface border border-line rounded-[6px] text-[14px] text-ink font-mono outline-none focus:border-brand"
                  placeholder="01012345678"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-ink-muted">
                العنوان بالتفصيل
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full h-[44px] px-3.5 bg-surface border border-line rounded-[6px] text-[14px] text-ink outline-none focus:border-brand"
                placeholder="الشارع الرئيسي - وسط البلد"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-ink-muted">
                رسالة الترحيب أعلى الفاتورة (رأس الإيصال)
              </label>
              <input
                type="text"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
                className="w-full h-[44px] px-3.5 bg-surface border border-line rounded-[6px] text-[14px] text-ink outline-none focus:border-brand"
                placeholder="أهلاً بكم في متجرنا"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-ink-muted">
                شروط الاستبدال أسفل الفاتورة (تذييل الإيصال)
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full h-[44px] px-3.5 bg-surface border border-line rounded-[6px] text-[14px] text-ink outline-none focus:border-brand"
                placeholder="شكراً لزيارتكم — الاستبدال خلال 3 أيام بالإيصال"
              />
            </div>
          </div>

          {/* RIGHT CARD (5 columns in RTL): Live Receipt Preview (80 mm) */}
          <div className="lg:col-span-5 bg-surface border border-line rounded-[6px] p-6 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-ink leading-tight">
                معاينة حية لإيصال الكاشير (80 مم)
              </h2>
              <span className="text-[11px] text-brand border border-brand/40 bg-brand-soft px-2 py-0.5 rounded-[6px] font-medium">
                تحديث فوري
              </span>
            </div>

            {/* Preview background container */}
            <div className="bg-canvas border border-line rounded-[6px] p-4 flex justify-center items-start overflow-hidden">
              {/* Receipt Sheet (280px wide, pure white paper with 1px border and zigzag torn bottom edge) */}
              <div className="w-[280px] bg-white border border-line rounded-t-[4px] p-4 text-[11px] font-mono leading-relaxed text-ink relative pb-6 select-none shadow-sm">
                {/* Centered Header Block */}
                <div className="text-center flex flex-col gap-0.5">
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

                {/* Zigzag torn bottom edge */}
                <div className="absolute -bottom-2.5 left-0 right-0 h-2.5 zigzag-bottom" />
              </div>
            </div>

            {/* Note under preview */}
            <p className="text-[12px] text-ink-muted text-center">
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
          <div className="bg-surface border border-line rounded-[6px] p-6 flex flex-col shadow-2xs">
            <div className="flex items-start gap-3.5 mb-5">
              <div className="w-10 h-10 rounded-[6px] border border-line flex items-center justify-center text-ink-muted shrink-0 bg-canvas">
                <Printer className="w-5 h-5 text-ink-muted" />
              </div>
              <div>
                <h3 className="text-ink text-[16px] font-semibold">
                  طابعة الفواتير الافتراضية (Thermal Receipt Printer)
                </h3>
                <p className="text-ink-muted text-[13px] mt-1">
                  حدد الطابعة المتصلة بجهاز الكاشير للطباعة السريعة فور الضغط على زر الدفع
                </p>
              </div>
            </div>

            <div>
              <label className="block text-ink-muted text-[12px] font-medium mb-1.5">
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
          <div className="bg-surface border border-line rounded-[6px] p-6 flex flex-col shadow-2xs">
            <div className="flex items-start gap-3.5 mb-5">
              <div className="w-10 h-10 rounded-[6px] border border-line flex items-center justify-center text-ink-muted shrink-0 bg-canvas">
                <HardDrive className="w-5 h-5 text-ink-muted" />
              </div>
              <div>
                <h3 className="text-ink text-[16px] font-semibold">
                  مسار النسخ الاحتياطي التلقائي للبيانات (Backup Folder)
                </h3>
                <p className="text-ink-muted text-[13px] mt-1">
                  يُفضل اختيار مسار على قرص غير قرص النظام (مثل القرص D أو فلاشة USB) لحماية قاعدة بياناتك من مشاكل الويندوز
                </p>
              </div>
            </div>

            <div>
              <label className="block text-ink-muted text-[12px] font-medium mb-1.5">
                مجلد النسخ الاحتياطي التلقائي
              </label>
              <input
                type="text"
                value={backupFolder}
                onChange={(e) => setBackupFolder(e.target.value)}
                className="w-full h-[44px] px-3.5 bg-surface border border-line rounded-[6px] text-[13px] font-mono text-ink outline-none focus:border-brand"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1 */}
            <div className="bg-surface border border-line rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted text-[12px] font-medium">النشاط التجاري المختار</span>
              <span className="text-brand text-[16px] font-semibold mt-2">
                {selectedTemplate?.name}
              </span>
            </div>

            {/* Card 2 */}
            <div className="bg-surface border border-line rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted text-[12px] font-medium">اسم المنشأة</span>
              <span className="text-ink text-[16px] font-semibold mt-2 truncate">
                {storeName}
              </span>
            </div>

            {/* Card 3 */}
            <div className="bg-surface border border-line rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted text-[12px] font-medium">طابعة الفواتير</span>
              <span className="text-ink text-[16px] font-semibold mt-2 font-mono truncate">
                {selectedPrinter || 'معاينة فقط'}
              </span>
            </div>

            {/* Card 4 */}
            <div className="bg-surface border border-line rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted text-[12px] font-medium">الأقسام والتصنيفات</span>
              <span className="text-ink text-[16px] font-semibold mt-2 tabular-nums font-bold">
                {selectedTemplate?.categories?.length || 0} أقسام رئيسية
              </span>
            </div>

            {/* Card 5 */}
            <div className="bg-surface border border-line rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <span className="text-ink-muted text-[12px] font-medium">أزرار الكاشير السريعة</span>
              <span className="text-ink text-[16px] font-semibold mt-2 tabular-nums font-bold">
                {selectedTemplate?.quickItems?.length || 0} أزرار سريعة
              </span>
            </div>

            {/* Card 6 (Special Highlighted) */}
            <div className="bg-brand-soft border border-brand rounded-[6px] p-4 flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-brand text-[12px] font-medium">الكتالوج الفعلي الجاهز</span>
                <span className="text-[10px] font-semibold text-brand bg-white border border-brand/40 px-1.5 py-0.5 rounded-[3px]">
                  جاهز فوراً
                </span>
              </div>
              <span className="text-brand text-[16px] font-semibold mt-2 tabular-nums font-bold">
                {selectedTemplate?.productsCount || 35} صنف حقيقي بباركود
              </span>
            </div>
          </div>

          {/* Full-width Checkbox Card */}
          <div
            onClick={() => setSeedInitialProducts(!seedInitialProducts)}
            className="bg-brand-soft border border-brand rounded-[6px] p-5 flex items-start gap-4 cursor-pointer select-none shadow-2xs"
          >
            <div className={`w-5 h-5 rounded-[4px] flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              seedInitialProducts ? 'bg-brand text-white' : 'border border-brand bg-white text-transparent'
            }`}>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <h4 className="text-ink text-[16px] font-semibold">
                تحميل كتالوج الأصناف الفعلية الجاهزة لنشاطك (موصى به بشدة)
              </h4>
              <p className="text-ink-muted text-[13px] mt-1 leading-relaxed">
                بيوفر عليك إدخال البيانات يدوياً — هيتم إنشاء {selectedTemplate?.productsCount || 35} صنف أساسي بأسمائها الواقعية وأسعارها وتكلفتها وباركوداتها الجاهزة للبيع فوراً مع إمكانية تعديلها أو حذفها في أي وقت.
              </p>
            </div>
          </div>

          {/* Reassurance Line */}
          <div className="flex items-center gap-2.5 px-1 text-ink-muted text-[13px]">
            <ShieldCheck className="w-5 h-5 text-paid shrink-0" />
            <span>تقدر في أي وقت من الإعدادات تعدل الأسعار والأصناف والأقسام</span>
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
      <div className="fixed inset-0 z-[9999] flex flex-row bg-canvas text-ink select-none overflow-hidden font-sans" dir="rtl">
        {/* RIGHT SIDE PANEL (360px wide, solid #0B4F42, matching designs) */}
        <aside className="w-[360px] h-full bg-[#0B4F42] text-white flex flex-col justify-between p-8 shrink-0 relative z-20 select-none">
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
            <div className="border border-white/20 rounded-[6px] p-4 mb-8 bg-white/[0.04]">
              <h2 className="text-white text-[16px] font-semibold mb-1">تخصيص النظام وتجهيز المحل</h2>
              <p className="text-white/75 text-[13px]">4 خطوات سهلة وتبقى جاهز تبيع</p>
            </div>

            {/* Vertical Stepper (4 steps) */}
            <div className="relative flex flex-col gap-6 pr-1">
              {/* Continuous vertical line behind badges */}
              <div className="absolute top-4 right-[13px] bottom-4 w-[1px] bg-white/25 -z-0 pointer-events-none" />

              {[
                { num: 1, title: 'نوع النشاط والكتالوج', desc: 'تحديد القالب وحقن الأصناف الفعلية', badge: '30+ صنف' },
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
                        {s.badge && (
                          <span className="text-[11px] text-white/90 border border-white/40 px-1.5 py-0.5 rounded-[4px] tabular-nums">
                            {s.badge}
                          </span>
                        )}
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
          <div className="pt-6 border-t border-white/15 flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 text-white">
              <Check className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              <span className="text-[13px] text-white/90">يعمل أوفلاين 100% بدون أي إنترنت</span>
            </div>
            <div className="flex items-center gap-2.5 text-white">
              <Check className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
              <span className="text-[13px] text-white/90">حماية مالية فائقة بمعاملات ذرية SQLite WAL</span>
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
          <main className="flex-1 h-full bg-canvas flex flex-col items-center justify-center p-12 select-none">
            <div className="w-[520px] flex flex-col items-center text-center">
              {/* 64px Outline Check in --paid */}
              <div className="w-16 h-16 rounded-[8px] border-2 border-paid/30 bg-white flex items-center justify-center text-paid mb-6 shadow-sm">
                <Check className="w-10 h-10 text-paid stroke-[2.5]" />
              </div>

              {/* Title */}
              <h1 className="text-ink text-[28px] font-semibold mb-3">
                تم تهيئة وتجهيز النظام بنجاح!
              </h1>

              {/* Description */}
              <p className="text-ink-muted text-[14px] leading-relaxed mb-8">
                تم إنشاء {appliedStats.categoriesCount} تصنيفات رئيسية، و{appliedStats.productsCount} صنف فعلي بباركود حقيقي جاهز للبيع فوراً، و{appliedStats.quickItemsCount} أزرار كاشير سريعة. جاري نقلك لشاشة نقطة البيع…
              </p>

              {/* 44px Progress Strip */}
              <div className="w-full h-[44px] bg-brand-soft border border-brand rounded-[6px] px-4 flex items-center justify-between relative overflow-hidden shadow-2xs">
                <span className="text-ink text-[13px] font-medium z-10">جاري تحميل بيانات المتجر الجديد…</span>
                <div className="flex items-center gap-2 z-10 font-mono text-[12px] text-brand font-semibold">
                  <span className="tabular-nums">100%</span>
                </div>
                {/* Indeterminate Animated Progress Bar at Bottom of Strip */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand/20 overflow-hidden">
                  <div className="h-full bg-brand w-2/3 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          </main>
        ) : (
          <main className="flex-1 h-full flex flex-col bg-canvas overflow-hidden">
            {/* STEP HEADER (72px, --surface, 1px bottom border) */}
            <header className="h-[72px] px-8 bg-surface border-b border-line flex items-center justify-between shrink-0 shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-brand border border-brand/40 bg-brand-soft px-2.5 py-0.5 rounded-[6px] font-medium">
                  الخطوة {step} من 4
                </span>
                <div>
                  <h1 className="text-[18px] font-semibold text-ink leading-tight">
                    {step === 1 && 'اختر نوع نشاط محلك التجاري'}
                    {step === 2 && 'بيانات المتجر وهوية الفاتورة'}
                    {step === 3 && 'طابعة الفواتير والنسخ الاحتياطي'}
                    {step === 4 && 'مراجعة التجهيزات والبدء الفعلي'}
                  </h1>
                  <p className="text-[13px] text-ink-muted mt-0.5">
                    {step === 1 && 'سيقوم رفيق بضبط الميزات، وتوليد الفئات، وتجهيز كتالوج أصناف فعلية بأسعار وباركودات جاهزة للبيع فوراً'}
                    {step === 2 && 'المعلومات اللي هتظهر في رأس وتذييل إيصال الكاشير للزبون'}
                    {step === 3 && 'حدد طابعة الإيصالات الحرارية ومسار النسخ الاحتياطي التلقائي لحماية بياناتك'}
                    {step === 4 && 'تأكيد الخيارات واعتماد التجهيز لفتح شاشة الكاشير وبدء البيع فوراً'}
                  </p>
                </div>
              </div>

              <div className="hidden sm:block">
                {step === 1 && (
                  <span className="text-[12px] text-ink-muted border border-line rounded-[6px] px-2.5 py-1 bg-surface tabular-nums">
                    {templates.length} قوالب متخصصة
                  </span>
                )}
                {step === 2 && (
                  <span className="text-[12px] text-brand border border-brand/40 bg-brand-soft px-2.5 py-1 rounded-[6px] font-medium">
                    معاينة حية للإيصال (80 مم)
                  </span>
                )}
                {step === 3 && (
                  <span className="text-[12px] text-ink-muted border border-line rounded-[6px] px-2.5 py-1 bg-surface tabular-nums">
                    {printers.length} طابعة مكتشفة
                  </span>
                )}
                {step === 4 && (
                  <span className="text-[12px] text-brand border border-brand/40 bg-brand-soft px-2.5 py-1 rounded-[6px] font-medium">
                    جاهز للاعتماد والتشغيل
                  </span>
                )}
              </div>
            </header>

            {/* STEP BODY (scrolls internally, 24px padding) */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {error && (
                <div className="p-3.5 bg-danger-soft border border-danger/40 rounded-[6px] text-xs text-danger flex items-center gap-2">
                  <span className="font-bold">تنبيه:</span>
                  <span>{error}</span>
                </div>
              )}

              {renderStepBody()}
            </div>

            {/* STEP FOOTER (80px, --surface, 1px top border) */}
            <footer className="h-[80px] px-8 bg-surface border-t border-line flex items-center justify-between shrink-0 shadow-2xs">
              <div className="text-ink-muted text-[14px]">
                <span>النشاط المختار: </span>
                <span className="font-semibold text-ink">{selectedTemplate?.name}</span>
                <span className="mx-2">·</span>
                <span className="tabular-nums font-semibold text-brand">
                  {selectedTemplate?.productsCount || 35} صنف جاهز للبيع
                </span>
              </div>

              <div className="flex items-center gap-4">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((prev) => (prev - 1) as any)}
                    disabled={loading}
                    className="h-[44px] px-5 border border-line rounded-[6px] bg-surface text-ink text-[14px] font-medium flex items-center gap-2 hover:bg-canvas cursor-pointer transition-colors"
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
                    className="h-[44px] px-7 bg-paid hover:bg-paid-hover text-white text-[14px] font-bold rounded-[6px] flex items-center gap-2 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
                    <span>تجهيز النظام وبدء نقطة البيع فوراً</span>
                  </button>
                )}
              </div>
            </footer>
          </main>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MODAL DIALOG VIEW (WHEN OPENED FROM SETTINGS - Matching 1_4 design)
  // --------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs text-ink select-none font-sans" dir="rtl">
      {/* MODAL CONTAINER (896px wide, max 85vh, 8px radius, 1px line border, modal-shadow) */}
      <div 
        className="w-[896px] max-h-[85vh] bg-surface rounded-[8px] border border-line shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* 1. MODAL HEADER (72px, --surface, 1px bottom border) */}
        <div className="h-[72px] bg-surface border-b border-line px-6 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[20px] font-semibold text-ink">معالج التجهيز السريع للنظام</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">تهيئة وتجهيز النظام حسب نشاط محلك</p>
          </div>
          {/* 44px dismiss button */}
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 border border-line rounded-[6px] bg-surface hover:bg-canvas text-ink flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق المعالج"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
        </div>

        {/* 2. HORIZONTAL STEPPER (64px, --surface-2, 1px bottom border) */}
        <div className="h-[64px] bg-[#F9FAFA] border-b border-line px-8 flex items-center justify-between shrink-0">
          {/* Step 1: نوع المحل */}
          <div className="flex items-center gap-2.5">
            {step > 1 ? (
              <div className="w-6 h-6 rounded-[4px] border border-brand bg-white text-brand flex items-center justify-center font-bold text-xs">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            ) : (
              <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
                step === 1 ? 'bg-brand text-white' : 'border border-line bg-white text-ink-muted'
              }`}>
                1
              </div>
            )}
            <span className={`text-sm ${step === 1 ? 'font-bold text-brand' : step > 1 ? 'font-medium text-brand' : 'font-medium text-ink-muted'}`}>
              نوع المحل
            </span>
          </div>

          {/* Connector 1-2 */}
          <div className={`flex-1 h-px mx-4 ${step > 1 ? 'bg-brand/40' : 'bg-line'}`} />

          {/* Step 2: بيانات الفاتورة */}
          <div className="flex items-center gap-2.5">
            {step > 2 ? (
              <div className="w-6 h-6 rounded-[4px] border border-brand bg-white text-brand flex items-center justify-center font-bold text-xs">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            ) : (
              <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
                step === 2 ? 'bg-brand text-white' : 'border border-line bg-white text-ink-muted'
              }`}>
                2
              </div>
            )}
            <span className={`text-sm ${step === 2 ? 'font-bold text-brand' : step > 2 ? 'font-medium text-brand' : 'font-medium text-ink-muted'}`}>
              بيانات الفاتورة
            </span>
          </div>

          {/* Connector 2-3 */}
          <div className={`flex-1 h-px mx-4 ${step > 2 ? 'bg-brand/40' : 'bg-line'}`} />

          {/* Step 3: الأجهزة */}
          <div className="flex items-center gap-2.5">
            {step > 3 ? (
              <div className="w-6 h-6 rounded-[4px] border border-brand bg-white text-brand flex items-center justify-center font-bold text-xs">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            ) : (
              <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
                step === 3 ? 'bg-brand text-white' : 'border border-line bg-white text-ink-muted'
              }`}>
                3
              </div>
            )}
            <span className={`text-sm ${step === 3 ? 'font-bold text-brand' : step > 3 ? 'font-medium text-brand' : 'font-medium text-ink-muted'}`}>
              الأجهزة
            </span>
          </div>

          {/* Connector 3-4 */}
          <div className={`flex-1 h-px mx-4 ${step > 3 ? 'bg-brand/40' : 'bg-line'}`} />

          {/* Step 4: المراجعة */}
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs tabular-nums ${
              step === 4 ? 'bg-brand text-white' : 'border border-line bg-white text-ink-muted'
            }`}>
              4
            </div>
            <span className={`text-sm ${step === 4 ? 'font-bold text-brand' : 'font-medium text-ink-muted'}`}>
              المراجعة
            </span>
          </div>
        </div>

        {/* 3. MODAL BODY (Scrolls internally, 24px padding) */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-canvas">
          {error && (
            <div className="p-3.5 bg-danger-soft border border-danger/40 rounded-[6px] text-xs text-danger flex items-center gap-2">
              <span className="font-bold">تنبيه:</span>
              <span>{error}</span>
            </div>
          )}

          {renderStepBody()}
        </div>

        {/* 4. MODAL FOOTER (72px, --surface, 1px top border) */}
        <div className="h-[72px] bg-surface border-t border-line px-6 flex items-center justify-between shrink-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => (prev - 1) as any)}
              disabled={loading}
              className="h-[44px] px-5 border border-line rounded-[6px] bg-surface text-ink text-[14px] font-medium flex items-center gap-2 hover:bg-canvas cursor-pointer transition-colors"
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
    </div>
  );
};
