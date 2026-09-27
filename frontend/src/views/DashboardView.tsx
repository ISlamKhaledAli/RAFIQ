import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
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
  KeyRound,
  Users,
  ChevronLeft,
  Flame,
  Lock,
  Scale,
  Boxes
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DashboardSummary } from '../types/models';
import { ReadinessCheckModal } from '../components/ReadinessCheckModal';
import { LicenseModal } from '../components/LicenseModal';

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
  isAuditLogTampered?: boolean;
  auditLogStatus?: string;
  encryptionStatus?: string;
  deviceFingerprint?: string;
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
  onNavigateToProducts: (subView?: 'catalog' | 'movements') => void;
  onNavigateToSales?: () => void;
  onNavigateToSettings?: (target?: string) => void;
  onNavigateToCustomers?: () => void;
  onNavigateToAudit?: () => void;
}

// Clean helper to parse and format raw ISO backup dates into friendly Arabic
function formatFriendlyBackupDate(raw: string | undefined): string {
  if (!raw || raw === 'لم تؤخذ بعد' || raw === 'لم تؤخذ') return 'لم تؤخذ بعد';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `اليوم ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' });
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
  onNavigateToCustomers,
  onNavigateToAudit
}: DashboardViewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);

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
      setLastRefreshed(now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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
          setLastRefreshed(now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      } catch {
        // Offline fallback
      }
    })();
    return () => { active = false; };
  }, []);

  const handleFixAction = (target?: string | null) => {
    if (!target) return;
    if (target === 'audit' && onNavigateToAudit) {
      onNavigateToAudit();
    } else if (target.startsWith('settings') && onNavigateToSettings) {
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        {/* Top Status Header */}
        <div
          className={`px-5 py-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
            isHealthy
              ? 'bg-gradient-to-r from-emerald-50/60 via-slate-50/30 to-white border-emerald-100'
              : isCritical
              ? 'bg-gradient-to-r from-rose-50/80 via-white to-white border-rose-200'
              : 'bg-gradient-to-r from-amber-50/80 via-white to-white border-amber-200'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                isHealthy
                  ? 'bg-[#004d3e] text-white shadow-emerald-900/10'
                  : isCritical
                  ? 'bg-rose-600 text-white shadow-rose-900/20'
                  : 'bg-amber-500 text-white shadow-amber-900/20'
              }`}
            >
              {isHealthy ? (
                <ShieldCheck className="w-6 h-6 text-emerald-300" />
              ) : isCritical ? (
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  مؤشر سلامة وتشغيل النظام
                </span>
                <span
                  className={`text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs ${
                    isHealthy
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : isCritical
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
                  {isHealthy ? 'سليم وجاهز 100%' : isCritical ? 'تنبيه حرج' : 'يحتاج انتباهك'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">
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
                    ? 'bg-rose-600 hover:bg-rose-700'
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

        {/* 6 Clean Hardware & Security Pulse Cards */}
        <div className="p-4 bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Storage Free Space */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10.5px] font-semibold text-slate-400 block leading-tight">مساحة القرص</span>
                <span className="font-mono font-bold text-slate-900 text-xs truncate block">{health?.metrics?.diskFreeFormatted || '---'}</span>
              </div>
            </div>

            {/* Backup Status */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10.5px] font-semibold text-slate-400 block leading-tight">النسخ الاحتياطي</span>
                <span className="font-bold text-slate-900 text-xs truncate block" title={health?.metrics?.lastBackupFormatted}>
                  {formatFriendlyBackupDate(health?.metrics?.lastBackupFormatted)}
                </span>
              </div>
            </div>

            {/* Printer Detection */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <Printer className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10.5px] font-semibold text-slate-400 block leading-tight">طابعة الفواتير</span>
                <span className="font-bold text-slate-900 text-xs truncate block" title={health?.metrics?.printerName}>
                  {formatCleanPrinterName(health?.metrics?.printerName)}
                </span>
              </div>
            </div>

            {/* Offline Lifetime License */}
            <div 
              onClick={() => setIsLicenseModalOpen(true)}
              className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-emerald-500 hover:shadow-sm cursor-pointer transition-all group"
              title="انقر لإدارة وتفعيل الترخيص السحابي"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10.5px] font-semibold text-slate-400 block leading-tight">حالة الترخيص (انقر للتفعيل)</span>
                <span className="font-bold text-slate-900 text-xs truncate block">
                  {health?.metrics?.licenseStatus || 'ترخيص دائم نشط'}
                </span>
              </div>
            </div>

            {/* Catalog Products Count */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#006d41] flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10.5px] font-semibold text-slate-400 block leading-tight">كتالوج الأصناف</span>
                <span className="font-mono font-bold text-slate-900 text-xs">{health?.metrics?.productsCount || 0} صنف مسجل</span>
              </div>
            </div>

            {/* Cryptographic Protection & Anti-Tamper */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${health?.metrics?.isAuditLogTampered ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10.5px] font-semibold text-slate-400 block leading-tight">حماية البيانات</span>
                <span className={`font-bold text-xs truncate block ${health?.metrics?.isAuditLogTampered ? 'text-rose-600' : 'text-slate-900'}`} title={health?.metrics?.auditLogStatus || 'مشفر وموثق رقمياً'}>
                  {health?.metrics?.isAuditLogTampered ? 'تنبيه تلاعب!' : 'مشفر وموثق'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* 4. FINANCIAL & OPERATIONAL KPI METRICS (6 clean cards with no clipping) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
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
            <span>نقدي: <strong className="text-slate-800 font-mono">{summary ? (summary.todayCashPiasters / 100).toFixed(0) : '0'}</strong></span>
            <span>آجل: <strong className="text-slate-800 font-mono">{summary ? (summary.todayCreditPiasters / 100).toFixed(0) : '0'}</strong></span>
          </div>
        </div>

        {/* KPI 2: Today Net Profit / Loss */}
        {(() => {
          const netProfit = summary?.todayNetProfitsPiasters ?? summary?.todayProfitsPiasters ?? 0;
          const isLoss = netProfit < 0;
          const absNetProfit = Math.abs(netProfit);

          return (
            <div className={`bg-gradient-to-b ${
              isLoss 
                ? 'from-rose-50/70 via-white to-white border-rose-300/80 hover:border-rose-400' 
                : 'from-teal-50/50 via-white to-white border-slate-200/90 hover:border-teal-300'
            } rounded-2xl border p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between min-h-[135px]`}>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className={`font-bold ${isLoss ? 'text-rose-800' : 'text-slate-700'}`}>
                    {isLoss ? 'صافي خسائر اليوم' : 'صافي أرباح اليوم'}
                  </span>
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    isLoss ? 'bg-rose-100 text-rose-700' : 'bg-teal-100/70 text-teal-700'
                  }`}>
                    {isLoss ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-black font-mono tracking-tight ${
                    isLoss ? 'text-rose-600' : 'text-teal-700'
                  }`}>
                    {isLoss ? '-' : ''}{(absNetProfit / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[11px] font-bold ${isLoss ? 'text-rose-400' : 'text-teal-600'}`}>ج.م</span>
                </div>
              </div>
              <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[10.5px] text-slate-500">
                <span className="truncate">
                  {summary && (summary.todayInventoryLossPiasters || 0) > 0
                    ? `مبيعات: ${((summary.todayProfitsPiasters || 0) / 100).toFixed(0)} | عجز: -${((summary.todayInventoryLossPiasters || 0) / 100).toFixed(0)}`
                    : 'صافي بعد التكاليف'}
                </span>
                <span className={`font-bold font-mono text-[10px] px-1.5 py-0.5 rounded ${
                  isLoss ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-teal-50 text-teal-700 border border-teal-200/60'
                }`}>
                  {isLoss ? 'عجز وتالف' : 'فعلي'}
                </span>
              </div>
            </div>
          );
        })()}

        {/* KPI 3: Inventory Loss / Shrinkage */}
        <div 
          onClick={() => onNavigateToProducts('movements')}
          className="bg-gradient-to-b from-amber-50/40 via-white to-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between min-h-[135px] cursor-pointer group"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-bold text-slate-700">عجز وتالف الجرد اليوم</span>
              <div className="w-7 h-7 rounded-xl bg-amber-100/70 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-black font-mono tracking-tight ${
                (summary?.todayInventoryLossPiasters || 0) > 0 ? 'text-amber-700' : 'text-slate-800'
              }`}>
                {summary && summary.todayInventoryLossPiasters != null 
                  ? (summary.todayInventoryLossPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
          </div>
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>التسويات: <strong className="text-slate-800 font-mono">{summary?.todayAdjustmentsCount || 0}</strong></span>
            <span className="text-brand font-bold text-[10.5px] flex items-center gap-0.5 group-hover:underline">
              عرض الحركات
              <ChevronLeft className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Invoices Count */}
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
            <span>متوسط: <strong className="text-slate-800 font-bold font-mono">{summary && summary.todayInvoicesCount > 0 ? ((summary.todaySalesPiasters / summary.todayInvoicesCount) / 100).toFixed(0) : '0'}</strong> ج.م</span>
            <div className="flex items-center gap-1.5 font-bold text-[10px]">
              {summary && (summary.todayCancelledCount || 0) > 0 && (
                <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200" title="فواتير ملغاة اليوم">
                  {summary.todayCancelledCount} ملغاة
                </span>
              )}
              {summary && (summary.todayReturnsCount || 0) > 0 && (
                <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="عمليات مرتجع اليوم">
                  {summary.todayReturnsCount} مرتجع
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 5: Drawer Balance */}
        <div className="bg-gradient-to-b from-emerald-50/40 via-white to-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between min-h-[135px]">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-bold text-slate-700">المبالغ النقدية في الدرج</span>
              <div className="w-7 h-7 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                {summary ? (summary.cashDrawerPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-slate-400">ج.م</span>
            </div>
          </div>
          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>نقدية: <strong className="text-slate-800 font-mono">{summary ? (summary.todayCashPiasters / 100).toFixed(0) : '0'}</strong></span>
            {summary && (summary.todayReturnsPiasters || 0) > 0 && (
              <span className="text-amber-700 font-bold font-mono text-[10px]" title="مخصوم مبالغ مرتجعات نقدية">
                -{((summary.todayReturnsPiasters || 0) / 100).toFixed(0)} مرتجع
              </span>
            )}
            {summary && (summary.todayDebtPaymentsPiasters || 0) > 0 && (
              <span className="text-emerald-700 font-bold font-mono text-[10px]">
                +{((summary.todayDebtPaymentsPiasters || 0) / 100).toFixed(0)} سداد
              </span>
            )}
          </div>
        </div>

        {/* KPI 6: Customer Debts */}
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

      {/* 5. SPLIT SECTION: TOP SELLING & INVENTORY ADJUSTMENTS + ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
        
        {/* RIGHT COLUMN (2/3 width): Top Selling Items + Today's Inventory Adjustments */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          
          {/* 5A. Top Selling Products */}
          <div className="bg-white rounded-2xl border border-slate-200/90 flex flex-col overflow-hidden shadow-xs">
            <div className="h-11 bg-slate-50 border-b border-slate-100 px-5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                <Flame className="w-4 h-4 text-emerald-600" />
                <span>الأصناف الأكثر طلباً ومبيعاً اليوم</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium font-mono">مرتبة تنازلياً حسب الكمية</span>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
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
                <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                  <ShoppingCart className="w-8 h-8 text-slate-300 stroke-1" />
                  <span>لا توجد مبيعات مسجلة حتى الآن اليوم</span>
                </div>
              )}
            </div>
          </div>

          {/* 5B. Today's Inventory Adjustments & Shrinkage Section */}
          <div className="bg-white rounded-2xl border border-slate-200/90 flex flex-col overflow-hidden shadow-xs">
            <div className="h-11 bg-slate-50 border-b border-slate-100 px-5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                <Scale className="w-4 h-4 text-amber-600" />
                <span>تسويات وعجز وتوالف المخزون اليوم</span>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200 font-mono">
                  {summary?.recentAdjustments?.length || 0} حركة مسجلة
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToProducts('movements')}
                className="px-3 py-1 rounded-lg bg-surface hover:bg-slate-100 text-brand text-[11px] font-bold flex items-center gap-1 border border-slate-200 shadow-2xs transition-colors"
              >
                <Boxes className="w-3.5 h-3.5 text-brand" />
                <span>دفتر حركات المخزون بالكامل</span>
                <ChevronLeft className="w-3 h-3" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
              {summary && summary.recentAdjustments && summary.recentAdjustments.length > 0 ? (
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">اسم الصنف</th>
                      <th className="py-2.5 px-4 font-bold text-center">فرق الرصيد</th>
                      <th className="py-2.5 px-4 font-bold text-center">تكلفة الوحدة</th>
                      <th className="py-2.5 px-4 font-bold text-left pl-6">الأثر المالي</th>
                      <th className="py-2.5 px-4 font-bold">السبب الموثق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.recentAdjustments.map((adj, idx) => {
                      const isNegative = adj.quantityDeltaMilli < 0;
                      const isPositive = adj.quantityDeltaMilli > 0;

                      return (
                        <tr key={`${adj.productId}_${idx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-4 font-bold text-slate-900">{adj.productName}</td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded text-[11px] border ${
                              isNegative 
                                ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                : isPositive 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {adj.quantityDeltaFormatted}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono text-slate-600">
                            {(adj.unitCostPiasters / 100).toFixed(2)} ج.م
                          </td>
                          <td className="py-2.5 px-4 text-left pl-6 font-mono font-black text-sm">
                            <span className={isNegative ? 'text-rose-600' : isPositive ? 'text-emerald-700' : 'text-slate-600'}>
                              {isNegative ? '-' : isPositive ? '+' : ''}{(Math.abs(adj.financialImpactPiasters) / 100).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal mr-1">ج.م</span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 text-[11.5px]">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[11px]">
                              {adj.reason || 'تسوية جردية'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-10 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  <span className="font-bold text-slate-700">لم يتم تسجيل أي عجز أو تالف بالمخزن اليوم</span>
                  <span className="text-[11px] text-slate-400">كافة الأرصدة مطابقة بدون فروق جردية</span>
                </div>
              )}
            </div>
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
                onClick={() => onNavigateToProducts()}
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

      {/* Cloudflare License Management Modal */}
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
        onLicenseUpdated={loadData}
      />
    </div>
  );
}
