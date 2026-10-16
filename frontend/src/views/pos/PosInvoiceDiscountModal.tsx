import React, { useState } from 'react';
import { Tag, Banknote, Percent, X, AlertTriangle } from 'lucide-react';
import { 
  formatArabicCurrency, 
  normalizeArabicNumerals, 
  calculateDiscountAmount 
} from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';

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

  const isDirty = discountInputEgp.trim() !== '' && discountInputEgp.trim() !== '0';

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل خصم الفاتورة؟',
    confirmMessage: 'هناك قيمة خصم مدخلة على الفاتورة، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة الخصم',
  });

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
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-150 text-right select-none">
        <div className="flex items-center justify-between mb-4 pb-2 hairline-b">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-brand dark:text-brand-bright" />
            <h3 className="text-base font-bold text-ink dark:text-ink-dark m-0">إضافة خصم على الفاتورة</h3>
          </div>
          <button 
            type="button"
            onClick={() => void requestClose()}
            className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-1 rounded hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Type Toggle (Amount vs Percent) */}
          <div className="flex bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-lg border border-line dark:border-line-dark mb-3">
            <button
              type="button"
              onClick={() => {
                setInvoiceDiscountType('amount');
                setDiscountInputEgp('');
              }}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                invoiceDiscountType === 'amount'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
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
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              نسبة مئوية (%)
            </button>
          </div>

          <label className="block text-xs font-bold text-ink-muted dark:text-ink-dark-muted mb-1.5">
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
              className="w-full text-center text-3xl font-mono font-bold text-brand dark:text-brand-bright bg-surface-2 dark:bg-surface-dark-2 border-2 border-brand/50 dark:border-brand-bright/50 focus:border-brand dark:focus:border-brand-bright rounded-lg p-3 text-ink dark:text-ink-dark focus:outline-none shadow-inner"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted dark:text-ink-dark-muted font-sans">
              {invoiceDiscountType === 'amount' ? 'جنيه مصري' : '%'}
            </span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="mb-4">
            <span className="block text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted mb-1.5">اختصارات سريعة للخصم:</span>
            <div className="grid grid-cols-4 gap-1.5">
              {invoiceDiscountType === 'amount' ? (
                <>
                  {[5, 10, 20, 50].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDiscountInputEgp(String(val))}
                      className="h-8 rounded bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft/40 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
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
                      className="h-8 rounded bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-brand dark:hover:border-brand-bright hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft/40 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
                    >
                      {pct}%
                    </button>
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={() => setDiscountInputEgp('0')}
                className="col-span-4 h-8 rounded bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark hover:border-danger hover:text-danger hover:bg-danger-soft dark:hover:bg-danger/20 text-ink dark:text-ink-dark text-xs font-bold shadow-2xs transition-all hover:-translate-y-0.5"
              >
                إلغاء الخصم (0)
              </button>
            </div>
          </div>

          {/* Supervisor Warning */}
          {reqSup && piastersVal > 0 && (
            <div className="mb-3 p-2 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-lg text-warn dark:text-warn-bright text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                <span>الخصم يتجاوز صلاحية الكاشير (أقصى حد {maxDiscountPercentCashier}% أو {formatArabicCurrency(maxDiscountAmountCashierPiasters)})</span>
              </span>
              <span className="font-bold whitespace-nowrap mr-2">مطلوب موافقة المشرف</span>
            </div>
          )}

          {/* Real-time Preview */}
          <div className="p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between mb-4 text-xs font-bold">
            <span className="text-ink-muted dark:text-ink-dark-muted">الصافي المطلوب بعد الخصم:</span>
            <span className="font-mono text-brand dark:text-brand-bright text-sm">{formatArabicCurrency(previewNet)}</span>
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
              onClick={() => void requestClose()}
              className="px-4 h-10 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark font-semibold rounded-lg transition-colors cursor-pointer"
            >
              إلغاء (Esc)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
