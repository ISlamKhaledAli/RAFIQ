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
  Package,
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
  { id: 'supermarket', label: 'سوبرماركت ومواد غذائية', icon: ShoppingCart },
  { id: 'toys_kids', label: 'لعب أطفال وهدايا', icon: Package },
  { id: 'dairy_bakery', label: 'ألبان ومخبوزات', icon: Croissant },
  { id: 'accessories_gifts', label: 'إكسسوارات وموبايل', icon: Smartphone },
  { id: 'general_grocery', label: 'محل تجاري عام وتجزئة', icon: Store },
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
        className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-brand text-white px-6 py-5 flex items-center justify-between border-b border-brand-dark">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black">البيانات التجريبية وتدريب الكاشير</h2>
              <p className="text-xs text-white/80 mt-0.5">
                جرب النظام ودرب الموظفين براحتك من غير ما تلمس أي بضاعة أو فواتير حقيقية في المحل
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
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-canvas">
          {clearSuccessInfo && (
            <div className="bg-paid-soft border-2 border-paid rounded-2xl p-5 text-center space-y-3.5 animate-fadeIn shadow-md">
              <div className="w-14 h-14 bg-surface text-paid rounded-full flex items-center justify-center mx-auto shadow-inner border border-line">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-brand-dark">تم مسح كل البيانات التجريبية بنجاح!</h3>
                <p className="text-xs text-paid mt-1 font-bold leading-relaxed">
                  {clearSuccessInfo.message}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
                <div className="bg-surface border border-line rounded-xl p-2.5 shadow-2xs">
                  <span className="block text-2xl font-black text-ink">{clearSuccessInfo.deletedProducts}</span>
                  <span className="text-[11px] font-bold text-ink-muted">أصناف اتحذفت</span>
                </div>
                <div className="bg-surface border border-line rounded-xl p-2.5 shadow-2xs">
                  <span className="block text-2xl font-black text-ink">{clearSuccessInfo.deletedSales}</span>
                  <span className="text-[11px] font-bold text-ink-muted">فواتير اتحذفت</span>
                </div>
                <div className="bg-surface border border-line rounded-xl p-2.5 shadow-2xs">
                  <span className="block text-2xl font-black text-ink">{clearSuccessInfo.deletedCustomers}</span>
                  <span className="text-[11px] font-bold text-ink-muted">زبائن اتحذفوا</span>
                </div>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="w-full sm:w-auto px-5 py-2.5 bg-paid hover:bg-paid/90 text-white rounded-xl font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>تحديث الشاشة دلوقتي لتطبيق التغييرات</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClearSuccessInfo(null);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 bg-surface border border-line text-ink hover:bg-surface-2 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  إغلاق النافذة
                </button>
              </div>
              <p className="text-[11px] text-paid font-semibold animate-pulse">
                الشاشة هتحدث نفسها والكتالوج هيتجدد تلقائياً حالا...
              </p>
            </div>
          )}

          {message && !clearSuccessInfo && (
            <div
              className={`p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 ${
                message.type === 'success'
                  ? 'bg-paid-soft text-paid border border-paid-border'
                  : 'bg-danger-soft text-danger border border-danger-border'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-paid shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-danger shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Safety Guarantee Callout */}
          <div className="bg-surface border border-line rounded-xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-paid-soft text-paid flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="text-xs space-y-1">
              <span className="font-bold text-ink block text-sm">أمان تام وعزل لبضاعة وفلوس المحل الحقيقية</span>
              <p className="text-ink-muted leading-relaxed">
                كل الأصناف والزبائن والفواتير التجريبية متعلمة بكود خاص في النظام. لما تمسحها، بيتم حذف السجلات التجريبية دي بس، وفواتيرك وبضاعتك وزبائنك الحقيقيين اللي سجلتهم بيفضلوا محفوظين وسليمة 100%.
              </p>
            </div>
          </div>

          {/* Current Status Box */}
          <div className="border border-line rounded-xl p-4 space-y-3 bg-surface">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-muted tracking-wider">حالة البيانات التجريبية دلوقتي</span>
              {status.hasDemoData ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-warn-soft text-warn border border-warn-border">
                  <span className="w-2 h-2 rounded-full bg-warn animate-pulse" />
                  شغالة ومحملة في النظام
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface-2 text-ink-muted border border-line">
                  <MinusCircle className="w-3.5 h-3.5" />
                  مش محملة
                </span>
              )}
            </div>

            {status.hasDemoData ? (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="bg-canvas border border-line rounded-xl p-3 text-center">
                  <span className="text-2xl font-black text-ink block">{status.demoProductsCount}</span>
                  <span className="text-xs font-bold text-ink-muted">صنف تجريبي</span>
                </div>
                <div className="bg-canvas border border-line rounded-xl p-3 text-center">
                  <span className="text-2xl font-black text-ink block">{status.demoCustomersCount}</span>
                  <span className="text-xs font-bold text-ink-muted">زبون تجريبي</span>
                </div>
                <div className="bg-canvas border border-line rounded-xl p-3 text-center">
                  <span className="text-2xl font-black text-ink block">{status.demoSalesCount}</span>
                  <span className="text-xs font-bold text-ink-muted">فاتورة تجريبية</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-muted font-medium">
                مفيش بيانات تجريبية محملة دلوقتي. تقدر تنزل بضاعة وفواتير نموذجية لتجربة البيع وتدريب الكاشير.
              </p>
            )}
          </div>

          {/* Action 1: Load Demo Data */}
          {!status.hasDemoData && (
            <div className="space-y-3">
              {/* Remembered Active Activity Banner */}
              <div className="flex items-center justify-between p-3.5 bg-surface border border-line rounded-xl text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                    {(() => {
                      const opt = STORE_TYPE_OPTIONS.find(o => o.id === selectedStoreType) || STORE_TYPE_OPTIONS[0];
                      const Icon = opt.icon;
                      return <Icon className="w-4 h-4 text-brand" />;
                    })()}
                  </div>
                  <div>
                    <span className="text-[11px] text-ink-muted font-semibold block">نشاط المحل المعتمد تلقائياً:</span>
                    <span className="font-bold text-ink text-xs">
                      {(STORE_TYPE_OPTIONS.find(o => o.id === selectedStoreType) || STORE_TYPE_OPTIONS[0]).label}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTypeSelector(prev => !prev)}
                  className="px-2.5 py-1 text-[11px] font-bold text-brand hover:text-brand-dark bg-canvas hover:bg-surface-2 border border-line rounded-lg transition-colors cursor-pointer"
                >
                  {showTypeSelector ? 'إخفاء الخيارات' : 'تغيير النشاط'}
                </button>
              </div>

              {/* Show the selection grid ONLY if the user clicks "تغيير النشاط" */}
              {showTypeSelector && (
                <div className="p-3 bg-surface border border-line rounded-xl space-y-2 animate-fadeIn">
                  <label className="block text-xs font-bold text-ink">
                    اختر نشاط المحل عشان ننزل أصناف مناسبة ليه:
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
                              ? 'border-brand bg-brand/10 text-brand font-bold shadow-2xs ring-1 ring-brand'
                              : 'border-line bg-surface hover:bg-surface-2 text-ink'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-brand' : 'text-ink-muted'}`} />
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
                className="w-full py-3 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري تنزيل البيانات...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>تنزيل أصناف تجريبية لـ «{(STORE_TYPE_OPTIONS.find(o => o.id === selectedStoreType) || STORE_TYPE_OPTIONS[0]).label}»</span>
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
                  className="w-full py-2.5 bg-danger-soft hover:bg-danger-soft/80 text-danger border border-danger-border rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{status.hasDemoData ? 'مسح كل البيانات التجريبية واختبارات الحمل' : 'مسح وقائي لأي بيانات أو أصناف تجريبية متبقية'}</span>
                </button>
              ) : (
                <div className="bg-danger-soft border-2 border-danger-border rounded-xl p-4 space-y-3 animate-fadeIn shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-danger shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-danger">متأكد إنك عاوز تمسح كل البيانات التجريبية واختبارات الحمل؟</h4>
                      <p className="text-xs text-ink mt-1 leading-relaxed font-medium">
                        النظام هيفحص قاعدة البيانات بالكامل، ويمسح أي أصناف تجريبية (بما فيها أصناف اختبار الحمل والتدريب)
                        والفواتير والزبائن التجريبيين بأمان تام، ومش هيلمس أي فواتير أو أصناف حقيقية أنشأتها بنفسك.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      disabled={loading}
                      className="px-3.5 py-1.5 text-xs font-bold text-ink bg-surface border border-line rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleClearDemo}
                      disabled={loading}
                      className="px-5 py-2 text-xs font-bold text-white bg-danger hover:bg-danger/90 rounded-lg shadow-md transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>جاري الفحص والحذف من قاعدة البيانات...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>أيوه، امسح كل البيانات التجريبية</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Start First Run Setup Wizard */}
          <div className="border-t border-line pt-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-ink block">إعادة ضبط وإعداد المحل من الصفر</span>
              <span className="text-[11px] text-ink-muted">تحديد اسم المحل، النشاط، الفئات، ونظام البيع كأول تشغيل</span>
            </div>
            <button
              type="button"
              onClick={handleStartWizardFresh}
              disabled={isTriggeringWizard}
              className="px-3.5 py-2 text-xs font-bold text-brand bg-brand-soft hover:bg-brand/20 border border-brand/30 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
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
            <div className="border-t border-line pt-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-ink block">الجولة السريعة لشرح النظام</span>
                <span className="text-[11px] text-ink-muted">جولة من 5 خطوات تشرح شاشات البرنامج وأزرار البيع</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartTour();
                }}
                className="px-3.5 py-2 text-xs font-bold text-paid bg-paid-soft hover:bg-paid-soft/80 border border-paid-border rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Compass className="w-4 h-4" />
                بدء الجولة دلوقتي
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-surface border-t border-line px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-ink bg-surface border border-line rounded-xl hover:bg-surface-2 transition-colors shadow-sm cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
