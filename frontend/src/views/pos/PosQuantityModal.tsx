import React from 'react';
import { X } from 'lucide-react';
import { normalizeArabicNumerals } from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';

interface PosQuantityModalProps {
  quantityModalItem: { index: number; name: string; currentQty: number } | null;
  quantityInputVal: string;
  setQuantityInputVal: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
  onConfirm: (index: number, newQtyPieces: number) => void;
}

export const PosQuantityModal: React.FC<PosQuantityModalProps> = ({
  quantityModalItem,
  quantityInputVal,
  setQuantityInputVal,
  onClose,
  onConfirm,
}) => {
  const isDirty = quantityModalItem !== null && quantityInputVal.trim() !== '' && quantityInputVal.trim() !== String(quantityModalItem.currentQty);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: quantityModalItem !== null,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء تعديل الكمية؟',
    confirmMessage: 'تم إدخال كمية جديدة للصنف. هل أنت متأكد من الإلغاء والتراجع؟',
  });

  if (!quantityModalItem) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(normalizeArabicNumerals(quantityInputVal.trim()));
    if (!isNaN(num) && num > 0) {
      onConfirm(quantityModalItem.index, num);
    }
    onClose();
  };

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-150 text-right select-none">
        <div className="flex items-center justify-between mb-4 pb-2 hairline-b">
          <div>
            <h3 className="text-base font-bold text-ink dark:text-ink-dark m-0">تعديل كمية الصنف</h3>
            <p className="text-[12px] font-bold text-brand dark:text-brand-bright m-0 truncate max-w-[260px]">
              {quantityModalItem.name}
            </p>
          </div>
          <button 
            type="button"
            onClick={requestClose}
            className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-1 rounded hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1.5">
            الكمية المطلوبة (عدد القطع):
          </label>
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                const curr = parseFloat(quantityInputVal) || 1;
                if (curr > 1) setQuantityInputVal(String(curr - 1));
              }}
              className="w-11 h-11 rounded-lg bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft/40 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark font-bold text-lg flex items-center justify-center shadow-2xs"
            >
              -
            </button>
            <input
              type="text"
              autoFocus
              value={quantityInputVal}
              onChange={(e) => {
                const norm = normalizeArabicNumerals(e.target.value);
                if (/^[0-9]*\.?[0-9]*$/.test(norm)) {
                  setQuantityInputVal(norm);
                }
              }}
              className="flex-1 h-11 text-center text-3xl font-mono font-bold text-brand dark:text-brand-bright bg-surface-2 dark:bg-surface-dark-2 border-2 border-brand/50 dark:border-brand-bright/50 focus:border-brand dark:focus:border-brand-bright rounded-lg text-ink dark:text-ink-dark focus:outline-none shadow-inner"
            />
            <button
              type="button"
              onClick={() => {
                const curr = parseFloat(quantityInputVal) || 0;
                setQuantityInputVal(String(curr + 1));
              }}
              className="w-11 h-11 rounded-lg bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft/40 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark font-bold text-lg flex items-center justify-center shadow-2xs"
            >
              +
            </button>
          </div>

          {/* Quick Quantity Buttons */}
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQuantityInputVal(String(n))}
                className="h-8 rounded bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft/40 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 h-10 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg transition-colors shadow-xs"
            >
              تأكيد الكمية (Enter)
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="px-4 h-10 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark font-semibold rounded-lg transition-colors cursor-pointer"
            >
              إلغاء (Esc)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
