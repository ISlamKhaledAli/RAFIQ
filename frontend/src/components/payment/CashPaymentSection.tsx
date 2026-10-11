import React from 'react';
import { AlertCircle, AlertTriangle, Check, CheckCircle, Clock, HelpCircle, Sparkles, UserCheck, X } from 'lucide-react';
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
          <div className="p-4 rounded-xl border border-[#f5deb4] bg-[#fef7ec] text-[#b3720e] flex flex-col gap-3 transition-all shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#b3720e] flex items-center gap-1.5 whitespace-nowrap">
                <Clock className="w-4 h-4 text-[#b3720e] shrink-0" />
                <span>الفاتورة كلها على الحساب (آجل بالكامل - بدون كاش):</span>
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#f5deb4]/70 text-[#8a5200]">
                العميل: {selectedCustomer.name}
              </span>
            </div>

            {/* 3-Step Clear Debt Calculation Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-white/90 border border-[#f5deb4] text-center font-mono">
              <div className="flex flex-col items-center justify-center p-2 bg-[#fef7ec] rounded-lg border border-[#f5deb4]/60">
                <span className="text-[11px] font-sans text-ink-muted mb-0.5">كان عليه قديم:</span>
                <span className="text-base font-black text-danger">
                  {formatArabicCurrency(selectedCustomer.balancePiasters)}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-2 bg-[#fef7ec] rounded-lg border border-[#f5deb4]/60">
                <span className="text-[11px] font-sans text-ink-muted mb-0.5">أُضيف عليه (الفاتورة الحالية):</span>
                <span className="text-base font-black text-[#b3720e]">
                  +{formatArabicCurrency(netTotalPiasters)}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-2 bg-danger-soft/40 rounded-lg border border-danger/40">
                <span className="text-[11px] font-sans font-bold text-danger mb-0.5">إجمالي اللي عليه بعد الفاتورة:</span>
                <span className="text-lg font-black text-danger">
                  {formatArabicCurrency(selectedCustomer.balancePiasters + netTotalPiasters)}
                </span>
              </div>
            </div>

            <div className="text-xs font-medium text-[#8a5200] flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#b3720e]" />
              <span>مفيش فلوس اتدفعت كاش (0.00 ج.م). تم قيد الفاتورة بالكامل على حساب الزبون في النوتة.</span>
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
        <div className={`p-4 rounded-xl border flex flex-col gap-3 transition-all shadow-2xs ${
          selectedCustomer
            ? 'bg-[#FEF7EC] border-[#F5DEB4] text-[#B3720E]'
            : 'bg-[#FDF3F2] border-[#F6CBC6] text-[#B23A2E]'
        }`}>
          {selectedCustomer ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#B3720E] flex items-center gap-1.5 whitespace-nowrap">
                    <AlertTriangle className="w-4 h-4 text-[#B3720E] shrink-0" />
                    <span>دفع جزء كاش والباقي على الحساب (دين):</span>
                  </span>
                  <span className="text-xs text-[#8A5200] mt-0.5">
                    العميل: <strong>{selectedCustomer.name}</strong> | دفع كاش: <strong className="font-mono">{formatArabicCurrency(receivedPiasters)}</strong>
                  </span>
                </div>
                <div className="text-left font-mono">
                  <span className="text-[11px] font-sans text-[#8A5200] block">المتبقي على النوتة:</span>
                  <span className="text-xl font-black text-[#8A5200] tabular-nums">
                    +{formatArabicCurrency(shortAmountPiasters)}
                  </span>
                </div>
              </div>

              {/* 3-Step Clear Debt Calculation Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-white/90 border border-[#F5DEB4] text-center font-mono">
                <div className="flex flex-col items-center justify-center p-2 bg-[#FEF7EC] rounded-lg border border-[#F5DEB4]/60">
                  <span className="text-[11px] font-sans text-ink-muted mb-0.5">كان عليه قديم:</span>
                  <span className="text-base font-black text-danger">
                    {formatArabicCurrency(selectedCustomer.balancePiasters)}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-2 bg-[#FEF7EC] rounded-lg border border-[#F5DEB4]/60">
                  <span className="text-[11px] font-sans text-ink-muted mb-0.5">أُضيف عليه (باقي الفاتورة):</span>
                  <span className="text-base font-black text-[#B3720E]">
                    +{formatArabicCurrency(shortAmountPiasters)}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-2 bg-danger-soft/40 rounded-lg border border-danger/40">
                  <span className="text-[11px] font-sans font-bold text-danger mb-0.5">إجمالي اللي عليه الآن:</span>
                  <span className="text-lg font-black text-danger">
                    {formatArabicCurrency(selectedCustomer.balancePiasters + shortAmountPiasters)}
                  </span>
                </div>
              </div>

              <div className="text-xs font-medium text-[#8A5200] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#B3720E]" />
                <span>هيتحط {formatArabicCurrency(receivedPiasters)} في الدرج كاش، والباقي ({formatArabicCurrency(shortAmountPiasters)}) هيتسجل دين على حسابه في النوتة.</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#B23A2E] whitespace-nowrap">
                    المبلغ ناقص (دفع جزء):
                  </span>
                  <span className="text-2xl font-mono font-black mt-1 tabular-nums text-[#B23A2E] whitespace-nowrap">
                    -{formatArabicCurrency(shortAmountPiasters)}
                  </span>
                </div>
                <div className="text-left text-xs font-bold text-[#8A241A] max-w-[260px] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#B23A2E] shrink-0" />
                  <span>مينفعش يدفع جزء من الفاتورة إلا لما تختار اسم العميل عشان نسجل الباقي عليه.</span>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-paid-border bg-paid-soft/80 text-paid flex flex-col gap-3 transition-all shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-bold whitespace-nowrap">
                الباقي اللي هترجعه للزبون:
              </span>
              <span className="text-3xl font-mono font-black mt-1 tabular-nums whitespace-nowrap">
                {formatArabicCurrency(changeDuePiasters)}
              </span>
            </div>
            <div className="text-left text-xs font-medium max-w-[220px]">
              <span className="flex items-center gap-1.5 text-paid font-bold whitespace-nowrap">
                <CheckCircle className="w-5 h-5 shrink-0 text-paid" />
                <span>الحساب مظبوط وجاهز لطباعة الفاتورة.</span>
              </span>
            </div>
          </div>

          {/* Smart Customer Change Deposit Option with High-Clarity Switch & Balance Calculation */}
          {hasRegisteredCustomer && changeDuePiasters > 0 && selectedCustomer && (
            <div className={`mt-1 p-3 rounded-xl border-2 transition-all ${
              saveChangeToCustomerAccount
                ? 'bg-white border-paid shadow-xs'
                : 'bg-white/80 border-line hover:border-paid/40'
            }`}>
              <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-3">
                  {/* Distinct Visual Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={saveChangeToCustomerAccount}
                    onClick={() => onToggleSaveChangeToCustomerAccount(!saveChangeToCustomerAccount)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      saveChangeToCustomerAccount ? 'bg-paid' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        saveChangeToCustomerAccount ? '-translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-ink">
                        سيب باقي الفلوس ({formatArabicCurrency(changeDuePiasters)}) في حساب العميل
                      </span>
                      {saveChangeToCustomerAccount ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-paid text-white shadow-2xs">
                          <Check className="w-3 h-3" />
                          مفعّل (خصم من حسابه)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-2 text-ink-muted border border-line">
                          <X className="w-3 h-3" />
                          غير مفعّل (تسليم كاش باليد)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-ink-muted mt-0.5">
                      {saveChangeToCustomerAccount
                        ? 'سيتم خصم الباقي من دينه القديم، أو إيداعه كرصيد محفوظ له في المحل.'
                        : 'سيتم تسليم الباقي نقداً باليد للزبون، ويبقى حسابه القديم في النوتة دون تغيير.'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleSaveChangeToCustomerAccount(!saveChangeToCustomerAccount)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                    saveChangeToCustomerAccount
                      ? 'bg-paid text-white border-paid shadow-2xs'
                      : 'bg-surface text-ink border-line hover:border-paid/40'
                  }`}
                >
                  {saveChangeToCustomerAccount ? 'إلغاء التفعيل' : 'تفعيل الخصم'}
                </button>
              </div>

              {/* Dynamic Balance Breakdown: "كان عليه كذا وبقى كذا" */}
              {saveChangeToCustomerAccount ? (
                <div className="mt-3 pt-3 border-t border-line">
                  {selectedCustomer.balancePiasters > 0 ? (
                    (() => {
                      const oldDebt = selectedCustomer.balancePiasters;
                      const remainingDebt = oldDebt - changeDuePiasters;
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[11px] font-bold text-paid flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-paid shrink-0" />
                            <span>تسوية الباقي وخصمه من حساب الزبون «{selectedCustomer.name}»:</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center font-mono">
                            <div className="p-2 rounded-lg bg-surface-2 border border-line flex flex-col">
                              <span className="text-[10px] font-sans text-ink-muted">كان عليه قديم:</span>
                              <span className="text-sm font-black text-danger">{formatArabicCurrency(oldDebt)}</span>
                            </div>
                            <div className="p-2 rounded-lg bg-surface-2 border border-line flex flex-col">
                              <span className="text-[10px] font-sans text-ink-muted">اتخصم من دينه (الباقي المساب):</span>
                              <span className="text-sm font-black text-paid">-{formatArabicCurrency(changeDuePiasters)}</span>
                            </div>
                            <div className={`p-2 rounded-lg border flex flex-col ${
                              remainingDebt > 0 ? 'bg-amber-50 border-amber-300' : 'bg-paid-soft border-paid-border'
                            }`}>
                              <span className="text-[10px] font-sans font-bold text-ink">
                                {remainingDebt > 0 ? 'بقى عليه الآن في النوتة:' : 'سدد دينه بالكامل وبقى له رصيد:'}
                              </span>
                              <span className={`text-base font-black ${remainingDebt > 0 ? 'text-amber-800' : 'text-paid'}`}>
                                {formatArabicCurrency(Math.abs(remainingDebt))}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      const oldCredit = Math.abs(selectedCustomer.balancePiasters);
                      const totalCredit = oldCredit + changeDuePiasters;
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[11px] font-bold text-paid flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-paid shrink-0" />
                            <span>رصيد الزبون «{selectedCustomer.name}» المحفوظ في المحل:</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center font-mono">
                            <div className="p-2 rounded-lg bg-surface-2 border border-line flex flex-col">
                              <span className="text-[10px] font-sans text-ink-muted">رصيده السابق:</span>
                              <span className="text-sm font-black text-paid">{formatArabicCurrency(oldCredit)}</span>
                            </div>
                            <div className="p-2 rounded-lg bg-surface-2 border border-line flex flex-col">
                              <span className="text-[10px] font-sans text-ink-muted">أُضيف لرصيده (الباقي):</span>
                              <span className="text-sm font-black text-paid">+{formatArabicCurrency(changeDuePiasters)}</span>
                            </div>
                            <div className="p-2 rounded-lg bg-paid-soft border border-paid-border flex flex-col">
                              <span className="text-[10px] font-sans font-bold text-paid">إجمالي رصيده الجديد:</span>
                              <span className="text-base font-black text-paid">{formatArabicCurrency(totalCredit)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : (
                selectedCustomer.balancePiasters > 0 && (
                  <div className="mt-2.5 p-2 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
                    <span>
                      هترجع للزبون <strong className="font-mono">{formatArabicCurrency(changeDuePiasters)}</strong> نقداً باليد، ودينه القديم المسجل في النوتة <strong className="font-mono">({formatArabicCurrency(selectedCustomer.balancePiasters)})</strong> يفضل زي ما هو بدون تعديل.
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
