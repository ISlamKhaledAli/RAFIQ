import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  ShoppingCart, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  ArrowUpRight, 
  Clock, 
  RefreshCw,
  Wallet,
  CheckCircle2
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DashboardSummary } from '../types/models';

interface DashboardViewProps {
  onNavigateToPos: () => void;
  onNavigateToProducts: () => void;
}

export function DashboardView({ onNavigateToPos, onNavigateToProducts }: DashboardViewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await invoke<DashboardSummary>('reports:getTodaySummary');
      setSummary(data);
      const now = new Date();
      setLastRefreshed(now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await invoke<DashboardSummary>('reports:getTodaySummary');
        if (active) {
          setSummary(data);
          const now = new Date();
          setLastRefreshed(now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      } catch {
        // Offline fallback
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-canvas select-none overflow-y-auto p-4 gap-4">
      
      {/* 1. TOP BAR / TITLE & REFRESH */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">لوحة متابعة اليوم والوردية</h2>
          <p className="text-xs text-ink-muted">ملخص حركة المبيعات، الأرباح، الخزينة، ومؤشرات الأداء اللحظية</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted bg-surface px-3 py-1 rounded border border-line">
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            <span>آخر تحديث:</span>
            <span className="font-mono text-ink font-semibold">{lastRefreshed || '---'}</span>
          </div>

          <button
            onClick={() => void loadSummary()}
            disabled={isLoading}
            className="flex items-center gap-1.5 h-8 px-3 bg-surface border border-line hover:bg-surface-2 rounded text-xs font-semibold text-ink transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand' : 'text-ink-muted'}`} />
            <span>تحديث الأرقام</span>
          </button>
        </div>
      </div>

      {/* 2. KPI METRICS CARDS (4 Grid cells matching design catalog _1) */}
      <div className="grid grid-cols-4 gap-3">
        {/* Card 1: Today Sales */}
        <div className="bg-surface rounded border border-line p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold">إجمالي مبيعات اليوم</span>
            <div className="w-7 h-7 rounded bg-brand-soft text-brand flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-ink">
              {summary ? (summary.todaySalesPiasters / 100).toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-ink-muted">ج.م</span>
          </div>
          <div className="mt-2 pt-2 hairline-t flex justify-between text-[11px] text-ink-muted">
            <span>نقدي: {summary ? (summary.todayCashPiasters / 100).toFixed(2) : '0'} ج.م</span>
            <span>آجل: {summary ? (summary.todayCreditPiasters / 100).toFixed(2) : '0'} ج.م</span>
          </div>
        </div>

        {/* Card 2: Today Profit */}
        <div className="bg-surface rounded border border-line p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold">صافي أرباح اليوم التقديرية</span>
            <div className="w-7 h-7 rounded bg-paid-soft text-paid flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-paid">
              {summary ? (summary.todayProfitsPiasters / 100).toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-paid font-medium">ج.م</span>
          </div>
          <div className="mt-2 pt-2 hairline-t text-[11px] text-ink-muted">
            <span>هامش الربح = (سعر البيع - سعر التكلفة)</span>
          </div>
        </div>

        {/* Card 3: Invoices Count */}
        <div className="bg-surface rounded border border-line p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold">عدد فواتير البيع</span>
            <div className="w-7 h-7 rounded bg-surface-2 text-ink flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-ink">
              {summary ? summary.todayInvoicesCount : 0}
            </span>
            <span className="text-xs text-ink-muted">فاتورة مسجلة</span>
          </div>
          <div className="mt-2 pt-2 hairline-t text-[11px] text-ink-muted">
            <span>متوسط الفاتورة: {summary && summary.todayInvoicesCount > 0 ? ((summary.todaySalesPiasters / summary.todayInvoicesCount) / 100).toFixed(2) : '0.00'} ج.م</span>
          </div>
        </div>

        {/* Card 4: Cash Drawer */}
        <div className="bg-surface rounded border border-line p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold">نقدية درج الكاشير</span>
            <div className="w-7 h-7 rounded bg-brand-soft text-brand flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-brand">
              {summary ? (summary.cashDrawerPiasters / 100).toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-brand font-medium">ج.م</span>
          </div>
          <div className="mt-2 pt-2 hairline-t text-[11px] text-paid flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>مطابق للمقبوضات النقدية</span>
          </div>
        </div>
      </div>

      {/* 3. MAIN DASHBOARD CONTENT (Two balanced columns) */}
      <div className="grid grid-cols-3 gap-4 flex-1">
        
        {/* RIGHT COLUMN (2/3 width): Top Selling Items */}
        <div className="col-span-2 bg-surface rounded border border-line flex flex-col overflow-hidden shadow-xs">
          <div className="h-10 bg-surface-2 hairline-b px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-brand" />
              <span className="text-xs font-bold text-ink">السلع الأكثر مبيعاً اليوم</span>
            </div>
            <button 
              onClick={onNavigateToPos}
              className="flex items-center gap-1 text-[11px] text-brand hover:underline font-semibold"
            >
              <span>فتح شاشة البيع</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 flex-1 overflow-auto">
            {summary && summary.topSellingProducts && summary.topSellingProducts.length > 0 ? (
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="h-8 bg-surface-2 hairline-b text-ink-muted text-[11px] font-bold">
                    <th className="px-3">#</th>
                    <th className="px-3">اسم الصنف</th>
                    <th className="px-3 text-center">الكمية المباعة</th>
                    <th className="px-3">إجمالي القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {summary.topSellingProducts.map((item, idx) => (
                    <tr key={item.productId || idx} className="h-9 hover:bg-surface-2">
                      <td className="px-3 text-ink-muted font-mono">{idx + 1}</td>
                      <td className="px-3 font-semibold text-ink">{item.productName}</td>
                      <td className="px-3 text-center font-mono font-bold text-brand">
                        {item.totalQuantity}
                      </td>
                      <td className="px-3 font-mono font-bold text-ink">
                        {(item.totalSalesPiasters / 100).toFixed(2)} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-ink-muted text-xs">
                <ShoppingCart className="w-8 h-8 text-ink-muted/30 mx-auto mb-2" />
                لم يتم تسجيل أي مبيعات اليوم حتى الآن.
              </div>
            )}
          </div>
        </div>

        {/* LEFT COLUMN (1/3 width): Low Stock Alerts & Quick Actions */}
        <div className="flex flex-col gap-4">
          
          {/* Low Stock Alerts */}
          <div className="bg-surface rounded border border-line flex flex-col overflow-hidden shadow-xs">
            <div className="h-10 bg-surface-2 hairline-b px-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-danger font-bold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>تنبيهات النواقص بالمخزن</span>
              </div>
              <button 
                onClick={onNavigateToProducts}
                className="text-[10px] text-ink-muted hover:text-ink font-semibold"
              >
                عرض الكل
              </button>
            </div>

            <div className="p-3 divide-y divide-line max-h-[220px] overflow-y-auto">
              {summary && summary.lowStockProducts && summary.lowStockProducts.length > 0 ? (
                summary.lowStockProducts.map((p) => (
                  <div key={p.productId} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-ink">{p.productName}</div>
                      <div className="text-[10px] text-ink-muted">وحدة البيع: {p.unit === 'kg' ? 'كيلوجرام' : 'قطعة'}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                      p.currentStock <= 0 
                        ? 'bg-danger text-white' 
                        : 'bg-danger-soft text-danger border border-danger-border'
                    }`}>
                      {p.currentStock <= 0 ? 'نفد (0)' : `متبقي: ${p.currentStock}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-ink-muted text-xs">
                  <CheckCircle2 className="w-6 h-6 text-paid/60 mx-auto mb-1.5" />
                  جميع الأصناف بمستويات مخزون آمنة
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Shortcuts */}
          <div className="bg-surface rounded border border-line p-3 shadow-xs flex flex-col gap-2">
            <span className="text-xs font-bold text-ink">روابط وصول سريعة</span>
            
            <button
              onClick={onNavigateToPos}
              className="w-full h-9 rounded bg-brand text-white hover:bg-brand-container text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>دخول شاشة البيع (F1)</span>
            </button>

            <button
              onClick={onNavigateToProducts}
              className="w-full h-9 rounded bg-surface border border-line text-ink hover:bg-surface-2 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Package className="w-3.5 h-3.5 text-brand" />
              <span>إدارة السلع وتعديل الأسعار (F6)</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
