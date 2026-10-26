import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  consequence?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  icon?: ReactNode;
  variant?: 'danger' | 'brand' | 'paid' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal = ({
  isOpen,
  title,
  message,
  consequence,
  confirmText = 'تأكيد العملية',
  cancelText = 'تراجع',
  isDanger = true,
  icon,
  variant,
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const effectiveVariant: 'danger' | 'brand' | 'paid' | 'info' =
    variant ?? (isDanger ? 'danger' : 'brand');

  const headerBgClass =
    effectiveVariant === 'danger'
      ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30'
      : effectiveVariant === 'paid'
      ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid/30'
      : effectiveVariant === 'info'
      ? 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark'
      : 'bg-brand-soft dark:bg-surface-dark-2 border-brand/20 dark:border-line-dark';

  const iconContainerClass =
    effectiveVariant === 'danger'
      ? 'bg-danger dark:bg-danger text-white'
      : effectiveVariant === 'paid'
      ? 'bg-paid dark:bg-paid text-white'
      : 'bg-brand text-white';

  const defaultIcon =
    effectiveVariant === 'danger' ? (
      <AlertTriangle className="w-4 h-4" />
    ) : effectiveVariant === 'paid' ? (
      <CheckCircle2 className="w-4 h-4" />
    ) : (
      <Info className="w-4 h-4" />
    );

  const confirmBtnClass =
    effectiveVariant === 'danger'
      ? 'bg-danger hover:bg-danger-hover active:bg-danger'
      : effectiveVariant === 'paid'
      ? 'bg-paid hover:bg-paid-hover active:bg-paid'
      : 'bg-brand hover:bg-brand-hover active:bg-brand';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div 
        className="w-full max-w-md bg-surface dark:bg-surface-dark hairline-all rounded-[8px] shadow-2xl overflow-hidden flex flex-col transform transition-all"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Strip */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${headerBgClass}`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconContainerClass}`}>
              {icon || defaultIcon}
            </div>
            <h3 className="text-[14px] font-bold text-ink dark:text-ink-dark m-0">{title}</h3>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-3 text-[13px] text-ink dark:text-ink-dark">
          <p className="leading-relaxed m-0 font-medium">{message}</p>

          {consequence && (
            <div className={`p-3 rounded text-[11.5px] border leading-relaxed flex items-start gap-2 ${
              effectiveVariant === 'danger'
                ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright' 
                : 'bg-warn-soft dark:bg-warn-dark-soft border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{consequence}</span>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="px-5 py-3.5 bg-surface-2 dark:bg-surface-dark-2 hairline-t flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-[38px] px-4 rounded border border-line dark:border-line-dark bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark text-[12.5px] font-semibold transition-colors cursor-pointer"
          >
            {cancelText}
          </button>

          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`h-[38px] px-5 rounded text-white text-[12.5px] font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
