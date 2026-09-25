import React, { useState } from 'react';
import { 
  Scale, 
  X, 
  Check, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product } from '../types/models';
import { normalizeArabicNumerals } from '../utils/money';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

const PRESET_REASONS = [
  'عجز جرد شهري',
  'تلف بضاعة أو كسر',
  'انتهاء تاريخ الصلاحية',
  'زيادة جرد غير مقيدة',
  'هدايا وعينات ترويجية',
  'تصحيح خطأ إدخال سابق',
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  product,
  onSuccess,
}) => {
  const [actualStockInput, setActualStockInput] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !product) return null;

  const isKg = product.unit === 'kg';
  const unitsList = product.units || [];
  const activeUnit = unitsList.find(u => u.id === selectedUnitId) || 
    unitsList.find(u => u.isBaseUnit) || 
    (unitsList.length > 0 ? unitsList[0] : null);
  const factor = activeUnit && activeUnit.conversionFactor > 0 ? activeUnit.conversionFactor : 1;
  const unitLabel = activeUnit ? activeUnit.unitName : (isKg ? 'كجم' : 'قطعة');

  const currentStockUnits = (product.stockQuantityMilli || 0) / 1000;
  const currentStockDisplay = isKg
    ? `${currentStockUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
    : `${Math.round(currentStockUnits)} قطعة`;

  // Parse actual entered stock in chosen unit and convert to base milli
  const parsedActual = parseFloat(normalizeArabicNumerals(actualStockInput));
  const isValidNumber = !isNaN(parsedActual) && actualStockInput.trim() !== '';
  const newStockMilli = isValidNumber ? Math.round(parsedActual * factor * 1000) : product.stockQuantityMilli;
  const deltaMilli = newStockMilli - (product.stockQuantityMilli || 0);
  const deltaUnits = Math.abs(deltaMilli / 1000);
  const deltaDisplay = isKg
    ? `${deltaUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
    : `${Math.round(deltaUnits)} قطعة`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidNumber) {
      setError('يرجى إدخال الرصيد الفعلي بعد الجرد بشكل صحيح');
      return;
    }

    if (newStockMilli < 0) {
      setError('لا يمكن أن يكون الرصيد الفعلي سالباً');
      return;
    }

    if (deltaMilli === 0) {
      setError('الرصيد الفعلي المدخل مطابق تماماً للرصيد الحالي المسجل في النظام');
      return;
    }

    if (!reason.trim()) {
      setError('يرجى تحديد سبب التسوية الجردية لتوثيقها في السجل المالي');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await invoke('inventory:adjustStock', {
        productId: product.id,
        newStockQuantityMilli: newStockMilli,
        reason: reason.trim(),
        userId: 'admin',
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل حفظ التسوية: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="bg-surface rounded-lg hairline-all shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-ink leading-tight">تسوية جردية لصنف</h3>
              <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{product.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-danger-soft border border-danger/30 rounded text-danger text-[12px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Stock Banner */}
          <div className="p-3 bg-surface-2 rounded border border-line flex items-center justify-between text-[12px]">
            <span className="text-ink-muted">الرصيد الحالي المسجل في النظام:</span>
            <span className="font-mono font-bold text-ink text-[13px]">{currentStockDisplay}</span>
          </div>

          {/* Actual Counted Stock Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold text-ink block">
                الرصيد الفعلي بالجرد <span className="text-danger">*</span>
              </label>
              {unitsList.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-ink-muted">وحدة العد:</span>
                  <select
                    value={activeUnit ? activeUnit.id : ''}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="h-6 px-1.5 bg-surface-2 border border-line text-brand text-[11px] font-bold rounded focus:outline-none"
                  >
                    {unitsList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitName} (×{u.conversionFactor})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder={isKg ? 'مثال: 8.5' : 'مثال: 12'}
                value={actualStockInput}
                onChange={(e) => {
                  setActualStockInput(normalizeArabicNumerals(e.target.value));
                  setError('');
                }}
                className="w-full h-10 px-3 font-mono text-[14px] font-bold text-ink bg-surface border border-line rounded focus:border-brand focus:outline-none"
              />
              <span className="absolute left-3 top-2.5 text-xs text-ink-muted font-bold">
                {unitLabel}
              </span>
            </div>

            {isValidNumber && factor > 1 && (
              <p className="text-[11px] text-brand font-bold mt-1">
                يعادل: {parsedActual * factor} قطعة في المخزن
              </p>
            )}
          </div>

          {/* Live Delta Preview */}
          {isValidNumber && (
            <div className={`p-3 rounded border text-[12px] flex items-center justify-between ${
              deltaMilli === 0 
                ? 'bg-surface-2 border-line text-ink-muted'
                : deltaMilli > 0
                ? 'bg-paid-soft border-paid/20 text-paid'
                : 'bg-danger-soft border-danger/20 text-danger'
            }`}>
              <div className="flex items-center gap-1.5 font-bold">
                {deltaMilli > 0 ? (
                  <>
                    <ArrowUpRight className="w-4 h-4" />
                    <span>زيادة جردية:</span>
                  </>
                ) : deltaMilli < 0 ? (
                  <>
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>عجز جردي:</span>
                  </>
                ) : (
                  <span>لا يوجد أي تغيير:</span>
                )}
              </div>
              <span className="font-mono font-bold text-[13px]" dir="ltr">
                {deltaMilli > 0 ? `+${deltaDisplay}` : deltaMilli < 0 ? `-${deltaDisplay}` : '0'}
              </span>
            </div>
          )}

          {/* Preset Reason Tags */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-ink block">
              سبب التسوية الجردية <span className="text-danger">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    reason === r
                      ? 'bg-brand text-on-brand font-bold'
                      : 'bg-surface-2 border border-line text-ink-muted hover:text-ink hover:border-brand/40'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="أو اكتب سبباً مخصصاً للتسوية..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-9 px-3 text-[12px] text-ink bg-surface border border-line rounded focus:border-brand focus:outline-none mt-1"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-line flex items-center justify-end gap-2 mt-auto shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded bg-surface border border-line text-ink hover:bg-surface-2 text-[12px] font-semibold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading || !isValidNumber || deltaMilli === 0}
              className="h-9 px-5 rounded bg-brand text-on-brand hover:bg-brand-hover disabled:opacity-50 text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>اعتماد وحفظ التسوية</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
