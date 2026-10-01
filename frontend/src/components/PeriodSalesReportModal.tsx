import React, { useState, useEffect, useCallback } from 'react';
import { 
  Printer, 
  X, 
  Coins, 
  AlertCircle, 
  Flame, 
  FileText
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { PeriodSalesReport } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

interface PeriodSalesReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PeriodSalesReportModal: React.FC<PeriodSalesReportModalProps> = ({
  isOpen,
  onClose
}) => {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [report, setReport] = useState<PeriodSalesReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<PeriodSalesReport>('reports:getPeriodSales', {
        period: period,
        fromDate: period === 'custom' ? fromDate : null,
        toDate: period === 'custom' ? toDate : null
      });
      if (res) {
        setReport(res);
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [period, fromDate, toDate]);

  useEffect(() => {
    if (isOpen) {
      void loadReport();
    }
  }, [isOpen, loadReport]);

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
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">تقرير المبيعات والربحية الدوري</h2>
              <p className="text-xs text-white/80 mt-0.5">
                تحليل حركة المبيعات وتوزيع طرق الدفع والأصناف الأكثر طلباً لفترات محددة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-brand hover:bg-white/90 transition flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير</span>
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
          <h1 className="text-2xl font-black text-ink">رفيق POS - تقرير المبيعات والأرباح</h1>
          <p className="text-sm text-ink-muted">
            الفترة: {report ? `${report.startDate} إلى ${report.endDate}` : ''} | تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}
          </p>
        </div>

        {/* Period Selector (hidden in print) */}
        <div className="px-6 py-3.5 bg-surface border-b border-line flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-1.5 bg-canvas p-1 rounded-xl border border-line text-xs">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
                period === 'today' ? 'bg-surface text-brand shadow-xs font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              مبيعات اليوم
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
                period === 'week' ? 'bg-surface text-brand shadow-xs font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              آخر 7 أيام
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
                period === 'month' ? 'bg-surface text-brand shadow-xs font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              آخر 30 يوماً
            </button>
            <button
              onClick={() => setPeriod('custom')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
                period === 'custom' ? 'bg-surface text-brand shadow-xs font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              فترة مخصصة
            </button>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-muted">من:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-line bg-canvas text-ink text-xs"
              />
              <span className="text-ink-muted">إلى:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-line bg-canvas text-ink text-xs"
              />
              <button
                onClick={() => void loadReport()}
                className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold text-xs hover:bg-brand-dark"
              >
                تطبيق
              </button>
            </div>
          )}

          {report && (
            <div className="text-xs text-ink-muted font-medium">
              الفترة من: <span className="font-mono text-ink font-bold">{report.startDate}</span> إلى: <span className="font-mono text-ink font-bold">{report.endDate}</span>
            </div>
          )}
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-canvas print:p-0 print:bg-white">
          {loading ? (
            <div className="py-20 text-center text-ink-muted text-sm">جاري تجميع حركة الفواتير والتقارير...</div>
          ) : report ? (
            <>
              {/* Financial KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
                
                <div className="bg-surface p-4 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">إجمالي المبيعات</span>
                  <span className="text-2xl font-black text-ink block">
                    {formatArabicCurrency(report.totalSalesPiasters)}
                  </span>
                  <span className="text-[11px] text-ink-muted mt-1 block">
                    {report.invoicesCount} فاتورة منفذة
                  </span>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">صافي المبيعات الفعلي</span>
                  <span className="text-2xl font-black text-brand block">
                    {formatArabicCurrency(report.netSalesPiasters)}
                  </span>
                  <span className="text-[11px] text-ink-muted mt-1 block">
                    بعد خصم المرتجعات والملغاة
                  </span>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">الربح التقريبي</span>
                  <span className="text-2xl font-black text-paid block">
                    {formatArabicCurrency(report.grossProfitPiasters)}
                  </span>
                  <span className="text-[11px] text-ink-muted mt-1 block">
                    (سعر البيع − سعر التكلفة)
                  </span>
                </div>

                <div className="bg-surface p-4 rounded-xl border border-line shadow-xs">
                  <span className="text-xs text-ink-muted block mb-1">المرتجعات والملغاة</span>
                  <span className="text-2xl font-black text-danger block">
                    {formatArabicCurrency(report.returnsTotalPiasters + report.cancelledTotalPiasters)}
                  </span>
                  <span className="text-[11px] text-danger mt-1 block">
                    {report.returnsCount} مرتجع • {report.cancelledCount} ملغاة
                  </span>
                </div>

              </div>

              {/* Zero cost items warning if any */}
              {report.zeroCostItemsCount > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-warn flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      تنبيه هام: يوجد <strong>{report.zeroCostItemsCount}</strong> أصناف بيعت بدون تكلفة شراء مسجلة؛ لذا فإن رقم الربح تقريبي ويستثني تكلفة هذه الأصناف.
                    </span>
                  </div>
                </div>
              )}

              {/* Payment Methods Breakdown */}
              <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-3">
                <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                  <Coins className="w-4 h-4 text-brand" />
                  <span>توزيع المبيعات حسب طريقة الدفع</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-lg bg-surface-2 border border-line">
                    <span className="text-xs text-ink-muted block mb-1">الدفع النقدي (كاش)</span>
                    <span className="text-xl font-bold text-ink">
                      {formatArabicCurrency(report.cashSalesPiasters)}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-surface-2 border border-line">
                    <span className="text-xs text-ink-muted block mb-1">الآجل (ذمم عملاء)</span>
                    <span className="text-xl font-bold text-ink">
                      {formatArabicCurrency(report.creditSalesPiasters)}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-surface-2 border border-line">
                    <span className="text-xs text-ink-muted block mb-1">البطاقات والدفع الإلكتروني</span>
                    <span className="text-xl font-bold text-ink">
                      {formatArabicCurrency(report.cardSalesPiasters)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Top Selling Products in Period */}
              {report.topSellingProducts && report.topSellingProducts.length > 0 && (
                <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 bg-surface-2 border-b border-line flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-brand" />
                      <h3 className="font-bold text-ink text-sm">الأصناف الأكثر طلباً ومبيعاً خلال الفترة</h3>
                    </div>
                    <span className="text-xs text-ink-muted">أعلى {report.topSellingProducts.length} أصناف</span>
                  </div>
                  <table className="w-full text-sm text-right">
                    <thead className="bg-surface-2 text-ink-muted text-xs border-b border-line">
                      <tr>
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3">اسم الصنف</th>
                        <th className="p-3 text-center">الكمية المباعة</th>
                        <th className="p-3">إجمالي القيمة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {report.topSellingProducts.map((p, idx) => (
                        <tr key={p.productId || idx} className="hover:bg-surface-2/40 transition">
                          <td className="p-3 text-xs text-ink-muted text-center">{idx + 1}</td>
                          <td className="p-3 font-bold text-ink">{p.productName}</td>
                          <td className="p-3 text-center font-bold text-brand bg-brand-soft/30 font-mono">
                            {p.totalQuantity.toLocaleString('ar-EG')}
                          </td>
                          <td className="p-3 font-bold text-ink">
                            {p.totalSalesFormatted || formatArabicCurrency(p.totalSalesPiasters)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </>
          ) : null}
        </div>

        {/* Footer (hidden in print) */}
        <div className="px-6 py-3 bg-surface border-t border-line flex items-center justify-between print:hidden">
          <span className="text-xs text-ink-muted">
            جميع البيانات مستخرجة من سجل الفواتير الفعلي ومستبعد منها كافة المبيعات التجريبية (Demo).
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
