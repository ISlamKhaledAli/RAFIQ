import React, { useState } from 'react';
import { X, Tag, AlertTriangle } from 'lucide-react';
import { formatArabicCurrency, normalizeArabicNumerals, calculateDiscountAmount } from '../utils/money';
import { DiscountEntry, type DiscountType } from './discount/DiscountEntry';
import type { SaleItem } from '../types/models';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { isFormDirty } from '../utils/dirtyForm';

import { AppButton } from './AppButton';
interface ItemDiscountModalProps {
  isOpen: boolean;
  item: SaleItem | null;
  itemIndex: number | null;
  userRole?: string;
  /** Holder of pos.discount_line; without it every line discount needs a supervisor PIN (enforced server-side). */
  canDiscountLine?: boolean;
  maxPercentWithoutPin?: number;
  maxAmountWithoutPinPiasters?: number;
  onClose: () => void;
  onApply: (index: number, discountPiasters: number, supervisorApproved?: boolean) => void;
  onRequestSupervisor: (actionTitle: string, onApproved: () => void) => void;
}

export const ItemDiscountModal: React.FC<ItemDiscountModalProps> = ({
  isOpen,
  item,
  itemIndex,
  userRole = 'cashier',
  canDiscountLine = true,
  maxPercentWithoutPin = 10,
  maxAmountWithoutPinPiasters = 5000,
  onClose,
  onApply,
  onRequestSupervisor,
}) => {
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [initialInputValue] = useState(() => {
    return item && item.discountPiasters > 0 ? (item.discountPiasters / 100).toFixed(2) : '';
  });
  const [inputValue, setInputValue] = useState(initialInputValue);

  // The line's existing discount is pre-filled: only a different value or type is a change
  const isDirty = isFormDirty(
    { value: parseFloat(normalizeArabicNumerals(initialInputValue)) || 0, type: 'amount' },
    { value: parseFloat(normalizeArabicNumerals(inputValue)) || 0, type: discountType },
  );

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل الخصم؟',
    confirmMessage: 'هناك قيمة خصم مدخلة على الصنف، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة الخصم',
  });

  const grossPiasters = item
    ? Math.round((item.unitPricePiasters * item.quantityMilli) / 1000)
    : 0;

  if (!isOpen || !item || itemIndex === null) return null;

  const parsedVal = parseFloat(normalizeArabicNumerals(inputValue.trim())) || 0;
  const calculatedDiscountPiasters = calculateDiscountAmount(grossPiasters, discountType, parsedVal);
  const netPreviewPiasters = Math.max(0, grossPiasters - calculatedDiscountPiasters);
  const discountPercentCalculated = grossPiasters > 0
    ? (calculatedDiscountPiasters / grossPiasters) * 100
    : 0;

  const requiresSupervisor = !canDiscountLine || (
    userRole === 'cashier' &&
    (discountPercentCalculated > maxPercentWithoutPin ||
      calculatedDiscountPiasters > maxAmountWithoutPinPiasters));

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (calculatedDiscountPiasters > 0 && requiresSupervisor) {
      onRequestSupervisor(
        canDiscountLine
          ? `خصم على صنف (${item.productName}) يتجاوز الحد المسموح: ${(calculatedDiscountPiasters / 100).toFixed(2)} ج.م (${discountPercentCalculated.toFixed(1)}%)`
          : `خصم على صنف (${item.productName}) بدون صلاحية خصم الأصناف: ${(calculatedDiscountPiasters / 100).toFixed(2)} ج.م`,
        () => {
          onApply(itemIndex, calculatedDiscountPiasters, true);
          onClose();
        }
      );
      return;
    }

    onApply(itemIndex, calculatedDiscountPiasters, false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-xl border border-line dark:border-line-dark w-full max-w-md max-h-full flex flex-col overflow-hidden text-right text-ink dark:text-ink-dark select-none transform-gpu will-change-[transform,opacity] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line dark:border-line-dark shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">خصم خاص على الصنف</h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5 truncate" title={item.productName}>
                {item.productName} ({formatArabicCurrency(grossPiasters)})
              </p>
            </div>
          </div>
          <AppButton variant="subtle" icon={X} onClick={() => void requestClose()} title="إغلاق" aria-label="إغلاق" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
            <DiscountEntry
              type={discountType}
              onTypeChange={(next) => {
                setDiscountType(next);
                setInputValue('');
              }}
              value={inputValue}
              onValueChange={setInputValue}
              amountPresets={[1, 2, 5, 10]}
              percentPresets={[5, 10, 15, 20]}
              amountToggleLabel="مبلغ نقدي (ج.م)"
              percentToggleLabel="نسبة مئوية (%)"
              amountFieldLabel="أدخل قيمة الخصم بالجنيه:"
              percentFieldLabel="أدخل نسبة الخصم المئوية (%):"
              resetLabel="إلغاء الخصم (0)"
              inputId="item-discount-value"
            />

            {/* Supervisor Warning Badge */}
            {requiresSupervisor && (
              <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/40 rounded-xl text-ink dark:text-warn-bright text-xs font-semibold flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                  <span>{canDiscountLine ? `يتطلب موافقة المشرف (أعلى من ${maxPercentWithoutPin}%)` : 'حسابك لا يملك صلاحية خصم الأصناف'}</span>
                </span>
                <span className="font-bold whitespace-nowrap">مطلوب رقم سري للمشرف</span>
              </div>
            )}

            {/* Real-time Preview */}
            <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between gap-3 text-sm font-bold">
              <span className="text-ink-muted dark:text-ink-dark-muted">سعر الصنف بعد الخصم:</span>
              <span className="font-mono tabular-nums text-brand dark:text-brand-bright text-base">{formatArabicCurrency(netPreviewPiasters)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 px-5 py-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 shrink-0">
            <AppButton type="submit" variant="primary" size="lg" className="flex-1">
              تأكيد الخصم (Enter)
            </AppButton>
            <AppButton variant="secondary" size="lg" onClick={() => void requestClose()}>
              إلغاء
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
