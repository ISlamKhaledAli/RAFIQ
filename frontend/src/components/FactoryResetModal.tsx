import React, { useState } from 'react';
import { 
  Trash2, 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Loader2, 
  HardDrive,
  Database,
  FileSpreadsheet,
  Users
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface FactoryResetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FactoryResetModal: React.FC<FactoryResetModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty: false,
  });

  const [wipeBackups, setWipeBackups] = useState(true);
  const [confirmWord, setConfirmWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    success: boolean;
    message: string;
    deletedSalesCount?: number;
    deletedProductsCount?: number;
    deletedCustomersCount?: number;
  } | null>(null);

  if (!isOpen) return null;

  const isConfirmed = confirmWord.trim() === 'مسح' || confirmWord.trim() === 'تأكيد';

  const handleExecuteReset = async () => {
    if (!isConfirmed || loading) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await invoke<{
        success: boolean;
        message: string;
        deletedSalesCount?: number;
        deletedProductsCount?: number;
        deletedCustomersCount?: number;
      }>('system:factoryReset', { wipeBackups });

      if (res && res.success) {
        setSuccessResult(res);

        // Clear local browser storage
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // ignore
        }

        // Auto reload after brief success acknowledgment
        setTimeout(() => {
          window.location.reload();
        }, 1800);
      } else {
        setErrorMessage(res?.message || 'تعذر إتمام عملية مسح وتصفير البيانات.');
        setLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`حدث خطأ أثناء تصفير النظام: ${msg}`);
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col text-xs text-ink dark:text-ink-dark animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-danger text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white m-0">
                تصفير ومسح كافة البيانات نهائياً (إعادة ضبط المصنع)
              </h3>
              <p className="text-[11px] text-white/80 m-0">
                تنظيف كامل لقاعدة البيانات لتبدأ العمل من الصفر كأن النظام مثبت لأول مرة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4">
          {successResult ? (
            <div className="p-5 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-bright/30 rounded-xl flex flex-col items-center justify-center text-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-10 h-10 text-paid dark:text-paid-bright" />
              <div className="text-sm font-bold text-paid dark:text-paid-bright">
                {successResult.message}
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0">
                جاري إعادة تحميل البرنامج الآن لبدء التهيئة الجديدة فوراً...
              </p>
              <Loader2 className="w-5 h-5 animate-spin text-paid dark:text-paid-bright mt-1" />
            </div>
          ) : (
            <>
              {/* Alert Warning Box */}
              <div className="p-3.5 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 rounded-lg flex items-start gap-2.5 text-danger-ink dark:text-danger-bright">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
                <div className="text-xs leading-relaxed space-y-1">
                  <div className="font-bold">تحذير حرج — هذه العملية لا يمكن التراجع عنها:</div>
                  <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0">
                    سيتم مسح كافة البيانات المسجلة على هذا الجهاز، بما في ذلك المبيعات والمخزن والديون ليعود البرنامج جديداً ونظيفاً تماماً 100%.
                  </p>
                </div>
              </div>

              {/* What will be deleted breakdown */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <Database className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                  <span>المبيعات والفواتير والمرتجعات</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                  <span>الأصناف والباركودات والمخازن</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                  <span>حسابات وديون الزبائن والموردين</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                  <span>الخزينة والورديات والمدفوعات</span>
                </div>
              </div>

              {/* Backup Wipe Option Checkbox */}
              <label className="p-3 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-start gap-3 cursor-pointer hover:bg-surface dark:hover:bg-surface-dark transition-colors">
                <input
                  type="checkbox"
                  checked={wipeBackups}
                  onChange={(e) => setWipeBackups(e.target.checked)}
                  className="mt-0.5 rounded text-danger focus:ring-danger w-4 h-4 cursor-pointer"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-xs text-ink dark:text-ink-dark">
                    مسح كافة ملفات النسخ الاحتياطي السابقة من الجهاز (تنظيف شامل لكافة النسخ)
                  </span>
                  <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">
                    حذف أي ملفات باك أب قديمة ومسح الذاكرة المؤقتة لضمان بداية نظيفة وخالية من أي سجلات سابقة.
                  </span>
                </div>
              </label>

              {/* Confirmation Input */}
              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-xs font-semibold text-ink dark:text-ink-dark">
                  لتأكيد رغبتك بالمسح التام، اكتب كلمة <strong className="text-danger font-bold text-sm underline">&quot;مسح&quot;</strong> في الحقل التالي:
                </label>
                <input
                  type="text"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  placeholder='اكتب كلمة "مسح" هنا لتأكيد التصفير'
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-10 px-3 text-xs text-ink dark:text-ink-dark text-center font-bold focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger"
                  disabled={loading}
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-danger-soft border border-danger/30 rounded-lg text-danger font-semibold text-xs">
                  {errorMessage}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions Footer */}
        {!successResult && (
          <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2 font-bold text-xs transition-colors cursor-pointer"
            >
              إلغاء وتراجع
            </button>

            <button
              type="button"
              onClick={() => void handleExecuteReset()}
              disabled={!isConfirmed || loading}
              className="px-5 py-2.5 rounded-lg bg-danger hover:bg-danger-hover text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري تصفير ومسح كافة البيانات...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>تأكيد مسح وتصفير كافة البيانات الآن</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
