import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { 
  Users, 
  RefreshCw
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { formatArabicCurrency } from '../../utils/money';
import type { CashierPerformanceMetric } from '../../types/models';

export interface CashierPerformanceCardProps {
  period: string;
  customFrom?: string;
  customTo?: string;
}

export const CashierPerformanceCard: FC<CashierPerformanceCardProps> = ({
  period,
  customFrom,
  customTo,
}) => {
  const [metrics, setMetrics] = useState<CashierPerformanceMetric[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await invoke<CashierPerformanceMetric[]>('reports:getCashierPerformance', {
        period,
        fromDate: period === 'custom' ? customFrom : undefined,
        toDate: period === 'custom' ? customTo : undefined,
      });
      if (res) setMetrics(res);
    } catch (err) {
      console.error('Failed to load cashier performance:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs flex flex-col items-center justify-center min-h-[160px] animate-pulse">
        <Users className="w-6 h-6 text-ink-muted animate-spin mb-2" />
        <span className="text-xs text-ink-muted">جاري تحليل إنتاجية الكاشير...</span>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-xl p-6 text-center select-none shadow-2xs">
        <Users className="w-8 h-8 text-ink-muted/50 mx-auto mb-2" />
        <div className="text-xs font-bold text-ink">لا توجد بيانات نشاط مسجلة للكاشيرات في هذه الفترة</div>
        <div className="text-[11px] text-ink-muted mt-1">تظهر إحصائيات كل كاشير ومبيعاته ومعدل الإلغاء فور تسجيل فواتير جديدة</div>
      </div>
    );
  }

  const totalStoreSales = metrics.reduce((acc, m) => acc + m.totalSalesPiasters, 0);

  return (
    <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-paid-soft text-paid flex items-center justify-center font-bold">
            <Users className="w-4 h-4 text-paid" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">مقارنة كفاءة ونشاط الكاشيرات</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              حجم المبيعات لكل كاشير، متوسط سلة المشتريات، ومعدل إلغاء الفواتير
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-2 hover:bg-slate-200 text-ink-muted transition-colors cursor-pointer"
          title="تحديث"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid of Cashier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3.5">
        {metrics.map((item, idx) => {
          const sharePercent = totalStoreSales > 0 
            ? Math.round((item.totalSalesPiasters * 100) / totalStoreSales) 
            : 0;

          return (
            <div 
              key={item.cashierId || idx}
              className="p-3 rounded-lg bg-surface-2 border border-line/70 flex flex-col justify-between hover:border-line-hover transition-all"
            >
              {/* Cashier Top Info */}
              <div className="flex items-center justify-between pb-2 border-b border-line/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-dark text-white flex items-center justify-center text-xs font-bold font-mono">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-ink">{item.cashierName}</div>
                    <div className="text-[10px] text-ink-muted font-mono">{item.role === 'admin' ? 'مدير نظام' : 'كاشير نقطة بيع'}</div>
                  </div>
                </div>

                <div className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-paid-soft text-paid border border-paid/20">
                  {sharePercent}% من المبيعات
                </div>
              </div>

              {/* Financial Stats */}
              <div className="grid grid-cols-2 gap-2 my-2.5 text-xs">
                <div>
                  <div className="text-[10px] text-ink-muted">إجمالي المبيعات</div>
                  <div className="font-mono font-bold text-ink mt-0.5">
                    {formatArabicCurrency(item.totalSalesPiasters)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-muted">عدد الفواتير</div>
                  <div className="font-mono font-bold text-brand mt-0.5">
                    {item.invoicesCount} فاتورة
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-muted">متوسط الفاتورة</div>
                  <div className="font-mono font-bold text-ink-muted mt-0.5">
                    {formatArabicCurrency(item.averageInvoicePiasters)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-muted">فواتير ملغاة</div>
                  <div className={`font-mono font-bold mt-0.5 ${item.cancelledCount > 0 ? 'text-danger' : 'text-ink-muted'}`}>
                    {item.cancelledCount} ملغاة
                  </div>
                </div>
              </div>

              {/* Share of Store Sales Progress Bar */}
              <div className="w-full h-1.5 bg-line/60 rounded-full overflow-hidden mt-1">
                <div 
                  className="h-full bg-brand rounded-full transition-all duration-500" 
                  style={{ width: `${sharePercent > 0 ? Math.max(5, sharePercent) : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
