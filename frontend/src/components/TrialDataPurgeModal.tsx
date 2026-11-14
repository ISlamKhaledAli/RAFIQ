import React, { useState } from 'react';
import { 
  Eraser, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  HardDrive,
  Database,
  FileSpreadsheet,
  Users,
  ShieldCheck
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
                تصفير المبيعات والمخزون وحسابات الديون مع الحفاظ التام على هوية المحل والموظفين
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
                {successResult.message}
              </div>
              {successResult.safetyBackupFile && (
                <div className="text-micro text-ink-muted dark:text-ink-muted-dark bg-surface dark:bg-surface-dark px-3 py-1.5 rounded-lg border border-line dark:border-line-dark font-mono">
                  نسخة احتياطية للأمان محفوظة باسم: {successResult.safetyBackupFile}
                </div>
              )}
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">
                أعد تحميل البرنامج الآن للبدء بدورة عمل جديدة وفواتير تبدأ من رقم (1) مباشرة.
              </p>
              <AppButton variant="success" icon={RefreshCw} onClick={() => window.location.reload()} className="mt-1">
                إعادة تحميل البرنامج الآن
              </AppButton>
            </div>
          ) : (
            <>
              {/* Alert Warning Box */}
              <div className="p-3.5 bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 dark:border-warn-bright/30 rounded-lg flex items-start gap-2.5 text-warn dark:text-warn-bright">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-warn" />
                <div className="text-xs leading-relaxed space-y-1">
                  <div className="font-bold text-ink dark:text-ink-dark">تنبيه حاسم — بدء دورة عمل وحسابات جديدة من الصفر:</div>
                  <p className="text-micro text-ink-muted dark:text-ink-muted-dark m-0">
                    هذه العملية ستمسح كل ما سُجل من فواتير بيع وشراء، وأصناف المخزن، وحسابات وديون العملاء والموردين، والمصروفات والورديات، لتمكينك من بدء دورة عمل جديدة بحسابات دقيقة من الصفر (سواء بعد تجربة أو لتصحيح تراكمات وأخطاء سابقة).
                  </p>
                </div>
              </div>

              {/* What stays completely preserved */}
              <div className="p-3.5 rounded-lg bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-bright/30 text-xs leading-relaxed text-ink dark:text-ink-dark flex flex-col gap-1.5">
                <div className="flex items-center gap-2 font-bold text-paid dark:text-paid-bright">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>ما يظل محفوظاً ولن يُمس نهائياً:</span>
                </div>
                <ul className="text-micro text-ink-muted dark:text-ink-muted-dark space-y-1 list-disc list-inside m-0 pr-1">
                  <li><strong>نشاط المحل وقالب النظام:</strong> يظل نشاط المتجر وكل ميزاته مفعلة وجاهزة.</li>
                  <li><strong>بيانات المحل والفاتورة:</strong> اسم المحل، الهاتف، العنوان، الضرائب، واللوجو.</li>
                  <li><strong>الموظفون وحسابات الدخول:</strong> كل المستخدمين وكلمات مرورهم وصلاحياتهم.</li>
                  <li><strong>إعدادات الطابعات والملحقات:</strong> طابعات الفواتير والباركود ودرج النقدية.</li>
                  <li><strong>ترخيص البرنامج:</strong> كود التفعيل ورخصة الجهاز سارية دون أي تغيير.</li>
                  <li><strong>القواميس والمراجع الجاهزة:</strong> دليل الأدوية والأنشطة المدمجة يظل محفوظاً بالكامل.</li>
                </ul>
              </div>

              {/* What will be deleted breakdown */}
              <div className="grid grid-cols-2 gap-2 text-micro">
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <Database className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                  <span>المبيعات والفواتير والمرتجعات</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                  <span>الأصناف والمخزون وحركات الجرد</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <Users className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                  <span>العملاء والشكك والموردون والمشتريات</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                  <span>الورديات والخزينة والمحافظ والدفع</span>
                </div>
              </div>

              {/* Invoice reset note */}
              <div className="text-micro text-ink-muted dark:text-ink-muted-dark bg-surface-2 dark:bg-surface-dark-2 p-2 rounded-lg border border-line dark:border-line-dark text-center font-semibold">
                ستبدأ فواتير البيع والشراء القادمة تلقائياً من رقم (1) من جديد.
              </div>

              {/* Confirmation Input */}
              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-xs font-semibold text-ink dark:text-ink-dark">
                  لتأكيد رغبتك في التصفير، اكتب كلمة <strong className="text-warn dark:text-warn-bright font-bold text-sm underline">&quot;تصفير&quot;</strong> في الحقل التالي: <RequiredMark />
                </label>
                <input
                  type="text"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  placeholder='اكتب كلمة "تصفير" هنا لتأكيد تصفير العمليات والبدء من جديد'
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-10 px-3 text-xs text-ink dark:text-ink-dark text-center font-bold focus:outline-none focus:border-warn focus:ring-1 focus:ring-warn"
                  disabled={loading}
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

