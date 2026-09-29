import { useState, useEffect, useCallback } from 'react';
import { 
  KeyRound, 
  ShieldCheck, 
  Copy, 
  Check, 
  X, 
  Sparkles,
  AlertCircle,
  Clock,
  PhoneCall
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';

export interface LicenseInfoData {
  isActive: boolean;
  licenseKey: string;
  shopName: string;
  licenseType: string;
  status: string;
  statusLabel: string;
  deviceFingerprint: string;
  activatedAt: string;
  expiresAt: string;
  isOfflineMode: boolean;
}

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLicenseUpdated?: () => void;
}

export const LicenseModal = ({ isOpen, onClose, onLicenseUpdated }: LicenseModalProps) => {
  const [license, setLicense] = useState<LicenseInfoData | null>(null);
  const [inputKey, setInputKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedFp, setCopiedFp] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [countdownStr, setCountdownStr] = useState<string | null>(null);

  useEffect(() => {
    if (!license?.expiresAt) return;

    const updateModalTimer = () => {
      try {
        const raw = license.expiresAt.trim();
        const target = new Date(raw.endsWith('Z') || raw.includes('T') ? raw : `${raw} UTC`).getTime();
        if (isNaN(target)) return;
        const diff = target - Date.now();
        if (diff <= 0) {
          setCountdownStr('انتهت الصلاحية');
          return;
        }
        if (diff <= 24 * 60 * 60 * 1000) {
          const totalSecs = Math.floor(diff / 1000);
          const h = Math.floor(totalSecs / 3600);
          const m = Math.floor((totalSecs % 3600) / 60);
          const s = totalSecs % 60;
          setCountdownStr(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        } else {
          setCountdownStr(null);
        }
      } catch {
        // ignore
      }
    };

    updateModalTimer();
    const timer = setInterval(updateModalTimer, 1000);
    return () => clearInterval(timer);
  }, [license?.expiresAt]);

  const fetchLicense = useCallback(async () => {
    try {
      const res = await invoke<LicenseInfoData>('license:getInfo');
      if (res) {
        setLicense(res);
        if (res.licenseKey) {
          setInputKey((prev) => prev || res.licenseKey);
        }
      }
    } catch (e) {
      console.error('Failed to get license info:', e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (isOpen) {
      void (async () => {
        try {
          const res = await invoke<LicenseInfoData>('license:getInfo');
          if (active && res) {
            setLicense(res);
            if (res.licenseKey) {
              setInputKey((prev) => prev || res.licenseKey);
            }
          }
        } catch {
          // ignore
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyFp = () => {
    if (license?.deviceFingerprint) {
      navigator.clipboard.writeText(license.deviceFingerprint);
      setCopiedFp(true);
      setTimeout(() => setCopiedFp(false), 2000);
    }
  };

  const handleActivate = async () => {
    if (!inputKey.trim()) {
      setStatusMessage({ text: 'يرجى إدخال رمز الترخيص أولاً (مثال: RFQ-PERM-8899-A1B2)', type: 'error' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await invoke<{ success: boolean; message: string; code?: string; license?: LicenseInfoData }>('license:activate', {
        licenseKey: inputKey.trim()
      });

      if (res?.success) {
        setStatusMessage({ text: res.message || 'تم تفعيل الترخيص بنجاح!', type: 'success' });
        if (res.license) {
          setLicense(res.license);
        } else {
          await fetchLicense();
        }
        if (onLicenseUpdated) onLicenseUpdated();
        void rafiqAlert({
          title: 'تهانينا!',
          message: res.message || 'تم تفعيل ترخيص رفيق POS السحابي بنجاح!',
          variant: 'success',
        });
      } else {
        setStatusMessage({ text: res?.message || 'فشل التفعيل، تأكد من صحة الرمز والاتصال بالإنترنت.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'حدث خطأ أثناء الاتصال بسيرفر التراخيص.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await invoke<{ success: boolean; message: string; license?: LicenseInfoData }>('license:verify');
      if (res?.success) {
        setStatusMessage({ text: res.message || 'الترخيص سارٍ ومعتمد لهذا الجهاز', type: 'success' });
        if (res.license) setLicense(res.license);
      } else {
        setStatusMessage({ text: res?.message || 'تعذر التحقق من صلاحية الترخيص', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'خطأ أثناء فحص السيرفر', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const isAlreadyActive = license?.isActive && license.status === 'active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#00372d] to-[#006d41] p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute left-5 top-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <KeyRound className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-sans">ترخيص نظام رفيق POS السحابي</h2>
              <p className="text-xs text-emerald-100/90 font-sans">
                حماية أوفلاين مشفرة + ربط ببصمة عتاد الجهاز
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Status Card */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between ${
            isAlreadyActive 
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
              : 'bg-amber-50/80 border-amber-200 text-amber-950'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isAlreadyActive ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
              }`}>
                {isAlreadyActive ? <ShieldCheck className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">حالة الترخيص الحالية</div>
                <div className="text-base font-bold">
                  {license?.statusLabel || (isAlreadyActive ? 'ترخيص دائم نشط (مدى الحياة)' : 'نسخة تجريبية / غير مفعلة')}
                </div>
                {license?.shopName && (
                  <div className="text-xs text-slate-600 mt-0.5">
                    المنشأة: <span className="font-semibold text-slate-900">{license.shopName}</span>
                  </div>
                )}
                {license?.expiresAt && (
                  <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                    <span>ينتهي في: <span className="font-semibold text-slate-900">{license.expiresAt.split('T')[0]}</span></span>
                    {countdownStr && (
                      <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full font-mono text-[11px] font-bold">
                        <Clock className="w-3 h-3 text-rose-600 animate-pulse" />
                        متبقي {countdownStr}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              isAlreadyActive 
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}>
              {isAlreadyActive ? 'مفعل ومعتمد' : 'بحاجة لتفعيل'}
            </span>
          </div>

          {/* Feedback message */}
          {statusMessage && (
            <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
                : statusMessage.type === 'error'
                ? 'bg-rose-100 text-rose-900 border border-rose-300'
                : 'bg-blue-100 text-blue-900 border border-blue-300'
            }`}>
              {statusMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Machine Hardware Fingerprint */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                بصمة عتاد الجهاز الفريدة (Machine Fingerprint):
              </span>
              <button 
                type="button"
                onClick={handleCopyFp}
                className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
              >
                {copiedFp ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedFp ? 'تم النسخ!' : 'نسخ البصمة'}
              </button>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 font-mono text-xs text-slate-800 select-all break-all dir-ltr text-left">
              {license?.deviceFingerprint || 'RAFIQ-DEV-ACTIVE'}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              * الترخيص يُربط مشفراً بمعالج ولوحة أم هذا الجهاز لمنع التكرار، ولا يتأثر بتغيير الهارد ديسك أو إعادة تثبيت الويندوز.
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs text-slate-600">
              <span className="flex items-center gap-1.5 font-medium">
                <PhoneCall className="w-3.5 h-3.5 text-[#006d41]" />
                لطلب كود تفعيل أو الدعم الفني:
              </span>
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

          {/* License Key Input Form */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              رمز الترخيص (License Key):
            </label>
            <div className="relative">
              <input
                type="text"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value.toUpperCase())}
                placeholder="RFQ-PERM-XXXX-XXXX"
                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-[#006d41] rounded-2xl px-4 py-3 text-sm font-mono tracking-wider font-bold text-slate-900 focus:outline-none transition-all text-center dir-ltr"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              أدخل رمز التفعيل المعتمد المكون من حروف وأرقام مسلّمة من إدارة رفيق.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleVerify}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-white text-slate-700 font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            فحص صلاحية الترخيص
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-200/60 text-slate-600 font-bold text-xs transition-all cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleActivate}
              disabled={isLoading || !inputKey.trim()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00372d] to-[#006d41] hover:from-[#002b23] hover:to-[#005533] text-white font-bold text-xs shadow-md shadow-emerald-900/10 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جارٍ الاتصال بالسيرفر...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>تفعيل الترخيص أونلاين</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
