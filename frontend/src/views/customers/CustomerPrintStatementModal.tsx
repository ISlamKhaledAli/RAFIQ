import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Customer, CustomerLedgerEntry } from '../../types/models';

export interface CustomerPrintStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: Customer | null;
  statementStartDate: string;
  statementEndDate: string;
  statementPeriodSummary: {
    openingBalancePiasters: number;
    periodDebitsPiasters: number;
    periodCreditsPiasters: number;
    periodRefundsPiasters?: number;
    closingBalancePiasters: number;
  };
  filteredStatementEntries: CustomerLedgerEntry[];
  statementPrintMode: 'thermal' | 'a4';
  setStatementPrintMode: (mode: 'thermal' | 'a4') => void;
  isEntryCancelled?: (entryId: string) => boolean;
  onExecutePrint: () => void;
}

export const CustomerPrintStatementModal: React.FC<CustomerPrintStatementModalProps> = ({
  isOpen,
  onClose,
  selectedCustomer,
  statementStartDate,
  statementEndDate,
  statementPeriodSummary,
  filteredStatementEntries,
  statementPrintMode,
  setStatementPrintMode,
  isEntryCancelled,
  onExecutePrint,
}) => {
  if (!isOpen || !selectedCustomer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Mode Toggle & Actions */}
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-brand" />
            <span className="text-sm font-bold text-ink">معاينة وصل كشف الحساب قبل الطباعة</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border border-line bg-canvas p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatementPrintMode('thermal')}
                className={`px-2.5 py-1 rounded font-semibold text-[11px] cursor-pointer ${
                  statementPrintMode === 'thermal' ? 'bg-surface text-brand shadow-xs' : 'text-ink-muted'
                }`}
              >
                وصل حراري (بون كاشير)
              </button>
              <button
                type="button"
                onClick={() => setStatementPrintMode('a4')}
                className={`px-2.5 py-1 rounded font-semibold text-[11px] cursor-pointer ${
                  statementPrintMode === 'a4' ? 'bg-surface text-brand shadow-xs' : 'text-ink-muted'
                }`}
              >
                ورقة كبيرة (A4)
              </button>
            </div>

            <button onClick={onClose} className="text-ink-muted hover:text-ink cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Preview Sheet */}
        <div className="flex-1 overflow-y-auto p-4 bg-canvas flex justify-center">
          <div
            className={`bg-white text-black p-5 shadow-md border border-neutral-300 font-sans ${
              statementPrintMode === 'thermal' ? 'w-[320px] text-xs' : 'w-full text-sm'
            }`}
          >
            {/* Store Header */}
            <div className="text-center pb-3 border-b border-black mb-3">
              <h2 className="text-base font-extrabold mb-0.5">رفيق لنقاط البيع وإدارة المتاجر</h2>
              <p className="text-[11px] text-neutral-600 font-semibold">كشف حساب زبون تفصيلي</p>
              <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                تاريخ الاستخراج: {new Date().toLocaleString('ar-EG-u-nu-latn')}
              </p>
            </div>

            {/* Customer Details Box */}
            <div className="bg-neutral-50 p-2.5 rounded border border-neutral-200 text-xs mb-3 space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-neutral-600">اسم الزبون:</span>
                <span className="font-bold">{selectedCustomer.name}</span>
              </div>
              {selectedCustomer.phone && (
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-600">رقم الموبايل:</span>
                  <span className="font-mono">{selectedCustomer.phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-semibold text-neutral-600">الفترة:</span>
                <span className="font-semibold">
                  {statementStartDate ? `من ${statementStartDate} ` : 'من بداية التعامل '}
                  {statementEndDate ? `إلى ${statementEndDate}` : 'حتى تاريخه'}
                </span>
              </div>
            </div>

            {/* Financial Period Summary Strip */}
            <div className="mb-3 p-2 bg-neutral-50 rounded border border-neutral-300 text-xs">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5 mb-1.5">
                <span className="font-bold text-neutral-800">
                  {statementPeriodSummary.closingBalancePiasters > 0
                    ? 'حساب الزبون (عليه فلوس للمحل):'
                    : statementPeriodSummary.closingBalancePiasters < 0
                    ? 'حساب الزبون (له رصيد في المحل):'
                    : 'حساب الزبون (خالص تماماً):'}
                </span>
                <span className="font-bold font-mono text-sm text-neutral-900">
                  {(Math.abs(statementPeriodSummary.closingBalancePiasters) / 100).toFixed(2)} ج.م
                  {statementPeriodSummary.closingBalancePiasters > 0 && ' (عليه فلوس)'}
                  {statementPeriodSummary.closingBalancePiasters < 0 && ' (له فلوس)'}
                  {statementPeriodSummary.closingBalancePiasters === 0 && ' (خالص)'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px] text-neutral-600 pt-0.5">
                <div>
                  <span className="font-bold">أخد بضاعة (على الحساب): </span>
                  <span className="font-bold font-mono text-neutral-800">
                    {(statementPeriodSummary.periodDebitsPiasters / 100).toFixed(2)} ج.م
                  </span>
                </div>
                <div>
                  <span className="font-bold">سدد فلوس (كاش): </span>
                  <span className="font-bold font-mono text-neutral-800">
                    {(statementPeriodSummary.periodCreditsPiasters / 100).toFixed(2)} ج.م
                  </span>
                </div>
                {statementPeriodSummary.periodRefundsPiasters !== undefined && statementPeriodSummary.periodRefundsPiasters > 0 && (
                  <div>
                    <span className="font-bold">مرتجع بضاعة (خصم): </span>
                    <span className="font-bold font-mono text-neutral-800">
                      -{(statementPeriodSummary.periodRefundsPiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                )}
                <div>
                  <span className="font-bold">حسابه القديم (اللي فات): </span>
                  <span className="font-bold font-mono text-neutral-800">
                    {(Math.abs(statementPeriodSummary.openingBalancePiasters) / 100).toFixed(2)} ج.م
                  </span>
                </div>
              </div>
            </div>

            {/* Operations Table */}
            <table className="w-full text-right text-[11px] mb-4">
              <thead>
                <tr className="border-b-2 border-neutral-800 text-[10px] font-bold">
                  <th className="pb-1">التاريخ</th>
                  <th className="pb-1">البيان</th>
                  <th className="pb-1 text-center">المبلغ</th>
                  <th className="pb-1 text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredStatementEntries.map((entry) => {
                  const isPayment = entry.type === 'payment';
                  const isDeposit = entry.type === 'deposit';
                  const isRefund = entry.type === 'refund';
                  const isCancel = entry.type === 'payment_cancel';
                  const alreadyCancelled = isPayment && isEntryCancelled && isEntryCancelled(entry.id);
                  const isCreditReduction = isPayment || isDeposit || isRefund;
                  const absAmt = (Math.abs(entry.amountPiasters) / 100).toFixed(2);

                  let label = entry.notes;
                  if (!label) {
                    if (isPayment) label = alreadyCancelled ? 'سداد اتلغى' : 'سداد كاش';
                    else if (isCancel) label = 'إلغاء سداد (قيد عكسي)';
                    else if (isRefund) label = 'مرتجع بضاعة (خصم)';
                    else if (isDeposit) label = 'سايب فلوس تحت الحساب';
                    else if (entry.type === 'sale') label = 'فاتورة على الحساب';
                    else label = 'رصيد افتتاحي';
                  }

                  return (
                    <tr key={entry.id} className={`py-1 ${alreadyCancelled ? 'text-neutral-400 line-through' : ''}`}>
                      <td className="py-1 text-[10px] font-mono text-neutral-600">
                        {new Date(entry.createdAt).toLocaleDateString('ar-EG-u-nu-latn')}
                      </td>
                      <td className="py-1">
                        <span className="font-semibold block">{label}</span>
                      </td>
                      <td className="py-1 text-center font-mono font-bold">
                        {isCreditReduction ? '-' : '+'}{absAmt}
                      </td>
                      <td className="py-1 text-left font-mono font-bold text-neutral-800">
                        {(entry.balanceAfterPiasters / 100).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Print Footer Notice */}
            <div className="pt-3 border-t border-dashed border-neutral-400 text-center text-[10px] text-neutral-500">
              <p>شكراً لتعاملكم معنا. يرجى مراجعة الرصيد في حال وجود أي استفسار.</p>
              <p className="font-mono mt-0.5">Rafiq POS System</p>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="h-14 bg-surface-2 hairline-t px-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-surface border border-line text-xs font-semibold text-ink hover:bg-surface-2 cursor-pointer"
          >
            رجوع
          </button>

          <button
            type="button"
            onClick={onExecutePrint}
            className="px-5 py-2 rounded bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>اطبع دلوقتي ({statementPrintMode === 'thermal' ? 'طابعة الكاشير' : 'طابعة A4'})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
