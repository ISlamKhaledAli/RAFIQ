import React, { useMemo, useState } from 'react';
import type { Product, Store } from '../../types';
import type { DashboardOverviewData, DailySalesPoint } from '../../api/client';
import type { AdminOrder } from './OrderPrintReceipt';
import { CustomDateRangePicker } from './CustomDatePicker';
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  CreditCard,
  Banknote,
  Receipt,
  RotateCcw,
  Clock,
  AlertTriangle,
  Warehouse,
  BarChart3,
  Award,
  ArrowUpLeft,
  Calendar,
  Flame,
  Wallet,
  Smartphone,
  Users,
  Truck,
  BadgePercent,
  Loader2,
  Filter,
} from 'lucide-react';

export type AnalyticsPreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

interface Props {
  store: Store;
  orders: AdminOrder[];
  products: Product[];
  overviewData: DashboardOverviewData | null;
  isLoadingOverview?: boolean;
  isDemoStore: boolean;
  activeRange: { preset: AnalyticsPreset; from: string; to: string };
  onRangeChange: (next: { preset: AnalyticsPreset; from: string; to: string }) => void;
  onNavigateTab: (tab: 'orders' | 'overview' | 'products' | 'settings' | 'theme') => void;
}

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildPresetDateRange(preset: Exclude<AnalyticsPreset, 'custom'>): {
  preset: AnalyticsPreset;
  from: string;
  to: string;
} {
  const today = new Date();
  const to = toIsoDateLocal(today);
  if (preset === 'today') return { preset, from: to, to };
  if (preset === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const yStr = toIsoDateLocal(y);
    return { preset, from: yStr, to: yStr };
  }
  if (preset === '7d') {
    const s = new Date(today);
    s.setDate(s.getDate() - 6);
    return { preset, from: toIsoDateLocal(s), to };
  }
  if (preset === '30d') {
    const s = new Date(today);
    s.setDate(s.getDate() - 29);
    return { preset, from: toIsoDateLocal(s), to };
  }
  // 'month' -> 1st of current month to today
  const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return { preset, from: toIsoDateLocal(mStart), to };
}

function formatMoneyEgp(piasters: number): string {
  return (piasters / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactEgp(piasters: number): string {
  const pounds = piasters / 100;
  if (Math.abs(pounds) >= 1000000) return `${(pounds / 1000000).toFixed(2)}M`;
  if (Math.abs(pounds) >= 10000) return `${(pounds / 1000).toFixed(1)}K`;
  return pounds.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (isNaN(d.getTime())) return isoDate.slice(5);
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

function formatHourLabel(hour24: string): string {
  const h = parseInt(hour24, 10);
  if (isNaN(h)) return hour24;
  if (h === 0) return '12 ص';
  if (h < 12) return `${h} ص`;
  if (h === 12) return '12 م';
  return `${h - 12} م`;
}

function formatLastSync(iso: string | null | undefined): string {
  if (!iso) return 'بانتظار أول مزامنة من الكاشير';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'متزامن مع الكاشير الآن';
  if (diffMin < 60) return `آخر مزامنة منذ ${diffMin} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `آخر مزامنة منذ ${diffHr} ساعة`;
  return `آخر مزامنة ${d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}`;
}

function buildDemoOverview(
  products: Product[],
  range: { from: string; to: string }
): DashboardOverviewData {
  const today = new Date();
  const base30: DailySalesPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const seed = ((29 - i) * 37 + 13) % 100;
    const isWeekend = d.getDay() === 5 || d.getDay() === 4;
    const sales = (isWeekend ? 2100000 : 1480000) + seed * 6800;
    const inv = Math.max(42, Math.round(sales / 24500));
    const cash = Math.round(sales * 0.58);
    const card = Math.round(sales * 0.30);
    const credit = sales - cash - card;
    const ret = i % 3 === 0 ? 42000 : 16500;
    const grossProf = Math.round((sales - ret) * 0.22);
    const exp = 48000 + (seed % 5) * 12000;
    base30.push({
      summary_date: toIsoDateLocal(d),
      total_sales: sales,
      invoice_count: inv,
      avg_invoice: Math.round(sales / inv),
      cash_total: cash,
      card_total: card,
      credit_total: credit,
      returns_count: i % 3 === 0 ? 3 : 1,
      returns_total: ret,
      net_profit: grossProf - exp,
      expenses_total: exp,
    });
  }

  const inRange = base30.filter(r => r.summary_date >= range.from && r.summary_date <= range.to);
  const activeSlice = inRange.length > 0 ? inRange : [base30[base30.length - 1]];

  const totalSales = activeSlice.reduce((s, d) => s + d.total_sales, 0);
  const returnsTotal = activeSlice.reduce((s, d) => s + d.returns_total, 0);
  const returnsCount = activeSlice.reduce((s, d) => s + d.returns_count, 0);
  const invoices = activeSlice.reduce((s, d) => s + d.invoice_count, 0);
  const cash = activeSlice.reduce((s, d) => s + d.cash_total, 0);
  const cardAll = activeSlice.reduce((s, d) => s + d.card_total, 0);
  const credit = activeSlice.reduce((s, d) => s + d.credit_total, 0);
  const expenses = activeSlice.reduce((s, d) => s + (d.expenses_total || 0), 0);
  const netProfit = activeSlice.reduce((s, d) => s + (d.net_profit || 0), 0);
  const grossProfit = netProfit + expenses;
  const instapay = Math.round(cardAll * 0.42);
  const wallet = Math.round(cardAll * 0.33);
  const cardOnly = Math.max(0, cardAll - instapay - wallet);

  const mult = activeSlice.length;
  const prevSales = Math.round(totalSales * 0.91);

  const retailVal = products.reduce(
    (s, p) => s + Math.round((Math.max(0, p.stock_quantity) * p.price_piasters) / 1000),
    0
  );
  const costVal = Math.round(retailVal * 0.78);

  return {
    filter: {
      from: range.from,
      to: range.to,
      span_days: activeSlice.length,
      days_with_data: activeSlice.length,
    },
    today_pos_sales: totalSales,
    today_pos_invoices: invoices,
    today_pos_avg_invoice: invoices > 0 ? Math.round(totalSales / invoices) : 0,
    today_pos_cash: cash,
    today_pos_card: cardAll,
    today_pos_card_only: cardOnly,
    today_pos_instapay: instapay,
    today_pos_wallet: wallet,
    today_pos_credit: credit,
    today_pos_returns_count: returnsCount,
    today_pos_returns_total: returnsTotal,
    today_pos_net_sales: Math.max(0, totalSales - returnsTotal),
    today_pos_gross_profit: grossProfit,
    today_pos_expenses: expenses,
    today_pos_net_profit: netProfit,
    today_pos_debt_payments: 95000 * mult,
    today_pos_discounts: 32000 * mult,
    today_pos_cancelled_count: mult,
    today_pos_cancelled_total: 24500 * mult,
    today_pos_hourly_breakdown: {
      '09': 95000 * mult,
      '10': 142000 * mult,
      '11': 178000 * mult,
      '12': 210000 * mult,
      '13': 164000 * mult,
      '14': 138000 * mult,
      '15': 152000 * mult,
      '16': 198000 * mult,
      '17': 245000 * mult,
      '18': 286000 * mult,
      '19': 312000 * mult,
      '20': 248000 * mult,
    },
    today_pos_top_products: [
      { id: 'p-2', name: 'زيت هلا عباد الشمس النقي 800 مل', qty: 34000 * mult, revenue: 255000 * mult, profit: 51000 * mult },
      { id: 'p-1', name: 'أرز مصري فاخر المطبخ 1 كجم', qty: 58000 * mult, revenue: 203000 * mult, profit: 38500 * mult },
      { id: 'p-5', name: 'حليب جهينة كامل الدسم 1 لتر', qty: 41000 * mult, revenue: 180400 * mult, profit: 31200 * mult },
      { id: 'p-4', name: 'جبنة دومتي فيتا بلس 500 جم', qty: 37000 * mult, revenue: 155400 * mult, profit: 34000 * mult },
      { id: 'p-7', name: 'شاي العروسة أسود ناعم 250 جم', qty: 26000 * mult, revenue: 135200 * mult, profit: 27400 * mult },
      { id: 'p-10', name: 'عسل نحل طبيعي امتنان 450 جم', qty: 12000 * mult, revenue: 114000 * mult, profit: 28500 * mult },
    ],
    yesterday_pos_sales: prevSales,
    yesterday_pos_net_sales: prevSales,
    yesterday_pos_invoices: Math.max(1, Math.round(invoices * 0.92)),
    store_balances: {
      customer_debts_total: 845000,
      debtor_customers_count: 14,
      supplier_debts_total: 1260000,
    },
    daily_history: activeSlice.length <= 1 ? base30.slice(-14) : activeSlice,
    inventory_summary: {
      total_products_count: products.length,
      out_of_stock_count: 1,
      low_stock_count: 3,
      retail_value: retailVal > 0 ? retailVal : 12450000,
      cost_value: costVal > 0 ? costVal : 9710000,
      expected_profit: retailVal > 0 ? retailVal - costVal : 2740000,
    },
    low_stock_products: [
      { id: 'p-8', name: 'سائل غسيل الأطباق فيري 650 مل بالليمون', unit_name: 'زجاجة', stock_quantity: 0, low_stock_threshold: 5000, price_piasters: 4800 },
      { id: 'p-10', name: 'عسل نحل طبيعي امتنان 450 جم', unit_name: 'برطمان', stock_quantity: 2000, low_stock_threshold: 5000, price_piasters: 9500 },
      { id: 'p-6', name: 'عصير بيتي برتقال طبيعي 1 لتر', unit_name: 'علبة', stock_quantity: 3000, low_stock_threshold: 6000, price_piasters: 2600 },
      { id: 'p-2', name: 'زيت هلا عباد الشمس النقي 800 مل', unit_name: 'زجاجة', stock_quantity: 4000, low_stock_threshold: 8000, price_piasters: 7500 },
    ],
    online_range_summary: {
      total_orders: 3,
      active_sales: 40400,
      pending: 1,
      preparing: 1,
      ready: 1,
      delivered: 0,
      cancelled: 0,
    },
    today_online_orders: 3,
    today_online_sales: 40400,
    pending_orders_count: 1,
    low_stock_count: 3,
    total_products_count: products.length,
    last_sync_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    is_paused: 0,
  };
}

export const AnalyticsOverviewPanel: React.FC<Props> = ({
  orders,
  products,
  overviewData,
  isLoadingOverview = false,
  isDemoStore,
  activeRange,
  onRangeChange,
  onNavigateTab,
}) => {
  const [customFrom, setCustomFrom] = useState(activeRange.from);
  const [customTo, setCustomTo] = useState(activeRange.to);
  const [showCustomInputs, setShowCustomInputs] = useState(activeRange.preset === 'custom');
  const [chartMetric, setChartMetric] = useState<'sales' | 'profit'>('sales');
  const [rangeMotionPhase, setRangeMotionPhase] = useState<'a' | 'b'>('a');

  const data = useMemo<DashboardOverviewData>(() => {
    if (isDemoStore) return buildDemoOverview(products, activeRange);
    if (overviewData) return overviewData;
    return {
      today_pos_sales: 0,
      today_pos_invoices: 0,
      today_pos_avg_invoice: 0,
      today_pos_cash: 0,
      today_pos_card: 0,
      today_pos_card_only: 0,
      today_pos_instapay: 0,
      today_pos_wallet: 0,
      today_pos_credit: 0,
      today_pos_returns_count: 0,
      today_pos_returns_total: 0,
      today_pos_net_sales: 0,
      today_pos_gross_profit: 0,
      today_pos_expenses: 0,
      today_pos_net_profit: 0,
      today_pos_debt_payments: 0,
      today_pos_discounts: 0,
      today_pos_cancelled_count: 0,
      today_pos_cancelled_total: 0,
      today_pos_hourly_breakdown: {},
      today_pos_top_products: [],
      yesterday_pos_sales: 0,
      yesterday_pos_net_sales: 0,
      yesterday_pos_invoices: 0,
      store_balances: { customer_debts_total: 0, debtor_customers_count: 0, supplier_debts_total: 0 },
      daily_history: [],
      inventory_summary: {
        total_products_count: products.length,
        out_of_stock_count: products.filter(p => p.stock_quantity <= 0).length,
        low_stock_count: products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 5000).length,
        retail_value: products.reduce(
          (s, p) => s + Math.round((Math.max(0, p.stock_quantity) * p.price_piasters) / 1000),
          0
        ),
        cost_value: 0,
        expected_profit: 0,
      },
      low_stock_products: [],
      today_online_orders: 0,
      today_online_sales: 0,
      pending_orders_count: 0,
      low_stock_count: 0,
      total_products_count: products.length,
      last_sync_at: null,
      is_paused: 0,
    };
  }, [isDemoStore, overviewData, products, activeRange]);

  const handleSelectPreset = (preset: AnalyticsPreset) => {
    if (preset === 'custom') {
      setShowCustomInputs(true);
      setCustomFrom(activeRange.from);
      setCustomTo(activeRange.to);
      return;
    }
    setShowCustomInputs(false);
    const next = buildPresetDateRange(preset);
    setCustomFrom(next.from);
    setCustomTo(next.to);
    setRangeMotionPhase(p => (p === 'a' ? 'b' : 'a'));
    onRangeChange(next);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFrom || !customTo) return;
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    setRangeMotionPhase(p => (p === 'a' ? 'b' : 'a'));
    onRangeChange({ preset: 'custom', from, to });
  };

  // Financial derived metrics (strictly integer piasters)
  const netSales = data.today_pos_net_sales || 0;
  const prevNet = data.yesterday_pos_net_sales ?? data.yesterday_pos_sales ?? 0;
  const growthPct = prevNet > 0 ? Math.round(((netSales - prevNet) / prevNet) * 100) : null;

  const grossProfit = data.today_pos_gross_profit || 0;
  const expenses = data.today_pos_expenses || 0;
  const netProfit = data.today_pos_net_profit ?? (grossProfit - expenses);
  const profitMarginPct = netSales > 0 ? Math.round((netProfit / netSales) * 100) : 0;

  const cashTotal = data.today_pos_cash || 0;
  const instapayTotal = data.today_pos_instapay || 0;
  const walletTotal = data.today_pos_wallet || 0;
  const cardOnlyTotal =
    data.today_pos_card_only !== undefined
      ? data.today_pos_card_only
      : Math.max(0, (data.today_pos_card || 0) - instapayTotal - walletTotal);
  const creditTotal = data.today_pos_credit || 0;
  const debtPayments = data.today_pos_debt_payments || 0;
  const discountsTotal = data.today_pos_discounts || 0;
  const cancelledCount = data.today_pos_cancelled_count || 0;
  const cancelledTotal = data.today_pos_cancelled_total || 0;

  const balances = data.store_balances || {
    customer_debts_total: 0,
    debtor_customers_count: 0,
    supplier_debts_total: 0,
  };
  const inv = data.inventory_summary;
  const lowStockList = data.low_stock_products || [];
  const topPosProducts = data.today_pos_top_products || [];
  const chartDays = data.daily_history || [];

  const maxChartVal = useMemo(() => {
    const vals = chartDays.map(d =>
      chartMetric === 'profit' ? Math.max(0, d.net_profit || 0) : d.total_sales || 0
    );
    return Math.max(1, ...vals);
  }, [chartDays, chartMetric]);

  const hourlyPoints = useMemo(() => {
    const raw = data.today_pos_hourly_breakdown || {};
    return Object.entries(raw)
      .map(([hour, amount]) => ({ hour, amount: Number(amount) || 0 }))
      .sort((a, b) => parseInt(a.hour, 10) - parseInt(b.hour, 10));
  }, [data.today_pos_hourly_breakdown]);

  const maxHourlySales = useMemo(
    () => Math.max(1, ...hourlyPoints.map(h => h.amount)),
    [hourlyPoints]
  );

  const peakHour = useMemo(() => {
    if (hourlyPoints.length === 0) return null;
    return hourlyPoints.reduce((best, cur) => (cur.amount > best.amount ? cur : best), hourlyPoints[0]);
  }, [hourlyPoints]);

  // 5-Channel Desktop Payment Breakdown (1:1 match with Rafiq Desktop ReportsService)
  const paymentChannels = useMemo(() => {
    const sum = Math.max(1, cashTotal + instapayTotal + walletTotal + cardOnlyTotal + creditTotal);
    return [
      {
        key: 'cash',
        label: 'نقدي (درج الكاشير)',
        amount: cashTotal,
        pct: Math.round((cashTotal / sum) * 100),
        bar: 'bg-[#004D3F]',
        badge: 'bg-[#E6F2ED] text-[#004D3F]',
        icon: Banknote,
      },
      {
        key: 'instapay',
        label: 'إنستاباي (InstaPay)',
        amount: instapayTotal,
        pct: Math.round((instapayTotal / sum) * 100),
        bar: 'bg-purple-600',
        badge: 'bg-purple-50 text-purple-700',
        icon: CreditCard,
      },
      {
        key: 'wallet',
        label: 'فودافون كاش والمحافظ',
        amount: walletTotal,
        pct: Math.round((walletTotal / sum) * 100),
        bar: 'bg-rose-600',
        badge: 'bg-rose-50 text-rose-700',
        icon: Smartphone,
      },
      {
        key: 'card',
        label: 'بطاقات بنكية (فيزا / ميزة)',
        amount: cardOnlyTotal,
        pct: Math.round((cardOnlyTotal / sum) * 100),
        bar: 'bg-blue-600',
        badge: 'bg-blue-50 text-blue-700',
        icon: CreditCard,
      },
      {
        key: 'credit',
        label: 'مبيعات آجل (على الحساب)',
        amount: creditTotal,
        pct: Math.round((creditTotal / sum) * 100),
        bar: 'bg-amber-500',
        badge: 'bg-amber-50 text-amber-800',
        icon: Receipt,
      },
    ];
  }, [cashTotal, instapayTotal, walletTotal, cardOnlyTotal, creditTotal]);

  const onlineRange = useMemo(() => {
    if (data.online_range_summary) return data.online_range_summary;
    const active = orders.filter(o => o.status !== 'rejected' && o.status !== 'cancelled');
    return {
      total_orders: orders.length,
      active_sales: active.reduce((s, o) => s + (o.total || 0), 0),
      pending: orders.filter(o => o.status === 'new' || o.status === 'viewed').length,
      preparing: orders.filter(o => o.status === 'accepted' || o.status === 'preparing').length,
      ready: orders.filter(o => o.status === 'ready').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'rejected' || o.status === 'cancelled').length,
    };
  }, [data.online_range_summary, orders]);

  const rangeLabel =
    activeRange.from === activeRange.to
      ? formatShortDate(activeRange.from)
      : `${formatShortDate(activeRange.from)} ← ${formatShortDate(activeRange.to)}`;

  return (
    <div className="space-y-5">
      {/* 1. Pro Date Filter Bar & Live Desktop Sync Status */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Sync & Active Range Readout */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#E6F2ED] text-[#004D3F] text-xs font-black">
              <Filter className="w-3.5 h-3.5" />
              <span>تقارير كاشير المحل</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold">
              <Calendar className="w-3.5 h-3.5 text-[#004D3F]" />
              <span>{rangeLabel}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
              {isLoadingOverview ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#004D3F]" />
                  <span>جاري تحميل بيانات الفترة...</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{formatLastSync(data.last_sync_at)}</span>
                </>
              )}
            </span>
          </div>

          {/* Preset Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'today', label: 'اليوم' },
                { id: 'yesterday', label: 'أمس' },
                { id: '7d', label: 'آخر 7 أيام' },
                { id: '30d', label: 'آخر 30 يوم' },
                { id: 'month', label: 'هذا الشهر' },
                { id: 'custom', label: 'فترة مخصصة' },
              ] as Array<{ id: AnalyticsPreset; label: string }>
            ).map(item => {
              const isActive = activeRange.preset === item.id || (item.id === 'custom' && showCustomInputs);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPreset(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#004D3F] !text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  <span className={isActive ? '!text-white' : ''}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Official Rafiq Arabic Custom Date Range Picker Row */}
        {showCustomInputs && (
          <div className="motion-nav-group">
            <div>
              <form
                onSubmit={handleApplyCustom}
                className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2.5"
              >
                <CustomDateRangePicker
                  startDate={customFrom}
                  endDate={customTo}
                  maxDate={toIsoDateLocal(new Date())}
                  onChange={(start, end) => {
                    setCustomFrom(start);
                    setCustomTo(end);
                  }}
                  disabled={isLoadingOverview}
                  size="md"
                  className="flex-1"
                />
                <button
                  type="submit"
                  disabled={isLoadingOverview || !customFrom || !customTo}
                  className="px-5 py-2.5 rounded-xl bg-[#004D3F] hover:bg-[#00372D] text-white text-xs font-black transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-xs"
                >
                  تطبيق الفترة
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Animated Analytics Body (Desktop Motion Phase Twin) */}
      <div data-motion-phase={rangeMotionPhase} className="space-y-5">

      {/* 2. Primary Financial KPI Cards (4 Core Owner Metrics from Desktop POS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Card 1: Net POS Sales */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3 hover:border-[#004D3F]/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">صافي مبيعات المحل</span>
            <div className="w-9 h-9 rounded-xl bg-[#E6F2ED] text-[#004D3F] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {formatMoneyEgp(netSales)}
            </span>
            <span className="text-xs font-bold text-slate-400">ج.م</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
            <span className="text-slate-500 font-bold">
              {data.today_pos_invoices} فاتورة • متوسط {formatCompactEgp(data.today_pos_avg_invoice)} ج.م
            </span>
            {growthPct !== null && (
              <span
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-black font-mono text-[10px] ${
                  growthPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {growthPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>
                  {growthPct >= 0 ? '+' : ''}
                  {growthPct}%
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Net Operating Profit (Gross Profit - Expenses) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3 hover:border-[#004D3F]/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">صافي الربح الفعلي</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black font-mono ${
                netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatMoneyEgp(netProfit)}
            </span>
            <span className="text-xs font-bold text-slate-400">ج.م</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
            <span className="text-slate-500 font-medium">
              ربح البيع: <strong className="text-slate-800">{formatCompactEgp(grossProfit)}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-black font-mono text-[10px]">
              هامش {profitMarginPct}%
            </span>
          </div>
        </div>

        {/* Card 3: Cash Drawer & Debt Collections */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3 hover:border-[#004D3F]/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">النقدي بالدرج وتحصيل الآجل</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {formatMoneyEgp(cashTotal + debtPayments)}
            </span>
            <span className="text-xs font-bold text-slate-400">ج.م</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
            <span className="text-slate-500 font-medium">
              مبيعات كاش: <strong className="text-slate-800">{formatCompactEgp(cashTotal)}</strong>
            </span>
            <span className="text-emerald-700 font-bold">
              تحصيل ديون: +{formatCompactEgp(debtPayments)}
            </span>
          </div>
        </div>

        {/* Card 4: Returns, Expenses & Discounts (Control / Anti-Loss) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3 hover:border-[#004D3F]/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">المصروفات والمرتجعات</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-700 font-mono">
              {formatMoneyEgp(expenses + (data.today_pos_returns_total || 0))}
            </span>
            <span className="text-xs font-bold text-slate-400">ج.م</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
            <span className="text-slate-600 font-bold">
              مصروفات: {formatCompactEgp(expenses)}
            </span>
            <span className="text-rose-700 font-bold">
              مرتجع ({data.today_pos_returns_count}): {formatCompactEgp(data.today_pos_returns_total || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Live Store Balances Strip (Synced Directly from Desktop Customers, Suppliers & Inventory) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-500">إجمالي ديون العملاء للمحل (الآجل)</div>
              <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                {formatMoneyEgp(balances.customer_debts_total)}{' '}
                <span className="text-[11px] text-slate-400 font-sans">ج.م</span>
              </div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-black flex-shrink-0">
            {balances.debtor_customers_count} عميل
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-500">مستحقات الموردين الحالية</div>
              <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                {formatMoneyEgp(balances.supplier_debts_total)}{' '}
                <span className="text-[11px] text-slate-400 font-sans">ج.م</span>
              </div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold flex-shrink-0">
            رصيد لحظي
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#E6F2ED] text-[#004D3F] flex items-center justify-center flex-shrink-0">
              <Warehouse className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-500">قيمة المخزون الحالي (سعر بيع)</div>
              <div className="text-lg font-black text-[#00372D] font-mono mt-0.5">
                {formatCompactEgp(inv.retail_value)}{' '}
                <span className="text-[11px] text-slate-400 font-sans">ج.م</span>
              </div>
            </div>
          </div>
          <div className="text-left flex-shrink-0">
            <div className="text-[11px] font-black text-emerald-700 font-mono">
              +{formatCompactEgp(inv.expected_profit)} ربح
            </div>
            <div className="text-[10px] text-slate-400">{inv.total_products_count} صنف</div>
          </div>
        </div>
      </div>

      {/* 4. Visual Charts Row: Daily Sales/Profit Trend + Peak Hours */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Daily Sales / Profit Chart */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#004D3F]" />
                <span>الأداء اليومي لمبيعات وأرباح المحل</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                رسم بياني يوضح تطور المبيعات وصافي الأرباح اليومية للفترة المحددة
              </p>
            </div>

            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setChartMetric('sales')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  chartMetric === 'sales' ? 'bg-white text-[#004D3F] shadow-2xs' : 'text-slate-500'
                }`}
              >
                المبيعات
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('profit')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  chartMetric === 'profit' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                صافي الربح
              </button>
            </div>
          </div>

          {chartDays.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-xs text-slate-400 gap-2">
              <BarChart3 className="w-8 h-8 text-slate-300" />
              <span>لا توجد مبيعات متزامنة في هذه الفترة بعد. اضغط «مزامنة الآن» من برنامج الكاشير.</span>
            </div>
          ) : (
            <div className="h-52 flex items-end gap-1.5 sm:gap-2 pt-5 pb-1 overflow-x-auto no-scrollbar">
              {chartDays.map((day, idx) => {
                const val =
                  chartMetric === 'profit' ? Math.max(0, day.net_profit || 0) : day.total_sales || 0;
                const heightPct = Math.max(8, Math.round((val / maxChartVal) * 100));
                const isLatest = idx === chartDays.length - 1;
                return (
                  <div
                    key={day.summary_date}
                    className="flex-1 min-w-[26px] h-full flex flex-col items-center justify-end gap-1.5 group cursor-pointer"
                    title={`${formatShortDate(day.summary_date)}: ${formatMoneyEgp(val)} ج.م`}
                  >
                    <div className="text-[9px] font-mono font-black text-slate-500 group-hover:text-[#004D3F] transition-colors truncate">
                      {formatCompactEgp(val)}
                    </div>
                    <div className="w-full flex-1 flex items-end justify-center">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full max-w-[34px] rounded-t-lg transition-colors ${
                          chartMetric === 'profit'
                            ? isLatest
                              ? 'bg-emerald-600'
                              : 'bg-emerald-500/35 group-hover:bg-emerald-600'
                            : isLatest
                            ? 'bg-gradient-to-t from-[#00372D] to-[#006D41]'
                            : 'bg-[#004D3F]/25 group-hover:bg-[#004D3F]/75'
                        }`}
                      />
                    </div>
                    <div
                      className={`text-[9px] truncate max-w-full ${
                        isLatest ? 'font-black text-[#00372D]' : 'font-medium text-slate-400'
                      }`}
                    >
                      {formatShortDate(day.summary_date)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hourly Peak-Hours Breakdown */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" />
                <span>ساعات الذروة في المحل</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                أكثر ساعات اليوم مبيعاً خلال الفترة المحددة
              </p>
            </div>
            {peakHour && (
              <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-black flex-shrink-0">
                الذروة: {formatHourLabel(peakHour.hour)}
              </span>
            )}
          </div>

          {hourlyPoints.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-xs text-slate-400 gap-2">
              <Clock className="w-8 h-8 text-slate-300" />
              <span>تظهر ساعات الذروة فور تسجيل ومزامنة مبيعات الفترة من الكاشير.</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-44 flex items-end gap-1.5 pt-4">
                {hourlyPoints.map(pt => {
                  const pct = Math.max(8, Math.round((pt.amount / maxHourlySales) * 100));
                  const isPeak = peakHour?.hour === pt.hour;
                  return (
                    <div
                      key={pt.hour}
                      className="flex-1 h-full flex flex-col items-center justify-end gap-1 cursor-pointer group min-w-0"
                      title={`مبيعات الساعة ${formatHourLabel(pt.hour)}: ${formatMoneyEgp(pt.amount)} ج.م`}
                    >
                      <div className="w-full flex-1 flex items-end justify-center">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-t-lg transition-colors ${
                            isPeak
                              ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-xs'
                              : 'bg-slate-200 group-hover:bg-[#006D41]'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[9px] truncate ${
                          isPeak ? 'font-black text-amber-800' : 'text-slate-400 font-medium'
                        }`}
                      >
                        {formatHourLabel(pt.hour)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-bold">
                  {peakHour ? `أعلى ساعة مبيعات (${formatHourLabel(peakHour.hour)}):` : 'تفاصيل الساعات'}
                </span>
                <span className="font-mono font-black text-slate-900">
                  {formatMoneyEgp(peakHour?.amount || 0)} ج.م
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Payment Channels (5 Desktop Methods) + Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 5-Channel Payment Breakdown & Anti-Loss Control (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#004D3F]" />
              <span>تفصيل طرق التحصيل بالمحل</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              مطابق تماماً لتقرير الخزينة والورديات في برنامج الكاشير
            </p>
          </div>

          <div className="space-y-3">
            {paymentChannels.map(ch => {
              const Icon = ch.icon;
              return (
                <div key={ch.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${ch.badge}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="font-bold text-slate-800 truncate">{ch.label}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono flex-shrink-0">
                      <span className="text-[10px] font-bold text-slate-400">{ch.pct}%</span>
                      <span className="font-black text-slate-900">{formatMoneyEgp(ch.amount)} ج.م</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ch.bar} transition-all duration-500`}
                      style={{ width: `${ch.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discounts & Cancelled Invoices Audit Strip */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                <BadgePercent className="w-3 h-3 text-slate-400" />
                <span>الخصومات الممنوحة</span>
              </div>
              <div className="font-black font-mono text-slate-900 mt-0.5">
                {formatMoneyEgp(discountsTotal)} ج.م
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-100">
              <div className="text-[10px] font-bold text-rose-700">
                فواتير ملغاة ({cancelledCount})
              </div>
              <div className="font-black font-mono text-rose-800 mt-0.5">
                {formatMoneyEgp(cancelledTotal)} ج.م
              </div>
            </div>
          </div>
        </div>

        {/* Top Selling Offline POS Products (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>الأصناف الأكثر مبيعاً وربحاً بالمحل</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ترتيب حقيقي لأعلى الأصناف إيراداً على الكاشير خلال الفترة المحددة
              </p>
            </div>
            <span className="text-[11px] font-bold text-slate-400">{rangeLabel}</span>
          </div>

          {topPosProducts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 space-y-1">
              <p className="font-bold text-slate-600">لا توجد أصناف مباعة مسجلة في هذه الفترة</p>
              <p>تتحدّث هذه القائمة تلقائياً من فواتير الكاشير فور المزامنة.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topPosProducts.slice(0, 6).map((item, idx) => {
                const units = item.qty >= 100 ? Number((item.qty / 1000).toFixed(2)) : item.qty;
                return (
                  <div key={`${item.id}-${idx}`} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-xl font-black font-mono text-[11px] flex items-center justify-center flex-shrink-0 ${
                          idx === 0
                            ? 'bg-amber-100 text-amber-900'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-800'
                            : idx === 2
                            ? 'bg-orange-100 text-orange-900'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{item.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          الكمية المباعة: <strong className="text-slate-700">{units}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-left flex-shrink-0">
                      {item.revenue !== undefined && (
                        <div className="font-black text-[#004D3F] font-mono">
                          {formatMoneyEgp(item.revenue)} ج.م
                        </div>
                      )}
                      {item.profit !== undefined && item.profit > 0 && (
                        <div className="text-[10px] font-bold text-emerald-700 font-mono">
                          ربح +{formatMoneyEgp(item.profit)} ج.م
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 6. Bottom Row: Low Stock Alerts + Online Channel Summary for the Same Period */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Critical Low-Stock & Out-of-Stock Alerts (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>تنبيهات النواقص وإعادة الطلب بالمخزن</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {inv.out_of_stock_count} صنف نفد تماماً • {inv.low_stock_count} صنف قارب على النفاذ
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('products')}
              className="inline-flex items-center gap-1 text-xs font-black text-[#004D3F] hover:underline cursor-pointer"
            >
              <span>كل الأصناف</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {lowStockList.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-700 bg-emerald-50/60 rounded-2xl border border-emerald-200/60 font-bold">
              ممتاز — جميع الأصناف متوفرة بكميات آمنة في المخزن حالياً.
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockList.slice(0, 6).map(item => {
                const remaining = Number((item.stock_quantity / 1000).toFixed(2));
                const isOut = item.stock_quantity <= 0;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      isOut ? 'bg-rose-50/70 border-rose-200' : 'bg-amber-50/60 border-amber-200/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{item.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        سعر البيع: {formatMoneyEgp(item.price_piasters)} ج.م • الوحدة: {item.unit_name}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black font-mono flex-shrink-0 ${
                        isOut ? 'bg-rose-600 text-white' : 'bg-amber-200/90 text-amber-950'
                      }`}
                    >
                      {isOut ? 'نفد (0)' : `متبقي ${remaining}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compact Online Store Channel Summary for Active Date Filter (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#004D3F]" />
                <span>مبيعات قناة الأونلاين ({rangeLabel})</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                الطلبات الواردة عبر الرابط الإلكتروني في نفس الفترة
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="inline-flex items-center gap-1 text-xs font-black text-[#004D3F] hover:underline cursor-pointer"
            >
              <span>الأوردرات</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-500">إجمالي أوردرات الأونلاين</div>
              <div className="text-xl font-black text-[#004D3F] font-mono mt-0.5">
                {formatMoneyEgp(onlineRange.active_sales)}{' '}
                <span className="text-xs text-slate-400">ج.م</span>
              </div>
            </div>
            <div className="text-left">
              <div className="text-xs font-black text-slate-900 font-mono">
                {onlineRange.total_orders} طلب
              </div>
              <div className="text-[10px] text-amber-700 font-bold">{onlineRange.pending} جديد</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'جديد', count: onlineRange.pending, cls: 'bg-amber-50 text-amber-800 border-amber-200' },
              { label: 'بيتجهز', count: onlineRange.preparing, cls: 'bg-blue-50 text-blue-800 border-blue-200' },
              { label: 'دليفري', count: onlineRange.ready, cls: 'bg-purple-50 text-purple-800 border-purple-200' },
              { label: 'اتسلم', count: onlineRange.delivered, cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
            ].map(st => (
              <div key={st.label} className={`p-2 rounded-xl border ${st.cls}`}>
                <div className="text-sm font-black font-mono">{st.count}</div>
                <div className="text-[10px] font-bold mt-0.5">{st.label}</div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
            <span>تكلفة البضاعة بالمخزن:</span>
            <strong className="font-mono text-slate-900">{formatCompactEgp(inv.cost_value)} ج.م</strong>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
