import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X } from 'lucide-react';
import { setDialogHandler, type DialogState } from '../utils/dialogService';

export const RafiqDialogContainer: React.FC = () => {
  const [state, setState] = useState<DialogState>({
    isOpen: false,
    isConfirm: false,
    title: '',
    message: '',
    confirmText: '',
    cancelText: '',
    variant: 'info',
  });

  useEffect(() => {
    setDialogHandler((newState: DialogState) => {
      setState(newState);
    });
    return () => {
      setDialogHandler(null);
    };
  }, []);

  const handleConfirm = useCallback(() => {
    setState((prev) => {
      if (prev.resolve) prev.resolve(true);
      return { ...prev, isOpen: false };
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => {
      if (prev.resolve) prev.resolve(false);
      return { ...prev, isOpen: false };
    });
  }, []);

  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isOpen, handleConfirm, handleCancel]);

  if (!state.isOpen) return null;

  const getVariantStyles = () => {
    switch (state.variant) {
      case 'danger':
      case 'error':
        return {
          icon: <AlertCircle className="w-6 h-6 text-rose-500 shrink-0" />,
          iconBg: 'bg-rose-100 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900',
          confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/20',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />,
          iconBg: 'bg-amber-100 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-900/20',
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />,
          iconBg: 'bg-emerald-100 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900',
          confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-950/20',
        };
      case 'info':
      default:
        return {
          icon: <Info className="w-6 h-6 text-teal-600 shrink-0" />,
          iconBg: 'bg-teal-100 dark:bg-teal-950/50 border-teal-200 dark:border-teal-900',
          confirmBtn: 'bg-[#00372d] hover:bg-[#004e40] text-white shadow-emerald-950/20',
        };
    }
  };

  const vStyles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in select-none">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transform transition-all animate-scale-up"
        role="alertdialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-[#00372d] text-white px-5 py-3.5 flex items-center justify-between border-b border-emerald-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/30 flex items-center justify-center border border-emerald-400/30">
              <span className="font-black text-xs text-emerald-300">رفيق</span>
            </div>
            <h3 className="font-bold text-sm tracking-wide">{state.title}</h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex items-start gap-4">
          <div className={`p-3 rounded-2xl border flex items-center justify-center ${vStyles.iconBg}`}>
            {vStyles.icon}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line">
              {state.message}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-end gap-3">
          {state.isConfirm && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60 rounded-xl transition-colors border border-slate-300 dark:border-slate-700"
            >
              {state.cancelText} (Esc)
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={handleConfirm}
            className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 ${vStyles.confirmBtn}`}
          >
            <span>{state.confirmText}</span>
            <kbd className="hidden sm:inline-block text-[10px] bg-black/20 px-1.5 py-0.5 rounded font-mono">Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};
