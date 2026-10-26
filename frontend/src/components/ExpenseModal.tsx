import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Receipt, 
  X, 
  Check, 
  Clock, 
  AlertCircle,
  Plus,
  ShieldAlert,
  Building2,
  Wallet,
  Ban,
  CheckCircle2
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { MoneyInput } from './MoneyInput';
import { PaginationBar } from './PaginationBar';
import { formatArabicCurrency } from '../utils/money';
import type { Expense, ExpenseCategory } from '../types/models';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded?: () => void;
}

const DEFAULT_CATEGORIES = [
  { value: 'بوفيه وضيافة', label: 'بوفيه وضيافة (شاي، قهوة، مشروبات)' },
  { value: 'مرافق وفواتير', label: 'مرافق وفواتير (كهرباء، مياه، إنترنت)' },
  { value: 'نظافة ومستهلكات', label: 'نظافة ومستهلكات (منظفات، أكياس)' },
  { value: 'صيانة وتشغيل', label: 'صيانة وتشغيل ومستلزمات' },
  { value: 'انتقالات ومشاوير', label: 'انتقالات ومشاوير ومواصلات' },
  { value: 'إيجار ورواتب', label: 'إيجار مقرات وسلفيات ورواتب' },
  { value: 'دعاية وتسويق', label: 'دعاية وإعلانات ومطبوعات' },
  { value: 'نثريات عامة', label: 'نثريات ومصروفات عامة أخرى' },
];

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onExpenseAdded,
}) => {
  const [amountPiasters, setAmountPiasters] = useState<number>(0);
  const [source, setSource] = useState<'drawer' | 'safe'>('drawer');
  const [category, setCategory] = useState<string>('بوفيه وضيافة');
  const [notes, setNotes] = useState<string>('');
  const [categoriesList, setCategoriesList] = useState<{ value: string; label: string }[]>(DEFAULT_CATEGORIES);
  
  // New category creation state
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCatLoading, setAddingCatLoading] = useState(false);

  // Cancellation state
  const [cancellingExpenseId, setCancellingExpenseId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [managerPin, setManagerPin] = useState<string>('');
  const [isCancellingSubmitting, setIsCancellingSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [drawerBalance, setDrawerBalance] = useState<number | null>(null);

  // Today's expenses log
  const [todayExpenses, setTodayExpenses] = useState<Expense[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);

  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return todayExpenses.slice(start, start + pageSize);
  }, [todayExpenses, currentPage, pageSize]);

  const isDirty = amountPiasters > 0 || notes.trim() !== '' || cancellingExpenseId !== null;

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل تسجيل المصروف؟',
    confirmMessage: 'هناك مبالغ أو بيانات مدخلة في نافذة المصروفات، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة التسجيل',
  });

  const loadTodayExpenses = useCallback(async () => {
    setLoadingList(true);
    try {
      const [expRes, balRes, catsRes] = await Promise.all([
        invoke<Expense[]>('expenses:getToday'),
        invoke<{ availableCashPiasters: number }>('drawer:getBalance').catch(() => null),
        invoke<ExpenseCategory[]>('expenses:getCategories').catch(() => null),
      ]);
      setTodayExpenses(expRes || []);
      if (balRes && typeof balRes.availableCashPiasters === 'number') {
        setDrawerBalance(balRes.availableCashPiasters);
      }
      if (catsRes && Array.isArray(catsRes) && catsRes.length > 0) {
        const mapped = catsRes.map((c) => ({
          value: c.name,
          label: c.description ? `${c.name} (${c.description})` : c.name,
        }));
        setCategoriesList(mapped);
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setAmountPiasters(0);
      setSource('drawer');
      setCategory('بوفيه وضيافة');
      setNotes('');
      setError(null);
      setSuccessMsg(null);
      setIsAddingCategory(false);
      setNewCategoryName('');
      setCancellingExpenseId(null);
      setCancelReason('');
      setManagerPin('');
      setCancelError(null);
      void loadTodayExpenses();
    }
  }, [isOpen, loadTodayExpenses]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountPiasters <= 0) {
      setError('يرجى إدخال مبلغ المصروف بشكل صحيح');
      return;
    }

    if (source === 'drawer' && drawerBalance !== null && amountPiasters > drawerBalance) {
      setError(`رصيد نقدية الدرج المتاح (${formatArabicCurrency(drawerBalance)}) غير كافٍ لصرف هذا المبلغ. يرجى توريد عهدة أو الصرف من الخزينة الرئيسية.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await invoke<Expense>('expenses:create', {
        amountPiasters,
        category,
        notes: notes.trim(),
        source,
      });

      if (res) {
        const srcLabel = source === 'drawer' ? 'خصمه من درج الكاشير' : 'قيده على الخزينة الرئيسية';
        setSuccessMsg(`تم تسجيل المصروف بقيمة ${formatArabicCurrency(amountPiasters)} و${srcLabel} بنجاح`);
        setAmountPiasters(0);
        setNotes('');
        void loadTodayExpenses();
        if (onExpenseAdded) onExpenseAdded();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل المصروف في قاعدة البيانات';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setAddingCatLoading(true);
    try {
      const created = await invoke<ExpenseCategory>('expenses:createCategory', { name: trimmed });
      if (created) {
        const newOpt = { value: created.name, label: created.name };
        setCategoriesList((prev) => [newOpt, ...prev.filter((p) => p.value !== created.name)]);
        setCategory(created.name);
        setIsAddingCategory(false);
        setNewCategoryName('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة بند المصروف');
    } finally {
      setAddingCatLoading(false);
    }
  };

  const handleConfirmCancelExpense = async (expenseId: string) => {
    if (!cancelReason.trim()) {
      setCancelError('يجب إدخال سبب إلغاء المصروف لتوثيقه في سجل التدقيق');
      return;
    }

    setIsCancellingSubmitting(true);
    setCancelError(null);

    try {
      await invoke('expenses:cancel', {
        expenseId,
        reason: cancelReason.trim(),
        managerPin: managerPin.trim() || undefined,
      });

      setSuccessMsg('تم إلغاء المصروف بنجاح وتحديث موازنة اليومية وسجل التدقيق');
      setCancellingExpenseId(null);
      setCancelReason('');
      setManagerPin('');
      void loadTodayExpenses();
      if (onExpenseAdded) onExpenseAdded();
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'تعذر إلغاء المصروف');
    } finally {
      setIsCancellingSubmitting(false);
    }
  };

  const activeExpenses = todayExpenses.filter((e) => !e.isCancelled);
  const totalTodayExpensesPiasters = activeExpenses.reduce((sum, item) => sum + (item.amountPiasters || 0), 0);
  const drawerExpensesPiasters = activeExpenses
    .filter((e) => e.source === 'drawer' || !e.source)
    .reduce((sum, item) => sum + (item.amountPiasters || 0), 0);
  const safeExpensesPiasters = activeExpenses
    .filter((e) => e.source === 'safe')
    .reduce((sum, item) => sum + (item.amountPiasters || 0), 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 select-none" 
      onClick={handleBackdropClick}
      dir="rtl"
    >
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 bg-brand-dark dark:bg-surface-dark-2 text-white dark:text-ink-dark border-b dark:border-line-dark flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10 dark:bg-surface-dark-3 text-white dark:text-brand-bright flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white dark:text-ink-dark">تسجيل مصروفات ونثريات</h3>
              <p className="text-xs text-white/70 dark:text-ink-dark-muted">خصم نثريات من درج الشفت أو الخزينة مع التدقيق المالي المعتمد</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="p-1.5 rounded-lg text-white/80 dark:text-ink-dark-muted hover:text-white dark:hover:text-ink-dark hover:bg-white/10 dark:hover:bg-surface-dark-3 transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-canvas dark:bg-canvas-dark">
          {error && (
            <div className="p-3 rounded-xl bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid/40 text-paid dark:text-paid-bright text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Source Selection (Drawer vs Main Safe) */}
            <div>
              <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                مصدر الصرف النقدي *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSource('drawer')}
                  className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center gap-2.5 ${
                    source === 'drawer'
                      ? 'border-brand dark:border-brand-bright bg-brand-soft/50 dark:bg-brand-soft/10 text-brand-dark dark:text-brand-bright font-bold ring-1 ring-brand dark:ring-brand-bright'
                      : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:border-line-hover'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${source === 'drawer' ? 'bg-brand text-white dark:bg-brand-bright dark:text-brand-dark' : 'bg-surface-2 dark:bg-surface-dark-2'}`}>
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">درج شفت الكاشير</div>
                    <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">يُخصم فوراً من عهدة الدرج</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSource('safe')}
                  className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center gap-2.5 ${
                    source === 'safe'
                      ? 'border-brand dark:border-brand-bright bg-brand-soft/50 dark:bg-brand-soft/10 text-brand-dark dark:text-brand-bright font-bold ring-1 ring-brand dark:ring-brand-bright'
                      : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:border-line-hover'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${source === 'safe' ? 'bg-brand text-white dark:bg-brand-bright dark:text-brand-dark' : 'bg-surface-2 dark:bg-surface-dark-2'}`}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">الخزينة الرئيسية</div>
                    <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">لا يؤثر على عهدة درج الوردية</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-ink dark:text-ink-dark">
                  المبلغ المنصرف (ج.م) *
                </label>
                {source === 'drawer' && drawerBalance !== null && (
                  <span className="text-[11px] font-medium text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 px-2 py-0.5 rounded-md border border-line dark:border-line-dark">
                    كاش الدرج المتاح: <strong className={drawerBalance < amountPiasters ? 'text-danger dark:text-danger-bright font-mono font-bold' : 'text-paid dark:text-brand-bright font-mono font-bold'}>{formatArabicCurrency(drawerBalance)}</strong>
                  </span>
                )}
              </div>
              <MoneyInput
                valuePiasters={amountPiasters}
                onChangePiasters={setAmountPiasters}
                placeholder="0.00"
                className="text-2xl font-black bg-white dark:bg-surface-dark dark:text-ink-dark"
                autoFocus
              />
              {source === 'drawer' && drawerBalance !== null && amountPiasters > drawerBalance && (
                <div className="mt-2 p-2.5 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/40 text-danger dark:text-danger-bright text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>رصيد نقدية الدرج المتاح حالياً ({formatArabicCurrency(drawerBalance)}) غير كافٍ لصرف هذا المصروف. يرجى توريد عهدة للدرج أو الصرف من الخزينة الرئيسية.</span>
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-ink dark:text-ink-dark">
                  بند وتصنيف المصروف *
                </label>
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(!isAddingCategory)}
                  className="text-[11px] font-semibold text-brand dark:text-brand-bright hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isAddingCategory ? 'إلغاء الإضافة' : 'إضافة بند مخصص جديد'}</span>
                </button>
              </div>

              {isAddingCategory ? (
                <div className="p-2.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex gap-2 items-center">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="اسم بند المصروف الجديد (مثلاً: بنزين، إكراميات)..."
                    className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateCategory()}
                    disabled={addingCatLoading || !newCategoryName.trim()}
                    className="px-3 py-1.5 text-xs font-bold bg-brand text-white rounded-lg hover:bg-brand-dark disabled:opacity-50 cursor-pointer"
                  >
                    {addingCatLoading ? 'جاري الحفظ...' : 'حفظ البند'}
                  </button>
                </div>
              ) : (
                <CustomSelect
                  value={category}
                  onChange={setCategory}
                  options={categoriesList}
                  placeholder="اختر بند المصروف"
                />
              )}
            </div>

            {/* Notes / Description */}
            <div>
              <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-1.5">
                تفاصيل المصروف أو البيان (اختياري)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: شراء شاي وسكر للبوفيه، تصليح لمبة..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 transition-colors"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || amountPiasters <= 0 || (source === 'drawer' && drawerBalance !== null && amountPiasters > drawerBalance)}
              className="w-full py-2.5 px-4 rounded-xl bg-danger hover:bg-red-700 active:bg-red-800 disabled:bg-surface-2 dark:disabled:bg-surface-dark-2 disabled:text-ink-muted dark:disabled:text-ink-dark-muted text-white font-bold text-sm shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Receipt className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري التسجيل والخصم...' : (source === 'drawer' ? 'خصم من الدرج وتسجيل المصروف' : 'صرف من الخزينة الرئيسية وتسجيل المصروف')}</span>
            </button>
          </form>

          {/* Today's Expenses Summary */}
          <div className="pt-3 border-t border-line dark:border-line-dark space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink dark:text-ink-dark">
                مصروفات اليوم النشطة ({activeExpenses.length}):
              </span>
              <div className="flex items-center gap-3 font-mono font-bold text-xs">
                {drawerExpensesPiasters > 0 && (
                  <span className="text-danger dark:text-danger-bright">درج: {formatArabicCurrency(drawerExpensesPiasters)}</span>
                )}
                {safeExpensesPiasters > 0 && (
                  <span className="text-brand dark:text-brand-bright">خزينة: {formatArabicCurrency(safeExpensesPiasters)}</span>
                )}
                <span className="text-ink dark:text-ink-dark font-black">
                  الإجمالي: {formatArabicCurrency(totalTodayExpensesPiasters)}
                </span>
              </div>
            </div>

            {loadingList ? (
              <div className="py-4 text-center text-xs text-ink-muted dark:text-ink-dark-muted">جاري التحميل...</div>
            ) : todayExpenses.length === 0 ? (
              <div className="p-3 text-center text-xs text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark">
                لم يتم تسجيل أي مصروفات اليوم حتى الآن.
              </div>
            ) : (
              <>
                <div className="max-h-52 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                {paginatedExpenses.map((exp) => {
                  const isDrawer = exp.source === 'drawer' || !exp.source;
                  const isItemCancelling = cancellingExpenseId === exp.id;

                  return (
                    <div 
                      key={exp.id} 
                      className={`p-3 rounded-xl border transition-all ${
                        exp.isCancelled 
                          ? 'bg-surface-2/60 dark:bg-surface-dark-2/40 border-line/50 opacity-70' 
                          : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isDrawer 
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' 
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}>
                            {isDrawer ? 'درج الوردية' : 'خزينة رئيسية'}
                          </span>

                          <span className={`font-semibold ${exp.isCancelled ? 'line-through text-ink-muted dark:text-ink-dark-muted' : 'text-ink dark:text-ink-dark'}`}>
                            {exp.category}
                          </span>

                          {exp.notes && (
                            <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                              ({exp.notes})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`font-bold font-mono ${
                            exp.isCancelled 
                              ? 'line-through text-ink-muted' 
                              : 'text-danger dark:text-danger-bright'
                          }`}>
                            -{formatArabicCurrency(exp.amountPiasters)}
                          </span>

                          {!exp.isCancelled && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingExpenseId(isItemCancelling ? null : exp.id);
                                setCancelReason('');
                                setManagerPin('');
                                setCancelError(null);
                              }}
                              className="p-1 rounded-md text-ink-muted hover:text-danger hover:bg-danger-soft/50 dark:hover:bg-danger-soft/20 transition cursor-pointer"
                              title="إلغاء المصروف وتوثيقه في التدقيق"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="flex items-center justify-between text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1.5 pt-1 border-t border-line/40 dark:border-line-dark/40">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1" dir="ltr">
                            <Clock className="w-3 h-3" />
                            <span>{exp.createdAt ? exp.createdAt.substring(11, 16) : ''}</span>
                          </span>
                          {exp.createdBy && <span>بواسطة: {exp.createdBy}</span>}
                          {exp.expenseNumber && <span>رقم الإيصال #{exp.expenseNumber}</span>}
                        </div>

                        {exp.isCancelled && (
                          <div className="text-danger dark:text-danger-bright font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>ملغى ({exp.cancelReason || 'بناءً على طلب المدير'})</span>
                          </div>
                        )}
                      </div>

                      {/* Inline cancellation prompt */}
                      {isItemCancelling && (
                        <div className="mt-2.5 p-3 rounded-xl bg-danger-soft/40 dark:bg-danger-soft/10 border border-danger/30 space-y-2 animate-in fade-in duration-150">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-danger dark:text-danger-bright">
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span>تأكيد إلغاء المصروف (يتطلب صلاحية مدير وتدوين السبب)</span>
                          </div>

                          {cancelError && (
                            <div className="text-[11px] text-danger font-semibold bg-danger-soft p-1.5 rounded-md">
                              {cancelError}
                            </div>
                          )}

                          <input
                            type="text"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="سبب الإلغاء (إلزامي للتدقيق المالي)..."
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface-dark border border-line rounded-lg text-ink focus:outline-none focus:border-danger"
                          />

                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={managerPin}
                              onChange={(e) => setManagerPin(e.target.value)}
                              placeholder="رمز PIN المدير (إن لم تكن مديراً)"
                              className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-surface-dark border border-line rounded-lg text-ink focus:outline-none focus:border-danger"
                            />
                            <button
                              type="button"
                              onClick={() => void handleConfirmCancelExpense(exp.id)}
                              disabled={isCancellingSubmitting || !cancelReason.trim()}
                              className="px-3 py-1.5 rounded-lg bg-danger hover:bg-red-700 text-white font-bold text-xs disabled:opacity-50 transition cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isCancellingSubmitting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancellingExpenseId(null)}
                              className="px-2.5 py-1.5 rounded-lg border border-line text-ink-muted hover:text-ink text-xs transition cursor-pointer"
                            >
                              تراجع
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {todayExpenses.length > 5 && (
                <PaginationBar
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalCount={todayExpenses.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setCurrentPage(1);
                  }}
                  pageSizeOptions={[5, 10, 20]}
                  itemLabel="إيصال مصروف"
                  className="mt-2 py-1.5 px-3 text-xs"
                />
              )}
            </>
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex justify-end">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="px-4 py-1.5 rounded-lg border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-xs font-semibold cursor-pointer transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
