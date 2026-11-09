import React, { useState } from 'react';
import { AppButton } from '../../components/AppButton';
import { Tag, X, AlertTriangle } from 'lucide-react';
import {
  formatArabicCurrency,
  normalizeArabicNumerals,
  calculateDiscountAmount
} from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { DiscountEntry, type DiscountType } from '../../components/discount/DiscountEntry';

interface PosInvoiceDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotalPiasters: number;
  currentUserRole: string;
  /** Holder of pos.discount_invoice; without it every invoice discount needs a supervisor PIN (enforced server-side). */
  canDiscountInvoice: boolean;
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
  canDiscountInvoice,
  maxDiscountPercentCashier,
  maxDiscountAmountCashierPiasters,
  onApplyDiscount,
  onRequestSupervisor,
}) => {
  const [discountInputEgp, setDiscountInputEgp] = useState('');
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<DiscountType>('amount');

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

      const requiresSupervisor = !canDiscountInvoice || (
        currentUserRole === 'cashier' &&
        (discountPct > maxDiscountPercentCashier || calculatedPiasters > maxDiscountAmountCashierPiasters));

      if (calculatedPiasters > 0 && requiresSupervisor) {
        onRequestSupervisor(
          canDiscountInvoice
            ? `خصم على الفاتورة يتجاوز حد الكاشير: ${(calculatedPiasters / 100).toFixed(2)} ج.م (${discountPct.toFixed(1)}%)`
            : `خصم على الفاتورة بدون صلاحية خصم الفاتورة: ${(calculatedPiasters / 100).toFixed(2)} ج.م (${discountPct.toFixed(1)}%)`,
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
  const reqSup = !canDiscountInvoice || (currentUserRole === 'cashier' &&
    (discountPct > maxDiscountPercentCashier || piastersVal > maxDiscountAmountCashierPiasters));
  const previewNet = Math.max(0, subtotalPiasters - piastersVal);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-md max-h-full flex flex-col overflow-hidden text-right text-ink dark:text-ink-dark select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line dark:border-line-dark shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">إضافة خصم على الفاتورة</h3>
          </div>
          <AppButton variant="subtle" size="md" icon={X} onClick={() => void requestClose()} aria-label="إغلاق" className="shrink-0" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
            <DiscountEntry
              type={invoiceDiscountType}
              onTypeChange={(next) => {
                setInvoiceDiscountType(next);
                setDiscountInputEgp('');
              }}
              value={discountInputEgp}
              onValueChange={setDiscountInputEgp}
              amountPresets={[5, 10, 20, 50]}
              percentPresets={[5, 10, 15, 20]}
              amountToggleLabel="مبلغ نقدي"
              percentToggleLabel="نسبة مئوية"
              amountFieldLabel="أدخل قيمة الخصم بالجنيه:"
              percentFieldLabel="أدخل نسبة الخصم:"
              resetLabel="إلغاء الخصم"
              inputId="invoice-discount-value"
            />

            {/* Supervisor Warning */}
            {reqSup && piastersVal > 0 && (
              <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/40 rounded-xl text-ink dark:text-warn-bright text-xs font-semibold flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                  <span>
                    {canDiscountInvoice
                      ? `الخصم يتجاوز صلاحية الكاشير (أقصى حد ${maxDiscountPercentCashier}% أو ${formatArabicCurrency(maxDiscountAmountCashierPiasters)})`
                      : 'حسابك لا يملك صلاحية خصم على إجمالي الفاتورة'}
                  </span>
                </span>
                <span className="font-bold whitespace-nowrap">مطلوب موافقة المشرف</span>
              </div>
            )}

            {/* Real-time Preview */}
            <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between gap-3 text-sm font-bold">
              <span className="text-ink-muted dark:text-ink-dark-muted">الصافي المطلوب بعد الخصم:</span>
              <span className="font-mono tabular-nums text-brand dark:text-brand-bright text-base">{formatArabicCurrency(previewNet)}</span>
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 shrink-0">
            <AppButton type="submit" variant="primary" size="lg" className="flex-1">
              تطبيق الخصم (Enter)
            </AppButton>
            <AppButton variant="secondary" size="lg" onClick={() => void requestClose()}>
              إلغاء (Esc)
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
