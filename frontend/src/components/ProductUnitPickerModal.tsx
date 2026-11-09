import React, { useEffect, useCallback, useMemo } from 'react';
import { AppButton } from './AppButton';
import { Package, X, Check } from 'lucide-react';
import type { Product, ProductUnit } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { formatUnitArabic } from '../utils/units';

interface ProductUnitPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSelectUnit: (unit: ProductUnit) => void;
}

export const ProductUnitPickerModal: React.FC<ProductUnitPickerModalProps> = ({
  isOpen,
  onClose,
  product,
  onSelectUnit,
}) => {
  const units = useMemo(() => product?.units || [], [product?.units]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !product) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Check number keys 1-9 to quickly pick unit
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= units.length) {
        e.preventDefault();
        onSelectUnit(units[num - 1]);
        onClose();
        return;
      }

      // Enter selects base unit or first unit
      if (e.key === 'Enter') {
        e.preventDefault();
        const base = units.find((u) => u.isBaseUnit) || units[0];
        if (base) {
          onSelectUnit(base);
          onClose();
        }
      }
    },
    [isOpen, product, units, onSelectUnit, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !product || units.length === 0) return null;

  const stockBaseMilli = product.stockQuantityMilli ?? 0;
  const isOutOfStock = stockBaseMilli <= 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        dir="rtl"
        className="w-full max-w-md bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 font-sans text-ink dark:text-ink-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-dark dark:bg-surface-dark-2 text-white dark:text-ink-dark px-5 py-4 flex items-center justify-between border-b border-white/10 dark:border-line-dark">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 dark:bg-surface-dark-3 flex items-center justify-center text-paid dark:text-paid-bright border border-white/10 dark:border-line-dark">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="t-modal-title text-white dark:text-ink-dark flex items-center gap-2">
                <span>اختيار وحدة البيع</span>
                <span className="text-micro bg-white/15 dark:bg-surface-dark-3 px-2 py-0.5 rounded-full font-mono text-paid dark:text-paid-bright">
                  {units.length} وحدات
                </span>
              </h3>
              <p className="text-xs text-white/80 dark:text-ink-dark-muted font-medium truncate max-w-[16.25rem]" title={product.name}>
                {product.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 dark:text-ink-dark-muted hover:text-white dark:hover:text-ink-dark hover:bg-white/10 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
            aria-label="إغلاق"
          title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Units List */}
        <div className="p-4 flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto bg-surface dark:bg-surface-dark">
          <p className="text-micro text-ink-muted dark:text-ink-dark-muted font-semibold mb-1">
            اختر وحدة البيع المطلوبة لإضافتها إلى الفاتورة (أو اضغط الرقم على لوحة المفاتيح):
          </p>

          {units.map((u, idx) => {
            const factor = u.conversionFactor && u.conversionFactor > 0 ? u.conversionFactor : 1;
            const unitSellPrice = u.sellPricePiasters > 0 ? u.sellPricePiasters : product.pricePiasters * factor;
            const availableUnits = factor > 0 ? Math.floor(stockBaseMilli / (factor * 1000)) : 0;
            const isUnitOutOfStock = isOutOfStock || availableUnits <= 0;

            return (
              <button
                type="button"
                key={u.id || `${u.unitName}-${idx}`}
                onClick={() => {
                  onSelectUnit(u);
                  onClose();
                }}
                className={`group relative flex items-center justify-between p-3.5 rounded-xl border text-right transition-all cursor-pointer shadow-2xs ${
                  u.isBaseUnit
                    ? 'bg-paid-soft dark:bg-paid-dark-soft hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80 border-paid/30 dark:border-paid-dark-border hover:border-paid dark:hover:border-paid-bright'
                    : 'bg-surface dark:bg-surface-dark-2 hover:bg-canvas dark:hover:bg-surface-dark-3 border-line dark:border-line-dark hover:border-paid dark:hover:border-paid-bright'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Shortcut Badge */}
                  <span className="w-6 h-6 rounded-md bg-brand-dark dark:bg-surface-dark-3 text-white dark:text-brand-bright text-xs font-bold font-mono flex items-center justify-center shrink-0 shadow-2xs">
                    {idx + 1}
                  </span>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink dark:text-ink-dark group-hover:text-paid dark:group-hover:text-paid-bright transition-colors">
                        {formatUnitArabic(u.unitName)}
                      </span>
                      {u.isBaseUnit ? (
                        <span className="text-micro font-bold bg-paid text-white px-2 py-0.5 rounded-md flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          <span>الوحدة الأساسية</span>
                        </span>
                      ) : (
                        <span className="text-micro font-medium text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-3 px-1.5 py-0.5 rounded border border-line dark:border-line-dark">
                          تحتوي على {factor} قطعة
                        </span>
                      )}
                    </div>

                    {/* Stock status for this unit */}
                    <div className="flex items-center gap-2 mt-1 text-micro">
                      {isUnitOutOfStock ? (
                        <span className="text-danger dark:text-danger-bright font-bold">غير متوفر في المخزن</span>
                      ) : (
                        <span className="text-ink-muted dark:text-ink-dark-muted font-mono">
                          المتاح: <b className="text-ink dark:text-ink-dark">{availableUnits}</b> {formatUnitArabic(u.unitName)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price */}
                <div className="text-left shrink-0">
                  <div className="flex items-baseline gap-1 text-paid dark:text-paid-bright font-mono font-bold text-base">
                    <span>{formatArabicCurrency(unitSellPrice)}</span>
                  </div>
                  {u.barcode && (
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono block">
                      {u.barcode}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-canvas dark:bg-canvas-dark border-t border-line dark:border-line-dark flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted">
          <span>اختر الوحدة المطلوبة للبيع</span>
          <AppButton variant="secondary" size="md" onClick={onClose}>
            إلغاء
          </AppButton>
        </div>
      </div>
    </div>
  );
};
