import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Store, 
  ShoppingCart, 
  Milk, 
  Gift, 
  Printer, 
  HardDrive, 
  CheckCircle2, 
  ArrowLeft, 
  ArrowRight, 
  Loader2, 
  ShieldCheck, 
  X
} from 'lucide-react';
import { invoke } from '../bridge/ipc';

export interface StoreTemplateDto {
  id: string;
  name: string;
  description: string;
  icon: string;
  featureFlags: Record<string, boolean>;
  categories: string[];
  quickItems: { Name: string; PricePiasters: number; Unit: string; CategoryName: string; IsOpenPrice?: boolean }[];
  defaultSettings?: Record<string, string>;
}

export interface FirstRunWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

export const FirstRunWizardModal: React.FC<FirstRunWizardModalProps> = ({
  isOpen,
  onClose,
  onCompleted,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<StoreTemplateDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('supermarket');

  // Step 2: Store Profile
  const [storeName, setStoreName] = useState('سوبرماركت رفيق');
  const [phone, setPhone] = useState('01012345678');
  const [address, setAddress] = useState('الشارع الرئيسي - وسط البلد');
  const [receiptHeader, setReceiptHeader] = useState('أهلاً بكم في متجرنا');
  const [receiptFooter, setReceiptFooter] = useState('شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً');

  // Step 3: Hardware & Backup
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [backupFolder, setBackupFolder] = useState<string>('D:\\RafiqBackups');
  const [loadDemoData, setLoadDemoData] = useState<boolean>(false);

  // Result state
  const [appliedStats, setAppliedStats] = useState<{ categoriesCount: number; quickItemsCount: number } | null>(null);

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
            setTemplates(tplList);
            setSelectedTemplateId(tplList[0].id);
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
      });

      if (res && res.success) {
        if (loadDemoData) {
          try {
            await invoke('demo:load', { storeType: selectedTemplateId });
          } catch {
            // Non-blocking
          }
        }
        setAppliedStats({
          categoriesCount: res.categoriesCount || 0,
          quickItemsCount: res.quickItemsCount || 0,
        });
        setTimeout(() => {
          onCompleted();
        }, 1200);
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

  const getTemplateIcon = (iconName: string) => {
    switch (iconName) {
      case 'shopping-cart':
        return <ShoppingCart className="w-5 h-5 text-emerald-600" />;
      case 'milk':
        return <Milk className="w-5 h-5 text-blue-600" />;
      case 'gift':
        return <Gift className="w-5 h-5 text-purple-600" />;
      default:
        return <Store className="w-5 h-5 text-amber-600" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in text-slate-800 dark:text-slate-100">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-[#00372d] text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/30 flex items-center justify-center border border-emerald-500/30">
              <Sparkles className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg leading-tight">معالج التجهيز السريع للنظام</h2>
              <p className="text-xs text-emerald-100/70">
                تهيئة وتجهيز النظام حسب نشاط محلك في أقل من دقيقتين (Feature #106)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
          <div className={`flex items-center gap-2 ${step === 1 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-[#006d41] text-white' : (step > 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600')}`}>
              {step > 1 ? '✓' : '1'}
            </span>
            <span>نوع المحل</span>
          </div>
          <div className="h-[2px] w-6 bg-slate-200 dark:bg-slate-700" />
          <div className={`flex items-center gap-2 ${step === 2 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-[#006d41] text-white' : (step > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600')}`}>
              {step > 2 ? '✓' : '2'}
            </span>
            <span>بيانات الفاتورة</span>
          </div>
          <div className="h-[2px] w-6 bg-slate-200 dark:bg-slate-700" />
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-[#006d41] text-white' : (step > 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600')}`}>
              {step > 3 ? '✓' : '3'}
            </span>
            <span>الأجهزة والحفظ</span>
          </div>
          <div className="h-[2px] w-6 bg-slate-200 dark:bg-slate-700" />
          <div className={`flex items-center gap-2 ${step === 4 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 4 ? 'bg-[#006d41] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'}`}>
              4
            </span>
            <span>التأكيد والبدء</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-sm space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <span className="font-bold">تنبيه:</span>
              <span>{error}</span>
            </div>
          )}

          {appliedStats && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-emerald-900 dark:text-emerald-200">
                تم تهيئة النظام وتطبيق القالب بنجاح!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                تم إنشاء {appliedStats.categoriesCount} تصنيفات رئيسية و {appliedStats.quickItemsCount} أصناف سريعة. جاري تحويلك لشاشة البيع...
              </p>
            </div>
          )}

          {/* STEP 1: Select Store Template (Task 106-1 & 106-2) */}
          {!appliedStats && step === 1 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                اختر نوع النشاط التجاري الذي يطابق محلك؛ سيقوم النظام بتفعيل الميزات والتصنيفات والأزرار السريعة المناسبة تلقائياً:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map((tpl) => {
                  const isSelected = tpl.id === selectedTemplateId;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl.id)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-[#006d41] bg-emerald-50/60 dark:bg-emerald-950/30 shadow-md'
                          : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                          {getTemplateIcon(tpl.icon)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                              {tpl.name}
                            </span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#006d41] text-white">
                                محدد
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {tpl.description}
                          </p>
                        </div>
                      </div>

                      {/* Summary Tags */}
                      <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-semibold">
                          {tpl.categories.length} تصنيفات
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-semibold">
                          {tpl.quickItems.length} أزرار سريعة
                        </span>
                        {tpl.featureFlags?.feature_scale_weight && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                            دعم الميزان
                          </span>
                        )}
                        {tpl.featureFlags?.feature_expiry_dates && (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                            تاريخ الصلاحية
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: Store Profile & Receipt Settings */}
          {!appliedStats && step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                هذه البيانات ستظهر في أعلى وأسفل فاتورة الكاشير المطبوعة للزبائن:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    اسم المحل / المنشأة *
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الهاتف / خدمة العملاء *
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  العنوان بالتفصيل
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رسالة الترحيب أعلى الفاتورة
                  </label>
                  <input
                    type="text"
                    value={receiptHeader}
                    onChange={(e) => setReceiptHeader(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    شروط الاستبدال أسفل الفاتورة
                  </label>
                  <input
                    type="text"
                    value={receiptFooter}
                    onChange={(e) => setReceiptFooter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Hardware & Backup Folder */}
          {!appliedStats && step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-sm">
                  <Printer className="w-4 h-4 text-emerald-600" />
                  <span>طابعة الفواتير الافتراضية (Thermal Receipt Printer)</span>
                </div>
                <p className="text-xs text-slate-500">
                  اختر الطابعة المتصلة بجهاز الكاشير للطباعة الفورية للفواتير:
                </p>

                <select
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">-- بدون طابعة افتراضية (معاينة فقط) --</option>
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? '(الافتراضية في ويندوز)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-sm">
                  <HardDrive className="w-4 h-4 text-emerald-600" />
                  <span>مسار النسخ الاحتياطي التلقائي (Backup Location)</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  يُفضل اختيار مسار على قرص غير قرص النظام (مثلاً القرص D أو فلاشة USB متصلة) لضمان حماية بياناتك من أي عطل في ويندوز:
                </p>

                <input
                  type="text"
                  value={backupFolder}
                  onChange={(e) => setBackupFolder(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="D:\RafiqBackups"
                />
              </div>
            </div>
          )}

          {/* STEP 4: Review and Confirm (Task 106-3) */}
          {!appliedStats && step === 4 && (
            <div className="space-y-4">
              <div className="text-center py-2 space-y-1">
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  مراجعة التجهيزات والبدء
                </h3>
                <p className="text-xs text-slate-500">
                  تحقق من الملخص أدناه، واضغط «تجهيز النظام والبدء» لإنشاء التصنيفات والأزرار فوراً
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-slate-400 font-bold block text-[10px]">نوع المحل المختار:</span>
                  <span className="font-extrabold text-sm text-[#006d41] dark:text-emerald-400">
                    {selectedTemplate?.name}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-slate-400 font-bold block text-[10px]">اسم المنشأة:</span>
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                    {storeName}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-slate-400 font-bold block text-[10px]">التصنيفات الجاهزة:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {selectedTemplate?.categories?.length || 0} تصنيف (تلقائي)
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-slate-400 font-bold block text-[10px]">أزرار الكاشير السريعة:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {selectedTemplate?.quickItems?.length || 0} صنف سريع
                  </span>
                </div>
              </div>

              {/* Demo Data Option (Task 113-1 & 113-2) */}
              <label className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl flex items-center justify-between cursor-pointer hover:bg-amber-100/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={loadDemoData}
                    onChange={(e) => setLoadDemoData(e.target.checked)}
                    className="w-4 h-4 text-[#006d41] rounded border-slate-300 focus:ring-[#006d41]"
                  />
                  <div>
                    <span className="font-bold text-xs text-amber-950 dark:text-amber-200 block">
                      تحميل أصناف وبيانات تجريبية للتدريب الفوري (اختياري)
                    </span>
                    <span className="text-[10px] text-amber-800/80 dark:text-amber-400 block">
                      تساعدك على تجربة شاشة البيع فوراً، ويمكن مسحها بضغطة زر واحدة لاحقاً من شاشة الإعدادات.
                    </span>
                  </div>
                </div>
              </label>

              {/* Notice */}
              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>يمكنك في أي وقت لاحق تعديل الأسعار، إضافة أصناف جديدة، أو تغيير أي إعداد من شاشة الإعدادات.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        {!appliedStats && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                disabled={loading}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
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
                className="px-5 py-2.5 bg-[#00372d] hover:bg-[#004e40] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>التالي</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={loading}
                className="px-6 py-2.5 bg-[#006d41] hover:bg-[#005835] text-white font-extrabold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>تجهيز النظام والبدء الآن</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
