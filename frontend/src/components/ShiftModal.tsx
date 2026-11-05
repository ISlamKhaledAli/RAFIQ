import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  History,
  X,
  Coins,
  User,
  Info,
  Loader2
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useAuth } from '../context/useAuth';
import { useDataSubscription } from '../utils/eventBus';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { MoneyInput } from './MoneyInput';
import { CustomSelect } from './CustomSelect';
import type { SelectOption } from './CustomSelect';
import { ConfirmModal } from './ConfirmModal';
import { formatArabicCurrency, formatTimeOnly } from '../utils/money';
import type { Shift, ShiftSummary, CashDrawerTransaction } from '../types/models';
import { createAttemptKey } from '../utils/idempotency';
import { getRoleLabel } from '../utils/roleLabels';
import {
  getMovementTypeLabel,
  normalizeDrawerTransactions,
  normalizeShift,
  normalizeShiftList,
  normalizeShiftSummary,
} from '../utils/shiftSummary';
import { RequiredMark } from './RequiredMark';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftStatusChanged?: (activeShift: Shift | null) => void;
}

type TabType = 'overview' | 'cash_in' | 'cash_out' | 'history' | 'close';

const NOTICE_TONE_CLASSES = {
  danger: 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright',
  success: 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright',
} as const;

interface NoticeProps {
  tone: keyof typeof NOTICE_TONE_CLASSES;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

// One banner for every modal notice so light and dark colours always travel together
const Notice: React.FC<NoticeProps> = ({ tone, icon, className = 'gap-2 text-xs', children }) => (
  <div
    role={tone === 'danger' ? 'alert' : 'status'}
    className={`p-3 border-b flex items-center shrink-0 ${NOTICE_TONE_CLASSES[tone]} ${className}`}
  >
    {icon}
    {children}
  </div>
);

// A zero amount carries no sign ("+0.00" / "-0.00" would read as a movement)
const signedAmount = (sign: '+' | '-', piasters: number): string =>
  piasters === 0 ? formatArabicCurrency(0) : `${sign}${formatArabicCurrency(piasters)}`;

export const ShiftModal: React.FC<ShiftModalProps> = ({
  isOpen,
  onClose,
  onShiftStatusChanged,
}) => {
  const { currentUser, isRoot, isAdmin, hasPermission } = useAuth();
  // A retry after a timeout reuses the key so one drawer movement is never recorded twice
  const cashInAttemptRef = useRef(createAttemptKey('cin'));
  const cashOutAttemptRef = useRef(createAttemptKey('cout'));
  const canOpenShift = isRoot || isAdmin || hasPermission('shifts.open');
  const canCloseShift = isRoot || isAdmin || hasPermission('shifts.close');
  const canCashIn = isRoot || isAdmin || hasPermission('shifts.cash_in');
  const canCashOut = isRoot || isAdmin || hasPermission('shifts.cash_out');

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active shift & summary state
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [drawerTransactions, setDrawerTransactions] = useState<CashDrawerTransaction[]>([]);
  const [recentShifts, setRecentShifts] = useState<Shift[]>([]);

  // Form states: Open Shift
  const [openingFloatPiasters, setOpeningFloatPiasters] = useState<number>(0);
  const [openShiftNotes, setOpenShiftNotes] = useState<string>('');

  // Form states: Cash In
  const [cashInAmountPiasters, setCashInAmountPiasters] = useState<number>(0);
  const [cashInReason, setCashInReason] = useState<string>('فكة صباحية للدرج');
  const [cashInCustomReason, setCashInCustomReason] = useState<string>('');

  // Form states: Cash Out
  const [cashOutAmountPiasters, setCashOutAmountPiasters] = useState<number>(0);
  const [cashOutReason, setCashOutReason] = useState<string>('توريد جزئي للخزينة');
  const [cashOutCustomReason, setCashOutCustomReason] = useState<string>('');

  // Form states: Close Shift
  const [actualCashPiasters, setActualCashPiasters] = useState<number>(0);
  const [closeShiftNotes, setCloseShiftNotes] = useState<string>('');
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState<boolean>(false);
  const [confirmNotice, setConfirmNotice] = useState<string>('');
  // Once the cashier types a count, background refreshes must not overwrite it with the expected cash
  const actualCashEditedRef = useRef(false);

  const handleActualCashChange = (piasters: number) => {
    actualCashEditedRef.current = true;
    setActualCashPiasters(piasters);
  };

  const selectTab = (tab: TabType) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setActiveTab(tab);
  };

  const isDirty = openingFloatPiasters > 0 || cashInAmountPiasters > 0 || cashOutAmountPiasters > 0;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل البيانات المدخلة؟',
    confirmMessage: 'توجد مبالغ أو بيانات غير محفوظة في نافذة الوردية، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة العمل',
  });

  const onShiftStatusChangedRef = React.useRef(onShiftStatusChanged);
  useEffect(() => {
    onShiftStatusChangedRef.current = onShiftStatusChanged;
  }, [onShiftStatusChanged]);

  const lastReportedShiftIdRef = React.useRef<string | null | undefined>(undefined);

  const fetchShiftData = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const current = normalizeShift(
        await invoke<unknown>('shifts:getActive', { posRegisterId: 'default_pos' }),
        'shifts:getActive',
      );
      setActiveShift(current);

      const currentId = current ? current.id : null;
      if (lastReportedShiftIdRef.current !== currentId) {
        lastReportedShiftIdRef.current = currentId;
        if (onShiftStatusChangedRef.current) {
          onShiftStatusChangedRef.current(current);
        }
      }

      if (current) {
        const summary = normalizeShiftSummary(
          await invoke<unknown>('shifts:getSummary', { shiftId: current.id }),
        );
        setShiftSummary(summary);
        if (!summary) {
          setErrorMessage('تعذر قراءة ملخص نقدية الوردية. أعد فتح النافذة، وإذا تكررت المشكلة فتواصل مع الدعم الفني.');
        }

        const txList = normalizeDrawerTransactions(
          await invoke<unknown>('drawer:getMovements', { shiftId: current.id }),
        );
        setDrawerTransactions(txList);
        if (summary && !actualCashEditedRef.current) {
          setActualCashPiasters(summary.expectedCashPiasters);
        }
      } else {
        setShiftSummary(null);
        setDrawerTransactions([]);
        setRecentShifts(
          normalizeShiftList(await invoke<unknown>('shifts:getHistory', { limit: 10 }), 'shifts:getHistory'),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل بيانات الوردية';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      actualCashEditedRef.current = false;
      setActiveTab('overview');
      setErrorMessage(null);
      setSuccessMessage(null);
      void fetchShiftData();
    }
  }, [isOpen, fetchShiftData]);

  useDataSubscription(['shifts', 'sales', 'drawer', 'all'], () => {
    if (isOpen) {
      void fetchShiftData();
    }
  });

  const handleOpenShift = async () => {
    if (!canOpenShift) {
      setErrorMessage('ليس لديك صلاحية لفتح وردية جديدة.');
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const newShift = normalizeShift(
        await invoke<unknown>('shifts:open', {
          posRegisterId: 'default_pos',
          openingFloatPiasters,
          notes: openShiftNotes.trim() || undefined,
        }),
        'shifts:open',
      );
      setSuccessMessage(
        newShift
          ? `تم فتح الوردية #${newShift.shiftNumber}`
          : 'تم فتح الوردية',
      );
      actualCashEditedRef.current = false;
      setOpeningFloatPiasters(0);
      setOpenShiftNotes('');
      await fetchShiftData();
      setActiveTab('overview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل فتح الوردية';
      setErrorMessage(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCashIn = async () => {
    if (!canCashIn) {
      setErrorMessage('ليس لديك صلاحية لتسجيل إيداع نثري.');
      return;
    }
    if (cashInAmountPiasters <= 0) {
      setErrorMessage('يرجى إدخال مبلغ إيداع أكبر من الصفر.');
      return;
    }
    const finalReason = cashInReason === 'أخرى' ? cashInCustomReason.trim() : cashInReason;
    if (!finalReason) {
      setErrorMessage('يرجى تحديد أو كتابة سبب الإيداع.');
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await invoke('shifts:cashIn', {
        shiftId: activeShift?.id,
        amountPiasters: cashInAmountPiasters,
        reason: finalReason,
        idempotencyKey: cashInAttemptRef.current.current(),
      });
      cashInAttemptRef.current.complete();
      setSuccessMessage(`تم تسجيل إيداع نثري ${formatArabicCurrency(cashInAmountPiasters)}`);
      setCashInAmountPiasters(0);
      setCashInCustomReason('');
      await fetchShiftData();
      setActiveTab('overview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الإيداع';
      setErrorMessage(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCashOut = async () => {
    if (!canCashOut) {
      setErrorMessage('ليس لديك صلاحية لتسجيل سحب نثري.');
      return;
    }
    if (cashOutAmountPiasters <= 0) {
      setErrorMessage('يرجى إدخال مبلغ سحب أكبر من الصفر.');
      return;
    }
    const expected = shiftSummary?.expectedCashPiasters ?? 0;
    if (cashOutAmountPiasters > expected) {
      setErrorMessage(`المبلغ المطلوب سحبه أكبر من النقدية المتوفرة حالياً بالدرج (${formatArabicCurrency(expected)})`);
      return;
    }
    const finalReason = cashOutReason === 'أخرى' ? cashOutCustomReason.trim() : cashOutReason;
    if (!finalReason) {
      setErrorMessage('يرجى تحديد أو كتابة سبب السحب.');
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await invoke('shifts:cashOut', {
        shiftId: activeShift?.id,
        amountPiasters: cashOutAmountPiasters,
        reason: finalReason,
        idempotencyKey: cashOutAttemptRef.current.current(),
      });
      cashOutAttemptRef.current.complete();
      setSuccessMessage(`تم تسجيل سحب نثري ${formatArabicCurrency(cashOutAmountPiasters)}`);
      setCashOutAmountPiasters(0);
      setCashOutCustomReason('');
      await fetchShiftData();
      setActiveTab('overview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل السحب';
      setErrorMessage(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseShift = () => {
    if (!canCloseShift) {
      setErrorMessage('ليس لديك صلاحية لإغلاق الوردية.');
      return;
    }
    if (!activeShift) return;
    if (!shiftSummary) {
      setErrorMessage('لا يمكن إغلاق الوردية قبل تحميل ملخص نقدية الدرج. أعد فتح النافذة وحاول مجدداً.');
      return;
    }

    const diff = actualCashPiasters - shiftSummary.expectedCashPiasters;
    let diffNotice = '';
    if (diff < 0) {
      diffNotice = `يوجد عجز في الدرج قدره ${formatArabicCurrency(Math.abs(diff))}. `;
    } else if (diff > 0) {
      diffNotice = `توجد زيادة في الدرج قدرها ${formatArabicCurrency(diff)}. `;
    } else {
      diffNotice = 'الدرج متطابق تماماً بدون عجز أو زيادة. ';
    }

    setConfirmNotice(diffNotice);
    setIsConfirmCloseOpen(true);
  };

  const executeCloseShift = async () => {
    if (!activeShift) return;
    const currentShiftNum = activeShift.shiftNumber;

    setIsConfirmCloseOpen(false);
    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await invoke('shifts:close', {
        shiftId: activeShift.id,
        actualCashPiasters,
        notes: closeShiftNotes.trim() || undefined,
      });
      setSuccessMessage(`تم إغلاق الوردية #${currentShiftNum}`);
      actualCashEditedRef.current = false;
      setCloseShiftNotes('');
      await fetchShiftData();
      setActiveTab('overview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إغلاق الوردية';
      setErrorMessage(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const expectedCash = shiftSummary?.expectedCashPiasters ?? 0;
  const currentDiffPiasters = actualCashPiasters - expectedCash;

  const cashInOptions: SelectOption[] = [
    { value: 'فكة صباحية للدرج', label: 'فكة صباحية للدرج' },
    { value: 'تغذية نقدية طارئة', label: 'تغذية نقدية طارئة' },
    { value: 'استرداد سلفة مؤقتة', label: 'استرداد سلفة مؤقتة' },
    { value: 'أخرى', label: 'سبب آخر (اكتب يدوياً)' },
  ];

  const cashOutOptions: SelectOption[] = [
    { value: 'توريد جزئي للخزينة', label: 'توريد جزئي للخزينة الرئيسية' },
    { value: 'مصروف طوارئ نثري', label: 'مصروف طوارئ نثري' },
    { value: 'سداد دفعة مورد نقدي', label: 'سداد دفعة مورد نقدي' },
    { value: 'أخرى', label: 'سبب آخر (اكتب يدوياً)' },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in font-sans"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white dark:bg-surface-dark w-full max-w-4xl rounded-2xl shadow-2xl border border-line dark:border-line-dark flex flex-col max-h-[92vh] overflow-hidden"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeShift ? 'bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright' : 'bg-warn/10 dark:bg-warn-dark-soft text-warn dark:text-warn-bright'}`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="t-modal-title text-ink dark:text-ink-dark">
                  إدارة الوردية والخزينة وحركات الدرج
                </h2>
                {activeShift ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-dark-border flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-paid dark:bg-paid-bright animate-pulse" />
                    وردية #{activeShift.shiftNumber} مفتوحة
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warn-soft dark:bg-warn-dark-soft text-ink dark:text-warn-bright border border-warn-border dark:border-warn-bright/30">
                    الوردية مغلقة
                  </span>
                )}
                {loading && (
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted flex items-center gap-1 font-normal animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-brand" />
                    جاري التحديث...
                  </span>
                )}
              </div>
              {activeShift && (
                <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                  {`الكاشير المسؤول: ${activeShift.cashierName} | تاريخ اليومية: ${activeShift.businessDate}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void requestClose()}
              className="p-2 rounded-xl text-ink-muted hover:text-ink dark:text-ink-dark-muted dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dangling Shift Warning (Power cut recovery alert) */}
        {activeShift?.isDanglingFromPreviousDay && (
          <Notice tone="danger" icon={<ShieldAlert className="w-5 h-5 shrink-0" />} className="gap-3 text-xs sm:text-sm font-medium">
            <div className="flex-1">
              <strong>تنبيه انقطاع كهرباء أو إغلاق فجائي:</strong> هذه الوردية تابعة ليوم عمل سابق ({activeShift.businessDate}) لم يتم إغلاقها وتشميعها بشكل نظامي. يرجى مراجعة نقدية الدرج وإغلاق الوردية لتسوية الحسابات.
            </div>
          </Notice>
        )}

        {/* Global Feedback Messages */}
        {errorMessage && (
          <Notice tone="danger" icon={<AlertTriangle className="w-4 h-4 shrink-0" />}>
            <span>{errorMessage}</span>
          </Notice>
        )}
        {successMessage && (
          <Notice tone="success" icon={<CheckCircle2 className="w-4 h-4 shrink-0" />}>
            <span>{successMessage}</span>
          </Notice>
        )}

        {/* Navigation Tabs (Only if shift is active) */}
        {activeShift && (
          <div className="flex items-center gap-1 p-2 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark overflow-x-auto shrink-0">
            <button
              onClick={() => selectTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'overview'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>نظرة عامة والدرج</span>
            </button>

            <button
              onClick={() => selectTab('cash_in')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'cash_in'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
              <span>تغذية الدرج</span>
            </button>

            <button
              onClick={() => selectTab('cash_out')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'cash_out'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-danger dark:text-danger-bright" />
              <span>سحب نثري</span>
            </button>

            <button
              onClick={() => selectTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'history'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>سجل حركات الدرج ({drawerTransactions.length})</span>
            </button>

            <button
              onClick={() => selectTab('close')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all mr-auto ${
                activeTab === 'close'
                  ? 'bg-danger text-white shadow-xs'
                  : 'text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>إغلاق وتشميع الوردية</span>
            </button>
          </div>
        )}

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* CASE A: NO ACTIVE SHIFT (PROMPT TO OPEN) */}
          {!activeShift ? (
            <div className="space-y-6">
              <div className="bg-brand-soft dark:bg-surface-dark-2 border border-brand/20 dark:border-line-dark rounded-2xl p-6 text-center shadow-2xs">
                <div className="w-16 h-16 rounded-2xl bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/10 dark:border-brand-bright/20 flex items-center justify-center mx-auto mb-3">
                  <Unlock className="w-8 h-8" />
                </div>
                <h3 className="t-card-title text-ink dark:text-ink-dark">
                  بدء واستلام وردية كاشير جديدة
                </h3>
                <p className="text-xs sm:text-sm text-ink-muted dark:text-ink-dark-muted max-w-md mx-auto mt-1">
                  وفقاً للسياسة المالية الصارمة، لا يمكن تسجيل أي فواتير بيع أو تحصيلات نقدية قبل فتح وردية رسمية وتأكيد عهدة الدرج الافتتاحية.
                </p>
              </div>

              <div className="bg-surface-2 dark:bg-surface-dark-2 rounded-2xl p-5 border border-line dark:border-line-dark max-w-lg mx-auto space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                    الكاشير المستلم
                  </label>
                  <div className="h-10 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex items-center gap-2 text-xs text-ink dark:text-ink-dark">
                    <User className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span className="font-bold">{currentUser?.displayName || currentUser?.username || 'مستخدم غير محدد'}</span>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted mr-auto">({getRoleLabel(currentUser)})</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                    العهدة الافتتاحية النقدية للدرج (الفكة المستلمة)
                  </label>
                  <MoneyInput
                    valuePiasters={openingFloatPiasters}
                    onChangePiasters={setOpeningFloatPiasters}
                    placeholder="0.00"
                    autoFocus
                    containerClassName="w-full"
                    className="h-11 text-base font-bold text-paid dark:text-paid-bright"
                  />
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">
                    أدخل المبلغ الفعلي الموجود في الدرج قبل بدء البيع (مثل 200 أو 500 ج.م فكة).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                    ملاحظات افتتاح الوردية
                  </label>
                  <input
                    type="text"
                    value={openShiftNotes}
                    onChange={(e) => setOpenShiftNotes(e.target.value)}
                    placeholder="مثال: استلام الدرج سليم مع فكة 10 و 20 جنيه"
                    className="w-full h-10 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <button
                  onClick={() => void handleOpenShift()}
                  disabled={actionLoading || !canOpenShift}
                  className="w-full h-12 bg-paid hover:bg-paid-hover text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Unlock className="w-4 h-4" />
                  <span>{actionLoading ? 'جاري فتح الوردية...' : 'فتح الوردية واستلام الدرج'}</span>
                </button>
              </div>

              {/* Recent closed shifts archive */}
              {recentShifts.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-line dark:border-line-dark">
                  <h4 className="t-label text-ink-muted dark:text-ink-dark-muted uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>آخر الورديات المغلقة السابقة</span>
                  </h4>
                  <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden divide-y divide-line dark:divide-line-dark text-xs">
                    {recentShifts.map((s) => (
                      <div key={s.id} className="p-3 bg-surface dark:bg-surface-dark flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark">
                            <span>وردية #{s.shiftNumber}</span>
                            <span className="text-xs font-normal text-ink-muted dark:text-ink-dark-muted">({s.businessDate})</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                              {s.cashierName}
                            </span>
                          </div>
                          <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1 flex items-center gap-3">
                            <span>الفواتير: {s.invoicesCount}</span>
                            <span>المبيعات النقدية: {formatArabicCurrency(s.cashSalesPiasters)}</span>
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-ink dark:text-ink-dark">
                            المغلق: {formatArabicCurrency(s.actualCashPiasters)}
                          </div>
                          <div className={`text-xs font-medium ${s.differencePiasters < 0 ? 'text-danger dark:text-danger-bright' : s.differencePiasters > 0 ? 'text-brand dark:text-brand-bright' : 'text-paid dark:text-paid-bright'}`}>
                            {s.differencePiasters === 0
                              ? 'متطابق تماماً'
                              : `الفرق: ${formatArabicCurrency(s.differencePiasters)}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Expected Cash in Drawer Hero Card */}
                  <div className="bg-gradient-to-r from-brand-dark to-brand text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-bold text-brand-soft uppercase tracking-wider flex items-center gap-1.5 mb-1">
                          <Coins className="w-4 h-4 text-brand-soft" />
                          <span>الرصيد الفعلي المتوقع للدرج حالياً</span>
                        </span>
                        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">
                          {formatArabicCurrency(expectedCash)}
                        </div>
                        <p className="text-xs text-brand-soft/80 mt-1">
                          محسوب بدقة القروش = العهدة + المبيعات النقدية + الإيداعات - المرتجعات - السحوبات - المصروفات
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Drawer Breakdown Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-xl border border-line dark:border-line-dark">
                      <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium block">
                        العهدة الافتتاحية
                      </span>
                      <span className="text-base font-bold text-ink dark:text-ink-dark mt-1 block">
                        {formatArabicCurrency(shiftSummary?.openingFloatPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-paid-soft dark:bg-paid-dark-soft p-3.5 rounded-xl border border-paid/20 dark:border-paid-dark-border">
                      <span className="text-xs text-paid dark:text-paid-bright font-medium block">
                        مبيعات نقدية (كاش)
                      </span>
                      <span className="text-base font-bold text-paid dark:text-paid-bright mt-1 block">
                        {signedAmount('+', shiftSummary?.cashSalesPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-paid-soft dark:bg-paid-dark-soft p-3.5 rounded-xl border border-paid/20 dark:border-paid-dark-border">
                      <span className="text-xs text-paid dark:text-paid-bright font-medium block">
                        إيداعات نقدية
                      </span>
                      <span className="text-base font-bold text-paid dark:text-paid-bright mt-1 block">
                        {signedAmount('+', shiftSummary?.cashInPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-danger-soft dark:bg-danger-dark-soft p-3.5 rounded-xl border border-danger-border dark:border-danger-bright/20">
                      <span className="text-xs text-danger dark:text-danger-bright font-medium block">
                        سحوبات نقدية
                      </span>
                      <span className="text-base font-bold text-danger dark:text-danger-bright mt-1 block">
                        {signedAmount('-', shiftSummary?.cashOutPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-danger/10 dark:bg-danger-dark-soft p-3.5 rounded-xl border border-danger/20 dark:border-danger-bright/20">
                      <span className="text-xs text-danger dark:text-danger-bright font-medium block">
                        مرتجعات نقدية للعملاء
                      </span>
                      <span className="text-base font-bold text-danger dark:text-danger-bright mt-1 block">
                        {signedAmount('-', shiftSummary?.returnsCashPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-danger/10 dark:bg-danger-dark-soft p-3.5 rounded-xl border border-danger/20 dark:border-danger-bright/20">
                      <span className="text-xs text-danger dark:text-danger-bright font-medium block">
                        مصروفات نقدية من الدرج
                      </span>
                      <span className="text-base font-bold text-danger dark:text-danger-bright mt-1 block">
                        {signedAmount('-', shiftSummary?.expensesCashPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-xl border border-line dark:border-line-dark">
                      <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium block">
                        تحصيلات آجلة نقدية
                      </span>
                      <span className="text-base font-bold text-paid dark:text-paid-bright mt-1 block">
                        {signedAmount('+', shiftSummary?.debtPaymentsCashPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-xl border border-line dark:border-line-dark">
                      <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium block">
                        إجمالي فواتير الوردية
                      </span>
                      <span className="text-base font-bold text-ink dark:text-ink-dark mt-1 block">
                        {shiftSummary?.invoicesCount ?? 0} فاتورة
                      </span>
                    </div>
                  </div>

                  {/* Non-Cash Channels Info Box */}
                  <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-xl border border-line dark:border-line-dark text-xs text-ink-muted dark:text-ink-dark-muted flex items-start gap-3">
                    <Info className="w-5 h-5 text-brand dark:text-brand-bright shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-ink dark:text-ink-dark block mb-1">
                        قنوات الدفع غير النقدية (لا تؤثر في كاش الدرج):
                      </span>
                      <div className="flex flex-wrap gap-4 text-ink-muted dark:text-ink-dark-muted">
                        <span>فيزا: {formatArabicCurrency(shiftSummary?.cardSalesPiasters ?? 0)}</span>
                        <span>إنستاباي: {formatArabicCurrency(shiftSummary?.instapaySalesPiasters ?? 0)}</span>
                        <span>فودافون كاش: {formatArabicCurrency(shiftSummary?.vodafoneCashSalesPiasters ?? 0)}</span>
                        <span>آجل: {formatArabicCurrency(shiftSummary?.creditSalesPiasters ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CASH IN */}
              {activeTab === 'cash_in' && (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="bg-paid-soft dark:bg-paid-dark-soft p-4 rounded-xl border border-paid/20 dark:border-paid-dark-border flex items-center gap-3">
                    <ArrowDownLeft className="w-6 h-6 text-paid dark:text-paid-bright shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-paid dark:text-paid-bright">
                        تسجيل مبالغ نقدية إضافية تدخل الدرج كفكة صباحية أو عهدة إضافية.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                      مبلغ الإيداع <RequiredMark />
                    </label>
                    <MoneyInput
                      valuePiasters={cashInAmountPiasters}
                      onChangePiasters={setCashInAmountPiasters}
                      placeholder="0.00"
                      autoFocus
                      containerClassName="w-full"
                      className="h-11 text-base font-bold text-paid dark:text-paid-bright"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                      سبب الإيداع
                    </label>
                    <CustomSelect
                      value={cashInReason}
                      onChange={setCashInReason}
                      options={cashInOptions}
                      placeholder="اختر سبب الإيداع"
                    />
                  </div>

                  {cashInReason === 'أخرى' && (
                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                        اكتب سبب الإيداع يدوياً <RequiredMark />
                      </label>
                      <input
                        type="text"
                        value={cashInCustomReason}
                        onChange={(e) => setCashInCustomReason(e.target.value)}
                        placeholder="سبب الإيداع بالتفصيل..."
                        className="w-full h-10 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:ring-2 focus:ring-paid"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => void handleCashIn()}
                    disabled={actionLoading || cashInAmountPiasters <= 0 || !canCashIn}
                    className="w-full h-11 bg-paid hover:bg-paid-hover text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>{actionLoading ? 'جاري التسجيل...' : 'تأكيد تسجيل الإيداع في الدرج'}</span>
                  </button>
                </div>
              )}

              {/* TAB 3: CASH OUT */}
              {activeTab === 'cash_out' && (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="bg-danger/10 dark:bg-danger-dark-soft p-4 rounded-xl border border-danger/20 dark:border-danger-bright/20 flex items-center gap-3">
                    <ArrowUpRight className="w-6 h-6 text-danger dark:text-danger-bright shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-danger dark:text-danger-bright">
                        تسجيل مبالغ نقدية مسحوبة من الدرج لتوريدها للخزينة الرئيسية أو الإدارة.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink dark:text-ink-dark mb-1.5 flex items-center justify-between">
                      <span>مبلغ السحب <RequiredMark /></span>
                      <span className="text-xs font-normal text-ink-muted dark:text-ink-dark-muted">
                        المتوفر بالدرج: {formatArabicCurrency(expectedCash)}
                      </span>
                    </label>
                    <MoneyInput
                      valuePiasters={cashOutAmountPiasters}
                      onChangePiasters={setCashOutAmountPiasters}
                      placeholder="0.00"
                      autoFocus
                      containerClassName="w-full"
                      className="h-11 text-base font-bold text-danger dark:text-danger-bright"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                      سبب السحب
                    </label>
                    <CustomSelect
                      value={cashOutReason}
                      onChange={setCashOutReason}
                      options={cashOutOptions}
                      placeholder="اختر سبب السحب"
                    />
                  </div>

                  {cashOutReason === 'أخرى' && (
                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                        اكتب سبب السحب يدوياً <RequiredMark />
                      </label>
                      <input
                        type="text"
                        value={cashOutCustomReason}
                        onChange={(e) => setCashOutCustomReason(e.target.value)}
                        placeholder="سبب السحب بالتفصيل..."
                        className="w-full h-10 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:ring-2 focus:ring-danger"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => void handleCashOut()}
                    disabled={actionLoading || !shiftSummary || cashOutAmountPiasters <= 0 || cashOutAmountPiasters > expectedCash || !canCashOut}
                    className="w-full h-11 bg-danger hover:bg-danger/90 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>{actionLoading ? 'جاري التسجيل...' : 'تأكيد تسجيل السحب من الدرج'}</span>
                  </button>
                </div>
              )}

              {/* TAB 4: HISTORY */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="t-label text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <History className="w-4 h-4 text-brand dark:text-brand-bright" />
                      <span>حركات الإيداع والسحب النثري للوردية الحالية</span>
                    </h4>
                  </div>

                  {drawerTransactions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark">
                      لا توجد أي حركات إيداع أو سحب نثري مسجلة في هذه الوردية حتى الآن.
                    </div>
                  ) : (
                    <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden divide-y divide-line dark:divide-line-dark text-xs">
                      {drawerTransactions.map((tx) => (
                        <div key={tx.id} className="p-3 bg-surface dark:bg-surface-dark flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'cash_in' ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright' : 'bg-danger/10 dark:bg-danger-dark-soft text-danger dark:text-danger-bright'}`}>
                              {tx.type === 'cash_in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                                <span>{tx.reason}</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                                  {getMovementTypeLabel(tx.type)}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                                  {tx.performedByName}
                                </span>
                              </div>
                              <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                                {formatTimeOnly(tx.createdAt)}
                              </span>
                            </div>
                          </div>

                          <div className={`text-sm font-bold ${tx.type === 'cash_in' ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                            {tx.type === 'cash_in' ? '+' : '-'}{formatArabicCurrency(tx.amountPiasters)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: CLOSE SHIFT */}
              {activeTab === 'close' && (
                <div className="max-w-lg mx-auto space-y-4">
                  <div className="bg-danger/10 dark:bg-danger-dark-soft p-4 rounded-xl border border-danger/30 dark:border-danger-bright/30 flex items-center gap-3">
                    <Lock className="w-6 h-6 text-danger dark:text-danger-bright shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-danger dark:text-danger-bright">
                        قم بعد النقدية الفعلية الموجودة في الدرج وإدخالها لاحتساب العجز أو الزيادة وتشميع السجل.
                      </p>
                    </div>
                  </div>

                  {/* Summary Comparison */}
                  <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-xl border border-line dark:border-line-dark space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted dark:text-ink-dark-muted">النقد المتوقع في الدرج:</span>
                      <span className="font-bold text-ink dark:text-ink-dark text-sm">{formatArabicCurrency(expectedCash)}</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                        النقد الفعلي بالدرج بعد العد والتجنيب
                      </label>
                      <MoneyInput
                        valuePiasters={actualCashPiasters}
                        onChangePiasters={handleActualCashChange}
                        placeholder="0.00"
                        autoFocus
                        containerClassName="w-full"
                        className="h-11 text-base font-bold text-brand dark:text-brand-bright"
                      />
                    </div>

                    {/* Discrepancy Live Result Badge */}
                    <div className="pt-3 border-t border-line dark:border-line-dark flex items-center justify-between">
                      <span className="text-xs font-bold text-ink dark:text-ink-dark">
                        نتيجة المطابقة والتسوية:
                      </span>
                      {currentDiffPiasters === 0 ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-dark-border flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          متطابق تماماً (0.00 ج.م)
                        </span>
                      ) : currentDiffPiasters < 0 ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-danger/10 dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/30 dark:border-danger-bright/30 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          عجز بالدرج: {formatArabicCurrency(currentDiffPiasters)}
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20 flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" />
                          زيادة بالدرج: +{formatArabicCurrency(currentDiffPiasters)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                      ملاحظات وتبريرات الإغلاق
                    </label>
                    <input
                      type="text"
                      value={closeShiftNotes}
                      onChange={(e) => setCloseShiftNotes(e.target.value)}
                      placeholder="مثال: تسليم الدرج للكاشير المناوب بدون مشاكل"
                      className="w-full h-10 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:ring-2 focus:ring-danger"
                    />
                  </div>

                  <button
                    onClick={() => void handleCloseShift()}
                    disabled={actionLoading || !shiftSummary || !canCloseShift}
                    className="w-full h-12 bg-danger hover:bg-danger/90 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{actionLoading ? 'جاري الإغلاق والتشميع...' : 'إغلاق وتشميع الوردية نهائياً'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between shrink-0 text-xs text-ink-muted dark:text-ink-dark-muted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-paid dark:bg-paid-bright" />
            <span>نظام رفيق المحاسبي - حماية الدرج ضد التلاعب المحاسبي 100%</span>
          </div>
        </div>
      </div>

      {/* Styled Confirmation Modal replacing native window.confirm */}
      <ConfirmModal
        isOpen={isConfirmCloseOpen}
        title={`إغلاق وتشميع الوردية رقم #${activeShift?.shiftNumber ?? ''}`}
        message={`${confirmNotice}هل أنت متأكد من رغبتك في إغلاق وتشميع الوردية وتسليم نقدية الدرج؟`}
        consequence="لن يمكنك التراجع أو تسجيل أي مبيعات جديدة على هذه الوردية بعد تشميعها وإغلاقها."
        confirmText="تأكيد التشميع والإغلاق"
        cancelText="تراجع ومراجعة الدرج"
        isDanger={true}
        onConfirm={() => void executeCloseShift()}
        onCancel={() => setIsConfirmCloseOpen(false)}
      />
    </div>
  );
};
