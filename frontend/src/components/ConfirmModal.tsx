import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { AppButton } from './AppButton';

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

  const confirmVariant = effectiveVariant === 'danger' ? 'danger' : effectiveVariant === 'paid' ? 'success' : 'primary';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div 
        className="w-full max-w-md bg-surface dark:bg-surface-dark hairline-all rounded-[8px] shadow-xl overflow-hidden flex flex-col transform-gpu will-change-[transform,opacity] animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Strip */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${headerBgClass}`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconContainerClass}`}>
              {icon || defaultIcon}
            </div>
            <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">{title}</h3>
          </div>

          <AppButton variant="subtle" size="xs" icon={X} aria-label="إغلاق" onClick={onCancel} />
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-3 text-sm text-ink dark:text-ink-dark">
          <p className="leading-relaxed m-0 font-medium">{message}</p>

          {consequence && (
            <div className={`p-3 rounded text-micro border leading-relaxed flex items-start gap-2 ${
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
          <AppButton variant="secondary" onClick={onCancel}>
            {cancelText}
          </AppButton>

          <AppButton variant={confirmVariant} autoFocus onClick={onConfirm}>
            {confirmText}
          </AppButton>
        </div>
      </div>
    </div>
  );
};
