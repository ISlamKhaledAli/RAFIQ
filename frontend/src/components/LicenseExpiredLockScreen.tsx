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
  Lock
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';

export interface LicenseExpiryDetails {
  isActive: boolean;
  isExpired: boolean;
  status: string; // 'active' | 'warning' | 'expired' | 'disabled'
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
  const [newKey, setNewKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedFp, setCopiedFp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

        if (!isCancelled && res?.success && res.license?.isActive && res.license.status === 'active') {
          void rafiqAlert({
            title: 'الترخيص سارٍ!',
            message: res.message || 'تم التحقق من تمديد الاشتراك من السيرفر بنجاح!',
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
    if (!type) return 'نسخة تجريبية مجانية';
    switch (type.toLowerCase().trim()) {
      case 'trial':
        return 'فترة تجريبية مجانية';
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
        return d.toLocaleDateString('ar-EG', {
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
        setNewKey(text.trim().toUpperCase());
      }
    } catch {
      // ignore
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
          title: 'تم التجديد بنجاح!',
          message: res.message || 'تم تجديد وترخيص رفيق POS بنجاح.',
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

      if (res?.success && res.license?.isActive && res.license.status === 'active') {
        void rafiqAlert({
          title: 'الترخيص سارٍ!',
          message: res.message || 'تم التحقق من تمديد الاشتراك من السيرفر بنجاح!',
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

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none font-sans overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl shadow-slate-900/25 border border-slate-100 overflow-hidden relative text-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header & Brand Identity */}
        <div className="pt-7 pb-3 px-6 sm:px-8 text-center flex flex-col items-center">
          {/* Official Brand Logo */}
          <div className="mb-3.5 flex items-center justify-center">
            <img 
              src="/logo_full.png" 
              alt="رفيق POS" 
              className="h-10 object-contain drop-shadow-xs" 
            />
          </div>

          {/* Status Pill Badge */}
          <div className="mb-3">
            {isClockIssue ? (
              <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200/90 px-3.5 py-1 rounded-full text-xs font-bold shadow-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                تنبيه أمان: عدم دقة ساعة وتاريخ النظام
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-rose-800 bg-rose-50 border border-rose-200/90 px-3.5 py-1 rounded-full text-xs font-bold shadow-xs">
                <Lock className="w-3.5 h-3.5 text-rose-600" />
                تنبيه: انتهاء فترة الاشتراك
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-1.5">
            {isClockIssue ? 'يرجى تصحيح ساعة وتاريخ النظام' : 'انتهت فترة اشتراك رفيق POS'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-500 max-w-md leading-relaxed">
            {isClockIssue
              ? (expiryInfo?.clockTamperMessage || 'تم رصد تراجع في ساعة وتاريخ الجهاز مقارنة بآخر سجل نشاط. يرجى تصحيح التاريخ والوقت للمتابعة.')
              : 'توقفت عمليات البيع مؤقتاً لانتهاء المدة المحددة من إدارة النظام. يمكنك إدخال كود التجديد فوراً أو التحقق من السيرفر.'}
          </p>
        </div>

        {/* Subscription Info Box */}
        <div className="px-6 sm:px-8 mb-4">
          <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 text-xs sm:text-sm space-y-2.5">
            <div className="flex justify-between items-center text-slate-600">
              <span className="font-semibold text-slate-500">المتجر:</span>
              <span className="font-bold text-slate-900">{expiryInfo?.shopName || 'متجر رفيق'}</span>
            </div>

            <div className="flex justify-between items-center text-slate-600">
              <span className="font-semibold text-slate-500">نوع الاشتراك:</span>
              <span className="bg-emerald-50 text-[#006d41] border border-emerald-200/80 px-3 py-0.5 rounded-full text-xs font-bold">
                {getLicenseTypeArabic(expiryInfo?.licenseType)}
              </span>
            </div>

            {expiryInfo?.expiresAt && (
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold text-slate-500">تاريخ الانتهاء:</span>
                <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-md font-bold text-xs" dir="rtl">
                  {formatArabicDate(expiryInfo.expiresAt)}
                </span>
              </div>
            )}

            {/* Machine Fingerprint */}
            <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium shrink-0">بصمة الجهاز:</span>
                <span className="font-mono text-slate-700 font-semibold select-all truncate text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                  {expiryInfo?.deviceFingerprint || '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyFp}
                className="flex items-center gap-1 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition active:scale-95 shrink-0 shadow-xs"
                title="نسخ بصمة الجهاز لإرسالها للإدارة"
              >
                {copiedFp ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedFp ? 'تم النسخ' : 'نسخ'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Input New License Key */}
        <div className="px-6 sm:px-8 space-y-2 mb-4">
          <label className="block text-xs font-bold text-slate-700">
            أدخل كود التجديد الجديد:
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                placeholder="RFQ-XXXX-XXXX-XXXX"
                dir="ltr"
                className="w-full bg-white border-2 border-slate-200 focus:border-[#006d41] focus:ring-4 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder-slate-400 font-mono text-sm tracking-widest uppercase transition outline-none shadow-xs"
              />
              <button
                type="button"
                onClick={() => void handlePasteKey()}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#006d41] transition rounded hover:bg-slate-100"
                title="لصق من الحافظة"
              >
                <ClipboardPaste className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={isLoading || !newKey.trim()}
              onClick={() => void handleActivateNewKey()}
              className="flex items-center gap-1.5 bg-gradient-to-r from-[#00372d] to-[#006d41] hover:from-[#002d24] hover:to-[#005c36] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black px-5 py-2.5 rounded-xl text-sm transition shadow-md shadow-emerald-900/15 active:scale-95 shrink-0"
            >
              <KeyRound className="w-4 h-4" />
              <span>تفعيل</span>
            </button>
          </div>

          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl flex items-start gap-2 font-medium animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-6 sm:px-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleVerifyOnline()}
            className="flex items-center justify-center gap-2 bg-white hover:bg-emerald-50/50 border-2 border-slate-200 hover:border-[#006d41]/50 text-slate-700 hover:text-[#006d41] font-bold py-2.5 px-3 rounded-xl text-xs transition active:scale-95 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#006d41] ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحقق من السيرفر (تم التمديد)</span>
          </button>

          {onEnterReadOnlyMode && (
            <button
              type="button"
              onClick={onEnterReadOnlyMode}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-700 font-semibold py-2.5 px-3 rounded-xl text-xs transition active:scale-95"
              title="السماح بمراجعة الفواتير السابقة والتقارير والنسخ الاحتياطي دون إمكانية إنشاء مبيعات جديدة"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>وضع القراءة والنسخ الاحتياطي</span>
            </button>
          )}
        </div>

        {/* Support Help Contact */}
        <div className="bg-slate-50 px-6 sm:px-8 py-3.5 border-t border-slate-100 text-center text-xs text-slate-600 flex items-center justify-center gap-2">
          <PhoneCall className="w-3.5 h-3.5 text-[#006d41] shrink-0" />
          <span className="font-medium">لطلب تجديد الاشتراك والدعم الفني:</span>
          <a 
            href="tel:01097782965"
            className="font-mono text-[#006d41] hover:underline font-black text-sm select-all tracking-wider" 
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
