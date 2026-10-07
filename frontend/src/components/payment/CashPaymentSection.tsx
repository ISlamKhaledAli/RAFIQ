import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
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
}

export const CashPaymentSection: React.FC<CashPaymentSectionProps> = ({
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
}) => {
  return (
    <div className="flex flex-col gap-4 bg-surface p-4 rounded-lg border border-line">
      {/* Received Input & Quick Presets */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-ink flex items-center justify-between whitespace-nowrap">
          <span>المبلغ المستلم من العميل (المدفوع نقداً):</span>
          <span className="text-[11px] text-ink-muted font-normal whitespace-nowrap">يمكنك الضغط على الأزرار السريعة أو كتابة المبلغ</span>
        </label>

        <div className="relative">
          <input
            ref={receivedInputRef}
            type="text"
            value={receivedInput}
            onChange={(e) => onReceivedChange(e.target.value)}
            className="w-full h-[52px] px-4 text-2xl font-mono font-black text-brand bg-surface-2 border-2 border-brand/50 focus:border-brand rounded-lg text-right pl-16 focus:outline-none"
            placeholder="0.00"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm text-ink-muted">
            ج.م
          </div>
        </div>

        {/* Quick Presets Buttons (Feature #27 / Task 27-2) */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <button
            type="button"
            onClick={() => onSetPreset(netPounds)}
            className="py-1.5 px-3 rounded text-xs font-bold bg-brand-soft text-brand hover:bg-brand hover:text-white border border-brand/30 transition-colors cursor-pointer whitespace-nowrap"
          >
            المبلغ بالظبط ({formatArabicCurrency(netTotalPiasters)})
          </button>

          {quickPresets.filter(p => p !== netPounds).map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onSetPreset(amt)}
              className="py-1.5 px-3 rounded text-xs font-mono font-bold bg-surface-2 text-ink hover:bg-surface border border-line hover:border-brand/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {amt.toFixed(2)} ج.م
            </button>
          ))}
        </div>
      </div>

      {/* Change Due, Short Payment Debt, or Zero Pending Display */}
      {receivedPiasters === 0 ? (
        <div className="p-4 rounded-xl border border-line bg-surface-2 flex items-center justify-between gap-3 transition-all">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-ink-muted whitespace-nowrap">
              المبلغ المطلوب استلامه نقداً:
            </span>
            <span className="text-2xl font-mono font-black mt-1 tabular-nums text-ink whitespace-nowrap">
              {formatArabicCurrency(netTotalPiasters)}
            </span>
          </div>
          <div className="text-left text-xs font-medium text-ink-muted max-w-[260px]">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <HelpCircle className="w-4 h-4 shrink-0 text-brand" />
              <span>أدخل المبلغ المستلم أو اضغط «المبلغ بالظبط» لإتمام الدفع فوراً.</span>
            </span>
          </div>
        </div>
      ) : isShortPayment ? (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 transition-all ${
          selectedCustomer
            ? 'bg-[#FEF7EC] border-[#F5DEB4] text-[#B3720E]'
            : 'bg-[#FDF3F2] border-[#F6CBC6] text-[#B23A2E]'
        }`}>
          {selectedCustomer ? (
            <>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#B3720E] whitespace-nowrap">
                  عجز الدفع (يُسجل كدين آجل):
                </span>
                <span className="text-2xl font-mono font-black mt-1 tabular-nums text-[#8A5200] whitespace-nowrap">
                  {formatArabicCurrency(shortAmountPiasters)}
                </span>
                <span className="text-[11px] font-semibold text-[#8A5200] mt-0.5 whitespace-nowrap">
                  على العميل: {selectedCustomer.name} (الدين السابق: {formatArabicCurrency(selectedCustomer.balancePiasters)})
                </span>
              </div>
              <div className="text-left text-xs font-medium max-w-[260px]">
                <span className="flex items-center gap-1.5 text-[#8A5200]">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#B3720E]" />
                  <span>سيُضاف {formatArabicCurrency(receivedPiasters)} للخزينة، والمتبقي كدين على العميل.</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#B23A2E] whitespace-nowrap">
                  عجز في الدفع:
                </span>
                <span className="text-2xl font-mono font-black mt-1 tabular-nums text-[#B23A2E] whitespace-nowrap">
                  -{formatArabicCurrency(shortAmountPiasters)}
                </span>
                <span className="text-[11px] font-bold text-[#8A241A] mt-1 flex items-center gap-1.5 whitespace-nowrap">
                  <AlertTriangle className="w-4 h-4 text-[#B23A2E] shrink-0" />
                  <span>لا يمكن إتمام دفع جزئي دون تحديد العميل لتسجيل الباقي كآجل.</span>
                </span>
              </div>
              <div className="text-left text-xs font-medium text-[#8A241A] max-w-[240px]">
                <span>يرجى اختيار العميل من القائمة بالأعلى (أو الضغط على «إضافة عميل سريع»).</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-paid-border bg-paid-soft/80 text-paid flex items-center justify-between gap-3 transition-all">
          <div className="flex flex-col">
            <span className="text-xs font-bold whitespace-nowrap">
              المبلغ المتبقي للعميل (الباقي):
            </span>
            <span className="text-3xl font-mono font-black mt-1 tabular-nums whitespace-nowrap">
              {formatArabicCurrency(changeDuePiasters)}
            </span>
          </div>
          <div className="text-left text-xs font-medium max-w-[200px]">
            <span className="flex items-center gap-1.5 text-paid font-bold whitespace-nowrap">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>صافي الحساب سليم وجاهز للطباعة.</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
