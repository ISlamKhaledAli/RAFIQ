import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Printer, 
  X, 
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { SearchInput } from './SearchInput';
import { invoke } from '../bridge/ipc';
import type { DebtorReportItem } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { usePrintReport } from '../hooks/usePrintReport';
import { DateFilterControl } from './DateFilterControl';
import { useDateFilter, isDateFilterActive, describeDateFilter, parseDateToLocalDateStr } from '../utils/dateFilter';

import { AppButton } from './AppButton';
import { formatPhoneDisplay } from '../utils/phoneFormat';
interface DebtorsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DebtorsReportModal: React.FC<DebtorsReportModalProps> = ({
  isOpen,
  onClose
}) => {
  const [debtors, setDebtors] = useState<DebtorReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'overlimit'>('all');
  // Period of the customer's last ledger movement (the report is not capped, so it is filtered here)
  const { dateFilter, setDateFilter, filterDate, resetDateFilter } = useDateFilter();
  const dateActive = isDateFilterActive(dateFilter);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await invoke<DebtorReportItem[]>('reports:getDebtors');
      setDebtors(res || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      resetDateFilter();
      void loadData();
    }
  }, [isOpen, resetDateFilter]);

  const periodDebtors = useMemo(
    () => (dateActive ? debtors.filter(d => filterDate(d.lastTransactionDate)) : debtors),
    [debtors, dateActive, filterDate]
  );

  const filteredDebtors = useMemo(() => {
    let list = periodDebtors;
    if (filterMode === 'overlimit') {
      list = list.filter(d => d.creditLimitPiasters > 0 && d.balancePiasters > d.creditLimitPiasters);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d => 
        d.name.toLowerCase().includes(q) || 
        d.phone.includes(q)
      );
    }
    return list;
  }, [periodDebtors, filterMode, searchQuery]);

  // KPIs
  const totalDebtsPiasters = useMemo(() => {
    return periodDebtors.reduce((acc, curr) => acc + curr.balancePiasters, 0);
  }, [periodDebtors]);

  const overLimitCount = useMemo(() => {
    return periodDebtors.filter(d => d.creditLimitPiasters > 0 && d.balancePiasters > d.creditLimitPiasters).length;
  }, [periodDebtors]);

  const { print: handlePrint, printing } = usePrintReport({
    reportName: 'تقرير المديونيات',
    kind: 'a4only',
    hasData: filteredDebtors.length > 0,
  });

  useEffect(() => {
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

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 print:p-0 print:bg-white print:static"
    >
      <div data-print-root className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:max-h-none print:w-full">
        
        {/* Header (hidden in print) */}
        <div className="px-6 py-4 bg-brand-dark text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-white flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">كشف حساب ديون العملاء المستحقة</h2>
              <p className="text-xs text-white/80 mt-0.5">
                تقرير شامل بأرصدة الذمم الآجلة، نسب استهلاك الحدود الائتمانية وتواريخ آخر حركات السداد
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AppButton variant="secondary" size="sm" icon={Printer} onClick={handlePrint} loading={printing}>
              طباعة كشف الديون
            </AppButton>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
              title="إغلاق"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Header (Visible only when printing) */}
        <div className="hidden print:block p-6 border-b border-line text-center space-y-1">
          <h1 className="text-2xl font-black text-ink">نظام رفيق - كشف حساب ديون العملاء</h1>
          <p className="text-sm text-ink-muted">
            تاريخ التقرير: {new Date().toLocaleDateString('ar-EG-u-nu-latn')} - إجمالي الديون المستحقة: {formatArabicCurrency(totalDebtsPiasters)}
          </p>
          {dateActive && (
            <p className="text-sm text-ink-muted">
              آخر حركة خلال: {describeDateFilter(dateFilter)}
            </p>
          )}
        </div>

        {/* Summary Metric Cards */}
        <div className="p-5 bg-canvas dark:bg-canvas-dark border-b border-line dark:border-line-dark grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
          <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark shadow-xs">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mb-1">إجمالي الديون المستحقة للمحل</span>
            <span className="text-xl font-black text-danger dark:text-danger-bright">
              {formatArabicCurrency(totalDebtsPiasters)}
            </span>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted mt-1 block">رصيد آجل قائم طرف الزبائن</span>
          </div>

          <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark shadow-xs">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mb-1">عدد العملاء المدينين</span>
            <span className="text-xl font-black text-ink dark:text-ink-dark">{periodDebtors.length} عميل</span>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted mt-1 block">عليهم مبالغ غير مسددة</span>
          </div>

          <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark shadow-xs">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mb-1">تجاوزوا الحد الائتماني المسموح</span>
            <span className="text-xl font-black text-warn dark:text-warn-bright">{overLimitCount} عميل</span>
            <span className="text-micro text-warn dark:text-warn-bright mt-1 block">يتطلب التوقف عن منح الآجل</span>
          </div>
        </div>

        {/* Filters and Search Bar (hidden in print) */}
        <div className="px-6 py-3 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-x-8 gap-y-3 print:hidden">
          <SearchInput
            size="sm"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="بحث بالاسم أو رقم الهاتف..."
            ariaLabel="بحث في المدينين"
            className="flex-1 min-w-[18.75rem]"
          />

          <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">آخر حركة:</span>
            <DateFilterControl value={dateFilter} onChange={setDateFilter} size="sm" selectWidthClass="w-44" />
          </div>

          <div className="flex items-center gap-1.5 bg-canvas dark:bg-canvas-dark p-1 rounded-xl border border-line dark:border-line-dark text-xs">
            <button
              type="button"
              aria-pressed={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filterMode === 'all' ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs font-bold' : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              جميع المدينين
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'overlimit'}
              onClick={() => setFilterMode('overlimit')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filterMode === 'overlimit' ? 'bg-surface dark:bg-surface-dark text-warn dark:text-warn-bright shadow-xs font-bold' : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              تجاوزوا الحد
            </button>
          </div>
          </div>
        </div>

        {/* Table content */}
        <div className="flex-1 overflow-y-auto p-6 bg-canvas dark:bg-canvas-dark print:p-0 print:bg-white">
          {loading ? (
            <div className="py-20 text-center text-ink-muted dark:text-ink-dark-muted text-sm">جاري جلب أرصدة العملاء وسجلات الذمم...</div>
          ) : filteredDebtors.length === 0 ? (
            <div className="py-16 text-center text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark">
              <Users className="w-12 h-12 text-ink-muted/40 dark:text-ink-dark-muted/40 mx-auto mb-2" />
              <p className="font-semibold text-sm">
                {dateActive ? `لا يوجد مدينين آخر حركة لهم خلال ${describeDateFilter(dateFilter)}.` : 'لا يوجد أي عملاء مدينين مطابقين للبحث حالياً.'}
              </p>
              {dateActive && (
                <AppButton variant="primary" size="sm" icon={RotateCcw} className="mt-3" onClick={resetDateFilter}>
                  عرض كل الفترات
                </AppButton>
              )}
            </div>
          ) : (
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark overflow-hidden shadow-xs print:border-none print:shadow-none">
              <table className="w-full text-sm text-right">
                <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted text-xs border-b border-line dark:border-line-dark">
                  <tr>
                    <th className="p-3 w-10 text-center print:table-cell">#</th>
                    <th className="p-3">اسم العميل</th>
                    <th className="p-3">رقم الهاتف</th>
                    <th className="p-3 font-bold text-danger dark:text-danger-bright">المبلغ المستحق</th>
                    <th className="p-3">الحد الائتماني</th>
                    <th className="p-3 text-center">حالة السقف</th>
                    <th className="p-3 text-xs">آخر حركة</th>
                    <th className="p-3 text-center print:table-cell hidden print:table-cell">توقيع المستلم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {filteredDebtors.map((d, idx) => {
                    const isOverLimit = d.creditLimitPiasters > 0 && d.balancePiasters > d.creditLimitPiasters;
                    const lastDateFormatted = parseDateToLocalDateStr(d.lastTransactionDate) || '-';

                    return (
                      <tr key={d.customerId} className="hover:bg-surface-2/40 dark:hover:bg-surface-dark-2/40 transition">
                        <td className="p-3 text-xs text-ink-muted dark:text-ink-dark-muted text-center">{idx + 1}</td>
                        <td className="p-3 font-bold text-ink dark:text-ink-dark">{d.name}</td>
                        <td className="p-3 font-mono text-xs text-ink-muted dark:text-ink-dark-muted" dir="ltr">{formatPhoneDisplay(d.phone) || '-'}</td>
                        <td className="p-3 font-black text-danger dark:text-danger-bright">{formatArabicCurrency(d.balancePiasters)}</td>
                        <td className="p-3 text-xs text-ink-muted dark:text-ink-dark-muted">
                          {d.creditLimitPiasters > 0 ? formatArabicCurrency(d.creditLimitPiasters) : 'بلا حد'}
                        </td>
                        <td className="p-3 text-center">
                          {isOverLimit ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright flex items-center gap-1 justify-center">
                              <AlertTriangle className="w-3 h-3" />
                              <span>متجاوز</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright">
                              ضمن الحد
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-ink-muted dark:text-ink-dark-muted font-mono" dir="ltr">
                          {lastDateFormatted}
                        </td>
                        <td className="p-3 text-center hidden print:table-cell">
                          <div className="w-24 h-6 border-b border-ink-muted dark:border-ink-dark-muted mx-auto" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer (hidden in print) */}
        <div className="px-6 py-3 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex items-center justify-between print:hidden">
          <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
            جميع المبالغ مسجلة بالجنيه المصري ومطابقة لأرصدة حركة الحسابات التراكمية.
          </span>
        </div>

      </div>
    </div>
  );
};
