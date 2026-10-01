import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Printer, 
  Search, 
  X, 
  AlertTriangle 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DebtorReportItem } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

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
      void loadData();
    }
  }, [isOpen]);

  const filteredDebtors = useMemo(() => {
    let list = debtors;
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
  }, [debtors, filterMode, searchQuery]);

  // KPIs
  const totalDebtsPiasters = useMemo(() => {
    return debtors.reduce((acc, curr) => acc + curr.balancePiasters, 0);
  }, [debtors]);

  const overLimitCount = useMemo(() => {
    return debtors.filter(d => d.creditLimitPiasters > 0 && d.balancePiasters > d.creditLimitPiasters).length;
  }, [debtors]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 print:p-0 print:bg-white print:static">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:max-h-none print:w-full">
        
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
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-brand hover:bg-white/90 transition flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة كشف الديون</span>
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

        {/* Printable Header (Visible only when printing) */}
        <div className="hidden print:block p-6 border-b border-line text-center space-y-1">
          <h1 className="text-2xl font-black text-ink">رفيق POS - كشف حساب ديون العملاء</h1>
          <p className="text-sm text-ink-muted">
            تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')} - إجمالي الديون المستحقة: {formatArabicCurrency(totalDebtsPiasters)}
          </p>
        </div>

        {/* Summary Metric Cards */}
        <div className="p-5 bg-canvas border-b border-line grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
          <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
            <span className="text-xs text-ink-muted block mb-1">إجمالي الديون المستحقة للمحل</span>
            <span className="text-xl font-black text-danger">
              {formatArabicCurrency(totalDebtsPiasters)}
            </span>
            <span className="text-[11px] text-ink-muted mt-1 block">رصيد آجل قائم طرف الزبائن</span>
          </div>

          <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
            <span className="text-xs text-ink-muted block mb-1">عدد العملاء المدينين</span>
            <span className="text-xl font-black text-ink">{debtors.length} عميل</span>
            <span className="text-[11px] text-ink-muted mt-1 block">عليهم مبالغ غير مسددة</span>
          </div>

          <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
            <span className="text-xs text-ink-muted block mb-1">تجاوزوا الحد الائتماني المسموح</span>
            <span className="text-xl font-black text-warn">{overLimitCount} عميل</span>
            <span className="text-[11px] text-warn mt-1 block">يتطلب التوقف عن منح الآجل</span>
          </div>
        </div>

        {/* Filters and Search Bar (hidden in print) */}
        <div className="px-6 py-3 bg-surface border-b border-line flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم أو رقم الهاتف..."
              className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-line bg-canvas text-ink focus:outline-hidden focus:border-brand"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-canvas p-1 rounded-xl border border-line text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filterMode === 'all' ? 'bg-surface text-brand shadow-xs font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              جميع المدينين ({debtors.length})
            </button>
            <button
              onClick={() => setFilterMode('overlimit')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filterMode === 'overlimit' ? 'bg-surface text-warn shadow-xs font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              تجاوزوا الحد ({overLimitCount})
            </button>
          </div>
        </div>

        {/* Table content */}
        <div className="flex-1 overflow-y-auto p-6 bg-canvas print:p-0 print:bg-white">
          {loading ? (
            <div className="py-20 text-center text-ink-muted text-sm">جاري جلب أرصدة العملاء وسجلات الذمم...</div>
          ) : filteredDebtors.length === 0 ? (
            <div className="py-16 text-center text-ink-muted bg-surface rounded-2xl border border-line">
              <Users className="w-12 h-12 text-ink-muted/40 mx-auto mb-2" />
              <p className="font-semibold text-sm">لا يوجد أي عملاء مدينين مطابقين للبحث حالياً.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs print:border-none print:shadow-none">
              <table className="w-full text-sm text-right">
                <thead className="bg-surface-2 text-ink-muted text-xs border-b border-line">
                  <tr>
                    <th className="p-3 w-10 text-center print:table-cell">#</th>
                    <th className="p-3">اسم العميل</th>
                    <th className="p-3">رقم الهاتف</th>
                    <th className="p-3 font-bold text-danger">المبلغ المستحق</th>
                    <th className="p-3">الحد الائتماني</th>
                    <th className="p-3 text-center">حالة السقف</th>
                    <th className="p-3 text-xs">آخر حركة</th>
                    <th className="p-3 text-center print:table-cell hidden print:table-cell">توقيع المستلم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredDebtors.map((d, idx) => {
                    const isOverLimit = d.creditLimitPiasters > 0 && d.balancePiasters > d.creditLimitPiasters;
                    const lastDateFormatted = d.lastTransactionDate 
                      ? d.lastTransactionDate.substring(0, 10) 
                      : '-';

                    return (
                      <tr key={d.customerId} className="hover:bg-surface-2/40 transition">
                        <td className="p-3 text-xs text-ink-muted text-center">{idx + 1}</td>
                        <td className="p-3 font-bold text-ink">{d.name}</td>
                        <td className="p-3 font-mono text-xs text-ink-muted" dir="ltr">{d.phone || '-'}</td>
                        <td className="p-3 font-black text-danger">{formatArabicCurrency(d.balancePiasters)}</td>
                        <td className="p-3 text-xs text-ink-muted">
                          {d.creditLimitPiasters > 0 ? formatArabicCurrency(d.creditLimitPiasters) : 'بلا حد'}
                        </td>
                        <td className="p-3 text-center">
                          {isOverLimit ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-danger flex items-center gap-1 justify-center">
                              <AlertTriangle className="w-3 h-3" />
                              <span>متجاوز</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-paid-soft text-paid">
                              ضمن الحد
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-ink-muted font-mono" dir="ltr">
                          {lastDateFormatted}
                        </td>
                        <td className="p-3 text-center hidden print:table-cell">
                          <div className="w-24 h-6 border-b border-ink-muted mx-auto" />
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
        <div className="px-6 py-3 bg-surface border-t border-line flex items-center justify-between print:hidden">
          <span className="text-xs text-ink-muted">
            جميع المبالغ مسجلة بالجنيه المصري ومطابقة لأرصدة حركة الحسابات التراكمية.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-surface-2 rounded-xl transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
