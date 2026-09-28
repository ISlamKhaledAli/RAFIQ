import { useState } from 'react';
import { 
  AlertTriangle, 
  Trash2, 
  ShieldAlert, 
  RefreshCw, 
  X, 
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { invoke } from '../bridge/ipc';

interface FactoryResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetCompleted?: () => void;
}

export const FactoryResetModal = ({
  isOpen,
  onClose,
  onResetCompleted,
}: FactoryResetModalProps) => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim() === 'مسح' || confirmText.trim() === 'تأكيد';

  const handleExecuteReset = async () => {
    if (!isConfirmed || loading) return;
    setLoading(true);
    setResultMessage(null);

    try {
      const res = await invoke<{
        success: boolean;
        message: string;
        deletedSalesCount?: number;
        deletedProductsCount?: number;
        deletedCustomersCount?: number;
      }>('system:factoryReset');

      if (res && res.success) {
        setResultMessage({ text: res.message || 'تم تصفير ومسح كافة البيانات بنجاح.', isError: false });
        setTimeout(() => {
          if (onResetCompleted) {
            onResetCompleted();
          } else {
            window.location.reload();
          }
        }, 1500);
      } else {
        setResultMessage({ text: res?.message || 'تعذر تصفير البيانات.', isError: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultMessage({ text: `فشل مسح البيانات: ${msg}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-red-200 max-w-lg w-full overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="bg-red-50/90 border-b border-red-200/80 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-300 flex items-center justify-center text-red-700 shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-red-950 m-0 leading-tight">
                تصفير ومسح كافة البيانات (إعادة ضبط المصنع)
              </h3>
              <p className="text-xs text-red-700 m-0 mt-0.5 font-medium">
                حذف شامل للفواتير والأصناف والعملاء للبدء كمتجر جديد
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs font-sans">
          {/* Warning Banner */}
          <div className="p-3.5 bg-red-50/60 border border-red-200/90 rounded-xl flex items-start gap-3 text-red-900 leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-[13px] block text-red-950">
                انتباه: هذا الإجراء نهائي ولا يمكن التراجع عنه!
              </span>
              <p className="m-0 text-red-800 text-xs">
                سيتم تصفير قاعدة البيانات بالكامل ومسح ما يلي:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-red-800 text-[11.5px] mt-1 pr-1 font-medium">
                <li>كافة فواتير المبيعات السابقة وتصفير رقم الفاتورة ليبدأ من #1.</li>
                <li>كافة الأصناف، الباركودات، وأرصدة وحركات المخزن.</li>
                <li>كافة حسابات العملاء وديون البيع الآجل وسجل المدفوعات.</li>
                <li>سجل العمليات الحساسة (يتم ختم سجل جديد تماماً).</li>
              </ul>
            </div>
          </div>

          {/* Safe retention info */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5 text-slate-700">
            <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-[11.5px]">
              <strong>ما الذي سيظل محفوظاً؟</strong> سيظل ترخيص البرنامج وحساب المدير وبيانات المتجر الأساسية محفوظة دون الحاجة لإعادة التفعيل.
            </span>
          </div>

          {/* Feedback Message */}
          {resultMessage && (
            <div className={`p-3 rounded-xl border flex items-center gap-2.5 font-bold ${
              resultMessage.isError 
                ? 'bg-red-50 border-red-300 text-red-800' 
                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
            }`}>
              {resultMessage.isError ? (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>{resultMessage.text}</span>
            </div>
          )}

          {/* Verification Input Guard */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-slate-800 font-bold text-xs">
              لتأكيد المسح، اكتب كلمة <span className="font-black text-red-600">«مسح»</span> أو <span className="font-black text-red-600">«تأكيد»</span> في الحقل أدناه:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="اكتب: مسح"
              disabled={loading}
              className="w-full h-10 px-3 border-2 border-slate-200 focus:border-red-500 rounded-xl text-center font-bold text-sm text-red-900 bg-white placeholder:text-slate-400 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
          >
            إلغاء وتراجع
          </button>

          <button
            type="button"
            onClick={() => void handleExecuteReset()}
            disabled={!isConfirmed || loading}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-xs font-black shadow transition-all cursor-pointer flex items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>جاري مسح وتصفير البيانات...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>نعم، تصفير ومسح كل شيء الآن</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
