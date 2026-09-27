import type { FormEvent } from 'react';
import { Split, Plus, Trash2, UserCheck } from 'lucide-react';
import type { Customer } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals, poundsToPiasters, piastersToPounds } from '../../utils/money';
import { CustomSelect } from '../CustomSelect';
import { QuickAddCustomerForm } from './QuickAddCustomerForm';

interface MultiPaymentSectionProps {
  splitRows: Array<{ id: string; method: 'cash' | 'card' | 'credit'; amountPiasters: number }>;
  setSplitRows: React.Dispatch<React.SetStateAction<Array<{ id: string; method: 'cash' | 'card' | 'credit'; amountPiasters: number }>>>;
  splitRemainingPiasters: number;
  netTotalPiasters: number;
  currentCustomerId: string | null;
  setCurrentCustomerId: (id: string | null) => void;
  localCustomers: Customer[];
  selectedCustomer: Customer | undefined;
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

export const MultiPaymentSection = ({
  splitRows,
  setSplitRows,
  splitRemainingPiasters,
  netTotalPiasters,
  currentCustomerId,
  setCurrentCustomerId,
  localCustomers,
  selectedCustomer,
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
}: MultiPaymentSectionProps) => {
  const hasCredit = splitRows.some((r) => r.method === 'credit');
  const totalCreditPartPiasters = splitRows
    .filter((r) => r.method === 'credit')
    .reduce((sum, r) => sum + r.amountPiasters, 0);

  return (
    <div className="bg-surface p-4 rounded-lg border border-line flex flex-col gap-3">
      <div className="flex items-center justify-between hairline-b pb-2">
        <div className="flex items-center gap-2">
          <Split className="w-4 h-4 text-brand" />
          <span className="text-xs font-bold text-ink">تقسيم الدفع (جزء نقدي والباقي آجل أو فيزا):</span>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
          splitRemainingPiasters === 0 
            ? 'bg-paid-soft text-paid border border-paid-border' 
            : 'bg-danger-soft text-danger border border-danger/30'
        }`}>
          {splitRemainingPiasters === 0
            ? 'المجموع مطابق تماماً'
            : `المتبقي للتوزيع: ${formatArabicCurrency(splitRemainingPiasters)}`}
        </span>
      </div>

      {/* Quick Split Presets (Task 29-1) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-ink-muted">توزيع سريع:</span>
        <button
          type="button"
          onClick={() => {
            const half = Math.round(netTotalPiasters / 2);
            setSplitRows([
              { id: '1', method: 'cash', amountPiasters: half },
              { id: '2', method: 'credit', amountPiasters: netTotalPiasters - half },
            ]);
          }}
          className="px-2.5 py-1 rounded bg-surface-2 hover:bg-surface border border-line text-[11px] font-semibold text-ink transition-colors cursor-pointer"
        >
          50% كاش + 50% آجل
        </button>
        <button
          type="button"
          onClick={() => {
            const cashRow = splitRows.find(r => r.method === 'cash');
            const cashAmt = cashRow ? cashRow.amountPiasters : Math.round(netTotalPiasters / 2);
            const remainingForCredit = Math.max(0, netTotalPiasters - cashAmt);
            setSplitRows([
              { id: '1', method: 'cash', amountPiasters: cashAmt },
              { id: '2', method: 'credit', amountPiasters: remainingForCredit },
            ]);
          }}
          className="px-2.5 py-1 rounded bg-surface-2 hover:bg-surface border border-line text-[11px] font-semibold text-ink transition-colors cursor-pointer"
        >
          تثبيت الكاش وتحويل الباقي لآجل
        </button>
      </div>

      {/* Split Rows */}
      <div className="flex flex-col gap-2">
        {splitRows.map((row, idx) => (
          <div key={row.id} className="flex items-center gap-2 bg-surface-2 p-2 rounded border border-line">
            <span className="text-xs font-bold text-ink-muted w-6 text-center">#{idx + 1}</span>
            <select
              value={row.method}
              onChange={(e) => {
                const newMethod = e.target.value as 'cash' | 'card' | 'credit';
                setSplitRows((rows) => rows.map((r) => r.id === row.id ? { ...r, method: newMethod } : r));
              }}
              className="h-[34px] px-2 bg-surface border border-line rounded text-xs font-bold text-ink focus:border-brand focus:outline-hidden"
            >
              <option value="cash">نقدي (كاش)</option>
              <option value="card">فيزا / كارت</option>
              <option value="credit">آجل / على الحساب</option>
            </select>

            <input
              type="text"
              value={piastersToPounds(row.amountPiasters).toString()}
              onChange={(e) => {
                const piasters = poundsToPiasters(normalizeArabicNumerals(e.target.value));
                setSplitRows((rows) => rows.map((r) => r.id === row.id ? { ...r, amountPiasters: piasters } : r));
              }}
              className="flex-1 h-[34px] px-3 bg-surface border border-line rounded text-xs font-mono font-bold text-ink text-left"
              placeholder="0.00"
            />
            <span className="text-xs text-ink-muted font-bold">ج.م</span>

            {splitRows.length > 1 && (
              <button
                type="button"
                onClick={() => setSplitRows((rows) => rows.filter((r) => r.id !== row.id))}
                className="p-1 text-ink-muted hover:text-danger rounded cursor-pointer"
                title="حذف هذا الجزء"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const remaining = Math.max(0, splitRemainingPiasters);
            setSplitRows((rows) => [
              ...rows,
              { id: Date.now().toString(), method: 'cash', amountPiasters: remaining }
            ]);
          }}
          className="py-1.5 px-3 rounded text-xs font-bold bg-surface-2 hover:bg-surface border border-line text-ink flex items-center justify-center gap-1 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة طريقة دفع أخرى</span>
        </button>

        {splitRemainingPiasters > 0 && (
          <button
            type="button"
            onClick={() => {
              if (splitRows.length > 0) {
                setSplitRows(rows => {
                  const lastIdx = rows.length - 1;
                  return rows.map((r, i) => i === lastIdx ? { ...r, amountPiasters: r.amountPiasters + splitRemainingPiasters } : r);
                });
              }
            }}
            className="text-xs text-brand font-bold hover:underline cursor-pointer"
          >
            إضافة الفارق ({formatArabicCurrency(splitRemainingPiasters)}) للدفعة الأخيرة ←
          </button>
        )}
      </div>

      {/* If credit is part of the split: Customer selection is required */}
      {hasCredit && (
        <div className="mt-2 p-3 bg-brand-soft/20 border border-brand/30 rounded-lg flex flex-col gap-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-brand" />
              <span>اختيار العميل لتسجيل الجزء الآجل عليه ({formatArabicCurrency(totalCreditPartPiasters)}):</span>
            </label>
            <button
              type="button"
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              className="text-[11px] text-brand font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>{showQuickAdd ? 'إلغاء' : 'إضافة عميل سريع'}</span>
            </button>
          </div>

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
              compact
            />
          )}

          <CustomSelect
            value={currentCustomerId || ''}
            onChange={(val) => setCurrentCustomerId(val || null)}
            options={[
              { value: '', label: '-- اختر عميل الحساب الآجل --' },
              ...localCustomers.map((c) => ({
                value: c.id,
                label: `${c.name} ${c.phone ? `(${c.phone})` : ''} - الرصيد الحالي: ${formatArabicCurrency(c.balancePiasters)}`
              }))
            ]}
            placeholder="-- اختر عميل الحساب الآجل --"
            size="md"
            searchable
          />

          {selectedCustomer && (() => {
            const totalDebtAfter = selectedCustomer.balancePiasters + totalCreditPartPiasters;
            const isOver = selectedCustomer.creditLimitPiasters > 0 && totalDebtAfter > selectedCustomer.creditLimitPiasters;

            return (
              <div className="p-2.5 bg-surface border border-line rounded text-xs font-mono flex items-center justify-between">
                <div>
                  <span className="text-ink-muted">الرصيد السابق: </span>
                  <strong>{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>
                </div>
                <div>
                  <span className="text-ink-muted">الجزء الآجل الجديد: </span>
                  <strong className="text-brand">+{formatArabicCurrency(totalCreditPartPiasters)}</strong>
                </div>
                <div>
                  <span className="text-ink-muted">الرصيد بعد الفاتورة: </span>
                  <strong className={isOver ? 'text-danger font-black' : 'text-ink font-bold'}>
                    {formatArabicCurrency(totalDebtAfter)}
                  </strong>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
