import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  KeyRound, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Copy, 
  Check, 
  Loader2, 
  Lock, 
  Sliders, 
  ShieldAlert,
  Power
} from 'lucide-react';
import { invoke } from '../bridge/ipc';

export interface PinSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChanged?: () => void;
}

export const PinSettingsModal: React.FC<PinSettingsModalProps> = ({
  isOpen,
  onClose,
  onStatusChanged,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Status state
  const [isPinSet, setIsPinSet] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [protectedActions, setProtectedActions] = useState<Record<string, boolean>>({
    settings: true,
    reports: true,
    product_edit: true,
    stock_adjust: true,
    db_recovery: true,
    discounts: false,
  });

  // Form states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load status
  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await invoke('security:getStatus');
      if (res) {
        setIsPinSet(Boolean(res.isPinSet));
        setIsEnabled(Boolean(res.isEnabled));
        if (res.protectedActions) {
          setProtectedActions(res.protectedActions);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccessMsg(null);
    setCurrentPin('');
    setNewPin('');
    setNewPinConfirm('');
    setGeneratedRecoveryCode(null);
    setCopied(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await invoke('security:getStatus');
        if (active && res) {
          setIsPinSet(Boolean(res.isPinSet));
          setIsEnabled(Boolean(res.isEnabled));
          if (res.protectedActions) {
            setProtectedActions(res.protectedActions);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (active) setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
      setError('يجب أن يتكون الرقم السري من 4 إلى 8 أرقام فقط.');
      return;
    }

    if (newPin !== newPinConfirm) {
      setError('الرقم السري وتأكيده غير متطابقين.');
      return;
    }

    if (isPinSet && !currentPin) {
      setError('الرجاء إدخال الرقم السري الحالي لتأكيد التغيير.');
      return;
    }

    setLoading(true);
    try {
      const res = await invoke('security:setPin', {
        newPin,
        currentPin: isPinSet ? currentPin : undefined,
      });

      if (res && res.success) {
        setGeneratedRecoveryCode(res.recoveryCode);
        setCurrentPin('');
        setNewPin('');
        setNewPinConfirm('');
        await loadStatus();
        if (onStatusChanged) onStatusChanged();
      } else {
        setError(res?.message || 'فشل حفظ الرقم السري');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnable = async () => {
    if (!isPinSet) return;
    const pinInput = prompt('أدخل الرقم السري الحالي لتأكيد تغيير حالة التفعيل:');
    if (!pinInput) return;

    setLoading(true);
    setError(null);
    try {
      if (isEnabled) {
        await invoke('security:disablePin', { currentPin: pinInput });
        setSuccessMsg('تم إيقاف تفعيل قفل الشاشات بالرقم السري.');
      } else {
        await invoke('security:enablePin', { currentPin: pinInput });
        setSuccessMsg('تم تفعيل قفل الشاشات بالرقم السري.');
      }
      await loadStatus();
      if (onStatusChanged) onStatusChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAction = async (key: string, checked: boolean) => {
    const updated = { ...protectedActions, [key]: checked };
    setProtectedActions(updated);

    try {
      await invoke('security:saveProtectedActions', {
        actions: updated,
        currentPin: '',
      });
    } catch (err: unknown) {
      console.warn('Auto-save protected action failed:', err);
    }
  };

  const copyRecoveryCode = () => {
    if (!generatedRecoveryCode) return;
    navigator.clipboard.writeText(generatedRecoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-[#00372d] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/30 flex items-center justify-center border border-emerald-500/30">
              <KeyRound className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-bold text-base">إعدادات أمان الرقم السري</h3>
              <p className="text-xs text-emerald-100/70">
                حماية العمليات والشاشات الحساسة لمنع التلاعب غير المصرح به
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Recovery Code Display Card (Task 52-4) */}
          {generatedRecoveryCode && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <span>رمز استرجاع الطوارئ (يظهر مرة واحدة فقط)</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                احفظ هذا الرمز في مكان سري وآمن أو التقط له صورة! في حال نسيت الرقم السري، سيمكّنك هذا الرمز من فتح النظام وإعادة ضبط الرقم دون فقدان أي بيانات.
              </p>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-300 dark:border-amber-800 flex items-center justify-between">
                <span className="font-mono text-base font-extrabold text-amber-900 dark:text-amber-200 tracking-wider">
                  {generatedRecoveryCode}
                </span>
                <button
                  type="button"
                  onClick={copyRecoveryCode}
                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-amber-900 dark:text-amber-200 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Status & Master Switch */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isPinSet ? (isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500') : 'bg-slate-400'}`} />
              <div>
                <span className="font-bold text-sm block">حالة قفل النظام:</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {!isPinSet ? 'لم يتم تعيين رقم سري بعد' : (isEnabled ? 'مفعل ويعمل على العمليات المحددة' : 'معطل مؤقتاً')}
                </span>
              </div>
            </div>
            {isPinSet && (
              <button
                type="button"
                onClick={() => void handleToggleEnable()}
                disabled={loading}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors ${
                  isEnabled 
                    ? 'bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' 
                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isEnabled ? 'إيقاف مؤقت' : 'تفعيل'}</span>
              </button>
            )}
          </div>

          {/* Protected Actions List (Task 52-3) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold text-xs">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>العمليات والشاشات المحمية بالرقم السري:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                { id: 'settings', label: 'شاشة الإعدادات العامة وقاعدة البيانات' },
                { id: 'reports', label: 'شاشة التقارير وحسابات الأرباح' },
                { id: 'product_edit', label: 'تعديل أسعار المنتجات وحذفها' },
                { id: 'stock_adjust', label: 'التسوية اليدوية لكميات المخزون' },
                { id: 'db_recovery', label: 'استعادة وتصفير قاعدة البيانات' },
                { id: 'discounts', label: 'تطبيق الخصم اليدوي في شاشة البيع' },
              ].map((act) => (
                <label 
                  key={act.id} 
                  className="flex items-center gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(protectedActions[act.id])}
                    onChange={(e) => void handleToggleAction(act.id, e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-tight">
                    {act.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Form to Set or Change PIN */}
          <form onSubmit={handleSavePin} className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h4 className="font-bold text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isPinSet ? 'تغيير الرقم السري الحالي' : 'إنشاء رقم سري جديد'}</span>
            </h4>

            {isPinSet && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  الرقم السري الحالي
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tracking-widest focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  الرقم السري الجديد (4-8 أرقام)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tracking-widest focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  تأكيد الرقم السري
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tracking-widest focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !newPin.trim() || (isPinSet && !currentPin.trim())}
              className="w-full py-2.5 bg-[#00372d] hover:bg-[#004e40] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-md shadow-emerald-950/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{isPinSet ? 'تحديث الرقم السري وتوليد رمز استرجاع' : 'حفظ الرقم وتوليد رمز استرجاع'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
