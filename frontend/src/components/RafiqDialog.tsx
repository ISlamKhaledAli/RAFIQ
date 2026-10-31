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
          topBar: 'bg-gradient-to-r from-danger via-danger to-danger',
          badge: 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30',
          headerIcon: <AlertCircle className="w-5 h-5 text-danger dark:text-danger-bright shrink-0" />,
          confirmBtn: 'bg-danger hover:bg-danger/90 text-white shadow-sm border border-danger/30',
        };
      case 'warning':
        return {
          topBar: 'bg-gradient-to-r from-warn via-warn to-warn',
          badge: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30',
          headerIcon: <AlertTriangle className="w-5 h-5 text-warn dark:text-warn-bright shrink-0" />,
          confirmBtn: 'bg-brand hover:bg-brand-hover text-white shadow-sm border border-brand/30',
        };
      case 'success':
        return {
          topBar: 'bg-gradient-to-r from-paid via-paid to-paid',
          badge: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/30',
          headerIcon: <CheckCircle2 className="w-5 h-5 text-paid dark:text-paid-bright shrink-0" />,
          confirmBtn: 'bg-paid hover:bg-paid-hover text-white shadow-sm border border-paid/30',
        };
      case 'info':
      default:
        return {
          topBar: 'bg-gradient-to-r from-[#006D41] via-teal-600 to-[#006D41]',
          badge: 'bg-emerald-50 dark:bg-paid-dark-soft text-[#006D41] dark:text-paid-bright border-emerald-200 dark:border-paid/30',
          headerIcon: <Info className="w-5 h-5 text-[#006D41] dark:text-paid-bright shrink-0" />,
          confirmBtn: 'bg-[#006D41] dark:bg-paid hover:bg-[#005a36] dark:hover:bg-paid-hover text-white shadow-sm border border-[#005a36]/30',
        };
    }
  };

  const vStyles = getVariantStyles();

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel();
        }
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in select-none"
    >
      <div
        className="w-full max-w-md bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-line-dark overflow-hidden flex flex-col transform transition-all animate-scale-up"
        role="alertdialog"
        aria-modal="true"
      >
        {/* Sleek Top Accent Line */}
        <div className={`h-1.5 w-full ${vStyles.topBar}`} />

        {/* Modern Clean Header (Replaces the heavy dark bar) */}
        <div className="bg-white dark:bg-surface-dark px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${vStyles.badge}`}>
              {vStyles.headerIcon}
            </div>
            <h3 className="font-black text-sm text-slate-900 dark:text-ink-dark">{state.title}</h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-ink-dark-muted dark:hover:text-ink-dark dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 bg-slate-50/50 dark:bg-surface-dark-2">
          <div className="text-sm font-semibold text-slate-800 dark:text-ink-dark leading-relaxed whitespace-pre-line">
            {typeof state.message === 'string' ? state.message.replace(/\\n/g, '\n') : state.message}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-3.5 bg-white dark:bg-surface-dark border-t border-slate-100 dark:border-line-dark flex items-center justify-end gap-2.5">
          {state.isConfirm && (
            <button
              type="button"
              onClick={handleCancel}
              className="h-9 px-4 text-xs font-bold text-slate-700 dark:text-ink-dark hover:bg-slate-100 dark:hover:bg-surface-dark-2 rounded-lg transition-colors border border-slate-300 dark:border-line-dark cursor-pointer"
            >
              {state.cancelText} (Esc)
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={handleConfirm}
            className={`h-9 px-5 text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95 flex items-center gap-2 cursor-pointer ${vStyles.confirmBtn}`}
          >
            <span>{state.confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
