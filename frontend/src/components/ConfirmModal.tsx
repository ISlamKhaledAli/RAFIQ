import { useEffect } from 'react';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  consequence?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-150 select-none">
      <div 
        className="w-full max-w-md bg-surface hairline-all rounded-[8px] shadow-2xl overflow-hidden flex flex-col transform transition-all"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Strip */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          isDanger ? 'bg-red-500/10 border-red-500/20' : 'bg-brand-soft border-brand/20'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              isDanger ? 'bg-red-600 text-white' : 'bg-brand text-white'
            }`}>
              {isDanger ? <AlertTriangle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <h3 className="text-[14px] font-bold text-ink m-0">{title}</h3>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-3 text-[13px] text-ink">
          <p className="leading-relaxed m-0 font-medium">{message}</p>

          {consequence && (
            <div className={`p-3 rounded text-[11.5px] border leading-relaxed flex items-start gap-2 ${
              isDanger 
                ? 'bg-red-500/5 border-red-500/20 text-red-700' 
                : 'bg-amber-500/5 border-amber-500/20 text-amber-800'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{consequence}</span>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="px-5 py-3.5 bg-surface-2 hairline-t flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-[38px] px-4 rounded border border-line bg-surface hover:bg-surface-2 text-ink text-[12.5px] font-semibold transition-colors"
          >
            {cancelText}
          </button>

          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`h-[38px] px-5 rounded text-white text-[12.5px] font-bold shadow-sm transition-colors flex items-center gap-1.5 ${
              isDanger 
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800' 
                : 'bg-brand hover:bg-brand-hover active:bg-brand'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
