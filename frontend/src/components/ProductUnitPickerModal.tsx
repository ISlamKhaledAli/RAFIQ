import React, { useEffect, useCallback, useMemo } from 'react';
import { Package, X, Check } from 'lucide-react';
import type { Product, ProductUnit } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

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
        className="w-full max-w-md bg-surface rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-dark text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300 border border-white/10">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>اختيار وحدة البيع</span>
                <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full font-mono text-emerald-200">
                  {units.length} وحدات
                </span>
              </h3>
              <p className="text-xs text-white/80 font-medium truncate max-w-[260px]" title={product.name}>
                {product.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Units List */}
        <div className="p-4 flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto">
          <p className="text-[11px] text-ink-muted font-semibold mb-1">
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
                    ? 'bg-paid-soft hover:bg-paid-soft/80 border-paid/30 hover:border-paid'
                    : 'bg-surface hover:bg-canvas border-line hover:border-paid'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Shortcut Badge */}
                  <span className="w-6 h-6 rounded-md bg-brand-dark text-white text-xs font-bold font-mono flex items-center justify-center shrink-0 shadow-2xs">
                    {idx + 1}
                  </span>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink group-hover:text-paid transition-colors">
                        {u.unitName}
                      </span>
                      {u.isBaseUnit ? (
                        <span className="text-[10px] font-bold bg-paid text-white px-2 py-0.5 rounded-md flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          <span>الوحدة الأساسية</span>
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-medium text-ink-muted bg-surface-2 px-1.5 py-0.5 rounded border border-line">
                          تحتوي على {factor} قطعة
                        </span>
                      )}
                    </div>

                    {/* Stock status for this unit */}
                    <div className="flex items-center gap-2 mt-1 text-[11px]">
                      {isUnitOutOfStock ? (
                        <span className="text-danger font-bold">غير متوفر في المخزن</span>
                      ) : (
                        <span className="text-ink-muted font-mono">
                          المتاح: <b className="text-ink">{availableUnits}</b> {u.unitName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price */}
                <div className="text-left shrink-0">
                  <div className="flex items-baseline gap-1 text-paid font-mono font-bold text-base">
                    <span>{formatArabicCurrency(unitSellPrice)}</span>
                  </div>
                  {u.barcode && (
                    <span className="text-[10px] text-ink-muted font-mono block">
                      {u.barcode}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-canvas border-t border-line flex items-center justify-between text-xs text-ink-muted">
          <span>اختر الوحدة المطلوبة للبيع</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface-2 text-ink font-bold transition-colors cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};
