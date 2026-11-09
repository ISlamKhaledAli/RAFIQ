import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { 
  ShieldAlert, 
  KeyRound, 
  RefreshCw, 
  Copy, 
  Check, 
  ClipboardPaste, 
  Clock, 
  PhoneCall, 
  FileText,
  AlertTriangle,
  Lock,
  LogOut,
  X
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';
import { RequiredMark } from './RequiredMark';
import { AppButton } from './AppButton';
import { useAuth } from '../context/useAuth';
import { normalizeTokenOrKey, isSignedLicenseToken } from '../utils/tokenNormalizer';

export interface LicenseExpiryDetails {
  isActive: boolean;
  isExpired: boolean;
  status: string; // 'active' | 'warning' | 'expired' | 'disabled' | 'transferred' | 'mismatched'
  statusLabel: string;
  daysRemaining: number;
  expiresAt: string;
  clockTampered: boolean;
  clockTamperMessage: string;
  licenseType: string;
  shopName: string;
  deviceFingerprint: string;
}

interface LicenseExpiredLockScreenProps {
  isOpen: boolean;
  expiryInfo: LicenseExpiryDetails | null;
  onUnlocked: () => void;
  onEnterReadOnlyMode?: () => void;
}

export const LicenseExpiredLockScreen: FC<LicenseExpiredLockScreenProps> = ({
  isOpen,
  expiryInfo,
  onUnlocked,
  onEnterReadOnlyMode,
}) => {
  const { hasPermission, logout } = useAuth();
  const canActivateLicense = hasPermission('settings.license');
  const [newKey, setNewKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedFp, setCopiedFp] = useState(false);
  const [keyActionSuccess, setKeyActionSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const triggerKeySuccess = () => {
    setKeyActionSuccess(true);
    setTimeout(() => setKeyActionSuccess(false), 2000);
  };
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const autoVerify = async () => {
      try {
        const res = await invoke<{
          success: boolean;
          message: string;
          code?: string;
          license?: { isActive: boolean; status: string };
        }>('license:verify');

        const isLicenseActive = Boolean(
          res?.success &&
            (res.code === 'VERIFIED' || Boolean(res.license?.isActive && (res.license?.status === 'active' || res.license?.status === 'trial')))

        );

        if (!isCancelled && isLicenseActive) {
          void rafiqAlert({
            title: 'الترخيص سارٍ!',
            message: res?.message || 'تم تمديد الاشتراك',
            variant: 'success',
          });
          onUnlocked();
        }
      } catch {
        // silent on background auto-check
      }
    };

    void autoVerify();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, onUnlocked]);

  if (!isOpen) return null;

  const getLicenseTypeArabic = (type?: string): string => {
    if (!type) return 'غير مفعل';
    switch (type.toLowerCase().trim()) {
      case 'unlicensed':
        return 'غير مفعل (بانتظار كود الترخيص)';
      case 'trial':
        return 'فترة تجريبية معتمدة من الإدارة';
      case 'annual':
        return 'اشتراك سنوي معتمد';
      case 'monthly':
        return 'اشتراك شهري';
      case 'lifetime':
        return 'ترخيص دائم (مدى الحياة)';
      default:
        return type;
    }
  };

  const formatArabicDate = (dateStr?: string): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ar-EG-u-nu-latn', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch {
      // fallback
    }
    return dateStr.replace(/AM/gi, 'ص').replace(/PM/gi, 'م');
  };

  const handleCopyFp = () => {
    if (expiryInfo?.deviceFingerprint) {
      void navigator.clipboard.writeText(expiryInfo.deviceFingerprint);
      setCopiedFp(true);
      setTimeout(() => setCopiedFp(false), 2000);
    }
  };

  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setNewKey(normalizeTokenOrKey(text));
        triggerKeySuccess();
      }
    } catch {
      // ignore
    }
  };

  const handleCopyKey = () => {
    if (newKey) {
      void navigator.clipboard.writeText(newKey);
      triggerKeySuccess();
    }
  };

  const handleActivateNewKey = async () => {
    if (!newKey.trim()) {
      setErrorMessage('يرجى إدخال رمز الترخيص أولاً (مثال: RFQ-ANNUAL-8899-A1B2)');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await invoke<{
        success: boolean;
        message: string;
        code?: string;
        license?: { isActive: boolean };
      }>('license:activate', {
        licenseKey: newKey.trim(),
      });

      if (res?.success && res.license?.isActive) {
        void rafiqAlert({
          title: 'تم التجديد',
          message: res.message || 'تم تجديد ترخيص نظام رفيق',
          variant: 'success',
        });
        onUnlocked();
      } else {
        setErrorMessage(res?.message || 'رمز الترخيص غير صالح أو غير معتمد لهذا الجهاز.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تفعيل الترخيص.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOnline = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await invoke<{
        success: boolean;
        message: string;
        code?: string;
        license?: { isActive: boolean; status: string };
      }>('license:verify');

      const isLicenseActive = Boolean(
        res?.success &&
          (res.code === 'VERIFIED' || Boolean(res.license?.isActive && (res.license?.status === 'active' || res.license?.status === 'trial')))

      );

      if (isLicenseActive) {
        void rafiqAlert({
          title: 'الترخيص سارٍ!',
          message: res?.message || 'تم تمديد الاشتراك',
          variant: 'success',
        });
        onUnlocked();
      } else {
        setErrorMessage(
          res?.message || 'لم يتم تمديد الاشتراك على السيرفر بعد. يرجى مراجعة إدارة رفيق لتجديد الاشتراك.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر الاتصال بسيرفر التراخيص.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };


  const isClockIssue = Boolean(expiryInfo?.clockTampered);
  const isDeviceMismatch = expiryInfo?.status === 'mismatched';
  const isUnlicensed = !isDeviceMismatch && (expiryInfo?.status === 'unlicensed' || (!expiryInfo?.isActive && !expiryInfo?.expiresAt));

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4 sm:p-6 select-none font-sans overflow-y-auto animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-white dark:bg-surface-dark rounded-3xl shadow-xl border border-slate-100 dark:border-line-dark overflow-hidden relative text-slate-800 dark:text-ink-dark transform-gpu will-change-[transform,opacity] animate-in zoom-in-95 duration-150">
        {/* Header & Brand Identity */}
        <div className="pt-7 pb-3 px-6 sm:px-8 text-center flex flex-col items-center">
          {/* Official Brand Logo */}
          <div className="mb-3.5 flex items-center justify-center">
            <img 
              src="/logo_full.png" 
              alt="نظام رفيق" 
              className="h-10 object-contain drop-shadow-xs dark:hidden" 
            />
            <img 
              src="/logo_full_dark.png" 
              alt="نظام رفيق" 
              className="h-10 object-contain drop-shadow-xs hidden dark:block" 
            />
          </div>

          {/* Status Pill Badge */}
          <div className="mb-3">
            {isClockIssue ? (
              <span className="inline-flex items-center gap-1.5 text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 px-3.5 py-1 rounded-full text-xs font-bold shadow-xs">
                <Clock className="w-3.5 h-3.5 text-warn dark:text-warn-bright animate-pulse" />
                تنبيه أمان: عدم دقة ساعة وتاريخ النظام
              </span>
            ) : isDeviceMismatch ? (
              <span className="inline-flex items-center gap-1.5 text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 px-3.5 py-1 rounded-full text-xs font-bold shadow-xs">
                <Lock className="w-3.5 h-3.5 text-danger dark:text-danger-bright" />
                تنبيه: الترخيص مربوط بجهاز آخر
              </span>
            ) : isUnlicensed ? (
              <span className="inline-flex items-center gap-1.5 text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 px-3.5 py-1 rounded-full text-xs font-bold shadow-xs">
                <KeyRound className="w-3.5 h-3.5 text-warn dark:text-warn-bright" />
                تنبيه: النسخة بانتظار كود التفعيل
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 px-3.5 py-1 rounded-full text-xs font-bold shadow-xs">
                <Lock className="w-3.5 h-3.5 text-danger dark:text-danger-bright" />
                تنبيه: انتهاء فترة الاشتراك
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-ink-dark mb-1.5">
            {isClockIssue
              ? 'يرجى تصحيح ساعة وتاريخ النظام'
              : isDeviceMismatch
              ? 'تم إيقاف البيع: الترخيص مربوط بجهاز آخر'
              : isUnlicensed
              ? 'تفعيل نسخة نظام رفيق'
              : 'انتهت فترة اشتراك نظام رفيق'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-ink-muted-dark max-w-md leading-relaxed">
            {isClockIssue
              ? (expiryInfo?.clockTamperMessage || 'تم رصد تراجع في ساعة وتاريخ الجهاز مقارنة بآخر سجل نشاط. يرجى تصحيح التاريخ والوقت للمتابعة.')
              : isDeviceMismatch
              ? (expiryInfo?.statusLabel || 'هذا الترخيص مربوط بجهاز آخر. يرجى التواصل مع الدعم الفني لرفيق لفك الربط أو نقل الترخيص.')
              : isUnlicensed
              ? 'يرجى إدخال رمز الترخيص أو كود الفترة التجريبية الممنوح من إدارة رفيق، أو تزويد الدعم الفني ببصمة جهازك للمتابعة.'
              : 'توقفت عمليات البيع مؤقتاً لانتهاء المدة المحددة من إدارة النظام. يمكنك إدخال كود التجديد فوراً أو التحقق من السيرفر.'}
          </p>
        </div>

        {/* Subscription Info Box */}
        <div className="px-6 sm:px-8 mb-4">
          <div className="bg-slate-50/90 dark:bg-surface-dark-2 border border-slate-200/90 dark:border-line-dark rounded-2xl p-4 text-xs sm:text-sm space-y-2.5">
            <div className="flex justify-between items-center text-slate-600 dark:text-ink-muted-dark">
              <span className="font-semibold text-slate-500 dark:text-ink-muted-dark">المتجر:</span>
              <span className="font-bold text-slate-900 dark:text-ink-dark">{expiryInfo?.shopName || 'نظام رفيق'}</span>
            </div>

            <div className="flex justify-between items-center text-slate-600 dark:text-ink-muted-dark">
              <span className="font-semibold text-slate-500 dark:text-ink-muted-dark">نوع الاشتراك:</span>
              <span className="bg-emerald-50 dark:bg-paid-dark-soft text-[#006d41] dark:text-paid-bright border border-emerald-200/80 dark:border-paid-dark-border px-3 py-0.5 rounded-full text-xs font-bold">
                {getLicenseTypeArabic(expiryInfo?.licenseType)}
              </span>
            </div>

            {expiryInfo?.expiresAt && (
              <div className="flex justify-between items-center text-slate-600 dark:text-ink-muted-dark">
                <span className="font-semibold text-slate-500 dark:text-ink-muted-dark">تاريخ الانتهاء:</span>
                <span className="text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 px-2.5 py-0.5 rounded-md font-bold text-xs" dir="rtl">
                  {formatArabicDate(expiryInfo.expiresAt)}
                </span>
              </div>
            )}

            {/* Machine Fingerprint */}
            <div className="pt-2.5 border-t border-slate-200/80 dark:border-line-dark flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500 dark:text-ink-muted-dark flex items-center gap-1.5 truncate">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400 dark:text-ink-muted-dark shrink-0" />
                <span className="font-medium shrink-0">بصمة الجهاز:</span>
                <span className="font-mono text-slate-700 dark:text-ink-dark font-semibold select-all truncate text-micro bg-white dark:bg-surface-dark px-2 py-0.5 rounded border border-slate-200 dark:border-line-dark">
                  {expiryInfo?.deviceFingerprint || '—'}
                </span>
              </div>
              <AppButton variant="secondary" size="sm" icon={copiedFp ? Check : Copy} onClick={handleCopyFp} className="shrink-0" title="نسخ بصمة الجهاز لإرسالها للإدارة">
                {copiedFp ? 'تم النسخ' : 'نسخ'}
              </AppButton>
            </div>
          </div>
        </div>

        {/* Activation needs settings.license (owner/root, or a manager the owner granted it to); other sessions get a notice and a way out */}
        {!canActivateLicense ? (
          <div className="px-6 sm:px-8 space-y-3 mb-4">
            <div className="bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-xs p-3 rounded-xl flex items-start gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>يلزم دخول صاحب المحل أو مدير منحه المالك صلاحية الترخيص لتفعيل الترخيص</span>
            </div>
            <AppButton variant="secondary" fullWidth icon={LogOut} onClick={() => void logout()}>
              تسجيل الخروج
            </AppButton>
          </div>
        ) : (
        <div className="px-6 sm:px-8 space-y-2 mb-4">
          <label className="block text-xs font-bold text-slate-700 dark:text-ink-dark">
            {isUnlicensed ? 'أدخل رمز الترخيص أو كود التجربة:' : 'أدخل كود التجديد الجديد:'} <RequiredMark />
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={newKey}
                onPaste={() => {
                  triggerKeySuccess();
                }}
                onChange={(e) => setNewKey(normalizeTokenOrKey(e.target.value))}
                placeholder="RFQ-XXXX-XXXX-XXXX"
                dir="ltr"
                className={`w-full bg-white dark:bg-surface-dark-2 border-2 border-slate-200 dark:border-line-dark focus:border-[#006d41] dark:focus:border-brand-bright focus:ring-4 focus:ring-emerald-500/10 dark:focus:ring-brand-bright/10 rounded-xl pl-3.5 ${
                  newKey ? 'pr-20' : 'pr-10'
                } py-2.5 text-slate-900 dark:text-ink-dark placeholder-slate-400 dark:placeholder-ink-muted-dark/50 font-mono text-sm tracking-widest ${
                  isSignedLicenseToken(newKey) ? '' : 'uppercase'
                } transition outline-none shadow-xs`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {newKey && (
                  <AppButton variant="dangerSubtle" size="xs" icon={X} aria-label="مسح الكود" title="مسح الكود" onClick={() => setNewKey('')} />
                )}
                {newKey ? (
                  <AppButton
                    variant="subtle"
                    size="xs"
                    icon={keyActionSuccess ? Check : Copy}
                    aria-label="نسخ الكود"
                    title={keyActionSuccess ? 'تم النسخ!' : 'نسخ الكود'}
                    onClick={handleCopyKey}
                  />
                ) : (
                  <AppButton
                    variant="subtle"
                    size="xs"
                    icon={keyActionSuccess ? Check : ClipboardPaste}
                    aria-label="لصق من الحافظة"
                    title={keyActionSuccess ? 'تم اللصق!' : 'لصق من الحافظة'}
                    onClick={() => void handlePasteKey()}
                  />
                )}
              </div>
            </div>

            <AppButton
              variant="primary"
              size="lg"
              icon={KeyRound}
              loading={isLoading}
              disabled={!newKey.trim()}
              onClick={() => void handleActivateNewKey()}
              className="shrink-0"
            >
              تفعيل
            </AppButton>
          </div>

          {errorMessage && (
            <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs p-3 rounded-xl flex items-start gap-2 font-medium animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 text-danger dark:text-danger-bright shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
        )}

        {/* Action Buttons */}
        <div className="px-6 sm:px-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
          <AppButton variant="secondary" icon={RefreshCw} loading={isLoading} onClick={() => void handleVerifyOnline()}>
            تحقق من السيرفر (تم التمديد)
          </AppButton>

          {!isUnlicensed && onEnterReadOnlyMode && (
            <AppButton
              variant="secondary"
              icon={FileText}
              onClick={onEnterReadOnlyMode}
              title="السماح بمراجعة الفواتير السابقة والتقارير والنسخ الاحتياطي دون إمكانية إنشاء مبيعات جديدة"
            >
              وضع القراءة والنسخ الاحتياطي
            </AppButton>
          )}
        </div>

        {/* Support Help Contact */}
        <div className="bg-slate-50 dark:bg-surface-dark-2 px-6 sm:px-8 py-3.5 border-t border-slate-100 dark:border-line-dark text-center text-xs text-slate-600 dark:text-ink-muted-dark flex items-center justify-center gap-2">
          <PhoneCall className="w-3.5 h-3.5 text-[#006d41] dark:text-paid-bright shrink-0" />
          <span className="font-medium">لطلب تجديد الاشتراك والدعم الفني:</span>
          <a 
            href="tel:01097782965"
            className="font-mono text-[#006d41] dark:text-paid-bright hover:underline font-black text-sm select-all tracking-wider" 
            dir="ltr"
            title="انقر للاتصال"
          >
            01097782965
          </a>
        </div>
      </div>
    </div>
  );
};
