import React, { useState } from 'react';
import { Tag, AlertTriangle, Lock, RotateCcw, X, TrendingDown, TrendingUp } from 'lucide-react';
import type { CartItem } from './types';
import { AppButton } from '../../components/AppButton';
import { MoneyInput } from '../../components/MoneyInput';
import { formatArabicCurrency, calculateLineTotal } from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';

export interface ItemPriceOverrideModalProps {
  isOpen: boolean;
  item: CartItem | null;
  itemIndex: number | null;
  /** Whether the active user has pos.price_override permission or is admin/root */
  canOverridePrice: boolean;
  onClose: () => void;
  onApply: (index: number, newUnitPricePiasters: number, supervisorApproved?: boolean) => void;
  onRequestSupervisor: (actionTitle: string, onApproved: () => void) => void;
  onResetToCatalogPrice?: (index: number) => void;
}

export const ItemPriceOverrideModal: React.FC<ItemPriceOverrideModalProps> = ({
  isOpen,
  item,
  itemIndex,
  canOverridePrice,
  onClose,
  onApply,
  onRequestSupervisor,
  onResetToCatalogPrice,
}) => {
  const catalogPrice = item?.catalogPricePiasters ?? item?.unitPricePiasters ?? 0;
  const initialPrice = item?.unitPricePiasters ?? 0;
  const [newPricePiasters, setNewPricePiasters] = useState<number>(initialPrice);

  const isDirty = item !== null && newPricePiasters !== initialPrice;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل تعديل السعر؟',
    confirmMessage: 'قمت بتغيير سعر بيع الصنف، هل تريد الخروج دون حفظ السعر الجديد؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة التعديل',
  });

  if (!isOpen || !item || itemIndex === null) return null;

  const unitCost = item.unitCostPiasters || 0;
  const hasCost = unitCost > 0;
  const isBelowCost = hasCost && newPricePiasters < unitCost;
  const isOverriddenFromCatalog = catalogPrice > 0 && newPricePiasters !== catalogPrice;
  const isDiscounted = catalogPrice > 0 && newPricePiasters < catalogPrice;

  const differencePiasters = newPricePiasters - catalogPrice;
  const discountPercent = catalogPrice > 0 && isDiscounted
    ? Math.round(((catalogPrice - newPricePiasters) * 100) / catalogPrice)
    : 0;

  const newLineTotal = calculateLineTotal(newPricePiasters, item.quantityMilli, item.discountPiasters || 0);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (newPricePiasters <= 0) return;

    if (!canOverridePrice && newPricePiasters !== catalogPrice) {
      const priceText = `${formatArabicCurrency(catalogPrice)} -> ${formatArabicCurrency(newPricePiasters)}`;
      onRequestSupervisor(
        `تعديل سعر الصنف (${item.productName}) من ${priceText}`,
        () => {
          onApply(itemIndex, newPricePiasters, true);
          onClose();
        }
      );
      return;
    }

    onApply(itemIndex, newPricePiasters, false);
    onClose();
  };

  const handleResetToCatalog = () => {
    if (onResetToCatalogPrice) {
      onResetToCatalogPrice(itemIndex);
      onClose();
    } else {
      setNewPricePiasters(catalogPrice);
    }
  };

  const applyPresetDiscount = (pct: number) => {
    if (catalogPrice <= 0) return;
    const discountAmount = Math.round((catalogPrice * pct) / 100);
    const targetPrice = Math.max(1, catalogPrice - discountAmount);
    setNewPricePiasters(targetPrice);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={handleBackdropClick}
      dir="rtl"
    >
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-xl border border-line dark:border-line-dark w-full max-w-md max-h-full flex flex-col overflow-hidden text-right text-ink dark:text-ink-dark select-none transform-gpu will-change-[transform,opacity] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line dark:border-line-dark shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">تعديل سعر بيع الصنف</h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5 truncate" title={item.productName}>
                {item.productName} {item.unitName ? `(${item.unitName})` : ''}
              </p>
            </div>
          </div>
          <AppButton variant="subtle" icon={X} onClick={() => void requestClose()} title="إغلاق" aria-label="إغلاق" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
            {/* Catalog & Cost Info Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-1">
                <span className="text-micro font-medium text-ink-muted dark:text-ink-dark-muted">سعر الكتالوج الرسمي:</span>
                <span className="font-mono tabular-nums text-base font-bold text-ink dark:text-ink-dark">
                  {formatArabicCurrency(catalogPrice)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-1">
                <span className="text-micro font-medium text-ink-muted dark:text-ink-dark-muted">تكلفة الشراء:</span>
                <span className="font-mono tabular-nums text-base font-bold text-ink dark:text-ink-dark">
                  {hasCost ? formatArabicCurrency(unitCost) : 'غير مسجلة'}
                </span>
              </div>
            </div>

            {/* Price Input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-unit-price-input" className="text-xs font-bold text-ink dark:text-ink-dark">
                أدخل سعر البيع الجديد للوحدة:
              </label>
              <MoneyInput
                valuePiasters={newPricePiasters}
                onChangePiasters={setNewPricePiasters}
                autoFocus
                placeholder="0.00"
                className="text-lg font-bold"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </div>

            {/* Quick Bargaining / Discount Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-micro font-medium text-ink-muted dark:text-ink-dark-muted ms-1">اختصارات:</span>
              <button
                type="button"
                onClick={() => applyPresetDiscount(5)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand-soft dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright transition-colors text-ink dark:text-ink-dark"
              >
                خصم 5%
              </button>
              <button
                type="button"
                onClick={() => applyPresetDiscount(10)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand-soft dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright transition-colors text-ink dark:text-ink-dark"
              >
                خصم 10%
              </button>
              <button
                type="button"
                onClick={() => applyPresetDiscount(15)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand-soft dark:hover:bg-brand-dark-soft border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright transition-colors text-ink dark:text-ink-dark"
              >
                خصم 15%
              </button>
              {isOverriddenFromCatalog && (
                <button
                  type="button"
                  onClick={() => setNewPricePiasters(catalogPrice)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark border border-line dark:border-line-dark transition-colors inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>الأصلي</span>
                </button>
              )}
            </div>

            {/* Price Difference Indicator */}
            {isOverriddenFromCatalog && (
              <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                isDiscounted
                  ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid/30 text-paid dark:text-paid-bright'
                  : 'bg-brand-soft dark:bg-brand-dark-soft border-brand/30 dark:border-brand-bright/30 text-brand-dark dark:text-brand-bright'
              }`}>
                <div className="flex items-center gap-2">
                  {isDiscounted ? <TrendingDown className="w-4 h-4 shrink-0" /> : <TrendingUp className="w-4 h-4 shrink-0" />}
                  <span>
                    {isDiscounted
                      ? `تخفيض في السعر: -${formatArabicCurrency(Math.abs(differencePiasters))} (خصم ${discountPercent}%)`
                      : `زيادة في السعر: +${formatArabicCurrency(differencePiasters)}`
                    }
                  </span>
                </div>
              </div>
            )}

            {/* Below Cost Warning */}
            {isBelowCost && (
              <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/40 rounded-xl text-ink dark:text-warn-bright text-xs font-semibold flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                <span>
                  <strong>تنبيه:</strong> سعر البيع الجديد أقل من تكلفة شراء الصنف ({formatArabicCurrency(unitCost)})!
                </span>
              </div>
            )}

            {/* Supervisor PIN Required Notice */}
            {!canOverridePrice && newPricePiasters !== catalogPrice && (
              <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-ink-muted dark:text-ink-dark-muted text-xs font-semibold flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <Lock className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                  <span>حسابك لا يملك صلاحية تعديل السعر؛ يتطلب موافقة المشرف</span>
                </span>
                <span className="font-bold text-ink dark:text-ink-dark whitespace-nowrap">مطلوب PIN</span>
              </div>
            )}

            {/* Real-time Line Total Preview */}
            <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between gap-3 text-sm font-bold">
              <span className="text-ink-muted dark:text-ink-dark-muted">إجمالي السطر الجديد في السلة:</span>
              <span className="font-mono tabular-nums text-brand dark:text-brand-bright text-base">
                {formatArabicCurrency(newLineTotal)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 px-5 py-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 shrink-0">
            <AppButton
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1"
              disabled={newPricePiasters <= 0}
            >
              تأكيد السعر (Enter)
            </AppButton>
            {item.catalogPricePiasters && item.catalogPricePiasters !== item.unitPricePiasters && onResetToCatalogPrice && (
              <AppButton
                variant="secondary"
                size="lg"
                onClick={handleResetToCatalog}
                icon={RotateCcw}
                title="استعادة سعر الكتالوج الرسمي"
              >
                استعادة الأصلي
              </AppButton>
            )}
            <AppButton variant="secondary" size="lg" onClick={() => void requestClose()}>
              إلغاء
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
