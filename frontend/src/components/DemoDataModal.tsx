import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '../bridge/ipc';

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
  const [selectedStoreType, setSelectedStoreType] = useState('supermarket');
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
    try {
      const res = await invoke<{ success: boolean; message: string }>('demo:clear');
      if (res && res.success) {
        setMessage({ text: res.message || 'تم مسح البيانات التجريبية بأمان.', type: 'success' });
        setShowClearConfirm(false);
        await refreshStatus();
        if (onDataChanged) onDataChanged();
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
              <i className="fas fa-flask" />
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
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
          >
            <i className="fas fa-times text-lg" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {message && (
            <div
              className={`p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-red-50 text-red-900 border border-red-300'
              }`}
            >
              <i
                className={`fas ${message.type === 'success' ? 'fa-check-circle text-emerald-600' : 'fa-exclamation-circle text-red-600'}`}
              />
              <span>{message.text}</span>
            </div>
          )}

          {/* Safety Guarantee Callout */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 text-lg">
              <i className="fas fa-shield-alt" />
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
                  <i className="fas fa-minus-circle" />
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
              <label className="block text-sm font-bold text-slate-800">
                اختر نشاط المحل لتحميل أصناف نموذجية ملائمة:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'supermarket', label: 'سوبرماركت وبقالة', icon: 'fa-shopping-cart' },
                  { id: 'dairy_bakery', label: 'ألبان ومخبوزات', icon: 'fa-cheese' },
                  { id: 'accessories_gifts', label: 'إكسسوارات وموبايل', icon: 'fa-mobile-alt' },
                  { id: 'general_grocery', label: 'محل تجاري عام', icon: 'fa-store' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedStoreType(opt.id)}
                    className={`p-3 rounded-xl border text-right transition-all flex items-center gap-3 ${
                      selectedStoreType === opt.id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <i className={`fas ${opt.icon} text-lg ${selectedStoreType === opt.id ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleLoadDemo}
                disabled={loading}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded-xl font-bold shadow hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin" />
                    جاري تحميل البيانات...
                  </>
                ) : (
                  <>
                    <i className="fas fa-download" />
                    تحميل البيانات التجريبية الآن
                  </>
                )}
              </button>
            </div>
          )}

          {/* Action 2: Clear Demo Data with Confirmation */}
          {status.hasDemoData && (
            <div className="space-y-3 pt-1">
              {!showClearConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={loading}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <i className="fas fa-trash-alt" />
                  مسح كافة البيانات التجريبية
                </button>
              ) : (
                <div className="bg-red-50/90 border border-red-200 rounded-xl p-4 space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <i className="fas fa-exclamation-triangle text-red-600 text-xl shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-red-900">تأكيد مسح البيانات التجريبية؟</h4>
                      <p className="text-xs text-red-800 mt-1 leading-relaxed">
                        سيتم حذف كافة الأصناف والعملاء والفواتير التجريبية فقط. أي أصناف أو مبيعات حقيقية قمت بإضافتها
                        ستظل محفوظة تماماً في قاعدة البيانات.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleClearDemo}
                      disabled={loading}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <i className="fas fa-spinner fa-spin" />
                          جاري المسح...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check" />
                          نعم، امسح البيانات التجريبية
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <i className="fas fa-compass" />
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
