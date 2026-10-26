import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { 
  Users
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
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

  useDataSubscription(['sales', 'shifts', 'all'], () => {
    void loadData();
  });

  if (isLoading) {
    return (
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs flex flex-col items-center justify-center min-h-[160px] animate-pulse">
        <Users className="w-6 h-6 text-ink-muted dark:text-ink-dark-muted animate-spin mb-2" />
        <span className="text-xs text-ink-muted dark:text-ink-dark-muted">جاري تحليل إنتاجية الكاشير...</span>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-6 text-center select-none shadow-2xs">
        <Users className="w-8 h-8 text-ink-muted/50 dark:text-ink-dark-muted/50 mx-auto mb-2" />
        <div className="text-xs font-bold text-ink dark:text-ink-dark">لا توجد بيانات نشاط مسجلة للكاشيرات في هذه الفترة</div>
        <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1">تظهر إحصائيات كل كاشير ومبيعاته ومعدل الإلغاء فور تسجيل فواتير جديدة</div>
      </div>
    );
  }

  const totalStoreSales = metrics.reduce((acc, m) => acc + m.totalSalesPiasters, 0);

  return (
    <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line/60 dark:border-line-dark/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center font-bold">
            <Users className="w-4 h-4 text-paid dark:text-paid-bright" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink dark:text-ink-dark">مقارنة كفاءة ونشاط الكاشيرات</h3>
            <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
              حجم المبيعات لكل كاشير، متوسط سلة المشتريات، ومعدل إلغاء الفواتير
            </p>
          </div>
        </div>
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
              className="p-3 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line/70 dark:border-line-dark/70 flex flex-col justify-between hover:border-line-hover dark:hover:border-line-dark transition-all"
            >
              {/* Cashier Top Info */}
              <div className="flex items-center justify-between pb-2 border-b border-line/50 dark:border-line-dark/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-dark dark:bg-brand-bright text-white dark:text-surface-dark flex items-center justify-center text-xs font-bold font-mono">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-ink dark:text-ink-dark">{item.cashierName}</div>
                    <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-mono">{item.role === 'admin' ? 'مدير نظام' : 'كاشير نقطة بيع'}</div>
                  </div>
                </div>

                <div className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40">
                  {sharePercent}% من المبيعات
                </div>
              </div>

              {/* Financial Stats */}
              <div className="grid grid-cols-2 gap-2 my-2.5 text-xs">
                <div>
                  <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">إجمالي المبيعات</div>
                  <div className="font-mono font-bold text-ink dark:text-ink-dark mt-0.5">
                    {formatArabicCurrency(item.totalSalesPiasters)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">عدد الفواتير</div>
                  <div className="font-mono font-bold text-brand dark:text-brand-bright mt-0.5">
                    {item.invoicesCount} فاتورة
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">متوسط الفاتورة</div>
                  <div className="font-mono font-bold text-ink-muted dark:text-ink-dark-muted mt-0.5">
                    {formatArabicCurrency(item.averageInvoicePiasters)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">فواتير ملغاة</div>
                  <div className={`font-mono font-bold mt-0.5 ${item.cancelledCount > 0 ? 'text-danger dark:text-danger-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                    {item.cancelledCount} ملغاة
                  </div>
                </div>
              </div>

              {/* Share of Store Sales Progress Bar */}
              <div className="w-full h-1.5 bg-line/60 dark:bg-line-dark/60 rounded-full overflow-hidden mt-1">
                <div 
                  className="h-full bg-brand dark:bg-brand-bright rounded-full transition-all duration-500" 
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
