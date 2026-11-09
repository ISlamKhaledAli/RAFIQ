import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Customer, CustomerLedgerEntry } from '../../types/models';
import { getConfiguredReportPaper } from '../../utils/printReport';
import { usePrintReport } from '../../hooks/usePrintReport';

import { AppButton } from '../../components/AppButton';
import { formatPhoneDisplay } from '../../utils/phoneFormat';
// date / description / amount / balance
const COMPACT_COLS = 'grid-cols-[minmax(0,20fr)_minmax(0,34fr)_minmax(0,22fr)_minmax(0,24fr)]';

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
}) => {
  // Roll width used by the cashier-printer mode; follows the saved report paper setting (A4 falls back to 80mm)
  const [rollPaper, setRollPaper] = React.useState<'80mm' | '58mm'>('80mm');

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void getConfiguredReportPaper().then((paper) => {
      if (!cancelled) setRollPaper(paper === '58mm' ? '58mm' : '80mm');
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { print: handlePrint, printing } = usePrintReport({
    reportName: 'كشف حساب ' + (selectedCustomer ? selectedCustomer.name : 'العميل'),
    kind: 'compact',
    paper: statementPrintMode === 'thermal' ? rollPaper : 'a4',
    hasData: filteredStatementEntries.length > 0,
  });

  if (!isOpen || !selectedCustomer) return null;

  const isCompact = statementPrintMode === 'thermal';
  const isNarrowRoll = isCompact && rollPaper === '58mm';

  const entryRows = filteredStatementEntries.map((entry) => {
    const isPayment = entry.type === 'payment';
    const isDeposit = entry.type === 'deposit';
    const isRefund = entry.type === 'refund';
    const isCancel = entry.type === 'payment_cancel';
    const cancelled = Boolean(isPayment && isEntryCancelled && isEntryCancelled(entry.id));
    const isCreditReduction = isPayment || isDeposit || isRefund;
    const absAmt = (Math.abs(entry.amountPiasters) / 100).toFixed(2);

    let label = entry.notes;
    if (!label) {
      if (isPayment) label = cancelled ? 'سداد اتلغى' : 'سداد كاش';
      else if (isCancel) label = 'إلغاء سداد (قيد عكسي)';
      else if (isRefund) label = 'مرتجع بضاعة (خصم)';
      else if (isDeposit) label = 'سايب فلوس تحت الحساب';
      else if (entry.type === 'sale') label = 'فاتورة على الحساب';
      else label = 'رصيد افتتاحي';
    }

    const when = new Date(entry.createdAt);
    return {
      id: entry.id,
      label,
      cancelled,
      amount: `${isCreditReduction ? '-' : '+'}${absAmt}`,
      balance: (entry.balanceAfterPiasters / 100).toFixed(2),
      fullDate: when.toLocaleDateString('ar-EG-u-nu-latn'),
      shortDate: when.toLocaleDateString('ar-EG-u-nu-latn', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    };
  });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Mode Toggle & Actions */}
        <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-brand dark:text-brand-bright" />
            <span className="text-sm font-bold text-ink dark:text-ink-dark">معاينة وصل كشف الحساب قبل الطباعة</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatementPrintMode('thermal')}
                className={`px-2.5 py-1 rounded font-semibold text-micro cursor-pointer ${
                  statementPrintMode === 'thermal' ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs' : 'text-ink-muted dark:text-ink-dark-muted'
                }`}
              >
                وصل حراري (بون كاشير)
              </button>
              <button
                type="button"
                onClick={() => setStatementPrintMode('a4')}
                className={`px-2.5 py-1 rounded font-semibold text-micro cursor-pointer ${
                  statementPrintMode === 'a4' ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs' : 'text-ink-muted dark:text-ink-dark-muted'
                }`}
              >
                ورقة كبيرة (A4)
              </button>
            </div>

            <AppButton variant="subtle" size="xs" icon={X} onClick={onClose} aria-label="إغلاق" />
          </div>
        </div>

        {/* Printable Preview Sheet */}
        <div className="flex-1 overflow-y-auto p-4 bg-canvas dark:bg-canvas-dark flex justify-center">
          <div
            data-print-root
            className={`bg-white text-black p-5 shadow-md border border-neutral-300 font-sans print:p-0 print:shadow-none print:border-0 ${
              isCompact ? `${isNarrowRoll ? 'w-[219px]' : 'w-[320px]'} text-xs print-compact` : 'w-full text-sm'
            }`}
          >
            {/* Store Header */}
            <div className="text-center pb-3 border-b border-black mb-3">
              <h2 className="text-base font-extrabold mb-0.5">رفيق لنقاط البيع وإدارة المتاجر</h2>
              <p className="text-micro text-neutral-600 font-semibold">كشف حساب زبون تفصيلي</p>
              <p className="text-micro text-neutral-500 font-mono mt-0.5">
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
                  <span className="font-mono">{formatPhoneDisplay(selectedCustomer.phone)}</span>
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
                </span>
              </div>
              <div className={`grid ${isCompact ? 'grid-cols-1 text-micro' : 'grid-cols-2 sm:grid-cols-4 text-micro'} gap-1 text-neutral-600 pt-0.5`}>
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

            {/* Operations: full table on A4, narrow date / description / amount / balance rows on rolls */}
            {isCompact ? (
              <div className="mb-4 text-micro">
                {!isNarrowRoll && (
                  <div className={`grid print-keep-cols ${COMPACT_COLS} gap-x-1 border-b-2 border-neutral-800 pb-1 font-bold`}>
                    <span>التاريخ</span>
                    <span>البيان</span>
                    <span className="text-center">المبلغ</span>
                    <span className="text-left">الرصيد</span>
                  </div>
                )}
                {entryRows.map((row) => (
                  <div
                    key={row.id}
                    className={`grid print-keep-cols ${isNarrowRoll ? 'grid-cols-2' : COMPACT_COLS} gap-x-1 gap-y-0.5 py-1 border-b border-dashed border-neutral-400 break-inside-avoid ${
                      row.cancelled ? 'text-neutral-400 line-through' : ''
                    }`}
                  >
                    <span className="font-mono text-neutral-600 break-words min-w-0">{row.shortDate}</span>
                    <span className="font-semibold break-words min-w-0">{row.label}</span>
                    <span className={`font-mono font-bold break-words min-w-0 ${isNarrowRoll ? '' : 'text-center'}`}>{row.amount}</span>
                    <span className="font-mono font-bold text-neutral-800 break-words min-w-0 text-left">{row.balance}</span>
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full text-right text-micro mb-4">
                <thead>
                  <tr className="border-b-2 border-neutral-800 text-micro font-bold">
                    <th className="pb-1">التاريخ</th>
                    <th className="pb-1">البيان</th>
                    <th className="pb-1 text-center">المبلغ</th>
                    <th className="pb-1 text-left">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {entryRows.map((row) => (
                    <tr key={row.id} className={`py-1 ${row.cancelled ? 'text-neutral-400 line-through' : ''}`}>
                      <td className="py-1 text-micro font-mono text-neutral-600">{row.fullDate}</td>
                      <td className="py-1">
                        <span className="font-semibold block">{row.label}</span>
                      </td>
                      <td className="py-1 text-center font-mono font-bold">{row.amount}</td>
                      <td className="py-1 text-left font-mono font-bold text-neutral-800">{row.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Print Footer Notice */}
            <div className="pt-3 border-t border-dashed border-neutral-400 text-center text-micro text-neutral-500">
              <p>شكراً لتعاملكم معنا. يرجى مراجعة الرصيد في حال وجود أي استفسار.</p>
              <p className="font-mono mt-0.5">نظام رفيق لنقاط البيع</p>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="h-14 bg-surface-2 dark:bg-surface-dark-2 hairline-t border-line dark:border-line-dark px-4 flex items-center justify-end shrink-0">
          <AppButton variant="primary" icon={Printer} onClick={handlePrint} loading={printing}>
            اطبع دلوقتي
          </AppButton>
        </div>
      </div>
    </div>
  );
};
