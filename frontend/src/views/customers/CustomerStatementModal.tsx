import React from 'react';
import {
  FileText,
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Receipt,
  Printer,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
} from 'lucide-react';
import type { Customer, CustomerLedgerEntry, CustomerBalanceVerification } from '../../types/models';
import { CustomSelect } from '../../components/CustomSelect';
import { CustomDateRangePicker } from '../../components/CustomDatePicker';
import { CustomerReceiptVoucherModal } from './CustomerReceiptVoucherModal';
import { PaginationBar } from '../../components/PaginationBar';
import { formatArabicCurrency } from '../../utils/money';

export interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: Customer | null;
  balanceVerification: CustomerBalanceVerification | null;
  isVerifyingBalance: boolean;
  isFixingBalance: boolean;
  auditFeedback: string | null;
  onVerifyBalance: (customerId: string) => Promise<void>;
  onFixBalance: (customerId: string) => Promise<void>;
  statementStartDate: string;
  setStatementStartDate: (d: string) => void;
  statementEndDate: string;
  setStatementEndDate: (d: string) => void;
  statementPeriodSummary: {
    openingBalancePiasters: number;
    periodDebitsPiasters: number;
    periodCreditsPiasters: number;
    periodRefundsPiasters?: number;
    closingBalancePiasters: number;
  };
  isStatementLoading: boolean;
  filteredStatementEntries: CustomerLedgerEntry[];
  isEntryCancelled: (entryId: string) => boolean;
  cancellingEntry: CustomerLedgerEntry | null;
  setCancellingEntry: (entry: CustomerLedgerEntry | null) => void;
  cancelReasonPreset: string;
  setCancelReasonPreset: (r: string) => void;
  customCancelReason: string;
  setCustomCancelReason: (r: string) => void;
  isCancellingPayment: boolean;
  onConfirmCancelPayment: () => void;
  onOpenPrintStatement: () => void;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  isOpen,
  onClose,
  selectedCustomer,
  balanceVerification,
  isVerifyingBalance,
  isFixingBalance,
  auditFeedback,
  onVerifyBalance,
  onFixBalance,
  statementStartDate,
  setStatementStartDate,
  statementEndDate,
  setStatementEndDate,
  statementPeriodSummary,
  isStatementLoading,
  filteredStatementEntries,
  isEntryCancelled,
  cancellingEntry,
  setCancellingEntry,
  cancelReasonPreset,
  setCancelReasonPreset,
  customCancelReason,
  setCustomCancelReason,
  isCancellingPayment,
  onConfirmCancelPayment,
  onOpenPrintStatement,
}) => {
  const [viewingReceiptEntry, setViewingReceiptEntry] = React.useState<CustomerLedgerEntry | null>(null);
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(25);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedCustomer?.id, statementStartDate, statementEndDate]);

  const paginatedStatementEntries = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredStatementEntries.slice(startIndex, startIndex + pageSize);
  }, [filteredStatementEntries, currentPage, pageSize]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (cancellingEntry) {
          setCancellingEntry(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, cancellingEntry, setCancellingEntry, onClose]);

  if (!isOpen || !selectedCustomer) return null;

  return (
    <>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            if (cancellingEntry) {
              setCancellingEntry(null);
            } else {
              onClose();
            }
          }
        }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span className="text-sm font-bold text-ink dark:text-ink-dark">
                كشف حساب الزبون: {selectedCustomer.name}
              </span>
              <span className={`text-[11px] px-2.5 py-0.5 rounded font-bold border ${
                selectedCustomer.balancePiasters > 0
                  ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30'
                  : selectedCustomer.balancePiasters < 0
                  ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-emerald-800/40'
                  : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark'
              }`}>
                {selectedCustomer.balancePiasters > 0
                  ? `عليه فلوس: ${formatArabicCurrency(selectedCustomer.balancePiasters, true)}`
                  : selectedCustomer.balancePiasters < 0
                  ? `سايب فلوس في المحل: ${formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters), true)}`
                  : 'حسابه خالص تماماً (0.00 ج.م)'}
              </span>
              <button
                type="button"
                onClick={() => void onVerifyBalance(selectedCustomer.id)}
                disabled={isVerifyingBalance || isFixingBalance}
                className="h-6 px-2 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded text-[10.5px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                title="مراجعة وتدقيق مطابقة الرصيد الحالي مع مجموع حركات الديون والمدفوعات"
              >
                <ShieldCheck className={`w-3.5 h-3.5 text-brand dark:text-brand-bright ${isVerifyingBalance ? 'animate-spin' : ''}`} />
                <span>{isVerifyingBalance ? 'بنطابق الحساب...' : 'مطابقة الرصيد وتدقيقه'}</span>
              </button>
            </div>
            <button onClick={onClose} className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Balance Verification Banner */}
          {balanceVerification && (
            <div className={`px-4 py-2 border-b flex items-center justify-between text-xs shrink-0 ${
              balanceVerification.isBalanced
                ? 'bg-brand-soft dark:bg-brand-dark-soft border-brand/20 dark:border-brand-bright/20 text-brand dark:text-brand-bright'
                : 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
            }`}>
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {balanceVerification.isBalanced
                    ? `الرصيد سليم ومطابق 100% لسجل القيود (${balanceVerification.totalEntriesCount} حركة مسجلة بالدفتر).`
                    : `تنبيه عدم تطابق: الرصيد المسجل (${formatArabicCurrency(balanceVerification.storedBalancePiasters, true)}) يختلف عن مجموع الحركات (${formatArabicCurrency(balanceVerification.calculatedBalancePiasters, true)}). الفارق: ${formatArabicCurrency(Math.abs(balanceVerification.discrepancyPiasters), true)}.`
                  }
                </span>
              </div>
              {!balanceVerification.isBalanced && (
                <button
                  type="button"
                  onClick={() => void onFixBalance(selectedCustomer.id)}
                  disabled={isFixingBalance}
                  className="px-2.5 py-1 bg-danger hover:bg-danger/90 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  <span>{isFixingBalance ? 'جاري التصحيح...' : 'إعادة حساب وتصحيح الرصيد'}</span>
                </button>
              )}
            </div>
          )}

          {/* Audit Feedback Toast */}
          {auditFeedback && !balanceVerification && (
            <div className="bg-brand-soft dark:bg-brand-soft/20 border-b border-brand/20 dark:border-brand-bright/20 px-4 py-1.5 text-xs text-brand dark:text-brand-bright font-semibold flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{auditFeedback}</span>
            </div>
          )}

          {/* Filter Bar & Quick Dates (Story 69 / Feature #43) */}
          <div className="bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-ink-muted dark:text-ink-dark-muted text-[11px] font-semibold">الفترة:</span>
              <CustomDateRangePicker
                startDate={statementStartDate}
                endDate={statementEndDate}
                onChange={(start, end) => {
                  setStatementStartDate(start);
                  setStatementEndDate(end);
                }}
                size="sm"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setStatementStartDate(''); setStatementEndDate(''); }}
                className="px-2 py-1 rounded text-[11px] bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark hover:bg-surface dark:hover:bg-surface-dark text-ink dark:text-ink-dark font-medium cursor-pointer"
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  setStatementStartDate(todayStr);
                  setStatementEndDate(todayStr);
                }}
                className="px-2 py-1 rounded text-[11px] bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark hover:bg-surface dark:hover:bg-surface-dark text-ink dark:text-ink-dark font-medium cursor-pointer"
              >
                النهاردة
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 7);
                  setStatementStartDate(d.toISOString().slice(0, 10));
                  setStatementEndDate(new Date().toISOString().slice(0, 10));
                }}
                className="px-2 py-1 rounded text-[11px] bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark hover:bg-surface dark:hover:bg-surface-dark text-ink dark:text-ink-dark font-medium cursor-pointer"
              >
                آخر أسبوع
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setStatementStartDate(d.toISOString().slice(0, 10));
                  setStatementEndDate(new Date().toISOString().slice(0, 10));
                }}
                className="px-2 py-1 rounded text-[11px] bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark hover:bg-surface dark:hover:bg-surface-dark text-ink dark:text-ink-dark font-medium cursor-pointer"
              >
                الشهر ده
              </button>
            </div>
          </div>

          {/* Statement Summary Strip */}
          <div className="bg-surface dark:bg-surface-dark hairline-b border-line dark:border-line-dark px-4 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-3">
            {/* Hero Net Balance Card */}
            <div className={`flex items-center gap-3 px-3.5 py-2 rounded-lg border flex-1 min-w-[280px] ${
              statementPeriodSummary.closingBalancePiasters > 0
                ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                : statementPeriodSummary.closingBalancePiasters < 0
                ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-emerald-800/40 text-paid dark:text-paid-bright'
                : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark'
            }`}>
              <div className="shrink-0 p-2 rounded-md bg-surface dark:bg-surface-dark shadow-xs">
                {statementPeriodSummary.closingBalancePiasters > 0 ? (
                  <ArrowUpRight className="w-5 h-5 text-danger dark:text-danger-bright" />
                ) : statementPeriodSummary.closingBalancePiasters < 0 ? (
                  <ArrowDownLeft className="w-5 h-5 text-paid dark:text-paid-bright" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-paid dark:text-paid-bright" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink dark:text-ink-dark">
                    {statementPeriodSummary.closingBalancePiasters > 0
                      ? 'حساب الزبون: عليه فلوس للمحل (شكك)'
                      : statementPeriodSummary.closingBalancePiasters < 0
                      ? 'حساب الزبون: سايب فلوس في المحل (له رصيد)'
                      : 'حساب الزبون: حسابه خالص بالمليم (0.00 ج.م)'}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    statementPeriodSummary.closingBalancePiasters > 0
                      ? 'bg-danger text-white'
                      : statementPeriodSummary.closingBalancePiasters < 0
                      ? 'bg-paid text-white'
                      : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted'
                  }`}>
                    {statementPeriodSummary.closingBalancePiasters > 0
                      ? 'عليه فلوس'
                      : statementPeriodSummary.closingBalancePiasters < 0
                      ? 'له فلوس'
                      : 'خالص'}
                  </span>
                </div>
                <div className="text-lg font-black font-mono tracking-tight mt-0.5">
                  {formatArabicCurrency(Math.abs(statementPeriodSummary.closingBalancePiasters), true)}
                </div>
              </div>
            </div>

            {/* Simplified Period Details */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Period Purchases */}
              <div className="px-3 py-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-right min-w-[130px]">
                <span className="block text-[10px] text-ink-muted dark:text-ink-dark-muted font-bold">أخد بضاعة (على الحساب)</span>
                <span className="font-mono text-xs font-bold text-danger dark:text-danger-bright">
                  {formatArabicCurrency(statementPeriodSummary.periodDebitsPiasters, true)}
                </span>
              </div>

              {/* Period Payments */}
              <div className="px-3 py-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-right min-w-[130px]">
                <span className="block text-[10px] text-ink-muted dark:text-ink-dark-muted font-bold">سدد فلوس (دفع كاش)</span>
                <span className="font-mono text-xs font-bold text-paid dark:text-paid-bright">
                  {formatArabicCurrency(statementPeriodSummary.periodCreditsPiasters, true)}
                </span>
              </div>

              {/* Period Refunds if any */}
              {Boolean(statementPeriodSummary.periodRefundsPiasters && statementPeriodSummary.periodRefundsPiasters > 0) && (
                <div className="px-3 py-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-right min-w-[130px]">
                  <span className="block text-[10px] text-ink-muted dark:text-ink-dark-muted font-bold">مرتجع بضاعة (خصم)</span>
                  <span className="font-mono text-xs font-bold text-paid dark:text-paid-bright">
                    -{formatArabicCurrency(statementPeriodSummary.periodRefundsPiasters!, true)}
                  </span>
                </div>
              )}

              {/* Prior Balance */}
              <div className="px-3 py-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-right min-w-[135px]">
                <span className="block text-[10px] text-ink-muted dark:text-ink-dark-muted font-bold">حسابه القديم (اللي فات)</span>
                <span className="font-mono text-xs font-bold text-ink dark:text-ink-dark">
                  {formatArabicCurrency(Math.abs(statementPeriodSummary.openingBalancePiasters), true)}
                  {statementPeriodSummary.openingBalancePiasters > 0 && (
                    <span className="text-[9px] text-danger dark:text-danger-bright mr-1 font-sans font-medium">(كان عليه)</span>
                  )}
                  {statementPeriodSummary.openingBalancePiasters < 0 && (
                    <span className="text-[9px] text-paid dark:text-paid-bright mr-1 font-sans font-medium">(كان سايب فلوس)</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="flex-1 overflow-auto p-4 bg-canvas dark:bg-canvas-dark">
            {isStatementLoading ? (
              <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted text-xs">
                بنحمّل حركات كشف الحساب من الدفتر...
              </div>
            ) : filteredStatementEntries.length === 0 ? (
              <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted text-xs">
                <AlertCircle className="w-6 h-6 text-ink-muted/40 dark:text-ink-dark-muted/40 mx-auto mb-2" />
                مفيش حركات مسجلة خلال الفترة دي.
              </div>
            ) : (
              <div className="bg-surface dark:bg-surface-dark rounded border border-line dark:border-line-dark overflow-hidden shadow-xs">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="h-8 bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold text-[11px]">
                      <th className="px-3">الوقت والتاريخ</th>
                      <th className="px-3">نوع الحركة</th>
                      <th className="px-3">المبلغ</th>
                      <th className="px-3">الحساب بعد الحركة</th>
                      <th className="px-3">تفاصيل وملاحظات</th>
                      <th className="px-3 text-center">العملية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {paginatedStatementEntries.map((entry) => {
                      const isPayment = entry.type === 'payment';
                      const isDeposit = entry.type === 'deposit';
                      const isSale = entry.type === 'sale';
                      const isCancel = entry.type === 'payment_cancel';
                      const isRefund = entry.type === 'refund';
                      const alreadyCancelled = isPayment && isEntryCancelled(entry.id);

                      return (
                        <tr key={entry.id} className="h-9 hover:bg-surface-2 dark:hover:bg-surface-dark-2">
                          <td className="px-3 text-ink-muted dark:text-ink-dark-muted text-[11px] font-mono">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                              <span>{new Date(entry.createdAt).toLocaleDateString('ar-EG-u-nu-latn')}</span>
                              <span className="text-[10px] text-ink-muted/70 dark:text-ink-dark-muted/70">
                                {new Date(entry.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </td>

                          <td className="px-3">
                            {isPayment ? (
                              alreadyCancelled ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted line-through text-[10px] font-bold border border-line dark:border-line-dark">
                                  سداد اتلغى
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-[10px] font-bold border border-paid-border dark:border-emerald-800/40">
                                  سداد كاش
                                </span>
                              )
                            ) : isCancel ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright text-[10px] font-bold border border-warn-border dark:border-warn-bright/30">
                                <RotateCcw className="w-3 h-3" />
                                إلغاء سداد (قيد عكسي)
                              </span>
                            ) : isDeposit ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-[10px] font-bold border border-paid-border dark:border-emerald-800/40">
                                <Sparkles className="w-3 h-3 text-paid dark:text-paid-bright" />
                                سايب فلوس تحت الحساب
                              </span>
                            ) : isSale ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright text-[10px] font-bold border border-danger-border dark:border-danger-bright/30">
                                <Receipt className="w-3 h-3" />
                                فاتورة شكك (على النوتة)
                              </span>
                            ) : isRefund ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-[10px] font-bold border border-paid-border dark:border-emerald-800/40">
                                <RotateCcw className="w-3 h-3 text-paid dark:text-paid-bright" />
                                مرتجع بضاعة (خصم)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted text-[10px] font-bold border border-line dark:border-line-dark">
                                حساب قديم (رصيد افتتاحي)
                              </span>
                            )}
                          </td>

                          <td className={`px-3 font-mono font-bold ${
                            alreadyCancelled ? 'text-ink-muted dark:text-ink-dark-muted line-through' :
                            (isPayment || isDeposit || isRefund) ? 'text-paid dark:text-paid-bright' :
                            isCancel ? 'text-warn dark:text-warn-bright' : 'text-danger dark:text-danger-bright'
                          }`}>
                            {(isPayment || isDeposit || isRefund) ? '-' : '+'}{formatArabicCurrency(Math.abs(entry.amountPiasters), true)}
                          </td>

                          <td className="px-3 font-mono font-semibold text-ink dark:text-ink-dark">
                            {formatArabicCurrency(entry.balanceAfterPiasters, true)}
                          </td>

                          <td className="px-3 text-ink-muted dark:text-ink-dark-muted text-[11px]">
                            {entry.notes || '---'}
                          </td>

                          <td className="px-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {isPayment && (
                                <button
                                  type="button"
                                  onClick={() => setViewingReceiptEntry(entry)}
                                  className="inline-flex items-center gap-1 text-[11px] text-brand dark:text-brand-bright hover:underline font-semibold cursor-pointer"
                                  title="عرض وطباعة سند القبض المالي للدفعة"
                                >
                                  <Receipt className="w-3 h-3" />
                                  <span>سند قبض</span>
                                </button>
                              )}
                              {isPayment && !alreadyCancelled && (
                                <button
                                  type="button"
                                  onClick={() => setCancellingEntry(entry)}
                                  className="inline-flex items-center gap-1 text-[11px] text-danger dark:text-danger-bright hover:text-red-700 dark:hover:text-red-300 hover:underline font-semibold cursor-pointer"
                                  title="إلغاء دفعة السداد بقيد معاكس دون حذف"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>إلغاء</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <PaginationBar
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalCount={filteredStatementEntries.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setCurrentPage(1);
                  }}
                  pageSizeOptions={[25, 50, 100]}
                  itemLabel="حركة كشف حساب"
                  className="rounded-none border-x-0 border-b-0 border-t"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-t border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
            <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
              إجمالي الحركات: {filteredStatementEntries.length}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenPrintStatement}
                className="px-3.5 py-1.5 rounded bg-brand text-white text-xs font-bold hover:bg-brand-hover flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة كشف الحساب</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-semibold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer"
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Payment Confirmation Modal (Contra-Entry) */}
      {cancellingEntry && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-surface dark:bg-surface-dark rounded-lg shadow-2xl border border-line dark:border-line-dark w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-12 bg-danger-soft dark:bg-danger-dark-soft hairline-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0 text-danger dark:text-danger-bright font-bold text-sm">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                <span>إلغاء سداد بالخطأ (قيد عكسي)</span>
              </div>
              <button onClick={() => setCancellingEntry(null)} className="text-danger dark:text-danger-bright hover:opacity-75 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark space-y-1.5">
                <div className="flex justify-between text-ink dark:text-ink-dark">
                  <span className="text-ink-muted dark:text-ink-dark-muted font-medium">الزبون:</span>
                  <span className="font-bold">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-ink dark:text-ink-dark">
                  <span className="text-ink-muted dark:text-ink-dark-muted font-medium">المبلغ اللي هيتلغى:</span>
                  <span className="font-bold font-mono text-danger dark:text-danger-bright text-[13px]">
                    {formatArabicCurrency(cancellingEntry.amountPiasters, true)}
                  </span>
                </div>
                <div className="flex justify-between text-ink dark:text-ink-dark">
                  <span className="text-ink-muted dark:text-ink-dark-muted font-medium">وقت السداد:</span>
                  <span className="font-mono text-[11px]">
                    {new Date(cancellingEntry.createdAt).toLocaleString('ar-EG-u-nu-latn')}
                  </span>
                </div>
              </div>

              {/* Accounting explanation alert */}
              <div className="p-2.5 bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 rounded flex items-start gap-2 text-ink dark:text-ink-dark">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warn dark:text-warn-bright" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="text-warn dark:text-warn-bright">ملاحظة أمان:</strong> السيستم مش هيمسح الحركة من الدفاتر، بس هيسجل قيد عكسي عشان يرجع الفلوس على حساب الزبون فوراً زي ما كانت بالظبط (
                  <span className="font-bold font-mono text-danger dark:text-danger-bright">
                    {formatArabicCurrency(selectedCustomer.balancePiasters + cancellingEntry.amountPiasters, true)}
                  </span>
                  ).
                </div>
              </div>

              <div className="mb-2">
                <label className="block text-ink dark:text-ink-dark font-semibold mb-1">سبب إلغاء السداد *</label>
                <CustomSelect
                  value={cancelReasonPreset}
                  onChange={(val) => setCancelReasonPreset(val)}
                  size="sm"
                  options={[
                    { value: 'سجلت بالخطأ', label: 'اتسجلت بالخطأ' },
                    { value: 'سجلت بمبلغ خاطئ', label: 'المبلغ اتكتب غلط' },
                    { value: 'سجلت لحساب عميل آخر بالخطأ', label: 'اتسجلت لزبون تاني بالغلط' },
                    { value: 'شيك أو تحويل مرتجع بدون رصيد', label: 'تحويل أو شيك رجع' },
                    { value: 'أخرى', label: 'سبب تاني...' },
                  ]}
                />

                {cancelReasonPreset === 'أخرى' && (
                  <input
                    type="text"
                    value={customCancelReason}
                    onChange={(e) => setCustomCancelReason(e.target.value)}
                    placeholder="اكتب سبب الإلغاء هنا..."
                    className="w-full h-8 px-3 mt-2 bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded focus:outline-none focus:border-brand dark:focus:border-brand-bright text-ink dark:text-ink-dark text-xs"
                    autoFocus
                  />
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2 hairline-t border-line dark:border-line-dark">
                <button
                  type="button"
                  onClick={() => setCancellingEntry(null)}
                  disabled={isCancellingPayment}
                  className="px-4 py-1.5 rounded bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark font-medium cursor-pointer"
                >
                  رجوع
                </button>
                <button
                  type="button"
                  onClick={onConfirmCancelPayment}
                  disabled={isCancellingPayment}
                  className="px-5 py-1.5 rounded bg-danger text-white hover:bg-red-700 font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isCancellingPayment ? 'بنلغي السداد...' : 'تأكيد إلغاء السداد'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Receipt Voucher Printable Modal */}
      {viewingReceiptEntry && selectedCustomer && (
        <CustomerReceiptVoucherModal
          isOpen={true}
          onClose={() => setViewingReceiptEntry(null)}
          customer={selectedCustomer}
          entry={viewingReceiptEntry}
        />
      )}
    </>
  );
};
