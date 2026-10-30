import { useState, useEffect, useCallback, useRef } from 'react';
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
  Smartphone,
  Wifi,
  RefreshCw,
  Cpu,
  Download
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert, rafiqConfirm } from '../utils/dialogService';
import { useModalDismiss } from '../hooks/useModalDismiss';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string || '').trim();
      if (content) {
        if (content.toUpperCase().startsWith('RFQ-SUP-')) {
          setSupportCode('RFQ-SUP-' + content.slice(8).trim());
        } else {
          setSupportCode(content);
        }
        setStatusMessage({ text: 'تم قراءة كود الدعم من الملف بنجاح', type: 'success' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
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
  }, [setReleaseCodeResult]);

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

  const isDirty = Boolean(inputKey.trim() || supportCode.trim() || transferReason.trim());

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'تجاهل البيانات المدخلة؟',
    confirmMessage: 'لديك بيانات غير مكتملة في نافذة الترخيص. هل تريد حقاً الإغلاق؟',
  });

  const isAlreadyActive = license?.isActive && (license.status === 'active' || license.status === 'trial');
  const isTrial = Boolean(license?.isActive) && (license?.status === 'trial' || license?.licenseType === 'trial');
  const isTransferred = license?.status === 'transferred';

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-surface rounded-3xl shadow-2xl border border-line w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] text-ink font-sans"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-surface px-6 py-5 border-b border-line flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-brand-soft border border-brand/20 flex items-center justify-center text-brand shadow-2xs">
              <KeyRound className="w-6 h-6 text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-ink font-sans m-0">ترخيص وتفعيل برنامج رفيق</h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-brand-soft text-brand border border-brand/20">
                  نسخة المحل
                </span>
              </div>
              <p className="text-xs text-ink-muted font-sans mt-0.5">
                حماية كاملة بدون إنترنت • تفعيل فوري سحابي أو بكود الدعم المباشر
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={requestClose}
            className="w-9 h-9 rounded-xl bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-6 pt-4 pb-1 shrink-0">
          <div className="bg-surface-2 border border-line p-1 rounded-2xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'online' 
                  ? 'bg-surface text-brand shadow-xs border border-line/80 font-black' 
                  : 'text-ink-muted hover:text-ink hover:bg-surface/50'
              }`}
            >
              <Wifi className="w-4 h-4 text-brand" />
              <span>تفعيل أونلاين (سحابي)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offline')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'offline' 
                  ? 'bg-surface text-brand shadow-xs border border-line/80 font-black' 
                  : 'text-ink-muted hover:text-ink hover:bg-surface/50'
              }`}
            >
              <Smartphone className="w-4 h-4 text-brand" />
              <span>كود الدعم (بدون نت)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transfer')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'transfer' 
                  ? 'bg-surface text-brand shadow-xs border border-line/80 font-black' 
                  : 'text-ink-muted hover:text-ink hover:bg-surface/50'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4 text-brand" />
              <span>نقل الترخيص لجهاز آخر</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Status Card */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            isTransferred
              ? 'bg-danger-soft border-danger-border text-danger'
              : isTrial
              ? 'bg-brand-soft/50 border-brand/20 text-brand-dark'
              : isAlreadyActive 
              ? 'bg-paid-soft/50 border-paid-border text-paid' 
              : 'bg-warn-soft/60 border-warn-border text-warn'
          }`}>
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
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
                <div className="text-[11px] font-bold text-ink-muted">حالة ترخيص البرنامج الحالية</div>
                <div className="text-sm font-black text-ink">
                  {license?.statusLabel || (isAlreadyActive ? 'ترخيص دائم نشط (مدى الحياة)' : 'نسخة تجريبية / بانتظار التفعيل')}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted mt-1">
                  {license?.shopName && (
                    <span>المحل: <span className="font-bold text-ink">{license.shopName}</span></span>
                  )}
                  {license?.expiresAt && (
                    <span>ينتهي في: <span className="font-mono font-bold text-ink">{license.expiresAt.split('T')[0]}</span></span>
                  )}
                  {countdownStr && (
                    <span className="inline-flex items-center gap-1 bg-danger-soft text-danger border border-danger-border px-2 py-0.5 rounded-full font-mono text-[11px] font-bold">
                      <Clock className="w-3 h-3 text-danger animate-pulse" />
                      متبقي {countdownStr}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <span className={`px-3 py-1.5 rounded-xl text-xs font-black border shrink-0 shadow-2xs ${
              isTransferred
                ? 'bg-danger-soft text-danger border-danger-border'
                : isTrial
                ? 'bg-brand-soft text-brand border-brand/30'
                : isAlreadyActive 
                ? 'bg-paid-soft text-paid border-paid-border' 
                : 'bg-warn-soft text-warn border-warn-border'
            }`}>
              {isTransferred ? 'تم النقل' : isTrial ? 'تجربة مجانية' : isAlreadyActive ? 'مفعل ومعتمد' : 'بحاجة لتفعيل'}
            </span>
          </div>

          {/* Trial Notice (Feature #151 / Story 97) */}
          {isTrial && (
            <div className="bg-surface-2 border border-line p-3.5 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand flex items-center justify-center border border-brand/20 shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-brand" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-black text-ink">
                  النسخة التجريبية تعمل بكافة خصائصها بدون أي قيود!
                </div>
                <p className="text-[11.5px] text-ink-muted leading-relaxed m-0">
                  تقدر تسجل أصنافك وبضاعتك وتصدر فواتيرك براحتك خالص. ولما تشتري البرنامج وتدخل كود التفعيل، نسختك هتتحول لنسخة دائمة فوراً من غير ما تفقد أي فاتورة أو صنف مسجل.
                </p>
              </div>
            </div>
          )}

          {/* Feedback message */}
          {statusMessage && (
            <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMessage.type === 'success' 
                ? 'bg-paid-soft text-paid border border-paid-border' 
                : statusMessage.type === 'error'
                ? 'bg-danger-soft text-danger border border-danger-border'
                : 'bg-brand-soft text-brand-dark border border-brand/20'
            }`}>
              {statusMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span className="whitespace-pre-line">{statusMessage.text}</span>
            </div>
          )}

          {/* Hardware Fingerprint Box (Feature #96 / Story 95) */}
          <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2.5">
            <div className="flex items-center justify-between text-xs text-ink-muted font-bold">
              <span className="flex items-center gap-1.5 text-ink">
                <Cpu className="w-4 h-4 text-brand" />
                بصمة جهاز الكاشير (Hardware Fingerprint):
              </span>
              <button 
                type="button"
                onClick={handleCopyFp}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                  copiedFp 
                    ? 'bg-paid-soft text-paid border-paid-border' 
                    : 'bg-surface hover:bg-surface-3 text-brand border-line'
                }`}
                title="انقر لنسخ بصمة الجهاز"
              >
                {copiedFp ? <Check className="w-3.5 h-3.5 text-paid" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFp ? 'تم النسخ!' : 'نسخ البصمة'}</span>
              </button>
            </div>
            
            <div className="bg-surface p-3 rounded-xl border border-line font-mono text-xs font-bold text-ink select-all break-all dir-ltr text-center tracking-wider leading-relaxed shadow-2xs">
              {license?.deviceFingerprint || 'RAFIQ-DEV-ACTIVE'}
            </div>

            <div className="bg-paid-soft/50 border border-paid-border/60 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <div className="w-7 h-7 rounded-lg bg-paid-soft text-paid flex items-center justify-center border border-paid-border">
                  <PhoneCall className="w-3.5 h-3.5 text-paid" />
                </div>
                <span>لطلب كود التفعيل أو الدعم الفني المباشر:</span>
              </div>
              <a 
                href="tel:01097782965"
                className="font-mono text-sm font-black text-paid hover:text-paid-hover tracking-wider px-3 py-1 rounded-lg bg-surface border border-paid-border hover:bg-paid hover:text-white transition-all shadow-2xs cursor-pointer dir-ltr flex items-center gap-1.5" 
                title="انقر للاتصال بفريق الدعم"
              >
                <span>01097782965</span>
              </a>
            </div>
          </div>

          {/* Tab 1: Online Cloud Activation */}
          {activeTab === 'online' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-ink">
                كود الترخيص السحابي (License Key):
              </label>
              <input
                type="text"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value.toUpperCase())}
                placeholder="RFQ-PERM-XXXX-XXXX"
                className="w-full h-12 bg-surface border-2 border-line focus:border-brand rounded-2xl px-4 text-sm font-mono tracking-widest font-black text-ink placeholder:text-ink-muted/40 text-center dir-ltr shadow-2xs focus:outline-none transition-all"
              />
              <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                <Wifi className="w-3.5 h-3.5 text-paid shrink-0" />
                <span>بيحتاج اتصال بالإنترنت لثانية واحدة فقط لتأكيد التفعيل، وبعدها بيشتغل بدون نت نهائياً.</span>
              </div>
            </div>
          )}

          {/* Tab 2: Offline Support Code Activation (Story 98 - Task 150-1) */}
          {activeTab === 'offline' && (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink">
                    كود الدعم الفني (بدون إنترنت):
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportFromFile}
                    accept=".txt"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-bold text-brand hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>استيراد كود من ملف (.txt)</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={supportCode}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.trim().toUpperCase().startsWith('RFQ-SUP-')) {
                      setSupportCode('RFQ-SUP-' + val.trim().slice(8));
                    } else {
                      setSupportCode(val);
                    }
                  }}
                  placeholder="RFQ-SUP-eyJhbGci..."
                  className="w-full h-12 bg-surface border-2 border-line focus:border-brand rounded-2xl px-4 text-sm font-mono tracking-widest font-black text-ink placeholder:text-ink-muted/40 text-center dir-ltr shadow-2xs focus:outline-none transition-all"
                />
              </div>
              <div className="bg-paid-soft/50 border border-paid-border p-3 rounded-xl flex items-start gap-2.5 text-xs text-paid">
                <ShieldCheck className="w-4 h-4 text-paid shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-ink-muted leading-relaxed m-0">
                  <strong className="text-ink block mb-0.5">تفعيل أوفلاين فوري:</strong>
                  فريق الدعم بيبعتلك الكود ده على الواتساب أو التليفون بعد ما تديهم بصمة جهازك، وبيفعل البرنامج فوراً بدون أي اتصال بالإنترنت.
                </p>
              </div>
            </div>
          )}

          {/* Tab 3: Transfer License (Story 98 - Task 150-1 & 150-2) */}
          {activeTab === 'transfer' && (
            <div className="space-y-3">
              {releaseCodeResult ? (
                <div className="bg-paid-soft border border-paid-border p-5 rounded-2xl space-y-3 text-center shadow-xs">
                  <div className="w-11 h-11 bg-paid text-white rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-paid">
                      تم إلغاء التفعيل على هذا الجهاز بنجاح
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      كود إثبات النقل الخاص بك:
                    </div>
                  </div>
                  <div className="bg-surface p-3.5 rounded-xl border border-line font-mono text-base font-black text-paid tracking-widest select-all dir-ltr shadow-2xs">
                    {releaseCodeResult}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyRel}
                    className="px-4 py-2.5 bg-paid hover:bg-paid-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 mx-auto cursor-pointer transition-all shadow-xs"
                  >
                    {copiedRel ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedRel ? 'تم النسخ!' : 'نسخ كود النقل لإرساله للدعم'}</span>
                  </button>
                  <p className="text-[11px] text-ink-muted m-0">
                    أرسل الكود ده مع بصمة الجهاز الجديد للدعم الفني لتفعيل رفيق على جهازك الجديد فوراً.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-warn-soft border border-warn-border text-warn p-3.5 rounded-2xl space-y-2">
                    <div className="font-bold text-xs flex items-center gap-1.5 text-warn">
                      <ArrowLeftRight className="w-4 h-4 text-warn shrink-0" />
                      <span>خطوات نقل البرنامج لجهاز كاشير جديد:</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-ink-muted pr-1">
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-warn/15 text-warn font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <span>إلغاء التفعيل على الجهاز القديم ده واستخراج كود إثبات النقل.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-warn/15 text-warn font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <span>تسطيب رفيق على الجهاز الجديد وأخذ بصمة الجهاز الجديد.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-warn/15 text-warn font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                        <span>إرسال كود النقل وبصمة الجهاز الجديد للدعم الفني لاستلام كود التفعيل للجهاز الجديد.</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-ink">
                      سبب النقل (اختياري):
                    </label>
                    <input
                      type="text"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="مثال: قمت بتغيير جهاز الكاشير أو ترقية الهارد"
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
            className="h-10 px-4 rounded-xl border border-line bg-surface hover:bg-surface-3 text-ink font-bold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="التحقق من حالة وسريان الترخيص"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-ink-muted ${isLoading ? 'animate-spin' : ''}`} />
            <span>فحص صلاحية الترخيص</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-xl border border-line bg-surface hover:bg-surface-3 text-ink-muted hover:text-ink font-bold text-xs transition-all cursor-pointer shadow-2xs"
            >
              إغلاق
            </button>

            {activeTab === 'online' && (
              <button
                type="button"
                onClick={handleActivateOnline}
                disabled={isLoading || !inputKey.trim()}
                className="h-10 px-6 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
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
                className="h-10 px-6 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
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
                className="h-10 px-5 rounded-xl bg-danger hover:bg-danger/90 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
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

