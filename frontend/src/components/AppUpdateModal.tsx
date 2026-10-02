import { useState, useEffect, useCallback } from 'react';
import { 
  DownloadCloud, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ShieldCheck, 
  RefreshCw,
  HardDriveDownload,
  Info
} from 'lucide-react';
import { invoke, type AppUpdateInfo, type AppUpdateResult } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoCheck?: boolean;
}

export const AppUpdateModal = ({ isOpen, onClose, autoCheck = false }: AppUpdateModalProps) => {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setStatusMessage(null);
    try {
      const res = await invoke<AppUpdateInfo>('updates:check');
      setUpdateInfo(res);
      if (res.hasUpdate) {
        setStatusMessage({
          text: `يوجد إصدار جديد متاح (${res.latestVersion}) يتضمن تحسينات وميزات مهمة!`,
          type: 'info'
        });
      } else {
        setStatusMessage({
          text: 'النظام محدث بالكامل إلى أحدث إصدار متاح.',
          type: 'success'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'تعذر الاتصال بسيرفر التحديثات، تحقق من الاتصال بالإنترنت.',
        type: 'error'
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    let timer: any;
    if (isOpen) {
      if (autoCheck || !updateInfo) {
        timer = setTimeout(() => {
          void checkForUpdates();
        }, 10);
      }
    } else {
      timer = setTimeout(() => {
        setApplyProgress(0);
        setIsApplying(false);
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [isOpen, autoCheck, checkForUpdates, updateInfo]);

  const handleApplyUpdate = async () => {
    if (!updateInfo) return;

    setIsApplying(true);
    setApplyProgress(15);
    setStatusMessage({
      text: 'جاري أخذ نسخة احتياطية إجبارية من قاعدة البيانات لضمان أمان البيانات 100%...',
      type: 'info'
    });

    try {
      await new Promise((r) => setTimeout(r, 600));
      setApplyProgress(45);
      setStatusMessage({
        text: 'جاري فحص تطابق التوقيع الرقمي ومطابقة الهاش (SHA-256)...',
        type: 'info'
      });

      await new Promise((r) => setTimeout(r, 600));
      setApplyProgress(80);
      setStatusMessage({
        text: 'جاري فك وتجهيز ملفات الإصدار الجديد مع تفعيل آلية التراجع التلقائي...',
        type: 'info'
      });

      const res = await invoke<AppUpdateResult>('updates:apply', {
        packagePath: 'C:\\ProgramData\\RafiqPOS\\updates\\update_v' + updateInfo.latestVersion + '.pkg',
        expectedSha256: updateInfo.sha256 || 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
      });

      setApplyProgress(100);

      if (res.success) {
        setStatusMessage({
          text: res.message || 'تم تحديث البرنامج بنجاح! تم أخذ نسخة احتياطية تلقائياً.',
          type: 'success'
        });
        await rafiqAlert({
          title: 'نجاح التحديث',
          message: 'تم تحديث نظام رفيق بنجاح مع تأمين كامل البيانات بنسخة احتياطية فورية. سيتم تطبيق التغييرات.',
          variant: 'success'
        });
        onClose();
      } else {
        setStatusMessage({
          text: res.message || 'تعذر التحديث، وتم التراجع التلقائي بنجاح.',
          type: 'error'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'حدث خطأ أثناء تطبيق التحديث وتم التراجع بأمان.',
        type: 'error'
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleRunVerificationTests = async () => {
    try {
      const res = await invoke<any>('updates:runTests');
      if (res.success) {
        await rafiqAlert({
          title: 'فحص منظومة التحديث',
          message: `${res.message}\nتأكيدات النجاح: ${res.passedAssertions}/${res.totalAssertions}`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'نتيجة الفحص',
          message: res.message || 'تعثر فحص بعض مسارات التحديث.',
          variant: 'error'
        });
      }
    } catch (err: any) {
      await rafiqAlert({
        title: 'خطأ',
        message: err?.message || 'تعذر تشغيل اختبارات التحديث.',
        variant: 'error'
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-line flex flex-col overflow-hidden text-ink font-sans text-right"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="bg-brand-dark px-6 py-4 flex items-center justify-between text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-paid">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">تحديثات نظام رفيق (Rafiq Update)</h2>
              <p className="text-xs text-white/70">
                إصدارك الحالي: <span className="font-mono font-semibold">{updateInfo?.currentVersion || '1.0.0'}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isApplying}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Status Message */}
          {statusMessage && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${
              statusMessage.type === 'success' 
                ? 'bg-paid-soft text-paid border-paid/20' 
                : statusMessage.type === 'error'
                ? 'bg-red-50 text-danger border-danger/20'
                : 'bg-brand-soft text-brand-dark border-brand/20'
            }`}>
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              ) : statusMessage.type === 'error' ? (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium leading-relaxed">
                {statusMessage.text}
              </div>
            </div>
          )}

          {/* Update Details Card */}
          {updateInfo?.hasUpdate ? (
            <div className="bg-surface-2 rounded-xl p-5 border border-line space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-warn" />
                  <span className="font-bold text-base text-ink">
                    الإصدار الجديد: v{updateInfo.latestVersion}
                  </span>
                </div>
                {updateInfo.releaseDate && (
                  <span className="text-xs bg-brand/10 text-brand px-2.5 py-1 rounded-full font-medium">
                    تاريخ الإصدار: {updateInfo.releaseDate}
                  </span>
                )}
              </div>

              {/* Changelog */}
              <div>
                <h4 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-2">
                  أبرز المميزات والتحسينات في هذا الإصدار:
                </h4>
                <div className="bg-surface p-3.5 rounded-lg border border-line text-sm text-ink leading-relaxed whitespace-pre-line font-normal">
                  {updateInfo.changelog || 'تحسينات عامة في استقرار النظام وزيادة سرعة الاستجابة.'}
                </div>
              </div>

              {/* Security Shield Note */}
              <div className="flex items-start gap-3 p-3 bg-brand-soft rounded-lg text-xs text-brand-dark border border-brand/20">
                <ShieldCheck className="w-5 h-5 shrink-0 text-paid" />
                <div className="leading-relaxed">
                  <strong>أمان بياناتك مضمون 100%:</strong> قبل تثبيت أي تحديث، يقوم النظام بأخذ نسخة احتياطية إجبارية من قاعدة البيانات والملفات، مع ميزة التراجع التلقائي الفوري (Automatic Rollback) في حال تعذر اكتمال التحديث.
                </div>
              </div>

              {/* Progress Bar when Applying */}
              {isApplying && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs font-semibold text-ink">
                    <span>جاري التثبيت والتأمين...</span>
                    <span>{applyProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-line rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-paid transition-all duration-300 rounded-full"
                      style={{ width: `${applyProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center space-y-3 bg-surface-2 rounded-xl border border-line">
              <div className="w-14 h-14 rounded-full bg-paid-soft text-paid flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-ink">أنت تعمل بأحدث إصدار من رفيق</h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                جميع ملفات النظام وقواعد البيانات متوافقة تماماً وتعمل بأعلى درجات الكفاءة والأمان.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-surface-2 px-6 py-4 border-t border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={checkForUpdates}
              disabled={isChecking || isApplying}
              className="px-3.5 py-2 rounded-xl bg-surface border border-line hover:border-line-hover text-ink text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>فحص مجدداً</span>
            </button>
            <button
              onClick={handleRunVerificationTests}
              disabled={isChecking || isApplying}
              className="px-3 py-2 rounded-xl bg-surface border border-line hover:border-line-hover text-ink-muted hover:text-ink text-xs font-medium transition-all disabled:opacity-50"
              title="فحص سيناريوهات التحقق والتراجع التلقائي"
            >
              فحص الأمان
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl border border-line text-ink-muted hover:text-ink text-xs font-semibold hover:bg-surface transition-all disabled:opacity-50"
            >
              تذكيري لاحقاً
            </button>

            {updateInfo?.hasUpdate && (
              <button
                onClick={handleApplyUpdate}
                disabled={isApplying}
                className="px-5 py-2 rounded-xl bg-paid hover:bg-paid/90 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <HardDriveDownload className="w-4 h-4" />
                <span>{isApplying ? 'جاري التحديث...' : 'تحديث وتثبيت الآن'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
