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
  const [isConfirmToggleOpen, setIsConfirmToggleOpen] = useState(false);
  const [togglePinInput, setTogglePinInput] = useState('');

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

  const handleToggleEnable = () => {
    if (!isPinSet) return;
    setTogglePinInput('');
    setIsConfirmToggleOpen(true);
  };

  const submitToggleEnable = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!togglePinInput.trim()) return;

    setLoading(true);
    setError(null);
    try {
      if (isEnabled) {
        await invoke('security:disablePin', { currentPin: togglePinInput.trim() });
        setSuccessMsg('تم إيقاف تفعيل قفل الشاشات بالرقم السري.');
      } else {
        await invoke('security:enablePin', { currentPin: togglePinInput.trim() });
        setSuccessMsg('تم تفعيل قفل الشاشات بالرقم السري.');
      }
      setIsConfirmToggleOpen(false);
      setTogglePinInput('');
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
      setSuccessMsg('تم حفظ وتحديث إعدادات الحماية بنجاح.');
      setTimeout(() => setSuccessMsg(null), 2500);
      if (onStatusChanged) onStatusChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل حفظ الإعداد: ${msg}`);
      setProtectedActions(protectedActions);
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
        className="w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-line overflow-hidden flex flex-col max-h-[90vh] text-ink"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-brand text-white px-6 py-4 flex items-center justify-between border-b border-brand-dark">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">الرقم السري وأمان النظام</h3>
              <p className="text-xs text-white/80">
                حماية الشاشات والعمليات الحساسة في المحل لمنع أي تلاعب غير مصرح به
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm bg-canvas">
          {error && (
            <div className="p-3 bg-danger-soft border border-danger-border rounded-xl text-xs text-danger flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-paid-soft border border-paid-border rounded-xl text-xs text-paid flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Recovery Code Display Card (Task 52-4) */}
          {generatedRecoveryCode && (
            <div className="p-4 bg-warn-soft border border-warn-border rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-warn font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-warn" />
                <span>كود استرجاع الطوارئ (بيظهر مرة واحدة بس!)</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                احفظ الكود ده في مكان أمين أو صوره بالموبايل! لو نسيت الرقم السري في أي وقت، هتقدر تفتح بيه النظام وترجع تضبط الرقم من غير ما تخسر أي بيانات أو فواتير.
              </p>
              <div className="p-3 bg-surface rounded-xl border border-warn-border flex items-center justify-between">
                <span className="font-mono text-base font-extrabold text-warn tracking-wider">
                  {generatedRecoveryCode}
                </span>
                <button
                  type="button"
                  onClick={copyRecoveryCode}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-2 text-xs font-bold text-ink rounded-lg border border-line flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-paid" /> : <Copy className="w-3.5 h-3.5 text-ink-muted" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Status & Master Switch */}
          <div className="p-4 bg-surface rounded-xl border border-line flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isPinSet ? (isEnabled ? 'bg-paid animate-pulse' : 'bg-warn') : 'bg-line'}`} />
              <div>
                <span className="font-bold text-sm block text-ink">حالة قفل النظام:</span>
                <span className="text-xs text-ink-muted">
                  {!isPinSet ? 'لسه مفيش رقم سري متعين' : (isEnabled ? 'شغال وبيحمي العمليات المحددة' : 'موقوف مؤقتاً')}
                </span>
              </div>
            </div>
            {isPinSet && (
              <button
                type="button"
                onClick={() => void handleToggleEnable()}
                disabled={loading}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors border ${
                  isEnabled 
                    ? 'bg-danger-soft hover:bg-danger-soft/80 text-danger border-danger-border' 
                    : 'bg-paid-soft hover:bg-paid-soft/80 text-paid border-paid-border'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isEnabled ? 'إيقاف مؤقت' : 'تفعيل'}</span>
              </button>
            )}
          </div>

          {/* Protected Actions List (Task 52-3) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-ink font-bold text-xs">
              <Sliders className="w-4 h-4 text-brand" />
              <span>العمليات والشاشات المحمية بالرقم السري:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                { id: 'settings', label: 'شاشة الإعدادات العامة وقاعدة البيانات' },
                { id: 'reports', label: 'شاشة التقارير وحسابات الأرباح والخزينة' },
                { id: 'product_edit', label: 'تعديل أسعار البضاعة وحذف الأصناف' },
                { id: 'stock_adjust', label: 'تسوية وجرد كميات بضاعة المخزن' },
                { id: 'db_recovery', label: 'استعادة وتصفير قاعدة البيانات' },
                { id: 'discounts', label: 'تطبيق خصم يدوي على فاتورة البيع' },
              ].map((act) => (
                <label 
                  key={act.id} 
                  className="flex items-center gap-2.5 p-2.5 bg-surface rounded-xl border border-line cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(protectedActions[act.id])}
                    onChange={(e) => void handleToggleAction(act.id, e.target.checked)}
                    className="w-4 h-4 rounded text-brand focus:ring-brand cursor-pointer"
                  />
                  <span className="text-xs font-medium text-ink leading-tight">
                    {act.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Form to Set or Change PIN */}
          <form onSubmit={handleSavePin} className="space-y-3 pt-2 border-t border-line">
            <h4 className="font-bold text-xs text-ink flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-brand" />
              <span>{isPinSet ? 'تغيير الرقم السري' : 'عمل رقم سري جديد'}</span>
            </h4>

            {isPinSet && (
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  الرقم السري الحالي
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-surface text-ink font-mono tracking-widest focus:outline-none focus:border-brand"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  الرقم السري الجديد (4-8 أرقام)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-surface text-ink font-mono tracking-widest focus:outline-none focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  تأكيد الرقم السري
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-surface text-ink font-mono tracking-widest focus:outline-none focus:border-brand"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !newPin.trim() || (isPinSet && !currentPin.trim())}
              className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{isPinSet ? 'تحديث الرقم السري وتوليد كود استرجاع' : 'حفظ الرقم السري وتوليد كود استرجاع'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Confirmation Modal for Toggle */}
      {isConfirmToggleOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-line overflow-hidden flex flex-col">
            <div className="bg-brand text-white px-5 py-3.5 flex items-center justify-between border-b border-brand-dark">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-white" />
                <h4 className="font-bold text-sm">تأكيد العملية الحساسة</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmToggleOpen(false)}
                className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitToggleEnable} className="p-5 space-y-4 bg-canvas">
              <p className="text-xs text-ink-muted font-medium leading-relaxed">
                اكتب الرقم السري الحالي لتأكيد {isEnabled ? 'إيقاف' : 'تشغيل'} نظام حماية الشاشات:
              </p>
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  autoFocus
                  value={togglePinInput}
                  onChange={(e) => setTogglePinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full text-center px-4 py-3 text-lg rounded-xl border border-line bg-surface text-ink font-mono tracking-widest focus:outline-none focus:border-brand"
                  required
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmToggleOpen(false)}
                  className="flex-1 py-2 text-xs font-bold rounded-xl border border-line hover:bg-surface-2 transition-colors text-ink"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading || !togglePinInput.trim()}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>تأكيد</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
