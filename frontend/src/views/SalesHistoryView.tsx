import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FileText, 
  RefreshCw, 
  Clock, 
  TrendingUp, 
  Receipt,
  X,
  Printer,
  Search,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  Ban,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { openHelpCenter } from '../utils/helpService';
import type { Sale, Return } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { VoidInvoiceModal } from '../components/VoidInvoiceModal';
import { ReturnModal } from '../components/ReturnModal';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { PaginationBar } from '../components/PaginationBar';
import { useClientPagination } from '../utils/usePagination';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { RafiqLoadingState } from '../components/RafiqLoadingState';
import { useSmoothLoading } from '../utils/useSmoothLoading';

export interface SalesHistoryViewProps {
  isActive?: boolean;
}

const formatCashierName = (cashierName?: string | null, cashierId?: string | null): string => {
  if (cashierName && cashierName.trim()) {
    if (cashierName === 'usr_admin_default' || cashierName === 'admin') {
      return 'مدير النظام';
    }
    return cashierName;
  }
  if (!cashierId || cashierId === 'usr_admin_default' || cashierId === 'admin') {
    return 'مدير النظام';
  }
  return cashierId;
};

export const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({ isActive = true }) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const showLoading = useSmoothLoading(loading, 300);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const { requestClose: requestCloseSaleDetails, handleBackdropClick: handleSaleDetailsBackdropClick } = useModalDismiss({
    isOpen: Boolean(selectedSale),
    onClose: () => setSelectedSale(null),
    isDirty: false,
  });
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled' | 'refunded'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'custom'>('all');
  const [customDate, setCustomDate] = useState('');
  const [reprintFeedback, setReprintFeedback] = useState<string | null>(null);
  const [isReprinting, setIsReprinting] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [saleReturns, setSaleReturns] = useState<Return[]>([]);
  const [, setLoadingReturns] = useState(false);
  const [showReturnsBreakdown, setShowReturnsBreakdown] = useState(true);

  // Computed return metrics for selectedSale
  const totalRefundedPiasters = useMemo(() => {
    return saleReturns.reduce((sum, r) => sum + (r.totalPiasters || 0), 0);
  }, [saleReturns]);

  const netSalePiasters = useMemo(() => {
    if (!selectedSale) return 0;
    return Math.max(0, selectedSale.totalPiasters - totalRefundedPiasters);
  }, [selectedSale, totalRefundedPiasters]);

  // Aggregate returned pieces by product id
  const returnedInfoByProduct = useMemo(() => {
    const map: Record<string, { returnedPieces: number; hasDamaged: boolean; lastReturnDate?: string }> = {};
    saleReturns.forEach((ret) => {
      (ret.items || []).forEach((item) => {
        const pid = item.productId;
        const current = map[pid] || { returnedPieces: 0, hasDamaged: false };
        current.returnedPieces += item.quantityMilli / 1000;
        if (item.isDamaged) current.hasDamaged = true;
        current.lastReturnDate = ret.createdAt;
        map[pid] = current;
      });
    });
    return map;
  }, [saleReturns]);

  const handlePrintReturnReceipt = async (returnId?: string) => {
    if (!returnId) return;
    try {
      await invoke('returns:printReceipt', { returnId });
      setReprintFeedback('تم إرسال أمر طباعة إيصال المرتجع للطابعة بنجاح.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال أمر الطباعة';
      setReprintFeedback('تنبيه: ' + msg);
    }
  };

  const handleSaleCancelled = (cancelled: Sale) => {
    setSelectedSale(cancelled);
    setSales((prev) => prev.map((s) => (s.id === cancelled.id ? cancelled : s)));
    setShowCancelModal(false);
    setReprintFeedback('تم إلغاء الفاتورة بنجاح، وإرجاع الأصناف للمخزون، وتوثيق العملية في سجل النظام.');
  };

  const handleReturnCompleted = () => {
    setShowReturnModal(false);
    if (selectedSale) {
      const updated = { ...selectedSale, status: 'refunded' as const };
      setSelectedSale(updated);
      setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      if (selectedSale.id) {
        void invoke<Return[]>('returns:getForSale', { saleId: selectedSale.id }).then((rets) => {
          setSaleReturns(rets || []);
        });
      }
    }
    void loadSales();
    setReprintFeedback('تم تسجيل المرتجع بنجاح وتحديث حركة المبيعات والمخزون.');
  };

  const loadSales = async () => {
    setLoading(true);
    setSearchError(null);
    try {
      const res = await invoke<Sale[]>('sales:getRecent', { limit: 100 });
      setSales(res || []);
    } catch (err: unknown) {
      console.error(err);
      setSearchError('تعذر تحميل قائمة الفواتير من قاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive !== false) {
      void loadSales();
    }
  }, [isActive]);

  useDataSubscription(['sales', 'all'], () => {
    void loadSales();
  });

  const handleOpenDetails = async (sale: Sale) => {
    setSelectedSale(sale);
    setReprintFeedback(null);
    setSaleReturns([]);
    setShowReturnsBreakdown(true);

    const sId = sale.id;
    if (sId) {
      setLoadingReturns(true);
      void invoke<Return[]>('returns:getForSale', { saleId: sId })
        .then((rets) => {
          setSaleReturns(rets || []);
        })
        .catch((err) => {
          console.warn('Error fetching returns for sale', err);
        })
        .finally(() => {
          setLoadingReturns(false);
        });
    }

    // If items not populated yet, fetch full details atomically
    if (!sale.items || sale.items.length === 0) {
      setLoadingDetails(true);
      try {
        const fullSale = sale.invoiceNumber 
          ? await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: sale.invoiceNumber })
          : (sale.id ? await invoke<Sale>('sales:getById', { id: sale.id }) : null);
        if (fullSale && fullSale.id) {
          setSelectedSale(fullSale);
          setSales((prev) => prev.map((s) => (s.id === fullSale.id ? fullSale : s)));
          if (!sId && fullSale.id) {
            void invoke<Return[]>('returns:getForSale', { saleId: fullSale.id }).then((rets) => {
              setSaleReturns(rets || []);
            });
          }
        }
      } catch (err) {
        console.error('Error fetching sale details', err);
      } finally {
        setLoadingDetails(false);
      }
    }
  };

  const handleSearchInvoice = async () => {
    const raw = searchQuery.trim().replace(/^#/, '');
    setSearchError(null);
    if (!raw) {
      await loadSales();
      return;
    }

    // 1. Try finding in current memory first
    const num = parseInt(raw, 10);
    const existing = !isNaN(num) ? sales.find((s) => s.invoiceNumber === num) : null;
    if (existing) {
      void handleOpenDetails(existing);
      return;
    }

    // 2. Perform backend search via sales:search
    setLoading(true);
    try {
      const results = await invoke<Sale[]>('sales:search', {
        query: raw,
        status: statusFilter !== 'all' ? statusFilter : undefined
      });
      if (results && results.length > 0) {
        setSales(results);
        if (results.length === 1) {
          void handleOpenDetails(results[0]);
        }
      } else if (!isNaN(num) && num > 0) {
        // Fallback direct check by invoice number
        const found = await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: num });
        if (found && found.id) {
          setSales((prev) => [found, ...prev.filter((p) => p.id !== found.id)]);
          void handleOpenDetails(found);
        } else {
          setSearchError(`لم يتم العثور على أي فاتورة مطابقة لـ "${searchQuery}"`);
        }
      } else {
        setSearchError(`لم يتم العثور على أي فاتورة مطابقة لـ "${searchQuery}"`);
      }
    } catch {
      setSearchError(`لم يتم العثور على أي فاتورة مطابقة لـ "${searchQuery}"`);
    } finally {
      setLoading(false);
    }
  };

  // Task 133-3: Reprint receipt with copy watermark and audit log
  const handleReprint = useCallback(async () => {
    if (!selectedSale) return;
    setIsReprinting(true);
    setReprintFeedback(null);
    try {
      const res = await invoke<{ success: boolean; message: string }>('printer:printReceipt', {
        sale: selectedSale,
        isCopy: true
      });
      if (res && res.success) {
        setReprintFeedback('تمت إعادة طباعة نسخة طبق الأصل بنجاح وتوثيقها في سجل النظام.');
      } else {
        setReprintFeedback(res?.message || 'تم إرسال أمر طباعة النسخة.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال أمر الطباعة';
      setReprintFeedback('تنبيه: ' + msg);
    } finally {
      setIsReprinting(false);
    }
  }, [selectedSale]);

  // Keyboard shortcut listener: F9 to reprint, Esc to close
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedSale) return;
      if (e.key === 'Escape') {
        setSelectedSale(null);
      } else if (e.key === 'F9') {
        e.preventDefault();
        void handleReprint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, selectedSale, handleReprint]);

  // Client-side filtering across criteria (Tasks 133-1 & 133-2)
  const filteredSales = sales.filter((s) => {
    // 1. Status Filter
    if (statusFilter !== 'all') {
      const sStatus = s.status || 'completed';
      if (statusFilter === 'completed' && sStatus !== 'completed') return false;
      if (statusFilter === 'cancelled' && sStatus !== 'cancelled') return false;
      if (statusFilter === 'refunded' && sStatus !== 'refunded' && sStatus !== 'partially_refunded') return false;
    }

    // 2. Date Filter
    if (dateFilter !== 'all' && s.createdAt) {
      const saleDate = new Date(s.createdAt);
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const saleDateStr = saleDate.toISOString().split('T')[0];

      if (dateFilter === 'today' && saleDateStr !== todayStr) return false;
      if (dateFilter === 'yesterday') {
        const yest = new Date(now);
        yest.setDate(yest.getDate() - 1);
        const yestStr = yest.toISOString().split('T')[0];
        if (saleDateStr !== yestStr) return false;
      }
      if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (saleDate < weekAgo) return false;
      }
      if (dateFilter === 'custom' && customDate && saleDateStr !== customDate) return false;
    }

    // 3. Search Query (Invoice #, customer name/phone, notes, amount)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace(/^#/, '');
      const invMatch = String(s.invoiceNumber || '').includes(q);
      const notesMatch = (s.notes || '').toLowerCase().includes(q);
      const custMatch = (s.customerName || '').toLowerCase().includes(q) || (s.customerPhone || '').includes(q);
      const paymentMatch = (s.paymentMethod || '').toLowerCase().includes(q);
      const amountPounds = ((s.totalPiasters || 0) / 100).toFixed(0);
      const amountMatch = amountPounds.includes(q);

      if (!invMatch && !notesMatch && !custMatch && !paymentMatch && !amountMatch) {
        return false;
      }
    }

    return true;
  });

  // Summary Metrics calculations (Integer arithmetic)
  const totalSalesPiasters = filteredSales
    .filter((s) => s.status !== 'cancelled')
    .reduce((sum, s) => sum + (s.totalPiasters || 0), 0);
  const invoiceCount = filteredSales.length;
  const averageInvoicePiasters = invoiceCount > 0 ? Math.round(totalSalesPiasters / invoiceCount) : 0;

  // Pagination state
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedSales,
  } = useClientPagination(filteredSales, 25, `${searchQuery}_${statusFilter}_${dateFilter}_${customDate}`);

  return (
    <div className="flex flex-col h-full bg-canvas dark:bg-canvas-dark p-3 sm:p-3.5 gap-2.5 sm:gap-3 overflow-hidden select-none">
      {/* 1. Stat Summary Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
        {/* Card 1: Total Sales */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">إجمالي مبيعات الفترة</span>
            <div className="text-xl sm:text-2xl font-black font-mono text-paid dark:text-brand-bright tabular-nums tracking-tight">
              {formatArabicCurrency(totalSalesPiasters)}
            </div>
            <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">فواتير سليمة مش ملغية</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-brand-bright border border-paid/20 dark:border-paid/30 flex items-center justify-center shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Invoice Count */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">عدد الفواتير</span>
            <div className="text-xl sm:text-2xl font-black font-mono text-ink dark:text-ink-dark tabular-nums tracking-tight">
              {invoiceCount}
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted mr-1">فاتورة</span>
            </div>
            <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">حسب التصفية والبحث</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark flex items-center justify-center shadow-2xs">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Average Ticket */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">متوسط الفاتورة الواحدة</span>
            <div className="text-xl sm:text-2xl font-black font-mono text-brand-dark dark:text-brand-bright tabular-nums tracking-tight">
              {formatArabicCurrency(averageInvoicePiasters)}
            </div>
            <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">لكل زبون اشترى</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-surface-dark-3 text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center shadow-2xs">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Actions & Refresh */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">دفتر وسجل الفواتير</span>
            <div className="text-xs font-bold text-ink dark:text-ink-dark mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-paid dark:bg-brand-bright animate-pulse"></span>
              <span>محفوظ ومأمن في السيستم</span>
            </div>
            <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">شغال أوفلاين بدون نت</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openHelpCenter('sales')}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark text-paid dark:text-brand-bright flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="دليل وشروحات المبيعات والورديات والإغلاق اليومي (F1)"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Comprehensive Search & Filter Toolbar */}
      <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 shrink-0 shadow-xs">
        {/* Search input with Enter key trigger */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-lg relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void handleSearchInvoice();
              }
            }}
            placeholder="ابحث برقم الفاتورة، اسم الزبون، المبلغ، أو ملاحظة..."
            className="w-full h-9 pr-9 pl-8 text-xs bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:outline-none focus:ring-2 focus:ring-paid/20 focus:border-paid dark:focus:border-brand-bright transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchError(null);
              }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
              title="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Date Filter Pills */}
        <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark text-xs">
          <button
            onClick={() => setDateFilter('all')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'all' 
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            الكل
          </button>
          <button
            onClick={() => setDateFilter('today')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'today' 
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            النهاردة
          </button>
          <button
            onClick={() => setDateFilter('yesterday')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'yesterday' 
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            إمبارح
          </button>
          <button
            onClick={() => setDateFilter('week')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'week' 
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            آخر أسبوع
          </button>
          <button
            onClick={() => setDateFilter('custom')}
            className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
              dateFilter === 'custom' 
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
            title="تحديد تاريخ معين"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>يوم محدد</span>
          </button>
        </div>

        {/* Custom date input if active */}
        {dateFilter === 'custom' && (
          <CustomDatePicker
            value={customDate}
            onChange={(d) => setCustomDate(d)}
            placeholder="اختر التاريخ..."
            className="w-40"
          />
        )}

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all' 
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            الكل
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'completed' 
                ? 'bg-paid dark:bg-paid text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            فواتير سليمة
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'cancelled' 
                ? 'bg-danger text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-danger hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            فواتير ملغية
          </button>
          <button
            onClick={() => setStatusFilter('refunded')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'refunded' 
                ? 'bg-warn text-white shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-warn hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            فيها مرتجع
          </button>
        </div>

        {searchError && (
          <div className="w-full flex items-center gap-1.5 text-xs text-danger dark:text-danger-bright font-semibold bg-danger-soft dark:bg-danger-dark-soft p-2 rounded-xl border border-danger/20 dark:border-danger-bright/30">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* 3. Invoices Ledger Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 grid grid-cols-12 items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted shrink-0 select-none">
          <span className="col-span-2">رقم الفاتورة</span>
          <span className="col-span-2">وقت وتاريخ الفاتورة</span>
          <span className="col-span-2">الزبون</span>
          <span className="col-span-2 text-center">طريقة الدفع والحالة</span>
          <span className="col-span-2 text-center">الخصم</span>
          <span className="col-span-1 text-left pl-2">الإجمالي</span>
          <span className="col-span-1 text-center">تفاصيل</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark">
          {showLoading ? (
            <RafiqLoadingState
              label="بنحمّل فواتير البيع من السيستم..."
              sublabel="جاري جلب الفواتير وحسابات السداد والمرتجعات من قاعدة البيانات المحلية"
            />
          ) : filteredSales.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2 p-6">
              <Clock className="w-12 h-12 stroke-[1.2] text-ink-muted dark:text-ink-dark-muted opacity-40" />
              <p className="text-[14px] font-semibold text-ink dark:text-ink-dark m-0">
                {searchQuery || statusFilter !== 'all' || dateFilter !== 'all' 
                  ? 'مفيش فواتير مطابقة للي بتدور عليه' 
                  : 'لسه مفيش فواتير بيع اتسجلت'}
              </p>
              <p className="text-[12px] text-ink-muted dark:text-ink-dark-muted m-0">
                {searchQuery ? 'اتأكد من رقم الفاتورة أو اسم الزبون واضغط Enter' : 'روح لشاشة الكاشير عشان تفتح فاتورة وتبيع'}
              </p>
            </div>
          ) : (
            pagedSales.map((sale) => {
              const isCancelled = sale.status === 'cancelled';
              const isRefunded = sale.status === 'refunded' || sale.status === 'partially_refunded';
              return (
                <div 
                  key={sale.id || sale.invoiceNumber} 
                  className={`h-11 sm:h-12 border-b border-line dark:border-line-dark px-4 grid grid-cols-12 items-center text-xs hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer ${
                    isCancelled ? 'bg-danger-soft/40 dark:bg-danger-dark-soft/40 hover:bg-danger-soft/60 dark:hover:bg-danger-dark-soft/60 opacity-80' : ''
                  }`}
                  onClick={() => void handleOpenDetails(sale)}
                >
                  {/* Invoice Number */}
                  <span className={`col-span-2 font-mono font-bold text-xs flex items-center gap-1.5 ${
                    isCancelled ? 'text-danger line-through' : 'text-brand-dark dark:text-brand-bright'
                  }`}>
                    <span>#{sale.invoiceNumber}</span>
                    {isCancelled && <span className="text-[10px] text-danger no-underline font-normal">(ملغية)</span>}
                  </span>

                  {/* Date / Time */}
                  <span className="col-span-2 font-mono text-ink dark:text-ink-dark text-xs tabular-nums">
                    {sale.createdAt ? new Date(sale.createdAt).toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </span>

                  {/* Customer */}
                  <span className="col-span-2 text-ink dark:text-ink-dark text-xs truncate" title={sale.customerName || 'زبون عادي كاش'}>
                    {sale.customerName ? (
                      <span className="flex items-center gap-1 font-bold text-ink dark:text-ink-dark">
                        <User className="w-3.5 h-3.5 text-paid dark:text-brand-bright shrink-0" />
                        <span className="truncate">{sale.customerName}</span>
                      </span>
                    ) : (
                      <span className="text-ink-muted/70 dark:text-ink-dark-muted/70">زبون عادي (كاش)</span>
                    )}
                  </span>

                  {/* Status & Payment Method Badges */}
                  <div className="col-span-2 flex items-center justify-center gap-1.5">
                    {isCancelled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30 flex items-center gap-1">
                        <Ban className="w-3 h-3" />
                        <span>ملغية</span>
                      </span>
                    ) : isRefunded ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30">
                        {sale.status === 'partially_refunded' ? 'مرتجع جزئي' : 'مستردة بالكامل'}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-brand-bright border border-paid/20 dark:border-paid/30">
                        {sale.paymentMethod === 'cash' ? 'كاش' : sale.paymentMethod === 'credit' ? 'شكك' : sale.paymentMethod === 'instapay' ? 'انستاباي' : sale.paymentMethod === 'vodafone_cash' ? 'محفظة' : 'إلكتروني'}
                      </span>
                    )}
                  </div>

                  {/* Discount */}
                  <span className="col-span-2 text-center font-mono text-ink-muted dark:text-ink-dark-muted text-xs tabular-nums">
                    {sale.discountPiasters > 0 ? formatArabicCurrency(sale.discountPiasters) : '—'}
                  </span>

                  {/* Total Piasters */}
                  <span className={`col-span-1 text-left pl-2 font-mono font-bold text-xs tabular-nums ${
                    isCancelled ? 'text-ink-muted dark:text-ink-dark-muted line-through' : 'text-paid dark:text-paid-bright'
                  }`}>
                    {formatArabicCurrency(sale.totalPiasters)}
                  </span>

                  {/* Action View */}
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleOpenDetails(sale);
                      }}
                      className="w-7 h-7 rounded-lg bg-surface dark:bg-surface-dark-3 hover:bg-paid-soft dark:hover:bg-paid-dark-soft text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-brand-bright border border-line dark:border-line-dark flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                      title="عرض بنود وتفاصيل الفاتورة"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="h-8 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-4 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted shrink-0">
          <span>جميع فواتير المبيعات محفوظة ومؤمنة محلياً</span>
        </div>
      </div>

      {/* Pagination Bar */}
      <PaginationBar
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={filteredSales.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[15, 25, 50, 100]}
        itemLabel="فاتورة"
      />

      {/* 4. Full Invoice Details Modal */}
      {selectedSale && (
        <div onClick={handleSaleDetailsBackdropClick} className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col select-none max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-brand dark:text-brand-bright" />
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">
                  تفاصيل وبيانات فاتورة #{selectedSale.invoiceNumber}
                </h3>
                {selectedSale.status === 'cancelled' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-danger text-white">
                    فاتورة ملغية
                  </span>
                )}
                {selectedSale.status === 'refunded' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warn text-white">
                    فيها مرتجع
                  </span>
                )}
              </div>
              <button
                onClick={() => void requestCloseSaleDetails()}
                className="text-ink-muted dark:text-ink-dark-muted hover:text-danger p-1 rounded transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar font-sans text-xs">
              {/* Cancelled Banner if applicable */}
              {selectedSale.status === 'cancelled' && (
                <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 rounded-xl p-3 flex items-start gap-2.5 text-danger dark:text-danger-bright shrink-0">
                  <Ban className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">الفاتورة دي ملغية وبضاعتها رجعت للمخزن</div>
                    <div className="text-[11px] mt-0.5 text-danger/90 dark:text-danger-bright/90">
                      {selectedSale.notes || 'اتلغت ورجعت البضاعة للرصيد عشان الحسابات تظبط.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Refunded Banner if applicable */}
              {(selectedSale.status === 'refunded' || saleReturns.length > 0) && (
                <div className="bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl p-3 text-ink dark:text-ink-dark flex flex-col gap-2 shadow-2xs shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-surface dark:bg-surface-dark-2 text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30">
                        <RotateCcw className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs flex items-center gap-2">
                          <span>اتسجل مرتجع بضاعة على الفاتورة دي</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface dark:bg-surface-dark-2 text-warn dark:text-warn-bright font-bold border border-warn/20 dark:border-warn-bright/30">
                            {saleReturns.length} {saleReturns.length === 1 ? 'وصل مرتجع' : 'وصولات مرتجع'}
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-medium mt-0.5">
                          إجمالي الفلوس اللي رجعت للزبون: <strong className="font-bold font-mono text-warn dark:text-warn-bright">{formatArabicCurrency(totalRefundedPiasters)}</strong>
                          {saleReturns[0] && (
                            <span className="mr-2 text-ink-muted/80 dark:text-ink-dark-muted/80">
                              (طريقة الرد: {saleReturns[0].refundMethod === 'credit' ? 'خصم من حسابه الشكك' : 'كاش من الدرج'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {saleReturns.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowReturnsBreakdown(!showReturnsBreakdown)}
                        className="px-2.5 py-1 text-[11px] font-bold bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark border border-line dark:border-line-dark rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>{showReturnsBreakdown ? 'إخفاء تفاصيل المرتجع' : 'عرض تفاصيل المرتجع'}</span>
                        {showReturnsBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-2.5 bg-canvas dark:bg-canvas-dark p-3 rounded-xl border border-line/70 dark:border-line-dark/70 text-xs shrink-0">
                <div>
                  <span className="text-ink-muted dark:text-ink-dark-muted text-[11px]">وقت الفاتورة: </span>
                  <span className="text-ink dark:text-ink-dark font-bold tabular-nums font-mono text-[11px]">
                    {selectedSale.createdAt ? new Date(selectedSale.createdAt).toLocaleString('ar-EG-u-nu-latn') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted dark:text-ink-dark-muted text-[11px]">طريقة الدفع: </span>
                  <span className="text-ink dark:text-ink-dark font-bold">
                    {selectedSale.paymentMethod === 'cash' ? 'كاش' : selectedSale.paymentMethod === 'credit' ? 'شكك (على النوتة)' : selectedSale.paymentMethod === 'instapay' ? 'انستاباي (InstaPay)' : selectedSale.paymentMethod === 'vodafone_cash' ? 'محفظة إلكترونية' : 'إلكتروني'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted dark:text-ink-dark-muted text-[11px]">الزبون: </span>
                  <span className="text-ink dark:text-ink-dark font-bold">
                    {selectedSale.customerName || 'زبون عادي (كاش)'}
                  </span>
                  {selectedSale.customerPhone && (
                    <span className="text-ink-muted dark:text-ink-dark-muted text-[11px] font-mono mr-1">({selectedSale.customerPhone})</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-muted dark:text-ink-dark-muted text-[11px]">الكاشير: </span>
                  <span className="text-ink dark:text-ink-dark font-bold inline-flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 px-2 py-0.5 rounded-md border border-line dark:border-line-dark text-xs">
                    <User className="w-3 h-3 text-paid dark:text-brand-bright shrink-0" />
                    <span>{formatCashierName(selectedSale.cashierName, selectedSale.cashierId)}</span>
                  </span>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden bg-surface dark:bg-surface-dark shadow-2xs shrink-0">
                <div className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 py-2.5 text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted grid grid-cols-12 gap-2 select-none">
                  <span className="col-span-5">اسم الصنف</span>
                  <span className="col-span-2 text-center">العدد / الوزن</span>
                  <span className="col-span-2 text-center">سعر البيع</span>
                  <span className="col-span-3 text-left pl-1">الإجمالي</span>
                </div>

                <div className="divide-y divide-line/60 dark:divide-line-dark/60">
                  {loadingDetails ? (
                    <div className="p-4 text-center text-ink-muted dark:text-ink-dark-muted flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-brand dark:text-brand-bright" />
                      <span>بنحمّل أصناف الفاتورة...</span>
                    </div>
                  ) : selectedSale.items && selectedSale.items.length > 0 ? (
                    selectedSale.items.map((item, idx) => {
                      const retInfo = returnedInfoByProduct[item.productId];
                      const origQty = item.unit === 'kg' ? item.quantityMilli / 1000 : Math.round(item.quantityMilli / 1000);
                      const unitStr = item.unit === 'kg' ? 'كجم' : 'قطعة';
                      const remainingQty = retInfo ? Math.max(0, origQty - retInfo.returnedPieces) : origQty;
                      const netLineTotal = Math.round(remainingQty * item.unitPricePiasters);

                      return (
                        <div key={item.id || idx} className={`px-4 py-3 text-xs grid grid-cols-12 items-center gap-2 transition-colors ${
                          retInfo ? 'bg-warn-soft/40 dark:bg-warn-dark-soft/40' : 'hover:bg-canvas/50 dark:hover:bg-surface-dark-2/50'
                        }`}>
                          <div className="col-span-5 min-w-0">
                            <div className="font-bold text-ink dark:text-ink-dark leading-snug break-words" title={item.productName}>
                              {item.productName}
                            </div>
                            <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1">
                              {item.barcode && <span className="font-mono tabular-nums text-[10px] text-ink-muted/80 dark:text-ink-dark-muted/80">{item.barcode}</span>}
                              {retInfo && (
                                <span className="inline-flex items-center text-warn dark:text-warn-bright font-bold bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 px-2 py-0.5 rounded-full text-[10px]">
                                  رجع منه {retInfo.returnedPieces} {unitStr}
                                  {retInfo.hasDamaged && ' (تالف)'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="col-span-2 text-center font-mono tabular-nums text-ink dark:text-ink-dark">
                            {retInfo ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="line-through text-ink-muted/60 dark:text-ink-dark-muted/60 text-[10px] leading-tight">{origQty} {unitStr}</span>
                                <span className="font-bold text-paid dark:text-brand-bright text-xs leading-tight">{remainingQty} {unitStr}</span>
                              </div>
                            ) : (
                              <span className="font-bold text-xs">{origQty} {unitStr}</span>
                            )}
                          </div>

                          <div className="col-span-2 text-center font-mono tabular-nums text-ink dark:text-ink-dark font-semibold text-xs">
                            {formatArabicCurrency(item.unitPricePiasters)}
                          </div>

                          <div className="col-span-3 text-left pl-1 font-mono tabular-nums">
                            {retInfo ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="line-through text-ink-muted/60 dark:text-ink-dark-muted/60 text-[10px] leading-tight">{formatArabicCurrency(item.totalPiasters)}</span>
                                <span className="font-black text-brand dark:text-brand-bright text-xs leading-tight">{formatArabicCurrency(netLineTotal)}</span>
                              </div>
                            ) : (
                              <span className="font-black text-brand dark:text-brand-bright text-xs">{formatArabicCurrency(item.totalPiasters)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-ink-muted dark:text-ink-dark-muted text-xs">
                      أصناف الفاتورة محفوظة ومسجلة في السيستم
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed Returns Log Section */}
              {showReturnsBreakdown && saleReturns.length > 0 && (
                <div className="border border-warn/20 dark:border-warn-bright/30 bg-warn-soft/40 dark:bg-surface-dark-2 rounded-xl overflow-hidden flex flex-col gap-2.5 p-3.5 shrink-0">
                  <div className="flex items-center justify-between border-b border-warn/20 dark:border-warn-bright/30 pb-2.5">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-warn dark:text-warn-bright" />
                      <span className="font-bold text-xs text-ink dark:text-ink-dark">
                        سجل عمليات المرتجع التابعة للفاتورة
                      </span>
                    </div>
                    <span className="text-xs text-warn dark:text-warn-bright font-mono font-bold">
                      إجمالي المسترد: {formatArabicCurrency(totalRefundedPiasters)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {saleReturns.map((ret, idx) => (
                      <div key={ret.id || idx} className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 flex flex-col gap-2 shadow-2xs text-xs">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark">
                            <span className="font-mono">وصل مرتجع #{ret.returnNumber}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30">
                              {ret.refundMethod === 'credit' ? 'خصم من حسابه الشكك' : 'كاش من الدرج'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-warn dark:text-warn-bright text-sm">
                              {formatArabicCurrency(ret.totalPiasters)}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handlePrintReturnReceipt(ret.id)}
                              className="h-6.5 px-2.5 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface-3 dark:hover:bg-surface-dark text-ink dark:text-ink-dark border border-line dark:border-line-dark rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="طباعة إيصال هذا المرتجع"
                            >
                              <Printer className="w-3 h-3" />
                              <span>طباعة وصل</span>
                            </button>
                          </div>
                        </div>

                        <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted flex items-center flex-wrap gap-3">
                          <span>التاريخ: {ret.createdAt ? new Date(ret.createdAt).toLocaleString('ar-EG-u-nu-latn') : '—'}</span>
                          {ret.reason && <span>السبب: <strong className="text-ink dark:text-ink-dark">{ret.reason}</strong></span>}
                        </div>

                        {/* Returned Items in this receipt */}
                        {ret.items && ret.items.length > 0 && (
                          <div className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg p-2 flex flex-col gap-1.5 text-xs">
                            {ret.items.map((ritem, rIdx) => (
                              <div key={ritem.id || rIdx} className="flex justify-between items-center py-1.5 px-2.5 rounded-md bg-surface dark:bg-surface-dark-3 border border-line/60 dark:border-line-dark/60 text-ink dark:text-ink-dark">
                                <span className="font-medium text-ink dark:text-ink-dark flex items-center gap-1.5 flex-wrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-warn dark:bg-warn-bright shrink-0" />
                                  <span className="font-bold">{ritem.productName}</span>
                                  <span className="text-ink-muted dark:text-ink-dark-muted font-mono font-bold text-[11px]">
                                    × {ritem.unit === 'kg' ? (ritem.quantityMilli / 1000).toFixed(3) : ritem.quantityMilli / 1000} {ritem.unit === 'kg' ? 'كجم' : 'قطعة'}
                                  </span>
                                  {ritem.isDamaged && (
                                    <span className="text-danger font-bold text-[10px] bg-danger/10 px-1.5 py-0.2 rounded border border-danger/20">
                                      تالف
                                    </span>
                                  )}
                                </span>
                                <span className="font-mono font-bold text-amber-900 dark:text-warn-bright shrink-0">
                                  {formatArabicCurrency(ritem.totalPiasters)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial Totals */}
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3.5 shadow-2xs flex flex-col gap-2 text-xs shrink-0">
                <div className="flex justify-between text-ink-muted dark:text-ink-dark-muted">
                  <span>إجمالي الأصناف قبل الخصم:</span>
                  <span className="text-ink dark:text-ink-dark font-mono font-bold tabular-nums">{formatArabicCurrency(selectedSale.subtotalPiasters)}</span>
                </div>
                {selectedSale.discountPiasters > 0 && (
                  <div className="flex justify-between text-danger font-semibold">
                    <span>الخصم:</span>
                    <span className="font-mono tabular-nums">−{formatArabicCurrency(selectedSale.discountPiasters)}</span>
                  </div>
                )}
                {selectedSale.taxPiasters > 0 && (
                  <div className="flex justify-between text-ink-muted dark:text-ink-dark-muted">
                    <span>الضريبة:</span>
                    <span className="font-mono tabular-nums">{formatArabicCurrency(selectedSale.taxPiasters)}</span>
                  </div>
                )}
                <div className="flex justify-between text-ink dark:text-ink-dark font-bold pt-1.5 border-t border-line/60 dark:border-line-dark/60">
                  <span>إجمالي الفاتورة:</span>
                  <span className="text-ink dark:text-ink-dark font-mono font-bold tabular-nums">{formatArabicCurrency(selectedSale.totalPiasters)}</span>
                </div>

                {totalRefundedPiasters > 0 && (
                  <div className="flex justify-between text-warn dark:text-warn-bright font-bold bg-warn-soft dark:bg-warn-dark-soft px-2.5 py-1.5 rounded-lg border border-warn/20 dark:border-warn-bright/30">
                    <span>فلوس المرتجع اللي رجعت:</span>
                    <span className="tabular-nums font-mono font-bold">−{formatArabicCurrency(totalRefundedPiasters)}</span>
                  </div>
                )}

                <div className="flex justify-between font-black text-base text-brand dark:text-brand-bright pt-2 border-t border-line dark:border-line-dark">
                  <span>{totalRefundedPiasters > 0 ? 'الصافي بعد المرتجع:' : 'المطلوب دفعه:'}</span>
                  <span className="tabular-nums font-mono">{formatArabicCurrency(netSalePiasters)}</span>
                </div>

                <div className="flex justify-between text-ink-muted dark:text-ink-dark-muted text-[11px] pt-1.5 border-t border-line/60 dark:border-line-dark/60">
                  <span>الفلوس اللي دفعها الزبون:</span>
                  <span className="text-ink dark:text-ink-dark font-semibold font-mono tabular-nums">{formatArabicCurrency(selectedSale.paidPiasters)}</span>
                </div>
              </div>

              {/* Reprint feedback toast */}
              {reprintFeedback && (
                <div className="bg-brand-soft dark:bg-surface-dark-3 border border-brand/30 dark:border-brand-bright/30 rounded-xl p-2.5 text-xs text-brand dark:text-brand-bright font-semibold flex items-center gap-2 shrink-0">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-brand dark:text-brand-bright" />
                  <span>{reprintFeedback}</span>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="h-[52px] bg-surface-2 dark:bg-surface-dark-2 hairline-t dark:border-line-dark px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {selectedSale.status !== 'cancelled' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowReturnModal(true)}
                      className="h-[32px] px-3 bg-warn-soft dark:bg-warn-dark-soft hover:bg-warn/20 dark:hover:bg-warn-dark-soft/80 text-warn dark:text-warn-bright border border-warn/30 dark:border-warn-bright/40 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="تسجيل مرتجع جزئي أو كلي لهذه الفاتورة"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>مرتجع بضاعة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      className="h-[32px] px-3 bg-danger-soft dark:bg-danger-dark-soft hover:bg-danger/20 dark:hover:bg-danger-dark-soft/80 text-danger dark:text-danger-bright border border-danger/30 dark:border-danger-bright/40 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="إلغاء الفاتورة بالكامل وإرجاع الأصناف للمخزون"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>إلغاء الفاتورة</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void requestCloseSaleDetails()}
                  className="h-[36px] px-4 bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded text-[12px] font-semibold transition-colors cursor-pointer"
                >
                  رجوع
                </button>
                <button
                  type="button"
                  onClick={() => void handleReprint()}
                  disabled={isReprinting}
                  className="h-[36px] px-4 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  title="طباعة إيصال يحمل علامة نسخة طبق الأصل وتوثيقه في السجل"
                >
                  <Printer className={`w-4 h-4 ${isReprinting ? 'animate-spin' : ''}`} />
                  <span>{isReprinting ? 'جاري الطباعة...' : 'طباعة وصل تاني'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Void / Cancel Invoice Modal (Modal 4 UI Standard) */}
      <VoidInvoiceModal
        isOpen={showCancelModal}
        sale={selectedSale}
        onClose={() => setShowCancelModal(false)}
        onCancelled={handleSaleCancelled}
      />

      {/* Return Modal (Refund / Credit) */}
      <ReturnModal
        isOpen={showReturnModal}
        initialSale={selectedSale}
        onClose={() => setShowReturnModal(false)}
        onReturnCompleted={handleReturnCompleted}
      />
    </div>
  );
};
