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
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col text-slate-800 dark:text-slate-100"
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            handleClose();
          }
        }}
      >
        {/* Header */}
        <div className="bg-[#00372d] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/30 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isRecoveryMode ? 'استرجاع الرقم السري للطوارئ' : 'الرقم السري للمشرف'}
              </h3>
              <p className="text-xs text-emerald-100/70">
                {isRecoveryMode ? 'إعادة تعيين باستخدام رمز الطوارئ' : `مطلوب تصريح لتنفيذ: ${actionLabel}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
            title="إلغاء (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 flex flex-col">
          {/* Recovery Code Success Banner */}
          {newRecoveryCodeGenerated ? (
            <div className="space-y-4 py-2 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white">تم تعيين الرقم السري بنجاح!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  احفظ رمز الاسترجاع الجديد الموضح أدناه في مكان آمن. لن يظهر لك هذا الرمز مرة أخرى.
                </p>
              </div>

              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between">
                <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 tracking-wider">
                  {newRecoveryCodeGenerated}
                </span>
                <button
                  type="button"
                  onClick={copyRecoveryCode}
                  className="px-2.5 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSuccess();
                }}
                className="w-full py-2.5 bg-[#00372d] hover:bg-[#004e40] text-white font-bold rounded-xl text-sm transition-colors mt-2"
              >
                متابعة العملية
              </button>
            </div>
          ) : isRecoveryMode ? (
            /* Recovery Code Form */
            <form onSubmit={handleResetWithRecovery} className="space-y-3">
              {error && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رمز استرجاع الطوارئ (مثال: RFK-XXXX-XXXX)
                </label>
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  placeholder="RFK-...."
                  className="w-full px-3 py-2 text-center font-mono font-bold tracking-widest text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الرقم السري الجديد (4-8 أرقام)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-center font-mono font-bold tracking-widest text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  تأكيد الرقم السري الجديد
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-center font-mono font-bold tracking-widest text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !recoveryCode.trim() || !newPin.trim()}
                  className="flex-1 py-2.5 bg-[#00372d] hover:bg-[#004e40] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
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
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold rounded-xl text-xs transition-colors"
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
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 text-center space-y-1">
                  <div className="font-bold flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>النظام مقفل مؤقتاً لكثرة المحاولات</span>
                  </div>
                  <p>يرجى الانتظار <span className="font-mono font-bold text-sm text-rose-800 dark:text-rose-200">{lockoutRemaining}</span> ثانية قبل المحاولة مجدداً.</p>
                </div>
              ) : error ? (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
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
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 cursor-text shadow-inner min-w-[200px] justify-center"
                >
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                        idx < pin.length
                          ? 'bg-emerald-600 dark:bg-emerald-400 scale-110 shadow-sm'
                          : 'border-2 border-slate-300 dark:border-slate-600 bg-transparent'
                      }`}
                    />
                  ))}
                  {pin.length > 4 && (
                    <span className="text-xs font-mono font-bold text-emerald-600 mr-1">
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
                    className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-lg font-bold font-mono text-slate-800 dark:text-slate-100 transition-colors active:scale-95 disabled:opacity-40"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isLocked || loading || pin.length === 0}
                  onClick={handleClear}
                  className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors active:scale-95 disabled:opacity-40"
                >
                  مسح
                </button>
                <button
                  type="button"
                  disabled={isLocked || loading}
                  onClick={() => handleKeypadPress('0')}
                  className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-lg font-bold font-mono text-slate-800 dark:text-slate-100 transition-colors active:scale-95 disabled:opacity-40"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isLocked || loading || pin.length === 0}
                  onClick={handleBackspace}
                  className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400 transition-colors active:scale-95 disabled:opacity-40"
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
                  className="flex-1 py-2.5 bg-[#00372d] hover:bg-[#004e40] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-md shadow-emerald-950/20"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  <span>تأكيد الرقم (Enter)</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  إلغاء
                </button>
              </div>

              {/* Forgot PIN / Emergency Recovery Link */}
              <div className="text-center pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(true);
                    setError(null);
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-1 mx-auto"
                >
                  <LifeBuoy className="w-3.5 h-3.5" />
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
