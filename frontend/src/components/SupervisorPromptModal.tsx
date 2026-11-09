import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '../bridge/ipc';

interface SupervisorPromptModalProps {
  isOpen: boolean;
  actionTitle: string;
  actionDescription?: string;
  onApproved: (supervisorName?: string, verifiedPin?: string) => void;
  onCancel: () => void;
}

export const SupervisorPromptModal: React.FC<SupervisorPromptModalProps> = ({
  isOpen,
  actionTitle,
  actionDescription,
  onApproved,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNumberClick = useCallback((digit: string) => {
    if (loading || pin.length >= 8) return;
    setPin((prev) => prev + digit);
    setError('');
    inputRef.current?.focus();
  }, [loading, pin.length]);

  const handleBackspace = useCallback(() => {
    if (loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, [loading]);

  const handleClear = useCallback(() => {
    if (loading) return;
    setPin('');
    setError('');
  }, [loading]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await invoke<{ success: boolean; supervisorName?: string; message?: string }>('auth:verifySupervisor', {
        pin,
        action: actionTitle,
      });

      if (res && res.success) {
        const approvedPin = pin;
        setPin('');
        onApproved(res.supervisorName || 'مدير النظام', approvedPin);
      } else {
        setError(res?.message || 'الرقم السري للمدير غير صحيح');
        setPin('');
      }
    } catch (err: any) {
      setError(err?.message || 'الرقم السري لمدير النظام غير صحيح');
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [pin, loading, actionTitle, onApproved]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const typingInField = e.target === inputRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (typingInField) {
        // The visible input handles digits, Backspace and Enter itself
        return;
      } else if (e.key >= '0' && e.key <= '9') {
        handleNumberClick(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, handleNumberClick, handleBackspace, handleSubmit, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      tabIndex={0}
    >
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col transform-gpu will-change-[transform,opacity] animate-in zoom-in-95 duration-150">
        {/* Sleek Top Accent Line */}
        <div className="h-1.5 w-full bg-brand dark:bg-brand-bright" />

        {/* Modern Clean Header */}
        <div className="bg-surface dark:bg-surface-dark-2 px-6 py-4 flex items-center justify-between border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright flex items-center justify-center shrink-0 shadow-2xs">
              <svg className="w-5 h-5 text-paid dark:text-paid-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="t-modal-title text-ink dark:text-ink-dark">موافقة مدير النظام مطلوبة</h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">{actionTitle}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 bg-canvas dark:bg-canvas-dark space-y-4">
          {actionDescription && (
            <div className="bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-3 text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">
              {actionDescription}
            </div>
          )}

          {/* Masked PIN input (visible, with caret) */}
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoFocus
            autoComplete="off"
            aria-label="الرقم السري (PIN)"
            value={pin}
            readOnly={loading}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            className="w-full h-12 bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3 text-center text-xl font-mono text-ink dark:text-ink-dark shadow-2xs caret-brand dark:caret-brand-bright focus:outline-none focus:border-brand dark:focus:border-brand-bright"
          />

          {error && (
            <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger/30 text-danger dark:text-danger-bright text-xs px-3 py-2 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Tactile Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={loading}
                onClick={() => handleNumberClick(digit)}
                className="h-11 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark font-bold text-lg rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all shadow-2xs"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={handleClear}
              className="h-11 bg-surface dark:bg-surface-dark-2 hover:bg-warn-soft dark:hover:bg-warn-dark-soft text-warn dark:text-warn-bright font-bold text-xs rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all"
            >
              مسح
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleNumberClick('0')}
              className="h-11 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark font-bold text-lg rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all shadow-2xs"
            >
              0
            </button>
            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={handleBackspace}
              className="h-11 bg-surface dark:bg-surface-dark-2 hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-danger dark:text-danger-bright font-bold text-xs rounded-xl border border-line dark:border-line-dark active:scale-95 transition-all flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
              </svg>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              disabled={loading || !pin}
              onClick={() => handleSubmit()}
              className="flex-1 py-3 bg-brand dark:bg-brand-container hover:bg-brand-hover dark:hover:bg-brand text-white font-bold text-sm rounded-xl transition-all shadow-xs disabled:opacity-40"
            >
              {loading ? 'جاري التحقق...' : 'تأكيد الموافقة (Enter)'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark font-bold text-sm rounded-xl transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
