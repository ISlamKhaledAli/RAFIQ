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
  PhoneCall,
  ArrowLeftRight,
  ShieldAlert,
  Smartphone
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert, rafiqConfirm } from '../utils/dialogService';

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
  releaseCode?: string;
}

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLicenseUpdated?: () => void;
}

type LicenseTab = 'online' | 'offline' | 'transfer';

export const LicenseModal = ({ isOpen, onClose, onLicenseUpdated }: LicenseModalProps) => {
  const [activeTab, setActiveTab] = useState<LicenseTab>('online');
  const [license, setLicense] = useState<LicenseInfoData | null>(null);
  const [inputKey, setInputKey] = useState('');
  const [supportCode, setSupportCode] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [releaseCodeResult, setReleaseCodeResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedFp, setCopiedFp] = useState(false);
  const [copiedRel, setCopiedRel] = useState(false);
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
        if (res.releaseCode) {
          setReleaseCodeResult(res.releaseCode);
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
            if (res.releaseCode) {
              setReleaseCodeResult(res.releaseCode);
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
      void navigator.clipboard.writeText(license.deviceFingerprint);
      setCopiedFp(true);
      setTimeout(() => setCopiedFp(false), 2500);
    }
  };

  const handleCopyRel = () => {
    if (releaseCodeResult) {
      void navigator.clipboard.writeText(releaseCodeResult);
      setCopiedRel(true);
      setTimeout(() => setCopiedRel(false), 2500);
    }
  };

  const handleActivateOnline = async () => {
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

  const handleActivateSupportCode = async () => {
    if (!supportCode.trim()) {
      setStatusMessage({ text: 'يرجى إدخال كود الدعم الفني المعتمد (مثال: RFQ-SUP-L270F-...)', type: 'error' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await invoke<{ success: boolean; message: string; code?: string; license?: LicenseInfoData }>('license:activateSupportCode', {
        supportCode: supportCode.trim()
      });

      if (res?.success) {
        setStatusMessage({ text: res.message || 'تم تفعيل الترخيص بنجاح أوفلاين!', type: 'success' });
        if (res.license) {
          setLicense(res.license);
        } else {
          await fetchLicense();
        }
        if (onLicenseUpdated) onLicenseUpdated();
        void rafiqAlert({
          title: 'تفعيل أوفلاين ناجح!',
          message: res.message || 'تم تفعيل ترخيص رفيق POS بنجاح بدون إنترنت عبر كود الدعم المعتمد!',
          variant: 'success',
        });
      } else {
        setStatusMessage({ text: res?.message || 'كود الدعم غير صالح أو غير مخصص لبصمة هذا الجهاز.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'حدث خطأ أثناء تفعيل كود الدعم.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransferDeactivate = async () => {
    const confirmed = await rafiqConfirm({
      title: 'تأكيد إلغاء التفعيل ونقل الترخيص',
      message: 'تحذير: إلغاء التفعيل سيوقف عمليات البيع على هذا الجهاز نهائياً وينتج كود إثبات لنقل الترخيص لجهازك الجديد. هل أنت متأكد من المتابعة؟',
      confirmText: 'نعم، إلغاء التفعيل واستخراج كود النقل',
      cancelText: 'تراجع',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await invoke<{ success: boolean; message: string; releaseCode?: string; license?: LicenseInfoData }>('license:deactivateForTransfer', {
        reason: transferReason.trim() || 'نقل لجهاز كاشير جديد'
      });

      if (res?.success && res.releaseCode) {
        setReleaseCodeResult(res.releaseCode);
        if (res.license) setLicense(res.license);
        if (onLicenseUpdated) onLicenseUpdated();
        setStatusMessage({
          text: `تم إلغاء التفعيل بنجاح! كود إثبات النقل: ${res.releaseCode}`,
          type: 'success'
        });
        void rafiqAlert({
          title: 'تم استخراج كود إثبات النقل',
          message: `كود النقل الخاص بك: ${res.releaseCode}\nيرجى تزويد الدعم الفني بهذا الكود مع بصمة الجهاز الجديد لإتمام التفعيل.`,
          variant: 'info',
        });
      } else {
        setStatusMessage({ text: res?.message || 'تعذر إلغاء التفعيل', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'خطأ أثناء تنفيذ إلغاء التفعيل', type: 'error' });
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

  const isAlreadyActive = license?.isActive && (license.status === 'active' || license.status === 'trial');
  const isTrial = Boolean(license?.isActive) && (license?.status === 'trial' || license?.licenseType === 'trial');
  const isTransferred = license?.status === 'transferred';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#00372d] to-[#006d41] p-6 text-white relative shrink-0">
          <button 
            onClick={onClose}
            className="absolute left-5 top-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <KeyRound className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-sans">ترخيص وتفعيل رفيق POS</h2>
              <p className="text-xs text-emerald-100/90 font-sans">
                حماية أوفلاين مشفرة + تفعيل سحابي أو بكود الدعم الفني + إمكانية النقل
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 mt-4 bg-black/20 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'online' ? 'bg-white text-[#00372d] shadow-xs' : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>تفعيل أونلاين</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offline')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'offline' ? 'bg-white text-[#00372d] shadow-xs' : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>كود الدعم أوفلاين</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transfer')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'transfer' ? 'bg-white text-[#00372d] shadow-xs' : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>نقل الترخيص</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Status Card */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between ${
            isTransferred
              ? 'bg-rose-50 border-rose-200 text-rose-950'
              : isTrial
              ? 'bg-blue-50/90 border-blue-200 text-blue-950'
              : isAlreadyActive 
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
              : 'bg-amber-50/80 border-amber-200 text-amber-950'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isTransferred 
                  ? 'bg-rose-600 text-white' 
                  : isTrial 
                  ? 'bg-blue-600 text-white' 
                  : isAlreadyActive 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-amber-600 text-white'
              }`}>
                {isTransferred ? (
                  <ShieldAlert className="w-6 h-6" />
                ) : isTrial ? (
                  <Clock className="w-6 h-6" />
                ) : isAlreadyActive ? (
                  <ShieldCheck className="w-6 h-6" />
                ) : (
                  <KeyRound className="w-6 h-6" />
                )}
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

            <span className={`px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${
              isTransferred
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : isTrial
                ? 'bg-blue-100 text-blue-800 border-blue-300'
                : isAlreadyActive 
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}>
              {isTransferred ? 'تم النقل' : isTrial ? 'تجربة مجانية' : isAlreadyActive ? 'مفعل ومعتمد' : 'بحاجة لتفعيل'}
            </span>
          </div>

          {/* Trial Notice (Feature #151 / Story 97) */}
          {isTrial && (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-xl text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-blue-950">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>النسخة التجريبية تعمل بكامل مميزاتها بدون أي قيود!</span>
              </div>
              <p className="text-blue-800/90 leading-relaxed">
                يمكنك إدخال منتجاتك وإجراء المبيعات بحرية. عند شراء البرنامج وإدخال كود التفعيل يتم تحويل نسختك فوراً لنسخة دائمة دون فقد أي بيانات أو فواتير.
              </p>
            </div>
          )}

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
              <span className="whitespace-pre-line">{statusMessage.text}</span>
            </div>
          )}

          {/* Hardware Fingerprint Box (Feature #96 / Story 95) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                بصمة عتاد الجهاز الفريدة (Hardware Fingerprint):
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

          {/* Tab 1: Online Cloud Activation */}
          {activeTab === 'online' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                رمز الترخيص السحابي (License Key):
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
                يتطلب اتصالاً بالإنترنت لمرة واحدة فقط لتأكيد الترخيص وتخزين التوكن المشفر محلياً.
              </p>
            </div>
          )}

          {/* Tab 2: Offline Support Code Activation (Story 98 - Task 150-1) */}
          {activeTab === 'offline' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  كود الدعم الفني للتفعيل أوفلاين (Support Code):
                </label>
                <input
                  type="text"
                  value={supportCode}
                  onChange={(e) => setSupportCode(e.target.value.toUpperCase())}
                  placeholder="RFQ-SUP-L270F-XXXXXXXXXXXX"
                  className="w-full bg-slate-50 border-2 border-slate-200 focus:border-[#006d41] rounded-2xl px-4 py-3 text-sm font-mono tracking-wider font-bold text-slate-900 focus:outline-none transition-all text-center dir-ltr"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                * يمنحك فريق الدعم هذا الكود عبر الهاتف أو الواتساب بعد تزويدهم ببصمة جهازك، ويعمل فوراً وبشكل كامل بدون إنترنت نهائياً.
              </p>
            </div>
          )}

          {/* Tab 3: Transfer License (Story 98 - Task 150-1 & 150-2) */}
          {activeTab === 'transfer' && (
            <div className="space-y-3">
              {releaseCodeResult ? (
                <div className="bg-emerald-50 border-2 border-emerald-200 p-4 rounded-2xl space-y-3 text-center">
                  <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-bold text-emerald-950">
                    تم إلغاء التفعيل على هذا الجهاز بنجاح. كود إثبات النقل:
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-300 font-mono text-sm font-black text-emerald-900 tracking-wider select-all dir-ltr">
                    {releaseCodeResult}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyRel}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 mx-auto cursor-pointer"
                  >
                    {copiedRel ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedRel ? 'تم النسخ!' : 'نسخ كود النقل لإرساله للدعم'}</span>
                  </button>
                  <p className="text-[11px] text-slate-600">
                    أرسل هذا الكود مع بصمة الجهاز الجديد للدعم الفني لتفعيل رفيق على جهازك الجديد فوراً.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-xl text-xs space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-950">
                      <ArrowLeftRight className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>خطوات نقل البرنامج لجهاز كاشير جديد:</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-amber-800/90 leading-relaxed pr-1">
                      <li>إلغاء تفعيل الترخيص على هذا الجهاز القديم واستخراج كود إثبات النقل.</li>
                      <li>تثبيت رفيق على الجهاز الجديد والحصول على بصمة عتاده.</li>
                      <li>تزويد الدعم بكود النقل وبصمة الجهاز الجديد للحصول على كود التفعيل الجديد.</li>
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      سبب النقل (اختياري):
                    </label>
                    <input
                      type="text"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="مثال: تغيير جهاز الكاشير القديم بجهاز جديد"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#006d41]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
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
              إغلاق
            </button>

            {activeTab === 'online' && (
              <button
                type="button"
                onClick={handleActivateOnline}
                disabled={isLoading || !inputKey.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00372d] to-[#006d41] hover:from-[#002b23] hover:to-[#005533] text-white font-bold text-xs shadow-md shadow-emerald-900/10 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>جارٍ الاتصال...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>تفعيل أونلاين</span>
                  </>
                )}
              </button>
            )}

            {activeTab === 'offline' && (
              <button
                type="button"
                onClick={handleActivateSupportCode}
                disabled={isLoading || !supportCode.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00372d] to-[#006d41] hover:from-[#002b23] hover:to-[#005533] text-white font-bold text-xs shadow-md shadow-emerald-900/10 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>جارٍ التحقق...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>تفعيل بكود الدعم</span>
                  </>
                )}
              </button>
            )}

            {activeTab === 'transfer' && !releaseCodeResult && (
              <button
                type="button"
                onClick={handleTransferDeactivate}
                disabled={isLoading || isTransferred}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>جارٍ النقل...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>إلغاء التفعيل والنقل</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
