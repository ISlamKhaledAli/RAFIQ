import React, { useState, useEffect, useMemo } from 'react';
import { 
  Printer, 
  Search, 
  X, 
  Boxes
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { LowStockReportItem } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

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
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-brand hover:bg-white/90 transition flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة أمر الشراء</span>
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
          <h1 className="text-2xl font-black text-ink">رفيق POS - أمر شراء ونواقص المخزون</h1>
          <p className="text-sm text-ink-muted">
            تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')} - إجمالي الأصناف الناقصة: {filteredItems.length}
          </p>
        </div>

        {/* Summary Metric Cards */}
        <div className="p-5 bg-canvas border-b border-line grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
          <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
            <span className="text-xs text-ink-muted block mb-1">الأصناف المطلوب شراؤها</span>
            <span className="text-xl font-black text-ink">{filteredItems.length} صنف</span>
            <span className="text-[11px] text-ink-muted mt-1 block">تحت حد الأمان للمخزن</span>
          </div>

          <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
            <span className="text-xs text-ink-muted block mb-1">أصناف نفدت تماماً (رصيد صفر)</span>
            <span className="text-xl font-black text-danger">{zeroStockCount} صنف</span>
            <span className="text-[11px] text-danger mt-1 block">تتطلب طلبية فورية عاجلة</span>
          </div>

          <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
            <span className="text-xs text-ink-muted block mb-1">إجمالي تكلفة الطلب التقديرية</span>
            <span className="text-xl font-black text-brand">
              {formatArabicCurrency(totalSuggestedCost)}
            </span>
            <span className="text-[11px] text-ink-muted mt-1 block">محسوب بأسعار التكلفة الأخيرة</span>
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
              placeholder="بحث بالاسم أو الباركود أو القسم..."
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
              كل النواقص ({items.length})
            </button>
            <button
              onClick={() => setFilterMode('zero')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filterMode === 'zero' ? 'bg-surface text-danger shadow-xs font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              المنتهية تماماً ({zeroStockCount})
            </button>
          </div>
        </div>

        {/* Table content */}
        <div className="flex-1 overflow-y-auto p-6 bg-canvas print:p-0 print:bg-white">
          {loading ? (
            <div className="py-20 text-center text-ink-muted text-sm">جاري مراجعة أرصدة المخزون وحدود الطلب...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-ink-muted bg-surface rounded-2xl border border-line">
              <Boxes className="w-12 h-12 text-ink-muted/40 mx-auto mb-2" />
              <p className="font-semibold text-sm">المخزون مكتمل بالكامل ولا توجد نواقص مطابقة حالياً.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs print:border-none print:shadow-none">
              <table className="w-full text-sm text-right">
                <thead className="bg-surface-2 text-ink-muted text-xs border-b border-line">
                  <tr>
                    <th className="p-3 w-10 text-center print:table-cell">#</th>
                    <th className="p-3">الباركود</th>
                    <th className="p-3">اسم الصنف</th>
                    <th className="p-3">القسم</th>
                    <th className="p-3 text-center">الرصيد الحالي</th>
                    <th className="p-3 text-center">حد الطلب</th>
                    <th className="p-3 text-center font-bold text-brand">الكمية المقترحة</th>
                    <th className="p-3">سعر الشراء</th>
                    <th className="p-3">إجمالي التكلفة</th>
                    <th className="p-3 text-center print:table-cell hidden print:table-cell">تم الاستلام</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredItems.map((item, idx) => {
                    const currentStock = (item.stockMilli / 1000).toLocaleString('ar-EG');
                    const minStock = (item.minStockMilli / 1000).toLocaleString('ar-EG');
                    const suggested = (item.suggestedOrderMilli / 1000).toLocaleString('ar-EG');
                    const isZero = item.stockMilli <= 0;

                    return (
                      <tr key={item.productId} className="hover:bg-surface-2/40 transition">
                        <td className="p-3 text-xs text-ink-muted text-center">{idx + 1}</td>
                        <td className="p-3 font-mono text-xs text-ink-muted">{item.barcode || '-'}</td>
                        <td className="p-3 font-bold text-ink">
                          <div>{item.name}</div>
                          <span className="text-[11px] text-ink-muted font-normal">{item.unit || 'قطعة'}</span>
                        </td>
                        <td className="p-3 text-xs text-ink-muted">{item.categoryName || '-'}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            isZero ? 'bg-red-100 text-danger' : 'bg-amber-100 text-warn'
                          }`}>
                            {currentStock}
                          </span>
                        </td>
                        <td className="p-3 text-center text-xs text-ink-muted">{minStock}</td>
                        <td className="p-3 text-center font-black text-brand bg-brand-soft/40">
                          {suggested}
                        </td>
                        <td className="p-3 text-xs">{formatArabicCurrency(item.unitCostPiasters)}</td>
                        <td className="p-3 font-bold text-ink">{formatArabicCurrency(item.estimatedCostPiasters)}</td>
                        <td className="p-3 text-center hidden print:table-cell">
                          <div className="w-5 h-5 border border-ink-muted mx-auto rounded-xs" />
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
            معادلة الاقتراح: ضعف حد الأمان مطروحاً منه الرصيد الحالي بما يضمن عدم انقطاع الصنف.
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
