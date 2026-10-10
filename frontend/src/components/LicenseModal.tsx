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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-surface rounded-3xl shadow-2xl border border-line w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-brand-dark p-6 text-white relative shrink-0">
          <button 
            onClick={onClose}
            className="absolute left-5 top-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <KeyRound className="w-6 h-6 text-paid" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-sans">ترخيص وتفعيل برنامج رفيق</h2>
              <p className="text-xs text-white/80 font-sans">
                حماية كاملة بدون إنترنت + تفعيل سريع أو بكود الدعم المباشر
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 mt-4 bg-black/20 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'online' ? 'bg-surface text-brand-dark shadow-xs' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>تفعيل بالنت (أونلاين)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offline')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'offline' ? 'bg-surface text-brand-dark shadow-xs' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>كود الدعم (بدون نت)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transfer')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'transfer' ? 'bg-surface text-brand-dark shadow-xs' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>نقل الترخيص لجهاز تاني</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Status Card */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between ${
            isTransferred
              ? 'bg-danger-soft border-danger-border text-danger'
              : isTrial
              ? 'bg-brand-soft border-brand/20 text-brand-dark'
              : isAlreadyActive 
              ? 'bg-paid-soft border-paid-border text-paid' 
              : 'bg-warn-soft border-warn-border text-warn'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isTransferred 
                  ? 'bg-danger text-white' 
                  : isTrial 
                  ? 'bg-brand text-white' 
                  : isAlreadyActive 
                  ? 'bg-paid text-white' 
                  : 'bg-warn text-white'
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
                <div className="text-xs font-semibold text-ink-muted">حالة ترخيص البرنامج</div>
                <div className="text-base font-bold text-ink">
                  {license?.statusLabel || (isAlreadyActive ? 'ترخيص دائم وشغال (مدى الحياة)' : 'نسخة تجريبية / غير مفعلة')}
                </div>
                {license?.shopName && (
                  <div className="text-xs text-ink-muted mt-0.5">
                    المحل: <span className="font-semibold text-ink">{license.shopName}</span>
                  </div>
                )}
                {license?.expiresAt && (
                  <div className="text-xs text-ink-muted mt-1 flex flex-wrap items-center gap-2">
                    <span>ينتهي في: <span className="font-semibold text-ink">{license.expiresAt.split('T')[0]}</span></span>
                    {countdownStr && (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-danger border border-red-200 px-2 py-0.5 rounded-full font-mono text-[11px] font-bold">
                        <Clock className="w-3 h-3 text-danger animate-pulse" />
                        متبقي {countdownStr}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${
              isTransferred
                ? 'bg-red-100 text-danger border-red-300'
                : isTrial
                ? 'bg-brand-soft text-brand border-brand/20'
                : isAlreadyActive 
                ? 'bg-paid-soft text-paid border-paid-border' 
                : 'bg-warn-soft text-warn border-warn-border'
            }`}>
              {isTransferred ? 'تم النقل' : isTrial ? 'تجربة مجانية' : isAlreadyActive ? 'مفعل ومعتمد' : 'بحاجة لتفعيل'}
            </span>
          </div>

          {/* Trial Notice (Feature #151 / Story 97) */}
          {isTrial && (
            <div className="bg-brand-soft border border-brand/20 text-brand-dark p-3 rounded-xl text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-brand-dark">
                <Sparkles className="w-4 h-4 text-brand shrink-0" />
                <span>النسخة التجريبية شغالة بكل ميزاتها من غير أي قيود!</span>
              </div>
              <p className="text-ink-muted leading-relaxed">
                تقدر تسجل بضاعتك وتبيع فواتير براحتك خالص. ولما تشتري البرنامج وتدخل كود التفعيل، نسختك هتتحول لنسخة دائمة فوراً من غير ما تفقد أي فاتورة أو صنف.
              </p>
            </div>
          )}

          {/* Feedback message */}
          {statusMessage && (
            <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMessage.type === 'success' 
                ? 'bg-paid-soft text-paid border border-paid-border' 
                : statusMessage.type === 'error'
                ? 'bg-red-100 text-danger border border-red-300'
                : 'bg-brand-soft text-brand-dark border border-brand/20'
            }`}>
              {statusMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span className="whitespace-pre-line">{statusMessage.text}</span>
            </div>
          )}

          {/* Hardware Fingerprint Box (Feature #96 / Story 95) */}
          <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-muted font-semibold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand" />
                بصمة جهاز الكاشير (Hardware Fingerprint):
              </span>
              <button 
                type="button"
                onClick={handleCopyFp}
                className="flex items-center gap-1 text-[11px] text-brand hover:text-brand-dark font-bold cursor-pointer"
              >
                {copiedFp ? <Check className="w-3.5 h-3.5 text-paid" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedFp ? 'تم النسخ!' : 'نسخ البصمة'}
              </button>
            </div>
            <div className="bg-surface p-2.5 rounded-xl border border-line font-mono text-xs text-ink select-all break-all dir-ltr text-left">
              {license?.deviceFingerprint || 'RAFIQ-DEV-ACTIVE'}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-line text-xs text-ink-muted">
              <span className="flex items-center gap-1.5 font-medium">
                <PhoneCall className="w-3.5 h-3.5 text-paid" />
                لطلب كود التفعيل أو الدعم الفني المباشر:
              </span>
              <a 
                href="tel:01097782965"
                className="font-mono text-paid hover:underline font-black text-sm select-all tracking-wider" 
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
              <label className="block text-xs font-bold text-ink">
                كود الترخيص (License Key):
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value.toUpperCase())}
                  placeholder="RFQ-PERM-XXXX-XXXX"
                  className="w-full bg-surface-2 border border-line focus:border-brand rounded-2xl px-4 py-3 text-sm font-mono tracking-wider font-bold text-ink focus:outline-none transition-all text-center dir-ltr"
                />
              </div>
              <p className="text-[11px] text-ink-muted">
                بيحتاج نت لثانية واحدة بس أول مرة لتأكيد التفعيل، وبعدها بيشتغل بدون نت نهائياً.
              </p>
            </div>
          )}

          {/* Tab 2: Offline Support Code Activation (Story 98 - Task 150-1) */}
          {activeTab === 'offline' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink">
                  كود الدعم الفني (بدون إنترنت):
                </label>
                <input
                  type="text"
                  value={supportCode}
                  onChange={(e) => setSupportCode(e.target.value.toUpperCase())}
                  placeholder="RFQ-SUP-L270F-XXXXXXXXXXXX"
                  className="w-full bg-surface-2 border border-line focus:border-brand rounded-2xl px-4 py-3 text-sm font-mono tracking-wider font-bold text-ink focus:outline-none transition-all text-center dir-ltr"
                />
              </div>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                * فريق الدعم بيبعتلك الكود ده على الواتساب أو التليفون بعد ما تديهم بصمة جهازك، وبيفعل البرنامج فوراً بدون أي اتصال بالإنترنت.
              </p>
            </div>
          )}

          {/* Tab 3: Transfer License (Story 98 - Task 150-1 & 150-2) */}
          {activeTab === 'transfer' && (
            <div className="space-y-3">
              {releaseCodeResult ? (
                <div className="bg-paid-soft border border-paid-border p-4 rounded-2xl space-y-3 text-center">
                  <div className="w-10 h-10 bg-paid text-white rounded-full flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-bold text-paid">
                    تم إلغاء التفعيل على هذا الجهاز بنجاح. كود إثبات النقل:
                  </div>
                  <div className="bg-surface p-3 rounded-xl border border-line font-mono text-sm font-black text-paid tracking-wider select-all dir-ltr">
                    {releaseCodeResult}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyRel}
                    className="px-4 py-2 bg-paid hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 mx-auto cursor-pointer"
                  >
                    {copiedRel ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedRel ? 'تم النسخ!' : 'نسخ كود النقل لإرساله للدعم'}</span>
                  </button>
                  <p className="text-[11px] text-ink-muted">
                    أرسل الكود ده مع بصمة الجهاز الجديد للدعم الفني لتفعيل رفيق على جهازك الجديد فوراً.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-warn-soft border border-warn-border text-warn p-3.5 rounded-xl text-xs space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-warn">
                      <ArrowLeftRight className="w-4 h-4 text-warn shrink-0" />
                      <span>خطوات نقل البرنامج لجهاز كاشير جديد:</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-ink-muted leading-relaxed pr-1">
                      <li>إلغاء التفعيل على الجهاز القديم ده واستخراج كود النقل.</li>
                      <li>تسطيب رفيق على الجهاز الجديد وأخذ بصمة الجهاز.</li>
                      <li>إرسال كود النقل وبصمة الجهاز الجديد للدعم الفني لاستلام كود التفعيل للجهاز الجديد.</li>
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-ink">
                      سبب النقل (اختياري):
                    </label>
                    <input
                      type="text"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="مثال: اشتريت جهاز كاشير جديد"
                      className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2.5 text-xs text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-2 border-t border-line flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleVerify}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl border border-line hover:bg-surface text-ink font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            فحص صلاحية الترخيص
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-line hover:bg-surface text-ink-muted hover:text-ink font-bold text-xs transition-all cursor-pointer"
            >
              إغلاق
            </button>

            {activeTab === 'online' && (
              <button
                type="button"
                onClick={handleActivateOnline}
                disabled={isLoading || !inputKey.trim()}
                className="px-6 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>بيتم الاتصال...</span>
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
                className="px-6 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>بيتم التحقق...</span>
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
                className="px-5 py-2.5 rounded-xl bg-danger hover:bg-red-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>بيتم تجهيز النقل...</span>
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
