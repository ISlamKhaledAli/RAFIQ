import React, { useState } from 'react';
import { Tag, Banknote, Percent, X, AlertTriangle } from 'lucide-react';
import { 
  formatArabicCurrency, 
  normalizeArabicNumerals, 
  calculateDiscountAmount 
} from '../../utils/money';

interface PosInvoiceDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotalPiasters: number;
  currentUserRole: string;
  maxDiscountPercentCashier: number;
  maxDiscountAmountCashierPiasters: number;
  onApplyDiscount: (piasters: number, supervisorApproved: boolean) => void;
  onRequestSupervisor: (title: string, onApproved: () => void) => void;
}

export const PosInvoiceDiscountModal: React.FC<PosInvoiceDiscountModalProps> = ({
  isOpen,
  onClose,
  subtotalPiasters,
  currentUserRole,
  maxDiscountPercentCashier,
  maxDiscountAmountCashierPiasters,
  onApplyDiscount,
  onRequestSupervisor,
}) => {
  const [discountInputEgp, setDiscountInputEgp] = useState('');
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<'amount' | 'percent'>('amount');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(normalizeArabicNumerals(discountInputEgp.trim()));
    if (!isNaN(num) && num >= 0) {
      const calculatedPiasters = calculateDiscountAmount(subtotalPiasters, invoiceDiscountType, num);
      const discountPct = subtotalPiasters > 0 ? (calculatedPiasters / subtotalPiasters) * 100 : 0;

      const requiresSupervisor =
        currentUserRole === 'cashier' &&
        (discountPct > maxDiscountPercentCashier || calculatedPiasters > maxDiscountAmountCashierPiasters);

      if (calculatedPiasters > 0 && requiresSupervisor) {
        onRequestSupervisor(
          `خصم على الفاتورة يتجاوز حد الكاشير: ${(calculatedPiasters / 100).toFixed(2)} ج.م (${discountPct.toFixed(1)}%)`,
          () => {
            onApplyDiscount(calculatedPiasters, true);
          }
        );
      } else {
        onApplyDiscount(calculatedPiasters, false);
      }
    }
    onClose();
  };

  const parsed = parseFloat(normalizeArabicNumerals(discountInputEgp.trim())) || 0;
  const piastersVal = calculateDiscountAmount(subtotalPiasters, invoiceDiscountType, parsed);
  const discountPct = subtotalPiasters > 0 ? (piastersVal / subtotalPiasters) * 100 : 0;
  const reqSup = currentUserRole === 'cashier' &&
    (discountPct > maxDiscountPercentCashier || piastersVal > maxDiscountAmountCashierPiasters);
  const previewNet = Math.max(0, subtotalPiasters - piastersVal);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-150 text-right select-none">
        <div className="flex items-center justify-between mb-4 pb-2 hairline-b">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-brand" />
            <h3 className="text-base font-bold text-ink m-0">إضافة خصم على الفاتورة</h3>
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
          {/* Type Toggle (Amount vs Percent) */}
          <div className="flex bg-surface-2 p-1 rounded-lg border border-line mb-3">
            <button
              type="button"
              onClick={() => {
                setInvoiceDiscountType('amount');
                setDiscountInputEgp('');
              }}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                invoiceDiscountType === 'amount'
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
                setInvoiceDiscountType('percent');
                setDiscountInputEgp('');
              }}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                invoiceDiscountType === 'percent'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              نسبة مئوية (%)
            </button>
          </div>

          <label className="block text-xs font-bold text-ink-muted mb-1.5">
            {invoiceDiscountType === 'amount' ? 'أدخل قيمة الخصم المالي بالجنيه (ج.م):' : 'أدخل نسبة الخصم المئوية (%):'}
          </label>
          <div className="relative mb-3">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              value={discountInputEgp}
              onChange={(e) => {
                const norm = normalizeArabicNumerals(e.target.value);
                if (/^[0-9]*\.?[0-9]{0,2}$/.test(norm)) {
                  setDiscountInputEgp(norm);
                }
              }}
              className="w-full text-center text-3xl font-mono font-bold text-brand bg-surface-2 border-2 border-brand/50 focus:border-brand rounded-lg p-3 text-ink focus:outline-none shadow-inner"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted font-sans">
              {invoiceDiscountType === 'amount' ? 'جنيه مصري' : '%'}
            </span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="mb-4">
            <span className="block text-[11px] font-bold text-ink-muted mb-1.5">اختصارات سريعة للخصم:</span>
            <div className="grid grid-cols-4 gap-1.5">
              {invoiceDiscountType === 'amount' ? (
                <>
                  {[5, 10, 20, 50].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDiscountInputEgp(String(val))}
                      className="h-8 rounded bg-surface border border-line hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-ink text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
                    >
                      {val} ج.م
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {[5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountInputEgp(String(pct))}
                      className="h-8 rounded bg-surface border border-line hover:border-brand hover:text-brand hover:bg-brand-soft/40 text-ink text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
                    >
                      {pct}%
                    </button>
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={() => setDiscountInputEgp('0')}
                className="col-span-4 h-8 rounded bg-surface border border-line hover:border-danger hover:text-danger hover:bg-danger-soft text-ink text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
              >
                إلغاء الخصم (0)
              </button>
            </div>
          </div>

          {/* Supervisor Warning */}
          {reqSup && piastersVal > 0 && (
            <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>الخصم يتجاوز صلاحية الكاشير (أقصى حد {maxDiscountPercentCashier}% أو {formatArabicCurrency(maxDiscountAmountCashierPiasters)})</span>
              </span>
              <span className="font-bold whitespace-nowrap mr-2">مطلوب موافقة المشرف</span>
            </div>
          )}

          {/* Real-time Preview */}
          <div className="p-2.5 rounded-lg bg-surface-2 border border-line flex items-center justify-between mb-4 text-xs font-bold">
            <span className="text-ink-muted">الصافي المطلوب بعد الخصم:</span>
            <span className="font-mono text-brand text-sm">{formatArabicCurrency(previewNet)}</span>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 h-10 bg-brand hover:bg-brand-hover text-white font-bold rounded-lg transition-colors shadow-xs"
            >
              تطبيق الخصم (Enter)
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
