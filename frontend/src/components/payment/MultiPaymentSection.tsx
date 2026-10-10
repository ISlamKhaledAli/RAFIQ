import { Split, Plus, Trash2, UserCheck, AlertCircle } from 'lucide-react';
import type { Customer } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';
import { CustomSelect } from '../CustomSelect';
import { MoneyInput } from '../MoneyInput';

interface MultiPaymentSectionProps {
  splitRows: Array<{ id: string; method: 'cash' | 'card' | 'credit'; amountPiasters: number }>;
  setSplitRows: React.Dispatch<React.SetStateAction<Array<{ id: string; method: 'cash' | 'card' | 'credit'; amountPiasters: number }>>>;
  splitRemainingPiasters: number;
  netTotalPiasters: number;
  selectedCustomer: Customer | undefined;
}

export const MultiPaymentSection = ({
  splitRows,
  setSplitRows,
  splitRemainingPiasters,
  netTotalPiasters,
  selectedCustomer,
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
          <span className="text-xs font-bold text-ink">تشكيل الدفع (جزء كاش والباقي شكك أو فيزا):</span>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
          splitRemainingPiasters === 0 
            ? 'bg-paid-soft text-paid' 
            : 'bg-amber-50 text-amber-800 border border-amber-200'
        }`}>
          {splitRemainingPiasters === 0 
            ? 'الحساب متطابق بالمليم' 
            : `باقي لم يوزع: ${formatArabicCurrency(splitRemainingPiasters)}`}
        </span>
      </div>

      {/* Quick Distribution Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-ink-muted font-bold">توزيع تلقائي سريع:</span>
        <button
          type="button"
          onClick={() => {
            const half = Math.round(netTotalPiasters / 2);
            setSplitRows([
              { id: '1', method: 'cash', amountPiasters: half },
              { id: '2', method: 'card', amountPiasters: netTotalPiasters - half },
            ]);
          }}
          className="text-[11px] px-2 py-1 bg-surface-2 hover:bg-surface border border-line rounded font-bold text-ink cursor-pointer transition-colors"
        >
          النص كاش + النص فيزا
        </button>
        <button
          type="button"
          onClick={() => {
            const half = Math.round(netTotalPiasters / 2);
            setSplitRows([
              { id: '1', method: 'cash', amountPiasters: half },
              { id: '2', method: 'credit', amountPiasters: netTotalPiasters - half },
            ]);
          }}
          className="text-[11px] px-2 py-1 bg-surface-2 hover:bg-surface border border-line rounded font-bold text-ink cursor-pointer transition-colors"
        >
          النص كاش + النص شكك
        </button>
        <button
          type="button"
          onClick={() => {
            setSplitRows((rows) => {
              const cashRow = rows.find(r => r.method === 'cash');
              const cashPaid = cashRow ? cashRow.amountPiasters : 0;
              const remaining = Math.max(0, netTotalPiasters - cashPaid);
              return [
                { id: '1', method: 'cash', amountPiasters: cashPaid },
                { id: '2', method: 'credit', amountPiasters: remaining }
              ];
            });
          }}
          className="text-[11px] px-2 py-1 bg-surface-2 hover:bg-surface border border-line rounded font-bold text-ink cursor-pointer transition-colors"
        >
          ثبّت الكاش والباقي على الحساب
        </button>
      </div>

      {/* Split Rows */}
      <div className="flex flex-col gap-2">
        {splitRows.map((row, idx) => (
          <div key={row.id} className="flex items-center gap-2 bg-surface-2 p-2 rounded border border-line">
            <span className="text-xs font-bold text-ink-muted w-6 text-center">#{idx + 1}</span>
            <div className="w-36 shrink-0">
              <CustomSelect
                value={row.method}
                onChange={(val) => {
                  const newMethod = val as 'cash' | 'card' | 'credit';
                  setSplitRows((rows) => rows.map((r) => r.id === row.id ? { ...r, method: newMethod } : r));
                }}
                size="sm"
                options={[
                  { value: 'cash', label: 'نقدي (كاش)' },
                  { value: 'card', label: 'فيزا / كارت' },
                  { value: 'credit', label: 'شكك / على الحساب' },
                ]}
              />
            </div>

            <div className="flex-1">
              <MoneyInput
                valuePiasters={row.amountPiasters}
                onChangePiasters={(val) => {
                  setSplitRows((rows) => rows.map((r) => r.id === row.id ? { ...r, amountPiasters: val } : r));
                }}
                className="h-[34px] text-xs font-mono font-bold"
              />
            </div>

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
          <span>إضافة طريقة دفع تانية</span>
        </button>

        {splitRemainingPiasters > 0 && (
          <button
            type="button"
            onClick={() => {
              if (splitRows.length > 0) {
                const lastIdx = splitRows.length - 1;
                setSplitRows((rows) => {
                  return rows.map((r, i) => i === lastIdx ? { ...r, amountPiasters: r.amountPiasters + splitRemainingPiasters } : r);
                });
              }
            }}
            className="text-xs text-brand font-bold hover:underline cursor-pointer"
          >
            حط الفرق ده ({formatArabicCurrency(splitRemainingPiasters)}) على آخر دفعة ←
          </button>
        )}
      </div>

      {/* If credit is part of the split: show status card connected to top customer */}
      {hasCredit && (
        <div className="mt-2 animate-in fade-in">
          {selectedCustomer ? (
            <div className="p-3 bg-paid-soft/40 border border-paid-border rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-ink">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-paid" />
                  <span>الجزء الشكك ({formatArabicCurrency(totalCreditPartPiasters)}) هيتسجل على: <strong className="text-paid">{selectedCustomer.name}</strong></span>
                </div>
                {selectedCustomer.phone && (
                  <span className="text-[11px] text-ink-muted font-mono" dir="ltr">{selectedCustomer.phone}</span>
                )}
              </div>

              {(() => {
                const totalDebtAfter = selectedCustomer.balancePiasters + totalCreditPartPiasters;
                const isOver = selectedCustomer.creditLimitPiasters > 0 && totalDebtAfter > selectedCustomer.creditLimitPiasters;

                return (
                  <div className="p-2 bg-surface border border-line rounded-lg text-xs font-mono flex items-center justify-between">
                    <div>
                      <span className="text-ink-muted">حسابه القديم: </span>
                      <strong>{formatArabicCurrency(selectedCustomer.balancePiasters)}</strong>
                    </div>
                    <div>
                      <span className="text-ink-muted">الشكك الجديد: </span>
                      <strong className="text-brand font-bold">+{formatArabicCurrency(totalCreditPartPiasters)}</strong>
                    </div>
                    <div>
                      <span className="text-ink-muted">إجمالي اللي عليه: </span>
                      <strong className={isOver ? 'text-danger font-black' : 'text-ink font-bold'}>
                        {formatArabicCurrency(totalDebtAfter)}
                      </strong>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>فيه جزء شكك ({formatArabicCurrency(totalCreditPartPiasters)}) — يرجى تحديد الزبون من خانة «الزبون» بأعلى الفاتورة لتسجيله.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
