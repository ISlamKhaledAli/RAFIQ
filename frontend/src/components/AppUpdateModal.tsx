import { useState, useEffect, useCallback, useRef } from 'react';
import { DownloadCloud, Sparkles, CheckCircle2, AlertTriangle, X, RefreshCw, Info, HardDriveDownload } from 'lucide-react';
import { invoke, type AppUpdateInfo } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoCheck?: boolean;
  onUpdateInfoChange?: (info: AppUpdateInfo | null) => void;
}

type StatusType = 'success' | 'error' | 'info' | 'warn';

// Updates are informational only: installing happens through the official Setup run by the technician (data is preserved).
export const AppUpdateModal = ({ isOpen, onClose, autoCheck = false, onUpdateInfoChange }: AppUpdateModalProps) => {
  const onUpdateInfoChangeRef = useRef(onUpdateInfoChange);
  useEffect(() => {
    onUpdateInfoChangeRef.current = onUpdateInfoChange;
  });

  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: StatusType } | null>(null);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setStatusMessage(null);
    try {
      const res = await invoke<AppUpdateInfo>('updates:check');
      setUpdateInfo(res);
      onUpdateInfoChangeRef.current?.(res);
      if (res.errorMessage && !res.hasUpdate) {
        setStatusMessage({ text: res.errorMessage, type: 'error' });
      } else if (res.hasUpdate && res.isEligible === false) {
        setStatusMessage({
          text: `يوجد إصدار جديد (${res.latestVersion})، ولكن ترخيص هذا الجهاز غير مصرح له باستلام التحديثات حالياً.`,
          type: 'warn',
        });
      } else if (res.hasUpdate) {
        setStatusMessage({ text: `يوجد إصدار جديد متاح (${res.latestVersion}).`, type: 'info' });
      } else {
        setStatusMessage({ text: 'أنت تعمل بأحدث إصدار رسمي من نظام رفيق، ولا توجد تحديثات جديدة.', type: 'success' });
      }
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error && err.message ? err.message : 'تعذر الاتصال بسيرفر التحديثات. تأكد من اتصال الإنترنت.',
        type: 'error',
      });
    } finally {
      setIsChecking(false);
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

  const statusClass = (type: StatusType) =>
    type === 'success'
      ? 'bg-paid-soft text-paid border-paid/20'
      : type === 'error'
      ? 'bg-danger-soft text-danger border-danger/20'
      : type === 'warn'
      ? 'bg-warn-soft text-warn border-warn/20'
      : 'bg-brand-soft text-brand-dark border-brand/20';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-line flex flex-col overflow-hidden text-ink font-sans text-right"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand-dark px-6 py-4 flex items-center justify-between text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-paid">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">تحديثات نظام رفيق</h2>
              <p className="text-xs text-white/70">
                إصدار النظام الحالي: <span className="font-mono font-semibold">{updateInfo?.currentVersion || '1.0.0'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={requestClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={isChecking}
            className="w-full p-3 rounded-xl border border-line hover:border-brand/40 bg-surface-2 hover:bg-surface text-right transition-all flex items-center gap-3 disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand-dark shrink-0">
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="text-xs font-bold text-ink">فحص وجود إصدار أحدث</div>
              <div className="text-[10px] text-ink-muted">يعرض فقط إن كان هناك إصدار جديد، ولا يقوم بتثبيت أي شيء</div>
            </div>
          </button>

          {statusMessage && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${statusClass(statusMessage.type)}`}>
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              ) : statusMessage.type === 'info' ? (
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium leading-relaxed">{statusMessage.text}</div>
            </div>
          )}

          {updateInfo?.hasUpdate && (
            <div className="bg-surface-2 rounded-xl p-5 border border-line space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-warn" />
                  <span className="font-bold text-base text-ink">الإصدار الجديد: v{updateInfo.latestVersion}</span>
                </div>
                {updateInfo.releaseDate && (
                  <span className="text-xs bg-brand/10 text-brand px-2.5 py-1 rounded-full font-medium">
                    تاريخ الإصدار: {updateInfo.releaseDate}
                  </span>
                )}
              </div>
              {updateInfo.changelog && (
                <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-line">{updateInfo.changelog}</p>
              )}
            </div>
          )}

          <div className="p-4 rounded-xl bg-brand-soft border border-brand/20 text-brand-dark flex items-start gap-3">
            <HardDriveDownload className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <strong className="block text-ink font-bold mb-1">طريقة تثبيت الإصدار الجديد</strong>
              لحماية الجهاز، لا يتم تثبيت التحديثات من داخل البرنامج. اطلب من الفني المعتمد ملف التثبيت الرسمي الجديد
              (Setup) على فلاشة USB وشغّله على هذا الجهاز؛ كل بيانات المحل والمبيعات والإعدادات تبقى محفوظة كما هي.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
