import React, { useState, useEffect, useCallback } from 'react';
import { 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  Printer, 
  History, 
  Coins, 
  TrendingUp, 
  X, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DailyClosing, DailyClosingPreview } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { MoneyInput } from './MoneyInput';

interface DailyClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate?: string;
  onClosingCompleted?: (closing: DailyClosing) => void;
}

export const DailyClosingModal: React.FC<DailyClosingModalProps> = ({
  isOpen,
  onClose,
  targetDate,
  onClosingCompleted
}) => {
  const [preview, setPreview] = useState<DailyClosingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Closing form state
  const [actualCashPiasters, setActualCashPiasters] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [confirmSuspiciousDate, setConfirmSuspiciousDate] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [savedClosing, setSavedClosing] = useState<DailyClosing | null>(null);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);

  // History view state
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<DailyClosing[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<DailyClosingPreview>('closing:getPreview', {
        businessDate: targetDate || null
      });
      if (res) {
        setPreview(res);
        if (res.isAlreadyClosed && res.existingClosing) {
          setSavedClosing(res.existingClosing);
          setActualCashPiasters(res.existingClosing.actualCashPiasters);
          setNotes(res.existingClosing.notes || '');
        } else {
          setSavedClosing(null);
          // Default actual cash to expected cash initially
          setActualCashPiasters(res.expectedCashPiasters);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError('تعذر تحميل بيانات معاينة الإقفال اليومي.');
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    if (isOpen) {
      setPrintFeedback(null);
      setSavedClosing(null);
      setConfirmSuspiciousDate(false);
      void loadPreview();
    }
  }, [isOpen, loadPreview]);

  const loadHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const res = await invoke<DailyClosing[]>('closing:getHistory', { limit: 30 });
      setHistoryList(res || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSaveClosing = async () => {
    if (!preview) return;

    if (preview.isDateSuspicious && !confirmSuspiciousDate) {
      setError('تاريخ الجهاز مشكوك فيه! يرجى وضع علامة التأكيد الصريح للاستمرار.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPrintFeedback(null);

    try {
      const closingResult = await invoke<DailyClosing>('closing:save', {
        businessDate: preview.businessDate,
        actualCashPiasters: actualCashPiasters,
        notes: notes.trim(),
        confirmSuspiciousDate: confirmSuspiciousDate
      });

      if (closingResult) {
        setSavedClosing(closingResult);
        if (onClosingCompleted) {
          onClosingCompleted(closingResult);
        }
        // Auto print closing receipt
        handlePrintReceipt(closingResult);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'تعذر حفظ الإقفال اليومي. يرجى مراجعة الصلاحيات.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReceipt = async (closingToPrint?: DailyClosing) => {
    const target = closingToPrint || savedClosing || preview?.existingClosing;
    if (!target) return;

    setIsPrinting(true);
    setPrintFeedback(null);
    try {
      const res = await invoke<{ success: boolean; message: string }>('closing:print', {
        closing: target
      });
      if (res && res.success) {
        setPrintFeedback('تم إرسال إيصال الإقفال اليومي (Z-Report) إلى الطابعة بنجاح.');
      } else {
        setPrintFeedback(res?.message || 'تمت محاولة الطباعة.');
      }
    } catch (err: unknown) {
      console.error(err);
      setPrintFeedback('تعذر الاتصال بالطابعة أو حدث خطأ أثناء الطباعة.');
    } finally {
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  // Expected vs counted difference calculation
  const expectedCash = preview ? preview.expectedCashPiasters : 0;
  const differencePiasters = actualCashPiasters - expectedCash;
  const isMatch = differencePiasters === 0;
  const isShortage = differencePiasters < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-brand-dark text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-white flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">إقفال الوردية واليومية (Z-Report)</h2>
                {savedClosing && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paid text-white">
                    معتمد #{savedClosing.closingNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                تصفية الخزينة وحساب مبيعات اليوم وربط العهدة بسجل إقفال لا يمكن حذفه أو تعديله
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (showHistory) {
                  setShowHistory(false);
                } else {
                  void loadHistory();
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/15 hover:bg-white/25 text-white transition flex items-center gap-1.5"
            >
              <History className="w-4 h-4" />
              <span>{showHistory ? 'العودة لليومية الحالية' : 'سجل الإقفالات السابقة'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-canvas">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-ink-muted">
              <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">جاري احتساب أرقام المبيعات والعهد من قاعدة البيانات...</p>
            </div>
          ) : showHistory ? (
            /* History Subview */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-ink text-base">سجل الإقفالات اليومية المعتمدة</h3>
                <span className="text-xs text-ink-muted">آخر 30 إقفال</span>
              </div>
              {loadingHistory ? (
                <div className="py-12 text-center text-ink-muted">جاري تحميل السجل...</div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center text-ink-muted bg-surface rounded-xl border border-line">
                  لم يتم إجراء أي إقفال يومي بعد.
                </div>
              ) : (
                <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-xs">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-surface-2 text-ink-muted text-xs border-b border-line">
                      <tr>
                        <th className="p-3">رقم الإقفال</th>
                        <th className="p-3">يوم العمل</th>
                        <th className="p-3">وقت الإقفال</th>
                        <th className="p-3">إجمالي المبيعات</th>
                        <th className="p-3">المتوقع بالدرج</th>
                        <th className="p-3">النقد الفعلي</th>
                        <th className="p-3">الفرق</th>
                        <th className="p-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {historyList.map((h) => {
                        const diff = h.differencePiasters;
                        return (
                          <tr key={h.id} className="hover:bg-surface-2/50 transition">
                            <td className="p-3 font-bold text-ink">#{h.closingNumber}</td>
                            <td className="p-3">{h.businessDate}</td>
                            <td className="p-3 text-xs text-ink-muted" dir="ltr">{h.closedAt ? h.closedAt.substring(0, 16) : '-'}</td>
                            <td className="p-3 font-semibold text-ink">{formatArabicCurrency(h.totalSalesPiasters)}</td>
                            <td className="p-3 text-ink-muted">{formatArabicCurrency(h.expectedCashPiasters)}</td>
                            <td className="p-3 font-semibold text-brand">{formatArabicCurrency(h.actualCashPiasters)}</td>
                            <td className="p-3">
                              {diff === 0 ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-paid-soft text-paid font-medium">مطابق</span>
                              ) : diff < 0 ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-danger font-medium">عجز {formatArabicCurrency(Math.abs(diff))}</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-warn font-medium">زيادة {formatArabicCurrency(diff)}</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handlePrintReceipt(h)}
                                className="px-2.5 py-1 text-xs rounded-lg border border-line hover:bg-surface-2 text-ink flex items-center gap-1 mx-auto"
                                title="إعادة طباعة Z-Report"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>طباعة</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : preview ? (
            /* Main Closing View */
            <div className="space-y-5">
              
              {/* Suspicious Clock Warning (Story 89 / Task 127-4) */}
              {preview.isDateSuspicious && !savedClosing && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-danger space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h4 className="font-bold text-sm">تنبيه أمان حرج: ساعة وتاريخ الجهاز مشكوك فيها!</h4>
                  </div>
                  <p className="text-xs leading-relaxed">
                    {preview.dateSuspiciousReason || 'تاريخ النظام لا يتطابق مع التسلسل الزمني للفواتير السابقة.'}
                    <br />
                    لمنع إفساد التقارير المالية اليومية، لن يُسمح بقفل اليومية إلا بعد التأكيد الصريح من الإدارة.
                  </p>
                  <label className="flex items-center gap-2 pt-1 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmSuspiciousDate}
                      onChange={(e) => setConfirmSuspiciousDate(e.target.checked)}
                      className="w-4 h-4 rounded text-brand focus:ring-brand"
                    />
                    <span>أؤكد صحة الإقفال على هذا التاريخ بالرغم من تحذير الساعة، وأتحمل المسؤولية</span>
                  </label>
                </div>
              )}

              {/* Already Closed Notice */}
              {savedClosing && (
                <div className="p-4 rounded-xl bg-paid-soft border border-paid/20 text-paid flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm">اليومية معتمدة ومقفلة رسمياً (إقفال #{savedClosing.closingNumber})</h4>
                      <p className="text-xs opacity-90">
                        تم قفل اليومية في {savedClosing.closedAt ? savedClosing.closedAt.substring(0, 16) : ''} بواسطة {savedClosing.cashierName || 'المشرف'}. هذا السجل محمي ضد أي تعديل أو حذف.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePrintReceipt()}
                    disabled={isPrinting}
                    className="px-4 py-2 rounded-xl bg-paid text-white hover:bg-paid/90 font-medium text-xs flex items-center gap-2 shadow-xs transition"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{isPrinting ? 'جاري الطباعة...' : 'طباعة إيصال Z-Report'}</span>
                  </button>
                </div>
              )}

              {/* Business Date info strip */}
              <div className="flex items-center justify-between bg-surface p-3.5 rounded-xl border border-line text-sm">
                <div className="flex items-center gap-2 text-ink">
                  <Calendar className="w-4 h-4 text-brand" />
                  <span className="font-semibold">تاريخ يوم العمل:</span>
                  <span className="font-bold text-brand bg-brand-soft px-2.5 py-0.5 rounded-md">
                    {preview.businessDate}
                  </span>
                </div>
                <div className="text-xs text-ink-muted">
                  عدد الفواتير المنفذة: <strong className="text-ink font-bold">{preview.invoicesCount}</strong>
                </div>
              </div>

              {/* Financial Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">إجمالي المبيعات</span>
                  <span className="text-lg font-bold text-ink">
                    {formatArabicCurrency(preview.totalSalesPiasters)}
                  </span>
                  <div className="text-[11px] text-ink-muted mt-1 flex justify-between">
                    <span>نقدي: {formatArabicCurrency(preview.cashSalesPiasters)}</span>
                  </div>
                </div>

                <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">مبيعات الآجل</span>
                  <span className="text-lg font-bold text-ink">
                    {formatArabicCurrency(preview.creditSalesPiasters)}
                  </span>
                  <div className="text-[11px] text-ink-muted mt-1">
                    فواتير ذمم عملاء
                  </div>
                </div>

                <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">المرتجعات والملغاة</span>
                  <span className="text-lg font-bold text-danger">
                    {formatArabicCurrency(preview.returnsTotalPiasters)}
                  </span>
                  <div className="text-[11px] text-ink-muted mt-1">
                    {preview.returnsCount} مرتجع • {preview.cancelledCount} ملغاة
                  </div>
                </div>

                <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">سداد عملاء (نقد مقبوض)</span>
                  <span className="text-lg font-bold text-paid">
                    {formatArabicCurrency(preview.debtPaymentsPiasters)}
                  </span>
                  <div className="text-[11px] text-ink-muted mt-1">
                    تحصيل ديون بالخزينة
                  </div>
                </div>
              </div>

              {/* Drawer Cash Reconciliation Section (The Core of Feature #49) */}
              <div className="bg-surface p-5 rounded-2xl border-2 border-line shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-brand" />
                    <h3 className="font-bold text-ink text-base">تصفية الدرج ومطابقة النقدية الفعلية</h3>
                  </div>
                  <span className="text-xs text-ink-muted">
                    معادلة الدرج = مبيعات كاش + سداد ديون − مرتجعات كاش
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
                  
                  {/* Expected Cash in Drawer */}
                  <div className="p-4 rounded-xl bg-surface-2 border border-line">
                    <span className="text-xs text-ink-muted block mb-1 font-medium">النقد المتوقع في الدرج</span>
                    <span className="text-2xl font-black text-ink block">
                      {formatArabicCurrency(expectedCash)}
                    </span>
                    <span className="text-[11px] text-ink-muted mt-1 block">
                      محسوب آلياً من حركات الصندوق
                    </span>
                  </div>

                  {/* Actual Counted Cash (Input) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-ink flex items-center justify-between">
                      <span>النقد المعدود فعلياً في الدرج *</span>
                      <span className="text-[11px] text-brand font-medium">أدخل المبلغ الفعلي</span>
                    </label>
                    <MoneyInput
                      valuePiasters={actualCashPiasters}
                      onChangePiasters={setActualCashPiasters}
                      placeholder="0.00"
                      disabled={Boolean(savedClosing) || isSubmitting}
                      className="text-xl font-bold bg-white"
                      autoFocus={!savedClosing}
                    />
                  </div>

                  {/* Difference Badge */}
                  <div className={`p-4 rounded-xl border flex flex-col justify-center ${
                    isMatch 
                      ? 'bg-paid-soft border-paid/30 text-paid'
                      : isShortage
                        ? 'bg-red-50 border-red-200 text-danger'
                        : 'bg-amber-50 border-amber-200 text-warn'
                  }`}>
                    <span className="text-xs font-bold block mb-1">
                      {isMatch ? 'حالة المطابقة' : isShortage ? 'عجز في الخزينة' : 'زيادة في الخزينة'}
                    </span>
                    <span className="text-xl font-black">
                      {isMatch ? 'مطابق تماماً (0.00)' : formatArabicCurrency(Math.abs(differencePiasters))}
                    </span>
                    <span className="text-[11px] opacity-80 mt-1">
                      {isMatch 
                        ? 'الدرج متطابق مع النظام بدون فروق' 
                        : isShortage 
                          ? 'المعدود أقل من المتوقع بالنظام' 
                          : 'المعدود أكثر من المتوقع بالنظام'}
                    </span>
                  </div>

                </div>

                {/* Notes Input */}
                <div className="pt-2">
                  <label className="text-xs font-medium text-ink-muted block mb-1">
                    ملاحظات أو مبررات الفرق (تُحفظ في السجل الدائم):
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={Boolean(savedClosing) || isSubmitting}
                    placeholder="مثال: تم سداد مصاريف نقل من الدرج بموجب إيصال، أو متبقي عهدة فكة..."
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-line bg-white text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-surface-2"
                  />
                </div>
              </div>

              {/* Profit & Zero-cost alert (Story 84 / Feature #46) */}
              <div className="bg-surface p-4 rounded-xl border border-line flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand" />
                  <span className="font-semibold text-ink">الربح التقريبي لليوم:</span>
                  <span className="font-bold text-brand text-sm">
                    {formatArabicCurrency(preview.grossProfitPiasters)}
                  </span>
                  <span className="text-[11px] text-ink-muted">(سعر البيع − سعر التكلفة)</span>
                </div>
                {preview.zeroCostItemsCount > 0 && (
                  <div className="flex items-center gap-1.5 text-warn font-medium bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>يوجد {preview.zeroCostItemsCount} أصناف بدون تكلفة محددة وقت البيع</span>
                  </div>
                )}
              </div>

              {/* Print and Error feedbacks */}
              {printFeedback && (
                <div className="p-3 rounded-xl bg-surface-2 border border-line text-xs text-ink font-medium flex items-center gap-2">
                  <Printer className="w-4 h-4 text-brand" />
                  <span>{printFeedback}</span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-danger font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-surface border-t border-line flex items-center justify-between">
          <div className="text-xs text-ink-muted">
            {!savedClosing && (
              <span className="flex items-center gap-1.5 text-danger font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>بمجرد اعتماد الإقفال لا يمكن حذفه أو تعديله في قاعدة البيانات نهائياً.</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-surface-2 rounded-xl transition"
            >
              إلغاء
            </button>

            {savedClosing ? (
              <button
                onClick={() => handlePrintReceipt()}
                disabled={isPrinting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-paid hover:bg-paid/90 rounded-xl transition flex items-center gap-2 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>{isPrinting ? 'جاري الإرسال للطابعة...' : 'طباعة إيصال Z-Report'}</span>
              </button>
            ) : (
              <button
                onClick={handleSaveClosing}
                disabled={isSubmitting || (preview?.isDateSuspicious && !confirmSuspiciousDate)}
                className="px-5 py-2.5 text-xs font-bold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition flex items-center gap-2 shadow-xs"
              >
                <Lock className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري الاعتماد...' : 'اعتماد وقفل اليومية نهائياً'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
