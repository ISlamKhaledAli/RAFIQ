import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, HelpCircle, Sparkles, UserCheck } from 'lucide-react';
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
  netPounds,
  quickPresets,
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
    <div className="flex flex-col gap-4 bg-surface p-4 rounded-lg border border-line">
      {/* Received Input & Quick Presets */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-ink flex items-center justify-between whitespace-nowrap">
          <span>المبلغ المستلم من العميل (المدفوع نقداً):</span>
          <span className="text-[11px] text-ink-muted font-normal whitespace-nowrap">اضغط على المبالغ الجاهزة أو اكتب المبلغ</span>
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

        {/* Quick Presets Buttons + Quick Full Credit Button */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <button
            type="button"
            onClick={() => onSetPreset(netPounds)}
            className="py-1.5 px-3 rounded text-xs font-bold bg-brand-soft text-brand hover:bg-brand hover:text-white border border-brand/30 transition-colors cursor-pointer whitespace-nowrap active:scale-95"
            title="استلام إجمالي الفاتورة بالضبط نقداً"
          >
            المبلغ بالظبط ({formatArabicCurrency(netTotalPiasters)})
          </button>

          {/* Quick Credit Button (Egyptian Retail Wording) */}
          <button
            type="button"
            onClick={onQuickFullCredit}
            className={`py-1.5 px-3 rounded text-xs font-bold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 active:scale-95 ${
              isCreditActive
                ? 'bg-[#b3720e] text-white border-[#b3720e] shadow-xs'
                : 'bg-[#fef7ec] text-[#b3720e] hover:bg-[#b3720e] hover:text-white border-[#f5deb4]'
            }`}
            title="تسجيل الفاتورة على حساب العميل بالكامل (0 كاش مستلم)"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>على الحساب بالكامل (بدون كاش)</span>
          </button>

          {quickPresets.filter(p => p !== netPounds).map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onSetPreset(amt)}
              className="py-1.5 px-3 rounded text-xs font-mono font-bold bg-surface-2 text-ink hover:bg-surface border border-line hover:border-brand/50 transition-colors cursor-pointer whitespace-nowrap active:scale-95"
            >
              {amt.toFixed(2)} ج.م
            </button>
          ))}
        </div>
      </div>

      {/* Status Card: Full Credit / Advance Credit / Short Payment / Change Due / Zero Pending */}
      {isCreditActive && hasRegisteredCustomer ? (
        selectedCustomer.balancePiasters < 0 ? (
          /* Customer has advance credit: Deduct smartly from previous deposit */
          <div className="p-4 rounded-xl border border-paid-border bg-paid-soft text-paid flex items-center justify-between gap-3 transition-all">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-paid flex items-center gap-1.5 whitespace-nowrap">
                <Sparkles className="w-4 h-4 text-paid shrink-0" />
                <span>خصم من الفلوس اللي سايبها العميل تحت حسابه:</span>
              </span>
              <span className="text-2xl font-mono font-black mt-1 tabular-nums text-paid whitespace-nowrap">
                {formatArabicCurrency(netTotalPiasters)}
              </span>
              <span className="text-[11px] font-semibold text-paid mt-0.5 whitespace-nowrap">
                العميل: {selectedCustomer.name} (الفلوس اللي سايبها: {formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters))})
              </span>
            </div>
            <div className="text-left text-xs font-medium max-w-[280px]">
              <span className="flex items-center gap-1.5 text-paid font-bold">
                <CheckCircle className="w-4 h-4 shrink-0 text-paid" />
                <span>
                  {Math.abs(selectedCustomer.balancePiasters) >= netTotalPiasters
                    ? `الفاتورة هتتخصم كلها من الفلوس اللي سايبها، وهيتبقى له ${formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters) - netTotalPiasters)} في حسابه بالمحل.`
                    : `الفلوس اللي كان سايبها هتخلص كلها (${formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters))})، والباقي (${formatArabicCurrency(netTotalPiasters - Math.abs(selectedCustomer.balancePiasters))}) هيتسجل عليه في حسابه.`}
                </span>
              </span>
            </div>
          </div>
        ) : (
          /* Normal full credit debt */
          <div className="p-4 rounded-xl border border-[#f5deb4] bg-[#fef7ec] text-[#b3720e] flex items-center justify-between gap-3 transition-all">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#b3720e] flex items-center gap-1.5 whitespace-nowrap">
                <Clock className="w-4 h-4 text-[#b3720e] shrink-0" />
                <span>الفاتورة كلها على الحساب (ميدفعش كاش):</span>
              </span>
              <span className="text-2xl font-mono font-black mt-1 tabular-nums text-[#8a5200] whitespace-nowrap">
                {formatArabicCurrency(netTotalPiasters)}
              </span>
              <span className="text-[11px] font-semibold text-[#8a5200] mt-0.5 whitespace-nowrap">
                مستلمش كاش: 0.00 ج.م | العميل: {selectedCustomer.name} (إجمالي اللي عليه بعد الفاتورة: {formatArabicCurrency(selectedCustomer.balancePiasters + netTotalPiasters)})
              </span>
            </div>
            <div className="text-left text-xs font-medium max-w-[260px]">
              <span className="flex items-center gap-1.5 text-[#8a5200] font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#b3720e]" />
                <span>مفيش فلوس اتدفعت كاش. قيمة الفاتورة كلها هتتسجل على حساب العميل في النوتة.</span>
              </span>
            </div>
          </div>
        )
      ) : receivedPiasters === 0 ? (
        <div className="p-4 rounded-xl border border-line bg-surface-2 flex items-center justify-between gap-3 transition-all">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-ink-muted whitespace-nowrap">
              المطلوب استلامه كاش:
            </span>
            <span className="text-2xl font-mono font-black mt-1 tabular-nums text-ink whitespace-nowrap">
              {formatArabicCurrency(netTotalPiasters)}
            </span>
          </div>
          <div className="text-left text-xs font-medium text-ink-muted max-w-[260px]">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <HelpCircle className="w-4 h-4 shrink-0 text-brand" />
              <span>اكتب المبلغ المستلم، أو اضغط «المبلغ بالظبط»، أو اختار «على الحساب بالكامل».</span>
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
                  باقي الحساب على النوتة (دين):
                </span>
                <span className="text-2xl font-mono font-black mt-1 tabular-nums text-[#8A5200] whitespace-nowrap">
                  {formatArabicCurrency(shortAmountPiasters)}
                </span>
                <span className="text-[11px] font-semibold text-[#8A5200] mt-0.5 whitespace-nowrap">
                  على العميل: {selectedCustomer.name} (اللي كان عليه قبل كده: {formatArabicCurrency(selectedCustomer.balancePiasters)})
                </span>
              </div>
              <div className="text-left text-xs font-medium max-w-[260px]">
                <span className="flex items-center gap-1.5 text-[#8A5200]">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#B3720E]" />
                  <span>هيتحط {formatArabicCurrency(receivedPiasters)} في الدرج كاش، والباقي هيتسجل على حساب العميل.</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#B23A2E] whitespace-nowrap">
                  المبلغ ناقص (دفع جزء):
                </span>
                <span className="text-2xl font-mono font-black mt-1 tabular-nums text-[#B23A2E] whitespace-nowrap">
                  -{formatArabicCurrency(shortAmountPiasters)}
                </span>
                <span className="text-[11px] font-bold text-[#8A241A] mt-1 flex items-center gap-1.5 whitespace-nowrap">
                  <AlertTriangle className="w-4 h-4 text-[#B23A2E] shrink-0" />
                  <span>مينفعش يدفع جزء من الفاتورة إلا لما تختار اسم العميل عشان نسجل الباقي عليه.</span>
                </span>
              </div>
              <div className="text-left text-xs font-medium text-[#8A241A] max-w-[240px]">
                <span>اختار العميل من القائمة فوق (أو اضغط على «إضافة عميل سريع»).</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-paid-border bg-paid-soft/80 text-paid flex flex-col gap-2.5 transition-all">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-bold whitespace-nowrap">
                الباقي اللي هترجعه للزبون:
              </span>
              <span className="text-3xl font-mono font-black mt-1 tabular-nums whitespace-nowrap">
                {formatArabicCurrency(changeDuePiasters)}
              </span>
            </div>
            <div className="text-left text-xs font-medium max-w-[200px]">
              <span className="flex items-center gap-1.5 text-paid font-bold whitespace-nowrap">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>الحساب مظبوط وجاهز لطباعة الفاتورة.</span>
              </span>
            </div>
          </div>

          {/* Smart Customer Change Deposit Option */}
          {hasRegisteredCustomer && changeDuePiasters > 0 && (
            <div className="mt-1 pt-2.5 border-t border-paid-border/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-paid font-bold">
                <Sparkles className="w-4 h-4 text-paid shrink-0" />
                <span>سيب الباقي ({formatArabicCurrency(changeDuePiasters)}) تحت حساب العميل في المحل</span>
              </div>
              <button
                type="button"
                onClick={() => onToggleSaveChangeToCustomerAccount(!saveChangeToCustomerAccount)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 ${
                  saveChangeToCustomerAccount
                    ? 'bg-paid text-white border border-paid'
                    : 'bg-white text-paid border border-paid/40 hover:bg-paid-soft'
                }`}
              >
                {saveChangeToCustomerAccount ? 'مفعل (هتفضل في حسابه)' : 'سيب الفلوس في حسابه'}
              </button>
              {saveChangeToCustomerAccount && (
                <p className="w-full text-[11px] text-[#005530] font-medium mt-0.5">
                  الباقي ({formatArabicCurrency(changeDuePiasters)}) هيفضل محفوظ في حساب العميل «{selectedCustomer?.name}» ويتخصم أوتوماتيك لما يشتري أي حاجة بعد كده.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
