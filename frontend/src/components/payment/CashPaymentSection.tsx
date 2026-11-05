import React from 'react';
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

const PRESET_BASE =
  'h-11 px-3 rounded-lg border text-sm font-bold tabular-nums transition-colors cursor-pointer active:scale-95 whitespace-nowrap';
const PRESET_IDLE =
  'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border-line dark:border-line-dark hover:bg-brand-soft dark:hover:bg-brand-dark-soft hover:border-brand/50 dark:hover:border-brand-bright/50';
const PRESET_SELECTED = 'bg-brand text-white border-brand dark:bg-brand-container dark:border-brand-bright';

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
          <button
            type="button"
            onClick={() => onSetPreset(netTotalPiasters)}
            aria-pressed={receivedPiasters === netTotalPiasters}
            className={`${PRESET_BASE} ${
              receivedPiasters === netTotalPiasters
                ? PRESET_SELECTED
                : 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/40 dark:border-brand-bright/40 hover:bg-brand hover:text-white dark:hover:bg-brand dark:hover:text-white'
            }`}
            title="استلام إجمالي الفاتورة بالضبط نقداً"
          >
            المبلغ بالظبط
          </button>

          {quickPresetsPiasters.filter((p) => p !== netTotalPiasters).map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onSetPreset(amt)}
              aria-pressed={receivedPiasters === amt}
              className={`${PRESET_BASE} ${receivedPiasters === amt ? PRESET_SELECTED : PRESET_IDLE}`}
            >
              {(amt / 100).toFixed(2)} ج.م
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onQuickFullCredit}
          aria-pressed={isCreditActive}
          className={`h-11 w-full px-4 rounded-lg border-2 text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99] text-ink dark:text-ink-dark ${
            isCreditActive
              ? 'bg-warn-soft dark:bg-warn-dark-soft border-warn dark:border-warn-bright'
              : 'bg-surface dark:bg-surface-dark border-dashed border-warn/60 dark:border-warn-bright/50 hover:bg-warn-soft dark:hover:bg-warn-dark-soft'
          }`}
          title="تسجيل الفاتورة على حساب العميل بالكامل (0 كاش مستلم)"
        >
          <UserCheck className="w-4 h-4 shrink-0 text-warn dark:text-warn-bright" />
          <span>على الحساب بالكامل (بدون كاش)</span>
        </button>
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
