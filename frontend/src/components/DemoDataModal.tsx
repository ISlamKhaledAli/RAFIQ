import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '../bridge/ipc';
import {
  FlaskConical,
  X,
  CheckCircle2,
  AlertCircle,
  Shield,
  MinusCircle,
  Loader2,
  Download,
  Trash2,
  AlertTriangle,
  Check,
  Compass,
  ShoppingCart,
  Croissant,
  Smartphone,
  Store,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface DemoDataStatus {
  hasDemoData: boolean;
  demoProductsCount: number;
  demoSalesCount: number;
  demoCustomersCount: number;
}

interface DemoDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour?: () => void;
  onDataChanged?: () => void;
}

const STORE_TYPE_OPTIONS = [
  { id: 'supermarket', label: 'سوبرماركت وبقالة', icon: ShoppingCart },
  { id: 'dairy_bakery', label: 'ألبان ومخبوزات', icon: Croissant },
  { id: 'accessories_gifts', label: 'إكسسوارات وموبايل', icon: Smartphone },
  { id: 'general_grocery', label: 'محل تجاري عام', icon: Store },
];

export const DemoDataModal: React.FC<DemoDataModalProps> = ({
  isOpen,
  onClose,
  onStartTour,
  onDataChanged,
}) => {
  const [status, setStatus] = useState<DemoDataStatus>({
    hasDemoData: false,
    demoProductsCount: 0,
    demoSalesCount: 0,
    demoCustomersCount: 0,
  });
  const [selectedStoreType, setSelectedStoreType] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('rafiq_preferred_store_type');
      if (saved) return saved;
      const wizardState = localStorage.getItem('rafiq_wizard_state');
      if (wizardState) {
        const parsed = JSON.parse(wizardState);
        if (parsed.selectedTemplateId) {
          if (parsed.selectedTemplateId.includes('bakery') || parsed.selectedTemplateId.includes('dairy')) return 'dairy_bakery';
          if (parsed.selectedTemplateId.includes('accessories') || parsed.selectedTemplateId.includes('mobile')) return 'accessories_gifts';
          if (parsed.selectedTemplateId.includes('general')) return 'general_grocery';
          return 'supermarket';
        }
      }
    } catch {
      // ignore
    }
    return 'supermarket';
  });
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [clearSuccessInfo, setClearSuccessInfo] = useState<{
    message: string;
    deletedProducts: number;
    deletedSales: number;
    deletedCustomers: number;
  } | null>(null);
  const [isTriggeringWizard, setIsTriggeringWizard] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await invoke<DemoDataStatus>('demo:getStatus');
      if (res) {
        setStatus(res);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (isOpen) {
      void (async () => {
        try {
          const res = await invoke<DemoDataStatus>('demo:getStatus');
          if (active && res) {
            setStatus(res);
          }
        } catch {
          // ignore
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoadDemo = async () => {
    setLoading(true);
    setMessage(null);
    setClearSuccessInfo(null);
    try {
      const res = await invoke<{ success: boolean; message: string }>('demo:load', {
        storeType: selectedStoreType,
      });
      if (res && res.success) {
        setMessage({ text: res.message || 'تم تحميل البيانات التجريبية بنجاح!', type: 'success' });
        await refreshStatus();
        if (onDataChanged) onDataChanged();
      } else {
        setMessage({ text: 'فشل تحميل البيانات التجريبية.', type: 'error' });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'تعذر تحميل البيانات التجريبية.';
      setMessage({ text: errMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemo = async () => {
    setLoading(true);
    setMessage(null);
    setClearSuccessInfo(null);
    try {
      const res = await invoke<{
        success: boolean;
        message: string;
        deletedProducts?: number;
        deletedSales?: number;
        deletedCustomers?: number;
      }>('demo:clear');
      if (res && res.success) {
        setClearSuccessInfo({
          message: res.message || 'تم مسح كافة البيانات التجريبية بنجاح!',
          deletedProducts: res.deletedProducts ?? 0,
          deletedSales: res.deletedSales ?? 0,
          deletedCustomers: res.deletedCustomers ?? 0,
        });
        setShowClearConfirm(false);
        await refreshStatus();
        if (onDataChanged) onDataChanged();
        window.dispatchEvent(new CustomEvent('rafiq:catalog-updated'));
        window.dispatchEvent(new CustomEvent('rafiq:demo-cleared'));
        setTimeout(() => {
          window.location.reload();
        }, 2200);
      } else {
        setMessage({ text: 'فشل مسح البيانات التجريبية.', type: 'error' });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'تعذر مسح البيانات التجريبية.';
      setMessage({ text: errMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStartWizardFresh = async () => {
    setIsTriggeringWizard(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('rafiq_first_run_completed');
        localStorage.removeItem('rafiq_wizard_state');
      }
      await invoke('settings:save', { first_run_completed: '0' });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black">البيانات التجريبية والتدريب</h2>
              <p className="text-xs text-emerald-200 mt-0.5">
                تجربة النظام وتدريب الموظفين دون المساس ببيانات المحل الحقيقية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {clearSuccessInfo && (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-5 text-center space-y-3.5 animate-fadeIn shadow-md">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-emerald-950">تم مسح كافة البيانات التجريبية بنجاح!</h3>
                <p className="text-xs text-emerald-800 mt-1 font-bold leading-relaxed">
                  {clearSuccessInfo.message}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
                <div className="bg-white border border-emerald-200 rounded-xl p-2.5 shadow-2xs">
                  <span className="block text-2xl font-black text-emerald-900">{clearSuccessInfo.deletedProducts}</span>
                  <span className="text-[11px] font-bold text-slate-500">أصناف محذوفة</span>
                </div>
                <div className="bg-white border border-emerald-200 rounded-xl p-2.5 shadow-2xs">
                  <span className="block text-2xl font-black text-emerald-900">{clearSuccessInfo.deletedSales}</span>
                  <span className="text-[11px] font-bold text-slate-500">فواتير محذوفة</span>
                </div>
                <div className="bg-white border border-emerald-200 rounded-xl p-2.5 shadow-2xs">
                  <span className="block text-2xl font-black text-emerald-900">{clearSuccessInfo.deletedCustomers}</span>
                  <span className="text-[11px] font-bold text-slate-500">عملاء محذوفين</span>
                </div>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>تحديث الشاشة الآن لتطبيق التغييرات</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClearSuccessInfo(null);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-50 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  إغلاق النافذة
                </button>
              </div>
              <p className="text-[11px] text-emerald-700 font-semibold animate-pulse">
                سيتم إعادة تحميل الشاشة وتحديث الكتالوج خلال لحظات تلقائياً...
              </p>
            </div>
          )}

          {message && !clearSuccessInfo && (
            <div
              className={`p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-red-50 text-red-900 border border-red-300'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Safety Guarantee Callout */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="text-xs space-y-1">
              <span className="font-bold text-slate-800 block text-sm">عزل آمن للبيانات التجريبية</span>
              <p className="text-slate-600 leading-relaxed">
                جميع الأصناف والعملاء والفواتير التجريبية تحمل وسماً خاصاً بها داخل قاعدة البيانات. عند طلب مسح البيانات
                التجريبية، يتم حذف العناصر ذات الوسم فقط ولن تمس أي فواتير أو أصناف حقيقية أضفتها بنفسك.
              </p>
            </div>
          </div>

          {/* Current Status Box */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">حالة البيانات الحالية</span>
              {status.hasDemoData ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  مفعلة في النظام
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                  <MinusCircle className="w-3.5 h-3.5" />
                  غير محملة
                </span>
              )}
            </div>

            {status.hasDemoData ? (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-center">
                  <span className="text-2xl font-black text-amber-900 block">{status.demoProductsCount}</span>
                  <span className="text-xs font-bold text-amber-700">أصناف تجريبية</span>
                </div>
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-center">
                  <span className="text-2xl font-black text-amber-900 block">{status.demoCustomersCount}</span>
                  <span className="text-xs font-bold text-amber-700">عملاء تجريبيين</span>
                </div>
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-center">
                  <span className="text-2xl font-black text-amber-900 block">{status.demoSalesCount}</span>
                  <span className="text-xs font-bold text-amber-700">فواتير تجريبية</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-medium">
                لا توجد بيانات تجريبية محملة حالياً. يمكنك تحميل باقة أصناف نموذجية لتجربة البيع والتدريب.
              </p>
            )}
          </div>

          {/* Action 1: Load Demo Data */}
          {!status.hasDemoData && (
            <div className="space-y-3">
              {/* Remembered Active Activity Banner */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    {(() => {
                      const opt = STORE_TYPE_OPTIONS.find(o => o.id === selectedStoreType) || STORE_TYPE_OPTIONS[0];
                      const Icon = opt.icon;
                      return <Icon className="w-4 h-4 text-emerald-700" />;
                    })()}
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-semibold block">نشاط المحل المعتمد تلقائياً:</span>
                    <span className="font-bold text-slate-900 text-xs">
                      {(STORE_TYPE_OPTIONS.find(o => o.id === selectedStoreType) || STORE_TYPE_OPTIONS[0]).label}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTypeSelector(prev => !prev)}
                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer"
                >
                  {showTypeSelector ? 'إخفاء الخيارات' : 'تغيير النشاط'}
                </button>
              </div>

              {/* Show the selection grid ONLY if the user clicks "تغيير النشاط" */}
              {showTypeSelector && (
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 animate-fadeIn">
                  <label className="block text-xs font-bold text-slate-700">
                    اختر نشاط المتجر لتحميل أصناف ملائمة له:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {STORE_TYPE_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const isSelected = selectedStoreType === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSelectedStoreType(opt.id);
                            localStorage.setItem('rafiq_preferred_store_type', opt.id);
                            setShowTypeSelector(false);
                          }}
                          className={`p-2.5 rounded-lg border text-right transition-all flex items-center gap-2.5 cursor-pointer ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-2xs ring-1 ring-emerald-500'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`} />
                          <span className="text-xs font-bold">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleLoadDemo}
                disabled={loading}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded-xl font-bold shadow hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري تحميل البيانات...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>تحميل أصناف تجريبية لـ «{(STORE_TYPE_OPTIONS.find(o => o.id === selectedStoreType) || STORE_TYPE_OPTIONS[0]).label}»</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Action 2: Clear Demo Data with Confirmation */}
          {!clearSuccessInfo && (
            <div className="space-y-3 pt-1">
              {!showClearConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={loading}
                  className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{status.hasDemoData ? 'مسح كافة البيانات التجريبية واختبارات الحمل' : 'مسح وقائي لأي بيانات أو أصناف تجريبية متبقية'}</span>
                </button>
              ) : (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-3 animate-fadeIn shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-red-900">تأكيد مسح كافة البيانات التجريبية واختبارات الحمل؟</h4>
                      <p className="text-xs text-red-800 mt-1 leading-relaxed font-medium">
                        سيقوم النظام بفحص قاعدة البيانات بالكامل، وحذف أي أصناف تجريبية (بما فيها أصناف اختبار الحمل والتدريب)
                        والفواتير والعملاء التجريبيين بأمان تام، ولن تمس أي فواتير أو أصناف حقيقية أنشأتها بنفسك.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      disabled={loading}
                      className="px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleClearDemo}
                      disabled={loading}
                      className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-md transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>جاري الفحص والحذف من قاعدة البيانات...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>نعم، امسح كافة البيانات التجريبية</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Start First Run Setup Wizard */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-800 block">بدء الإعداد الأولي للمحل من الصفر</span>
              <span className="text-[11px] text-slate-500">تحديد اسم المحل، النشاط، الفئات، ونظام البيع كأول تشغيل</span>
            </div>
            <button
              type="button"
              onClick={handleStartWizardFresh}
              disabled={isTriggeringWizard}
              className="px-3.5 py-2 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              {isTriggeringWizard ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الفتح...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  تشغيل معالج الإعداد (Wizard)
                </>
              )}
            </button>
          </div>

          {/* Start Tour Button */}
          {onStartTour && (
            <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 block">الجولة التعريفية التفاعلية</span>
                <span className="text-[11px] text-slate-500">جولة من 5 خطوات تشرح كافة شاشات البرنامج والاختصارات</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartTour();
                }}
                className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Compass className="w-4 h-4" />
                بدء الجولة الآن
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
