import React, { type FormEvent } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Plus, UserCheck, X } from 'lucide-react';
import type { Customer } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';
import { CustomSelect } from '../CustomSelect';
import { QuickAddCustomerForm } from './QuickAddCustomerForm';

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
  // Customer selection & quick add props
  currentCustomerId: string | null;
  setCurrentCustomerId: (id: string | null) => void;
  localCustomers: Customer[];
  showQuickAdd: boolean;
  setShowQuickAdd: (show: boolean) => void;
  quickName: string;
  setQuickName: (val: string) => void;
  quickPhone: string;
  setQuickPhone: (val: string) => void;
  quickSaving: boolean;
  duplicateQuickCustomer: Customer | null;
  onSelectDuplicateCustomer: (c: Customer) => void;
  onQuickAddCustomer: (e: FormEvent) => void;
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
  currentCustomerId,
  setCurrentCustomerId,
  localCustomers,
  showQuickAdd,
  setShowQuickAdd,
  quickName,
  setQuickName,
  quickPhone,
  setQuickPhone,
  quickSaving,
  duplicateQuickCustomer,
  onSelectDuplicateCustomer,
  onQuickAddCustomer,
}) => {
  return (
    <div className="flex flex-col gap-4 bg-surface p-4 rounded-lg border border-line">
      {/* Received Input & Quick Presets */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-ink flex items-center justify-between whitespace-nowrap">
          <span>المبلغ المستلم من العميل (المدفوع نقداً):</span>
          <span className="text-[11px] text-ink-muted font-normal whitespace-nowrap">يمكنك الضغط على الأزرار السريعة أو الكتابة</span>
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

      {/* Change Due or Short Payment Debt Display */}
      <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 transition-all ${
        isShortPayment
          ? selectedCustomer
            ? 'bg-[#FEF7EC] border-[#F5DEB4] text-[#B3720E]'
            : 'bg-[#FDF3F2] border-[#F6CBC6] text-[#B23A2E]'
          : 'bg-paid-soft/80 border-paid-border text-paid'
      }`}>
        {isShortPayment ? (
          selectedCustomer ? (
            <>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-[#B3720E] whitespace-nowrap">
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
                <span className="text-xs font-bold uppercase tracking-wider text-[#B23A2E] whitespace-nowrap">
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
              <div className="text-left text-xs font-medium shrink-0">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(!showQuickAdd)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    showQuickAdd
                      ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs'
                      : 'bg-[#006D41] hover:bg-[#005a36] text-white shadow-sm'
                  }`}
                >
                  {showQuickAdd ? (
                    <>
                      <X className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>إلغاء الإضافة</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>إضافة عميل سريع</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">
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
          </>
        )}
      </div>

      {/* Customer Selection & Quick Add for Short Payment */}
      {isShortPayment && (
        <div className="p-4 bg-white rounded-xl border-2 border-slate-300 shadow-md flex flex-col gap-3.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-300 text-[#006D41] flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black text-slate-900 block whitespace-nowrap">
                  ربط العميل لتسجيل العجز كدين آجل ({formatArabicCurrency(shortAmountPiasters)}):
                </span>
                <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                  ابحث عن عميل مسجل أو اضغط على «إضافة عميل سريع» أعلاه
                </span>
              </div>
            </div>
            {selectedCustomer && (
              <button
                type="button"
                onClick={() => setCurrentCustomerId(null)}
                className="text-xs text-[#B23A2E] font-bold flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FDF3F2] border border-[#F6CBC6] hover:bg-rose-100 cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                <span>إلغاء تحديد العميل</span>
              </button>
            )}
          </div>

          {/* Quick Add Subform */}
          {showQuickAdd && (
            <QuickAddCustomerForm
              quickName={quickName}
              setQuickName={setQuickName}
              quickPhone={quickPhone}
              setQuickPhone={setQuickPhone}
              quickSaving={quickSaving}
              duplicateQuickCustomer={duplicateQuickCustomer}
              onSelectDuplicateCustomer={onSelectDuplicateCustomer}
              onCancel={() => setShowQuickAdd(false)}
              onSubmit={onQuickAddCustomer}
            />
          )}

          {/* Customer Dropdown */}
          <div className="flex flex-col gap-1.5">
            {showQuickAdd && (
              <div className="flex items-center gap-2 my-1">
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">أو اختر من قائمة العملاء المسجلين:</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>
            )}
            <CustomSelect
              value={currentCustomerId || ''}
              onChange={(val) => setCurrentCustomerId(val || null)}
              options={[
                { value: '', label: '-- ابحث عن العميل بالاسم أو رقم الهاتف --' },
                ...localCustomers.map((c) => ({
                  value: c.id,
                  label: `${c.name} ${c.phone ? `(${c.phone})` : ''} - الرصيد الحالي: ${formatArabicCurrency(c.balancePiasters)}`
                }))
              ]}
              placeholder="-- ابحث عن العميل بالاسم أو رقم الهاتف --"
              size="md"
              searchable
            />
          </div>
        </div>
      )}
    </div>
  );
};
