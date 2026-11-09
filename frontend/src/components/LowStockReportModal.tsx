import React, { useState, useEffect, useMemo } from 'react';
import { 
  Printer, 
  X, 
  Boxes
} from 'lucide-react';
import { SearchInput } from './SearchInput';
import { invoke } from '../bridge/ipc';
import type { LowStockReportItem } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { usePrintReport } from '../hooks/usePrintReport';
import { formatUnitArabic } from '../utils/units';
import { AppButton } from './AppButton';

interface LowStockReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LowStockReportModal: React.FC<LowStockReportModalProps> = ({
  isOpen,
  onClose
}) => {
  const [items, setItems] = useState<LowStockReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'zero'>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await invoke<LowStockReportItem[]>('reports:getLowStock');
      setItems(res || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setFilterMode('all');
      void loadData();
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterMode === 'zero') {
      result = result.filter(item => item.stockMilli <= 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.barcode.toLowerCase().includes(q) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, filterMode, searchQuery]);

  // KPIs
  const totalSuggestedCost = useMemo(() => {
    return filteredItems.reduce((acc, curr) => acc + curr.estimatedCostPiasters, 0);
  }, [filteredItems]);

  const zeroStockCount = useMemo(() => {
    return items.filter(item => item.stockMilli <= 0).length;
  }, [items]);

  const { print: handlePrint, printing } = usePrintReport({
    reportName: 'تقرير النواقص',
    kind: 'a4only',
    hasData: filteredItems.length > 0,
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
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">تقرير النواقص وقائمة طلب البضاعة</h2>
              <p className="text-xs text-white/80 mt-0.5">
                حصر الأصناف التي بلغت حد الطلب أو نفدت تماماً مع حساب الكميات المقترحة وتكلفة الطلبية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AppButton variant="secondary" icon={Printer} onClick={handlePrint} loading={printing}>
              طباعة أمر الشراء
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
          <h1 className="text-2xl font-black text-ink">نظام رفيق - أمر شراء ونواقص المخزون</h1>
          <p className="text-sm text-ink-muted">
            تاريخ التقرير: {new Date().toLocaleDateString('ar-EG-u-nu-latn')} - إجمالي الأصناف الناقصة: {filteredItems.length}
          </p>
        </div>

        {/* Summary Metric Cards */}
        <div className="p-5 bg-canvas dark:bg-canvas-dark border-b border-line dark:border-line-dark grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
          <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark shadow-xs">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mb-1">الأصناف المطلوب شراؤها</span>
            <span className="text-xl font-black text-ink dark:text-ink-dark">{filteredItems.length} صنف</span>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted mt-1 block">تحت حد الأمان للمخزن</span>
          </div>

          <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark shadow-xs">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mb-1">أصناف نفدت تماماً (رصيد صفر)</span>
            <span className="text-xl font-black text-danger dark:text-danger-bright">{zeroStockCount} صنف</span>
            <span className="text-micro text-danger dark:text-danger-bright mt-1 block">تتطلب طلبية فورية عاجلة</span>
          </div>

          <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark shadow-xs">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted block mb-1">إجمالي تكلفة الطلب التقديرية</span>
            <span className="text-xl font-black text-brand dark:text-brand-bright">
              {formatArabicCurrency(totalSuggestedCost)}
            </span>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted mt-1 block">محسوب بأسعار التكلفة الأخيرة</span>
          </div>
        </div>

        {/* Filters and Search Bar (hidden in print) */}
        <div className="px-6 py-3 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-x-8 gap-y-3 print:hidden">
          <SearchInput
            size="sm"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="بحث بالاسم أو الباركود أو القسم..."
            ariaLabel="بحث في تقرير النواقص"
            className="flex-1 min-w-[18.75rem]"
          />

          <div className="flex items-center gap-1.5 bg-canvas dark:bg-canvas-dark p-1 rounded-xl border border-line dark:border-line-dark text-xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filterMode === 'all' ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs font-bold' : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              كل النواقص
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('zero')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filterMode === 'zero' ? 'bg-surface dark:bg-surface-dark text-danger dark:text-danger-bright shadow-xs font-bold' : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              المنتهية تماماً
            </button>
          </div>
        </div>

        {/* Table content */}
        <div className="flex-1 overflow-y-auto p-6 bg-canvas dark:bg-canvas-dark print:p-0 print:bg-white">
          {loading ? (
            <div className="py-20 text-center text-ink-muted dark:text-ink-dark-muted text-sm">جاري مراجعة أرصدة المخزون وحدود الطلب...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark">
              <Boxes className="w-12 h-12 text-ink-muted/40 dark:text-ink-dark-muted/40 mx-auto mb-2" />
              <p className="font-semibold text-sm">المخزون مكتمل بالكامل ولا توجد نواقص مطابقة حالياً.</p>
            </div>
          ) : (
            <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark overflow-hidden shadow-xs print:border-none print:shadow-none">
              <table className="w-full text-sm text-right">
                <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted text-xs border-b border-line dark:border-line-dark">
                  <tr>
                    <th className="p-3 w-10 text-center print:table-cell">#</th>
                    <th className="p-3">الباركود</th>
                    <th className="p-3">اسم الصنف</th>
                    <th className="p-3">القسم</th>
                    <th className="p-3 text-center">الرصيد الحالي</th>
                    <th className="p-3 text-center">حد الطلب</th>
                    <th className="p-3 text-center font-bold text-brand dark:text-brand-bright">الكمية المقترحة</th>
                    <th className="p-3">سعر الشراء</th>
                    <th className="p-3">إجمالي التكلفة</th>
                    <th className="p-3 text-center print:table-cell hidden print:table-cell">تم الاستلام</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {filteredItems.map((item, idx) => {
                    const currentStock = (item.stockMilli / 1000).toLocaleString('en-US');
                    const minStock = (item.minStockMilli / 1000).toLocaleString('en-US');
                    const suggested = (item.suggestedOrderMilli / 1000).toLocaleString('en-US');
                    const isZero = item.stockMilli <= 0;

                    return (
                      <tr key={item.productId} className="hover:bg-surface-2/40 dark:hover:bg-surface-dark-2/40 transition">
                        <td className="p-3 text-xs text-ink-muted dark:text-ink-dark-muted text-center">{idx + 1}</td>
                        <td className="p-3 font-mono text-xs text-ink-muted dark:text-ink-dark-muted">{item.barcode || '-'}</td>
                        <td className="p-3 font-bold text-ink dark:text-ink-dark">
                          <div>{item.name}</div>
                          <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-normal">{formatUnitArabic(item.unit)}</span>
                        </td>
                        <td className="p-3 text-xs text-ink-muted dark:text-ink-dark-muted">{item.categoryName || '-'}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            isZero ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright' : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright'
                          }`}>
                            {currentStock}
                          </span>
                        </td>
                        <td className="p-3 text-center text-xs text-ink-muted dark:text-ink-dark-muted">{minStock}</td>
                        <td className="p-3 text-center font-black text-brand dark:text-brand-bright bg-brand-soft/40 dark:bg-brand-soft/10">
                          {suggested}
                        </td>
                        <td className="p-3 text-xs text-ink dark:text-ink-dark">{formatArabicCurrency(item.unitCostPiasters)}</td>
                        <td className="p-3 font-bold text-ink dark:text-ink-dark">{formatArabicCurrency(item.estimatedCostPiasters)}</td>
                        <td className="p-3 text-center hidden print:table-cell">
                          <div className="w-5 h-5 border border-ink-muted dark:border-ink-dark-muted mx-auto rounded-xs" />
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
            معادلة الاقتراح: ضعف حد الأمان مطروحاً منه الرصيد الحالي بما يضمن عدم انقطاع الصنف.
          </span>
        </div>

      </div>
    </div>
  );
};
