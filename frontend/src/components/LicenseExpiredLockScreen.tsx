import { useState } from 'react';
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

  if (!isOpen) return null;

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
      className="fixed inset-0 z-[9999] bg-[#00140f]/95 backdrop-blur-xl flex items-center justify-center p-4 select-none font-sans overflow-y-auto"
      dir="rtl"
    >
      <div className="w-full max-w-xl bg-[#002219] border-2 border-emerald-600/40 rounded-2xl shadow-2xl shadow-emerald-950/80 p-6 md:p-8 text-white relative">
        {/* Top Glow & Badge */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-3 shadow-lg shadow-red-950/50">
            {isClockIssue ? (
              <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
            ) : (
              <Lock className="w-8 h-8 text-red-400 animate-bounce" />
            )}
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
            {isClockIssue ? 'تنبيه أمان: عدم دقة ساعة النظام' : 'انتهت فترة اشتراك رفيق POS'}
          </h2>

          <p className="text-sm text-emerald-200/80 max-w-md">
            {isClockIssue
              ? (expiryInfo?.clockTamperMessage || 'تم رصد تراجع في ساعة وتاريخ الجهاز مقارنة بآخر سجل نشاط. يرجى تصحيح التاريخ والوقت للمتابعة.')
              : 'توقفت عمليات البيع لانتهاء المدة المحددة من إدارة النظام. يمكنك تجديد الاشتراك فوراً أو التحقق من السيرفر.'}
          </p>
        </div>

        {/* Subscription Info Box */}
        <div className="bg-[#001812] border border-emerald-900/60 rounded-xl p-4 mb-5 text-sm space-y-2">
          <div className="flex justify-between items-center text-slate-300">
            <span className="text-emerald-400/80 font-medium">المتجر:</span>
            <span className="font-bold text-white">{expiryInfo?.shopName || 'سوبرماركت رفيق'}</span>
          </div>

          <div className="flex justify-between items-center text-slate-300">
            <span className="text-emerald-400/80 font-medium">نوع الاشتراك:</span>
            <span className="bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded text-xs text-emerald-300 font-mono">
              {expiryInfo?.licenseType || 'ترخيص محدد المدة'}
            </span>
          </div>

          {expiryInfo?.expiresAt && (
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-emerald-400/80 font-medium">تاريخ الانتهاء:</span>
              <span className="font-mono text-red-300 font-bold">{expiryInfo.expiresAt}</span>
            </div>
          )}

          {/* Machine Fingerprint */}
          <div className="pt-2 border-t border-emerald-900/40 flex items-center justify-between gap-2">
            <div className="text-xs text-emerald-400/80 flex items-center gap-1.5 truncate">
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>بصمة الجهاز:</span>
              <span className="font-mono text-slate-300 select-all truncate text-[11px]">
                {expiryInfo?.deviceFingerprint || '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyFp}
              className="flex items-center gap-1 bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-700/40 text-emerald-200 px-2.5 py-1 rounded text-xs transition active:scale-95 shrink-0"
              title="نسخ بصمة الجهاز لإرسالها للإدارة"
            >
              {copiedFp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFp ? 'تم النسخ' : 'نسخ'}</span>
            </button>
          </div>
        </div>

        {/* Input New License Key */}
        <div className="space-y-3 mb-5">
          <label className="block text-xs font-semibold text-emerald-300">
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
                className="w-full bg-[#001812] border border-emerald-700/60 rounded-xl px-3 py-2.5 text-emerald-100 placeholder-emerald-800 font-mono text-sm tracking-widest focus:outline-none focus:border-emerald-400 transition"
              />
              <button
                type="button"
                onClick={() => void handlePasteKey()}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-500 hover:text-emerald-300 transition"
                title="لصق من الحافظة"
              >
                <ClipboardPaste className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={isLoading || !newKey.trim()}
              onClick={() => void handleActivateNewKey()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-lg shadow-emerald-900/50 active:scale-95 shrink-0"
            >
              <KeyRound className="w-4 h-4" />
              <span>تفعيل</span>
            </button>
          </div>

          {errorMessage && (
            <div className="bg-red-950/60 border border-red-800/70 text-red-200 text-xs p-2.5 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleVerifyOnline()}
            className="flex items-center justify-center gap-2 bg-[#002f23] hover:bg-[#003d2e] border border-emerald-600/50 text-emerald-100 font-semibold py-2.5 px-3 rounded-xl text-xs transition active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحقق من السيرفر (تم التمديد)</span>
          </button>

          {onEnterReadOnlyMode && (
            <button
              type="button"
              onClick={onEnterReadOnlyMode}
              className="flex items-center justify-center gap-2 bg-slate-800/60 hover:bg-slate-700/70 border border-slate-600/50 text-slate-200 font-medium py-2.5 px-3 rounded-xl text-xs transition active:scale-95"
              title="السماح بمراجعة الفواتير السابقة والتقارير والنسخ الاحتياطي دون إمكانية إنشاء مبيعات جديدة"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>وضع القراءة والنسخ الاحتياطي</span>
            </button>
          )}
        </div>

        {/* Support Help Contact */}
        <div className="bg-[#001610] rounded-xl p-3 border border-emerald-950 text-center text-xs text-emerald-400/80 flex items-center justify-center gap-2">
          <PhoneCall className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>لطلب تجديد الاشتراك والدعم الفني:</span>
          <span className="font-mono text-emerald-300 font-bold select-all" dir="ltr">01000000000</span>
        </div>
      </div>
    </div>
  );
};
