import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X } from 'lucide-react';
import { AppButton } from './AppButton';
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
        };
      case 'warning':
        return {
          topBar: 'bg-gradient-to-r from-warn via-warn to-warn',
          badge: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30',
          headerIcon: <AlertTriangle className="w-5 h-5 text-warn dark:text-warn-bright shrink-0" />,
        };
      case 'success':
        return {
          topBar: 'bg-gradient-to-r from-paid via-paid to-paid',
          badge: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/30',
          headerIcon: <CheckCircle2 className="w-5 h-5 text-paid dark:text-paid-bright shrink-0" />,
        };
      case 'info':
      default:
        return {
          topBar: 'bg-gradient-to-r from-paid via-paid to-paid',
          badge: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30',
          headerIcon: <Info className="w-5 h-5 text-paid dark:text-paid-bright shrink-0" />,
        };
    }
  };

  const vStyles = getVariantStyles();
  const confirmVariant = state.variant === 'danger' || state.variant === 'error' ? 'danger' : state.variant === 'success' ? 'success' : 'primary';

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
        className="w-full max-w-md bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden flex flex-col transform transition-all animate-scale-up"
        role="alertdialog"
        aria-modal="true"
      >
        {/* Sleek Top Accent Line */}
        <div className={`h-1.5 w-full ${vStyles.topBar}`} />

        {/* Modern Clean Header (Replaces the heavy dark bar) */}
        <div className="bg-surface dark:bg-surface-dark px-5 py-4 flex items-center justify-between border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${vStyles.badge}`}>
              {vStyles.headerIcon}
            </div>
            <h3 className="t-card-title text-ink dark:text-ink-dark">{state.title}</h3>
          </div>
          <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={handleCancel} />
        </div>

        {/* Content Body */}
        <div className="p-6 bg-surface-2 dark:bg-surface-dark-2">
          <div className="text-sm font-semibold text-ink dark:text-ink-dark leading-relaxed whitespace-pre-line">
            {typeof state.message === 'string' ? state.message.replace(/\\n/g, '\n') : state.message}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-3.5 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex items-center justify-end gap-2.5">
          {state.isConfirm && (
            <AppButton variant="secondary" onClick={handleCancel}>
              {state.cancelText} (Esc)
            </AppButton>
          )}
          <AppButton variant={confirmVariant} autoFocus onClick={handleConfirm}>
            {state.confirmText}
          </AppButton>
        </div>
      </div>
    </div>
  );
};
