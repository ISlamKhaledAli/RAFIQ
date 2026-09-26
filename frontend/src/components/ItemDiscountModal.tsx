import React, { useState } from 'react';
import { X, Tag, Percent, Banknote } from 'lucide-react';
import { formatArabicCurrency, normalizeArabicNumerals, calculateDiscountAmount } from '../utils/money';
import type { SaleItem } from '../types/models';

interface ItemDiscountModalProps {
  isOpen: boolean;
  item: SaleItem | null;
  itemIndex: number | null;
  userRole?: string;
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
  maxPercentWithoutPin = 10,
  maxAmountWithoutPinPiasters = 5000,
  onClose,
  onApply,
  onRequestSupervisor,
}) => {
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [inputValue, setInputValue] = useState(() => {
    return item && item.discountPiasters > 0 ? (item.discountPiasters / 100).toFixed(2) : '';
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

  const requiresSupervisor =
    userRole === 'cashier' &&
    (discountPercentCalculated > maxPercentWithoutPin ||
      calculatedDiscountPiasters > maxAmountWithoutPinPiasters);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (calculatedDiscountPiasters > 0 && requiresSupervisor) {
      onRequestSupervisor(
        `خصم على صنف (${item.productName}) يتجاوز الحد المسموح: ${(calculatedDiscountPiasters / 100).toFixed(2)} ج.م (${discountPercentCalculated.toFixed(1)}%)`,
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-md p-5 animate-in fade-in zoom-in-95 duration-150 text-right select-none">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center font-bold">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink m-0">خصم خاص على الصنف</h3>
              <p className="text-[11px] text-ink-muted m-0 truncate max-w-[260px]">
                {item.productName} ({formatArabicCurrency(grossPiasters)})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink p-1 rounded hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Type Toggle */}
          <div className="flex bg-surface-2 p-1 rounded-lg border border-line mb-3">
            <button
              type="button"
              onClick={() => {
                setDiscountType('amount');
                setInputValue('');
              }}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                discountType === 'amount'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              مبلغ نقدي (ج.م)
            </button>
            <button
              type="button"
              onClick={() => {
                setDiscountType('percent');
                setInputValue('');
              }}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                discountType === 'percent'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              نسبة مئوية (%)
            </button>
          </div>

          {/* Input Field */}
          <label className="block text-xs font-bold text-ink-muted mb-1.5">
            {discountType === 'amount' ? 'أدخل قيمة الخصم بالجنيه:' : 'أدخل نسبة الخصم المئوية (%):'}
          </label>
          <div className="relative mb-3">
            <input
              type="text"
              autoFocus
              placeholder="0"
              value={inputValue}
              onChange={(e) => setInputValue(normalizeArabicNumerals(e.target.value))}
              className="w-full text-center text-3xl font-mono font-bold text-brand bg-surface-2 border-2 border-brand/50 focus:border-brand rounded-lg p-3 text-ink focus:outline-none shadow-inner"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">
              {discountType === 'amount' ? 'ج.م' : '%'}
            </span>
          </div>

          {/* Quick Buttons */}
          <div className="mb-4">
            <span className="block text-[11px] font-bold text-ink-muted mb-1.5">اختصارات سريعة:</span>
            <div className="grid grid-cols-4 gap-1.5">
              {discountType === 'amount' ? (
                <>
                  {[1, 2, 5, 10].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setInputValue(String(amt))}
                      className="h-8 rounded bg-surface border border-slate-300 hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-slate-700 text-xs font-bold shadow-2xs transition-all"
                    >
                      {amt} ج.م
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {[5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setInputValue(String(pct))}
                      className="h-8 rounded bg-surface border border-slate-300 hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-slate-700 text-xs font-bold shadow-2xs transition-all"
                    >
                      {pct}%
                    </button>
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={() => setInputValue('0')}
                className="col-span-4 h-8 rounded bg-surface border border-slate-300 hover:border-red-500 hover:text-red-600 hover:bg-red-50 text-slate-700 text-xs font-bold shadow-2xs transition-all"
              >
                إلغاء الخصم (0)
              </button>
            </div>
          </div>

          {/* Supervisor Warning Badge */}
          {requiresSupervisor && (
            <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between">
              <span>⚠️ يتطلب موافقة المشرف (أعلى من {maxPercentWithoutPin}%)</span>
              <span className="font-bold">مطلوب PIN</span>
            </div>
          )}

          {/* Real-time Preview */}
          <div className="p-2.5 rounded-lg bg-surface-2 border border-line flex items-center justify-between mb-4 text-xs font-bold">
            <span className="text-ink-muted">سعر الصنف بعد الخصم:</span>
            <span className="font-mono text-brand text-sm">{formatArabicCurrency(netPreviewPiasters)}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 h-10 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg transition-colors shadow-xs"
            >
              تأكيد الخصم (Enter)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-10 bg-surface hover:bg-surface-2 border border-line text-ink font-semibold rounded-lg transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
