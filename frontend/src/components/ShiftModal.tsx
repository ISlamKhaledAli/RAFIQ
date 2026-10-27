import React, { useState, useEffect, useCallback } from 'react';
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
import { formatArabicCurrency } from '../utils/money';
import type { Shift, ShiftSummary, CashDrawerTransaction } from '../types/models';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftStatusChanged?: (activeShift: Shift | null) => void;
}

type TabType = 'overview' | 'cash_in' | 'cash_out' | 'history' | 'close';

export const ShiftModal: React.FC<ShiftModalProps> = ({
  isOpen,
  onClose,
  onShiftStatusChanged,
}) => {
  const { currentUser, isRoot, isAdmin, hasPermission } = useAuth();
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
      const current = await invoke<Shift | null>('shifts:getActive', {
        posRegisterId: 'default_pos',
      });
      setActiveShift(current);

      const currentId = current ? current.id : null;
      if (lastReportedShiftIdRef.current !== currentId) {
        lastReportedShiftIdRef.current = currentId;
        if (onShiftStatusChangedRef.current) {
          onShiftStatusChangedRef.current(current);
        }
      }

      if (current) {
        const summary = await invoke<ShiftSummary>('shifts:getSummary', {
          shiftId: current.id,
        });
        setShiftSummary(summary);

        const txList = await invoke<CashDrawerTransaction[]>('drawer:getMovements', {
          shiftId: current.id,
        });
        setDrawerTransactions(Array.isArray(txList) ? txList : []);
        setActualCashPiasters(summary ? summary.expectedCashPiasters : 0);
      } else {
        setShiftSummary(null);
        setDrawerTransactions([]);
        const recent = await invoke<Shift[]>('shifts:getHistory', { limit: 10 });
        setRecentShifts(Array.isArray(recent) ? recent : []);
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
      const newShift = await invoke<Shift>('shifts:open', {
        cashierId: currentUser?.id,
        cashierName: currentUser?.displayName || currentUser?.username,
        posRegisterId: 'default_pos',
        openingFloatPiasters,
        notes: openShiftNotes.trim() || undefined,
      });
      const shiftNum = newShift.shiftNumber ?? (newShift as unknown as { ShiftNumber?: number }).ShiftNumber ?? 1;
      setSuccessMessage(`تم فتح الوردية رقم #${shiftNum} بنجاح واستلام عهدة الدرج`);
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
        performedById: currentUser?.id,
        performedByName: currentUser?.displayName || currentUser?.username,
      });
      setSuccessMessage(`تم تسجيل إيداع نثري في الدرج بمبلغ ${(cashInAmountPiasters / 100).toFixed(2)} ج.م بنجاح`);
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
      setErrorMessage(`المبلغ المطلوب سحبه أكبر من النقدية المتوفرة حالياً بالدرج (${(expected / 100).toFixed(2)} ج.م)`);
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
        performedById: currentUser?.id,
        performedByName: currentUser?.displayName || currentUser?.username,
      });
      setSuccessMessage(`تم تسجيل سحب نثري من الدرج بمبلغ ${(cashOutAmountPiasters / 100).toFixed(2)} ج.م بنجاح`);
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

    const expected = shiftSummary?.expectedCashPiasters ?? 0;
    const diff = actualCashPiasters - expected;
    let diffNotice = '';
    if (diff < 0) {
      diffNotice = `يوجد عجز في الدرج قدره ${Math.abs(diff / 100).toFixed(2)} ج.م. `;
    } else if (diff > 0) {
      diffNotice = `توجد زيادة في الدرج قدرها ${(diff / 100).toFixed(2)} ج.م. `;
    } else {
      diffNotice = 'الدرج متطابق تماماً بدون عجز أو زيادة. ';
    }

    setConfirmNotice(diffNotice);
    setIsConfirmCloseOpen(true);
  };

  const executeCloseShift = async () => {
    if (!activeShift) return;
    const currentShiftNum = activeShift.shiftNumber ?? (activeShift as unknown as { ShiftNumber?: number }).ShiftNumber ?? 1;

    setIsConfirmCloseOpen(false);
    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await invoke('shifts:close', {
        shiftId: activeShift.id,
        actualCashPiasters,
        notes: closeShiftNotes.trim() || undefined,
        cashierId: currentUser?.id,
      });
      setSuccessMessage(`تم إغلاق وتشميع الوردية #${currentShiftNum} بنجاح وتسليم الدرج`);
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
                <h2 className="text-base sm:text-lg font-bold text-ink dark:text-ink-dark">
                  إدارة الوردية والخزينة وحركات الدرج
                </h2>
                {activeShift ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid-dark-border flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-paid dark:bg-paid-bright animate-pulse" />
                    وردية #{activeShift.shiftNumber ?? (activeShift as unknown as { ShiftNumber?: number }).ShiftNumber ?? 1} مفتوحة
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warn/10 dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30">
                    الوردية مغلقة
                  </span>
                )}
                {loading && (
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted flex items-center gap-1 font-normal animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-brand" />
                    جاري التحديث...
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                {activeShift
                  ? `الكاشير المسؤول: ${activeShift.cashierName} | تاريخ اليومية: ${activeShift.businessDate}`
                  : 'لا توجد وردية مفتوحة حالياً على هذا الجهاز. يرجى فتح وردية للبدء في البيع.'}
              </p>
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
          <div className="p-3 bg-danger/10 border-b border-danger/30 flex items-center gap-3 text-xs sm:text-sm text-danger shrink-0 font-medium">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <strong>تنبيه انقطاع كهرباء أو إغلاق فجائي:</strong> هذه الوردية تابعة ليوم عمل سابق ({activeShift.businessDate}) لم يتم إغلاقها وتشميعها بشكل نظامي. يرجى مراجعة نقدية الدرج وإغلاق الوردية لتسوية الحسابات.
            </div>
          </div>
        )}

        {/* Global Feedback Messages */}
        {errorMessage && (
          <div className="p-3 bg-danger/10 border-b border-danger/20 flex items-center gap-2 text-xs text-danger shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-paid-soft border-b border-paid/20 flex items-center gap-2 text-xs text-paid shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Navigation Tabs (Only if shift is active) */}
        {activeShift && (
          <div className="flex items-center gap-1 p-2 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark overflow-x-auto shrink-0">
            <button
              onClick={() => setActiveTab('overview')}
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
              onClick={() => setActiveTab('cash_in')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'cash_in'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-paid" />
              <span>تغذية الدرج (Cash In)</span>
            </button>

            <button
              onClick={() => setActiveTab('cash_out')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'cash_out'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-danger" />
              <span>سحب نثري (Cash Out)</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
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
              onClick={() => setActiveTab('close')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all mr-auto ${
                activeTab === 'close'
                  ? 'bg-danger text-white shadow-xs'
                  : 'text-danger hover:bg-danger/10 border border-danger/30'
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
                <h3 className="text-lg font-bold text-ink dark:text-ink-dark">
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
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted mr-auto">({currentUser?.role || 'cashier'})</span>
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
                    ملاحظات افتتاح الوردية (اختياري)
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
                  <h4 className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>آخر الورديات المغلقة السابقة</span>
                  </h4>
                  <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden divide-y divide-line dark:divide-line-dark text-xs">
                    {recentShifts.map((s) => (
                      <div key={s.id} className="p-3 bg-surface dark:bg-surface-dark flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark">
                            <span>وردية #{s.shiftNumber ?? (s as unknown as { ShiftNumber?: number }).ShiftNumber ?? 1}</span>
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
                          <span>الرصيد الفعلي المتوقع للدرج حالياً (Expected Cash)</span>
                        </span>
                        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">
                          {formatArabicCurrency(expectedCash)}
                        </div>
                        <p className="text-xs text-brand-soft/80 mt-1">
                          محسوب بدقة القروش = العهدة + المبيعات النقدية + الإيداعات - المرتجعات - السحوبات - المصروفات
                        </p>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                        <button
                          onClick={() => setActiveTab('cash_in')}
                          className="px-4 py-2 bg-paid hover:bg-paid-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        >
                          <ArrowDownLeft className="w-4 h-4" />
                          <span>تغذية الدرج</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('cash_out')}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-white/20 cursor-pointer"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          <span>سحب نثري</span>
                        </button>
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
                        +{formatArabicCurrency(shiftSummary?.cashSalesPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-paid-soft dark:bg-paid-dark-soft p-3.5 rounded-xl border border-paid/20 dark:border-paid-dark-border">
                      <span className="text-xs text-paid dark:text-paid-bright font-medium block">
                        إيداعات نقدية (Cash In)
                      </span>
                      <span className="text-base font-bold text-paid dark:text-paid-bright mt-1 block">
                        +{formatArabicCurrency(shiftSummary?.cashInPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-danger/10 dark:bg-danger-dark-soft p-3.5 rounded-xl border border-danger/20 dark:border-danger-bright/20">
                      <span className="text-xs text-danger dark:text-danger-bright font-medium block">
                        سحوبات نقدية (Cash Out)
                      </span>
                      <span className="text-base font-bold text-danger dark:text-danger-bright mt-1 block">
                        -{formatArabicCurrency(shiftSummary?.cashOutPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-danger/10 dark:bg-danger-dark-soft p-3.5 rounded-xl border border-danger/20 dark:border-danger-bright/20">
                      <span className="text-xs text-danger dark:text-danger-bright font-medium block">
                        مرتجعات نقدية للعملاء
                      </span>
                      <span className="text-base font-bold text-danger dark:text-danger-bright mt-1 block">
                        -{formatArabicCurrency(shiftSummary?.returnsCashPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-danger/10 dark:bg-danger-dark-soft p-3.5 rounded-xl border border-danger/20 dark:border-danger-bright/20">
                      <span className="text-xs text-danger dark:text-danger-bright font-medium block">
                        مصروفات نقدية من الدرج
                      </span>
                      <span className="text-base font-bold text-danger dark:text-danger-bright mt-1 block">
                        -{formatArabicCurrency(shiftSummary?.expensesCashPiasters ?? 0)}
                      </span>
                    </div>

                    <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-xl border border-line dark:border-line-dark">
                      <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium block">
                        تحصيلات آجلة نقدية
                      </span>
                      <span className="text-base font-bold text-paid dark:text-paid-bright mt-1 block">
                        +{formatArabicCurrency(shiftSummary?.debtPaymentsCashPiasters ?? 0)}
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
                        <span>فيزا: {formatArabicCurrency(shiftSummary?.visaSalesPiasters ?? 0)}</span>
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
                      <h4 className="text-sm font-bold text-paid dark:text-paid-bright">تغذية نقدية للدرج (Cash In)</h4>
                      <p className="text-xs text-paid/80 dark:text-paid-bright/80">
                        تسجيل مبالغ نقدية إضافية تدخل الدرج كفكة صباحية أو عهدة إضافية.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                      مبلغ الإيداع
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
                        اكتب سبب الإيداع يدوياً
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
                      <h4 className="text-sm font-bold text-danger dark:text-danger-bright">سحب نقدي من الدرج (Cash Out)</h4>
                      <p className="text-xs text-danger/80 dark:text-danger-bright/80">
                        تسجيل مبالغ نقدية مسحوبة من الدرج لتوريدها للخزينة الرئيسية أو الإدارة.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink dark:text-ink-dark mb-1.5 flex items-center justify-between">
                      <span>مبلغ السحب</span>
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
                        اكتب سبب السحب يدوياً
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
                    disabled={actionLoading || cashOutAmountPiasters <= 0 || cashOutAmountPiasters > expectedCash || !canCashOut}
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
                    <h4 className="text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <History className="w-4 h-4 text-brand dark:text-brand-bright" />
                      <span>حركات الإيداع والسحب النثري للوردية الحالية</span>
                    </h4>
                    <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                      إجمالي الحركات: {drawerTransactions.length}
                    </span>
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
                                <span className="text-xs px-2 py-0.2 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                                  {tx.performedByName}
                                </span>
                              </div>
                              <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                                {new Date(tx.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
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
                      <h4 className="text-sm font-bold text-danger dark:text-danger-bright">إغلاق وتشميع الوردية نهائياً</h4>
                      <p className="text-xs text-danger/80 dark:text-danger-bright/80">
                        قم بعد النقدية الفعلية الموجودة في الدرج وإدخالها لاحتساب العجز أو الزيادة وتشميع السجل.
                      </p>
                    </div>
                  </div>

                  {/* Summary Comparison */}
                  <div className="bg-surface-2 dark:bg-surface-dark-2 p-4 rounded-xl border border-line dark:border-line-dark space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted dark:text-ink-dark-muted">النقد المتوقع في الدرج (Expected):</span>
                      <span className="font-bold text-ink dark:text-ink-dark text-sm">{formatArabicCurrency(expectedCash)}</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                        النقد الفعلي بالدرج بعد العد والتجنيب (Actual Counted Cash)
                      </label>
                      <MoneyInput
                        valuePiasters={actualCashPiasters}
                        onChangePiasters={setActualCashPiasters}
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
                      ملاحظات وتبريرات الإغلاق (إن وجدت)
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
                    disabled={actionLoading || !canCloseShift}
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

          <button
            type="button"
            onClick={() => void requestClose()}
            className="px-4 py-1.5 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold text-xs shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>

      {/* Styled Confirmation Modal replacing native window.confirm */}
      <ConfirmModal
        isOpen={isConfirmCloseOpen}
        title={`إغلاق وتشميع الوردية رقم #${activeShift?.shiftNumber ?? (activeShift as unknown as { ShiftNumber?: number })?.ShiftNumber ?? 1}`}
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
