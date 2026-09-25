import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  ShoppingCart, 
  DollarSign, 
  Package, 
  AlertTriangle, 
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
  Users,
  ChevronLeft,
  Flame
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

// Clean helper to parse and format raw ISO backup dates into friendly Arabic
function formatFriendlyBackupDate(raw: string | undefined): string {
  if (!raw || raw === 'لم تؤخذ بعد' || raw === 'لم تؤخذ') return 'لم تؤخذ بعد';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `اليوم ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    return `${dateStr}، ${timeStr}`;
  } catch {
    return raw;
  }
}

// Clean printer name display without awkward truncation
function formatCleanPrinterName(name: string | undefined): string {
  if (!name || name === 'لا توجد' || name.trim() === '') return 'غير محددة';
  return name.trim();
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
    <div className="flex flex-col h-full w-full bg-[#f4f7f6] select-none overflow-y-auto p-5 gap-5 font-sans" dir="rtl">
      
      {/* 1. TOP HEADER & COMMAND CENTER CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">لوحة متابعة اليوم والوردية</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              مباشر • أوفلاين
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            ملخص حركة المبيعات الفعلية، الأرباح التقديرية، وحالة سلامة نقاط البيع
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">آخر تحديث:</span>
            <span className="font-mono text-slate-900 font-bold text-xs">{lastRefreshed || '---'}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsReadinessModalOpen(true)}
            className="flex items-center gap-2 h-9 px-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-[#006d41] border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            <ClipboardCheck className="w-4 h-4 text-emerald-600" />
            <span>فحص جاهزية التشغيل</span>
          </button>

          <button
            onClick={() => void loadData()}
            disabled={isLoading}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-slate-200/80 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : 'text-slate-400'}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE SYSTEM HEALTH & HARDWARE STATUS STRIP */}
      <div
        className={`rounded-2xl border p-4.5 transition-all shadow-xs ${
          isHealthy
            ? 'bg-gradient-to-r from-emerald-50/95 via-white to-teal-50/60 border-emerald-200/90'
            : isCritical
            ? 'bg-gradient-to-r from-rose-50 via-white to-red-50/60 border-red-300'
            : 'bg-gradient-to-r from-amber-50 via-white to-orange-50/60 border-amber-300'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform ${
                isHealthy
                  ? 'bg-gradient-to-br from-emerald-600 to-[#004d3e] text-white shadow-emerald-700/20'
                  : isCritical
                  ? 'bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-red-700/20'
                  : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-600/20'
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

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  مؤشر سلامة النظام
                </span>
                <span
                  className={`text-[10.5px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                    isHealthy
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : isCritical
                      ? 'bg-red-100 text-red-900 border border-red-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-600 animate-ping' : 'bg-red-600'}`} />
                  {isHealthy ? 'سليم 100%' : isCritical ? 'خطر حرج' : 'يحتاج انتباهك'}
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-900 leading-snug">
                {health?.oneSentenceSummary || 'النظام جاهز تماماً لتسجيل المبيعات • قاعدة البيانات مؤمنة ومستقرة بنسبة 100%'}
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
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 rounded-xl text-xs font-bold text-slate-800 transition-all shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] cursor-pointer"
            >
              فحص التفاصيل
            </button>
          </div>
        </div>

        {/* Clean Hardware & System Pulse Badges */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mt-3.5 pt-3.5 border-t border-slate-200/70 text-xs">
          {/* Storage Free Space */}
          <div className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-xl border border-slate-200/70 shadow-2xs">
            <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="truncate">
              <span className="text-[11px] text-slate-500 block leading-tight">مساحة القرص</span>
              <span className="font-mono font-bold text-slate-900 text-xs">{health?.metrics?.diskFreeFormatted || '---'}</span>
            </div>
          </div>

          {/* Backup Status (Clean Date) */}
          <div className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-xl border border-slate-200/70 shadow-2xs">
            <Database className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="truncate">
              <span className="text-[11px] text-slate-500 block leading-tight">النسخ الاحتياطي</span>
              <span className="font-bold text-slate-900 text-xs truncate block" title={health?.metrics?.lastBackupFormatted}>
                {formatFriendlyBackupDate(health?.metrics?.lastBackupFormatted)}
              </span>
            </div>
          </div>

          {/* Printer Detection */}
          <div className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-xl border border-slate-200/70 shadow-2xs">
            <Printer className="w-4 h-4 text-teal-600 shrink-0" />
            <div className="truncate">
              <span className="text-[11px] text-slate-500 block leading-tight">طابعة الفواتير</span>
              <span className="font-bold text-slate-900 text-xs truncate block" title={health?.metrics?.printerName}>
                {formatCleanPrinterName(health?.metrics?.printerName)}
              </span>
            </div>
          </div>

          {/* Offline Lifetime License */}
          <div className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-xl border border-slate-200/70 shadow-2xs">
            <KeyRound className="w-4 h-4 text-emerald-700 shrink-0" />
            <div className="truncate">
              <span className="text-[11px] text-slate-500 block leading-tight">حالة الترخيص</span>
              <span className="font-bold text-slate-900 text-xs">ترخيص محلي دائم</span>
            </div>
          </div>

          {/* Catalog Products Count */}
          <div className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-xl border border-slate-200/70 shadow-2xs">
            <Package className="w-4 h-4 text-[#006d41] shrink-0" />
            <div className="truncate">
              <span className="text-[11px] text-slate-500 block leading-tight">كتالوج الأصناف</span>
              <span className="font-mono font-bold text-slate-900 text-xs">{health?.metrics?.productsCount || 0} صنف مسجل</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. HERO ENTERPRISE POS ACTION WORKSTATION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* HERO ACTION 1: POS Sale (F1) - The Prime Daily Driver */}
        <button
          type="button"
          onClick={onNavigateToPos}
          className="group relative p-4 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-white to-white border border-emerald-300/80 hover:border-emerald-500 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 flex items-center justify-between text-right overflow-hidden"
        >
          {/* Subtle brand ambient glow */}
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-400/10 rounded-full blur-xl pointer-events-none group-hover:bg-emerald-400/20 transition-all" />

          <div className="flex items-center gap-3.5 z-10 min-w-0">
            {/* Tactile Icon Squircle */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#006d41] to-[#004d3e] text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-800/20 group-hover:scale-105 transition-transform">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-black text-emerald-800 bg-emerald-100/70 border border-emerald-200/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  المحطة الرئيسية
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-[#006d41] transition-colors truncate">
                تسجيل بيع جديد
              </h3>
              <p className="text-[11.5px] text-slate-500 font-normal truncate leading-tight">
                باركود، سلة سريعة، حساب آجل، وطباعة فورية
              </p>
            </div>
          </div>

          {/* Keycap & Action Trigger */}
          <div className="flex items-center gap-2 shrink-0 z-10 mr-2">
            <kbd className="min-w-[38px] h-8 px-2.5 rounded-lg bg-gradient-to-b from-emerald-600 to-[#005232] text-white font-mono text-xs font-black shadow-xs border border-emerald-600 border-b-2 border-b-emerald-800 flex items-center justify-center tracking-wider group-hover:shadow-sm transition-all">
              F1
            </kbd>
            <ChevronLeft className="w-4 h-4 text-emerald-700/60 group-hover:text-emerald-700 group-hover:-translate-x-1 transition-all" />
          </div>
        </button>

        {/* HERO ACTION 2: Products Catalog (F6) - Crisp Inventory Card */}
        <button
          type="button"
          onClick={onNavigateToProducts}
          className="group relative p-4 rounded-2xl bg-gradient-to-br from-slate-50/60 via-white to-white border border-slate-200/90 hover:border-slate-300 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 flex items-center justify-between text-right overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-28 h-28 bg-slate-300/10 rounded-full blur-xl pointer-events-none group-hover:bg-slate-300/20 transition-all" />

          <div className="flex items-center gap-3.5 z-10 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm shadow-slate-900/15 group-hover:scale-105 transition-transform">
              <Package className="w-6 h-6 text-white" />
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-black text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  المخزن والكتالوج
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-slate-700 transition-colors truncate">
                كتالوج الأصناف والأسعار
              </h3>
              <p className="text-[11.5px] text-slate-500 font-normal truncate leading-tight">
                إضافة صنف، تعديل السعر، واستيراد إكسيل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 z-10 mr-2">
            <kbd className="min-w-[38px] h-8 px-2.5 rounded-lg bg-gradient-to-b from-white to-slate-100 text-slate-700 font-mono text-xs font-black shadow-xs border border-slate-300 border-b-2 border-b-slate-400 flex items-center justify-center tracking-wider group-hover:border-slate-400 group-hover:text-slate-900 transition-all">
              F6
            </kbd>
            <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:-translate-x-1 transition-all" />
          </div>
        </button>

        {/* HERO ACTION 3: Sales History & Reports (F7) - Crisp Shift & History Card */}
        <button
          type="button"
          onClick={() => {
            if (onNavigateToSales) onNavigateToSales();
          }}
          className="group relative p-4 rounded-2xl bg-gradient-to-br from-teal-50/50 via-white to-white border border-slate-200/90 hover:border-teal-300 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 flex items-center justify-between text-right overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-28 h-28 bg-teal-300/10 rounded-full blur-xl pointer-events-none group-hover:bg-teal-300/20 transition-all" />

          <div className="flex items-center gap-3.5 z-10 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-white flex items-center justify-center shrink-0 shadow-sm shadow-teal-900/15 group-hover:scale-105 transition-transform">
              <FileText className="w-6 h-6 text-white" />
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-black text-teal-800 bg-teal-100/70 border border-teal-200/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  الفواتير والتقارير
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-teal-800 transition-colors truncate">
                سجل الفواتير والوردية
              </h3>
              <p className="text-[11.5px] text-slate-500 font-normal truncate leading-tight">
                البحث في الفواتير، إعادة الطباعة، وحساب الوردية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 z-10 mr-2">
            <kbd className="min-w-[38px] h-8 px-2.5 rounded-lg bg-gradient-to-b from-white to-slate-100 text-slate-700 font-mono text-xs font-black shadow-xs border border-slate-300 border-b-2 border-b-slate-400 flex items-center justify-center tracking-wider group-hover:border-teal-400 group-hover:text-teal-800 transition-all">
              F7
            </kbd>
            <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-teal-600 group-hover:-translate-x-1 transition-all" />
          </div>
        </button>
      </div>

      {/* 4. FINANCIAL & OPERATIONAL KPI METRICS (No clipping, elegant card craftsmanship) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* KPI 1: Today Sales */}
        <div className="bg-gradient-to-b from-emerald-50/50 via-white to-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between min-h-[135px]">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-bold text-slate-700">مبيعات اليوم</span>
              <div className="w-7 h-7 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                {summary ? (summary.todaySalesPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
          </div>
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>نقدي: <strong className="text-slate-800 font-mono">{summary ? (summary.todayCashPiasters / 100).toFixed(2) : '0'}</strong></span>
            <span>آجل: <strong className="text-slate-800 font-mono">{summary ? (summary.todayCreditPiasters / 100).toFixed(2) : '0'}</strong></span>
          </div>
        </div>

        {/* KPI 2: Today Profit */}
        <div className="bg-gradient-to-b from-teal-50/50 via-white to-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-teal-300 transition-all flex flex-col justify-between min-h-[135px]">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-bold text-slate-700">أرباح اليوم التقديرية</span>
              <div className="w-7 h-7 rounded-xl bg-teal-100/70 text-teal-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-teal-700 tracking-tight">
                {summary ? (summary.todayProfitsPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-teal-600">ج.م</span>
            </div>
          </div>
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>هامش الربح</span>
            <span className="text-teal-700 font-bold font-mono text-[10.5px] bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60">
              تقديري للوردية
            </span>
          </div>
        </div>

        {/* KPI 3: Invoices Count */}
        <div className="bg-gradient-to-b from-indigo-50/40 via-white to-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between min-h-[135px]">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-bold text-slate-700">فواتير الكاشير اليوم</span>
              <div className="w-7 h-7 rounded-xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                {summary ? summary.todayInvoicesCount : '0'}
              </span>
              <span className="text-[11px] font-bold text-slate-400">فاتورة</span>
            </div>
          </div>
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>متوسط الفاتورة</span>
            <span className="text-slate-800 font-bold font-mono">
              {summary && summary.todayInvoicesCount > 0 ? ((summary.todaySalesPiasters / summary.todayInvoicesCount) / 100).toFixed(1) : '0'} ج.م
            </span>
          </div>
        </div>

        {/* KPI 4: Drawer Balance */}
        <div className="bg-gradient-to-b from-amber-50/50 via-white to-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between min-h-[135px]">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-bold text-slate-700">المبالغ النقدية في الدرج</span>
              <div className="w-7 h-7 rounded-xl bg-amber-100/70 text-amber-700 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                {summary ? (summary.todayCashPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
          </div>
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>النقدية الصافية</span>
            <span className="text-amber-800 font-bold text-[10.5px] bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
              خزينة المحل
            </span>
          </div>
        </div>

        {/* KPI 5: Customer Debts */}
        <div 
          onClick={onNavigateToCustomers}
          className={`bg-gradient-to-b from-rose-50/50 via-white to-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-rose-300 transition-all flex flex-col justify-between min-h-[135px] ${onNavigateToCustomers ? 'cursor-pointer' : ''}`}
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-bold text-slate-700">ديون العملاء (الآجل)</span>
              <div className="w-7 h-7 rounded-xl bg-rose-100/70 text-rose-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-rose-600 tracking-tight">
                {summary && summary.totalCustomerDebtsPiasters != null 
                  ? (summary.totalCustomerDebtsPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                  : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
          </div>
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>المدينون: <strong className="text-rose-700 font-mono">{summary?.debtorsCount || 0}</strong></span>
            {onNavigateToCustomers && (
              <span className="text-emerald-700 font-bold text-[10.5px] flex items-center gap-0.5 hover:underline">
                عرض الدفتر
                <ChevronLeft className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 5. SPLIT SECTION: TOP SELLING PRODUCTS & ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
        
        {/* RIGHT COLUMN (2/3 width): Top Selling Items */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 flex flex-col overflow-hidden shadow-xs">
          <div className="h-11 bg-slate-50 border-b border-slate-100 px-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black text-slate-800">
              <Flame className="w-4 h-4 text-emerald-600" />
              <span>الأصناف الأكثر طلباً ومبيعاً اليوم</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium font-mono">مرتبة تنازلياً حسب الكمية</span>
          </div>

          <div className="p-0 overflow-y-auto flex-1">
            {summary && summary.topSellingProducts && summary.topSellingProducts.length > 0 ? (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 font-bold w-12 text-center">الترتيب</th>
                    <th className="py-2.5 px-4 font-bold">اسم الصنف</th>
                    <th className="py-2.5 px-4 font-bold text-center">الكمية المباعة</th>
                    <th className="py-2.5 px-4 font-bold text-left pl-6">إجمالي الإيراد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.topSellingProducts.map((p, idx) => (
                    <tr key={p.productId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 text-center">
                        {idx === 0 ? (
                          <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 font-black text-[11px] inline-flex items-center justify-center">1</span>
                        ) : idx === 1 ? (
                          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-black text-[11px] inline-flex items-center justify-center">2</span>
                        ) : idx === 2 ? (
                          <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-900 font-black text-[11px] inline-flex items-center justify-center">3</span>
                        ) : (
                          <span className="font-mono text-slate-400">{idx + 1}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{p.productName}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-center text-slate-700">
                        {p.totalQuantity}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-black text-[#006d41] text-left pl-6 text-sm">
                        {(p.totalSalesPiasters / 100).toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">ج.م</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <ShoppingCart className="w-8 h-8 text-slate-300 stroke-1" />
                <span>لا توجد مبيعات مسجلة حتى الآن اليوم</span>
              </div>
            )}
          </div>
        </div>

        {/* LEFT COLUMN (1/3 width): System Alerts & Stock Thresholds */}
        <div className="flex flex-col gap-4">
          
          {/* Prioritized System Alerts */}
          {health && health.alerts && health.alerts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 flex flex-col overflow-hidden shadow-xs">
              <div className="h-10 bg-slate-50 border-b border-slate-100 px-4 flex items-center justify-between text-xs font-bold text-slate-800">
                <span>تنبيهات النظام ({health.alerts.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">مرتبة حسب الأهمية</span>
              </div>
              <div className="p-3 space-y-2.5 max-h-[170px] overflow-y-auto">
                {health.alerts.map((al) => (
                  <div
                    key={al.id}
                    className={`p-3 rounded-xl text-xs border flex items-start justify-between gap-2.5 ${
                      al.level === 'critical'
                        ? 'bg-red-50 text-red-950 border-red-200'
                        : al.level === 'warning'
                        ? 'bg-amber-50 text-amber-950 border-amber-200'
                        : 'bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div>
                      <span className="font-black block leading-tight">{al.title}</span>
                      <span className="text-[11px] opacity-80 leading-normal block mt-1">{al.message}</span>
                    </div>
                    {al.fixAction && al.fixTarget && (
                      <button
                        type="button"
                        onClick={() => handleFixAction(al.fixTarget)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white text-slate-800 border border-slate-300 shadow-xs shrink-0 hover:bg-slate-100 transition-colors"
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
          <div className="bg-white rounded-2xl border border-slate-200/90 flex flex-col overflow-hidden shadow-xs">
            <div className="h-10 bg-slate-50 border-b border-slate-100 px-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-rose-600 font-bold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>تنبيهات النواقص بالمخزن</span>
              </div>
              <button 
                onClick={onNavigateToProducts}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 hover:text-slate-900 text-[11px] font-bold transition-all shadow-2xs border border-slate-200 cursor-pointer active:translate-y-0.5"
              >
                عرض الكل
              </button>
            </div>

            <div className="p-3.5 divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
              {summary && summary.lowStockProducts && summary.lowStockProducts.length > 0 ? (
                summary.lowStockProducts.map((p) => (
                  <div key={p.productId} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{p.productName}</div>
                      <div className="text-[10px] text-slate-400">وحدة البيع: {p.unit === 'kg' ? 'كيلوجرام' : 'قطعة'}</div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                      p.currentStock <= 0 
                        ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {p.currentStock <= 0 ? 'نفد (0)' : `متبقي: ${p.currentStock}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-7 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                  جميع الأصناف بمستويات مخزون آمنة
                </div>
              )}
            </div>
          </div>

          {/* Top Debtors List */}
          <div className="bg-white rounded-2xl border border-slate-200/90 flex flex-col overflow-hidden shadow-xs">
            <div className="h-10 bg-slate-50 border-b border-slate-100 px-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
                <Users className="w-4 h-4 text-emerald-700" />
                <span>أعلى العملاء مديونية (الآجل)</span>
              </div>
              {onNavigateToCustomers && (
                <button 
                  onClick={onNavigateToCustomers}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-[#006d41] text-[11px] font-bold transition-all shadow-2xs border border-emerald-200 cursor-pointer active:translate-y-0.5"
                >
                  كافة العملاء
                </button>
              )}
            </div>

            <div className="p-3.5 divide-y divide-slate-100 max-h-[190px] overflow-y-auto">
              {summary && summary.topDebtors && summary.topDebtors.length > 0 ? (
                summary.topDebtors.map((d) => (
                  <div key={d.customerId} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{d.customerName}</div>
                      {d.customerPhone && (
                        <div className="text-[10px] text-slate-400 font-mono">{d.customerPhone}</div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-rose-600 text-xs">
                      {(d.balancePiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-5 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                  لا توجد ديون مستحقة على العملاء حالياً
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Pilot Readiness Check Modal */}
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
