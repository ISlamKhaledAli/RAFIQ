import { useState } from 'react';
import { 
  AlertTriangle, 
  RotateCcw, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  HardDrive,
  FileArchive,
  FolderOpen,
  Lock,
  X
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { RequiredMark } from './RequiredMark';
import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';

export interface DatabaseIntegrityStatus {
  isValid: boolean;
  isCorrupt: boolean;
  message: string;
  corruptBackupSavedPath?: string;
  latestValidBackupFile?: string;
  latestValidBackupDate?: string;
  latestValidBackupSizeBytes?: number;
}

interface DatabaseRecoveryModalProps {
  status: DatabaseIntegrityStatus;
  onRestored: () => void;
  onDismiss?: () => void;
  isStandaloneDialog?: boolean;
}

export const DatabaseRecoveryModal = ({
  status,
  onRestored,
  onDismiss,
  isStandaloneDialog = false
}: DatabaseRecoveryModalProps) => {
  const [restoring, setRestoring] = useState(false);
  const [customFile, setCustomFile] = useState('');
  const [useCustomFile, setUseCustomFile] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 بايت';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${Math.round(bytes / 1024)} ك.ب`;
    return `${mb.toFixed(2)} م.ب`;
  };

  const handleRestore = async (backupPath?: string) => {
    setRestoring(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const targetPath = backupPath || (useCustomFile ? customFile.trim() : status.latestValidBackupFile);
      if (!targetPath) {
        setErrorMessage('يرجى تحديد مسار ملف النسخة الاحتياطية المراد استرجاعها.');
        setRestoring(false);
        return;
      }

      // No session exists while the database is corrupt: the owner recovery code is verified server-side against the backup
      const res: any = await invoke('database:restore', { backupFilePath: targetPath, recoveryCode: recoveryCode.trim() });
      if (res && res.success) {
        setSuccessMessage(res.message || 'تم استرجاع قاعدة البيانات');
        setTimeout(() => {
          onRestored();
        }, 1500);
      } else {
        setErrorMessage(res?.message || 'فشلت عملية استرجاع النسخة الاحتياطية.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`خطأ أثناء الاسترجاع: ${msg}`);
    } finally {
      setRestoring(false);
    }
  };

  const canDismiss = !status.isCorrupt && Boolean(onDismiss);
  const isDirty = Boolean(recoveryCode.trim() || customFile.trim());

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: canDismiss && !restoring,
    onDismiss: onDismiss || (() => {}),
    isDirty,
    confirmTitle: 'إلغاء عملية الاسترجاع؟',
    confirmMessage: 'لديك بيانات مدخلة في نافذة الاسترجاع. هل تريد حقاً الإلغاء؟',
  });

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-200"
      onClick={canDismiss ? handleBackdropClick : undefined}
    >
      <div 
        className="w-full max-w-xl bg-surface dark:bg-surface-dark rounded-[8px] shadow-2xl border border-danger/30 dark:border-danger-bright/30 overflow-hidden flex flex-col text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Top Banner */}
        <div className="p-4 bg-danger text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="t-modal-title m-0 leading-tight">
                {status.isCorrupt ? 'استرجاع قاعدة البيانات (طوارئ سلامة البيانات)' : 'استرجاع نسخة احتياطية للمحل'}
              </h3>
              <p className="text-micro text-white/90 m-0 mt-0.5">
                {status.isCorrupt 
                  ? 'وقفنا التسجيل مؤقتاً لحماية حسابات وفواتير المحل'
                  : 'استرجاع بيانات المحل من نسخة احتياطية سليمة'}
              </p>
            </div>
          </div>

          {!status.isCorrupt && onDismiss && (
            <button
              type="button"
              onClick={requestClose}
              className="h-8 text-white text-xs px-2.5 rounded-lg hover:bg-white/10 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>إغلاق</span>
            </button>
          )}
        </div>

        {/* 2. Content Body */}
        <MotionHeight className="overflow-y-auto max-h-[80vh]">
        <div className="p-5 flex flex-col gap-4 text-xs text-ink dark:text-ink-dark">
          {/* Explanation Banner */}
          <div className="p-3.5 bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 rounded-[6px] text-danger dark:text-danger-bright leading-relaxed font-sans">
            <span className="font-bold block mb-1">تفاصيل الحالة الفنية:</span>
            {status.isCorrupt ? (
              <>
                حصل خلل في ملف قاعدة البيانات (زي انقطاع الكهرباء فجأة والجهاز شغال بيسجل).
                <div className="mt-1 font-mono text-micro bg-danger-soft/80 dark:bg-danger-dark-soft/80 border border-danger/10 dark:border-danger-bright/20 p-1.5 rounded text-danger dark:text-danger-bright break-all">
                  سبب التنبيه: {status.message}
                </div>
              </>
            ) : (
              'استرجاع النسخة الاحتياطية هيرجع كل البيانات للوقت اللي اتسجلت فيه النسخة دي، وأي مبيعات أو تعديلات اتسجلت بعد الوقت ده هتختفي من النظام. بتتحفظ نسخة أمان من بياناتك الحالية تلقائياً قبل الاستبدال، ولو الاسترجاع فشل بيرجع النظام زي ما كان، وبعد النجاح البرنامج بيعيد التحميل.'
            )}
          </div>

          {/* Reassurance Banner regarding Quarantined File (Task 124-2) */}
          {status.corruptBackupSavedPath && (
            <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-[6px] flex items-start gap-2.5 text-warn dark:text-warn-bright text-micro">
              <FileArchive className="w-4 h-4 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">اطمن، مفيش أي بيانات ضاعت:</span>
                شيلنا نسخة معزولة ومحفوظة بالكامل من الملف الحالي في المسار ده لو احتجتها:
                <div className="mt-0.5 font-mono text-micro text-warn dark:text-warn-bright break-all select-text">
                  {status.corruptBackupSavedPath}
                </div>
              </div>
            </div>
          )}

          {/* Feedback Toasts */}
          {errorMessage && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright rounded font-semibold text-xs">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid/30 text-paid dark:text-paid-bright rounded font-bold text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Owner recovery code: the only restore authorisation (works without a login session) */}
          <div className="p-2.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded flex flex-col gap-1.5">
            <label htmlFor="db-recovery-code" className="text-micro font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
              <span>أدخل كود استرجاع المالك لتأكيد الاسترجاع: <RequiredMark /></span>
            </label>
            <input
              id="db-recovery-code"
              type="password"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="RFK-XXXX-XXXX-XXXX"
              autoComplete="off"
              className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-[2.25rem] px-3 text-sm font-mono text-center tracking-widest text-ink focus:outline-none focus:border-brand"
              dir="ltr"
            />
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted">
              الكود اللي اتسلم لصاحب المحل عند إعداد النسخ الاحتياطي، وهو اللي بيفتح النسخة المشفرة.
            </span>
          </div>

          {/* Latest Verified Backup Card */}
          {status.latestValidBackupFile ? (
            <div className="p-4 rounded-[6px] border border-brand/40 bg-brand-soft/20 dark:bg-brand-dark-soft/20 flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-2">
                <span className="font-bold text-brand dark:text-brand-bright text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isStandaloneDialog ? 'النسخة المختارة للاسترجاع:' : 'أحدث نسخة احتياطية سليمة ومضمونة:'}</span>
                </span>
                <span className="text-micro font-bold text-paid bg-paid-soft dark:bg-paid-dark-soft px-2 py-0.5 rounded border border-paid-border dark:border-paid-bright/30">
                  {isStandaloneDialog ? 'هتتفحص قبل الاسترجاع' : 'تم التحقق من سلامتها'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-micro">
                <div className="flex items-center gap-1.5 text-ink-muted dark:text-ink-dark-muted">
                  <Clock className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>التاريخ: {status.latestValidBackupDate || 'غير محدد'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-ink-muted dark:text-ink-dark-muted font-mono">
                  <HardDrive className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                  <span>الحجم: {formatBytes(status.latestValidBackupSizeBytes)}</span>
                </div>
              </div>

              <div dir="ltr" className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted break-all text-left bg-surface-2 dark:bg-surface-dark-2 p-1.5 rounded border border-line dark:border-line-dark select-text">
                {status.latestValidBackupFile}
              </div>


              <AppButton
                variant="primary"
                size="lg"
                fullWidth
                icon={RotateCcw}
                loading={restoring}
                onClick={() => void handleRestore(status.latestValidBackupFile)}
                disabled={!recoveryCode.trim()}
                className="mt-1"
              >
                {restoring
                  ? 'بيتم فحص واسترجاع النسخة الاحتياطية دلوقتي...'
                  : isStandaloneDialog
                    ? 'استرجاع النسخة دي دلوقتي'
                    : 'استرجاع النسخة السليمة دي دلوقتي'}
              </AppButton>
            </div>
          ) : (
            <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark text-center text-ink-muted dark:text-ink-dark-muted">
              ملقناش نسخ احتياطية في المجلد المعتاد. تقدر تختار ملف نسخة احتياطية من فلاشة أو مسار تاني تحت.
            </div>
          )}

          {/* Manual File Path Option */}
          <div className="pt-2 border-t border-line dark:border-line-dark flex flex-col gap-2">
            <AppButton
              variant="subtle"
              size="xs"
              icon={FolderOpen}
              onClick={() => setUseCustomFile(!useCustomFile)}
              className="self-start"
            >
              {useCustomFile ? 'إخفاء تحديد الملف يدوياً' : 'أو اختر ملف نسخة احتياطية من فلاشة يدوياً'}
            </AppButton>

            {useCustomFile && (
              <div className="flex flex-col gap-2 mt-1">
                <input
                  type="text"
                  value={customFile}
                  onChange={(e) => setCustomFile(e.target.value)}
                  placeholder="مثال: E:\RafiqBackups\rafiq_backup_20260924_120000.db"
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[2.375rem] px-3 text-xs text-ink focus:outline-none focus:border-brand font-mono"
                />
                <AppButton
                  variant="secondary"
                  icon={RotateCcw}
                  onClick={() => void handleRestore(customFile)}
                  disabled={restoring || !customFile.trim() || !recoveryCode.trim()}
                  className="self-end"
                >
                  استرجاع من الملف ده
                </AppButton>
              </div>
            )}
          </div>
        </div>
        </MotionHeight>

        {/* 3. Modal Footer */}
        <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between text-micro text-ink-muted dark:text-ink-dark-muted">
          <span className="flex items-center gap-1.5">
            <span>بنحفظ نسخة أمان من الوضع الحالي قبل أي استرجاع • للدعم الفني المباشر:</span>
            <a href="tel:01097782965" className="font-mono font-bold text-paid hover:underline" dir="ltr">01097782965</a>
          </span>
          {!status.isCorrupt && onDismiss && !isStandaloneDialog && (
            <AppButton variant="secondary" size="sm" onClick={onDismiss}>
              إلغاء
            </AppButton>
          )}
        </div>
      </div>
    </div>
  );
};
