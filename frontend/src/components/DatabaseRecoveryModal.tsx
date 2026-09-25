import { useState } from 'react';
import { 
  AlertTriangle, 
  RotateCcw, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  HardDrive,
  FileArchive,
  RefreshCw,
  FolderOpen,
  Lock
} from 'lucide-react';
import { invoke } from '../bridge/ipc';

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
  const [pin, setPin] = useState('');
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

    // Safety: Verify PIN before destructive overwrite (Task 10-4 & Feature #52)
    try {
      const verifyRes: any = await invoke('security:verifyPin', { pin: pin.trim(), action: 'db_recovery' });
      if (!verifyRes || !verifyRes.success) {
        setErrorMessage(verifyRes?.message || 'الرقم السري لصاحب المحل غير صحيح.');
        setRestoring(false);
        return;
      }
    } catch (authErr: unknown) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      setErrorMessage(`فشل التحقق من الصلاحية: ${msg}`);
      setRestoring(false);
      return;
    }

    try {
      const targetPath = backupPath || (useCustomFile ? customFile.trim() : status.latestValidBackupFile);
      if (!targetPath) {
        setErrorMessage('يرجى تحديد مسار ملف النسخة الاحتياطية المراد استرجاعها.');
        setRestoring(false);
        return;
      }

      const res: any = await invoke('database:restore', { backupFilePath: targetPath });
      if (res && res.success) {
        setSuccessMessage(res.message || 'تم استرجاع قاعدة البيانات بنجاح.');
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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-surface rounded-[8px] shadow-2xl border border-red-300 overflow-hidden flex flex-col text-right">
        {/* 1. Modal Top Banner */}
        <div className="p-4 bg-red-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold m-0 leading-tight">
                {status.isCorrupt ? 'معالج استرجاع البيانات الموجه (تنبيه سلامة)' : 'استرجاع نسخة احتياطية للنظام'}
              </h3>
              <p className="text-[11px] text-white/90 m-0 mt-0.5">
                {status.isCorrupt 
                  ? 'تم إيقاف الكتابة مؤقتاً لحماية الحسابات والمبيعات'
                  : 'استعادة ملف قاعدة البيانات من نسخة احتياطية معتمدة'}
              </p>
            </div>
          </div>

          {!status.isCorrupt && onDismiss && (
            <button
              onClick={onDismiss}
              className="text-white/80 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10"
            >
              ✕ إغلاق
            </button>
          )}
        </div>

        {/* 2. Content Body */}
        <div className="p-5 flex flex-col gap-4 text-[12.5px] text-ink overflow-y-auto max-h-[80vh]">
          {/* Explanation Banner */}
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-[6px] text-red-900 leading-relaxed font-sans">
            <span className="font-bold block mb-1">تفاصيل الحالة الفنية:</span>
            {status.isCorrupt ? (
              <>
                تم اكتشاف خلل في اتساق ملف قاعدة البيانات (مثل انقطاع مفاجئ للكهرباء أثناء الكتابة).
                <div className="mt-1 font-mono text-[11px] bg-red-100/60 p-1.5 rounded text-red-800 break-all">
                  سبب التنبيه: {status.message}
                </div>
              </>
            ) : (
              'سيؤدي استرجاع النسخة الاحتياطية إلى استبدال البيانات الحالية بالبيانات المحفوظة في ملف النسخة المحددة.'
            )}
          </div>

          {/* Reassurance Banner regarding Quarantined File (Task 124-2) */}
          {status.corruptBackupSavedPath && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-[6px] flex items-start gap-2.5 text-amber-900 text-[11.5px]">
              <FileArchive className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">اطمئن، لم يتم حذف أي ملف:</span>
                تم حفظ نسخة معزولة بالكامل من الملف في المسار التالي لمراجعتها عند الحاجة:
                <div className="mt-0.5 font-mono text-[10.5px] text-amber-800 break-all select-text">
                  {status.corruptBackupSavedPath}
                </div>
              </div>
            </div>
          )}

          {/* Feedback Toasts */}
          {errorMessage && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-900 rounded font-semibold text-[12px]">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-paid-soft border border-paid-border text-paid rounded font-bold text-[12px] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-paid shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Latest Verified Backup Card */}
          {status.latestValidBackupFile ? (
            <div className="p-4 rounded-[6px] border border-brand/40 bg-brand-soft/20 flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-bold text-brand text-[13px] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>آخر نسخة احتياطية سليمة متوفرة:</span>
                </span>
                <span className="text-[10.5px] font-bold text-paid bg-paid-soft px-2 py-0.5 rounded border border-paid-border">
                  تم التحقق من سلامتها
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="flex items-center gap-1.5 text-ink-muted">
                  <Clock className="w-3.5 h-3.5 text-brand" />
                  <span>التاريخ: {status.latestValidBackupDate || 'غير محدد'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-ink-muted font-mono">
                  <HardDrive className="w-3.5 h-3.5 text-ink-muted" />
                  <span>الحجم: {formatBytes(status.latestValidBackupSizeBytes)}</span>
                </div>
              </div>

              <div className="text-[10.5px] font-mono text-ink-muted break-all bg-surface-2 p-1.5 rounded border border-line">
                {status.latestValidBackupFile}
              </div>

              {/* Owner PIN Verification Protection (Task 10-4) */}
              <div className="p-2.5 bg-surface border border-line rounded flex flex-col gap-1.5">
                <label className="text-[11.5px] font-bold text-ink flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-brand" />
                  <span>تأكيد الإذن: أدخل الرقم السري للمشرف للمتابعة:</span>
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="أدخل الرقم السري"
                  className="w-full bg-surface-2 border border-line rounded h-[36px] px-3 text-[13px] font-mono text-center tracking-widest text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleRestore(status.latestValidBackupFile)}
                disabled={restoring || !pin.trim()}
                className="mt-1 h-[42px] bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded font-bold flex items-center justify-center gap-2 transition-colors shadow-sm text-[13px]"
              >
                {restoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري فحص واسترجاع النسخة الاحتياطية...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>استرجاع هذه النسخة السليمة تلقائياً الآن</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-4 bg-surface-2 rounded border border-line text-center text-ink-muted">
              لم يتم العثور على نسخ احتياطية تلقائية في المجلد الافتراضي. يمكنك إدخال مسار ملف نسخة خارجية أدناه.
            </div>
          )}

          {/* Manual File Path Option */}
          <div className="pt-2 border-t border-line flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setUseCustomFile(!useCustomFile)}
              className="text-brand hover:underline font-semibold text-[12px] flex items-center gap-1 self-start"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{useCustomFile ? 'إخفاء تحديد الملف يدوياً' : 'أو تحديد ملف نسخة احتياطية من فلاشة أو مسار آخر يدوياً'}</span>
            </button>

            {useCustomFile && (
              <div className="flex flex-col gap-2 mt-1">
                <input
                  type="text"
                  value={customFile}
                  onChange={(e) => setCustomFile(e.target.value)}
                  placeholder="مثال: E:\RafiqBackups\rafiq_backup_20260924_120000.db"
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[12px] text-ink focus:outline-none focus:border-brand font-mono"
                />
                <button
                  type="button"
                  onClick={() => void handleRestore(customFile)}
                  disabled={restoring || !customFile.trim() || !pin.trim()}
                  className="h-[36px] bg-surface-2 hover:bg-surface disabled:opacity-50 border border-line text-ink rounded font-bold flex items-center justify-center gap-1.5 transition-colors self-end px-4"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-brand" />
                  <span>استرجاع من هذا المسار</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 3. Modal Footer */}
        <div className="p-3 bg-surface-2 border-t border-line flex items-center justify-between text-[11px] text-ink-muted">
          <span>يتم أخذ نسخة أمان للحالة الحالية دائماً قبل أي استرجاع.</span>
          {!status.isCorrupt && onDismiss && !isStandaloneDialog && (
            <button
              onClick={onDismiss}
              className="px-3 py-1 bg-surface border border-line rounded text-ink hover:bg-surface-2"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
