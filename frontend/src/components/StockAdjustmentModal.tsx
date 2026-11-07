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
import { CustomSelect } from './CustomSelect';
import { RequiredMark } from './RequiredMark';
import type { Product } from '../types/models';
import { normalizeArabicNumerals } from '../utils/money';
import { formatUnitArabic } from '../utils/units';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

export type AdjustmentType = 'INVENTORY_DIFF' | 'DAMAGED' | 'EXPIRED' | 'GIFT_PROMOTION' | 'CORRECTION' | 'OTHER';

interface PresetReasonOption {
  label: string;
  type: AdjustmentType;
  defaultDirection?: 'negative' | 'positive';
}

const PRESET_OPTIONS: PresetReasonOption[] = [
  { label: 'عجز جرد دوري', type: 'INVENTORY_DIFF', defaultDirection: 'negative' },
  { label: 'زيادة جرد دوري', type: 'INVENTORY_DIFF', defaultDirection: 'positive' },
  { label: 'تلف بضاعة أو كسر', type: 'DAMAGED', defaultDirection: 'negative' },
  { label: 'انتهاء تاريخ الصلاحية', type: 'EXPIRED', defaultDirection: 'negative' },
  { label: 'هدايا وعينات ترويجية', type: 'GIFT_PROMOTION', defaultDirection: 'negative' },
  { label: 'تصحيح خطأ إدخال سابق', type: 'CORRECTION' },
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  product,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'actual' | 'delta'>('actual');
  const [actualStockInput, setActualStockInput] = useState('');
  const [deltaInput, setDeltaInput] = useState('');
  const [deltaSign, setDeltaSign] = useState<'+' | '-'>('-');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<AdjustmentType>('INVENTORY_DIFF');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isDirty = Boolean(actualStockInput.trim() || deltaInput.trim() || reason.trim());

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && Boolean(product),
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء تسوية المخزون؟',
    confirmMessage: 'تم إدخال بيانات تسوية للمنتج. هل أنت متأكد من الإلغاء والتراجع دون حفظ؟',
  });

  if (!isOpen || !product) return null;

  const isKg = product.unit === 'kg';
  const unitsList = product.units || [];
  const activeUnit = unitsList.find(u => u.id === selectedUnitId) || 
    unitsList.find(u => u.isBaseUnit) || 
    (unitsList.length > 0 ? unitsList[0] : null);
  const factor = activeUnit && activeUnit.conversionFactor > 0 ? activeUnit.conversionFactor : 1;
  const unitLabel = activeUnit ? formatUnitArabic(activeUnit.unitName) : (isKg ? 'كجم' : 'قطعة');

  const currentStockUnits = (product.stockQuantityMilli || 0) / 1000;
  const currentStockDisplay = isKg
    ? `${currentStockUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
    : `${Math.round(currentStockUnits)} قطعة`;

  let newStockMilli = product.stockQuantityMilli;
  let deltaMilli = 0;
  let isValidNumber = false;

  if (mode === 'actual') {
    const parsedActual = parseFloat(normalizeArabicNumerals(actualStockInput));
    isValidNumber = !isNaN(parsedActual) && actualStockInput.trim() !== '';
    if (isValidNumber) {
      newStockMilli = Math.round(parsedActual * factor * 1000);
      deltaMilli = newStockMilli - (product.stockQuantityMilli || 0);
    }
  } else {
    const parsedDelta = parseFloat(normalizeArabicNumerals(deltaInput));
    isValidNumber = !isNaN(parsedDelta) && deltaInput.trim() !== '' && parsedDelta > 0;
    if (isValidNumber) {
      const signedQty = deltaSign === '+' ? parsedDelta : -parsedDelta;
      deltaMilli = Math.round(signedQty * factor * 1000);
      newStockMilli = (product.stockQuantityMilli || 0) + deltaMilli;
    }
  }

  const deltaUnits = Math.abs(deltaMilli / 1000);
  const deltaDisplay = isKg
    ? `${deltaUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
    : `${Math.round(deltaUnits)} قطعة`;

  const newStockUnits = newStockMilli / 1000;
  const newStockDisplay = isKg
    ? `${newStockUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
    : `${Math.round(newStockUnits)} قطعة`;

  // Financial impact calculation (At Cost, or Price if cost is 0)
  const unitCost = (product.costPiasters && product.costPiasters > 0) ? product.costPiasters : (product.pricePiasters || 0);
  const estimatedImpactPiasters = Math.round((deltaMilli * unitCost) / 1000);
  const estimatedImpactDisplay = `${(Math.abs(estimatedImpactPiasters) / 100).toFixed(2)} ج.م`;

  const handleSelectPreset = (opt: PresetReasonOption) => {
    setReason(opt.label);
    setSelectedType(opt.type);
    if (opt.defaultDirection) {
      setDeltaSign(opt.defaultDirection === 'positive' ? '+' : '-');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidNumber) {
      setError(mode === 'actual' ? 'يرجى إدخال الرصيد الفعلي بعد الجرد بشكل صحيح' : 'يرجى إدخال الكمية المراد تسويتها بشكل صحيح');
      return;
    }

    if (newStockMilli < 0) {
      setError('لا يمكن أن يكون الرصيد الفعلي بعد التسوية سالباً');
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
        adjustmentType: selectedType,
        reason: reason.trim(),
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
    <div onClick={handleBackdropClick} className="fixed inset-0 bg-ink/40 dark:bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="bg-surface dark:bg-surface-dark rounded-lg hairline-all shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden border border-line dark:border-line-dark">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="t-modal-title text-ink dark:text-ink-dark leading-tight">تسوية جردية لصنف</h3>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-tight mt-0.5">{product.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-2 border border-transparent hover:border-line dark:hover:border-line-dark transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 rounded text-danger dark:text-danger-bright text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Stock Banner */}
          <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark flex items-center justify-between text-xs">
            <span className="text-ink-muted dark:text-ink-dark-muted">الرصيد الحالي المسجل في النظام:</span>
            <span className="font-mono font-bold text-ink dark:text-ink-dark text-sm">{currentStockDisplay}</span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex rounded-lg bg-surface-2 dark:bg-surface-dark-2 p-1 border border-line dark:border-line-dark text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('actual');
                setError('');
              }}
              className={`flex-1 py-1.5 rounded-md transition-all text-center cursor-pointer ${
                mode === 'actual'
                  ? 'bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              الرصيد الفعلي بعد الجرد
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('delta');
                setError('');
              }}
              className={`flex-1 py-1.5 rounded-md transition-all text-center cursor-pointer ${
                mode === 'delta'
                  ? 'bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              إضافة أو خصم كمية (+ / -)
            </button>
          </div>

          {/* Counted Stock or Delta Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-ink dark:text-ink-dark block">
                {mode === 'actual' ? 'الرصيد الفعلي بعد الجرد' : 'الكمية المراد تسويتها'} <RequiredMark />
              </label>
              {unitsList.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted">الوحدة:</span>
                  <CustomSelect
                    value={activeUnit?.id || ''}
                    onChange={(val) => setSelectedUnitId(val)}
                    options={unitsList.map((u) => ({
                      value: u.id || '',
                      label: `${formatUnitArabic(u.unitName)} (×${u.conversionFactor})`
                    }))}
                    className="w-36"
                    size="sm"
                  />
                </div>
              )}
            </div>

            {mode === 'actual' ? (
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
                  className="w-full h-10 px-3 font-mono text-sm font-bold text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded focus:border-brand dark:focus:border-brand-bright focus:outline-none placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                />
                <span className="absolute left-3 top-2.5 text-xs text-ink-muted dark:text-ink-dark-muted font-bold">
                  {unitLabel}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex rounded border border-line dark:border-line-dark overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setDeltaSign('-')}
                    className={`px-3 h-10 font-bold text-sm cursor-pointer transition-colors ${
                      deltaSign === '-'
                        ? 'bg-danger text-white dark:bg-danger dark:text-white'
                        : 'bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-3'
                    }`}
                    title="خصم / عجز / تالف (-)"
                  >
                    - خصم
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeltaSign('+')}
                    className={`px-3 h-10 font-bold text-sm cursor-pointer transition-colors ${
                      deltaSign === '+'
                        ? 'bg-paid text-white dark:bg-paid dark:text-white'
                        : 'bg-surface dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-3'
                    }`}
                    title="إضافة / زيادة جرد (+)"
                  >
                    + إضافة
                  </button>
                </div>
                <div className="relative flex-1">
                  <input
                    type="text"
                    autoFocus
                    placeholder={isKg ? 'مثال: 2.5' : 'مثال: 5'}
                    value={deltaInput}
                    onChange={(e) => {
                      setDeltaInput(normalizeArabicNumerals(e.target.value));
                      setError('');
                    }}
                    className="w-full h-10 px-3 font-mono text-sm font-bold text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded focus:border-brand dark:focus:border-brand-bright focus:outline-none placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-ink-muted dark:text-ink-dark-muted font-bold">
                    {unitLabel}
                  </span>
                </div>
              </div>
            )}

            {isValidNumber && factor > 1 && (
              <p className="text-micro text-brand dark:text-brand-bright font-bold mt-1">
                يعادل: {Math.abs(mode === 'actual' ? (parseFloat(actualStockInput) || 0) * factor : (parseFloat(deltaInput) || 0) * factor)} قطعة أساسية
              </p>
            )}
          </div>

          {/* Live Delta & Financial Impact Preview */}
          {isValidNumber && (
            <div className={`p-3 rounded border text-xs flex flex-col gap-1.5 ${
              deltaMilli === 0 
                ? 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted'
                : deltaMilli > 0
                ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid-dark-border text-paid dark:text-paid-bright'
                : 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/20 text-danger dark:text-danger-bright'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-1.5">
                  {deltaMilli > 0 ? (
                    <>
                      <ArrowUpRight className="w-4 h-4 shrink-0" />
                      <span>زيادة جردية:</span>
                    </>
                  ) : deltaMilli < 0 ? (
                    <>
                      <ArrowDownLeft className="w-4 h-4 shrink-0" />
                      <span>عجز وتالف جردي:</span>
                    </>
                  ) : (
                    <span>لا يوجد أي تغيير في الرصيد:</span>
                  )}
                </div>
                <span className="font-mono font-bold text-sm" dir="ltr">
                  {deltaMilli > 0 ? `+${deltaDisplay}` : deltaMilli < 0 ? `-${deltaDisplay}` : '0'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-line/40 dark:border-line-dark/40 text-micro font-medium">
                <span className="text-ink-muted dark:text-ink-dark-muted">الرصيد النهائي الناتج:</span>
                <span className="font-mono font-bold text-ink dark:text-ink-dark text-xs">{newStockDisplay}</span>
              </div>

              {deltaMilli !== 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-line/40 dark:border-line-dark/40 text-micro font-medium opacity-90">
                  <span>الأثر المالي المتوقع (بالتكلفة):</span>
                  <span className="font-mono font-bold text-xs">
                    {deltaMilli > 0 ? `+${estimatedImpactDisplay} (إضافة لقيمة المخزون)` : `-${estimatedImpactDisplay} (خسارة عجز وتالف)`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Preset Reason Tags & Adjustment Types (Task 37-1) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-ink dark:text-ink-dark block">
              سبب ونوع التسوية الجردية <RequiredMark />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => handleSelectPreset(opt)}
                  className={`px-2.5 py-1 rounded text-micro font-medium transition-colors cursor-pointer ${
                    reason === opt.label
                      ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright font-bold shadow-2xs dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                      : 'bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:border-brand/40 dark:hover:border-brand-bright/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="أو اكتب سبباً مخصصاً للتسوية لتوثيقه..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-9 px-3 text-xs text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded focus:border-brand dark:focus:border-brand-bright focus:outline-none placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 mt-1"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-line dark:border-line-dark flex items-center justify-end gap-2 mt-auto shrink-0">
            <button
              type="button"
              onClick={requestClose}
              className="h-9 px-4 rounded bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-xs font-semibold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading || !isValidNumber || deltaMilli === 0}
              className="h-9 px-5 rounded bg-brand dark:bg-brand-bright text-white dark:text-surface-dark hover:bg-brand-hover dark:hover:bg-brand-bright/90 disabled:opacity-50 dark:disabled:opacity-100 dark:disabled:bg-surface-dark-3 dark:disabled:text-ink-dark-muted dark:disabled:border-line-dark text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
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
