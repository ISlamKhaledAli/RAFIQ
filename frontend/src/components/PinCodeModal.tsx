import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  X, 
  AlertTriangle, 
  Delete, 
  Loader2, 
  LifeBuoy, 
  CheckCircle2, 
  Copy, 
  Check 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';

export interface PinCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionName?: string;
  actionLabel?: string;
}

export const PinCodeModal: React.FC<PinCodeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionName = 'general',
  actionLabel = 'هذه العملية الحساسة',
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Recovery Mode State (Task 52-4)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [newRecoveryCodeGenerated, setNewRecoveryCodeGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setPin('');
    setError(null);
    setIsRecoveryMode(false);
    setRecoveryCode('');
    setNewPin('');
    setNewPinConfirm('');
    setNewRecoveryCodeGenerated(null);
    setCopied(false);
    onClose();
  };

  // Check PIN status and lockout when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    (async () => {
      try {
        const status = await invoke('security:getStatus');
        if (active && status) {
          if (status.isLocked && status.remainingLockoutSeconds > 0) {
            setIsLocked(true);
            setLockoutRemaining(status.remainingLockoutSeconds);
          } else {
            setIsLocked(false);
            setLockoutRemaining(0);
          }
        }
      } catch (err) {
        console.error('Failed to get security status:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;

    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  // Focus input automatically
  useEffect(() => {
    if (isOpen && !isLocked && !newRecoveryCodeGenerated) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isLocked, isRecoveryMode, newRecoveryCodeGenerated]);

  const handleKeypadPress = (val: string) => {
    if (isLocked || loading) return;
    setError(null);
    if (pin.length < 8) {
      setPin((prev) => prev + val);
    }
  };

  const handleBackspace = () => {
    if (isLocked || loading) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isLocked || loading) return;
    setError(null);
    setPin('');
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLocked || loading) return;

    if (!pin || pin.length < 4) {
      setError('الرجاء إدخال الرقم السري (4 أرقام على الأقل)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await invoke('security:verifyPin', {
        pin,
        action: actionName,
      });

      if (res && res.success) {
        setPin('');
        onSuccess();
      } else {
        setError(res?.message || 'الرقم السري غير صحيح');
        if (res?.isLocked && res?.remainingLockoutSeconds > 0) {
          setIsLocked(true);
          setLockoutRemaining(res.remainingLockoutSeconds);
        }
        setPin('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleResetWithRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const cleanCode = recoveryCode.trim().toUpperCase();
    if (!cleanCode) {
      setError('الرجاء إدخال رمز استرجاع الطوارئ.');
      return;
    }

    if (newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
      setError('يجب أن يتكون الرقم السري الجديد من 4 إلى 8 أرقام.');
      return;
    }

    if (newPin !== newPinConfirm) {
      setError('الرقم السري وتأكيده غير متطابقين.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await invoke('security:resetWithRecovery', {
        recoveryCode: cleanCode,
        newPin,
      });

      if (res && res.success) {
        setNewRecoveryCodeGenerated(res.recoveryCode);
      } else {
        setError(res?.message || 'فشل الاسترجاع');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyRecoveryCode = () => {
    if (!newRecoveryCodeGenerated) return;
    navigator.clipboard.writeText(newRecoveryCodeGenerated);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-line overflow-hidden flex flex-col text-ink"
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            handleClose();
          }
        }}
      >
        {/* Header */}
        <div className="bg-brand text-white px-5 py-4 flex items-center justify-between border-b border-brand-dark">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isRecoveryMode ? 'استرجاع الرقم السري للطوارئ' : 'الرقم السري للمشرف'}
              </h3>
              <p className="text-xs text-white/80">
                {isRecoveryMode ? 'إعادة تعيين باستخدام رمز الطوارئ' : `مطلوب تصريح لتنفيذ: ${actionLabel}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="إلغاء (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 flex flex-col bg-canvas">
          {/* Recovery Code Success Banner */}
          {newRecoveryCodeGenerated ? (
            <div className="space-y-4 py-2 text-center">
              <div className="w-12 h-12 rounded-full bg-paid-soft text-paid mx-auto flex items-center justify-center border border-paid-border">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-lg text-ink">تم تعيين الرقم السري بنجاح!</h4>
                <p className="text-xs text-ink-muted mt-1">
                  احفظ رمز الاسترجاع الجديد الموضح أدناه في مكان آمن. لن يظهر لك هذا الرمز مرة أخرى.
                </p>
              </div>

              <div className="p-3 bg-surface rounded-xl border border-dashed border-line flex items-center justify-between">
                <span className="font-mono text-base font-bold text-paid tracking-wider">
                  {newRecoveryCodeGenerated}
                </span>
                <button
                  type="button"
                  onClick={copyRecoveryCode}
                  className="px-2.5 py-1.5 bg-surface hover:bg-surface-2 text-xs font-semibold rounded-lg border border-line text-ink flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-paid" /> : <Copy className="w-3.5 h-3.5 text-ink-muted" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSuccess();
                }}
                className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-xl text-sm transition-colors mt-2 shadow-xs"
              >
                متابعة العملية
              </button>
            </div>
          ) : isRecoveryMode ? (
            /* Recovery Code Form */
            <form onSubmit={handleResetWithRecovery} className="space-y-3">
              {error && (
                <div className="p-2.5 bg-danger-soft border border-danger-border rounded-xl text-xs text-danger flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  رمز استرجاع الطوارئ (مثال: RFK-XXXX-XXXX)
                </label>
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  placeholder="RFK-...."
                  className="w-full px-3 py-2 text-center font-mono font-bold tracking-widest text-sm rounded-xl border border-line bg-surface text-ink focus:outline-none focus:border-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  الرقم السري الجديد (4-8 أرقام)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-center font-mono font-bold tracking-widest text-sm rounded-xl border border-line bg-surface text-ink focus:outline-none focus:border-brand"
                  placeholder="••••"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  تأكيد الرقم السري الجديد
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-center font-mono font-bold tracking-widest text-sm rounded-xl border border-line bg-surface text-ink focus:outline-none focus:border-brand"
                  placeholder="••••"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !recoveryCode.trim() || !newPin.trim()}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>إعادة تعيين الرقم</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(false);
                    setError(null);
                  }}
                  className="px-3 py-2.5 bg-surface hover:bg-surface-2 border border-line font-bold rounded-xl text-xs text-ink transition-colors"
                >
                  رجوع
                </button>
              </div>
            </form>
          ) : (
            /* Regular PIN Entry */
            <div className="space-y-4">
              {/* Lockout Warning */}
              {isLocked ? (
                <div className="p-3 bg-danger-soft border border-danger-border rounded-xl text-xs text-danger text-center space-y-1">
                  <div className="font-bold flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-danger" />
                    <span>النظام مقفل مؤقتاً لكثرة المحاولات</span>
                  </div>
                  <p>يرجى الانتظار <span className="font-mono font-bold text-sm text-danger">{lockoutRemaining}</span> ثانية قبل المحاولة مجدداً.</p>
                </div>
              ) : error ? (
                <div className="p-2.5 bg-danger-soft border border-danger-border rounded-xl text-xs text-danger flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {/* Masked PIN Display & Hidden Keyboard Input */}
              <div className="relative flex justify-center items-center gap-2.5 py-2">
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  disabled={isLocked || loading}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setPin(clean);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleVerify();
                    }
                  }}
                  className="sr-only"
                  aria-label="الرقم السري"
                  autoFocus
                />

                {/* Bullets Display */}
                <div 
                  onClick={() => inputRef.current?.focus()}
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-surface rounded-2xl border border-line cursor-text shadow-2xs min-w-[200px] justify-center"
                >
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                        idx < pin.length
                          ? 'bg-paid scale-110 shadow-xs shadow-paid/50'
                          : 'border-2 border-line bg-transparent'
                      }`}
                    />
                  ))}
                  {pin.length > 4 && (
                    <span className="text-xs font-mono font-bold text-paid mr-1">
                      +{pin.length - 4}
                    </span>
                  )}
                </div>
              </div>

              {/* On-Screen Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={isLocked || loading}
                    onClick={() => handleKeypadPress(num.toString())}
                    className="h-11 rounded-xl bg-surface hover:bg-surface-2 border border-line text-lg font-bold font-mono text-ink transition-colors active:scale-95 disabled:opacity-40 shadow-2xs"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isLocked || loading || pin.length === 0}
                  onClick={handleClear}
                  className="h-11 rounded-xl bg-surface hover:bg-warn-soft border border-line text-xs font-bold text-warn transition-colors active:scale-95 disabled:opacity-40 shadow-2xs"
                >
                  مسح
                </button>
                <button
                  type="button"
                  disabled={isLocked || loading}
                  onClick={() => handleKeypadPress('0')}
                  className="h-11 rounded-xl bg-surface hover:bg-surface-2 border border-line text-lg font-bold font-mono text-ink transition-colors active:scale-95 disabled:opacity-40 shadow-2xs"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isLocked || loading || pin.length === 0}
                  onClick={handleBackspace}
                  className="h-11 rounded-xl bg-surface hover:bg-danger-soft border border-line flex items-center justify-center text-danger transition-colors active:scale-95 disabled:opacity-40 shadow-2xs"
                  title="حذف"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={isLocked || loading || pin.length < 4}
                  onClick={() => void handleVerify()}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  <span>تأكيد الرقم (Enter)</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-2.5 bg-surface hover:bg-surface-2 border border-line font-bold rounded-xl text-xs text-ink transition-colors shadow-2xs"
                >
                  إلغاء
                </button>
              </div>

              {/* Forgot PIN / Emergency Recovery Link */}
              <div className="text-center pt-1 border-t border-line">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(true);
                    setError(null);
                  }}
                  className="text-[11px] font-semibold text-ink-muted hover:text-brand transition-colors flex items-center justify-center gap-1 mx-auto"
                >
                  <LifeBuoy className="w-3.5 h-3.5 text-brand" />
                  <span>نسيت الرقم السري؟ استخدام رمز استرجاع الطوارئ</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
