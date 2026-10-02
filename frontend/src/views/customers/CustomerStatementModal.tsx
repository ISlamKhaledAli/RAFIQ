import React from 'react';
import {
  FileText,
  X,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Clock,
  RotateCcw,
  Receipt,
  Printer,
  AlertTriangle,
} from 'lucide-react';
import type { Customer, CustomerLedgerEntry, CustomerBalanceVerification } from '../../types/models';
import { CustomSelect } from '../../components/CustomSelect';

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
  if (!isOpen || !selectedCustomer) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand" />
              <span className="text-sm font-bold text-ink">
                كشف حساب العميل: {selectedCustomer.name}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-danger-soft text-danger border border-danger-border font-mono font-bold">
                الرصيد الحالي: {(selectedCustomer.balancePiasters / 100).toFixed(2)} ج.م
              </span>
              <button
                type="button"
                onClick={() => void onVerifyBalance(selectedCustomer.id)}
                disabled={isVerifyingBalance || isFixingBalance}
                className="h-6 px-2 bg-surface hover:bg-surface-2 border border-line text-ink rounded text-[10.5px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                title="مراجعة وتدقيق مطابقة الرصيد الحالي مع مجموع حركات الديون والمدفوعات"
              >
                <ShieldCheck className={`w-3.5 h-3.5 text-brand ${isVerifyingBalance ? 'animate-spin' : ''}`} />
                <span>{isVerifyingBalance ? 'جاري التدقيق...' : 'تدقيق ومطابقة الرصيد'}</span>
              </button>
            </div>
            <button onClick={onClose} className="text-ink-muted hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Balance Verification Banner */}
          {balanceVerification && (
            <div className={`px-4 py-2 border-b flex items-center justify-between text-xs shrink-0 ${
              balanceVerification.isBalanced
                ? 'bg-brand-soft border-brand/20 text-brand'
                : 'bg-danger-soft border-danger/30 text-danger'
            }`}>
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {balanceVerification.isBalanced
                    ? `الرصيد سليم ومطابق 100% لسجل القيود (${balanceVerification.totalEntriesCount} حركة مالية مسجلة).`
                    : `تنبيه عدم تطابق: الرصيد المسجل (${(balanceVerification.storedBalancePiasters / 100).toFixed(2)} ج.م) يختلف عن مجموع الحركات (${(balanceVerification.calculatedBalancePiasters / 100).toFixed(2)} ج.م). الفارق: ${(Math.abs(balanceVerification.discrepancyPiasters) / 100).toFixed(2)} ج.م.`
                  }
                </span>
              </div>
              {!balanceVerification.isBalanced && (
                <button
                  type="button"
                  onClick={() => void onFixBalance(selectedCustomer.id)}
                  disabled={isFixingBalance}
                  className="px-2.5 py-1 bg-danger hover:bg-danger/90 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
                >
                  <span>{isFixingBalance ? 'جاري التصحيح...' : 'إعادة حساب وتصحيح الرصيد'}</span>
                </button>
              )}
            </div>
          )}

          {/* Audit Feedback Toast */}
          {auditFeedback && !balanceVerification && (
            <div className="bg-brand-soft border-b border-brand/20 px-4 py-1.5 text-xs text-brand font-semibold flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{auditFeedback}</span>
            </div>
          )}

          {/* Filter Bar & Quick Dates (Story 69 / Feature #43) */}
          <div className="bg-surface-2 hairline-b px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-ink-muted" />
              <span className="text-ink-muted text-[11px] font-semibold">تصفية التاريخ:</span>
              <input
                type="date"
                value={statementStartDate}
                onChange={(e) => setStatementStartDate(e.target.value)}
                className="h-7 px-2 bg-canvas border border-line rounded text-[11px] font-mono text-ink focus:outline-none focus:border-brand"
              />
              <span className="text-ink-muted text-[11px]">إلى</span>
              <input
                type="date"
                value={statementEndDate}
                onChange={(e) => setStatementEndDate(e.target.value)}
                className="h-7 px-2 bg-canvas border border-line rounded text-[11px] font-mono text-ink focus:outline-none focus:border-brand"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setStatementStartDate(''); setStatementEndDate(''); }}
                className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
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
                className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 7);
                  setStatementStartDate(d.toISOString().slice(0, 10));
                  setStatementEndDate(new Date().toISOString().slice(0, 10));
                }}
                className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
              >
                آخر 7 أيام
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setStatementStartDate(d.toISOString().slice(0, 10));
                  setStatementEndDate(new Date().toISOString().slice(0, 10));
                }}
                className="px-2 py-1 rounded text-[11px] bg-canvas border border-line hover:bg-surface text-ink font-medium"
              >
                هذا الشهر
              </button>
            </div>
          </div>

          {/* Statement Summary Strip */}
          <div className="grid grid-cols-4 divide-x divide-x-reverse divide-line bg-surface hairline-b text-center py-2 shrink-0">
            <div className="px-2">
              <span className="block text-[10px] text-ink-muted">رصيد أول المدة</span>
              <span className="font-mono text-xs font-bold text-ink">
                {(statementPeriodSummary.openingBalancePiasters / 100).toFixed(2)} ج.م
              </span>
            </div>
            <div className="px-2">
              <span className="block text-[10px] text-ink-muted">مبيعات الآجل (+)</span>
              <span className="font-mono text-xs font-bold text-danger">
                +{(statementPeriodSummary.periodDebitsPiasters / 100).toFixed(2)} ج.م
              </span>
            </div>
            <div className="px-2">
              <span className="block text-[10px] text-ink-muted">دفعات السداد (-)</span>
              <span className="font-mono text-xs font-bold text-paid">
                -{(statementPeriodSummary.periodCreditsPiasters / 100).toFixed(2)} ج.م
              </span>
            </div>
            <div className="px-2">
              <span className="block text-[10px] text-ink-muted">رصيد آخر المدة</span>
              <span className="font-mono text-xs font-bold text-ink">
                {(statementPeriodSummary.closingBalancePiasters / 100).toFixed(2)} ج.م
              </span>
            </div>
          </div>

          {/* Statement Table */}
          <div className="flex-1 overflow-auto p-4 bg-canvas">
            {isStatementLoading ? (
              <div className="py-12 text-center text-ink-muted text-xs">
                جاري جلب كشف الحساب من قاعدة البيانات...
              </div>
            ) : filteredStatementEntries.length === 0 ? (
              <div className="py-12 text-center text-ink-muted text-xs">
                <AlertCircle className="w-6 h-6 text-ink-muted/40 mx-auto mb-2" />
                لا توجد حركات مسجلة خلال الفترة المحددة.
              </div>
            ) : (
              <div className="bg-surface rounded border border-line overflow-hidden shadow-xs">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="h-8 bg-surface-2 hairline-b text-ink-muted font-bold text-[11px]">
                      <th className="px-3">التاريخ والوقت</th>
                      <th className="px-3">نوع الحركة</th>
                      <th className="px-3">المبلغ</th>
                      <th className="px-3">الرصيد بعدها</th>
                      <th className="px-3">البيان / الملاحظات</th>
                      <th className="px-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredStatementEntries.map((entry) => {
                      const isPayment = entry.type === 'payment';
                      const isSale = entry.type === 'sale';
                      const isCancel = entry.type === 'payment_cancel';
                      const alreadyCancelled = isPayment && isEntryCancelled(entry.id);

                      return (
                        <tr key={entry.id} className="h-9 hover:bg-surface-2">
                          <td className="px-3 text-ink-muted text-[11px] font-mono">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-ink-muted" />
                              <span>{new Date(entry.createdAt).toLocaleDateString('ar-EG-u-nu-latn')}</span>
                              <span className="text-[10px] text-ink-muted/70">
                                {new Date(entry.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </td>

                          <td className="px-3">
                            {isPayment ? (
                              alreadyCancelled ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-ink-muted line-through text-[10px] font-bold border border-line">
                                  سداد ملغى بقيد معاكس
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-paid-soft text-paid text-[10px] font-bold border border-paid-border">
                                  سداد نقدي
                                </span>
                              )
                            ) : isCancel ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-soft text-warn text-[10px] font-bold border border-warn-border">
                                <RotateCcw className="w-3 h-3" />
                                قيد معاكس (إلغاء سداد)
                              </span>
                            ) : isSale ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger-soft text-danger text-[10px] font-bold border border-danger-border">
                                <Receipt className="w-3 h-3" />
                                فاتورة آجل
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-2 text-ink-muted text-[10px] font-bold border border-line">
                                رصيد افتتاحي
                              </span>
                            )}
                          </td>

                          <td className={`px-3 font-mono font-bold ${
                            alreadyCancelled ? 'text-ink-muted line-through' :
                            isPayment ? 'text-paid' :
                            isCancel ? 'text-warn' : 'text-danger'
                          }`}>
                            {isPayment ? '-' : '+'}{(entry.amountPiasters / 100).toFixed(2)} ج.م
                          </td>

                          <td className="px-3 font-mono font-semibold text-ink">
                            {(entry.balanceAfterPiasters / 100).toFixed(2)} ج.م
                          </td>

                          <td className="px-3 text-ink-muted text-[11px]">
                            {entry.notes || '---'}
                          </td>

                          <td className="px-3 text-center">
                            {isPayment && !alreadyCancelled && (
                              <button
                                type="button"
                                onClick={() => setCancellingEntry(entry)}
                                className="inline-flex items-center gap-1 text-[11px] text-danger hover:text-red-700 hover:underline font-semibold"
                                title="إلغاء دفعة السداد بقيد معاكس دون حذف"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>إلغاء الدفعة</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="h-12 bg-surface-2 hairline-t px-4 flex items-center justify-between shrink-0">
            <span className="text-[11px] text-ink-muted">
              عدد الحركات المعروضة: {filteredStatementEntries.length}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenPrintStatement}
                className="px-3.5 py-1.5 rounded bg-brand text-white text-xs font-bold hover:bg-brand-hover flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة كشف الحساب</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded bg-surface border border-line text-xs font-semibold text-ink hover:bg-surface-2"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Payment Confirmation Modal (Contra-Entry) */}
      {cancellingEntry && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-lg shadow-2xl border border-line w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-12 bg-danger-soft hairline-b px-4 flex items-center justify-between shrink-0 text-danger font-bold text-sm">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                <span>إلغاء دفعة سداد (قيد معاكس)</span>
              </div>
              <button onClick={() => setCancellingEntry(null)} className="text-danger hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="p-3 bg-surface-2 rounded border border-line space-y-1.5">
                <div className="flex justify-between text-ink">
                  <span className="text-ink-muted font-medium">العميل:</span>
                  <span className="font-bold">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between text-ink">
                  <span className="text-ink-muted font-medium">مبلغ الدفعة المراد إلغاؤها:</span>
                  <span className="font-bold font-mono text-danger text-[13px]">
                    {(cancellingEntry.amountPiasters / 100).toFixed(2)} ج.م
                  </span>
                </div>
                <div className="flex justify-between text-ink">
                  <span className="text-ink-muted font-medium">تاريخ الدفعة:</span>
                  <span className="font-mono text-[11px]">
                    {new Date(cancellingEntry.createdAt).toLocaleString('ar-EG-u-nu-latn')}
                  </span>
                </div>
              </div>

              {/* Accounting explanation alert */}
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded flex items-start gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div className="text-[11px] leading-relaxed">
                  <strong>قيد محاسبي معاكس:</strong> لن يتم حذف أي سجل من قاعدة البيانات، بل سيتم تسجيل قيد معاكس يُعيد رصيد دين العميل كما كان فوراً (
                  <span className="font-bold font-mono">
                    {((selectedCustomer.balancePiasters + cancellingEntry.amountPiasters) / 100).toFixed(2)} ج.م
                  </span>
                  ).
                </div>
              </div>

              <div className="mb-2">
                <label className="block text-ink font-semibold mb-1">سبب إلغاء الدفعة *</label>
                <CustomSelect
                  value={cancelReasonPreset}
                  onChange={(val) => setCancelReasonPreset(val)}
                  size="sm"
                  options={[
                    { value: 'سجلت بالخطأ', label: 'سجلت بالخطأ' },
                    { value: 'سجلت بمبلغ خاطئ', label: 'سجلت بمبلغ خاطئ' },
                    { value: 'سجلت لحساب عميل آخر بالخطأ', label: 'سجلت لحساب عميل آخر بالخطأ' },
                    { value: 'شيك أو تحويل مرتجع بدون رصيد', label: 'شيك أو تحويل مرتجع بدون رصيد' },
                    { value: 'أخرى', label: 'سبب آخر...' },
                  ]}
                />

                {cancelReasonPreset === 'أخرى' && (
                  <input
                    type="text"
                    value={customCancelReason}
                    onChange={(e) => setCustomCancelReason(e.target.value)}
                    placeholder="اكتب سبب الإلغاء بالتفصيل..."
                    className="w-full h-8 px-3 mt-2 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink text-xs"
                    autoFocus
                  />
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2 hairline-t">
                <button
                  type="button"
                  onClick={() => setCancellingEntry(null)}
                  disabled={isCancellingPayment}
                  className="px-4 py-1.5 rounded bg-surface border border-line hover:bg-surface-2 text-ink font-medium"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={onConfirmCancelPayment}
                  disabled={isCancellingPayment}
                  className="px-5 py-1.5 rounded bg-danger text-white hover:bg-red-700 font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isCancellingPayment ? 'جاري الإلغاء...' : 'تأكيد إلغاء السداد'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
