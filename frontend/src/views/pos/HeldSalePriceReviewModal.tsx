import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppButton } from '../../components/AppButton';
import { formatArabicCurrency } from '../../utils/money';
import type { HeldPriceChange } from './heldSalePricing';

interface HeldSalePriceReviewModalProps {
  changes: HeldPriceChange[] | null;
  /** True when keeping held prices needs a supervisor PIN (user lacks pos.price_override). */
  keepRequiresApproval: boolean;
  onKeepHeldPrices: () => void;
  onUpdateToCurrentPrices: () => void;
}

export const HeldSalePriceReviewModal: React.FC<HeldSalePriceReviewModalProps> = ({
  changes,
  keepRequiresApproval,
  onKeepHeldPrices,
  onUpdateToCurrentPrices,
}) => {
  const isOpen = changes !== null && changes.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Escape is a shortcut for keeping prices only when no approval is needed; otherwise the cashier must choose
        if (!keepRequiresApproval) onKeepHeldPrices();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, keepRequiresApproval, onKeepHeldPrices]);

  if (!isOpen || !changes) return null;

  return (
    <div className="motion-modal-backdrop fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="motion-modal-panel bg-surface dark:bg-surface-dark rounded-lg shadow-xl border border-line dark:border-line-dark w-full max-w-lg p-5">
        <div className="flex items-center gap-2 mb-3 pb-2 hairline-b">
          <AlertTriangle className="w-5 h-5 text-warn dark:text-warn-bright shrink-0" />
          <h3 className="t-modal-title text-ink dark:text-ink-dark">تغيرت أسعار بعض أصناف الفاتورة المعلقة</h3>
        </div>
        <p className="text-xs text-ink-muted dark:text-ink-dark-muted mb-3">
          تم استرجاع الفاتورة بالأسعار التي عُلّقت بها (السعر الذي أُبلغ به العميل). الأصناف التالية سعرها الحالي في الكتالوج مختلف:
        </p>
        <div className="max-h-60 overflow-y-auto border border-line dark:border-line-dark rounded mb-4">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted">
              <tr>
                <th className="text-right p-2 font-bold">الصنف</th>
                <th className="text-right p-2 font-bold">سعر التعليق</th>
                <th className="text-right p-2 font-bold">السعر الحالي</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.index} className="border-t border-line dark:border-line-dark text-ink dark:text-ink-dark">
                  <td className="p-2 font-semibold">
                    {change.productName}
                    {change.unitName ? <span className="text-ink-muted dark:text-ink-dark-muted font-normal"> ({change.unitName})</span> : null}
                  </td>
                  <td className="p-2 font-mono tabular-nums">{formatArabicCurrency(change.heldUnitPricePiasters)}</td>
                  <td className="p-2 font-mono tabular-nums text-warn dark:text-warn-bright font-bold">{formatArabicCurrency(change.currentUnitPricePiasters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {keepRequiresApproval && (
          <p className="text-xs font-bold text-warn dark:text-warn-bright mb-3">
            البيع بسعر التعليق يحتاج اعتماد المشرف. عند إلغاء الاعتماد تُحدَّث الأصناف للأسعار الحالية.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <AppButton variant="primary" size="lg" autoFocus onClick={onKeepHeldPrices} className="flex-1 min-w-fit">
            {keepRequiresApproval ? 'الإبقاء على أسعار التعليق (باعتماد المشرف)' : 'الإبقاء على أسعار التعليق'}
          </AppButton>
          <AppButton variant="secondary" size="lg" onClick={onUpdateToCurrentPrices} className="flex-1 min-w-fit">
            التحديث للأسعار الحالية
          </AppButton>
        </div>
      </div>
    </div>
  );
};
