import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import type { Customer } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';

interface CashPaymentSectionProps {
  receivedInput: string;
  onReceivedChange: (raw: string) => void;
  receivedInputRef: React.RefObject<HTMLInputElement | null>;
  netTotalPiasters: number;
  netPounds: number;
  quickPresets: number[];
  onSetPreset: (pounds: number) => void;
  isShortPayment: boolean;
  selectedCustomer: Customer | undefined;
  shortAmountPiasters: number;
  receivedPiasters: number;
  changeDuePiasters: number;
  onOpenQuickAddCustomer: () => void;
}

export const CashPaymentSection = ({
  receivedInput,
  onReceivedChange,
  receivedInputRef,
  netTotalPiasters,
  netPounds,
  quickPresets,
  onSetPreset,
  isShortPayment,
  selectedCustomer,
  shortAmountPiasters,
  receivedPiasters,
  changeDuePiasters,
  onOpenQuickAddCustomer,
}: CashPaymentSectionProps) => {
  return (
    <div className="flex flex-col gap-4 bg-surface p-4 rounded-lg border border-line">
      {/* Received Input & Quick Presets */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-ink flex items-center justify-between">
          <span>المبلغ المستلم من العميل (المدفوع نقداً):</span>
          <span className="text-[11px] text-ink-muted font-normal">يمكنك الضغط على الأزرار السريعة أو الكتابة</span>
        </label>

        <div className="relative">
          <input
            ref={receivedInputRef}
            type="text"
            value={receivedInput}
            onChange={(e) => onReceivedChange(e.target.value)}
            className="w-full h-[52px] px-4 text-2xl font-mono font-black text-brand bg-surface-2 border-2 border-brand/50 focus:border-brand rounded-lg text-right pl-16 focus:outline-hidden"
            placeholder="0.00"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm text-ink-muted">
            ج.م
          </div>
        </div>

        {/* Quick Presets Buttons (Feature #27 / Task 27-2) */}
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => onSetPreset(netPounds)}
            className="py-1.5 px-3 rounded text-xs font-bold bg-brand-soft text-brand hover:bg-brand hover:text-white border border-brand/30 transition-colors cursor-pointer"
          >
            المبلغ بالظبط ({formatArabicCurrency(netTotalPiasters)})
          </button>

          {quickPresets.filter(p => p !== netPounds).map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onSetPreset(amt)}
              className="py-1.5 px-3 rounded text-xs font-mono font-bold bg-surface-2 text-ink hover:bg-surface border border-line hover:border-brand/50 transition-colors cursor-pointer"
            >
              {amt.toFixed(2)} ج.م
            </button>
          ))}
        </div>
      </div>

      {/* Huge Change Due or Short Payment Debt Display (Feature #27 / Task 27-3) */}
      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
        isShortPayment
          ? selectedCustomer
            ? 'bg-amber-500/10 border-amber-400/50 text-amber-900 dark:text-amber-100'
            : 'bg-rose-500/10 border-rose-400/50 text-rose-900 dark:text-rose-100'
          : 'bg-paid-soft/80 border-paid-border text-paid'
      }`}>
        {isShortPayment ? (
          selectedCustomer ? (
            <>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  عجز الدفع (يُسجل كدين آجل):
                </span>
                <span className="text-2xl font-mono font-black mt-1 tabular-nums text-amber-900 dark:text-amber-100">
                  {formatArabicCurrency(shortAmountPiasters)}
                </span>
                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 mt-0.5">
                  على العميل: {selectedCustomer.name} (الدين السابق: {formatArabicCurrency(selectedCustomer.balancePiasters)})
                </span>
              </div>
              <div className="text-left text-xs font-medium max-w-[220px]">
                <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>سيُضاف {formatArabicCurrency(receivedPiasters)} للخزينة، والمتبقي كدين على العميل.</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                  عجز في الدفع:
                </span>
                <span className="text-2xl font-mono font-black mt-1 tabular-nums text-rose-900 dark:text-rose-200">
                  -{formatArabicCurrency(shortAmountPiasters)}
                </span>
                <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 mt-1">
                  ⚠️ لا يمكن إتمام دفع جزئي دون تحديد العميل لتسجيل الباقي كآجل.
                </span>
              </div>
              <div className="text-left text-xs font-medium shrink-0">
                <button
                  type="button"
                  onClick={onOpenQuickAddCustomer}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  + إضافة عميل سريع
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider">
                المبلغ المتبقي للعميل (الباقي):
              </span>
              <span className="text-3xl font-mono font-black mt-1 tabular-nums">
                {formatArabicCurrency(changeDuePiasters)}
              </span>
            </div>
            <div className="text-left text-xs font-medium max-w-[200px]">
              <span className="flex items-center gap-1.5 text-paid font-bold">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>صافي الحساب سليم وجاهز لتأكيد العملية والطباعة.</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
