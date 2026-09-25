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
  CheckCircle2, 
  ClipboardCheck,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  Printer,
  Database,
  FileText,
  KeyRound,
  Users
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DashboardSummary } from '../types/models';
import { ReadinessCheckModal } from '../components/ReadinessCheckModal';

interface SystemAlert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  fixAction: string;
  fixTarget: string;
}

interface SystemHealthMetrics {
  diskFreeFormatted: string;
  diskFreeBytes: number;
  lastBackupFormatted: string;
  isBackupOverdue: boolean;
  printerName: string;
  isPrinterReady: boolean;
  licenseStatus: string;
  appVersion: string;
  databaseStatus: string;
  productsCount: number;
}

interface SystemHealthData {
  overallStatus: 'HEALTHY' | 'ATTENTION_NEEDED' | 'CRITICAL';
  oneSentenceSummary: string;
  healthScore: number;
  primaryIssueFixAction?: string | null;
  primaryIssueFixTarget?: string | null;
  alerts: SystemAlert[];
  metrics: SystemHealthMetrics;
}

interface DashboardViewProps {
  onNavigateToPos: () => void;
  onNavigateToProducts: () => void;
  onNavigateToSales?: () => void;
  onNavigateToSettings?: (target?: string) => void;
  onNavigateToCustomers?: () => void;
}

export function DashboardView({ 
  onNavigateToPos, 
  onNavigateToProducts,
  onNavigateToSales,
  onNavigateToSettings,
  onNavigateToCustomers
}: DashboardViewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sumData, healthData] = await Promise.all([
        invoke<DashboardSummary>('reports:getTodaySummary'),
        invoke<SystemHealthData>('health:getStatus'),
      ]);
      if (sumData) setSummary(sumData);
      if (healthData) setHealth(healthData);
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
        const [sumData, healthData] = await Promise.all([
          invoke<DashboardSummary>('reports:getTodaySummary'),
          invoke<SystemHealthData>('health:getStatus'),
        ]);
        if (active) {
          if (sumData) setSummary(sumData);
          if (healthData) setHealth(healthData);
          const now = new Date();
          setLastRefreshed(now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      } catch {
        // Offline fallback
      }
    })();
    return () => { active = false; };
  }, []);

  const handleFixAction = (target?: string | null) => {
    if (!target) return;
    if (target.startsWith('settings') && onNavigateToSettings) {
      onNavigateToSettings(target);
    } else if (target === 'products') {
      onNavigateToProducts();
    } else if (target === 'sales' && onNavigateToSales) {
      onNavigateToSales();
    }
  };

  const isHealthy = !health || health.overallStatus === 'HEALTHY';
  const isCritical = health?.overallStatus === 'CRITICAL';

  return (
    <div className="flex flex-col h-full w-full bg-canvas select-none overflow-y-auto p-4 gap-4" dir="rtl">
      
      {/* 1. TOP BAR / TITLE & REFRESH */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">لوحة متابعة اليوم والوردية</h2>
          <p className="text-xs text-ink-muted">ملخص حركة المبيعات، مؤشرات الأرباح، وحالة سلامة النظام</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted bg-surface px-3 py-1 rounded border border-line">
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            <span>آخر تحديث:</span>
            <span className="font-mono text-ink font-semibold">{lastRefreshed || '---'}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsReadinessModalOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 bg-emerald-50 hover:bg-emerald-100 text-[#006d41] border border-emerald-300 rounded text-xs font-bold transition-colors shadow-xs"
          >
            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>فحص جاهزية التشغيل</span>
          </button>

          <button
            onClick={() => void loadData()}
            disabled={isLoading}
            className="flex items-center gap-1.5 h-8 px-3 bg-surface border border-line hover:bg-surface-2 rounded text-xs font-semibold text-ink transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand' : 'text-ink-muted'}`} />
            <span>تحديث الأرقام</span>
          </button>
        </div>
      </div>

      {/* 2. SYSTEM HEALTH INDICATOR BAR (Feature #138 / Tasks 138-1, 138-2, 138-3) */}
      <div
        className={`rounded-2xl border p-4 transition-all shadow-xs ${
          isHealthy
            ? 'bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-surface border-emerald-200'
            : isCritical
            ? 'bg-gradient-to-r from-red-50/90 via-rose-50/80 to-surface border-red-300'
            : 'bg-gradient-to-r from-amber-50/90 via-orange-50/80 to-surface border-amber-300'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm ${
                isHealthy
                  ? 'bg-emerald-600 text-white'
                  : isCritical
                  ? 'bg-red-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {isHealthy ? (
                <ShieldCheck className="w-6 h-6" />
              ) : isCritical ? (
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  مؤشر سلامة النظام
                </span>
                <span
                  className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                    isHealthy
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : isCritical
                      ? 'bg-red-100 text-red-900 border border-red-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  {isHealthy ? 'سليم 100%' : isCritical ? 'خطر حرج' : 'يحتاج انتباهك'}
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 leading-snug">
                {health?.oneSentenceSummary || 'كل شيء تمام! النظام سليم، قاعدة البيانات محمية، والنظام جاهز للبيع.'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {health?.primaryIssueFixAction && health.primaryIssueFixTarget && (
              <button
                type="button"
                onClick={() => handleFixAction(health.primaryIssueFixTarget)}
                className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow transition-all ${
                  isCritical
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {health.primaryIssueFixAction}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsReadinessModalOpen(true)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-xs"
            >
              فحص التفاصيل
            </button>
          </div>
        </div>

        {/* Micro-metrics pills */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-200/70 text-xs text-slate-700">
          <div className="flex items-center gap-2 bg-white/70 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span>القرص:</span>
            <span className="font-mono font-bold text-slate-900">{health?.metrics?.diskFreeFormatted || '---'}</span>
          </div>

          <div className="flex items-center gap-2 bg-white/70 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
            <Database className="w-3.5 h-3.5 text-emerald-700" />
            <span>الحفظ:</span>
            <span className="font-bold text-slate-900">{health?.metrics?.lastBackupFormatted || 'لم تؤخذ'}</span>
          </div>

          <div className="flex items-center gap-2 bg-white/70 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>الطابعة:</span>
            <span className="font-bold text-slate-900 truncate max-w-[110px]" title={health?.metrics?.printerName}>
              {health?.metrics?.printerName || 'لا توجد'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white/70 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
            <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
            <span>الترخيص:</span>
            <span className="font-bold text-slate-900">ترخيص محلي دائم</span>
          </div>

          <div className="flex items-center gap-2 bg-white/70 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
            <Package className="w-3.5 h-3.5 text-brand" />
            <span>المنتجات:</span>
            <span className="font-mono font-bold text-slate-900">{health?.metrics?.productsCount || 0} صنف</span>
          </div>
        </div>
      </div>

      {/* 3. BIG PRIMARY ACTION BUTTONS (Task 138-2: أزرار كبيرة للبيع والمنتجات والتقارير) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Big Action 1: POS Sale */}
        <button
          type="button"
          onClick={onNavigateToPos}
          className="group relative p-4 rounded-2xl bg-gradient-to-br from-[#006d41] to-[#00372d] text-white shadow hover:shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-between text-right overflow-hidden border border-emerald-600/30"
        >
          <div className="space-y-1 z-10">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-white/20 text-white mb-1">
              نقطة البيع (F1)
            </span>
            <h3 className="text-xl font-black">تسجيل بيع جديد</h3>
            <p className="text-xs text-emerald-100 font-normal">
              إدخال بالباركود، السلة السريعة، الحساب الآجل، وطباعة الإيصال
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white text-2xl group-hover:scale-110 transition-transform shrink-0 shadow-inner">
            <ShoppingCart className="w-7 h-7" />
          </div>
        </button>

        {/* Big Action 2: Products Catalog */}
        <button
          type="button"
          onClick={onNavigateToProducts}
          className="group relative p-4 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow hover:shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-between text-right overflow-hidden border border-slate-700"
        >
          <div className="space-y-1 z-10">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-white/15 text-slate-200 mb-1">
              الكتالوج والمخزن (F6)
            </span>
            <h3 className="text-xl font-black">كتالوج الأصناف والأسعار</h3>
            <p className="text-xs text-slate-300 font-normal">
              إضافة صنف، تعديل السعر، استيراد إكسيل، ومتابعة النواقص
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white text-2xl group-hover:scale-110 transition-transform shrink-0 shadow-inner">
            <Package className="w-7 h-7" />
          </div>
        </button>

        {/* Big Action 3: Sales History & Reports */}
        <button
          type="button"
          onClick={() => {
            if (onNavigateToSales) onNavigateToSales();
          }}
          className="group relative p-4 rounded-2xl bg-gradient-to-br from-teal-800 to-emerald-950 text-white shadow hover:shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-between text-right overflow-hidden border border-teal-700"
        >
          <div className="space-y-1 z-10">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-white/20 text-white mb-1">
              سجل الفواتير (F7)
            </span>
            <h3 className="text-xl font-black">سجل الفواتير والتقارير</h3>
            <p className="text-xs text-teal-100 font-normal">
              البحث في الفواتير السابقة، إعادة طباعة نسخة، وإحصائيات الوردية
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white text-2xl group-hover:scale-110 transition-transform shrink-0 shadow-inner">
            <FileText className="w-7 h-7" />
          </div>
        </button>
      </div>

      {/* 4. KPI METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
            <span className="font-semibold">عدد فواتير الكاشير اليوم</span>
            <div className="w-7 h-7 rounded bg-surface-2 text-ink flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-ink">
              {summary ? summary.todayInvoicesCount : '0'}
            </span>
            <span className="text-xs text-ink-muted">فاتورة</span>
          </div>
          <div className="mt-2 pt-2 hairline-t text-[11px] text-ink-muted">
            <span>متوسط الفاتورة: {summary && summary.todayInvoicesCount > 0 ? ((summary.todaySalesPiasters / summary.todayInvoicesCount) / 100).toFixed(1) : '0'} ج.م</span>
          </div>
        </div>

        {/* Card 4: Drawer Balance */}
        <div className="bg-surface rounded border border-line p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold">المبالغ النقدية في الدرج</span>
            <div className="w-7 h-7 rounded bg-surface-2 text-ink flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-ink">
              {summary ? (summary.todayCashPiasters / 100).toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-ink-muted">ج.م</span>
          </div>
          <div className="mt-2 pt-2 hairline-t text-[11px] text-ink-muted">
            <span>النقدية الصافية المستلمة بالخزينة</span>
          </div>
        </div>

        {/* Card 5: Customer Debts (Story 70 / Feature #44) */}
        <div 
          onClick={onNavigateToCustomers}
          className={`bg-surface rounded border border-line p-4 shadow-xs relative overflow-hidden ${onNavigateToCustomers ? 'cursor-pointer hover:border-brand/40 transition-colors' : ''}`}
        >
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold">إجمالي ديون العملاء (الآجل)</span>
            <div className="w-7 h-7 rounded bg-danger-soft text-danger flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-danger">
              {summary && summary.totalCustomerDebtsPiasters != null 
                ? (summary.totalCustomerDebtsPiasters / 100).toFixed(2) 
                : '0.00'}
            </span>
            <span className="text-xs text-ink-muted">ج.م</span>
          </div>
          <div className="mt-2 pt-2 hairline-t flex justify-between text-[11px] text-ink-muted">
            <span>العملاء المدينون: <strong className="text-ink font-mono">{summary?.debtorsCount || 0}</strong></span>
            {onNavigateToCustomers && <span className="text-brand font-semibold text-[10px]">عرض الدفتر &larr;</span>}
          </div>
        </div>
      </div>

      {/* 5. SPLIT SECTION: TOP SELLING PRODUCTS + LOW STOCK ALERTS & PRIORITIZED NOTIFICATIONS */}
      <div className="grid grid-cols-3 gap-4 flex-1">
        
        {/* RIGHT COLUMN (2/3 width): Top Selling Items */}
        <div className="col-span-2 bg-surface rounded border border-line flex flex-col overflow-hidden shadow-xs">
          <div className="h-10 bg-surface-2 hairline-b px-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <ArrowUpRight className="w-4 h-4 text-brand" />
              <span>الأصناف الأكثر مبيعاً اليوم</span>
            </div>
            <span className="text-[11px] text-ink-muted font-mono">مرتبة تنازلياً حسب الكمية</span>
          </div>

          <div className="p-0 overflow-y-auto flex-1">
            {summary && summary.topSellingProducts && summary.topSellingProducts.length > 0 ? (
              <table className="w-full text-right text-xs">
                <thead className="bg-surface-2 text-ink-muted hairline-b text-[11px]">
                  <tr>
                    <th className="py-2 px-3 font-semibold w-8">#</th>
                    <th className="py-2 px-3 font-semibold">اسم الصنف</th>
                    <th className="py-2 px-3 font-semibold">الكمية المباعة</th>
                    <th className="py-2 px-3 font-semibold">إجمالي المبيعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {summary.topSellingProducts.map((p, idx) => (
                    <tr key={p.productId} className="hover:bg-surface-2 transition-colors">
                      <td className="py-2 px-3 font-mono text-ink-muted">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-ink">{p.productName}</td>
                      <td className="py-2 px-3 font-mono">
                        {p.totalQuantity}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-brand">
                        {(p.totalSalesPiasters / 100).toFixed(2)} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-ink-muted text-xs">
                لا توجد مبيعات مسجلة حتى الآن اليوم
              </div>
            )}
          </div>
        </div>

        {/* LEFT COLUMN (1/3 width): Low Stock Alerts & Prioritized System Alerts */}
        <div className="flex flex-col gap-4">
          
          {/* Prioritized System Alerts (Task 138-3) */}
          {health && health.alerts && health.alerts.length > 0 && (
            <div className="bg-surface rounded border border-line flex flex-col overflow-hidden shadow-xs">
              <div className="h-9 bg-surface-2 hairline-b px-3 flex items-center justify-between text-xs font-bold text-ink">
                <span>تنبيهات النظام ({health.alerts.length})</span>
                <span className="text-[10px] text-slate-500 font-normal">مرتبة حسب الأهمية</span>
              </div>
              <div className="p-2.5 space-y-2 max-h-[160px] overflow-y-auto">
                {health.alerts.map((al) => (
                  <div
                    key={al.id}
                    className={`p-2 rounded-lg text-xs border flex items-start justify-between gap-2 ${
                      al.level === 'critical'
                        ? 'bg-red-50 text-red-950 border-red-200'
                        : al.level === 'warning'
                        ? 'bg-amber-50 text-amber-950 border-amber-200'
                        : 'bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div>
                      <span className="font-bold block leading-tight">{al.title}</span>
                      <span className="text-[10.5px] opacity-80 leading-normal block mt-0.5">{al.message}</span>
                    </div>
                    {al.fixAction && al.fixTarget && (
                      <button
                        type="button"
                        onClick={() => handleFixAction(al.fixTarget)}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-white text-slate-800 border border-slate-300 shadow-xs shrink-0 hover:bg-slate-100 transition-colors"
                      >
                        {al.fixAction}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Top Debtors List (Story 70 / Task 44-2) */}
          <div className="bg-surface rounded border border-line flex flex-col overflow-hidden shadow-xs">
            <div className="h-10 bg-surface-2 hairline-b px-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-ink font-bold text-xs">
                <Users className="w-4 h-4 text-brand" />
                <span>أعلى العملاء مديونية</span>
              </div>
              {onNavigateToCustomers && (
                <button 
                  onClick={onNavigateToCustomers}
                  className="text-[10px] text-brand hover:underline font-semibold"
                >
                  كافة العملاء
                </button>
              )}
            </div>

            <div className="p-3 divide-y divide-line max-h-[190px] overflow-y-auto">
              {summary && summary.topDebtors && summary.topDebtors.length > 0 ? (
                summary.topDebtors.map((d) => (
                  <div key={d.customerId} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-ink">{d.customerName}</div>
                      {d.customerPhone && (
                        <div className="text-[10px] text-ink-muted font-mono">{d.customerPhone}</div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-danger text-[11.5px]">
                      {(d.balancePiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-ink-muted text-xs">
                  <CheckCircle2 className="w-5 h-5 text-paid/60 mx-auto mb-1" />
                  لا توجد ديون مستحقة على العملاء حالياً
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Pilot Readiness Check Modal (Feature #137) */}
      <ReadinessCheckModal
        isOpen={isReadinessModalOpen}
        onClose={() => setIsReadinessModalOpen(false)}
        onNavigateToTab={(tab) => {
          if (tab === 'pos') onNavigateToPos();
          else if (tab === 'products') onNavigateToProducts();
          else if (tab === 'sales' && onNavigateToSales) onNavigateToSales();
          else if (tab.startsWith('settings') && onNavigateToSettings) onNavigateToSettings(tab);
        }}
      />
    </div>
  );
}
