import { UserCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import type { Customer } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';

interface CreditPaymentSectionProps {
  selectedCustomer: Customer | undefined;
  netTotalPiasters: number;
}

export const CreditPaymentSection = ({
  selectedCustomer,
  netTotalPiasters,
}: CreditPaymentSectionProps) => {
  if (!selectedCustomer) {
    return (
      <div className="bg-surface dark:bg-surface-dark p-4 rounded-lg border border-line dark:border-line-dark flex flex-col gap-3">
        <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl flex items-center gap-2.5 text-xs text-warn dark:text-warn-bright animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-warn dark:text-warn-bright shrink-0" />
          <div className="flex-1 font-bold">
            لتسجيل الفاتورة شكك (على الحساب)، يرجى تحديد الزبون من خانة «الزبون» بأعلى الشاشة.
          </div>
        </div>
      </div>
    );
  }

  const totalDebtAfterPiasters = selectedCustomer.balancePiasters + netTotalPiasters;
  const isOverLimit = selectedCustomer.creditLimitPiasters > 0 && totalDebtAfterPiasters > selectedCustomer.creditLimitPiasters;
  const isHighExistingDebt = selectedCustomer.balancePiasters >= 50000; // >= 500 EGP

  return (
    <div className="bg-surface p-4 rounded-lg border border-line flex flex-col gap-3">
      <div className="flex items-center justify-between hairline-b pb-2">
        <div className="text-xs font-bold text-ink flex items-center gap-1.5">
          <UserCheck className="w-4 h-4 text-brand" />
          <span>تسجيل الفاتورة بالكامل على حساب الزبون: <strong className="text-brand font-bold">{selectedCustomer.name}</strong></span>
        </div>
        {selectedCustomer.phone && (
          <span className="text-xs font-mono text-ink-muted" dir="ltr">{selectedCustomer.phone}</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="p-3 bg-surface-2 border border-line rounded-md grid grid-cols-3 gap-2 text-xs font-mono">
          <div>
            <span className="text-ink-muted block text-[10px]">حسابه القديم:</span>
            <strong className="text-ink">{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>
          </div>
          <div>
            <span className="text-ink-muted block text-[10px]">سقف الشكك المسموح:</span>
            <strong className="text-ink">
              {selectedCustomer.creditLimitPiasters > 0 ? formatArabicCurrency(selectedCustomer.creditLimitPiasters) : 'مفتوح (غير محدد)'}
            </strong>
          </div>
          <div>
            <span className="text-ink-muted block text-[10px]">إجمالي اللي عليه بعد الفاتورة:</span>
            <strong className={isOverLimit ? 'text-danger font-black' : 'text-brand font-bold'}>
              {formatArabicCurrency(totalDebtAfterPiasters)}
            </strong>
          </div>
        </div>

        {/* Prominent Warning Banner for High Debt / Over Limit */}
        {(isOverLimit || isHighExistingDebt) && (
          <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 animate-in fade-in ${
            isOverLimit
              ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
              : 'bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
          }`}>
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isOverLimit ? 'text-danger dark:text-danger-bright' : 'text-warn dark:text-warn-bright'}`} />
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="font-bold">
                {isOverLimit 
                  ? 'تحذير: الزبون عدى سقف الشكك المسموح بيه!' 
                  : 'تنبيه: الزبون عليه فلوس قديمة كتير!'}
              </span>
              <p className="m-0 text-[11px] leading-relaxed">
                {isOverLimit ? (
                  <>
                    الحساب هيزيد عن السقف المتفق عليه ({formatArabicCurrency(selectedCustomer.creditLimitPiasters)}) بمقدار <strong className="font-mono">{formatArabicCurrency(totalDebtAfterPiasters - selectedCustomer.creditLimitPiasters)}</strong>. الأفضل تطلب منه يدفع جزء كاش الأول.
                  </>
                ) : (
                  <>
                    الزبون ده عليه حساب قديم مسجل بمبلغ <strong className="font-mono">{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>.
                  </>
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
