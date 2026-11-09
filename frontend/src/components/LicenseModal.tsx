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
import { isSameFormValue } from '../utils/dirtyForm';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { RequiredMark } from './RequiredMark';
import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';

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
  const tabPanel = useMotionPanel(activeTab);
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
        setStatusMessage({ text: 'تمت قراءة كود الدعم من الملف', type: 'success' });
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
      setInputKey('');
      setSupportCode('');
      setTransferReason('');
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
        setStatusMessage({ text: res.message || 'تم تفعيل الترخيص', type: 'success' });
        if (res.license) {
          setLicense(res.license);
        } else {
          await fetchLicense();
        }
        if (onLicenseUpdated) onLicenseUpdated();
        void rafiqAlert({
          title: 'تهانينا!',
          message: res.message || 'تم تفعيل ترخيص نظام رفيق',
          variant: 'success',
        });
      } else {
        setStatusMessage({ text: res?.message || 'فشل التفعيل، تأكد من صحة الرمز والاتصال بالإنترنت.', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: msg || 'حدث خطأ أثناء الاتصال بسيرفر التراخيص.', type: 'error' });
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
        setStatusMessage({ text: res.message || 'تم تفعيل الترخيص أوفلاين', type: 'success' });
        if (res.license) {
          setLicense(res.license);
        } else {
          await fetchLicense();
        }
        if (onLicenseUpdated) onLicenseUpdated();
        void rafiqAlert({
          title: 'تفعيل أوفلاين ناجح!',
          message: res.message || 'تم تفعيل الترخيص بدون إنترنت',
          variant: 'success',
        });
      } else {
        setStatusMessage({ text: res?.message || 'كود الدعم غير صالح أو غير مخصص لبصمة هذا الجهاز.', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: msg || 'حدث خطأ أثناء تفعيل كود الدعم.', type: 'error' });
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
          text: `تم إلغاء التفعيل. كود إثبات النقل: ${res.releaseCode}`,
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: msg || 'خطأ أثناء تنفيذ إلغاء التفعيل', type: 'error' });
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: msg || 'خطأ أثناء فحص السيرفر', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const isDirty = Boolean(
    !isSameFormValue(inputKey, license?.licenseKey) || supportCode.trim() || transferReason.trim()
  );

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-surface dark:bg-surface-dark rounded-3xl shadow-2xl border border-line dark:border-line-dark w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] text-ink dark:text-ink-dark font-sans"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-surface dark:bg-surface-dark px-6 py-5 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs">
              <KeyRound className="w-6 h-6 text-brand dark:text-brand-bright" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-ink dark:text-ink-dark font-sans m-0">ترخيص وتفعيل برنامج رفيق</h2>
                <span className="px-2 py-0.5 rounded-md text-micro font-black bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20">
                  نسخة المحل
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted font-sans mt-0.5">
                حماية كاملة بدون إنترنت • تفعيل فوري سحابي أو بكود الدعم المباشر
              </p>
            </div>
          </div>

          <AppButton variant="secondary" size="sm" icon={X} aria-label="إغلاق" onClick={requestClose} />
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-6 pt-4 pb-1 shrink-0">
          <div className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-1 rounded-2xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'online' 
                  ? 'bg-surface dark:bg-surface-dark-3 text-brand dark:text-brand-bright shadow-xs border border-line/80 dark:border-line-dark/80 font-black' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface/50 dark:hover:bg-surface-dark-3/50'
              }`}
            >
              <Wifi className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span>تفعيل أونلاين (سحابي)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offline')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'offline' 
                  ? 'bg-surface dark:bg-surface-dark-3 text-brand dark:text-brand-bright shadow-xs border border-line/80 dark:border-line-dark/80 font-black' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface/50 dark:hover:bg-surface-dark-3/50'
              }`}
            >
              <Smartphone className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span>كود الدعم (بدون نت)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transfer')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'transfer' 
                  ? 'bg-surface dark:bg-surface-dark-3 text-brand dark:text-brand-bright shadow-xs border border-line/80 dark:border-line-dark/80 font-black' 
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface/50 dark:hover:bg-surface-dark-3/50'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span>نقل الترخيص لجهاز آخر</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Status Card */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            isTransferred
              ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger/30 text-danger dark:text-danger-bright'
              : isTrial
              ? 'bg-brand-soft/50 dark:bg-brand-dark-soft/50 border-brand/20 dark:border-brand-bright/20 text-brand-dark dark:text-brand-bright'
              : isAlreadyActive 
              ? 'bg-paid-soft/50 dark:bg-paid-dark-soft/50 border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright' 
              : 'bg-warn-soft/60 dark:bg-warn-dark-soft/60 border-warn-border dark:border-warn-border/30 text-warn dark:text-warn-bright'
          }`}>
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
                isTransferred 
                  ? 'bg-danger text-white' 
                  : isTrial 
                  ? 'bg-brand dark:bg-brand-bright text-white dark:text-surface-dark' 
                  : isAlreadyActive 
                  ? 'bg-paid text-white' 
                  : 'bg-warn-bright text-ink dark:bg-warn-dark-soft dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40'
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
                <div className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted">حالة ترخيص البرنامج الحالية</div>
                <div className="text-sm font-black text-ink dark:text-ink-dark">
                  {license?.statusLabel || (isAlreadyActive ? 'ترخيص دائم نشط (مدى الحياة)' : 'نسخة تجريبية / بانتظار التفعيل')}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted dark:text-ink-dark-muted mt-1">
                  {license?.shopName && (
                    <span>المحل: <span className="font-bold text-ink dark:text-ink-dark">{license.shopName}</span></span>
                  )}
                  {license?.expiresAt && (
                    <span>ينتهي في: <span className="font-mono font-bold text-ink dark:text-ink-dark">{license.expiresAt.split('T')[0]}</span></span>
                  )}
                  {countdownStr && (
                    <span className="inline-flex items-center gap-1 bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger/30 px-2 py-0.5 rounded-full font-mono text-micro font-bold">
                      <Clock className="w-3 h-3 text-danger dark:text-danger-bright animate-pulse" />
                      متبقي {countdownStr}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <span className={`px-3 py-1.5 rounded-xl text-xs font-black border shrink-0 shadow-2xs ${
              isTransferred
                ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger/30'
                : isTrial
                ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/30 dark:border-brand-bright/30'
                : isAlreadyActive 
                ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-paid-dark-border' 
                : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-border/30'
            }`}>
              {isTransferred ? 'تم النقل' : isTrial ? 'تجربة مجانية' : isAlreadyActive ? 'مفعل ومعتمد' : 'بحاجة لتفعيل'}
            </span>
          </div>

          {/* Trial Notice (Feature #151 / Story 97) */}
          {isTrial && (
            <div className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-3.5 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 dark:border-brand-bright/20 shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-brand dark:text-brand-bright" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-black text-ink dark:text-ink-dark">
                  النسخة التجريبية تعمل بكافة خصائصها بدون أي قيود!
                </div>
                <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-relaxed m-0">
                  تقدر تسجل أصنافك وبضاعتك وتصدر فواتيرك براحتك خالص. ولما تشتري البرنامج وتدخل كود التفعيل، نسختك هتتحول لنسخة دائمة فوراً من غير ما تفقد أي فاتورة أو صنف مسجل.
                </p>
              </div>
            </div>
          )}

          {/* Feedback message */}
          {statusMessage && (
            <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMessage.type === 'success' 
                ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border' 
                : statusMessage.type === 'error'
                ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger/30'
                : 'bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20'
            }`}>
              {statusMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span className="whitespace-pre-line">{statusMessage.text}</span>
            </div>
          )}

          {/* Hardware Fingerprint Box (Feature #96 / Story 95) */}
          <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-2xl border border-line dark:border-line-dark space-y-2.5">
            <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted font-bold">
              <span className="flex items-center gap-1.5 text-ink dark:text-ink-dark">
                <Cpu className="w-4 h-4 text-brand dark:text-brand-bright" />
                بصمة جهاز الكاشير:
              </span>
              <AppButton
                variant={copiedFp ? 'successSoft' : 'secondary'}
                size="xs"
                icon={copiedFp ? Check : Copy}
                onClick={handleCopyFp}
                title="انقر لنسخ بصمة الجهاز"
              >
                {copiedFp ? 'تم النسخ!' : 'نسخ البصمة'}
              </AppButton>
            </div>
            
            <div className="bg-surface dark:bg-surface-dark p-3 rounded-xl border border-line dark:border-line-dark font-mono text-xs font-bold text-ink dark:text-ink-dark select-all break-all dir-ltr text-center tracking-wider leading-relaxed shadow-2xs">
              {license?.deviceFingerprint || 'RAFIQ-DEV-ACTIVE'}
            </div>

            <div className="bg-paid-soft/50 dark:bg-paid-dark-soft/50 border border-paid-border/60 dark:border-paid-dark-border/60 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
                <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center border border-paid-border dark:border-paid-dark-border">
                  <PhoneCall className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                </div>
                <span>لطلب كود التفعيل أو الدعم الفني المباشر:</span>
              </div>
              <a 
                href="tel:01097782965"
                className="font-mono text-sm font-black text-paid dark:text-paid-bright hover:text-paid-hover dark:hover:text-paid-bright tracking-wider px-3 py-1 rounded-lg bg-surface dark:bg-surface-dark border border-paid-border dark:border-paid-dark-border hover:bg-paid hover:text-white transition-all shadow-2xs cursor-pointer dir-ltr flex items-center gap-1.5" 
                title="انقر للاتصال بفريق الدعم"
              >
                <span>01097782965</span>
              </a>
            </div>
          </div>

          {/* The tabs differ in height: the wrapper glides between them (motion on) while header, tab strip and footer stay still */}
          <MotionHeight>
          <div {...tabPanel}>
          {/* Tab 1: Online Cloud Activation */}
          {activeTab === 'online' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-ink dark:text-ink-dark">
                كود الترخيص السحابي: <RequiredMark />
              </label>
              <input
                type="text"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value.toUpperCase())}
                placeholder="RFQ-PERM-XXXX-XXXX"
                className="w-full h-12 bg-surface dark:bg-surface-dark-2 border-2 border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright rounded-2xl px-4 text-sm font-mono tracking-widest font-black text-ink dark:text-ink-dark placeholder:text-ink-muted/40 dark:placeholder:text-ink-dark-muted/40 text-center dir-ltr shadow-2xs focus:outline-none transition-all"
              />
              <div className="flex items-center gap-1.5 text-micro text-ink-muted dark:text-ink-dark-muted">
                <Wifi className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                <span>بيحتاج اتصال بالإنترنت لثانية واحدة فقط لتأكيد التفعيل، وبعدها بيشتغل بدون نت نهائياً.</span>
              </div>
            </div>
          )}

          {/* Tab 2: Offline Support Code Activation (Story 98 - Task 150-1) */}
          {activeTab === 'offline' && (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark">
                    كود الدعم الفني (بدون إنترنت): <RequiredMark />
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportFromFile}
                    accept=".txt"
                    className="hidden"
                  />
                  <AppButton variant="subtle" size="xs" icon={Download} onClick={() => fileInputRef.current?.click()}>
                    استيراد كود من ملف (.txt)
                  </AppButton>
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
                  className="w-full h-12 bg-surface dark:bg-surface-dark-2 border-2 border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright rounded-2xl px-4 text-sm font-mono tracking-widest font-black text-ink dark:text-ink-dark placeholder:text-ink-muted/40 dark:placeholder:text-ink-dark-muted/40 text-center dir-ltr shadow-2xs focus:outline-none transition-all"
                />
              </div>
              <div className="bg-paid-soft/50 dark:bg-paid-dark-soft/50 border border-paid-border dark:border-paid-dark-border p-3 rounded-xl flex items-start gap-2.5 text-xs text-paid dark:text-paid-bright">
                <ShieldCheck className="w-4 h-4 text-paid dark:text-paid-bright shrink-0 mt-0.5" />
                <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-relaxed m-0">
                  <strong className="text-ink dark:text-ink-dark block mb-0.5">تفعيل أوفلاين فوري:</strong>
                  فريق الدعم بيبعتلك الكود ده على الواتساب أو التليفون بعد ما تديهم بصمة جهازك، وبيفعل البرنامج فوراً بدون أي اتصال بالإنترنت.
                </p>
              </div>
            </div>
          )}

          {/* Tab 3: Transfer License (Story 98 - Task 150-1 & 150-2) */}
          {activeTab === 'transfer' && (
            <div className="space-y-3">
              {releaseCodeResult ? (
                <div className="bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border p-5 rounded-2xl space-y-3 text-center shadow-xs">
                  <div className="w-11 h-11 bg-paid text-white rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-paid dark:text-paid-bright">
                      تم إلغاء التفعيل على هذا الجهاز
                    </div>
                    <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                      كود إثبات النقل الخاص بك:
                    </div>
                  </div>
                  <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark font-mono text-base font-black text-paid dark:text-paid-bright tracking-widest select-all dir-ltr shadow-2xs">
                    {releaseCodeResult}
                  </div>
                  <AppButton variant="success" icon={copiedRel ? Check : Copy} onClick={handleCopyRel} className="mx-auto">
                    {copiedRel ? 'تم النسخ!' : 'نسخ كود النقل لإرساله للدعم'}
                  </AppButton>
                  <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">
                    أرسل الكود ده مع بصمة الجهاز الجديد للدعم الفني لتفعيل رفيق على جهازك الجديد فوراً.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-border/30 text-warn dark:text-warn-bright p-3.5 rounded-2xl space-y-2">
                    <div className="font-bold text-xs flex items-center gap-1.5 text-warn dark:text-warn-bright">
                      <ArrowLeftRight className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                      <span>خطوات نقل البرنامج لجهاز كاشير جديد:</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-ink-muted dark:text-ink-dark-muted pr-1">
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-warn/15 dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-mono font-bold text-micro flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <span>إلغاء التفعيل على الجهاز القديم ده واستخراج كود إثبات النقل.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-warn/15 dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-mono font-bold text-micro flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <span>تسطيب رفيق على الجهاز الجديد وأخذ بصمة الجهاز الجديد.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-warn/15 dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-mono font-bold text-micro flex items-center justify-center shrink-0 mt-0.5">3</span>
                        <span>إرسال كود النقل وبصمة الجهاز الجديد للدعم الفني لاستلام كود التفعيل للجهاز الجديد.</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark">
                      سبب النقل:
                    </label>
                    <input
                      type="text"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="مثال: قمت بتغيير جهاز الكاشير أو ترقية الهارد"
                      className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3.5 py-2.5 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
          </MotionHeight>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between gap-3 shrink-0">
          <AppButton variant="secondary" icon={RefreshCw} loading={isLoading} onClick={handleVerify} title="التحقق من حالة وسريان الترخيص">
            فحص صلاحية الترخيص
          </AppButton>

          <div className="flex items-center gap-2">
            <AppButton variant="secondary" onClick={onClose}>
              إغلاق
            </AppButton>

            {activeTab === 'online' && (
              <AppButton variant="primary" icon={ShieldCheck} loading={isLoading} disabled={!inputKey.trim()} onClick={handleActivateOnline}>
                {isLoading ? 'بيتم الاتصال...' : 'تفعيل أونلاين'}
              </AppButton>
            )}

            {activeTab === 'offline' && (
              <AppButton variant="primary" icon={ShieldCheck} loading={isLoading} disabled={!supportCode.trim()} onClick={handleActivateSupportCode}>
                {isLoading ? 'بيتم التحقق...' : 'تفعيل بكود الدعم'}
              </AppButton>
            )}

            {activeTab === 'transfer' && !releaseCodeResult && (
              <AppButton variant="danger" icon={ArrowLeftRight} loading={isLoading} disabled={isTransferred} onClick={handleTransferDeactivate}>
                {isLoading ? 'بيتم تجهيز النقل...' : 'إلغاء التفعيل والنقل'}
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
