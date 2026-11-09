import React from 'react';
import { AppButton } from '../AppButton';
import { UserCheck } from 'lucide-react';
import type { Customer } from '../../types/models';
import { PaymentStatusCard } from './PaymentStatusCard';

interface CashPaymentSectionProps {
  receivedInput: string;
  onReceivedChange: (raw: string) => void;
  receivedInputRef: React.RefObject<HTMLInputElement | null>;
  netTotalPiasters: number;
  quickPresetsPiasters: number[];
  onSetPreset: (piasters: number) => void;
  isShortPayment: boolean;
  selectedCustomer: Customer | undefined;
  shortAmountPiasters: number;
  receivedPiasters: number;
  changeDuePiasters: number;
  onQuickFullCredit: () => void;
  isFullCreditMode: boolean;
  saveChangeToCustomerAccount: boolean;
  onToggleSaveChangeToCustomerAccount: (v: boolean) => void;
}

export const CashPaymentSection: React.FC<CashPaymentSectionProps> = ({
  receivedInput,
  onReceivedChange,
  receivedInputRef,
  netTotalPiasters,
  quickPresetsPiasters,
  onSetPreset,
  isShortPayment,
  selectedCustomer,
  shortAmountPiasters,
  receivedPiasters,
  changeDuePiasters,
  onQuickFullCredit,
  isFullCreditMode,
  saveChangeToCustomerAccount,
  onToggleSaveChangeToCustomerAccount,
}) => {
  const hasRegisteredCustomer = !!(selectedCustomer && selectedCustomer.id !== 'cust_general_cash');
  const isCreditActive = isFullCreditMode || (receivedPiasters === 0 && hasRegisteredCustomer);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <section
        aria-label="المبلغ المستلم"
        className="shrink-0 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-4 flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <label htmlFor="payment-received-input" className="t-card-title text-ink dark:text-ink-dark">
            المبلغ المستلم من العميل (المدفوع نقداً):
          </label>
          <span className="text-xs text-ink-muted dark:text-ink-dark-muted">اضغط على المبالغ الجاهزة أو اكتب المبلغ</span>
        </div>

        <div className="relative">
          <input
            id="payment-received-input"
            ref={receivedInputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={receivedInput}
            onChange={(e) => onReceivedChange(e.target.value)}
            className="w-full h-14 px-4 pl-16 text-2xl font-mono font-black tabular-nums text-right text-brand dark:text-brand-bright bg-surface-2 dark:bg-surface-dark-2 border-2 border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 dark:focus:ring-brand-bright/25 placeholder:text-sm placeholder:font-sans placeholder:font-normal placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted"
            placeholder="اكتب المبلغ المستلم"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm text-ink-muted dark:text-ink-dark-muted pointer-events-none">
            ج.م
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <AppButton
            variant={receivedPiasters === netTotalPiasters ? 'primary' : 'soft'}
            size="lg"
            onClick={() => onSetPreset(netTotalPiasters)}
            aria-pressed={receivedPiasters === netTotalPiasters}
            title="استلام إجمالي الفاتورة بالضبط نقداً"
          >
            المبلغ بالظبط
          </AppButton>

          {quickPresetsPiasters.filter((p) => p !== netTotalPiasters).map((amt) => (
            <AppButton
              key={amt}
              variant={receivedPiasters === amt ? 'primary' : 'secondary'}
              size="lg"
              className="tabular-nums"
              onClick={() => onSetPreset(amt)}
              aria-pressed={receivedPiasters === amt}
            >
              {(amt / 100).toFixed(2)} ج.م
            </AppButton>
          ))}
        </div>

        <AppButton
          variant={isCreditActive ? 'warningSoft' : 'secondary'}
          size="lg"
          fullWidth
          icon={UserCheck}
          onClick={onQuickFullCredit}
          aria-pressed={isCreditActive}
          title="تسجيل الفاتورة على حساب العميل بالكامل (0 كاش مستلم)"
        >
          على الحساب بالكامل (بدون كاش)
        </AppButton>
      </section>

      <div className="flex-1 min-h-0">
        <PaymentStatusCard
          selectedCustomer={selectedCustomer}
          hasRegisteredCustomer={hasRegisteredCustomer}
          isCreditActive={isCreditActive}
          isShortPayment={isShortPayment}
          receivedPiasters={receivedPiasters}
          shortAmountPiasters={shortAmountPiasters}
          changeDuePiasters={changeDuePiasters}
          netTotalPiasters={netTotalPiasters}
          saveChangeToCustomerAccount={saveChangeToCustomerAccount}
          onToggleSaveChangeToCustomerAccount={onToggleSaveChangeToCustomerAccount}
        />
      </div>
    </div>
  );
};
