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
import type { DailyClosing, DailyClosingPreview, AutoCloseShiftsResult } from '../types/models';
import { emitDataChanged } from '../utils/eventBus';
import { formatArabicCurrency, toSafePiasters } from '../utils/money';
import { MoneyInput } from './MoneyInput';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { DateFilterControl } from './DateFilterControl';
import { useDateFilter, useToday, isDateFilterActive, describeDateFilter, getDateFilterPayload, formatLocalDateTime } from '../utils/dateFilter';

import { AppButton } from './AppButton';
import MotionHeight from './MotionHeight';
import { useExitTransition, useExitValue } from '../hooks/useExitTransition';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { formatPhoneDisplay } from '../utils/phoneFormat';
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

const LOG_TH = 'sticky top-0 z-10 h-10 px-3 text-xs font-bold text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark whitespace-nowrap';
const LOG_TH_NUM = `${LOG_TH} text-right`;
const LOG_TD = 'px-3 py-2 align-middle text-sm';
const LOG_TD_NUM = `${LOG_TD} text-right font-bold tabular-nums whitespace-nowrap`;
const LOG_ROW = 'h-12 even:bg-surface-2/40 dark:even:bg-surface-dark-2/40 hover:bg-brand-soft/40 dark:hover:bg-brand-dark-soft/40 transition-colors';
const LOG_BADGE = 'inline-flex items-center min-h-6 px-2 py-0.5 rounded-md text-xs font-bold leading-snug';

interface LogSummaryRowProps {
  label: string;
  value: string;
  valueClass: string;
}

function LogSummaryRow({ label, value, valueClass }: LogSummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-9 py-1.5">
      <dt className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</dt>
      <dd className={`m-0 text-sm font-bold tabular-nums ${valueClass}`} dir="ltr">{value}</dd>
    </div>
  );
}

function LogEmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 rounded-xl border border-dashed border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 text-center">
      <span className="w-10 h-10 rounded-full flex items-center justify-center bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted">
        <Icon className="w-5 h-5" />
      </span>
      <span className="text-sm text-ink-muted dark:text-ink-dark-muted">{text}</span>
    </div>
  );
}

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
  // The expected cash the preview pre-fills: only a different count is a change made by the cashier
  const [prefilledCashPiasters, setPrefilledCashPiasters] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [confirmSuspiciousDate, setConfirmSuspiciousDate] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [savedClosing, setSavedClosing] = useState<DailyClosing | null>(null);
  const [showPrintPrompt, setShowPrintPrompt] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);
  const [isAutoClosingShifts, setIsAutoClosingShifts] = useState<boolean>(false);
  const [shiftResolutionMessage, setShiftResolutionMessage] = useState<string | null>(null);

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
  const motionPanel = useMotionPanel(activeEpaySubTab);

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
          const expectedCash = toSafePiasters(res.expectedCashPiasters, 'closing:getPreview.expectedCashPiasters');
          setActualCashPiasters(expectedCash);
          setPrefilledCashPiasters(expectedCash);
          setNotes('');
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
      setIsAutoClosingShifts(false);
      setShiftResolutionMessage(null);
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

  const handleAutoCloseShifts = async () => {
    if (!preview) return;
    setIsAutoClosingShifts(true);
    setError(null);
    setShiftResolutionMessage(null);
    try {
      const res = await invoke<AutoCloseShiftsResult>('closing:autoCloseShifts', {
        businessDate: preview.businessDate,
        notes: 'إغلاق وتسوية فورية من شاشة تقفيل اليومية',
      });
      if (res) {
        setShiftResolutionMessage(
          `تم بنجاح إغلاق وتسوية ${res.closedCount} وردية معلقة بإجمالي نقدية ${formatArabicCurrency(res.totalExpectedCashPiasters)}.`,
        );
        emitDataChanged('shifts');
        await loadPreview();
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'تعذر تسوية وإغلاق الورديات المفتوحة.';
      setError(msg);
    } finally {
      setIsAutoClosingShifts(false);
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
        confirmSuspiciousDate: confirmSuspiciousDate,
        autoClosePendingShifts: true,
      });

      if (closingResult) {
        setSavedClosing(closingResult);
        setShowPrintPrompt(true);
        emitDataChanged('shifts');
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
      // The host message names the real cause (printer missing, offline, paper out); the closing itself is already saved
      setPrintFeedback('تعذرت طباعة الإقفال (الإقفال محفوظ): ' + (err instanceof Error ? err.message : 'تعذر الاتصال بالطابعة'));
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

  const isDirty = !savedClosing && !isAlreadyClosed && (actualCashPiasters !== prefilledCashPiasters || Boolean(notes.trim()));

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء تقفيل الوردية؟',
    confirmMessage: 'تم إدخال مبالغ جرد للدرج. هل أنت متأكد من الخروج دون اعتماد التقفيل؟',
  });

  // Dismissing keeps the dialog (and the print prompt over it) mounted for the exit animation; state and logic are untouched
  const { mounted, exiting } = useExitTransition(isOpen);
  const printPrompt = useExitValue(showPrintPrompt ? savedClosing : null);
  const promptClosing = printPrompt.value;

  if (!mounted) return null;

  return (
    <div
      onClick={handleBackdropClick}
      data-exiting={exiting || undefined}
      className="motion-static motion-modal-backdrop motion-exit-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 select-none"
      dir="rtl"
    >
      <div
        data-exiting={exiting || undefined}
        className="motion-exit-modal-panel bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        
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
            <AppButton
              variant="secondary"
              icon={History}
              onClick={() => {
                if (showHistory) {
                  setShowHistory(false);
                } else {
                  resetHistoryFilter();
                  setShowHistory(true);
                }
              }}
            >
              {showHistory ? 'الرجوع لليومية الحالية' : 'سجل الورديات المقفولة'}
            </AppButton>
            <AppButton variant="secondary" icon={X} onClick={requestClose} title="إغلاق" aria-label="إغلاق" />
          </div>
        </div>

        {/* Body content */}
        <div className="motion-swap-children flex-1 overflow-y-auto p-6 space-y-6 bg-canvas dark:bg-canvas-dark">
          {loading ? (
            <div className="motion-loading-fill py-20 flex flex-col items-center justify-center gap-3 text-ink-muted dark:text-ink-dark-muted min-h-[23.75rem]">
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
                  <span
                    className="w-56 truncate text-xs text-ink-muted dark:text-ink-dark-muted"
                    title={historyDateActive ? describeDateFilter(historyFilter) : undefined}
                  >
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
                      <AppButton variant="primary" size="sm" icon={RotateCcw} onClick={resetHistoryFilter}>
                        عرض آخر الإقفالات
                      </AppButton>
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
                              <AppButton
                                variant="secondary"
                                size="xs"
                                icon={Printer}
                                className="mx-auto"
                                onClick={() => handlePrintReceipt(h)}
                                title="إعادة طباعة إيصال الإقفال"
                              >
                                طباعة
                              </AppButton>
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
                    />
                    <span>أؤكد صحة الإقفال على هذا التاريخ بالرغم من تحذير الساعة، وأتحمل المسؤولية</span>
                  </label>
                </div>
              )}

              {/* Open shifts smart reconciliation card */}
              {!savedClosing && !isAlreadyClosed && (preview.openShiftsCount ?? 0) > 0 && (
                <div className="p-5 rounded-xl bg-brand-soft/70 dark:bg-brand-soft/10 border border-brand/30 dark:border-brand-bright/30 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Coins className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-base font-bold text-ink dark:text-ink-dark">
                          توجد {preview.openShiftsCount} وردية عمل مفتوحة (معلقة)
                        </h4>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warn/15 text-warn dark:text-warn-bright border border-warn/30">
                          بانتظار التسوية
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-ink-muted dark:text-ink-dark-muted">
                        لتشميع حسابات اليوم بدقة ومنع تشتت النقدية، يمكنك تسوية وإغلاق جميع الورديات المفتوحة فوراً بضغطة زر واحدة؛ سيقوم النظام بدمج مبيعاتها ونقدية درجها في هذا الإقفال تلقائياً.
                      </p>
                    </div>
                  </div>

                  {/* Shifts quick glance list if available */}
                  {preview.openShifts && preview.openShifts.length > 0 && (
                    <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden bg-surface dark:bg-surface-dark divide-y divide-line dark:divide-line-dark text-xs">
                      {preview.openShifts.map((s) => (
                        <div key={s.id} className="p-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-ink dark:text-ink-dark">وردية #{s.shiftNumber}</span>
                            <span className="text-ink-muted dark:text-ink-dark-muted">({s.cashierName || 'كاشير'})</span>
                          </div>
                          <div className="flex items-center gap-4 text-ink-muted dark:text-ink-dark-muted">
                            {s.businessDate && <span>يوم: {s.businessDate}</span>}
                            <span>العهدة: {formatArabicCurrency(s.openingFloatPiasters)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                      لن تحتاج لمغادرة الشاشة؛ سيتم تحديث أرقام اليومية فوراً.
                    </span>
                    <AppButton
                      variant="primary"
                      size="md"
                      icon={RotateCcw}
                      loading={isAutoClosingShifts}
                      onClick={handleAutoCloseShifts}
                    >
                      {isAutoClosingShifts ? 'جاري تسوية الورديات...' : 'تسوية وإغلاق جميع الورديات المفتوحة الآن'}
                    </AppButton>
                  </div>
                </div>
              )}

              {/* Shift resolution success alert */}
              {shiftResolutionMessage && (
                <div className="p-4 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid/40 text-paid dark:text-paid-bright flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-semibold">{shiftResolutionMessage}</span>
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
                    label="إنستاباي"
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
                <MotionHeight className="rounded-2xl border border-line dark:border-line-dark overflow-hidden bg-surface-2 dark:bg-surface-dark-2 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setShowEpayDetails((prev) => !prev)}
                    aria-expanded={showEpayDetails}
                    aria-controls="daily-closing-epay-log"
                    className="w-full min-h-16 px-4 py-3 flex items-center justify-between gap-3 text-right hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shrink-0 border border-paid/20 dark:border-paid/40">
                        <History className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="font-bold text-ink dark:text-ink-dark text-base">
                            سجل وتفاصيل كافة حركات الماكينات والمحافظ لليوم
                          </span>
                          <span className="inline-flex items-center h-6 text-xs bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright font-bold px-2.5 rounded-full border border-brand/20 dark:border-brand-bright/30 whitespace-nowrap">
                            {totalEpayAndWalletTxCount} معاملة مسجلة
                          </span>
                        </div>
                        <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mt-1">
                          اضغط هنا لفتح أو طي تفاصيل كل ماكينة دفع ومحفظة وحساب إنستاباي بدقة
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline-flex items-center h-8 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-xs font-bold text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">
                        {showEpayDetails ? 'طي التفاصيل' : 'عرض كافة الحركات'}
                      </span>
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark transition-transform duration-200 ${showEpayDetails ? 'rotate-180 text-brand dark:text-brand-bright' : ''}`}>
                        <ChevronDown className="w-4 h-4" />
                      </span>
                    </div>
                  </button>

                  {showEpayDetails && (
                    <div id="daily-closing-epay-log" {...motionPanel} className="px-4 py-4 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark space-y-4 animate-in fade-in duration-200">
                      {/* Sub-tabs switcher */}
                      <div role="tablist" className="motion-static flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeEpaySubTab === 'terminals'}
                          title="فوري / أمان / سوبر باي"
                          onClick={() => setActiveEpaySubTab('terminals')}
                          className={`flex-1 min-w-48 h-10 flex items-center justify-center gap-2 px-4 rounded-lg text-sm font-bold transition-colors ${
                            activeEpaySubTab === 'terminals'
                              ? 'bg-paid text-white dark:bg-paid-dark-soft dark:text-paid-bright dark:ring-1 dark:ring-inset dark:ring-paid-bright/40 shadow-xs'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                          }`}
                        >
                          <CreditCard className="w-4 h-4 shrink-0" />
                          <span>ماكينات الدفع الإلكتروني</span>
                          <span className={`min-w-6 h-6 inline-flex items-center justify-center text-xs px-2 rounded-full font-bold ${
                            activeEpaySubTab === 'terminals' ? 'bg-white/20 text-white dark:bg-paid-bright/15 dark:text-paid-bright' : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted'
                          }`}>
                            {epayTxList.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeEpaySubTab === 'wallets'}
                          title="فودافون كاش / إنستاباي"
                          onClick={() => setActiveEpaySubTab('wallets')}
                          className={`flex-1 min-w-48 h-10 flex items-center justify-center gap-2 px-4 rounded-lg text-sm font-bold transition-colors ${
                            activeEpaySubTab === 'wallets'
                              ? 'bg-brand text-white dark:bg-brand-dark-soft dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40 shadow-xs'
                              : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                          }`}
                        >
                          <Smartphone className="w-4 h-4 shrink-0" />
                          <span>المحافظ الإلكترونية وإنستاباي</span>
                          <span className={`min-w-6 h-6 inline-flex items-center justify-center text-xs px-2 rounded-full font-bold ${
                            activeEpaySubTab === 'wallets' ? 'bg-white/20 text-white dark:bg-brand-bright/15 dark:text-brand-bright' : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted'
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {epayTerminalsList.map((term) => (
                                <div key={term.terminalId} className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-bold text-sm text-ink dark:text-ink-dark truncate">{term.terminalName}</span>
                                    <span className="shrink-0 inline-flex items-center h-6 text-xs bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-semibold px-2 rounded-md whitespace-nowrap">
                                      {term.transactionsCount} عمليات اليوم
                                    </span>
                                  </div>
                                  <dl className="m-0 divide-y divide-line/60 dark:divide-line-dark/60 border-t border-line/60 dark:border-line-dark/60">
                                    <LogSummaryRow label="الرصيد المتوفر" value={formatArabicCurrency(term.currentBalancePiasters)} valueClass="text-paid dark:text-paid-bright" />
                                    <LogSummaryRow label="نقدية المحفظة (الشنطة)" value={formatArabicCurrency(term.tillCashPiasters)} valueClass="text-brand dark:text-brand-bright" />
                                    <LogSummaryRow label="صافي الربح والعمولات" value={formatArabicCurrency(term.netProfitPiasters)} valueClass="text-paid dark:text-paid-bright" />
                                  </dl>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Terminals transactions log */}
                          {epayTxList.length === 0 ? (
                            <LogEmptyState icon={CreditCard} text="لا توجد عمليات منفذة على ماكينات الدفع الإلكتروني لهذا اليوم." />
                          ) : (
                            <div className="max-h-80 overflow-y-auto overflow-x-hidden rounded-xl border border-line dark:border-line-dark">
                              <table className="w-full text-right">
                                <thead>
                                  <tr>
                                    <th className={LOG_TH}>الوقت / الماكينة</th>
                                    <th className={LOG_TH}>الخدمة</th>
                                    <th className={LOG_TH_NUM}>المبلغ</th>
                                    <th className={LOG_TH_NUM}>العمولة / الربح</th>
                                    <th className={LOG_TH_NUM}>الإجمالي المحصل</th>
                                    <th className={LOG_TH}>جهة النقدية / الكاشير</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line/60 dark:divide-line-dark/60 text-ink dark:text-ink-dark">
                                  {epayTxList.map((tx) => (
                                    <tr key={tx.id} className={LOG_ROW}>
                                      <td className={LOG_TD}>
                                        <div className="flex flex-col">
                                          <span className="font-semibold">{tx.terminalName}</span>
                                          <span className="text-xs tabular-nums text-ink-muted dark:text-ink-dark-muted">{formatTimeOnly(tx.createdAt)}</span>
                                        </div>
                                      </td>
                                      <td className={LOG_TD}>
                                        <div className="flex flex-col">
                                          <span className="font-bold">{tx.serviceName || formatEpayServiceType(tx.serviceType)}</span>
                                          <span className="text-xs text-ink-muted dark:text-ink-dark-muted">{formatEpayServiceType(tx.serviceType)}</span>
                                        </div>
                                      </td>
                                      <td className={LOG_TD_NUM} dir="ltr">{formatArabicCurrency(tx.billAmountPiasters)}</td>
                                      <td className={`${LOG_TD_NUM} text-paid dark:text-paid-bright`} dir="ltr">{formatArabicCurrency(tx.netProfitPiasters)}</td>
                                      <td className={LOG_TD_NUM} dir="ltr">{formatArabicCurrency(tx.totalReceivedPiasters)}</td>
                                      <td className={LOG_TD}>
                                        <div className="flex flex-col items-start gap-1">
                                          <span className={`${LOG_BADGE} ${
                                            tx.paymentChannel === 'terminal_till'
                                              ? 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright'
                                              : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                                          }`}>
                                            {tx.paymentChannel === 'terminal_till' ? 'شنطة الماكينة' : 'درج المحل'}
                                          </span>
                                          <span className="text-xs text-ink-muted dark:text-ink-dark-muted">{tx.cashierName || tx.referenceNumber || '—'}</span>
                                        </div>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {walletsSummaryList.map((acc) => (
                                <div key={acc.accountId} className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-bold text-sm text-ink dark:text-ink-dark truncate">{acc.accountName}</span>
                                    <span className="shrink-0 inline-flex items-center h-6 text-xs bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright font-semibold px-2 rounded-md whitespace-nowrap">
                                      {acc.transactionsCount} عمليات اليوم
                                    </span>
                                  </div>
                                  <dl className="m-0 divide-y divide-line/60 dark:divide-line-dark/60 border-t border-line/60 dark:border-line-dark/60">
                                    <LogSummaryRow label="الرصيد المتاح" value={formatArabicCurrency(acc.currentBalancePiasters)} valueClass="text-paid dark:text-paid-bright" />
                                    <LogSummaryRow
                                      label="أثر الدرج"
                                      value={formatArabicCurrency(acc.drawerCashImpactPiasters)}
                                      valueClass={acc.drawerCashImpactPiasters >= 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}
                                    />
                                    <LogSummaryRow label="أرباح الحساب" value={formatArabicCurrency(acc.netProfitPiasters)} valueClass="text-paid dark:text-paid-bright" />
                                  </dl>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Wallets transactions log */}
                          {walletTxList.length === 0 ? (
                            <LogEmptyState icon={Smartphone} text="لا توجد عمليات منفذة على المحافظ الإلكترونية أو إنستاباي لهذا اليوم." />
                          ) : (
                            <div className="max-h-80 overflow-y-auto overflow-x-hidden rounded-xl border border-line dark:border-line-dark">
                              <table className="w-full text-right">
                                <thead>
                                  <tr>
                                    <th className={LOG_TH}>الوقت / الحساب</th>
                                    <th className={LOG_TH}>نوع المعاملة</th>
                                    <th className={LOG_TH_NUM}>المبلغ</th>
                                    <th className={LOG_TH_NUM}>العمولة / الربح</th>
                                    <th className={LOG_TH_NUM}>الإجمالي</th>
                                    <th className={LOG_TH}>حركة نقدية الدرج</th>
                                    <th className={LOG_TH}>بيانات العميل / ملاحظات</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line/60 dark:divide-line-dark/60 text-ink dark:text-ink-dark">
                                  {walletTxList.map((wtx) => {
                                    const isDrawerIn = wtx.paymentDestination === 'cash_drawer' && wtx.txType === 'cash_out';
                                    const isDrawerOut = wtx.paymentDestination === 'cash_drawer' && wtx.txType === 'cash_in';
                                    return (
                                      <tr key={wtx.id} className={LOG_ROW}>
                                        <td className={LOG_TD}>
                                          <div className="flex flex-col">
                                            <span className="font-semibold">{wtx.accountName}</span>
                                            <span className="text-xs tabular-nums text-ink-muted dark:text-ink-dark-muted">{formatTimeOnly(wtx.createdAt)}</span>
                                          </div>
                                        </td>
                                        <td className={LOG_TD}>
                                          <span className={`${LOG_BADGE} ${
                                            wtx.txType === 'cash_in'
                                              ? 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright'
                                              : wtx.txType === 'cash_out'
                                                ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                                                : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark'
                                          }`}>
                                            {formatWalletTxType(wtx.txType)}
                                          </span>
                                        </td>
                                        <td className={LOG_TD_NUM} dir="ltr">{formatArabicCurrency(wtx.amountPiasters)}</td>
                                        <td className={`${LOG_TD_NUM} text-paid dark:text-paid-bright`} dir="ltr">{formatArabicCurrency(wtx.profitPiasters)}</td>
                                        <td className={LOG_TD_NUM} dir="ltr">{formatArabicCurrency(wtx.totalCollectedPiasters)}</td>
                                        <td className={LOG_TD}>
                                          {isDrawerIn && (
                                            <span className={`${LOG_BADGE} bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright`}>
                                              + محصل في الدرج ({formatArabicCurrency(wtx.totalCollectedPiasters)})
                                            </span>
                                          )}
                                          {isDrawerOut && (
                                            <span className={`${LOG_BADGE} bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright`}>
                                              - مسلّم للعميل ({formatArabicCurrency(wtx.amountPiasters - wtx.profitPiasters)})
                                            </span>
                                          )}
                                          {!isDrawerIn && !isDrawerOut && (
                                            <span className={`${LOG_BADGE} bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted`}>
                                              {wtx.paymentDestination === 'wallet' ? 'إلكتروني فقط (خارج الدرج)' : wtx.paymentDestination}
                                            </span>
                                          )}
                                        </td>
                                        <td className={`${LOG_TD} text-xs text-ink-muted dark:text-ink-dark-muted break-words`}>
                                          {wtx.customerPhone ? `${formatPhoneDisplay(wtx.customerPhone)} ` : ''}
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
                </MotionHeight>
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
            <AppButton variant="secondary" size="lg" onClick={onClose}>
              إلغاء
            </AppButton>

            {savedClosing || isAlreadyClosed ? (
              <AppButton variant="success" size="lg" icon={Printer} onClick={() => handlePrintReceipt()} loading={isPrinting}>
                {isPrinting ? 'بنطبع...' : 'طباعة وصل التقفيل'}
              </AppButton>
            ) : (
              <AppButton
                variant="primary"
                size="lg"
                icon={Lock}
                onClick={handleSaveClosing}
                loading={isSubmitting}
                disabled={(preview?.isDateSuspicious && !confirmSuspiciousDate)}
              >
                {isSubmitting
                  ? 'بنقفل اليومية...'
                  : (preview?.openShiftsCount ?? 0) > 0
                    ? 'اعتماد وتقفيل اليومية (مع تسوية الورديات)'
                    : 'اعتماد وتقفيل اليومية رسمياً'}
              </AppButton>
            )}
          </div>
        </div>

      </div>

      {/* Modal-over-Modal: Post-closing confirmation & Print Z-Report Prompt */}
      {promptClosing && (
        <div
          data-exiting={printPrompt.exiting || undefined}
          className="motion-exit-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
        >
          <div
            data-exiting={printPrompt.exiting || undefined}
            className="motion-exit-modal-panel bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
          >
            <div className="p-6 text-center space-y-4">
              
              {/* Success Badge */}
              <div className="w-16 h-16 rounded-2xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8 text-paid dark:text-paid-bright" />
              </div>

              <div>
                <h3 className="t-card-title text-ink dark:text-ink-dark">تم تقفيل اليومية والوردية</h3>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full text-xs font-semibold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40">
                  <span>تقفيل معتمد #{promptClosing.closingNumber}</span>
                  <span>•</span>
                  <span>{promptClosing.businessDate}</span>
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-right">
                <div>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">إجمالي المبيعات</span>
                  <span className="text-sm font-bold text-ink dark:text-ink-dark">{formatArabicCurrency(promptClosing.totalSalesPiasters)}</span>
                </div>
                <div>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">الفلوس اللي في الدرج</span>
                  <span className="text-sm font-bold text-brand dark:text-brand-bright">{formatArabicCurrency(promptClosing.actualCashPiasters)}</span>
                </div>
                <div>
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted block">حالة الدرج</span>
                  <span className={`text-xs font-bold ${
                    promptClosing.differencePiasters === 0 
                      ? 'text-paid dark:text-paid-bright' 
                      : promptClosing.differencePiasters < 0 
                        ? 'text-danger dark:text-danger-bright' 
                        : 'text-warn dark:text-warn-bright'
                  }`}>
                    {promptClosing.differencePiasters === 0 
                      ? 'الدرج مظبوط تماماً' 
                      : promptClosing.differencePiasters < 0 
                        ? `عجز ${formatArabicCurrency(Math.abs(promptClosing.differencePiasters))}`
                        : `زيادة ${formatArabicCurrency(promptClosing.differencePiasters)}`}
                  </span>
                </div>
              </div>

              <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed">
                اتقفلت اليومية. تحب نطبع وصل التقفيل دلوقتي؟
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2.5 pt-2">
                <AppButton
                  variant="success"
                  icon={Printer}
                  className="flex-1"
                  onClick={() => {
                    void handlePrintReceipt(promptClosing);
                    setShowPrintPrompt(false);
                    onClose();
                  }}
                >
                  أيوه، اطبع وصل التقفيل دلوقتي
                </AppButton>
                <AppButton
                  variant="secondary"
                  onClick={() => {
                    setShowPrintPrompt(false);
                    onClose();
                  }}
                >
                  إنهاء ومتابعة الشغل
                </AppButton>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
