import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  AlertCircle,
  Receipt,
  Smartphone,
  Wallet,
  CreditCard,
  Zap,
  Banknote,
  Users,
  ChevronDown,
  RotateCcw,
  type LucideIcon
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DailyClosing, DailyClosingPreview } from '../types/models';
import { formatArabicCurrency, toSafePiasters } from '../utils/money';
import { MoneyInput } from './MoneyInput';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { DateFilterControl } from './DateFilterControl';
import { useDateFilter, useToday, isDateFilterActive, describeDateFilter, getDateFilterPayload, formatLocalDateTime } from '../utils/dateFilter';

// Without a period the list shows the latest 30 closings; with a period up to a year of days
const CLOSING_HISTORY_DEFAULT_LIMIT = 30;
const CLOSING_HISTORY_PERIOD_LIMIT = 400;

type MetricTone = 'paid' | 'brand' | 'warn' | 'danger';

const METRIC_CHIP_CLASSES: Record<MetricTone, string> = {
  paid: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/40',
  brand: 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30',
  warn: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30',
  danger: 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30',
};

const METRIC_VALUE_CLASSES: Record<MetricTone, string> = {
  paid: 'text-paid dark:text-paid-bright',
  brand: 'text-ink dark:text-ink-dark',
  warn: 'text-ink dark:text-ink-dark',
  danger: 'text-danger dark:text-danger-bright',
};

interface MetricTileProps {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: MetricTone;
}

function MetricTile({ label, value, hint, icon: Icon, tone }: MetricTileProps) {
  return (
    <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark shadow-xs flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${METRIC_CHIP_CLASSES[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-sm font-bold text-ink dark:text-ink-dark">{label}</span>
      </div>
      <span className={`text-xl font-black tabular-nums break-words ${METRIC_VALUE_CLASSES[tone]}`}>{value}</span>
      <span className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">{hint}</span>
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Closing form state
  const [actualCashPiasters, setActualCashPiasters] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [confirmSuspiciousDate, setConfirmSuspiciousDate] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [savedClosing, setSavedClosing] = useState<DailyClosing | null>(null);
  const [showPrintPrompt, setShowPrintPrompt] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);

  // History view state
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<DailyClosing[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  // The period applies to the business day (يوم العمل) of each closing and is filtered by the backend
  const { dateFilter: historyFilter, setDateFilter: setHistoryFilter, resetDateFilter: resetHistoryFilter } = useDateFilter();
  const historyDateActive = isDateFilterActive(historyFilter);
  const today = useToday();
  const historyQuery = useMemo(
    () => ({
      limit: historyDateActive ? CLOSING_HISTORY_PERIOD_LIMIT : CLOSING_HISTORY_DEFAULT_LIMIT,
      ...getDateFilterPayload(historyFilter, today),
    }),
    [historyFilter, historyDateActive, today]
  );

  // Epay & Wallets details accordion state ("حاجة بتتقفل وتتفتح")
  const [showEpayDetails, setShowEpayDetails] = useState<boolean>(false);
  const [activeEpaySubTab, setActiveEpaySubTab] = useState<'terminals' | 'wallets'>('terminals');

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
          setActualCashPiasters(toSafePiasters(res.existingClosing.actualCashPiasters, 'closing.actualCashPiasters'));
          setNotes(res.existingClosing.notes || '');
        } else {
          setSavedClosing(null);
          // Default actual cash to expected cash initially
          setActualCashPiasters(toSafePiasters(res.expectedCashPiasters, 'closing:getPreview.expectedCashPiasters'));
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
      setLoading(true);
      setPrintFeedback(null);
      setSavedClosing(null);
      setShowPrintPrompt(false);
      setConfirmSuspiciousDate(false);
      setShowEpayDetails(false);
      setActiveEpaySubTab('terminals');
      void loadPreview();
    } else {
      setPreview(null);
    }
  }, [isOpen, loadPreview]);

  useEffect(() => {
    if (!isOpen || !showHistory) return;
    let cancelled = false;
    setLoadingHistory(true);
    void (async () => {
      try {
        const res = await invoke<DailyClosing[]>('closing:getHistory', historyQuery);
        if (!cancelled) setHistoryList(res || []);
      } catch (err: unknown) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, showHistory, historyQuery]);

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
        setShowPrintPrompt(true);
        if (onClosingCompleted) {
          onClosingCompleted(closingResult);
        }
        await loadPreview();
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
        setPrintFeedback('تم إرسال إيصال الإقفال اليومي إلى الطابعة');
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

  // Check if this date is already sealed/closed
  const isAlreadyClosed = Boolean(preview?.isAlreadyClosed && preview?.existingClosing);
  const closedRecord = preview?.existingClosing || savedClosing;

  // Expected vs counted difference calculation
  const expectedCash = toSafePiasters(
    isAlreadyClosed && closedRecord ? closedRecord.expectedCashPiasters : preview?.expectedCashPiasters,
    'closing.expectedCashPiasters',
  );

  const differencePiasters = isAlreadyClosed && closedRecord
    ? toSafePiasters(closedRecord.differencePiasters, 'closing.differencePiasters')
    : (actualCashPiasters - expectedCash);

  const isMatch = differencePiasters === 0;
  const isShortage = differencePiasters < 0;

  const epayTxList = preview?.epayTransactions || [];
  const walletTxList = preview?.walletTransactions || [];
  const epayTerminalsList = preview?.epayTerminalsSummary || [];
  const walletsSummaryList = preview?.walletsSummary || [];
  const totalEpayAndWalletTxCount = epayTxList.length + walletTxList.length;

  const formatEpayServiceType = (type: string) => {
    switch (type) {
      case 'recharge': return 'شحن رصيد وكروت';
      case 'bill_payment': return 'دفع فاتورة';
      case 'cash_out': return 'سحب نقدي (كاش آوت)';
      default: return type || 'خدمة إلكترونية';
    }
  };

  const formatWalletTxType = (type: string) => {
    switch (type) {
      case 'cash_in': return 'إيداع للعميل';
      case 'cash_out': return 'سحب كاش من العميل';
      case 'pos_sale': return 'سداد فاتورة كاشير';
      case 'funding': return 'تغذية رصيد الحساب';
      default: return type || 'معاملة محفظة';
    }
  };

  const formatTimeOnly = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const isDirty = !savedClosing && !isAlreadyClosed && (actualCashPiasters > 0 || Boolean(notes.trim()));

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء تقفيل الوردية؟',
    confirmMessage: 'تم إدخال مبالغ جرد للدرج. هل أنت متأكد من الخروج دون اعتماد التقفيل؟',
  });

  if (!isOpen) return null;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 select-none animate-in fade-in duration-150" dir="rtl">
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-xl border border-line dark:border-line-dark w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden transform-gpu will-change-[transform,opacity] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-5 bg-brand-dark dark:bg-surface-dark-2 text-white dark:text-ink-dark border-b dark:border-line-dark flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-white/10 dark:bg-surface-dark-3 text-white dark:text-brand-bright flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="t-modal-title tracking-tight text-white dark:text-ink-dark">الإقفال المحاسبي لليومية وتشميع الحسابات</h2>
                {savedClosing && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paid text-white">
                    معتمد #{savedClosing.closingNumber}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/80 dark:text-ink-dark-muted mt-1">
                تشميع وقفل الحسابات لليوم التجاري بالكامل (لتسليم نقدية الكاشير استخدم نافذة الوردية)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (showHistory) {
                  setShowHistory(false);
                } else {
                  resetHistoryFilter();
                  setShowHistory(true);
                }
              }}
              className="px-4 h-10 rounded-lg text-sm font-medium bg-white/15 dark:bg-surface-dark-3 hover:bg-white/25 dark:hover:bg-surface-dark text-white dark:text-ink-dark transition flex items-center gap-2 cursor-pointer"
            >
              <History className="w-4 h-4" />
              <span>{showHistory ? 'الرجوع لليومية الحالية' : 'سجل الورديات المقفولة'}</span>
            </button>
            <button
              onClick={requestClose}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-white/80 dark:text-ink-dark-muted hover:text-white dark:hover:text-ink-dark hover:bg-white/10 dark:hover:bg-surface-dark-3 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-canvas dark:bg-canvas-dark">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-ink-muted dark:text-ink-dark-muted min-h-[380px]">
              <div className="w-8 h-8 border-3 border-brand dark:border-brand-bright border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">بنحسب أرقام المبيعات وفلوس الدرج من الداتابيز...</p>
            </div>
          ) : showHistory ? (
            /* History Subview */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="t-card-title text-ink dark:text-ink-dark">سجل الإقفالات اليومية المعتمدة</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <DateFilterControl value={historyFilter} onChange={setHistoryFilter} size="sm" selectWidthClass="w-44" />
                  <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                    {historyDateActive
                      ? `${historyList.length} إقفال خلال ${describeDateFilter(historyFilter)}`
                      : `آخر ${CLOSING_HISTORY_DEFAULT_LIMIT} إقفال`}
                  </span>
                </div>
              </div>
              {loadingHistory ? (
                <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted">جاري تحميل السجل...</div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark">
                  {historyDateActive ? `مفيش إقفالات يومية خلال ${describeDateFilter(historyFilter)}.` : 'لم يتم إجراء أي إقفال يومي بعد.'}
                  {historyDateActive && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={resetHistoryFilter}
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-dark dark:bg-brand text-white text-xs font-bold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>عرض آخر الإقفالات</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden bg-surface dark:bg-surface-dark shadow-xs">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted text-xs border-b border-line dark:border-line-dark">
                      <tr>
                        <th className="p-3">رقم الإقفال</th>
                        <th className="p-3">يوم العمل</th>
                        <th className="p-3">وقت الإقفال</th>
                        <th className="p-3">إجمالي المبيعات</th>
                        <th className="p-3">انستاباي</th>
                        <th className="p-3">المحافظ</th>
                        <th className="p-3">مصروفات الدرج</th>
                        <th className="p-3">المتوقع بالدرج</th>
                        <th className="p-3">النقد الفعلي</th>
                        <th className="p-3">الفرق</th>
                        <th className="p-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-line-dark">
                      {historyList.map((h) => {
                        const diff = h.differencePiasters;
                        return (
                          <tr key={h.id} className="hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50 transition">
                            <td className="p-3 font-bold text-ink dark:text-ink-dark">#{h.closingNumber}</td>
                            <td className="p-3 text-ink dark:text-ink-dark">{h.businessDate}</td>
                            <td className="p-3 text-xs text-ink-muted dark:text-ink-dark-muted" dir="ltr">{formatLocalDateTime(h.closedAt) || '-'}</td>
                            <td className="p-3 font-semibold text-ink dark:text-ink-dark">{formatArabicCurrency(h.totalSalesPiasters)}</td>
                            <td className="p-3 text-brand dark:text-brand-bright font-medium">{formatArabicCurrency(h.instapaySalesPiasters || 0)}</td>
                            <td className="p-3 text-danger dark:text-danger-bright font-medium">{formatArabicCurrency(h.vodafoneCashSalesPiasters || 0)}</td>
                            <td className="p-3 text-danger dark:text-danger-bright font-medium">{formatArabicCurrency(h.expensesPiasters || 0)}</td>
                            <td className="p-3 text-ink-muted dark:text-ink-dark-muted">{formatArabicCurrency(h.expectedCashPiasters)}</td>
                            <td className="p-3 font-semibold text-brand dark:text-brand-bright">{formatArabicCurrency(h.actualCashPiasters)}</td>
                            <td className="p-3">
                              {diff === 0 ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-medium">مطابق</span>
                              ) : diff < 0 ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright font-medium">عجز {formatArabicCurrency(Math.abs(diff))}</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright font-medium">زيادة {formatArabicCurrency(diff)}</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handlePrintReceipt(h)}
                                className="px-2.5 py-1 text-xs rounded-lg border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark flex items-center gap-1 mx-auto cursor-pointer transition-colors"
                                title="إعادة طباعة إيصال الإقفال"
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
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Suspicious Clock Warning (Story 89 / Task 127-4) */}
              {preview.isDateSuspicious && !savedClosing && (
                <div className="p-5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright space-y-3">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h4 className="t-label">تنبيه أمان حرج: ساعة وتاريخ الجهاز مشكوك فيها!</h4>
                  </div>
                  <p className="text-sm leading-relaxed">
                    {preview.dateSuspiciousReason || 'تاريخ النظام لا يتطابق مع التسلسل الزمني للفواتير السابقة.'}
                    <br />
                    لمنع إفساد التقارير المالية اليومية، لن يُسمح بقفل اليومية إلا بعد التأكيد الصريح من الإدارة.
                  </p>
                  <label className="flex items-center gap-2.5 pt-1 text-sm font-semibold cursor-pointer select-none">
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

              {/* Open shifts block the closing: the server refuses it until every shift of the day is closed */}
              {!savedClosing && !isAlreadyClosed && (preview.openShiftsCount ?? 0) > 0 && (
                <div className="p-5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright space-y-2">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h4 className="t-label">لا يمكن إقفال اليومية: توجد {preview.openShiftsCount} وردية مفتوحة</h4>
                  </div>
                  <p className="text-sm leading-relaxed">
                    يرجى إغلاق جميع الورديات المفتوحة من نافذة <strong>إدارة الوردية</strong> أولاً ثم العودة لإقفال اليومية.
                  </p>
                </div>
              )}

              {/* Zero-Sales Warning: Prevent accidental lockouts */}
              {!savedClosing && preview.invoicesCount === 0 && preview.totalSalesPiasters === 0 && (
                <div className="p-5 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/30 dark:border-warn-bright/30 text-warn dark:text-warn-bright space-y-2">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h4 className="t-label">تنبيه: لا توجد أي مبيعات أو فواتير مسجلة في هذا اليوم</h4>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-muted dark:text-ink-dark-muted">
                    إقفال اليومية يعني انتهاء يوم العمل بالكامل وتشميع الحسابات، ولن يتمكن أي كاشير من فتح ورديات أو تسجيل فواتير جديدة في هذا التاريخ بعد إقفاله. إذا كنت تريد فقط تسليم نقدية الكاشير يرجى استخدام نافذة <strong>إدارة الوردية</strong> بدلاً من إقفال اليومية.
                  </p>
                </div>
              )}

              {/* Already Closed Notice */}
              {savedClosing && !showPrintPrompt && (
                <div className="p-5 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid/40 text-paid dark:text-paid-bright space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 shrink-0" />
                      <div>
                        <h4 className="t-label">اليومية اتقفلت واعتمدت خلاص (تقفيل #{savedClosing.closingNumber})</h4>
                        <p className="text-xs opacity-90">
                          اتقفلت اليومية في {formatLocalDateTime(savedClosing.closedAt)} بواسطة {savedClosing.cashierName || 'المشرف'}. السجل ده معتمد ومحمي تماماً.
                        </p>
                      </div>
                    </div>
                  </div>

                  {preview?.postClosingSalesCount && preview.postClosingSalesCount > 0 ? (
                    <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs flex items-center justify-between">
                      <span className="font-medium text-ink-muted dark:text-ink-dark-muted">
                        مبيعات مسجلة بعد موعد هذا الإقفال: <strong className="text-ink dark:text-ink-dark">{preview.postClosingSalesCount} فاتورة</strong> بقيمة <strong className="text-brand dark:text-brand-bright">{formatArabicCurrency(preview.postClosingSalesPiasters || 0)}</strong>
                      </span>
                      <span className="text-micro text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-soft/20 px-2 py-0.5 rounded-md font-medium">
                        تُحسب في الوردية التالية تلقائياً
                      </span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Business Date info strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark text-sm">
                <div className="flex items-center gap-2 text-ink dark:text-ink-dark">
                  <Calendar className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span className="font-semibold">تاريخ يوم العمل:</span>
                  <span className="font-bold text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-soft/20 px-2.5 py-0.5 rounded-md">
                    {preview.businessDate}
                  </span>
                </div>
              </div>

              {/* Sales summary: total first, then one card per payment method */}
              <section className="space-y-3">
                <h3 className="t-card-title text-ink dark:text-ink-dark flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>ملخص مبيعات اليوم حسب طريقة الدفع</span>
                </h3>

                <div className="bg-surface dark:bg-surface-dark p-5 rounded-xl border border-line dark:border-line-dark shadow-xs flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-sm text-ink-muted dark:text-ink-dark-muted block mb-1">إجمالي المبيعات</span>
                    <span className="text-3xl font-black tabular-nums text-ink dark:text-ink-dark">
                      {formatArabicCurrency(preview.totalSalesPiasters)}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark px-3 py-1.5 rounded-lg">
                    {preview.invoicesCount} فاتورة
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricTile
                    label="مبيعات كاش (الدرج)"
                    value={formatArabicCurrency(preview.cashSalesPiasters)}
                    hint="نقد سائل بالدرج"
                    icon={Banknote}
                    tone="paid"
                  />

                  <MetricTile
                    label="انستاباي (InstaPay)"
                    value={formatArabicCurrency(preview.instapaySalesPiasters || 0)}
                    hint="إلكتروني (خارج الدرج)"
                    icon={Smartphone}
                    tone="brand"
                  />

                  <MetricTile
                    label="محافظ إلكترونية"
                    value={formatArabicCurrency(preview.vodafoneCashSalesPiasters || 0)}
                    hint="محافظ (خارج الدرج)"
                    icon={Wallet}
                    tone="brand"
                  />

                  <MetricTile
                    label="مبيعات الآجل"
                    value={formatArabicCurrency(preview.creditSalesPiasters)}
                    hint="فواتير ذمم عملاء"
                    icon={Users}
                    tone="warn"
                  />
                </div>
              </section>

              {/* Cash movements around the drawer */}
              <section className="space-y-3">
                <h3 className="t-card-title text-ink dark:text-ink-dark flex items-center gap-2">
                  <Coins className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>حركة الدرج والتحصيل</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricTile
                    label="مصروفات الدرج"
                    value={formatArabicCurrency(preview.expensesPiasters || 0)}
                    hint={`${preview.expensesCount || 0} إيصالات نثريات`}
                    icon={Receipt}
                    tone="danger"
                  />

                  <MetricTile
                    label="سداد عملاء (نقدي)"
                    value={formatArabicCurrency(preview.debtPaymentsPiasters)}
                    hint="تحصيل ديون بالخزينة"
                    icon={Coins}
                    tone="paid"
                  />
                </div>
              </section>

              {preview.returnsTotalPiasters > 0 && (
                <div className="p-3.5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-sm flex flex-wrap items-center justify-between gap-2">
                  <span>إجمالي المرتجعات المخصومة من الخزينة: <strong>{formatArabicCurrency(preview.returnsCashPiasters)}</strong> ({preview.returnsCount} عمليات مرتجع)</span>
                  {preview.cancelledCount > 0 && <span>فواتير ملغاة: {preview.cancelledCount}</span>}
                </div>
              )}

              {/* Drawer Cash Reconciliation Section (The Core of Feature #49) */}
              <div className="bg-surface dark:bg-surface-dark p-6 rounded-2xl border-2 border-line dark:border-line-dark shadow-xs space-y-5">
                <div className="border-b border-line dark:border-line-dark pb-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-brand dark:text-brand-bright" />
                    <h3 className="t-card-title text-ink dark:text-ink-dark">1. جرد ومطابقة نقدية درج كاشير المحل (كاش البضاعة)</h3>
                  </div>
                  <p className="text-sm text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                    حسبة الدرج = عهدة البداية + مبيعات الكاش + سداد الديون − المرتجعات − مصاريف الدرج ± حركات المحافظ والماكينات النقدية − مشتريات وموردي الدرج
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
                  
                  {/* Expected Cash in Drawer */}
                  <div className="p-5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-1.5">
                    <span className="text-sm text-ink-muted dark:text-ink-dark-muted block font-medium">المفروض يكون في درج المحل</span>
                    <span className="text-2xl font-black text-ink dark:text-ink-dark block">
                      {formatArabicCurrency(expectedCash)}
                    </span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1 block leading-relaxed">
                      محسوب تلقائياً من مبيعات بضاعة المحل ومصاريفها
                    </span>
                  </div>

                  {/* Actual Counted Cash (Input) */}
                  <div className="space-y-2 flex flex-col justify-center">
                    <label className="text-sm font-bold text-ink dark:text-ink-dark flex flex-wrap items-center justify-between gap-1">
                      <span>الفلوس اللي عديتها في الدرج بإيدك</span>
                      <span className="text-xs text-brand dark:text-brand-bright font-medium">كاش درج البضاعة فقط</span>
                    </label>
                    <MoneyInput
                      valuePiasters={isAlreadyClosed && closedRecord ? closedRecord.actualCashPiasters : actualCashPiasters}
                      onChangePiasters={setActualCashPiasters}
                      placeholder="0.00"
                      disabled={Boolean(savedClosing) || isAlreadyClosed || isSubmitting}
                      className="text-xl font-bold bg-white dark:bg-surface-dark dark:text-ink-dark"
                      autoFocus={!savedClosing && !isAlreadyClosed}
                    />
                  </div>

                  {/* Difference Badge */}
                  <div className={`p-5 rounded-xl border flex flex-col justify-center gap-1.5 ${
                    isMatch 
                      ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid/30 dark:border-paid/40 text-paid dark:text-paid-bright'
                      : isShortage 
                        ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                        : 'bg-warn-soft dark:bg-warn-dark-soft border-warn/30 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
                  }`}>
                    <span className="text-sm font-bold block">
                      {isMatch ? 'حالة الدرج' : isShortage ? 'عجز ونقص في الدرج' : 'زيادة وفائض في الدرج'}
                    </span>
                    <span className="text-xl font-black">
                      {isMatch ? 'الدرج مظبوط بالمليم' : formatArabicCurrency(Math.abs(differencePiasters))}
                    </span>
                    {!isMatch && (
                      <span className="text-xs opacity-80 mt-1 leading-relaxed">
                        {isShortage
                          ? 'الفلوس اللي عديتها أقل من المفروض في الدرج'
                          : 'الفلوس اللي عديتها أكتر من المفروض في الدرج'}
                      </span>
                    )}
                  </div>

                </div>

                {/* Notes Input */}
                <div className="pt-1">
                  <label className="text-sm font-medium text-ink-muted dark:text-ink-dark-muted block mb-2">
                    ملاحظات أو سبب الفرق لو فيه عجز أو زيادة (بتتسجل في السجل):
                  </label>
                  <input
                    type="text"
                    value={isAlreadyClosed && closedRecord ? (closedRecord.notes || '') : notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={Boolean(savedClosing) || isAlreadyClosed || isSubmitting}
                    placeholder="مثال: دفعنا مصاريف نقل أو فكة زيادة باقية في الدرج..."
                    className="w-full text-sm px-4 py-3 rounded-xl border border-line dark:border-line-dark bg-white dark:bg-surface-dark text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright disabled:bg-surface-2 dark:disabled:bg-surface-dark-2 transition-colors"
                  />
                </div>
              </div>

              {/* 2. Epay & Terminal Reconciliation Section (Fawry / Aman / SuperPay) */}
              <div className="bg-surface dark:bg-surface-dark p-6 rounded-2xl border-2 border-line dark:border-line-dark shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between border-b border-line dark:border-line-dark pb-4 gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-paid dark:text-paid-bright" />
                    <h3 className="t-card-title text-ink dark:text-ink-dark">2. جرد وعهدة ماكينات وخدمات الدفع الإلكتروني</h3>
                  </div>
                  <span className="text-xs text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-3 py-1 rounded-full font-bold border border-paid/20 dark:border-paid/40">
                    عهدة مستقلة مفصولة عن بضاعة المحل
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Metric 1: Terminal Current Balance */}
                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-sm text-ink-muted dark:text-ink-dark-muted">
                      <span>رصيد الماكينات الإلكتروني المتوفر</span>
                      <Zap className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
                    </div>
                    <span className="text-xl font-black text-paid dark:text-paid-bright block">
                      {formatArabicCurrency(preview.epayTerminalsBalancePiasters || 0)}
                    </span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted block leading-relaxed">
                      جاهز للشحن والفواتير بالماكينة
                    </span>
                  </div>

                  {/* Metric 2: Terminal Till Cash Collected */}
                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-sm text-ink-muted dark:text-ink-dark-muted">
                      <span>نقدية محفظة الماكينة المحصلة اليوم</span>
                      <Wallet className="w-4 h-4 shrink-0 text-brand dark:text-brand-bright" />
                    </div>
                    <span className="text-xl font-black text-brand dark:text-brand-bright block">
                      {formatArabicCurrency(preview.epayTillCashPiasters || 0)}
                    </span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted block leading-relaxed">
                      نقدية في جيب/شنطة المكنة (خارج درج المحل)
                    </span>
                  </div>

                  {/* Metric 3: E-services Net Profit */}
                  <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-sm text-ink-muted dark:text-ink-dark-muted">
                      <span>صافي أرباح وعمولات الخدمات</span>
                      <TrendingUp className="w-4 h-4 shrink-0 text-paid dark:text-paid-bright" />
                    </div>
                    <span className="text-xl font-black text-paid dark:text-paid-bright block">
                      {formatArabicCurrency(preview.epayNetProfitPiasters || 0)}
                    </span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted block leading-relaxed">
                      أرباح كاش + عمولات الشركات المنفذة
                    </span>
                  </div>
                </div>

                {(preview.epayDrawerFundingPiasters || 0) > 0 && (
                  <div className="p-3.5 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-sm flex flex-wrap items-center justify-between gap-2">
                    <span>تم سحب مبلغ من درج المحل لتغذية ماكينة دفع: <strong>{formatArabicCurrency(preview.epayDrawerFundingPiasters || 0)}</strong></span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">مخصوم تلقائياً من حسبة كاش الدرج أعلاه</span>
                  </div>
                )}

                {(preview.walletsDrawerFundingPiasters || 0) > 0 && (
                  <div className="p-3.5 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-sm flex flex-wrap items-center justify-between gap-2">
                    <span>تم سحب مبلغ من درج المحل لتغذية محفظة إلكترونية: <strong>{formatArabicCurrency(preview.walletsDrawerFundingPiasters || 0)}</strong></span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">مخصوم تلقائياً من حسبة كاش الدرج أعلاه</span>
                  </div>
                )}

                {(preview.walletsDrawerCashPiasters || 0) !== 0 && (
                  <div className={`p-3.5 rounded-xl border text-sm flex flex-wrap items-center justify-between gap-2 ${
                    (preview.walletsDrawerCashPiasters || 0) < 0
                      ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright'
                      : 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid-dark-border text-paid dark:text-paid-bright'
                  }`}>
                    <span>
                      {(preview.walletsDrawerCashPiasters || 0) < 0
                        ? `تم تسليم نقدية لعملاء من الدرج لمعاملات المحافظ وإنستاباي: `
                        : `صافي نقدية محصلة بالدرج من معاملات المحافظ وإنستاباي: `}
                      <strong>{formatArabicCurrency(Math.abs(preview.walletsDrawerCashPiasters || 0))}</strong>
                      {walletTxList.length > 0 && (
                        <span className="text-xs opacity-85 mr-1 font-semibold">({walletTxList.length} معاملة مسجلة)</span>
                      )}
                    </span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">
                      {(preview.walletsDrawerCashPiasters || 0) < 0 ? 'مخصوم تلقائياً من حسبة كاش الدرج أعلاه' : 'مضاف تلقائياً لحسبة كاش الدرج أعلاه'}
                    </span>
                  </div>
                )}

                {(preview.purchasesDrawerCashPiasters || 0) > 0 && (
                  <div className="p-3.5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-sm flex flex-wrap items-center justify-between gap-2">
                    <span>مشتريات بضاعة مسددة نقداً من الدرج: <strong>{formatArabicCurrency(preview.purchasesDrawerCashPiasters || 0)}</strong></span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">مخصوم تلقائياً من حسبة كاش الدرج أعلاه</span>
                  </div>
                )}

                {(preview.supplierPaymentsDrawerCashPiasters || 0) > 0 && (
                  <div className="p-3.5 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-sm flex flex-wrap items-center justify-between gap-2">
                    <span>دفعات موردين مسددة نقداً من الدرج: <strong>{formatArabicCurrency(preview.supplierPaymentsDrawerCashPiasters || 0)}</strong></span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">مخصوم تلقائياً من حسبة كاش الدرج أعلاه</span>
                  </div>
                )}

                {(preview.openingFloatPiasters || 0) > 0 && (
                  <div className="p-3.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark text-sm flex flex-wrap items-center justify-between gap-2">
                    <span>عهدة بداية اليوم الافتتاحية: <strong>{formatArabicCurrency(preview.openingFloatPiasters || 0)}</strong></span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium">مضافة تلقائياً لحسبة كاش الدرج أعلاه</span>
                  </div>
                )}

                {/* 2.B Detailed Accordion for All POS Terminals and Wallets Transactions ("حاجة بتتقفل وتتفتح") */}
                <div className="rounded-2xl border-2 border-line dark:border-line-dark overflow-hidden transition-all bg-surface-2 dark:bg-surface-dark-2 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setShowEpayDetails((prev) => !prev)}
                    className="w-full p-4 flex flex-wrap items-center justify-between gap-3 text-right hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shrink-0 border border-paid/20 dark:border-paid/40">
                        <History className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink dark:text-ink-dark text-base">
                            سجل وتفاصيل كافة حركات الماكينات والمحافظ لليوم
                          </span>
                          <span className="text-xs bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright font-bold px-2.5 py-0.5 rounded-full border border-brand/20 dark:border-brand-bright/30">
                            {totalEpayAndWalletTxCount} معاملة مسجلة
                          </span>
                        </div>
                        <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mt-1">
                          اضغط هنا لفتح أو طي تفاصيل كل ماكينة دفع ومحفظة وحساب إنستاباي بدقة
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark px-3 py-1.5 rounded-lg border border-line dark:border-line-dark">
                        {showEpayDetails ? 'طي التفاصيل' : 'عرض كافة الحركات'}
                      </span>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark transition-transform duration-200 ${showEpayDetails ? 'rotate-180 text-brand dark:text-brand-bright' : ''}`}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </button>

                  {showEpayDetails && (
                    <div className="p-5 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark space-y-5 animate-in fade-in duration-200">
                      {/* Sub-tabs switcher */}
                      <div className="flex flex-wrap items-center gap-2 border-b border-line dark:border-line-dark pb-3">
                        <button
                          type="button"
                          onClick={() => setActiveEpaySubTab('terminals')}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            activeEpaySubTab === 'terminals'
                              ? 'bg-paid text-white shadow-xs'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                          }`}
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>ماكينات الدفع الإلكتروني (فوري / أمان / سوبر باي)</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            activeEpaySubTab === 'terminals' ? 'bg-white/20 text-white' : 'bg-surface dark:bg-surface-dark text-ink-muted'
                          }`}>
                            {epayTxList.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveEpaySubTab('wallets')}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            activeEpaySubTab === 'wallets'
                              ? 'bg-brand text-white shadow-xs'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>المحافظ الإلكترونية وإنستاباي (فودافون كاش / إنستاباي)</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            activeEpaySubTab === 'wallets' ? 'bg-white/20 text-white' : 'bg-surface dark:bg-surface-dark text-ink-muted'
                          }`}>
                            {walletTxList.length}
                          </span>
                        </button>
                      </div>

                      {/* Content of SubTab 1: Terminals */}
                      {activeEpaySubTab === 'terminals' && (
                        <div className="space-y-4">
                          {/* Terminals summary cards */}
                          {epayTerminalsList.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {epayTerminalsList.map((term) => (
                                <div key={term.terminalId} className="p-3.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-sm text-ink dark:text-ink-dark">{term.terminalName}</span>
                                    <span className="text-xs bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-semibold px-2 py-0.5 rounded-md">
                                      {term.transactionsCount} عمليات اليوم
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-line/60 dark:border-line-dark/60">
                                    <div>
                                      <span className="text-ink-muted dark:text-ink-dark-muted block">الرصيد المتوفر:</span>
                                      <span className="font-bold text-paid dark:text-paid-bright">{formatArabicCurrency(term.currentBalancePiasters)}</span>
                                    </div>
                                    <div>
                                      <span className="text-ink-muted dark:text-ink-dark-muted block">نقدية المحفظة (الشنطة):</span>
                                      <span className="font-bold text-brand dark:text-brand-bright">{formatArabicCurrency(term.tillCashPiasters)}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-between pt-1">
                                      <span className="text-ink-muted dark:text-ink-dark-muted">صافي الربح والعمولات:</span>
                                      <span className="font-bold text-paid dark:text-paid-bright">{formatArabicCurrency(term.netProfitPiasters)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Terminals transactions log */}
                          {epayTxList.length === 0 ? (
                            <div className="py-8 text-center bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-sm">
                              لا توجد عمليات منفذة على ماكينات الدفع الإلكتروني لهذا اليوم.
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-line dark:border-line-dark">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                                  <tr>
                                    <th className="py-2.5 px-3">الوقت</th>
                                    <th className="py-2.5 px-3">الماكينة</th>
                                    <th className="py-2.5 px-3">الخدمة</th>
                                    <th className="py-2.5 px-3">المبلغ</th>
                                    <th className="py-2.5 px-3">العمولة/الربح</th>
                                    <th className="py-2.5 px-3">الإجمالي المحصل</th>
                                    <th className="py-2.5 px-3">جهة النقدية</th>
                                    <th className="py-2.5 px-3">الكاشير / المرجع</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line/60 dark:divide-line-dark/60 text-ink dark:text-ink-dark">
                                  {epayTxList.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50 transition-colors">
                                      <td className="py-2 px-3 font-mono text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">{formatTimeOnly(tx.createdAt)}</td>
                                      <td className="py-2 px-3 font-semibold whitespace-nowrap">{tx.terminalName}</td>
                                      <td className="py-2 px-3">
                                        <div className="flex flex-col">
                                          <span className="font-bold">{tx.serviceName || formatEpayServiceType(tx.serviceType)}</span>
                                          <span className="text-xs opacity-75 text-ink-muted dark:text-ink-dark-muted">{formatEpayServiceType(tx.serviceType)}</span>
                                        </div>
                                      </td>
                                      <td className="py-2 px-3 font-bold tabular-nums whitespace-nowrap">{formatArabicCurrency(tx.billAmountPiasters)}</td>
                                      <td className="py-2 px-3 font-semibold text-paid dark:text-paid-bright tabular-nums whitespace-nowrap">{formatArabicCurrency(tx.netProfitPiasters)}</td>
                                      <td className="py-2 px-3 font-bold tabular-nums whitespace-nowrap">{formatArabicCurrency(tx.totalReceivedPiasters)}</td>
                                      <td className="py-2 px-3 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                          tx.paymentChannel === 'terminal_till'
                                            ? 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright'
                                            : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                                        }`}>
                                          {tx.paymentChannel === 'terminal_till' ? 'شنطة الماكينة' : 'درج المحل'}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">
                                        {tx.cashierName || tx.referenceNumber || '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Content of SubTab 2: Wallets */}
                      {activeEpaySubTab === 'wallets' && (
                        <div className="space-y-4">
                          {/* Wallets summary cards */}
                          {walletsSummaryList.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {walletsSummaryList.map((acc) => (
                                <div key={acc.accountId} className="p-3.5 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-sm text-ink dark:text-ink-dark">{acc.accountName}</span>
                                    <span className="text-xs bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright font-semibold px-2 py-0.5 rounded-md">
                                      {acc.transactionsCount} عمليات اليوم
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-line/60 dark:border-line-dark/60">
                                    <div>
                                      <span className="text-ink-muted dark:text-ink-dark-muted block">الرصيد المتاح:</span>
                                      <span className="font-bold text-paid dark:text-paid-bright">{formatArabicCurrency(acc.currentBalancePiasters)}</span>
                                    </div>
                                    <div>
                                      <span className="text-ink-muted dark:text-ink-dark-muted block">أثر الدرج:</span>
                                      <span className={`font-bold ${acc.drawerCashImpactPiasters >= 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                                        {formatArabicCurrency(acc.drawerCashImpactPiasters)}
                                      </span>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-between pt-1">
                                      <span className="text-ink-muted dark:text-ink-dark-muted">أرباح الحساب:</span>
                                      <span className="font-bold text-paid dark:text-paid-bright">{formatArabicCurrency(acc.netProfitPiasters)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Wallets transactions log */}
                          {walletTxList.length === 0 ? (
                            <div className="py-8 text-center bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-sm">
                              لا توجد عمليات منفذة على المحافظ الإلكترونية أو إنستاباي لهذا اليوم.
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-line dark:border-line-dark">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                                  <tr>
                                    <th className="py-2.5 px-3">الوقت</th>
                                    <th className="py-2.5 px-3">الحساب / المحفظة</th>
                                    <th className="py-2.5 px-3">نوع المعاملة</th>
                                    <th className="py-2.5 px-3">المبلغ</th>
                                    <th className="py-2.5 px-3">العمولة / الربح</th>
                                    <th className="py-2.5 px-3">الإجمالي</th>
                                    <th className="py-2.5 px-3">حركة نقدية الدرج</th>
                                    <th className="py-2.5 px-3">بيانات العميل / ملاحظات</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line/60 dark:divide-line-dark/60 text-ink dark:text-ink-dark">
                                  {walletTxList.map((wtx) => {
                                    const isDrawerIn = wtx.paymentDestination === 'cash_drawer' && wtx.txType === 'cash_out';
                                    const isDrawerOut = wtx.paymentDestination === 'cash_drawer' && wtx.txType === 'cash_in';
                                    return (
                                      <tr key={wtx.id} className="hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50 transition-colors">
                                        <td className="py-2 px-3 font-mono text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">{formatTimeOnly(wtx.createdAt)}</td>
                                        <td className="py-2 px-3 font-semibold whitespace-nowrap">{wtx.accountName}</td>
                                        <td className="py-2 px-3 whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                            wtx.txType === 'cash_in'
                                              ? 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright'
                                              : wtx.txType === 'cash_out'
                                                ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                                                : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark'
                                          }`}>
                                            {formatWalletTxType(wtx.txType)}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 font-bold tabular-nums whitespace-nowrap">{formatArabicCurrency(wtx.amountPiasters)}</td>
                                        <td className="py-2 px-3 font-semibold text-paid dark:text-paid-bright tabular-nums whitespace-nowrap">{formatArabicCurrency(wtx.profitPiasters)}</td>
                                        <td className="py-2 px-3 font-bold tabular-nums whitespace-nowrap">{formatArabicCurrency(wtx.totalCollectedPiasters)}</td>
                                        <td className="py-2 px-3 whitespace-nowrap">
                                          {isDrawerIn && (
                                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright">
                                              + محصل في الدرج ({formatArabicCurrency(wtx.totalCollectedPiasters)})
                                            </span>
                                          )}
                                          {isDrawerOut && (
                                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright">
                                              - مسلّم للعميل ({formatArabicCurrency(wtx.amountPiasters - wtx.profitPiasters)})
                                            </span>
                                          )}
                                          {!isDrawerIn && !isDrawerOut && (
                                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink-muted">
                                              {wtx.paymentDestination === 'wallet' ? 'إلكتروني فقط (خارج الدرج)' : wtx.paymentDestination}
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-ink-muted dark:text-ink-dark-muted">
                                          {wtx.customerPhone ? `${wtx.customerPhone} ` : ''}
                                          {wtx.customerName ? `(${wtx.customerName}) ` : ''}
                                          {wtx.notes ? wtx.notes : (!wtx.customerPhone && !wtx.customerName ? '—' : '')}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Profit & Zero-cost alert (Story 84 / Feature #46) */}
              <div className="bg-surface dark:bg-surface-dark p-5 rounded-xl border border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span className="font-semibold text-ink dark:text-ink-dark">الربح التقريبي لليوم:</span>
                  <span className="font-bold text-brand dark:text-brand-bright text-base">
                    {formatArabicCurrency(preview.grossProfitPiasters)}
                  </span>
                  <span className="text-xs text-ink-muted dark:text-ink-dark-muted">(سعر البيع − سعر التكلفة)</span>
                </div>
                {preview.zeroCostItemsCount > 0 && (
                  <div className="flex items-center gap-1.5 text-warn dark:text-warn-bright font-medium bg-warn-soft dark:bg-warn-dark-soft px-3 py-1.5 rounded-md border border-warn/20 dark:border-warn-bright/30 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>يوجد {preview.zeroCostItemsCount} أصناف بدون تكلفة محددة وقت البيع</span>
                  </div>
                )}
              </div>

              {/* Print and Error feedbacks */}
              {printFeedback && (
                <div className="p-3 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark font-medium flex items-center gap-2">
                  <Printer className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>{printFeedback}</span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-xs text-danger dark:text-danger-bright font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted min-w-0">
            {!savedClosing && (
              <span className="flex items-center gap-1.5 text-danger dark:text-danger-bright font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>بمجرد اعتماد الإقفال لا يمكن حذفه أو تعديله في قاعدة البيانات نهائياً.</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-5 min-h-[44px] text-sm font-semibold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-xl transition cursor-pointer"
            >
              إلغاء
            </button>

            {savedClosing || isAlreadyClosed ? (
              <button
                onClick={() => handlePrintReceipt()}
                disabled={isPrinting}
                className="px-6 min-h-[44px] text-sm font-bold text-white bg-paid dark:bg-paid-bright dark:text-surface-dark hover:bg-paid/90 dark:hover:bg-paid-bright-hover rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isPrinting ? 'بنطبع...' : 'طباعة وصل التقفيل'}</span>
              </button>
            ) : (
              <button
                onClick={handleSaveClosing}
                disabled={isSubmitting || (preview?.isDateSuspicious && !confirmSuspiciousDate) || (preview?.openShiftsCount ?? 0) > 0}
                className="px-6 min-h-[44px] text-sm font-bold text-white bg-brand dark:bg-brand-bright dark:text-surface-dark hover:bg-brand-dark dark:hover:bg-brand-bright/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{isSubmitting ? 'بنقفل اليومية...' : 'اعتماد وتقفيل اليومية رسمياً'}</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Modal-over-Modal: Post-closing confirmation & Print Z-Report Prompt */}
      {showPrintPrompt && savedClosing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
          <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-xl border border-line dark:border-line-dark w-full max-w-lg overflow-hidden transform-gpu will-change-[transform,opacity] animate-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-4">
              
              {/* Success Badge */}
              <div className="w-16 h-16 rounded-2xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8 text-paid dark:text-paid-bright" />
              </div>

              <div>
                <h3 className="t-card-title text-ink dark:text-ink-dark">تم تقفيل اليومية والوردية</h3>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full text-xs font-semibold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40">
                  <span>تقفيل معتمد #{savedClosing.closingNumber}</span>
                  <span>•</span>
                  <span>{savedClosing.businessDate}</span>
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-right">
                <div>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">إجمالي المبيعات</span>
                  <span className="text-sm font-bold text-ink dark:text-ink-dark">{formatArabicCurrency(savedClosing.totalSalesPiasters)}</span>
                </div>
                <div>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">الفلوس اللي في الدرج</span>
                  <span className="text-sm font-bold text-brand dark:text-brand-bright">{formatArabicCurrency(savedClosing.actualCashPiasters)}</span>
                </div>
                <div>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">حالة الدرج</span>
                  <span className={`text-xs font-bold ${
                    savedClosing.differencePiasters === 0 
                      ? 'text-paid dark:text-paid-bright' 
                      : savedClosing.differencePiasters < 0 
                        ? 'text-danger dark:text-danger-bright' 
                        : 'text-warn dark:text-warn-bright'
                  }`}>
                    {savedClosing.differencePiasters === 0 
                      ? 'الدرج مظبوط تماماً' 
                      : savedClosing.differencePiasters < 0 
                        ? `عجز ${formatArabicCurrency(Math.abs(savedClosing.differencePiasters))}`
                        : `زيادة ${formatArabicCurrency(savedClosing.differencePiasters)}`}
                  </span>
                </div>
              </div>

              <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                اتقفلت اليومية. تحب نطبع وصل التقفيل دلوقتي؟
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    void handlePrintReceipt(savedClosing);
                    setShowPrintPrompt(false);
                    onClose();
                  }}
                  className="flex-1 py-2.5 px-4 bg-paid dark:bg-paid-bright dark:text-surface-dark hover:bg-paid/90 dark:hover:bg-paid-bright-hover text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>أيوه، اطبع وصل التقفيل دلوقتي</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPrintPrompt(false);
                    onClose();
                  }}
                  className="py-2.5 px-4 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  <span>إنهاء ومتابعة الشغل</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
