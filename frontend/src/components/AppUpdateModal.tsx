import { useState, useEffect, useCallback, useRef } from 'react';
import { DownloadCloud, Sparkles, CheckCircle2, AlertTriangle, X, RefreshCw, Info, HardDriveDownload, Copy, ShieldCheck } from 'lucide-react';
import { invoke, type AppUpdateInfo } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { AppButton } from './AppButton';
import { deriveUpdateStatus, formatFileSize, isSafeDownloadUrl, isValidSha256, type UpdateStatus } from '../utils/appUpdateView';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoCheck?: boolean;
  onUpdateInfoChange?: (info: AppUpdateInfo | null) => void;
}

// Updates are informational: the app checks for a newer version and shows how to install it with the official Setup.
// Nothing is downloaded, executed or closed from here, and the data folder is never touched.
export const AppUpdateModal = ({ isOpen, onClose, autoCheck = false, onUpdateInfoChange }: AppUpdateModalProps) => {
  const onUpdateInfoChangeRef = useRef(onUpdateInfoChange);
  useEffect(() => {
    onUpdateInfoChangeRef.current = onUpdateInfoChange;
  });

  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>('');
  const [copyNote, setCopyNote] = useState<string>('');

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setStatus(null);
    setCopyNote('');
    try {
      const res = await invoke<AppUpdateInfo>('updates:check');
      setUpdateInfo(res);
      onUpdateInfoChangeRef.current?.(res);
      setStatus(deriveUpdateStatus(res));
    } catch (err: unknown) {
      setStatus(deriveUpdateStatus(null, err instanceof Error && err.message ? err.message : 'تعذر الاتصال بخادم التحديثات. تأكد من اتصال الإنترنت.'));
    } finally {
      setCheckedAt(new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour12: true, hour: '2-digit', minute: '2-digit' }));
      setIsChecking(false);
    }
  }, []);

  const copyText = useCallback(async (text: string, okNote: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(okNote);
    } catch {
      setCopyNote('تعذر النسخ تلقائياً؛ حدّد النص من الخانة بالأسفل وانسخه يدوياً (Ctrl+C).');
    }
  }, []);

  const hasAutoCheckedRef = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isOpen) {
      if (autoCheck && !hasAutoCheckedRef.current) {
        hasAutoCheckedRef.current = true;
        timer = setTimeout(() => {
          void checkForUpdates();
        }, 10);
      }
    } else {
      hasAutoCheckedRef.current = false;
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, autoCheck, checkForUpdates]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty: false,
  });

  if (!isOpen) return null;

  const statusClass = (type: UpdateStatus['kind']) =>
    type === 'success'
      ? 'bg-paid-soft text-paid border-paid/20 dark:bg-paid-dark-soft dark:text-paid-bright dark:border-paid-dark-border'
      : type === 'error'
      ? 'bg-danger-soft text-danger border-danger/20 dark:bg-danger-dark-soft dark:text-danger-bright dark:border-danger/30'
      : type === 'warn'
      ? 'bg-warn-soft text-warn border-warn/20 dark:bg-warn-dark-soft dark:text-warn-bright dark:border-warn/30'
      : 'bg-brand-soft text-brand-dark border-brand/20 dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand/30';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-xl bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark flex flex-col overflow-hidden text-ink dark:text-ink-dark font-sans text-right"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand-dark dark:bg-surface-dark-2 px-6 py-4 flex items-center justify-between text-white dark:text-ink-dark border-b border-white/10 dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 dark:bg-surface-dark-3 flex items-center justify-center text-paid dark:text-paid-bright">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="t-modal-title text-white dark:text-ink-dark">تحديثات نظام رفيق</h2>
              <p className="text-xs text-white/70 dark:text-ink-dark-muted">
                إصدار النظام الحالي: <span className="font-mono font-semibold text-white dark:text-ink-dark" dir="ltr">{updateInfo?.currentVersion || '...'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-white/70 dark:text-ink-dark-muted hover:text-white dark:hover:text-ink-dark hover:bg-white/10 dark:hover:bg-surface-dark-3"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh] bg-surface dark:bg-surface-dark">
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={isChecking}
            className="w-full p-3 rounded-xl border border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark text-right flex items-center gap-3 disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft flex items-center justify-center text-brand-dark dark:text-brand-bright shrink-0">
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="text-xs font-bold text-ink dark:text-ink-dark">فحص وجود إصدار أحدث</div>
              <div className="text-micro text-ink-muted dark:text-ink-dark-muted">يعرض فقط إن كان هناك إصدار جديد، ولا يقوم بتنزيل أو تثبيت أي شيء</div>
            </div>
          </button>

          {status && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${statusClass(status.kind)}`}>
              {status.kind === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              ) : status.kind === 'info' ? (
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium leading-relaxed">{status.text}</div>
            </div>
          )}

          {updateInfo && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 p-2.5">
                <div className="text-micro text-ink-muted dark:text-ink-dark-muted">الإصدار الحالي</div>
                <div className="font-mono font-bold text-sm text-ink dark:text-ink-dark" dir="ltr">{updateInfo.currentVersion || '-'}</div>
              </div>
              <div className="rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 p-2.5">
                <div className="text-micro text-ink-muted dark:text-ink-dark-muted">أحدث إصدار منشور</div>
                <div className="font-mono font-bold text-sm text-ink dark:text-ink-dark" dir="ltr">{updateInfo.latestVersion || '-'}</div>
              </div>
              <div className="rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 p-2.5">
                <div className="text-micro text-ink-muted dark:text-ink-dark-muted">آخر فحص</div>
                <div className="font-mono font-bold text-sm text-ink dark:text-ink-dark" dir="ltr">{checkedAt || '-'}</div>
              </div>
            </div>
          )}

          {updateInfo?.hasUpdate && (
            <div className="bg-surface-2 dark:bg-surface-dark-2 rounded-xl p-5 border border-line dark:border-line-dark space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-warn dark:text-warn-bright" />
                  <span className="font-bold text-base text-ink dark:text-ink-dark">الإصدار الجديد: v{updateInfo.latestVersion}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {updateInfo.releaseDate && (
                    <span className="text-xs bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright px-2.5 py-1 rounded-full font-medium border border-transparent dark:border-brand/20">
                      تاريخ الإصدار: {updateInfo.releaseDate}
                    </span>
                  )}
                  {formatFileSize(updateInfo.fileSizeBytes) && (
                    <span className="text-xs bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted px-2.5 py-1 rounded-full font-medium border border-line dark:border-line-dark" dir="ltr">
                      {formatFileSize(updateInfo.fileSizeBytes)}
                    </span>
                  )}
                  {updateInfo.isMandatory && (
                    <span className="text-xs bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright px-2.5 py-1 rounded-full font-bold border border-danger/20 dark:border-danger/30">
                      تحديث مهم
                    </span>
                  )}
                </div>
              </div>
              {updateInfo.changelog && (
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed whitespace-pre-line">{updateInfo.changelog}</p>
              )}

              {isSafeDownloadUrl(updateInfo.downloadUrl) && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-bold text-ink dark:text-ink-dark">رابط تحميل ملف التثبيت الرسمي</div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={updateInfo.downloadUrl}
                      dir="ltr"
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 h-10 px-2.5 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark text-xs font-mono"
                      aria-label="رابط تحميل ملف التثبيت"
                    />
                    <AppButton
                      variant="primary"
                      icon={Copy}
                      onClick={() => void copyText(updateInfo.downloadUrl || '', 'تم نسخ رابط التحميل. افتحه في المتصفح لتنزيل ملف التثبيت.')}
                      className="shrink-0"
                    >
                      نسخ رابط التحميل
                    </AppButton>
                  </div>
                  {isValidSha256(updateInfo.sha256) && (
                    <div className="flex items-start gap-2 text-micro text-ink-muted dark:text-ink-dark-muted">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright mt-0.5" />
                      <div className="min-w-0">
                        <span>بصمة الملف الصحيحة (SHA-256) للتأكد من سلامته بعد التنزيل: </span>
                        <button
                          type="button"
                          onClick={() => void copyText(updateInfo.sha256 || '', 'تم نسخ بصمة SHA-256.')}
                          className="font-mono break-all text-start text-ink dark:text-ink-dark underline decoration-dotted cursor-pointer"
                          dir="ltr"
                          title="نسخ البصمة"
                        >
                          {updateInfo.sha256}
                        </button>
                      </div>
                    </div>
                  )}
                  {copyNote && <div className="text-xs font-semibold text-paid dark:text-paid-bright">{copyNote}</div>}
                </div>
              )}
            </div>
          )}

          <div className="p-4 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand/30 text-brand-dark dark:text-ink-dark-muted flex items-start gap-3">
            <HardDriveDownload className="w-5 h-5 shrink-0 mt-0.5 text-brand dark:text-brand-bright" />
            <div className="text-xs leading-relaxed">
              <strong className="block text-ink dark:text-ink-dark font-bold mb-1">طريقة تثبيت الإصدار الجديد (يدوياً وبأمان)</strong>
              <ol className="list-decimal ps-4 space-y-1">
                <li>احصل على ملف التثبيت الرسمي الجديد: من رابط التحميل إن ظهر أعلاه، أو من الفني المعتمد على فلاشة USB لو لا يوجد إنترنت.</li>
                <li>تأكد من إغلاق الوردية وعدم وجود عملية بيع مفتوحة، ثم أغلق رفيق.</li>
                <li>شغّل ملف التثبيت الجديد فوق النسخة الحالية. بياناتك ومبيعاتك وإعداداتك محفوظة ولا تُمسح.</li>
              </ol>
              <p className="mt-2 text-ink-muted dark:text-ink-dark-muted">البرنامج لا يُحمّل ولا يُثبّت ولا يُغلق نفسه تلقائياً، والقرار دائماً بيدك.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
