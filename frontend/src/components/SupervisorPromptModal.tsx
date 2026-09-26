import React, { useState } from 'react';
import { invoke } from '../bridge/ipc';

interface SupervisorPromptModalProps {
  isOpen: boolean;
  actionTitle: string;
  actionDescription?: string;
  onApproved: (supervisorName?: string) => void;
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

  if (!isOpen) return null;

  const handleNumberClick = (digit: string) => {
    if (loading || pin.length >= 8) return;
    setPin((prev) => prev + digit);
    setError('');
  };

  const handleBackspace = () => {
    if (loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    if (loading) return;
    setPin('');
    setError('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await invoke('auth:verifySupervisor', {
        pin,
        action: actionTitle,
      });

      if (res && res.success) {
        setPin('');
        onApproved(res.supervisorName || 'مدير النظام');
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handleNumberClick(e.key);
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      dir="rtl"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="bg-[#0b141d] border border-amber-600/40 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-amber-950/80 px-6 py-4 flex items-center justify-between border-b border-amber-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">موافقة مدير النظام مطلوبة</h2>
              <p className="text-xs text-amber-300/80">{actionTitle}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 bg-[#0e1a26] space-y-4">
          {actionDescription && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-300">
              {actionDescription}
            </div>
          )}

          {/* Dots Display */}
          <div className="bg-[#070d14] border border-slate-700 rounded-xl p-3 flex items-center justify-center h-12">
            <div className="flex items-center gap-3">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    idx < pin.length
                      ? 'bg-amber-400 scale-125 shadow-sm shadow-amber-400/50'
                      : 'bg-slate-700'
                  }`}
                />
              ))}
              {pin.length > 4 && (
                <span className="text-xs text-amber-400 font-mono font-bold mr-1">
                  +{pin.length - 4}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-rose-950/60 border border-rose-800 text-rose-300 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
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
                className="h-11 bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-lg rounded-xl border border-slate-700 active:scale-95 transition-all shadow-sm"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={handleClear}
              className="h-11 bg-slate-800/60 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl border border-slate-700 active:scale-95 transition-all"
            >
              مسح
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleNumberClick('0')}
              className="h-11 bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-lg rounded-xl border border-slate-700 active:scale-95 transition-all shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={handleBackspace}
              className="h-11 bg-slate-800/60 hover:bg-slate-700 text-rose-300 font-bold text-xs rounded-xl border border-slate-700 active:scale-95 transition-all flex items-center justify-center"
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
              className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl transition-all shadow-md disabled:opacity-40"
            >
              {loading ? 'جاري التحقق...' : 'تأكيد الموافقة (Enter)'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
