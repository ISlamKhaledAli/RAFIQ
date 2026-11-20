import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DownloadCloud,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  ShieldCheck,
  Loader2,
  Play,
  Clock,
} from 'lucide-react';
import {
  invoke,
  type AppUpdateInfo,
  type AppUpdateDownloadState,
  type AppUpdateLaunchResult,
} from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { AppButton } from './AppButton';
import {
  deriveUpdateStatus,
  formatFileSize,
  isSafeDownloadUrl,
  isValidSha256,
  type UpdateStatus,
} from '../utils/appUpdateView';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoCheck?: boolean;
  hasActiveSale?: boolean;
  onUpdateInfoChange?: (info: AppUpdateInfo | null) => void;
}

const IDLE_DOWNLOAD_STATE: AppUpdateDownloadState = {
  state: 'idle',
  bytesDownloaded: 0,
  totalBytes: 0,
  percent: 0,
  isVerified: false,
};

// Secure in-app update flow: checks for updates, downloads the official Setup (.exe) to %TEMP%,
// verifies its SHA-256 checksum automatically, and launches the verified Setup on explicit user confirmation.
export const AppUpdateModal = ({
  isOpen,
  onClose,
  autoCheck = false,
  hasActiveSale = false,
  onUpdateInfoChange,
}: AppUpdateModalProps) => {
  const onUpdateInfoChangeRef = useRef(onUpdateInfoChange);
  useEffect(() => {
    onUpdateInfoChangeRef.current = onUpdateInfoChange;
  });

  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>('');
  const [downloadState, setDownloadState] = useState<AppUpdateDownloadState>(IDLE_DOWNLOAD_STATE);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchNotice, setLaunchNotice] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);

  const syncDownloadState = useCallback(async () => {
    try {
      const state = await invoke<AppUpdateDownloadState>('updates:getDownloadState');
      if (state && state.state) {
        setDownloadState(state);
      }
    } catch {
      // Ignore transient poll errors
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setStatus(null);
    setLaunchNotice(null);
    try {
      const res = await invoke<AppUpdateInfo>('updates:check');
      setUpdateInfo(res);
      onUpdateInfoChangeRef.current?.(res);
      setStatus(deriveUpdateStatus(res));
      await syncDownloadState();
    } catch (err: unknown) {
      setStatus(
        deriveUpdateStatus(
          null,
          err instanceof Error && err.message
            ? err.message
            : 'تعذر الاتصال بخادم التحديثات. تأكد من اتصال الإنترنت.'
        )
      );
    } finally {
      setCheckedAt(
        new Date().toLocaleTimeString('ar-EG-u-nu-latn', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      setIsChecking(false);
    }
  }, [syncDownloadState]);

  const handleStartDownload = useCallback(async () => {
    setLaunchNotice(null);
    try {
      const res = await invoke<AppUpdateDownloadState>('updates:startDownload');
      if (res && res.state) {
        setDownloadState(res);
      }
    } catch (err: unknown) {
      setDownloadState({
        state: 'error',
        errorMessage:
          err instanceof Error && err.message
            ? err.message
            : 'تعذر بدء تنزيل التحديث. حاول مرة أخرى.',
      });
    }
  }, []);

  const handleCancelDownload = useCallback(async () => {
    try {
      const res = await invoke<AppUpdateDownloadState>('updates:cancelDownload');
      if (res && res.state) {
        setDownloadState(res);
      }
    } catch {
      // Ignore cancel errors
    }
  }, []);

  const handleLaunchInstaller = useCallback(async () => {
    if (hasActiveSale) {
      setLaunchNotice({
        kind: 'warn',
        text: 'توجد فاتورة مفتوحة حالياً في شاشة البيع. يرجى إتمام الفاتورة أو تعليقها أولاً قبل التثبيت.',
      });
      return;
    }

    setIsLaunching(true);
    setLaunchNotice(null);
    try {
      const res = await invoke<AppUpdateLaunchResult>('updates:launchInstaller');
      if (res && res.launched) {
        setLaunchNotice({
          kind: 'info',
          text: res.message || 'تم تشغيل مثبت التحديث الرسمي. جاري إغلاق رفيق لإكمال التثبيت...',
        });
      } else if (res && res.cancelled) {
        setIsLaunching(false);
        setLaunchNotice({
          kind: 'warn',
          text: res.message || 'تم إلغاء تشغيل المثبت من نافذة صلاحيات ويندوز.',
        });
      } else {
        setIsLaunching(false);
        setLaunchNotice({
          kind: 'error',
          text: (res && res.message) || 'تعذر تشغيل مثبت التحديث. حاول مرة أخرى.',
        });
        await syncDownloadState();
      }
    } catch (err: unknown) {
      setIsLaunching(false);
      setLaunchNotice({
        kind: 'error',
        text:
          err instanceof Error && err.message
            ? err.message
            : 'تعذر تشغيل مثبت التحديث. حاول مرة أخرى.',
      });
    }
  }, [hasActiveSale, syncDownloadState]);

  const hasAutoCheckedRef = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isOpen) {
      void syncDownloadState();
      if (autoCheck && !hasAutoCheckedRef.current) {
        hasAutoCheckedRef.current = true;
        timer = setTimeout(() => {
          void checkForUpdates();
        }, 10);
      }
    } else {
      hasAutoCheckedRef.current = false;
      setIsLaunching(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, autoCheck, checkForUpdates, syncDownloadState]);

  // Poll download progress cleanly while downloading or verifying
  const isTransferActive =
    downloadState.state === 'downloading' || downloadState.state === 'verifying';
  useEffect(() => {
    if (!isOpen || !isTransferActive) return;
    const interval = setInterval(() => {
      void syncDownloadState();
    }, 350);
    return () => clearInterval(interval);
  }, [isOpen, isTransferActive, syncDownloadState]);

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

  const percent = Math.max(0, Math.min(100, downloadState.percent || 0));
  const hasDownloadMetadata =
    Boolean(updateInfo?.hasUpdate) &&
    isSafeDownloadUrl(updateInfo?.downloadUrl) &&
    isValidSha256(updateInfo?.sha256);

  const isDownloadReadyForCurrentRelease =
    downloadState.state === 'ready' &&
    (!downloadState.targetVersion ||
      !updateInfo?.latestVersion ||
      downloadState.targetVersion === updateInfo.latestVersion);

  const showTopStatusBanner = Boolean(status && (!updateInfo?.hasUpdate || status.kind !== 'info'));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-lg bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark flex flex-col overflow-hidden text-ink dark:text-ink-dark font-sans text-right"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-dark dark:bg-surface-dark-2 px-6 py-4 flex items-center justify-between text-white dark:text-ink-dark border-b border-white/10 dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 dark:bg-surface-dark-3 flex items-center justify-center text-paid dark:text-paid-bright">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="t-modal-title text-white dark:text-ink-dark">تحديثات نظام رفيق</h2>
              <p className="text-xs text-white/70 dark:text-ink-dark-muted">
                الإصدار الحالي:{' '}
                <span className="font-mono font-semibold text-white dark:text-ink-dark" dir="ltr">
                  {updateInfo?.currentVersion || '...'}
                </span>
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

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh] bg-surface dark:bg-surface-dark">
          {/* Compact Check Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {isChecking
                ? 'جاري الفحص عن إصدارات جديدة...'
                : checkedAt
                ? `آخر فحص: ${checkedAt}`
                : 'اضغط لفحص وجود تحديثات جديدة'}
            </div>
            <AppButton
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              loading={isChecking}
              disabled={isChecking || isTransferActive || isLaunching}
              onClick={() => void checkForUpdates()}
            >
              فحص التحديثات
            </AppButton>
          </div>

          {/* Status Banner (up to date / offline error / license notice) */}
          {showTopStatusBanner && status && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${statusClass(status.kind)}`}>
              {status.kind === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium leading-relaxed">{status.text}</div>
            </div>
          )}

          {/* Available Update Card */}
          {updateInfo?.hasUpdate && (
            <div className="bg-surface-2 dark:bg-surface-dark-2 rounded-2xl p-5 border border-line dark:border-line-dark space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-warn dark:text-warn-bright shrink-0" />
                  <span className="font-bold text-base text-ink dark:text-ink-dark">
                    الإصدار الجديد <span className="font-mono" dir="ltr">v{updateInfo.latestVersion}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {updateInfo.releaseDate && (
                    <span className="text-xs bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright px-2.5 py-1 rounded-full font-medium">
                      {updateInfo.releaseDate}
                    </span>
                  )}
                  {formatFileSize(updateInfo.fileSizeBytes) && (
                    <span
                      className="text-xs bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted px-2.5 py-1 rounded-full font-medium border border-line dark:border-line-dark"
                      dir="ltr"
                    >
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
                <div className="rounded-xl bg-surface dark:bg-surface-dark p-3.5 border border-line dark:border-line-dark">
                  <div className="text-xs font-bold text-ink dark:text-ink-dark mb-1.5">ما الجديد في هذا الإصدار:</div>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed whitespace-pre-line">
                    {updateInfo.changelog}
                  </p>
                </div>
              )}

              {/* Download / Verify / Install Action Area */}
              {downloadState.state === 'downloading' && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-ink dark:text-ink-dark flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-brand dark:text-brand-bright" />
                      جاري تنزيل التحديث...
                    </span>
                    <span className="font-mono text-brand-dark dark:text-brand-bright" dir="ltr">
                      {percent}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-line dark:bg-surface-dark-3 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand dark:bg-brand-bright transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono" dir="ltr">
                      {formatFileSize(downloadState.bytesDownloaded) || '0 KB'}
                      {downloadState.totalBytes ? ` / ${formatFileSize(downloadState.totalBytes)}` : ''}
                    </span>
                    <AppButton variant="secondary" size="sm" onClick={() => void handleCancelDownload()}>
                      إلغاء التنزيل
                    </AppButton>
                  </div>
                </div>
              )}

              {downloadState.state === 'verifying' && (
                <div className="p-3.5 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand/30 flex items-center gap-3 text-xs font-semibold text-brand-dark dark:text-brand-bright">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>جاري التحقق التلقائي من سلامة ملف التحديث...</span>
                </div>
              )}

              {isDownloadReadyForCurrentRelease && (
                <div className="space-y-3 pt-1">
                  <div className="p-3.5 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid-dark-border flex items-start gap-2.5 text-xs font-medium text-paid dark:text-paid-bright">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>تم تنزيل التحديث والتحقق من سلامته بنجاح وجاهز للتثبيت. كل بياناتك ومبيعاتك محفوظة.</span>
                  </div>

                  {hasActiveSale && (
                    <div className="p-3.5 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn/30 flex items-start gap-2.5 text-xs font-medium text-warn dark:text-warn-bright">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>توجد فاتورة مفتوحة حالياً في شاشة البيع. يرجى إتمام الفاتورة أو تعليقها أولاً قبل بدء التثبيت.</span>
                    </div>
                  )}

                  {launchNotice && (
                    <div className={`p-3 rounded-xl border text-xs font-medium leading-relaxed ${statusClass(launchNotice.kind)}`}>
                      {launchNotice.text}
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 pt-1">
                    <AppButton
                      variant="primary"
                      icon={Play}
                      loading={isLaunching}
                      disabled={isLaunching || hasActiveSale}
                      fullWidth
                      onClick={() => void handleLaunchInstaller()}
                    >
                      تثبيت التحديث الآن
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      icon={Clock}
                      disabled={isLaunching}
                      onClick={requestClose}
                      className="shrink-0"
                    >
                      تأجيل
                    </AppButton>
                  </div>
                </div>
              )}

              {!isTransferActive && !isDownloadReadyForCurrentRelease && (
                <div className="space-y-3 pt-1">
                  {downloadState.state === 'error' && downloadState.errorMessage && (
                    <div className="p-3 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger/30 flex items-start gap-2.5 text-xs font-medium text-danger dark:text-danger-bright leading-relaxed">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{downloadState.errorMessage}</span>
                    </div>
                  )}

                  {downloadState.state === 'cancelled' && (
                    <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
                      تم إلغاء التنزيل. يمكنك تنزيل التحديث في أي وقت.
                    </div>
                  )}

                  {hasDownloadMetadata ? (
                    <>
                      <AppButton
                        variant="primary"
                        icon={DownloadCloud}
                        fullWidth
                        onClick={() => void handleStartDownload()}
                      >
                        {downloadState.state === 'error' ? 'إعادة محاولة التنزيل' : 'تنزيل التحديث الآن'}
                      </AppButton>
                      <p className="text-micro text-ink-muted dark:text-ink-dark-muted text-center leading-relaxed">
                        يتم التحقق من سلامة ملف التثبيت الرسمي تلقائياً، ولن يُغلق البرنامج إلا بموافقتك. بياناتك محفوظة بالكامل.
                      </p>
                    </>
                  ) : (
                    <div className="p-3 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn/30 text-xs font-medium text-warn dark:text-warn-bright leading-relaxed">
                      ملف التثبيت المباشر غير مكتمل البيانات لهذا الإصدار. يرجى التواصل مع الدعم الفني لتحديث بيانات الإصدار.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
