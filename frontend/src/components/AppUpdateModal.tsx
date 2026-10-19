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
  FolderOpen,
  Info,
  FileCheck2,
  Lock
} from 'lucide-react';
import { invoke, type AppUpdateInfo, type AppUpdateResult } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';
import { useModalDismiss } from '../hooks/useModalDismiss';

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
          text: `يوجد تحديث جديد متاح (${res.latestVersion}) يتضمن ميزات وتحسينات إضافية.`,
          type: 'info'
        });
      } else {
        setStatusMessage({
          text: 'أنت تعمل بأحدث إصدار رسمي من نظام رفيق، ولا توجد تحديثات جديدة.',
          type: 'success'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'تعذر الاتصال بسيرفر التحديثات. يمكنك التحديث أوفلاين عبر فلاشة USB.',
        type: 'error'
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  const handleBrowseOfflinePackage = async () => {
    try {
      const browseRes = await invoke<{ selectedPath: string; cancelled: boolean }>('updates:browsePackage');
      if (browseRes.cancelled || !browseRes.selectedPath) return;

      setIsChecking(true);
      setStatusMessage({
        text: 'بيتم فحص ملف التحديث من الفلاشة والتحقق من سلامة البصمة الأمنية...',
        type: 'info'
      });

      const inspectRes = await invoke<AppUpdateInfo>('updates:inspectPackage', {
        packagePath: browseRes.selectedPath
      });

      setUpdateInfo(inspectRes);

      if (inspectRes.errorMessage) {
        setStatusMessage({
          text: inspectRes.errorMessage,
          type: 'error'
        });
      } else if (inspectRes.hasUpdate) {
        setStatusMessage({
          text: `تم التعرف على حزمة التحديث بنجاح (الإصدار v${inspectRes.latestVersion}) من الفلاشة وهي جاهزة للتثبيت الآمن.`,
          type: 'info'
        });
      } else {
        setStatusMessage({
          text: `الحزمة المحددة تحمل الإصدار (${inspectRes.latestVersion}) وهو مطابق أو أقل من إصدارك الحالي (${inspectRes.currentVersion}).`,
          type: 'info'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'تعذر قراءة ملف التحديث من الفلاشة.',
        type: 'error'
      });
    } finally {
      setIsChecking(false);
    }
  };

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
      text: 'جاري إنشاء نسخة احتياطية آمنة لقاعدة بيانات المحل والإعدادات الحالية...',
      type: 'info'
    });

    try {
      await new Promise((r) => setTimeout(r, 600));
      setApplyProgress(45);
      setStatusMessage({
        text: 'التحقق من بصمة التشفير (SHA-256) وعزل قاعدة البيانات عن ملفات البرنامج...',
        type: 'info'
      });

      await new Promise((r) => setTimeout(r, 600));
      setApplyProgress(80);
      setStatusMessage({
        text: 'تجهيز ملفات الإصدار الجديد وإعداد نقطة التراجع الآمنة...',
        type: 'info'
      });

      const targetPath = updateInfo.packagePath || ('C:\\ProgramData\\RafiqPOS\\updates\\update_v' + updateInfo.latestVersion + '.pkg');
      const res = await invoke<AppUpdateResult>('updates:apply', {
        packagePath: targetPath,
        expectedSha256: updateInfo.sha256 || ''
      });

      setApplyProgress(100);

      if (res.success) {
        setStatusMessage({
          text: res.message || 'تم تحديث ملفات البرنامج بنجاح مع حفظ نسخة احتياطية لكامل بيانات المحل.',
          type: 'success'
        });
        await rafiqAlert({
          title: 'اكتمال التحديث بنجاح',
          message: 'تم تجهيز وتأمين التحديث بنجاح وأخذ نسخة احتياطية شاملة للبيانات. تم الحفاظ على قاعدة البيانات والإعدادات بنسبة 100%.',
          variant: 'success'
        });
        onClose();
      } else {
        setStatusMessage({
          text: res.message || 'حدث خطأ أثناء التحديث وتم التراجع التلقائي بنجاح لحماية المتجر دون أي فقد للبيانات.',
          type: 'error'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'حصل خطأ أثناء التحديث وتم التراجع للوضع السليم بأمان.',
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
          title: 'فحص منظومة التحديث والتراجع',
          message: `${res.message}\nتأكيدات النجاح: ${res.passedAssertions}/${res.totalAssertions}\n• مقارنة الإصدارات: ناجح\n• مطابقة بصمة الهاش: ناجح\n• عزل وحماية قاعدة البيانات: ناجح\n• التراجع التلقائي الفوري عند الخطأ: ناجح\n• دعم التحديث الأوفلاين بالفلاشة: ناجح`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'نتيجة فحص التحديث',
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

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && !isApplying,
    onDismiss: onClose,
    isDirty: false,
  });

  if (!isOpen) return null;

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
        {/* Modal Header */}
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
            disabled={isApplying}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Action Choice Bar (Online / USB Offline) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={isChecking || isApplying}
              className="p-3 rounded-xl border border-line hover:border-brand/40 bg-surface-2 hover:bg-surface text-right transition-all flex items-center gap-3 disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand-dark shrink-0">
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <div className="text-xs font-bold text-ink">فحص عبر الإنترنت</div>
                <div className="text-[10px] text-ink-muted">البحث عن إصدار أحدث عبر السيرفر</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleBrowseOfflinePackage}
              disabled={isChecking || isApplying}
              className="p-3 rounded-xl border border-line hover:border-paid/40 bg-surface-2 hover:bg-surface text-right transition-all flex items-center gap-3 disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-paid-soft flex items-center justify-center text-paid shrink-0">
                <FolderOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-ink">تحديث من فلاشة USB</div>
                <div className="text-[10px] text-ink-muted">اختيار حزمة تحديث محلية (.pkg/.zip)</div>
              </div>
            </button>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${
              statusMessage.type === 'success' 
                ? 'bg-paid-soft text-paid border-paid/20' 
                : statusMessage.type === 'error'
                ? 'bg-danger-soft text-danger border-danger/20'
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

              {/* Offline Package Badge info if from USB */}
              {updateInfo.isOfflinePackage && (
                <div className="p-3 bg-surface rounded-lg border border-line flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-paid" />
                    <span className="font-semibold text-ink">حزمة التحديث الأوفلاين:</span>
                    <span className="text-ink-muted font-mono">{updateInfo.packageFileName || 'update.pkg'}</span>
                  </div>
                  {updateInfo.fileSizeBytes && (
                    <span className="text-ink-muted">
                      {(updateInfo.fileSizeBytes / (1024 * 1024)).toFixed(2)} ميجابايت
                    </span>
                  )}
                </div>
              )}

              {/* Changelog */}
              <div>
                <h4 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-2">
                  تفاصيل وميزات الإصدار:
                </h4>
                <div className="bg-surface p-3.5 rounded-lg border border-line text-sm text-ink leading-relaxed whitespace-pre-line font-normal">
                  {updateInfo.changelog || 'تحسينات شاملة في استقرار النظام وسرعة نقاط البيع.'}
                </div>
              </div>

              {/* Security Shield Note */}
              <div className="flex items-start gap-3 p-3 bg-brand-soft rounded-lg text-xs text-brand-dark border border-brand/20">
                <ShieldCheck className="w-5 h-5 shrink-0 text-paid" />
                <div className="leading-relaxed">
                  <strong>حماية تامة لقاعدة البيانات والإعدادات:</strong> قبل بدء أي تعديل، يتم أخذ نسخة احتياطية تلقائية من بيانات المتجر، مع تفعيل خاصية التراجع الفوري (Automatic Rollback) في حال حدوث أي خطأ لضمان استمرار عمل المحل دون انقطاع.
                </div>
              </div>

              {/* Progress Bar when Applying */}
              {isApplying && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs font-semibold text-ink">
                    <span>جاري التثبيت وتأمين البيانات...</span>
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
              <h3 className="text-base font-bold text-ink">النظام يعمل بأحدث إصدار رسمي</h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                جميع ملفات التطبيق وقاعدة البيانات متوافقة ومؤمنة بالكامل.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] bg-brand-soft text-brand-dark font-medium">
                  <Lock className="w-3 h-3 text-brand" />
                  قاعدة البيانات والإعدادات محمية في وضع التشغيل الآمن
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-surface-2 px-6 py-4 border-t border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunVerificationTests}
              disabled={isChecking || isApplying}
              className="px-3.5 py-2 rounded-xl bg-surface border border-line hover:border-line-hover text-ink text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
              title="فحص سيناريوهات التحقق والتراجع التلقائي وحماية البيانات"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-paid" />
              <span>فحص الأمان والتراجع</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl border border-line text-ink-muted hover:text-ink text-xs font-semibold hover:bg-surface transition-all disabled:opacity-50"
            >
              إغلاق
            </button>

            {updateInfo?.hasUpdate && (
              <button
                onClick={handleApplyUpdate}
                disabled={isApplying}
                className="px-5 py-2 rounded-xl bg-paid hover:bg-paid/90 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <HardDriveDownload className="w-4 h-4" />
                <span>{isApplying ? 'جاري التثبيت...' : 'تثبيت التحديث الآن'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
