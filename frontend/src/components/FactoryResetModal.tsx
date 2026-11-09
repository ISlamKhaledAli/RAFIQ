import React, { useState } from 'react';
import { 
  Trash2, 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  RefreshCw,
  HardDrive,
  Database,
  FileSpreadsheet,
  Users
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { RequiredMark } from './RequiredMark';
import { AppButton } from './AppButton';

// The host takes a verified backup before it wipes anything, which can outlast the 15 s default
const RESET_TIMEOUT_MS = 180000;

interface FactoryResetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FactoryResetModal: React.FC<FactoryResetModalProps> = ({
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
  } | null>(null);

  const { handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !loading,
    onClose,
    isDirty: false,
  });
  const motionPanel = useMotionPanel(successResult ? 'done' : 'confirm');

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
      }>('system:factoryReset', { confirmWord: confirmWord.trim() }, RESET_TIMEOUT_MS);

      if (res && res.success) {
        setSuccessResult(res);

        // The wiped store no longer matches anything the browser side remembers
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // storage unavailable: the reload below starts from the host state anyway
        }
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
              <h3 className="t-modal-title text-white m-0">
                تصفير ومسح كافة البيانات نهائياً (إعادة ضبط المصنع)
              </h3>
              <p className="text-micro text-white/80 m-0">
                تنظيف كامل لقاعدة البيانات لتبدأ العمل من الصفر كأن النظام مثبت لأول مرة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-50"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div {...motionPanel} className="p-5 flex flex-col gap-4">
          {successResult ? (
            <div className="p-5 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-bright/30 rounded-xl flex flex-col items-center justify-center text-center gap-2.5">
              <CheckCircle2 className="w-10 h-10 text-paid dark:text-paid-bright" />
              <div className="text-sm font-bold text-paid dark:text-paid-bright leading-relaxed">
                {successResult.message}
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">
                لن يُعاد تحميل البرنامج تلقائياً. أعد تحميل الشاشة عندما تكون جاهزاً لبدء الإعداد الأول وتسجيل الدخول بحساب صاحب المحل الأولي.
              </p>
              <AppButton variant="success" icon={RefreshCw} onClick={() => window.location.reload()} className="mt-1">
                إعادة تحميل الآن
              </AppButton>
            </div>
          ) : (
            <>
              {/* Alert Warning Box */}
              <div className="p-3.5 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 rounded-lg flex items-start gap-2.5 text-danger-ink dark:text-danger-bright">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
                <div className="text-xs leading-relaxed space-y-1">
                  <div className="font-bold">تحذير حرج — هذه العملية لا يمكن التراجع عنها:</div>
                  <p className="text-micro text-ink-muted dark:text-ink-muted-dark m-0">
                    سيتم مسح المبيعات والمخزن والديون والزبائن والموردين والورديات والإعدادات على هذا الجهاز. يُحذف كل الموظفين ويعود حساب صاحب المحل برقمه الأولي (1234) وحساب الكاشير برقمه الأولي (0000) مع إلزام تغييرهما، ثم يظهر معالج الإعداد الأول. يُمسح سجل المراجعة ويُسجَّل فيه قيد التصفير فقط.
                  </p>
                </div>
              </div>

              {/* What stays */}
              <div className="p-3 rounded-lg bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-bright/30 text-xs leading-relaxed text-ink dark:text-ink-dark">
                <span className="font-bold text-paid dark:text-paid-bright">ما يبقى كما هو: </span>
                ملفات النسخ الاحتياطي السابقة كلها، والترخيص وتفعيله. ويؤخذ قبل المسح نسخة احتياطية موثقة تلقائياً؛ وإن تعذر أخذها أو كانت هناك وردية مفتوحة فلن يُحذف شيء.
              </div>


              {/* What will be deleted breakdown */}
              <div className="grid grid-cols-2 gap-2 text-micro">
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

              {/* Confirmation Input */}
              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-xs font-semibold text-ink dark:text-ink-dark">
                  لتأكيد رغبتك بالمسح التام، اكتب كلمة <strong className="text-danger dark:text-danger-bright font-bold text-sm underline">&quot;مسح&quot;</strong> في الحقل التالي: <RequiredMark />
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
            <AppButton variant="secondary" onClick={onClose} disabled={loading}>
              إلغاء وتراجع
            </AppButton>

            <AppButton
              variant="danger"
              icon={Trash2}
              loading={loading}
              onClick={() => void handleExecuteReset()}
              disabled={!isConfirmed}
            >
              {loading ? 'جاري تصفير ومسح كافة البيانات...' : 'تأكيد مسح وتصفير كافة البيانات الآن'}
            </AppButton>
          </div>
        )}
      </div>
    </div>
  );
};
