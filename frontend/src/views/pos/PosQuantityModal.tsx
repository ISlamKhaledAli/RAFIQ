import React from 'react';
import { AppButton } from '../../components/AppButton';
import { X, Minus, Plus } from 'lucide-react';
import { normalizeArabicNumerals } from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { RequiredMark } from '../../components/RequiredMark';

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
            <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">تعديل كمية الصنف</h3>
            <p className="text-xs font-bold text-brand dark:text-brand-bright m-0 truncate max-w-[16.25rem]">
              {quantityModalItem.name}
            </p>
          </div>
          <AppButton variant="subtle" size="xs" icon={X} onClick={requestClose} aria-label="إغلاق" />
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1.5">
            الكمية المطلوبة (عدد القطع): <RequiredMark />
          </label>
          <div className="flex items-center gap-2 mb-3">
            <AppButton
              variant="secondary"
              size="lg"
              icon={Minus}
              aria-label="إنقاص الكمية"
              onClick={() => {
                const curr = parseFloat(quantityInputVal) || 1;
                if (curr > 1) setQuantityInputVal(String(curr - 1));
              }}
            />
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
              className="flex-1 min-w-0 h-11 text-center text-3xl font-mono font-bold text-brand dark:text-brand-bright bg-surface-2 dark:bg-surface-dark-2 border-2 border-brand/50 dark:border-brand-bright/50 focus:border-brand dark:focus:border-brand-bright rounded-lg text-ink dark:text-ink-dark focus:outline-none shadow-inner"
            />
            <AppButton
              variant="secondary"
              size="lg"
              icon={Plus}
              aria-label="زيادة الكمية"
              onClick={() => {
                const curr = parseFloat(quantityInputVal) || 0;
                setQuantityInputVal(String(curr + 1));
              }}
            />
          </div>

          {/* Quick Quantity Buttons */}
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
              <AppButton key={n} variant="secondary" size="sm" onClick={() => setQuantityInputVal(String(n))}>
                {n}
              </AppButton>
            ))}
          </div>

          <div className="flex gap-2">
            <AppButton type="submit" variant="primary" size="md" className="flex-1">
              تأكيد الكمية (Enter)
            </AppButton>
            <AppButton variant="secondary" size="md" onClick={requestClose}>
              إلغاء (Esc)
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
