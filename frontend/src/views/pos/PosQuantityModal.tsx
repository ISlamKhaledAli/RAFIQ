import React from 'react';
import { X } from 'lucide-react';
import { normalizeArabicNumerals } from '../../utils/money';

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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-150 text-right select-none">
        <div className="flex items-center justify-between mb-4 pb-2 hairline-b">
          <div>
            <h3 className="text-base font-bold text-ink m-0">تعديل كمية الصنف</h3>
            <p className="text-[12px] font-bold text-brand m-0 truncate max-w-[260px]">
              {quantityModalItem.name}
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink p-1 rounded hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-bold text-ink-muted mb-1.5">
            الكمية المطلوبة (عدد القطع):
          </label>
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                const curr = parseFloat(quantityInputVal) || 1;
                if (curr > 1) setQuantityInputVal(String(curr - 1));
              }}
              className="w-11 h-11 rounded-lg bg-surface border border-line hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-ink font-bold text-lg flex items-center justify-center shadow-2xs"
            >
              -
            </button>
            <input
              type="text"
              autoFocus
              value={quantityInputVal}
              onChange={(e) => setQuantityInputVal(normalizeArabicNumerals(e.target.value))}
              className="flex-1 h-11 text-center text-3xl font-mono font-bold text-brand bg-surface-2 border-2 border-brand/50 focus:border-brand rounded-lg text-ink focus:outline-none shadow-inner"
            />
            <button
              type="button"
              onClick={() => {
                const curr = parseFloat(quantityInputVal) || 0;
                setQuantityInputVal(String(curr + 1));
              }}
              className="w-11 h-11 rounded-lg bg-surface border border-line hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-ink font-bold text-lg flex items-center justify-center shadow-2xs"
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
                className="h-8 rounded bg-surface border border-line hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-ink text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
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
              onClick={onClose}
              className="px-4 h-10 bg-surface hover:bg-surface-2 border border-line text-ink font-semibold rounded-lg transition-colors"
            >
              إلغاء (Esc)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
