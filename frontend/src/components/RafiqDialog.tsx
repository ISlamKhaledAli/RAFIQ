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
          topBar: 'bg-gradient-to-r from-rose-500 via-red-600 to-rose-500',
          badge: 'bg-rose-50 text-[#B23A2E] border-rose-200',
          headerIcon: <AlertCircle className="w-5 h-5 text-[#B23A2E] shrink-0" />,
          confirmBtn: 'bg-[#B23A2E] hover:bg-[#962e24] text-white shadow-sm border border-[#8a241a]/30',
        };
      case 'warning':
        return {
          topBar: 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600',
          badge: 'bg-amber-50 text-[#B3720E] border-amber-200',
          headerIcon: <AlertTriangle className="w-5 h-5 text-[#B3720E] shrink-0" />,
          confirmBtn: 'bg-[#006D41] hover:bg-[#005a36] text-white shadow-sm border border-[#005a36]/30',
        };
      case 'success':
        return {
          topBar: 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600',
          badge: 'bg-emerald-50 text-[#006D41] border-emerald-200',
          headerIcon: <CheckCircle2 className="w-5 h-5 text-[#006D41] shrink-0" />,
          confirmBtn: 'bg-[#006D41] hover:bg-[#005a36] text-white shadow-sm border border-[#005a36]/30',
        };
      case 'info':
      default:
        return {
          topBar: 'bg-gradient-to-r from-[#006D41] via-teal-600 to-[#006D41]',
          badge: 'bg-emerald-50 text-[#006D41] border-emerald-200',
          headerIcon: <Info className="w-5 h-5 text-[#006D41] shrink-0" />,
          confirmBtn: 'bg-[#006D41] hover:bg-[#005a36] text-white shadow-sm border border-[#005a36]/30',
        };
    }
  };

  const vStyles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transform transition-all animate-scale-up"
        role="alertdialog"
        aria-modal="true"
      >
        {/* Sleek Top Accent Line */}
        <div className={`h-1.5 w-full ${vStyles.topBar}`} />

        {/* Modern Clean Header (Replaces the heavy dark bar) */}
        <div className="bg-white px-5 py-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${vStyles.badge}`}>
              {vStyles.headerIcon}
            </div>
            <h3 className="font-black text-sm text-slate-900">{state.title}</h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 bg-slate-50/50">
          <div className="text-sm font-semibold text-slate-800 leading-relaxed whitespace-pre-line">
            {state.message}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-100 flex items-center justify-end gap-2.5">
          {state.isConfirm && (
            <button
              type="button"
              onClick={handleCancel}
              className="h-9 px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300 cursor-pointer"
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
            <kbd className="hidden sm:inline-block text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded font-mono">Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};
