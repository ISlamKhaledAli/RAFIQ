import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck,
  RefreshCw, 
  Filter, 
  Clock, 
  User, 
  FileText,
  Tag,
  AlertTriangle,
  ArrowRightLeft,
  Lock,
  CheckCircle2,
  RotateCcw,
  Percent,
  XCircle,
  Printer,
  Sliders,
  LogIn,
  LogOut,
  ArrowDownRight,
  ArrowUpRight,
  AlertOctagon,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useAuth } from '../context/useAuth';
import { useDataSubscription } from '../utils/eventBus';
import { CustomSelect } from '../components/CustomSelect';
import { DateFilterControl } from '../components/DateFilterControl';
import { ClearFiltersButton } from '../components/ClearFiltersButton';
import { PaginationBar } from '../components/PaginationBar';
import { useClientPagination } from '../utils/usePagination';
import { RafiqLoadingState } from '../components/RafiqLoadingState';
import { useSmoothLoading } from '../utils/useSmoothLoading';
import { useDateFilter, useToday, isDateFilterActive, describeDateFilter, getDateFilterRange, getDateFilterKey } from '../utils/dateFilter';
import type { AuditLogEntry, AuditChainVerificationResult } from '../types/models';
import type { UserDto } from '../bridge/ipc';
import { piastersToPounds } from '../utils/money';

import { AppButton } from '../components/AppButton';
import { SearchInput } from '../components/SearchInput';
const AUDIT_PAGE_SIZE_OPTIONS = [15, 25, 50, 100];
// Rows one load returns; the screen warns when a period holds more
const AUDIT_LOAD_LIMIT = 250;

const ACTION_FILTERS = [
  { id: '', label: 'كل العمليات الحساسة' },
  { id: 'price_update', label: 'تعديل سعر البيع' },
  { id: 'cost_update', label: 'تعديل تكلفة الشراء' },
  { id: 'stock_adjust', label: 'تسوية وعدّ بضاعة المخزن' },
  { id: 'sale_discount', label: 'إعطاء خصم تجاري' },
  { id: 'drawer_manual_open', label: 'فتح الدرج يدوياً' },
  { id: 'sale_cancel', label: 'إلغاء فاتورة بيع' },
  { id: 'sale_refund', label: 'مرتجع مبيعات' },
  { id: 'sale_create', label: 'إصدار فواتير بيع' },
  { id: 'sale_reprint', label: 'إعادة طباعة فواتير' },
  { id: 'settings_update', label: 'تعديل إعدادات النظام' },
  { id: 'USER_LOGIN', label: 'تسجيل دخول موظف' },
  { id: 'USER_LOGOUT', label: 'تسجيل خروج موظف' },
  { id: 'LOGIN_FAILED', label: 'محاولات دخول خاطئة' },
  { id: 'credit_limit_override', label: 'تجاوز حد الائتمان' },
  { id: 'DRAWER_CASH_IN', label: 'إيداع نثري بالدرج' },
  { id: 'DRAWER_CASH_OUT', label: 'سحب نثري من الدرج' },
  { id: 'debt_payment', label: 'سداد دفعات آجل' },
  { id: 'product_create', label: 'إضافة أصناف جديدة' },
  { id: 'product_delete', label: 'حذف أصناف' },
];

export interface AuditLogViewProps {
  isActive?: boolean;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ isActive = true }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(false);
  const showLoading = useSmoothLoading(loading, 300);

  // Filters state
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const { dateFilter, setDateFilter, resetDateFilter } = useDateFilter();
  const [searchQuery, setSearchQuery] = useState('');

  // Tamper Verification state
  const [verification, setVerification] = useState<AuditChainVerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resealing, setResealing] = useState(false);
  const { isOwnerOrRoot } = useAuth();

  // Local calendar days (both inclusive) sent as UTC instants, since audit_logs.created_at is stored as UTC ISO.
  // Re-evaluated when the day rolls over so "today" is never frozen at the time the screen was mounted.
  const today = useToday();
  const dateActive = isDateFilterActive(dateFilter);
  const anyFilterActive = dateActive || Boolean(selectedAction) || Boolean(selectedUserId) || Boolean(searchQuery.trim());
  const resetAllFilters = () => {
    setSelectedAction('');
    setSelectedUserId('');
    resetDateFilter();
    setSearchQuery('');
  };
  const dateBounds = useMemo(() => {
    const { startDate, endDate } = getDateFilterRange(dateFilter, today);
    // created_at is compared as text: a prefix-only start and a .9999999 end keep rows at the exact first/last tick of the day
    return {
      startDate: startDate ? new Date(`${startDate}T00:00:00`).toISOString().slice(0, 19) : undefined,
      endDate: endDate ? `${new Date(`${endDate}T23:59:59`).toISOString().slice(0, 19)}.9999999Z` : undefined,
    };
  }, [dateFilter, today]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedLogs,
  } = useClientPagination(logs, 25, `${selectedAction}_${selectedUserId}_${getDateFilterKey(dateFilter)}_${searchQuery}`);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<AuditLogEntry[]>('audit:getLogs', {
        limit: AUDIT_LOAD_LIMIT,
        action: selectedAction || undefined,
        userId: selectedUserId || undefined,
        startDate: dateBounds.startDate,
        endDate: dateBounds.endDate,
        search: searchQuery.trim() || undefined,
      });
      setLogs(data || []);
    } catch (err: unknown) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAction, selectedUserId, dateBounds, searchQuery]);

  const loadUsers = async () => {
    try {
      const activeUsers = await invoke<UserDto[]>('auth:getActiveUsers');
      if (Array.isArray(activeUsers)) {
        setUsers(activeUsers);
      }
    } catch (err) {
      console.error('Failed to load users for audit filter:', err);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await invoke<AuditChainVerificationResult>('audit:verifyChain');
      setVerification(res);
    } catch (err: unknown) {
      console.error('Failed to verify audit chain:', err);
    } finally {
      setVerifying(false);
    }
  };

  const handleResealChain = async () => {
    setResealing(true);
    try {
      const res = await invoke<{ resealedCount: number; verification: AuditChainVerificationResult }>('audit:resealChain');
      if (res && res.verification) {
        setVerification(res.verification);
        await loadAuditLogs();
      }
    } catch (err: unknown) {
      console.error('Failed to reseal audit chain:', err);
    } finally {
      setResealing(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    void loadUsers();
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    let active = true;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const [data, chainRes] = await Promise.all([
            invoke<AuditLogEntry[]>('audit:getLogs', {
              limit: AUDIT_LOAD_LIMIT,
              action: selectedAction || undefined,
              userId: selectedUserId || undefined,
              startDate: dateBounds.startDate,
              endDate: dateBounds.endDate,
              search: searchQuery.trim() || undefined,
            }),
            invoke<AuditChainVerificationResult>('audit:verifyChain').catch(() => null)
          ]);
          if (active) {
            setLogs(data || []);
            if (chainRes) setVerification(chainRes);
          }
        } catch (err: unknown) {
          console.error('Failed to load audit logs:', err);
        }
      })();
    }, 200);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [selectedAction, selectedUserId, dateBounds, searchQuery, isActive]);

  useDataSubscription(['all'], () => {
    void loadAuditLogs();
  });

  const userFilterOptions = useMemo(() => {
    const list = [{ value: '', label: 'كل الموظفين والمسؤولين' }];
    users.forEach((u) => {
      list.push({ value: u.id, label: u.displayName || u.username });
    });
    return list;
  }, [users]);

  const renderDetails = (log: AuditLogEntry) => {
    if (!log.detailsJson) return <span className="text-ink-muted dark:text-ink-muted-dark text-xs">—</span>;

    try {
      const details = JSON.parse(log.detailsJson) as Record<string, unknown>;

      // 1. Manual Cash Drawer Kick
      if (log.action === 'drawer_manual_open') {
        const reason = String(details.reason || 'فتح يدوي للدرج');
        const cashier = details.cashierName ? String(details.cashierName) : '';
        return (
          <div className="flex items-center gap-1.5 text-xs text-danger dark:text-danger-bright font-sans">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-danger" />
            <span className="font-bold">{reason}</span>
            {cashier && <span className="text-ink-muted dark:text-ink-muted-dark font-normal">({cashier})</span>}
          </div>
        );
      }

      // 2. Commercial Discount
      if (log.action === 'sale_discount') {
        const disc = piastersToPounds(Number(details.discountPiasters) || 0).toFixed(2);
        const sub = piastersToPounds(Number(details.subtotalPiasters) || 0).toFixed(2);
        const total = piastersToPounds(Number(details.totalPiasters) || 0).toFixed(2);
        const pct = details.discountPercent ? `${details.discountPercent}%` : '';
        return (
          <div className="text-xs text-ink dark:text-ink-dark font-sans flex items-center gap-1.5 flex-wrap">
            <span>فاتورة <span className="font-mono font-bold text-brand dark:text-brand-bright">#{String(details.invoiceNumber || '')}</span>:</span>
            <span className="text-ink-muted dark:text-ink-muted-dark line-through font-mono">{sub} ج.م</span>
            <span className="text-warn dark:text-warn-bright font-bold font-mono">خصم {disc} ج.م {pct && `(${pct})`}</span>
            <ArrowRightLeft className="w-3 h-3 text-ink-muted dark:text-ink-muted-dark" />
            <span className="text-paid dark:text-paid-bright font-bold font-mono">{total} ج.م</span>
            {Boolean(details.authorizedBy) && (
              <span className="text-micro text-ink-muted dark:text-ink-muted-dark bg-surface-2 dark:bg-surface-dark-2 px-1.5 py-0.5 rounded border border-line dark:border-line-dark">
                اعتماد: {String(details.authorizedBy)}
              </span>
            )}
          </div>
        );
      }

      // 3. Price Update
      if (log.action === 'price_update') {
        const oldP = piastersToPounds(Number(details.oldPrice) || 0).toFixed(2);
        const newP = piastersToPounds(Number(details.newPrice) || 0).toFixed(2);
        return (
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="font-sans text-ink dark:text-ink-dark font-semibold truncate max-w-[8.75rem]">{String(details.productName || '')}:</span>
            <span className="text-danger dark:text-danger-bright line-through">{oldP} ج.م</span>
            <ArrowRightLeft className="w-3 h-3 text-ink-muted dark:text-ink-muted-dark" />
            <span className="text-paid dark:text-paid-bright font-bold">{newP} ج.م</span>
          </div>
        );
      }

      // 4. Cost Update
      if (log.action === 'cost_update') {
        const oldC = piastersToPounds(Number(details.oldCost) || 0).toFixed(2);
        const newC = piastersToPounds(Number(details.newCost) || 0).toFixed(2);
        return (
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="font-sans text-ink dark:text-ink-dark font-semibold truncate max-w-[8.75rem]">{String(details.productName || '')}:</span>
            <span className="text-ink-muted dark:text-ink-muted-dark line-through">{oldC} ج.م</span>
            <ArrowRightLeft className="w-3 h-3 text-ink-muted dark:text-ink-muted-dark" />
            <span className="text-brand dark:text-brand-bright font-bold">{newC} ج.م</span>
          </div>
        );
      }

      // 5. Stock Adjust
      if (log.action === 'stock_adjust') {
        const oldS = ((Number(details.oldStock) || 0) / 1000).toFixed(0);
        const newS = ((Number(details.newStock) || 0) / 1000).toFixed(0);
        return (
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="font-sans text-ink dark:text-ink-dark font-semibold truncate max-w-[8.75rem]">{String(details.productName || '')}:</span>
            <span className="text-ink-muted dark:text-ink-muted-dark">{oldS} قطعة</span>
            <ArrowRightLeft className="w-3 h-3 text-ink-muted dark:text-ink-muted-dark" />
            <span className="text-brand dark:text-brand-bright font-bold">{newS} قطعة</span>
          </div>
        );
      }

      // 6. Sale Void / Cancel
      if (log.action === 'sale_cancel' || log.action === 'sale_void') {
        const total = piastersToPounds(Number(details.totalPiasters) || 0).toFixed(2);
        const reason = String(details.reason || 'إلغاء الفاتورة');
        return (
          <div className="text-xs text-ink dark:text-ink-dark font-sans flex items-center gap-1.5">
            <span>فاتورة ملغاة <span className="font-mono font-bold text-danger dark:text-danger-bright">#{String(details.invoiceNumber || '')}</span></span>
            <span className="font-mono font-bold">({total} ج.م)</span>
            <span className="text-ink-muted dark:text-ink-muted-dark">- السبب: {reason}</span>
          </div>
        );
      }

      // 7. Sale Refund
      if (log.action === 'sale_refund') {
        const total = piastersToPounds(Number(details.totalPiasters) || 0).toFixed(2);
        return (
          <div className="text-xs text-ink dark:text-ink-dark font-sans flex items-center gap-1.5">
            <span>مرتجع <span className="font-mono font-bold text-warn dark:text-warn-bright">#{String(details.returnNumber || '')}</span></span>
            {Boolean(details.invoiceNumber) && <span>لفاتورة #{String(details.invoiceNumber)}</span>}
            <span className="font-mono font-bold text-paid">({total} ج.م)</span>
            <span className="text-ink-muted dark:text-ink-muted-dark">({String(details.itemCount || 0)} صنف)</span>
          </div>
        );
      }

      // 8. Sale Create
      if (log.action === 'sale_create') {
        const total = piastersToPounds(Number(details.totalPiasters) || 0).toFixed(2);
        return (
          <div className="text-xs text-ink dark:text-ink-dark font-sans">
            فاتورة بيع رقم <span className="font-mono font-bold text-brand dark:text-brand-bright">#{String(details.invoiceNumber || '')}</span> بمبلغ{' '}
            <span className="font-mono font-bold">{total} ج.م</span> ({String(details.itemCount || 0)} صنف)
          </div>
        );
      }

      // 9. Sale Reprint
      if (log.action === 'sale_reprint') {
        return (
          <div className="text-xs text-ink dark:text-ink-dark font-sans flex items-center gap-1">
            <Printer className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark" />
            <span>إعادة طباعة نسخة طبق الأصل لفاتورة رقم <span className="font-mono font-bold text-brand dark:text-brand-bright">#{String(details.invoiceNumber || '')}</span></span>
          </div>
        );
      }

      // 10. Settings Update
      if (log.action === 'settings_update') {
        const changes = Array.isArray(details.changes) ? (details.changes as Array<{ key: string; oldValue: string; newValue: string }>) : [];
        if (changes.length > 0) {
          return (
            <div className="text-xs font-sans text-ink dark:text-ink-dark flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-brand dark:text-brand-bright">تعديل إعدادات:</span>
              {changes.slice(0, 2).map((c, idx) => (
                <span key={idx} className="bg-surface-2 dark:bg-surface-dark-2 px-1.5 py-0.5 rounded text-micro font-mono border border-line">
                  {c.key}: <span className="text-danger line-through">{c.oldValue || 'فارغ'}</span> {'->'} <span className="text-paid font-bold">{c.newValue || 'فارغ'}</span>
                </span>
              ))}
              {changes.length > 2 && <span className="text-micro text-ink-muted dark:text-ink-muted-dark font-bold">+{changes.length - 2} إعدادات أخرى</span>}
            </div>
          );
        }
      }

      // 11. Drawer Cash In / Cash Out
      if (log.action === 'DRAWER_CASH_IN' || log.action === 'DRAWER_CASH_OUT') {
        const amt = piastersToPounds(Number(details.amount) || 0).toFixed(2);
        const reason = String(details.reason || '');
        return (
          <div className="text-xs font-sans text-ink dark:text-ink-dark flex items-center gap-1.5">
            <span className="font-mono font-bold">{amt} ج.م</span>
            {reason && <span className="text-ink-muted dark:text-ink-muted-dark">- {reason}</span>}
          </div>
        );
      }

      // 12. Credit Limit Override
      if (log.action === 'credit_limit_override') {
        const exceeded = piastersToPounds(Number(details.exceededBy) || 0).toFixed(2);
        return (
          <div className="text-xs text-ink dark:text-ink-dark font-sans flex items-center gap-1.5">
            <span>فاتورة #{String(details.invoiceNumber || '')}</span>
            <span className="text-danger font-bold">تجاوز ائتمان بمقدار {exceeded} ج.م</span>
            <span className="text-ink-muted dark:text-ink-muted-dark">باعتماد: {String(details.authorizedBy || '')}</span>
          </div>
        );
      }

      return (
        <span className="text-xs font-mono text-ink-muted dark:text-ink-muted-dark truncate max-w-xs block">
          {log.detailsJson}
        </span>
      );
    } catch {
      return <span className="text-xs font-mono text-ink-muted dark:text-ink-muted-dark truncate">{log.detailsJson}</span>;
    }
  };

  const getActionBadge = (action: string, label?: string) => {
    switch (action) {
      case 'drawer_manual_open':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            <span>{label || 'فتح الدرج يدوياً'}</span>
          </span>
        );
      case 'sale_discount':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30 flex items-center gap-1">
            <Percent className="w-3 h-3" />
            <span>{label || 'إعطاء خصم'}</span>
          </span>
        );
      case 'sale_cancel':
      case 'sale_void':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            <span>{label || 'إلغاء فاتورة'}</span>
          </span>
        );
      case 'sale_refund':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            <span>{label || 'مرتجع مبيعات'}</span>
          </span>
        );
      case 'sale_reprint':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border border-line dark:border-line-dark flex items-center gap-1">
            <Printer className="w-3 h-3" />
            <span>{label || 'إعادة طباعة'}</span>
          </span>
        );
      case 'price_update':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>{label || 'تعديل سعر بيع'}</span>
          </span>
        );
      case 'cost_update':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            <span>{label || 'تعديل تكلفة شراء'}</span>
          </span>
        );
      case 'stock_adjust':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20 flex items-center gap-1">
            <ArrowRightLeft className="w-3 h-3" />
            <span>{label || 'تسوية مخزن'}</span>
          </span>
        );
      case 'sale_create':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-bright/20 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>{label || 'إصدار فاتورة'}</span>
          </span>
        );
      case 'settings_update':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border border-line dark:border-line-dark flex items-center gap-1">
            <Sliders className="w-3 h-3" />
            <span>{label || 'تعديل إعدادات'}</span>
          </span>
        );
      case 'USER_LOGIN':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 flex items-center gap-1">
            <LogIn className="w-3 h-3" />
            <span>{label || 'تسجيل دخول'}</span>
          </span>
        );
      case 'USER_LOGOUT':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line flex items-center gap-1">
            <LogOut className="w-3 h-3" />
            <span>{label || 'تسجيل خروج'}</span>
          </span>
        );
      case 'LOGIN_FAILED':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border flex items-center gap-1">
            <AlertOctagon className="w-3 h-3" />
            <span>{label || 'محاولة فاشلة'}</span>
          </span>
        );
      case 'DRAWER_CASH_IN':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3" />
            <span>{label || 'إيداع بالدرج'}</span>
          </span>
        );
      case 'DRAWER_CASH_OUT':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" />
            <span>{label || 'سحب من الدرج'}</span>
          </span>
        );
      case 'credit_limit_override':
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border flex items-center gap-1">
            <Lock className="w-3 h-3" />
            <span>{label || 'تجاوز حد الائتمان'}</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-micro font-bold bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark border border-line dark:border-line-dark">
            {label || action}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas dark:bg-canvas-dark p-3 sm:p-3.5 gap-2.5 sm:gap-3 overflow-hidden select-none">
      {/* 1. Top Header Toolbar */}
      <div className="h-[3.25rem] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright flex items-center justify-center font-bold">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h2 className="t-page-title text-ink dark:text-ink-dark leading-tight m-0">
              سجل التدقيق الرقابي والعمليات الحساسة
            </h2>
            <p className="text-micro text-ink-muted dark:text-ink-muted-dark m-0 hidden sm:block">
              توثيق شامل ومحصّن ضد التعديل لفتح الدرج والخصومات وتعديل الأسعار وحركات الأمان
            </p>
          </div>
        </div>

        {/* Verification Trigger Button */}
        <div className="flex items-center gap-2">
          <AppButton
            variant="soft"
            size="sm"
            onClick={() => void handleVerifyChain()}
            disabled={verifying}
            title="فحص السلسلة المشفرة للتأكد من عدم التلاعب بقاعدة البيانات"
            aria-label="فحص سلامة السجل"
          >
            <ShieldCheck className={`w-4 h-4 shrink-0 ${verifying ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{verifying ? 'جارِ التحقق...' : 'فحص سلامة السجل'}</span>
          </AppButton>
        </div>
      </div>

      {/* Multi-Criteria Filters Toolbar */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-2.5 flex items-center gap-x-8 gap-y-2 flex-wrap shrink-0">
        {/* Search first, then the filters */}
        <SearchInput
          size="sm"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="بحث برقم الفاتورة، اسم الصنف، السبب..."
          ariaLabel="بحث في سجل العمليات"
          className="flex-1 min-w-[18rem] max-w-md"
        />

        <div className="flex items-center gap-2 flex-wrap">
        {/* Action Type Filter */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[10.625rem] sm:max-w-xs">
          <Filter className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark shrink-0" />
          <CustomSelect
            value={selectedAction}
            onChange={(val) => setSelectedAction(val)}
            options={ACTION_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
            className="w-full"
            size="sm"
          />
        </div>

        {/* User Filter */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[9.375rem] sm:max-w-[12.5rem]">
          <User className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark shrink-0" />
          <CustomSelect
            value={selectedUserId}
            onChange={(val) => setSelectedUserId(val)}
            options={userFilterOptions}
            className="w-full"
            size="sm"
          />
        </div>

        {/* Date Filter */}
        <DateFilterControl
          value={dateFilter}
          onChange={setDateFilter}
          size="sm"
          selectWidthClass="w-44 sm:w-48"
        />

        <ClearFiltersButton
          active={anyFilterActive}
          onClick={resetAllFilters}
          label="مسح الفلاتر"
          title="إلغاء كل الفلاتر والرجوع لكل العمليات"
        />
        </div>
      </div>

      {logs.length >= AUDIT_LOAD_LIMIT && (
        <div className="flex items-center gap-1.5 text-xs text-warn dark:text-warn-bright font-semibold bg-warn-soft dark:bg-warn-dark-soft p-2 rounded-lg border border-warn/20 dark:border-warn-bright/30 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{`المعروض أحدث ${AUDIT_LOAD_LIMIT} عملية فقط${dateActive ? '' : '. حدد فترة عشان تشوف الأقدم'}.`}</span>
        </div>
      )}

      {/* Verification Status Banner (Tamper-Proof) */}
      {verification && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all shrink-0 ${
          verification.isTampered 
            ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright' 
            : 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid-bright/20 text-paid dark:text-paid-bright'
        }`}>
          <div className="flex items-center gap-2.5">
            {verification.isTampered ? (
              <AlertTriangle className="w-5 h-5 shrink-0 text-danger dark:text-danger-bright" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-paid dark:text-paid-bright" />
            )}
            <div>
              <p className="font-bold m-0 text-xs sm:text-sm">
                {verification.isTampered 
                  ? 'تحذير أمان: تم اكتشاف تلاعب مباشر بسجل العمليات من خارج النظام!' 
                  : 'سلسلة العمليات سليمة ومحمية بالتوقيع الرقمي بنسبة 100%'}
              </p>
              <p className="m-0 text-micro opacity-90">
                {verification.isTampered 
                  ? verification.errorMessage 
                  : `تم فحص كل السجلات (${verification.totalRecordsVerified} حركة) وبصمات SHA-256 سليمة، ومفيش أي سجل اتعدل أو اتمسح من بره البرنامج.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {verification.isTampered && isOwnerOrRoot && (
              <AppButton
                variant="danger"
                size="sm"
                icon={RefreshCw}
                onClick={() => void handleResealChain()}
                loading={resealing}
                title="إعادة احتساب وتأمين أختام السلسلة الرقمية لجميع السجلات المسجلة"
              >
                {resealing ? 'جارِ التأمين...' : 'إعادة ختم وتأمين السلسلة'}
              </AppButton>
            )}
          </div>
        </div>
      )}

      {/* 2. Audit Log Data Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col overflow-hidden min-h-0">
        {/* Table Header */}
        <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 grid grid-cols-12 items-center text-xs font-bold text-ink-muted dark:text-ink-muted-dark shrink-0 select-none">
          <span className="col-span-1 text-center">#</span>
          <span className="col-span-2">الوقت والتاريخ</span>
          <span className="col-span-2">الموظف المسؤول</span>
          <span className="col-span-2">نوع الحركة</span>
          <span className="col-span-4">التفاصيل والتغييرات</span>
          <span className="col-span-1 text-left">بصمة السلسلة</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark">
          {showLoading ? (
            <RafiqLoadingState
              label="جاري فحص وتدقيق سجل العمليات الحساسة..."
              sublabel="التحقق من أختام السلسلة المشفرة وسجلات الأمان الرقمية"
            />
          ) : logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted dark:text-ink-muted-dark gap-2 p-6">
              <ShieldAlert className="w-12 h-12 stroke-[1.2] text-ink-muted dark:text-ink-muted-dark opacity-40" />
              <p className="text-sm font-semibold text-ink dark:text-ink-dark m-0">
                {dateActive ? `مفيش أي عمليات مسجلة خلال ${describeDateFilter(dateFilter)}` : 'مفيش أي عمليات مطابقة للفلترة الحالية'}
              </p>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0">
                كل تعديل في الأسعار أو فتح للدرج أو خصم أو حذف بيتسجل ويتوثق هنا تلقائياً لحماية المحل
              </p>
              {anyFilterActive && (
                <AppButton variant="primary" size="sm" icon={RotateCcw} className="mt-1" onClick={resetAllFilters}>
                  مسح الفلاتر وعرض كل العمليات
                </AppButton>
              )}
            </div>
          ) : (
            pagedLogs.map((log, index) => {
              const formattedDate = log.createdAt
                ? new Date(log.createdAt).toLocaleString('ar-EG-u-nu-latn', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';

              return (
                <div
                  key={log.id}
                  className="h-11 sm:h-12 border-b border-line dark:border-line-dark px-4 grid grid-cols-12 items-center text-xs hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors"
                >
                  <span className="col-span-1 text-center font-mono text-xs text-ink-muted dark:text-ink-muted-dark">
                    {((currentPage - 1) * pageSize) + index + 1}
                  </span>

                  <span className="col-span-2 flex items-center gap-1.5 text-xs text-ink-muted dark:text-ink-muted-dark font-sans truncate">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-ink-muted dark:text-ink-muted-dark" />
                    <span>{formattedDate}</span>
                  </span>

                  <span className="col-span-2 flex items-center gap-1.5 text-xs font-semibold text-ink dark:text-ink-dark truncate">
                    <User className="w-3.5 h-3.5 shrink-0 text-brand dark:text-brand-bright" />
                    <span>{log.userDisplayName || 'مدير النظام'}</span>
                  </span>

                  <div className="col-span-2 flex items-center">
                    {getActionBadge(log.action, log.actionArabic)}
                  </div>

                  <div className="col-span-4 truncate pr-1">
                    {renderDetails(log)}
                  </div>

                  <div 
                    className="col-span-1 flex items-center justify-end gap-1 font-mono text-micro text-ink-muted dark:text-ink-muted-dark truncate" 
                    title={`معرف السجل: ${log.id}\nبصمة التشفير: ${log.recordHash || 'محسوبة'}\nبصمة السجل السابق: ${log.prevHash || 'بداية السلسلة'}`}
                  >
                    <Lock className="w-2.5 h-2.5 text-paid dark:text-paid-bright shrink-0" />
                    <span className="truncate">{log.recordHash ? log.recordHash.slice(0, 6) : log.id.slice(0, 6)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table Footer */}
        <div className="h-9 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-4 flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark shrink-0">
          <span className="font-mono text-micro text-paid dark:text-paid-bright flex items-center gap-1">
            <Lock className="w-3 h-3 text-paid dark:text-paid-bright" />
            سجل أمان غير قابل للتعديل ومحمي بقواعد قاعدة البيانات وبصمة SHA-256
          </span>
        </div>
      </div>

      {/* Pagination Bar: only when more than one page is possible (rows are already numbered) */}
      {logs.length > AUDIT_PAGE_SIZE_OPTIONS[0] && (
        <PaginationBar
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={logs.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={AUDIT_PAGE_SIZE_OPTIONS}
          itemLabel="عملية"
        />
      )}
    </div>
  );
};
