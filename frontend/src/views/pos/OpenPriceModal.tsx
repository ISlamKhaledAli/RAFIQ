import React from 'react';
import { AppButton } from '../../components/AppButton';
import type { FormEvent } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { QuickItem } from '../../types/models';
import { normalizeArabicNumerals } from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { RequiredMark } from '../../components/RequiredMark';

interface OpenPriceModalProps {
  openPriceItem: QuickItem | null;
  openPriceInputEgp: string;
  setOpenPriceInputEgp: (val: string) => void;
  onClose: () => void;
  onConfirm: (e: FormEvent) => void;
}

export const OpenPriceModal: React.FC<OpenPriceModalProps> = ({
  openPriceItem,
  openPriceInputEgp,
  setOpenPriceInputEgp,
  onClose,
  onConfirm,
}) => {
  const isDirty = Boolean(openPriceInputEgp && parseFloat(openPriceInputEgp) > 0);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: openPriceItem !== null,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء تحديد السعر؟',
    confirmMessage: 'تم إدخال سعر بيع للصنف. هل تريد التراجع دون إضافة الصنف للسلة؟',
  });

  if (!openPriceItem) return null;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface dark:bg-surface-dark rounded-lg shadow-xl border border-line dark:border-line-dark w-full max-w-sm p-5 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between mb-4 pb-2 hairline-b">
          <h3 className="t-modal-title text-ink dark:text-ink-dark flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span>تحديد سعر البيع: {openPriceItem.name}</span>
          </h3>
          <AppButton variant="subtle" size="xs" icon={X} onClick={requestClose} aria-label="إغلاق" />
        </div>
        <form onSubmit={onConfirm}>
          <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1.5">
            أدخل المبلغ بالجنيه: <RequiredMark />
          </label>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0.00"
            value={openPriceInputEgp}
            onChange={(e) => {
              const norm = normalizeArabicNumerals(e.target.value);
              if (/^[0-9]*\.?[0-9]{0,2}$/.test(norm)) {
                setOpenPriceInputEgp(norm);
              }
            }}
            onFocus={(e) => e.target.select()}
            className="w-full text-center text-2xl font-mono font-bold text-brand dark:text-brand-bright bg-surface-2 dark:bg-surface-dark-2 border-2 border-brand dark:border-brand-bright rounded p-3 mb-4 focus:outline-none"
          />
          <div className="flex gap-2">
            <AppButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={!openPriceInputEgp || parseFloat(openPriceInputEgp) <= 0}
              className="flex-1"
            >
              تأكيد وإضافة للسلة
            </AppButton>
            <AppButton variant="secondary" size="lg" onClick={requestClose}>
              إلغاء
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
