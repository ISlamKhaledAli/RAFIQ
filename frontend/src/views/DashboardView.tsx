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
  Boxes,
  FileText
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { DashboardSummary, UnclosedDayAlert } from '../types/models';
import { ReadinessCheckModal } from '../components/ReadinessCheckModal';
import { LicenseModal } from '../components/LicenseModal';
import { DailyClosingModal } from '../components/DailyClosingModal';
import { LowStockReportModal } from '../components/LowStockReportModal';
import { DebtorsReportModal } from '../components/DebtorsReportModal';
import { PeriodSalesReportModal } from '../components/PeriodSalesReportModal';
import { formatArabicCurrency } from '../utils/money';

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
  onNavigateToProducts: (subView?: 'catalog' | 'movements', filter?: 'all' | 'lowStock' | 'outOfStock') => void;
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
  const [unclosedAlert, setUnclosedAlert] = useState<UnclosedDayAlert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isReadinessModalOpen, setIsReadinessModalOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);

  // Milestone 9 Modals State
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingTargetDate, setClosingTargetDate] = useState<string | undefined>(undefined);
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
  const [isDebtorsModalOpen, setIsDebtorsModalOpen] = useState(false);
  const [isPeriodSalesModalOpen, setIsPeriodSalesModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sumData, healthData, unclosedData] = await Promise.all([
        invoke<DashboardSummary>('reports:getTodaySummary'),
        invoke<SystemHealthData>('health:getStatus'),
        invoke<UnclosedDayAlert>('closing:checkPreviousDay')
      ]);
      if (sumData) setSummary(sumData);
      if (healthData) setHealth(healthData);
      if (unclosedData) setUnclosedAlert(unclosedData);
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
        const [sumData, healthData, unclosedData] = await Promise.all([
          invoke<DashboardSummary>('reports:getTodaySummary'),
          invoke<SystemHealthData>('health:getStatus'),
          invoke<UnclosedDayAlert>('closing:checkPreviousDay')
        ]);
        if (active) {
          if (sumData) setSummary(sumData);
          if (healthData) setHealth(healthData);
          if (unclosedData) setUnclosedAlert(unclosedData);
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
    <div className="flex flex-col h-full w-full bg-[#F3F5F2] select-none overflow-y-auto p-5 gap-4 font-sans text-[#14181A]" dir="rtl">
      
      {/* 1. TOP HEADER & COMMAND CENTER CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-white p-3.5 rounded-lg border border-[#DCE1DC] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-[#14181A]">لوحة اليوم</h2>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#F7F8F6] border border-[#DCE1DC] text-[11px] font-medium text-[#14181A]">
              <span className="w-2 h-2 rounded-full bg-[#006d41] animate-pulse" />
              <span>يعمل بدون إنترنت (محلي)</span>
            </div>
          </div>
          <p className="text-xs text-[#5B6664] mt-0.5">
            موجز العمليات والنشاط التشغيلي، المبيعات اللحظية، ومؤشرات سلامة النظام
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-[#5B6664] bg-[#F7F8F6] px-3 py-1.5 rounded-lg border border-[#DCE1DC]">
            <Clock className="w-3.5 h-3.5 text-[#5B6664]" />
            <span className="text-[11px] text-[#5B6664]">آخر تحديث:</span>
            <span className="font-mono text-[#14181A] font-bold text-xs tabular-nums">{lastRefreshed || '---'}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsReadinessModalOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 bg-white hover:bg-[#F7F8F6] text-[#0B4F42] border border-[#DCE1DC] rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
          >
            <ClipboardCheck className="w-4 h-4 text-[#006d41]" />
            <span>فحص الجاهزية</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setClosingTargetDate(undefined);
              setIsClosingModalOpen(true);
            }}
            className="flex items-center gap-1.5 h-9 px-3 bg-white hover:bg-[#F7F8F6] text-[#0B4F42] border border-[#DCE1DC] rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إقفال اليومية ومطابقة النقدية (Z-Report)"
          >
            <Lock className="w-4 h-4 text-[#006d41]" />
            <span>قفل اليومية (Z)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPeriodSalesModalOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 bg-white hover:bg-[#F7F8F6] text-[#0B4F42] border border-[#DCE1DC] rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="تقرير المبيعات والربح الدوري"
          >
            <FileText className="w-4 h-4 text-[#006d41]" />
            <span>التقارير والأرباح</span>
          </button>

          <button
            onClick={() => void loadData()}
            disabled={isLoading}
            className="flex items-center gap-1.5 h-9 px-3 bg-white border border-[#DCE1DC] hover:bg-[#F7F8F6] rounded-lg text-xs font-bold text-[#14181A] transition-colors shadow-2xs disabled:opacity-50 cursor-pointer active:translate-y-0.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#006d41]' : 'text-[#5B6664]'}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToPos}
            className="flex items-center gap-2 h-9 px-4 bg-[#0B4F42] hover:bg-[#0F6A57] active:bg-[#00372d] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:translate-y-0.5"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>فتح شاشة البيع</span>
            <span className="text-[10px] font-mono bg-[#083B32] text-[#96D3C1] px-1.5 py-0.5 rounded border border-[#0d5043]">F2</span>
          </button>
        </div>
      </div>

      {/* Unclosed Previous Business Day Warning Alert Banner (Story 87 / Task 49-5) */}
      {unclosedAlert && unclosedAlert.hasUnclosedDay && (
        <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink shadow-xs shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-[#14181A]">
                  تنبيه إقفال اليومية: يوم العمل السابق ({unclosedAlert.unclosedDate}) لم يُقفل بعد!
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                  مطلوب الإقفال
                </span>
              </div>
              <p className="text-xs text-[#5B6664] mt-0.5">
                يوجد <strong>{unclosedAlert.unclosedSalesCount}</strong> فاتورة بإجمالي <strong>{formatArabicCurrency(unclosedAlert.unclosedSalesTotalPiasters)}</strong> لم يتم ترحيلها في تقرير إقفال رسمي. يرجى تصفية الوردية السابقة لضمان صحة دفاتر المحل.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setClosingTargetDate(unclosedAlert.unclosedDate);
              setIsClosingModalOpen(true);
            }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-xs shrink-0 cursor-pointer active:translate-y-0.5 flex items-center gap-1.5 justify-center"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>إقفال يومية {unclosedAlert.unclosedDate} الآن</span>
          </button>
        </div>
      )}

      {/* 2. EXECUTIVE SYSTEM HEALTH & HARDWARE STATUS STRIP */}
      <div className="bg-white rounded-lg border border-[#DCE1DC] shadow-2xs overflow-hidden transition-all shrink-0">
        {/* Top Status Header */}
        <div
          className={`px-4 py-3 border-b flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
            isHealthy
              ? 'bg-[#F7FAF9] border-[#DCE1DC]'
              : isCritical
              ? 'bg-[#FDF3F2] border-[#F6CBC6]'
              : 'bg-[#FEF7EC] border-[#F5DEB4]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
                isHealthy
                  ? 'bg-[#00372d] text-white'
                  : isCritical
                  ? 'bg-[#B23A2E] text-white'
                  : 'bg-[#B3720E] text-white'
              }`}
            >
              {isHealthy ? (
                <ShieldCheck className="w-5 h-5 text-[#80d9a3]" />
              ) : isCritical ? (
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#5B6664]">
                  مؤشر سلامة وتشغيل النظام
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border ${
                    isHealthy
                      ? 'bg-[#E1EAE5] text-[#0B4F42] border-[#83bfaf]'
                      : isCritical
                      ? 'bg-[#FDF3F2] text-[#B23A2E] border-[#F6CBC6]'
                      : 'bg-[#FEF7EC] text-[#B3720E] border-[#F5DEB4]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-[#006d41] animate-pulse' : 'bg-[#B23A2E]'}`} />
                  {isHealthy ? 'سليم وجاهز 100%' : isCritical ? 'تنبيه حرج' : 'يحتاج انتباهك'}
                </span>
              </div>
              <h3 className="text-xs font-bold text-[#14181A] leading-snug">
                {health?.oneSentenceSummary || 'النظام جاهز تماماً لتسجيل المبيعات • قاعدة البيانات مؤمنة ومستقرة بنسبة 100%'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {health?.primaryIssueFixAction && health.primaryIssueFixTarget && (
              <button
                type="button"
                onClick={() => handleFixAction(health.primaryIssueFixTarget)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition-all cursor-pointer ${
                  isCritical
                    ? 'bg-[#B23A2E] hover:bg-[#93000a]'
                    : 'bg-[#B3720E] hover:bg-[#663e00]'
                }`}
              >
                {health.primaryIssueFixAction}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsReadinessModalOpen(true)}
              className="px-3 py-1.5 bg-white hover:bg-[#F7F8F6] border border-[#DCE1DC] rounded-lg text-xs font-bold text-[#14181A] transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            >
              فحص التفاصيل
            </button>
          </div>
        </div>

        {/* 6 Clean Hardware & Security Pulse Cards */}
        <div className="p-3 bg-[#F7F8F6]">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Storage Free Space */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-[#DCE1DC] shadow-2xs hover:border-[#83bfaf] transition-all">
              <div className="w-7 h-7 rounded bg-[#F7F8F6] text-[#5B6664] flex items-center justify-center shrink-0">
                <HardDrive className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-[#5B6664] block leading-tight">مساحة القرص</span>
                <span className="font-mono font-bold text-[#14181A] text-xs truncate block tabular-nums">{health?.metrics?.diskFreeFormatted || '---'}</span>
              </div>
            </div>

            {/* Backup Status */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-[#DCE1DC] shadow-2xs hover:border-[#83bfaf] transition-all">
              <div className="w-7 h-7 rounded bg-[#E1EAE5] text-[#0B4F42] flex items-center justify-center shrink-0">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-[#5B6664] block leading-tight">النسخ الاحتياطي</span>
                <span className="font-bold text-[#14181A] text-xs truncate block" title={health?.metrics?.lastBackupFormatted}>
                  {formatFriendlyBackupDate(health?.metrics?.lastBackupFormatted)}
                </span>
              </div>
            </div>

            {/* Printer Detection */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-[#DCE1DC] shadow-2xs hover:border-[#83bfaf] transition-all">
              <div className="w-7 h-7 rounded bg-[#E1EAE5] text-[#0B4F42] flex items-center justify-center shrink-0">
                <Printer className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-[#5B6664] block leading-tight">طابعة الفواتير</span>
                <span className="font-bold text-[#14181A] text-xs truncate block" title={health?.metrics?.printerName}>
                  {formatCleanPrinterName(health?.metrics?.printerName)}
                </span>
              </div>
            </div>

            {/* Offline Lifetime License */}
            <div 
              onClick={() => setIsLicenseModalOpen(true)}
              className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-[#DCE1DC] shadow-2xs hover:border-[#006d41] cursor-pointer transition-all group"
              title="انقر لإدارة وتفعيل الترخيص السحابي"
            >
              <div className="w-7 h-7 rounded bg-[#E1EAE5] text-[#0B4F42] flex items-center justify-center shrink-0 group-hover:bg-[#0B4F42] group-hover:text-white transition-colors">
                <KeyRound className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-[#5B6664] block leading-tight">حالة الترخيص (انقر)</span>
                <span className="font-bold text-[#14181A] text-xs truncate block">
                  {health?.metrics?.licenseStatus || 'ترخيص دائم نشط'}
                </span>
              </div>
            </div>

            {/* Catalog Products Count */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-[#DCE1DC] shadow-2xs hover:border-[#83bfaf] transition-all">
              <div className="w-7 h-7 rounded bg-[#E1EAE5] text-[#006d41] flex items-center justify-center shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-[#5B6664] block leading-tight">كتالوج الأصناف</span>
                <span className="font-mono font-bold text-[#14181A] text-xs tabular-nums">{health?.metrics?.productsCount || 0} صنف</span>
              </div>
            </div>

            {/* Cryptographic Protection & Anti-Tamper */}
            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-[#DCE1DC] shadow-2xs hover:border-[#83bfaf] transition-all">
              <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${health?.metrics?.isAuditLogTampered ? 'bg-[#FDF3F2] text-[#B23A2E]' : 'bg-[#E1EAE5] text-[#0B4F42]'}`}>
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-[#5B6664] block leading-tight">حماية البيانات</span>
                <span className={`font-bold text-xs truncate block ${health?.metrics?.isAuditLogTampered ? 'text-[#B23A2E]' : 'text-[#14181A]'}`} title={health?.metrics?.auditLogStatus || 'مشفر وموثق رقمياً'}>
                  {health?.metrics?.isAuditLogTampered ? 'تنبيه تلاعب!' : 'مشفر وموثق'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. FINANCIAL & OPERATIONAL KPI METRICS (6 clean cards with no clipping) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 shrink-0">
        {/* KPI 1: Today Sales */}
        <div className="bg-white rounded-2xl border border-[#dce1dc] p-3.5 shadow-2xs hover:border-[#006d41] hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[125px]">
          <div>
            <div className="flex items-center justify-between text-xs text-[#52605d] mb-1.5">
              <span className="font-bold text-[#0f172a]">مبيعات اليوم</span>
              <div className="w-7 h-7 rounded-xl bg-[#eaf5ee] text-[#006d41] border border-[#c4e3d0] flex items-center justify-center shadow-2xs">
                <ShoppingCart className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-[#0f172a] tabular-nums leading-none">
                {summary ? (summary.todaySalesPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-[#52605d]">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-[#dce1dc]/60 flex items-center justify-between text-[10.5px] text-[#52605d]">
            <span>نقدي: <strong className="text-[#0f172a] font-mono tabular-nums">{summary ? (summary.todayCashPiasters / 100).toFixed(0) : '0'}</strong></span>
            <span>آجل: <strong className="text-[#0f172a] font-mono tabular-nums">{summary ? (summary.todayCreditPiasters / 100).toFixed(0) : '0'}</strong></span>
          </div>
        </div>

        {/* KPI 2: Today Net Profit / Loss */}
        {(() => {
          const netProfit = summary?.todayNetProfitsPiasters ?? summary?.todayProfitsPiasters ?? 0;
          const isLoss = netProfit < 0;
          const absNetProfit = Math.abs(netProfit);

          return (
            <div className={`bg-white rounded-2xl border ${
              isLoss ? 'border-[#f6cbc6] hover:border-[#b23a2e]' : 'border-[#dce1dc] hover:border-[#006d41]'
            } p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[125px]`}>
              <div>
                <div className="flex items-center justify-between text-xs text-[#52605d] mb-1.5">
                  <span className={`font-bold ${isLoss ? 'text-[#b23a2e]' : 'text-[#0f172a]'}`}>
                    {isLoss ? 'صافي خسائر اليوم' : 'صافي أرباح اليوم'}
                  </span>
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center shadow-2xs border ${
                    isLoss ? 'bg-[#fdf3f2] text-[#b23a2e] border-[#f6cbc6]' : 'bg-[#eaf5ee] text-[#006d41] border-[#c4e3d0]'
                  }`}>
                    {isLoss ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-black font-mono tabular-nums leading-none ${
                    isLoss ? 'text-[#b23a2e]' : 'text-[#006d41]'
                  }`}>
                    {isLoss ? '-' : ''}{(absNetProfit / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[11px] font-bold ${isLoss ? 'text-[#b23a2e]' : 'text-[#52605d]'}`}>ج.م</span>
                </div>
              </div>
              <div className="pt-2 mt-2 border-t border-[#dce1dc]/60 flex items-center justify-between text-[10.5px] text-[#52605d]">
                <span className="truncate">
                  {summary && (summary.todayInventoryLossPiasters || 0) > 0
                    ? `مبيعات: ${((summary.todayProfitsPiasters || 0) / 100).toFixed(0)} | عجز: -${((summary.todayInventoryLossPiasters || 0) / 100).toFixed(0)}`
                    : 'صافي بعد التكاليف'}
                </span>
                <span className={`font-bold font-mono text-[9.5px] px-1.5 py-0.2 rounded-md border ${
                  isLoss ? 'bg-[#fdf3f2] text-[#b23a2e] border-[#f6cbc6]' : 'bg-[#eaf5ee] text-[#006d41] border-[#c4e3d0]'
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
          className="bg-white rounded-2xl border border-[#dce1dc] p-3.5 shadow-2xs hover:border-amber-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[125px] cursor-pointer group"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#52605d] mb-1.5">
              <span className="font-bold text-[#0f172a]">عجز وتالف الجرد اليوم</span>
              <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
                <Scale className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-black font-mono tabular-nums leading-none ${
                (summary?.todayInventoryLossPiasters || 0) > 0 ? 'text-[#b3720e]' : 'text-[#0f172a]'
              }`}>
                {summary && summary.todayInventoryLossPiasters != null 
                  ? (summary.todayInventoryLossPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-[#52605d]">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-[#dce1dc]/60 flex items-center justify-between text-[10.5px] text-[#52605d]">
            <span>التسويات: <strong className="text-[#0f172a] font-mono tabular-nums">{summary?.todayAdjustmentsCount || 0}</strong></span>
            <span className="text-[#006d41] font-bold text-[10.5px] flex items-center gap-0.5 group-hover:underline">
              عرض الحركات
              <ChevronLeft className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Invoices Count */}
        <div className="bg-white rounded-2xl border border-[#dce1dc] p-3.5 shadow-2xs hover:border-[#006d41] hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[125px]">
          <div>
            <div className="flex items-center justify-between text-xs text-[#52605d] mb-1.5">
              <span className="font-bold text-[#0f172a]">فواتير الكاشير اليوم</span>
              <div className="w-7 h-7 rounded-xl bg-[#eaf5ee] text-[#006d41] border border-[#c4e3d0] flex items-center justify-center shadow-2xs">
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-[#0f172a] tabular-nums leading-none">
                {summary ? summary.todayInvoicesCount : '0'}
              </span>
              <span className="text-[11px] font-bold text-[#52605d]">فاتورة</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-[#dce1dc]/60 flex items-center justify-between text-[10.5px] text-[#52605d]">
            <span>متوسط: <strong className="text-[#0f172a] font-bold font-mono tabular-nums">{summary && summary.todayInvoicesCount > 0 ? ((summary.todaySalesPiasters / summary.todayInvoicesCount) / 100).toFixed(0) : '0'}</strong> ج.م</span>
            <div className="flex items-center gap-1.5 font-bold text-[9.5px]">
              {summary && (summary.todayCancelledCount || 0) > 0 && (
                <span className="text-[#b23a2e] bg-[#fdf3f2] px-1.5 py-0.2 rounded-md border border-[#f6cbc6]" title="فواتير ملغاة اليوم">
                  {summary.todayCancelledCount} ملغاة
                </span>
              )}
              {summary && (summary.todayReturnsCount || 0) > 0 && (
                <span className="text-[#b3720e] bg-amber-50 px-1.5 py-0.2 rounded-md border border-amber-200" title="عمليات مرتجع اليوم">
                  {summary.todayReturnsCount} مرتجع
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 5: Drawer Balance */}
        <div className="bg-white rounded-2xl border border-[#dce1dc] p-3.5 shadow-2xs hover:border-[#006d41] hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[125px]">
          <div>
            <div className="flex items-center justify-between text-xs text-[#52605d] mb-1.5">
              <span className="font-bold text-[#0f172a]">نقدي في الدرج</span>
              <div className="w-7 h-7 rounded-xl bg-[#eaf5ee] text-[#006d41] border border-[#c4e3d0] flex items-center justify-center shadow-2xs">
                <Wallet className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-[#0f172a] tabular-nums leading-none">
                {summary ? (summary.cashDrawerPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-[#52605d]">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-[#dce1dc]/60 flex items-center justify-between text-[10.5px] text-[#52605d]">
            <span>نقدية: <strong className="text-[#0f172a] font-mono tabular-nums">{summary ? (summary.todayCashPiasters / 100).toFixed(0) : '0'}</strong></span>
            {summary && (summary.todayReturnsPiasters || 0) > 0 && (
              <span className="text-amber-800 font-bold font-mono text-[9.5px]" title="مخصوم مبالغ مرتجعات نقدية">
                -{((summary.todayReturnsPiasters || 0) / 100).toFixed(0)} مرتجع
              </span>
            )}
            {summary && (summary.todayDebtPaymentsPiasters || 0) > 0 && (
              <span className="text-[#006d41] font-bold font-mono text-[9.5px]">
                +{((summary.todayDebtPaymentsPiasters || 0) / 100).toFixed(0)} سداد
              </span>
            )}
          </div>
        </div>

        {/* KPI 6: Customer Debts */}
        <div 
          onClick={onNavigateToCustomers}
          className={`bg-white rounded-2xl border border-[#dce1dc] p-3.5 shadow-2xs hover:border-rose-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[125px] ${onNavigateToCustomers ? 'cursor-pointer' : ''}`}
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#52605d] mb-1.5">
              <span className="font-bold text-[#0f172a]">ديون العملاء (الآجل)</span>
              <div className="w-7 h-7 rounded-xl bg-rose-50 text-[#b23a2e] border border-rose-200 flex items-center justify-center shadow-2xs">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-[#b23a2e] tabular-nums leading-none">
                {summary && summary.totalCustomerDebtsPiasters != null 
                  ? (summary.totalCustomerDebtsPiasters / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                  : '0.00'}
              </span>
              <span className="text-[11px] font-bold text-[#52605d]">ج.م</span>
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-[#dce1dc]/60 flex items-center justify-between text-[10.5px] text-[#52605d]">
            <span>المدينون: <strong className="text-[#b23a2e] font-mono tabular-nums">{summary?.debtorsCount || 0}</strong></span>
            {onNavigateToCustomers && (
              <span className="text-[#006d41] font-bold text-[10.5px] flex items-center gap-0.5 hover:underline">
                عرض الدفتر
                <ChevronLeft className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. SPLIT SECTION: TOP SELLING & INVENTORY ADJUSTMENTS + ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0 pb-6">
        
        {/* RIGHT COLUMN (2/3 width): Top Selling Items + Today's Inventory Adjustments */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          
          {/* 4A. Top Selling Products */}
          <div className="bg-white rounded-lg border border-[#DCE1DC] flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-[#F7F8F6] border-b border-[#DCE1DC] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-[#14181A]">
                <Flame className="w-4 h-4 text-[#006d41]" />
                <span>الأصناف الأكثر طلباً ومبيعاً اليوم</span>
              </div>
              <span className="text-[10.5px] text-[#5B6664] font-medium font-mono">مرتبة تنازلياً حسب الكمية</span>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
              {summary && summary.topSellingProducts && summary.topSellingProducts.length > 0 ? (
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#F7F8F6] text-[#5B6664] border-b border-[#DCE1DC] text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium w-12 text-center">الترتيب</th>
                      <th className="py-2 px-3 font-medium">اسم الصنف</th>
                      <th className="py-2 px-3 font-medium text-center">الكمية المباعة</th>
                      <th className="py-2 px-3 font-medium text-left pl-5">إجمالي الإيراد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE1DC]">
                    {summary.topSellingProducts.map((p, idx) => (
                      <tr key={p.productId} className="hover:bg-[#F7F8F6] transition-colors">
                        <td className="py-2 px-3 text-center">
                          {idx === 0 ? (
                            <span className="w-5 h-5 rounded-full bg-[#FEF7EC] text-[#B3720E] font-bold text-[10px] inline-flex items-center justify-center border border-[#F5DEB4]">1</span>
                          ) : idx === 1 ? (
                            <span className="w-5 h-5 rounded-full bg-[#F7F8F6] text-[#14181A] font-bold text-[10px] inline-flex items-center justify-center border border-[#DCE1DC]">2</span>
                          ) : idx === 2 ? (
                            <span className="w-5 h-5 rounded-full bg-[#FEF7EC] text-[#B3720E] font-bold text-[10px] inline-flex items-center justify-center border border-[#F5DEB4]">3</span>
                          ) : (
                            <span className="font-mono text-[#5B6664] text-[11px] tabular-nums">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-[#14181A]">{p.productName}</td>
                        <td className="py-2 px-3 font-mono font-bold text-center text-[#14181A] tabular-nums">
                          {p.totalQuantity}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-[#006d41] text-left pl-5 text-sm tabular-nums">
                          {(p.totalSalesPiasters / 100).toFixed(2)} <span className="text-[10px] text-[#5B6664] font-normal">ج.م</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-10 text-center text-[#5B6664] text-xs flex flex-col items-center justify-center gap-1.5">
                  <ShoppingCart className="w-7 h-7 text-[#DCE1DC] stroke-1" />
                  <span>لا توجد مبيعات مسجلة حتى الآن اليوم</span>
                </div>
              )}
            </div>
          </div>

          {/* 4B. Today's Inventory Adjustments & Shrinkage Section */}
          <div className="bg-white rounded-lg border border-[#DCE1DC] flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-[#F7F8F6] border-b border-[#DCE1DC] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-[#14181A]">
                <Scale className="w-4 h-4 text-[#B3720E]" />
                <span>تسويات وعجز وتوالف المخزون اليوم</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#FEF7EC] text-[#B3720E] border border-[#F5DEB4] font-mono tabular-nums">
                  {summary?.recentAdjustments?.length || 0} حركة
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToProducts('movements')}
                className="px-2.5 py-0.5 rounded bg-white hover:bg-[#F7F8F6] text-[#0B4F42] text-[10.5px] font-bold flex items-center gap-1 border border-[#DCE1DC] shadow-2xs transition-colors cursor-pointer"
              >
                <Boxes className="w-3 h-3 text-[#0B4F42]" />
                <span>دفتر حركات المخزون</span>
                <ChevronLeft className="w-3 h-3" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto max-h-[260px]">
              {summary && summary.recentAdjustments && summary.recentAdjustments.length > 0 ? (
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#F7F8F6] text-[#5B6664] border-b border-[#DCE1DC] text-[11px]">
                    <tr>
                      <th className="py-2 px-3 font-medium">اسم الصنف</th>
                      <th className="py-2 px-3 font-medium text-center">فرق الرصيد</th>
                      <th className="py-2 px-3 font-medium text-center">تكلفة الوحدة</th>
                      <th className="py-2 px-3 font-medium text-left pl-5">الأثر المالي</th>
                      <th className="py-2 px-3 font-medium">السبب الموثق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE1DC]">
                    {summary.recentAdjustments.map((adj, idx) => {
                      const isNegative = adj.quantityDeltaMilli < 0;
                      const isPositive = adj.quantityDeltaMilli > 0;

                      return (
                        <tr key={`${adj.productId}_${idx}`} className="hover:bg-[#F7F8F6] transition-colors">
                          <td className="py-2 px-3 font-bold text-[#14181A]">{adj.productName}</td>
                          <td className="py-2 px-3 text-center font-mono font-bold tabular-nums">
                            <span className={`px-2 py-0.2 rounded text-[10.5px] border ${
                              isNegative 
                                ? 'bg-[#FDF3F2] text-[#B23A2E] border-[#F6CBC6]' 
                                : isPositive 
                                ? 'bg-[#E1EAE5] text-[#006d41] border-[#83bfaf]' 
                                : 'bg-[#F7F8F6] text-[#5B6664] border-[#DCE1DC]'
                            }`}>
                              {adj.quantityDeltaFormatted}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[#5B6664] tabular-nums">
                            {(adj.unitCostPiasters / 100).toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-left pl-5 font-mono font-bold text-sm tabular-nums">
                            <span className={isNegative ? 'text-[#B23A2E]' : isPositive ? 'text-[#006d41]' : 'text-[#5B6664]'}>
                              {isNegative ? '-' : isPositive ? '+' : ''}{(Math.abs(adj.financialImpactPiasters) / 100).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-[#5B6664] font-normal mr-1">ج.م</span>
                          </td>
                          <td className="py-2 px-3 text-[#14181A] text-[11px]">
                            <span className="px-1.5 py-0.2 rounded bg-[#F7F8F6] border border-[#DCE1DC] text-[#5B6664]">
                              {adj.reason || 'تسوية جردية'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center text-[#5B6664] text-xs flex flex-col items-center justify-center gap-1">
                  <CheckCircle2 className="w-6 h-6 text-[#006d41]" />
                  <span className="font-bold text-[#14181A]">لم يتم تسجيل أي عجز أو تالف بالمخزن اليوم</span>
                  <span className="text-[11px] text-[#5B6664]">كافة الأرصدة مطابقة بدون فروق جردية</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* LEFT COLUMN (1/3 width): System Alerts & Stock Thresholds */}
        <div className="flex flex-col gap-4">
          
          {/* Prioritized System Alerts */}
          {health && health.alerts && health.alerts.length > 0 && (
            <div className="bg-white rounded-lg border border-[#DCE1DC] flex flex-col overflow-hidden shadow-2xs">
              <div className="h-10 bg-[#F7F8F6] border-b border-[#DCE1DC] px-4 flex items-center justify-between text-xs font-bold text-[#14181A] shrink-0">
                <span>تنبيهات النظام ({health.alerts.length})</span>
                <span className="text-[10px] text-[#5B6664] font-normal">مرتبة حسب الأهمية</span>
              </div>
              <div className="p-3 space-y-2 max-h-[170px] overflow-y-auto">
                {health.alerts.map((al) => (
                  <div
                    key={al.id}
                    className={`p-2.5 rounded-lg text-xs border flex items-start justify-between gap-2 ${
                      al.level === 'critical'
                        ? 'bg-[#FDF3F2] text-[#B23A2E] border-[#F6CBC6]'
                        : al.level === 'warning'
                        ? 'bg-[#FEF7EC] text-[#B3720E] border-[#F5DEB4]'
                        : 'bg-[#F7F8F6] text-[#14181A] border-[#DCE1DC]'
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
                        className="px-2 py-1 rounded text-[10px] font-bold bg-white text-[#14181A] border border-[#DCE1DC] shadow-2xs shrink-0 hover:bg-[#F7F8F6] transition-colors cursor-pointer"
                      >
                        {al.fixAction}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low Stock Alerts (Story 79 / Task 36-2) */}
          <div className="bg-white rounded-lg border border-[#DCE1DC] flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-[#F7F8F6] border-b border-[#DCE1DC] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-[#B23A2E] font-bold text-xs">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                <span>تنبيهات النواقص بالمخزن</span>
                {summary && (summary.lowStockCount ?? summary.lowStockProducts?.length) > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-[#FDF3F2] text-[#B23A2E] text-[10px] font-mono font-bold border border-[#F6CBC6]">
                    {summary.lowStockCount ?? summary.lowStockProducts.length} صنف
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setIsLowStockModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-brand text-white hover:bg-brand-dark text-[10.5px] font-bold transition-all shadow-2xs cursor-pointer"
                  title="أمر شراء النواقص"
                >
                  أمر الشراء
                </button>
                <button 
                  onClick={() => onNavigateToProducts('catalog', 'lowStock')}
                  className="px-2 py-0.5 rounded bg-white hover:bg-[#F7F8F6] text-[#14181A] text-[10.5px] font-bold transition-all shadow-2xs border border-[#DCE1DC] cursor-pointer"
                >
                  عرض الكل
                </button>
              </div>
            </div>

            <div className="p-3 divide-y divide-[#DCE1DC] max-h-[220px] overflow-y-auto">
              {summary && summary.lowStockProducts && summary.lowStockProducts.length > 0 ? (
                summary.lowStockProducts.map((p) => (
                  <div 
                    key={p.productId} 
                    onClick={() => onNavigateToProducts('catalog', 'lowStock')}
                    className="py-2 flex items-center justify-between gap-3 text-xs hover:bg-[#F7F8F6] -mx-1 px-1 rounded transition-colors cursor-pointer"
                    title="انقر لفتح الصنف في إدارة المخزن"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#14181A] truncate whitespace-nowrap" title={p.productName}>{p.productName}</div>
                      <div className="text-[10px] text-[#5B6664] whitespace-nowrap flex items-center gap-1.5 mt-0.5">
                        <span>وحدة: {p.unit === 'kg' ? 'كيلوجرام' : 'قطعة'}</span>
                        <span className="text-[#DCE1DC]">•</span>
                        <span>حد الطلب: {p.minStock ?? 5}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10.5px] font-mono font-bold tabular-nums whitespace-nowrap border ${
                      p.currentStock <= 0 
                        ? 'bg-[#FDF3F2] text-[#B23A2E] border-[#F6CBC6]' 
                        : 'bg-[#FEF7EC] text-[#B3720E] border-[#F5DEB4]'
                    }`}>
                      {p.currentStock <= 0 ? 'نافد (0)' : `متبقي: ${p.currentStock}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-[#5B6664] text-xs">
                  <CheckCircle2 className="w-5 h-5 text-[#006d41] mx-auto mb-1" />
                  جميع الأصناف بمستويات مخزون آمنة
                </div>
              )}
            </div>
          </div>

          {/* Top Debtors List */}
          <div className="bg-white rounded-lg border border-[#DCE1DC] flex flex-col overflow-hidden shadow-2xs">
            <div className="h-10 bg-[#F7F8F6] border-b border-[#DCE1DC] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 text-[#14181A] font-bold text-xs">
                <Users className="w-4 h-4 text-[#006d41]" />
                <span>أعلى العملاء مديونية (الآجل)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setIsDebtorsModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-brand text-white hover:bg-brand-dark text-[10.5px] font-bold transition-all shadow-2xs cursor-pointer"
                  title="طباعة كشف ديون العملاء"
                >
                  كشف للطباعة
                </button>
                {onNavigateToCustomers && (
                  <button 
                    onClick={onNavigateToCustomers}
                    className="px-2 py-0.5 rounded bg-white hover:bg-[#F7F8F6] text-[#0B4F42] text-[10.5px] font-bold transition-all shadow-2xs border border-[#DCE1DC] cursor-pointer"
                  >
                    كافة العملاء
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 divide-y divide-[#DCE1DC] max-h-[190px] overflow-y-auto">
              {summary && summary.topDebtors && summary.topDebtors.length > 0 ? (
                summary.topDebtors.map((d) => (
                  <div key={d.customerId} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-[#14181A]">{d.customerName}</div>
                      {d.customerPhone && (
                        <div className="text-[10px] text-[#5B6664] font-mono">{d.customerPhone}</div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-[#B23A2E] text-xs tabular-nums">
                      {(d.balancePiasters / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-[#5B6664] text-xs">
                  <CheckCircle2 className="w-4 h-4 text-[#006d41] mx-auto mb-1" />
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

      {/* Daily Closing & Z-Report Modal (Story 87 / Feature #49) */}
      <DailyClosingModal
        isOpen={isClosingModalOpen}
        onClose={() => {
          setIsClosingModalOpen(false);
          setClosingTargetDate(undefined);
        }}
        targetDate={closingTargetDate}
        onClosingCompleted={() => {
          void loadData();
        }}
      />

      {/* Low Stock & Purchase Order Modal (Story 86 / Feature #48) */}
      <LowStockReportModal
        isOpen={isLowStockModalOpen}
        onClose={() => setIsLowStockModalOpen(false)}
      />

      {/* Debtors Statement Modal (Story 88 / Feature #50) */}
      <DebtorsReportModal
        isOpen={isDebtorsModalOpen}
        onClose={() => setIsDebtorsModalOpen(false)}
      />

      {/* Period Sales & Profits Modal (Story 83 / Feature #45) */}
      <PeriodSalesReportModal
        isOpen={isPeriodSalesModalOpen}
        onClose={() => setIsPeriodSalesModalOpen(false)}
      />
    </div>
  );
}
