import React, { useState } from 'react';
import { 
  Eraser, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { RequiredMark } from './RequiredMark';
import { AppButton } from './AppButton';

// The host takes a verified backup before it wipes anything, which can outlast the default timeout
const PURGE_TIMEOUT_MS = 180000;

interface TrialDataPurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TrialDataPurgeModal: React.FC<TrialDataPurgeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [confirmWord, setConfirmWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    success: boolean;
    message: string;
    deletedSalesCount?: number;
    deletedProductsCount?: number;
    deletedCustomersCount?: number;
    safetyBackupFile?: string;
  } | null>(null);

  const { handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !loading,
    onClose,
    isDirty: false,
  });
  const motionPanel = useMotionPanel(successResult ? 'done' : 'confirm');

  if (!isOpen) return null;

  const isConfirmed = confirmWord.trim() === 'تصفير';

  const handleExecutePurge = async () => {
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
        safetyBackupFile?: string;
      }>('system:trialDataPurge', { confirmWord: confirmWord.trim() }, PURGE_TIMEOUT_MS);

      if (res && res.success) {
        setSuccessResult(res);

        // Wipe client-side storage cache so fresh state is fetched
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // storage unavailable
        }
      } else {
        setErrorMessage(res?.message || 'تعذر إتمام عملية تصفير العمليات التشغيلية.');
        setLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`حدث خطأ أثناء تصفير العمليات: ${msg}`);
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
        <div className="bg-warn-bright text-ink dark:bg-warn-dark-soft dark:text-warn-bright px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0">
              <Eraser className="w-5 h-5 text-ink dark:text-warn-bright" />
            </div>
            <div>
              <h3 className="t-modal-title text-ink dark:text-warn-bright m-0">
                تصفير العمليات التشغيلية وبدء دورة جديدة
              </h3>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">
                مسح العمليات والمخزون والبدء بحسابات نظيفة من الصفر
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 cursor-pointer"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div {...motionPanel} className="p-5 flex flex-col gap-4">
          {successResult ? (
            <div className="p-5 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-bright/30 rounded-xl flex flex-col items-center justify-center text-center gap-3">
              <CheckCircle2 className="w-10 h-10 text-paid dark:text-paid-bright" />
              <div className="text-sm font-bold text-paid dark:text-paid-bright leading-relaxed">
                تم تصفير العمليات التشغيلية وبدء دورة جديدة بنجاح
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">
                النظام جاهز الآن بحسابات دقيقة من الصفر، وستبدأ الفواتير القادمة من رقم (1) مباشرة.
              </p>
              {successResult.safetyBackupFile && (
                <div className="text-micro text-ink-muted dark:text-ink-muted-dark bg-surface dark:bg-surface-dark px-3 py-1.5 rounded-lg border border-line dark:border-line-dark font-mono">
                  نسخة احتياطية للأمان: {successResult.safetyBackupFile}
                </div>
              )}
              <AppButton variant="success" icon={RefreshCw} onClick={() => window.location.reload()} className="mt-2">
                إعادة تحميل البرنامج الآن
              </AppButton>
            </div>
          ) : (
            <>
              {/* Clean Concise Alert Box */}
              <div className="p-4 bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 dark:border-warn-bright/30 rounded-xl flex items-start gap-3 text-warn dark:text-warn-bright">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-warn dark:text-warn-bright" />
                <div className="text-xs leading-relaxed space-y-1.5 flex-1">
                  <div className="font-bold text-ink dark:text-ink-dark text-sm">
                    تصفير شامل للعمليات والحسابات
                  </div>
                  <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">
                    سيتم مسح كافة عمليات وفواتير البيع والشراء، والمخزون، وحسابات الديون والورديات لبدء الحسابات من الصفر (ستبدأ الفواتير القادمة من رقم 1).
                  </p>
                  <p className="text-micro text-ink-muted/80 dark:text-ink-muted-dark/80 m-0 font-medium">
                    * ملاحظة: بيانات المحل، حسابات الموظفين، وإعدادات البرنامج والترخيص تظل محفوظة دون أي مساس.
                  </p>
                </div>
              </div>

              {/* Confirmation Input */}
              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-xs font-semibold text-ink dark:text-ink-dark">
                  لتأكيد التصفير، اكتب كلمة <strong className="text-warn dark:text-warn-bright font-bold underline">&quot;تصفير&quot;</strong> في الحقل التالي: <RequiredMark />
                </label>
                <input
                  type="text"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  placeholder='اكتب "تصفير" هنا لتأكيد البدء من جديد'
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-10 px-3 text-xs text-ink dark:text-ink-dark text-center font-bold focus:outline-none focus:border-warn focus:ring-1 focus:ring-warn"
                  disabled={loading}
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-danger-soft border border-danger/30 rounded-lg text-danger font-semibold text-xs">
                  {errorMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line dark:border-line-dark">
                <AppButton
                  variant="secondary"
                  onClick={onClose}
                  disabled={loading}
                >
                  إلغاء التراجع
                </AppButton>
                <AppButton
                  variant="danger"
                  icon={Eraser}
                  loading={loading}
                  disabled={!isConfirmed || loading}
                  onClick={() => void handleExecutePurge()}
                >
                  {loading ? 'جاري أخذ نسخة وتصفير العمليات...' : 'تصفير العمليات والبدء من جديد'}
                </AppButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

