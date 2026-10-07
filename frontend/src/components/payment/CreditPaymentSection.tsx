import type { FormEvent } from 'react';
import { UserCheck, Plus, AlertTriangle } from 'lucide-react';
import type { Customer } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';
import { CustomSelect } from '../CustomSelect';
import { QuickAddCustomerForm } from './QuickAddCustomerForm';

interface CreditPaymentSectionProps {
  currentCustomerId: string | null;
  setCurrentCustomerId: (id: string | null) => void;
  localCustomers: Customer[];
  selectedCustomer: Customer | undefined;
  netTotalPiasters: number;
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

export const CreditPaymentSection = ({
  currentCustomerId,
  setCurrentCustomerId,
  localCustomers,
  selectedCustomer,
  netTotalPiasters,
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
}: CreditPaymentSectionProps) => {
  return (
    <div className="bg-surface p-4 rounded-lg border border-line flex flex-col gap-3">
      <div className="flex items-center justify-between hairline-b pb-2">
        <label className="text-xs font-bold text-ink flex items-center gap-1.5">
          <UserCheck className="w-4 h-4 text-brand" />
          <span>اختيار عميل الحساب الآجل:</span>
        </label>
        <button
          type="button"
          onClick={() => setShowQuickAdd(!showQuickAdd)}
          className="text-xs text-brand font-bold flex items-center gap-1 hover:underline cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{showQuickAdd ? 'إغلاق الإضافة السريعة' : 'إضافة عميل جديد سريع'}</span>
        </button>
      </div>

      {/* Quick Add Customer Subform */}
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

      <CustomSelect
        value={currentCustomerId || ''}
        onChange={(val) => setCurrentCustomerId(val || null)}
        options={[
          { value: '', label: '-- اختر العميل لتسجيل المديونية عليه --' },
          ...localCustomers.filter(c => c.id !== 'cust_general_cash').map((c) => ({
            value: c.id,
            label: `${c.name} ${c.phone ? `(${c.phone})` : ''} - الرصيد الحالي: ${formatArabicCurrency(c.balancePiasters)}`
          }))
        ]}
        placeholder="-- اختر العميل لتسجيل المديونية عليه --"
        size="lg"
        searchable
      />

      {selectedCustomer && (() => {
        const totalDebtAfterPiasters = selectedCustomer.balancePiasters + netTotalPiasters;
        const isOverLimit = selectedCustomer.creditLimitPiasters > 0 && totalDebtAfterPiasters > selectedCustomer.creditLimitPiasters;
        const isHighExistingDebt = selectedCustomer.balancePiasters >= 50000; // >= 500 EGP

        return (
          <div className="flex flex-col gap-2">
            <div className="p-3 bg-surface-2 border border-line rounded-md grid grid-cols-3 gap-2 text-xs font-mono">
              <div>
                <span className="text-ink-muted block text-[10px]">الرصيد السابق:</span>
                <strong className="text-ink">{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>
              </div>
              <div>
                <span className="text-ink-muted block text-[10px]">الحد الائتماني:</span>
                <strong className="text-ink">
                  {selectedCustomer.creditLimitPiasters > 0 ? formatArabicCurrency(selectedCustomer.creditLimitPiasters) : 'غير محدد'}
                </strong>
              </div>
              <div>
                <span className="text-ink-muted block text-[10px]">الرصيد بعد الفاتورة:</span>
                <strong className={isOverLimit ? 'text-danger font-black' : 'text-brand font-bold'}>
                  {formatArabicCurrency(totalDebtAfterPiasters)}
                </strong>
              </div>
            </div>

            {/* Task 28-3: Prominent Warning Banner for High Debt / Over Limit */}
            {(isOverLimit || isHighExistingDebt) && (
              <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 animate-in fade-in ${
                isOverLimit
                  ? 'bg-danger-soft/25 border-danger/50 text-danger-ink dark:text-red-300'
                  : 'bg-amber-500/15 border-amber-400/40 text-amber-900 dark:text-amber-200'
              }`}>
                <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isOverLimit ? 'text-danger' : 'text-amber-600'}`} />
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="font-bold">
                    {isOverLimit 
                      ? 'تحذير حرج: تجاوز الحد الائتماني المسموح به للعميل!' 
                      : 'تنبيه: العميل عليه مديونية سابقة مرتفعة!'}
                  </span>
                  <p className="m-0 text-[11px] leading-relaxed">
                    {isOverLimit ? (
                      <>
                        رصيد الدين سيزيد عن الحد الائتماني المحدد ({formatArabicCurrency(selectedCustomer.creditLimitPiasters)}) بمقدار <strong className="font-mono">{formatArabicCurrency(totalDebtAfterPiasters - selectedCustomer.creditLimitPiasters)}</strong>. يرجى توخي الحذر أو طلب سداد نقدي جزئي.
                      </>
                    ) : (
                      <>
                        العميل مسجل عليه مديونية سابقة بقيمة <strong className="font-mono">{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>.
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
