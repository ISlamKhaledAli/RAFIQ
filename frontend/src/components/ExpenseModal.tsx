import React, { useState, useEffect, useCallback } from 'react';
import { 
  Receipt, 
  X, 
  Check, 
  Clock, 
  AlertCircle
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { MoneyInput } from './MoneyInput';
import { formatArabicCurrency } from '../utils/money';
import type { Expense } from '../types/models';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded?: () => void;
}

const EXPENSE_CATEGORIES = [
  { value: 'بوفيه وضيافة', label: 'بوفيه وضيافة (شاي، قهوة، مشروبات)' },
  { value: 'مرافق وفواتير', label: 'مرافق وفواتير (كهرباء، مياه، إنترنت)' },
  { value: 'نظافة ومستهلكات', label: 'نظافة ومستهلكات (منظفات، أكياس)' },
  { value: 'صيانة وتشغيل', label: 'صيانة وتشغيل ومستلزمات' },
  { value: 'انتقالات ومشاوير', label: 'انتقالات ومشاوير ومواصلات' },
  { value: 'نثريات عامة', label: 'نثريات ومصروفات عامة أخرى' },
];

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onExpenseAdded,
}) => {
  const [amountPiasters, setAmountPiasters] = useState<number>(0);
  const [category, setCategory] = useState<string>('بوفيه وضيافة');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Today's expenses log
  const [todayExpenses, setTodayExpenses] = useState<Expense[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const loadTodayExpenses = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await invoke<Expense[]>('expenses:getToday');
      setTodayExpenses(res || []);
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setAmountPiasters(0);
      setCategory('بوفيه وضيافة');
      setNotes('');
      setError(null);
      setSuccessMsg(null);
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

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await invoke<Expense>('expenses:create', {
        amountPiasters,
        category,
        notes: notes.trim(),
      });

      if (res) {
        setSuccessMsg(`تم تسجيل المصروف بقيمة ${formatArabicCurrency(amountPiasters)} وخصمه من الدرج بنجاح`);
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

  const totalTodayExpensesPiasters = todayExpenses.reduce((sum, item) => sum + (item.amountPiasters || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 select-none" dir="rtl">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 bg-brand-dark text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10 text-white flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">تسجيل مصروف من الدرج</h3>
              <p className="text-xs text-white/70">يُخصم مباشرة من النقد المتوقع في الدرج عند تقفيل اليومية</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-canvas">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-paid-soft border border-paid/20 text-paid text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Amount input */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">
                المبلغ المنصرف من الدرج (ج.م) *
              </label>
              <MoneyInput
                valuePiasters={amountPiasters}
                onChangePiasters={setAmountPiasters}
                placeholder="0.00"
                className="text-2xl font-black bg-white"
                autoFocus
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">
                بند المصروف *
              </label>
              <CustomSelect
                value={category}
                onChange={setCategory}
                options={EXPENSE_CATEGORIES}
                placeholder="اختر بند المصروف"
              />
            </div>

            {/* Notes / Description */}
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">
                تفاصيل المصروف أو البيان (اختياري)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: شراء شاي وسكر للبوفيه، تصليح لمبة..."
                className="w-full px-3 py-2 text-sm bg-white border border-line rounded-xl focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || amountPiasters <= 0}
              className="w-full py-2.5 px-4 rounded-xl bg-danger hover:bg-red-700 active:bg-red-800 disabled:bg-surface-2 disabled:text-ink-muted text-white font-bold text-sm shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Receipt className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري التسجيل والخصم...' : 'خصم من الدرج وتسجيل المصروف'}</span>
            </button>
          </form>

          {/* Today's Expenses Summary */}
          <div className="pt-3 border-t border-line space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink">مصروفات درج اليوم ({todayExpenses.length}):</span>
              <span className="font-bold font-mono text-danger">
                إجمالي: {formatArabicCurrency(totalTodayExpensesPiasters)}
              </span>
            </div>

            {loadingList ? (
              <div className="py-4 text-center text-xs text-ink-muted">جاري التحميل...</div>
            ) : todayExpenses.length === 0 ? (
              <div className="p-3 text-center text-xs text-ink-muted bg-surface rounded-xl border border-line">
                لم يتم تسجيل أي مصروفات من الدرج اليوم حتى الآن.
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
                {todayExpenses.map((exp) => (
                  <div key={exp.id} className="p-2.5 rounded-lg bg-surface border border-line text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-ink flex items-center gap-1.5">
                        <span>{exp.category}</span>
                        {exp.notes && <span className="text-[11px] text-ink-muted">({exp.notes})</span>}
                      </div>
                      <div className="text-[10px] text-ink-muted flex items-center gap-1 mt-0.5" dir="ltr">
                        <Clock className="w-3 h-3" />
                        <span>{exp.createdAt ? exp.createdAt.substring(11, 16) : ''}</span>
                      </div>
                    </div>
                    <span className="font-bold font-mono text-danger">
                      -{formatArabicCurrency(exp.amountPiasters)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface border-t border-line flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-line text-ink hover:bg-surface-2 text-xs font-semibold cursor-pointer transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
