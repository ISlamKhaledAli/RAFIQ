import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  FileText, 
  RefreshCw, 
  Clock, 
  TrendingUp, 
  Receipt,
  X,
  Printer,
  AlertCircle,
  CheckCircle2,
  Download,
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
import { saveReceiptImageWithNotice } from '../utils/reportNotice';
import type { Sale, Return } from '../types/models';
import { formatArabicCurrency, totalSaleDiscountPiasters } from '../utils/money';
import { normalizeInvoiceSearchText } from '../utils/receiptLayout';
import { VoidInvoiceModal } from '../components/VoidInvoiceModal';
import { ReturnModal } from '../components/ReturnModal';
import { DateFilterControl } from '../components/DateFilterControl';
import { ClearFiltersButton } from '../components/ClearFiltersButton';
import { PaginationBar } from '../components/PaginationBar';
import { useClientPagination } from '../utils/usePagination';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { RafiqLoadingState } from '../components/RafiqLoadingState';
import { useSmoothLoading } from '../utils/useSmoothLoading';
import { useAuth } from '../context/useAuth';
import { useDateFilter, useToday, isDateFilterActive, describeDateFilter, getDateFilterKey } from '../utils/dateFilter';
import { formatUnitArabic } from '../utils/units';
import { formatPhoneDisplay } from '../utils/phoneFormat';
import { buildSalesHistoryQuery, summarizeSales, SALES_HISTORY_LIMIT, type SalesStatusFilter } from '../utils/salesHistoryFilter';

import { AppButton } from '../components/AppButton';
import { SearchInput } from '../components/SearchInput';
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

const DETAILS_PAYMENT_LABEL: Record<string, string> = {
  cash: 'كاش',
  credit: 'شكك (على النوتة)',
  instapay: 'إنستاباي',
  vodafone_cash: 'محفظة إلكترونية',
};

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 min-h-9 min-w-0">
    <span className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted shrink-0">{label}</span>
    <div className="min-w-0 text-sm font-bold text-ink dark:text-ink-dark flex items-center gap-1.5 flex-wrap justify-end">{children}</div>
  </div>
);

const DETAILS_CHIP_BASE = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0';
const DETAILS_CHIP_PAID = `${DETAILS_CHIP_BASE} bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-brand-bright border-paid/20 dark:border-paid/30`;
const DETAILS_CHIP_WARN = `${DETAILS_CHIP_BASE} bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30`;
const DETAILS_CHIP_DANGER = `${DETAILS_CHIP_BASE} bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30`;
export const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({ isActive = true }) => {
  const { hasPermission } = useAuth();
  const canReturn = hasPermission('returns.create');
  const canCancelInvoice = hasPermission('invoices.cancel');
  const canReprint = hasPermission('pos.reprint');
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SalesStatusFilter>('all');
  const { dateFilter, setDateFilter, filterDate, resetDateFilter } = useDateFilter();
  // Re-evaluates relative presets (today / last 7 days / this month) when the day rolls over
  const today = useToday();
  const dateActive = isDateFilterActive(dateFilter);
  const loadQuery = useMemo(
    () => buildSalesHistoryQuery(dateFilter, statusFilter, today),
    [dateFilter, statusFilter, today]
  );
  const loadSeqRef = useRef(0);
  const [reprintFeedback, setReprintFeedback] = useState<string | null>(null);
  const [isReprinting, setIsReprinting] = useState(false);
  const [reprintFailed, setReprintFailed] = useState(false);
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
      setReprintFeedback('تم إرسال إيصال المرتجع للطابعة');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال أمر الطباعة';
      setReprintFeedback('تنبيه: ' + msg);
    }
  };

  const handleSaleCancelled = (cancelled: Sale) => {
    setSelectedSale(cancelled);
    setSales((prev) => prev.map((s) => (s.id === cancelled.id ? cancelled : s)));
    setShowCancelModal(false);
    setReprintFeedback('تم إلغاء الفاتورة وإرجاع الأصناف للمخزون');
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
    setReprintFeedback('تم تسجيل المرتجع');
  };

  // Date range and status are sent to the backend, so the row cap never hides older matching invoices
  const loadSales = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setSearchError(null);
    try {
      const res = await invoke<Sale[]>('sales:getRecent', loadQuery);
      if (seq !== loadSeqRef.current) return;
      setSales(Array.isArray(res) ? res : []);
    } catch (err: unknown) {
      if (seq !== loadSeqRef.current) return;
      console.error(err);
      setSearchError('تعذر تحميل قائمة الفواتير من قاعدة البيانات');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [loadQuery]);

  useEffect(() => {
    if (isActive !== false) {
      void loadSales();
    }
  }, [isActive, loadSales]);

  // A wedge barcode scanner types into the focused field: keep the search box focused so a receipt barcode can be scanned right away
  useEffect(() => {
    if (isActive !== false && !selectedSale) searchInputRef.current?.focus();
  }, [isActive, selectedSale]);

  useDataSubscription(['sales', 'all'], () => {
    void loadSales();
  });

  const handleOpenDetails = async (sale: Sale) => {
    setSelectedSale(sale);
    setReprintFeedback(null);
    setSaleReturns([]);
    setShowReturnsBreakdown(true);

    const sId = sale.id;
    if (sId && canReturn) {
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
          if (!sId && fullSale.id && canReturn) {
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
    // The receipt barcode is the invoice number padded to 8 digits: "00001042" searches invoice 1042
    const raw = normalizeInvoiceSearchText(searchQuery);
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

    const notFoundMessage = `لم يتم العثور على أي فاتورة مطابقة لـ "${searchQuery}"${dateActive ? ` خلال ${describeDateFilter(dateFilter)}` : ''}`;

    // 2. Perform backend search via sales:search (same date range and status as the list)
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const results = await invoke<Sale[]>('sales:search', { query: raw, ...loadQuery });
      if (seq !== loadSeqRef.current) return;
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
          setSearchError(notFoundMessage);
        }
      } else {
        setSearchError(notFoundMessage);
      }
    } catch {
      setSearchError(notFoundMessage);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  // Task 133-3: Reprint receipt with copy watermark and audit log
  const handleReprint = useCallback(async () => {
    if (!selectedSale || isReprinting || loadingDetails) return;
    setIsReprinting(true);
    setReprintFeedback(null);
    setReprintFailed(false);
    try {
      const res = await invoke<{ success: boolean; message: string }>('printer:printReceipt', {
        saleId: selectedSale.id,
        isCopy: true
      });
      if (res && res.success) {
        setReprintFeedback('تمت إعادة طباعة النسخة');
      } else {
        setReprintFeedback(res?.message || 'تم إرسال أمر طباعة النسخة.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال أمر الطباعة';
      setReprintFeedback('تعذرت الطباعة: ' + msg);
      setReprintFailed(true);
    } finally {
      setIsReprinting(false);
    }
  }, [selectedSale, isReprinting, loadingDetails]);

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
    if (!filterDate(s.createdAt)) return false;

    // 3. Search Query (Invoice #, customer name/phone, notes, amount)
    if (searchQuery.trim()) {
      const q = normalizeInvoiceSearchText(searchQuery).toLowerCase();
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

  // Summary Metrics calculations (Integer arithmetic) over exactly the rows on screen
  const {
    totalPiasters: totalSalesPiasters,
    invoiceCount,
    averagePiasters: averageInvoicePiasters,
  } = summarizeSales(filteredSales);
  const anyFilterActive = dateActive || statusFilter !== 'all' || Boolean(searchQuery.trim());
  const resetAllFilters = () => {
    resetDateFilter();
    setStatusFilter('all');
    setSearchQuery('');
    setSearchError(null);
  };

  // Pagination state
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedSales,
  } = useClientPagination(filteredSales, 25, `${searchQuery}_${statusFilter}_${getDateFilterKey(dateFilter)}`);

  return (
    <div className="flex flex-col h-full bg-canvas dark:bg-canvas-dark p-3 sm:p-3.5 gap-2.5 sm:gap-3 overflow-hidden select-none">
      {/* 1. Stat Summary Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
        {/* Card 1: Total Sales */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">إجمالي مبيعات الفترة</span>
            <div className="text-xl xl:text-2xl font-black font-mono whitespace-nowrap text-paid dark:text-brand-bright tabular-nums tracking-tight">
              {formatArabicCurrency(totalSalesPiasters)}
            </div>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted block mt-0.5">فواتير سليمة مش ملغية</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-brand-bright border border-paid/20 dark:border-paid/30 flex items-center justify-center shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Invoice Count */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">عدد الفواتير</span>
            <div className="t-kpi-lg font-mono text-ink dark:text-ink-dark tracking-tight">
              {invoiceCount}
            </div>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted block mt-0.5">حسب التصفية والبحث</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark flex items-center justify-center shadow-2xs">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Average Ticket */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">متوسط الفاتورة الواحدة</span>
            <div className="text-xl xl:text-2xl font-black font-mono whitespace-nowrap text-brand-dark dark:text-brand-bright tabular-nums tracking-tight">
              {formatArabicCurrency(averageInvoicePiasters)}
            </div>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted block mt-0.5">لكل زبون اشترى</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-surface-dark-3 text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center shadow-2xs">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Actions & Refresh */}
        <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-3 sm:p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">دفتر وسجل الفواتير</span>
            <div className="text-xs font-bold text-ink dark:text-ink-dark mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-paid dark:bg-brand-bright animate-pulse"></span>
              <span>محفوظ ومأمن في السيستم</span>
            </div>
            <span className="text-micro text-ink-muted dark:text-ink-dark-muted block mt-0.5">شغال أوفلاين بدون نت</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AppButton
              variant="secondary"
              icon={HelpCircle}
              onClick={() => openHelpCenter('sales')}
              title="دليل وشروحات المبيعات والورديات والإغلاق اليومي"
              aria-label="دليل وشروحات المبيعات والورديات والإغلاق اليومي"
            />
          </div>
        </div>
      </div>

      {/* 2. Comprehensive Search & Filter Toolbar */}
      <div className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 sm:gap-y-2.5 shrink-0 shadow-xs">
        {/* Search input with Enter key trigger */}
        <SearchInput
          ref={searchInputRef}
          size="sm"
          value={searchQuery}
          onChange={setSearchQuery}
          onFocus={(e) => e.currentTarget.select()}
          onSubmit={() => void handleSearchInvoice()}
          onClear={() => {
            setSearchQuery('');
            setSearchError(null);
          }}
          placeholder="امسح باركود الفاتورة (RFQ-INV-...) أو ابحث بالرقم أو العميل..."
          ariaLabel="بحث في فواتير البيع"
          className="flex-1 min-w-[220px] max-w-lg"
        />

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* Date Filter Control */}
        <DateFilterControl
          value={dateFilter}
          onChange={setDateFilter}
          variant="pills"
          size="sm"
        />

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all' 
                ? 'bg-brand text-white dark:bg-brand-dark-soft dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40 shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'completed' 
                ? 'bg-paid text-white dark:bg-paid-dark-soft dark:text-paid-bright dark:ring-1 dark:ring-inset dark:ring-paid-bright/40 shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            فواتير سليمة
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('cancelled')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'cancelled' 
                ? 'bg-danger text-white dark:bg-danger-dark-soft dark:text-danger-bright dark:ring-1 dark:ring-inset dark:ring-danger-bright/40 shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            فواتير ملغية
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('refunded')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'refunded' 
                ? 'bg-warn-bright text-ink dark:bg-warn-dark-soft dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40 shadow-xs' 
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-warn-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            فيها مرتجع
          </button>
        </div>

        <ClearFiltersButton
          active={anyFilterActive}
          onClick={resetAllFilters}
          title="إلغاء البحث والفترة والحالة والرجوع لكل الفواتير"
        />
        </div>
        {searchError && (
          <div className="w-full flex items-center gap-1.5 text-xs text-danger dark:text-danger-bright font-semibold bg-danger-soft dark:bg-danger-dark-soft p-2 rounded-xl border border-danger/20 dark:border-danger-bright/30">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {sales.length >= SALES_HISTORY_LIMIT && (
        <div className="flex items-center gap-1.5 text-xs text-warn dark:text-warn-bright font-semibold bg-warn-soft dark:bg-warn-dark-soft p-2 rounded-xl border border-warn/20 dark:border-warn-bright/30 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{`المعروض أحدث ${SALES_HISTORY_LIMIT} فاتورة فقط. حدد فترة أضيق عشان تشوف الباقي.`}</span>
        </div>
      )}

      {/* 3. Invoices Ledger Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 grid grid-cols-12 items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted shrink-0 select-none">
          <span className="col-span-2">رقم الفاتورة</span>
          <span className="col-span-2">وقت وتاريخ الفاتورة</span>
          <span className="col-span-2">الزبون</span>
          <span className="col-span-2 text-center">طريقة الدفع والحالة</span>
          <span className="col-span-1 text-center">الخصم (ج.م)</span>
          <span className="col-span-2 text-left pl-2">الإجمالي (ج.م)</span>
          <span className="col-span-1 text-center">إجراء</span>
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
              <p className="text-sm font-semibold text-ink dark:text-ink-dark m-0">
                {anyFilterActive
                  ? (dateActive ? `مفيش فواتير مطابقة خلال ${describeDateFilter(dateFilter)}` : 'مفيش فواتير مطابقة للي بتدور عليه')
                  : 'لسه مفيش فواتير بيع اتسجلت'}
              </p>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0">
                {searchQuery ? 'اتأكد من رقم الفاتورة أو اسم الزبون واضغط Enter' : anyFilterActive ? 'جرب فترة تانية أو ألغي التصفية' : 'روح لشاشة الكاشير عشان تفتح فاتورة وتبيع'}
              </p>
              {anyFilterActive && (
                <AppButton variant="primary" size="sm" icon={RotateCcw} className="mt-1" onClick={resetAllFilters}>
                  مسح التصفية وعرض كل الفواتير
                </AppButton>
              )}
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
                    isCancelled ? 'text-danger dark:text-danger-bright line-through' : 'text-brand-dark dark:text-brand-bright'
                  }`}>
                    <span>#{sale.invoiceNumber}</span>
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
                      <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30 flex items-center gap-1">
                        <Ban className="w-3 h-3" />
                        <span>ملغية</span>
                      </span>
                    ) : isRefunded ? (
                      <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30">
                        {sale.status === 'partially_refunded' ? 'مرتجع جزئي' : 'مستردة بالكامل'}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-micro font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-brand-bright border border-paid/20 dark:border-paid/30">
                        {sale.paymentMethod === 'cash' ? 'كاش' : sale.paymentMethod === 'credit' ? 'شكك' : sale.paymentMethod === 'instapay' ? 'انستاباي' : sale.paymentMethod === 'vodafone_cash' ? 'محفظة' : 'إلكتروني'}
                      </span>
                    )}
                  </div>

                  {/* Discount */}
                  <span className="col-span-1 text-center font-mono text-ink-muted dark:text-ink-dark-muted text-xs tabular-nums">
                    {totalSaleDiscountPiasters(sale) > 0 ? formatArabicCurrency(totalSaleDiscountPiasters(sale), false) : '—'}
                  </span>

                  {/* Total Piasters */}
                  {(() => {
                    const refunded = sale.refundedPiasters || 0;
                    const hasRefund = isRefunded || refunded > 0;
                    const netTotal = isRefunded && sale.status === 'refunded' && refunded === 0
                      ? 0
                      : Math.max(0, sale.totalPiasters - refunded);

                    if (isCancelled) {
                      return (
                        <span className="col-span-2 text-left pl-2 font-mono font-bold text-xs tabular-nums text-ink-muted dark:text-ink-dark-muted line-through">
                          {formatArabicCurrency(sale.totalPiasters, false)}
                        </span>
                      );
                    }

                    if (hasRefund && (refunded > 0 || sale.status === 'refunded')) {
                      return (
                        <div className="col-span-2 text-left pl-2 font-mono tabular-nums leading-tight">
                          <span className="block line-through text-ink-muted/60 dark:text-ink-dark-muted/60 text-micro">
                            {formatArabicCurrency(sale.totalPiasters, false)}
                          </span>
                          <span className={`block font-bold text-xs ${netTotal > 0 ? 'text-paid dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                            {formatArabicCurrency(netTotal, false)}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <span className="col-span-2 text-left pl-2 font-mono font-bold text-xs tabular-nums text-paid dark:text-paid-bright">
                        {formatArabicCurrency(sale.totalPiasters, false)}
                      </span>
                    );
                  })()}

                  {/* Action View */}
                  <div className="col-span-1 flex justify-center">
                    <AppButton
                      variant="secondary"
                      size="xs"
                      icon={Receipt}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleOpenDetails(sale);
                      }}
                      title="عرض بنود وتفاصيل الفاتورة"
                      aria-label="عرض بنود وتفاصيل الفاتورة"
                    >
                      تفاصيل
                    </AppButton>
                  </div>
                </div>
              );
            })
          )}
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
          <div className="w-full max-w-4xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col select-none max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="h-14 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-5 sm:px-6 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-surface-dark-3 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">
                      تفاصيل وبيانات فاتورة #{selectedSale.invoiceNumber}
                    </h3>
                    {selectedSale.status === 'cancelled' ? (
                      <span className={DETAILS_CHIP_DANGER}>
                        <Ban className="w-3 h-3" />
                        <span>ملغية</span>
                      </span>
                    ) : selectedSale.status === 'refunded' || selectedSale.status === 'partially_refunded' || saleReturns.length > 0 ? (
                      <span className={DETAILS_CHIP_WARN}>
                        <RotateCcw className="w-3 h-3" />
                        <span>فيها مرتجع</span>
                      </span>
                    ) : (
                      <span className={DETAILS_CHIP_PAID}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>سليمة</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted dark:text-ink-dark-muted tabular-nums leading-tight mt-0.5">
                    {selectedSale.createdAt ? new Date(selectedSale.createdAt).toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                  </div>
                </div>
              </div>
              <AppButton variant="subtle" size="sm" icon={X} onClick={() => void requestCloseSaleDetails()} title="إغلاق" aria-label="إغلاق" />
            </div>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 p-5 sm:p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar font-sans text-sm">
              {/* Cancelled Banner if applicable */}
              {selectedSale.status === 'cancelled' && (
                <div className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 rounded-xl p-4 flex items-start gap-3 text-danger dark:text-danger-bright shrink-0">
                  <Ban className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm">الفاتورة دي ملغية وبضاعتها رجعت للمخزن</div>
                    <div className="text-xs mt-1 text-danger/90 dark:text-danger-bright/90">
                      {selectedSale.notes || 'اتلغت ورجعت البضاعة للرصيد عشان الحسابات تظبط.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Refunded Banner if applicable */}
              {(selectedSale.status === 'refunded' || saleReturns.length > 0) && (
                <div className="bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl p-4 text-ink dark:text-ink-dark flex flex-col gap-2 shadow-2xs shrink-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-surface dark:bg-surface-dark-2 text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30">
                        <RotateCcw className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                          <span>اتسجل مرتجع بضاعة على الفاتورة دي</span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface dark:bg-surface-dark-2 text-warn dark:text-warn-bright font-bold border border-warn/20 dark:border-warn-bright/30">
                            {saleReturns.length} {saleReturns.length === 1 ? 'وصل مرتجع' : 'وصولات مرتجع'}
                          </span>
                        </div>
                        <div className="text-xs text-ink-muted dark:text-ink-dark-muted font-medium mt-1">
                          إجمالي الفلوس اللي رجعت للزبون: <strong className="font-bold font-mono text-warn dark:text-warn-bright">{formatArabicCurrency(totalRefundedPiasters)}</strong>
                        </div>
                      </div>
                    </div>

                    {saleReturns.length > 0 && (
                      <AppButton
                        variant="secondary"
                        size="sm"
                        icon={showReturnsBreakdown ? ChevronUp : ChevronDown}
                        iconPosition="end"
                        onClick={() => setShowReturnsBreakdown(!showReturnsBreakdown)}
                      >
                        {showReturnsBreakdown ? 'إخفاء تفاصيل المرتجع' : 'عرض تفاصيل المرتجع'}
                      </AppButton>
                    )}
                  </div>
                </div>
              )}

              {/* Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 bg-canvas dark:bg-canvas-dark px-4 py-3 rounded-xl border border-line/70 dark:border-line-dark/70 shrink-0">
                <DetailRow label="وقت الفاتورة">
                  <span className="tabular-nums font-mono">
                    {selectedSale.createdAt ? new Date(selectedSale.createdAt).toLocaleString('ar-EG-u-nu-latn') : '—'}
                  </span>
                </DetailRow>
                <DetailRow label="طريقة الدفع">
                  <span className={selectedSale.paymentMethod === 'credit' ? DETAILS_CHIP_WARN : DETAILS_CHIP_PAID}>
                    {DETAILS_PAYMENT_LABEL[selectedSale.paymentMethod] || 'إلكتروني'}
                  </span>
                </DetailRow>
                <DetailRow label="الزبون">
                  <span>{selectedSale.customerName || 'زبون عادي (كاش)'}</span>
                  {selectedSale.customerPhone && (
                    <span dir="ltr" className="text-ink-muted dark:text-ink-dark-muted text-xs font-mono">{formatPhoneDisplay(selectedSale.customerPhone)}</span>
                  )}
                </DetailRow>
                <DetailRow label="الكاشير">
                  <span className="inline-flex items-center gap-1.5 bg-surface-2 dark:bg-surface-dark-2 px-2.5 py-1 rounded-lg border border-line dark:border-line-dark">
                    <User className="w-3.5 h-3.5 text-paid dark:text-brand-bright shrink-0" />
                    <span>{formatCashierName(selectedSale.cashierName, selectedSale.cashierId)}</span>
                  </span>
                </DetailRow>
              </div>

              {/* Items Breakdown Table */}
              <div className="border border-line dark:border-line-dark rounded-xl overflow-clip bg-surface dark:bg-surface-dark shadow-2xs shrink-0">
                <div className="sticky -top-5 sm:-top-6 z-10 h-11 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 text-xs font-bold text-ink-muted dark:text-ink-dark-muted grid grid-cols-12 gap-3 items-center select-none">
                  <span className="col-span-5">اسم الصنف</span>
                  <span className="col-span-2 text-center">العدد / الوزن</span>
                  <span className="col-span-2 text-center">سعر البيع</span>
                  <span className="col-span-3 text-left">الإجمالي</span>
                </div>

                <div className="divide-y divide-line/60 dark:divide-line-dark/60">
                  {loadingDetails ? (
                    <div className="p-5 text-sm text-center text-ink-muted dark:text-ink-dark-muted flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-brand dark:text-brand-bright" />
                      <span>بنحمّل أصناف الفاتورة...</span>
                    </div>
                  ) : selectedSale.items && selectedSale.items.length > 0 ? (
                    selectedSale.items.map((item, idx) => {
                      const retInfo = returnedInfoByProduct[item.productId];
                      const origQty = item.unit === 'kg' ? item.quantityMilli / 1000 : Math.round(item.quantityMilli / 1000);
                      const unitStr = formatUnitArabic(item.unit);
                      const remainingQty = retInfo ? Math.max(0, origQty - retInfo.returnedPieces) : origQty;
                      const netLineTotal = Math.round(remainingQty * item.unitPricePiasters);

                      return (
                        <div key={item.id || idx} className={`min-h-12 px-4 py-2.5 text-sm grid grid-cols-12 items-center gap-3 transition-colors ${
                          retInfo ? 'bg-warn-soft/40 dark:bg-warn-dark-soft/40' : 'hover:bg-canvas/50 dark:hover:bg-surface-dark-2/50'
                        }`}>
                          <div className="col-span-5 min-w-0">
                            <div className="text-sm font-semibold text-ink dark:text-ink-dark leading-snug break-words" title={item.productName}>
                              {item.productName}
                            </div>
                            <div className="flex items-center flex-wrap gap-1.5 text-xs text-ink-muted dark:text-ink-dark-muted mt-1 empty:hidden">
                              {item.barcode && <span className="font-mono tabular-nums text-xs text-ink-muted/80 dark:text-ink-dark-muted/80">{item.barcode}</span>}
                              {retInfo && (
                                <span className="inline-flex items-center text-warn dark:text-warn-bright font-bold bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 px-2 py-0.5 rounded-full text-xs">
                                  رجع منه {retInfo.returnedPieces} {unitStr}
                                  {retInfo.hasDamaged && ' (تالف)'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="col-span-2 text-center font-mono tabular-nums text-ink dark:text-ink-dark">
                            {retInfo ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="line-through text-ink-muted/60 dark:text-ink-dark-muted/60 text-xs leading-tight"><span dir="ltr">{origQty}</span> {unitStr}</span>
                                <span className="font-bold text-paid dark:text-brand-bright text-sm leading-tight"><span dir="ltr">{remainingQty}</span> {unitStr}</span>
                              </div>
                            ) : (
                              <span className="font-bold text-sm"><span dir="ltr">{origQty}</span> {unitStr}</span>
                            )}
                          </div>

                          <div className="col-span-2 text-center font-mono tabular-nums text-ink dark:text-ink-dark font-semibold text-sm">
                            {formatArabicCurrency(item.unitPricePiasters)}
                          </div>

                          <div className="col-span-3 text-left font-mono tabular-nums">
                            {retInfo ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="line-through text-ink-muted/60 dark:text-ink-dark-muted/60 text-xs leading-tight">{formatArabicCurrency(item.totalPiasters)}</span>
                                <span className="font-black text-brand dark:text-brand-bright text-sm leading-tight">{formatArabicCurrency(netLineTotal)}</span>
                              </div>
                            ) : (
                              <span className="font-black text-brand dark:text-brand-bright text-sm">{formatArabicCurrency(item.totalPiasters)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-ink-muted dark:text-ink-dark-muted text-sm">
                      أصناف الفاتورة محفوظة ومسجلة في السيستم
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed Returns Log Section */}
              {showReturnsBreakdown && saleReturns.length > 0 && (
                <div className="border border-warn/20 dark:border-warn-bright/30 bg-warn-soft/40 dark:bg-surface-dark-2 rounded-xl overflow-hidden flex flex-col gap-3 p-4 shrink-0">
                  <div className="flex items-center gap-2 border-b border-warn/20 dark:border-warn-bright/30 pb-3">
                    <RotateCcw className="w-5 h-5 text-warn dark:text-warn-bright" />
                    <span className="font-bold text-sm text-ink dark:text-ink-dark">
                      سجل عمليات المرتجع التابعة للفاتورة
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {saleReturns.map((ret, idx) => (
                      <div key={ret.id || idx} className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 flex flex-col gap-2.5 shadow-2xs text-sm">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark">
                            <span className="font-mono">وصل مرتجع #{ret.returnNumber}</span>
                            <span className={DETAILS_CHIP_WARN}>
                              {ret.refundMethod === 'credit' ? 'خصم من حسابه الشكك' : 'كاش من الدرج'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-black text-warn dark:text-warn-bright text-base tabular-nums">
                              {formatArabicCurrency(ret.totalPiasters)}
                            </span>
                            {canReprint && (
                            <AppButton
                              variant="secondary"
                              size="sm"
                              icon={Printer}
                              onClick={() => void handlePrintReturnReceipt(ret.id)}
                              title="طباعة إيصال هذا المرتجع"
                            >
                              إيصال المرتجع
                            </AppButton>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center flex-wrap gap-x-4 gap-y-1">
                          <span>التاريخ: {ret.createdAt ? new Date(ret.createdAt).toLocaleString('ar-EG-u-nu-latn') : '—'}</span>
                          {ret.reason && <span>السبب: <strong className="text-ink dark:text-ink-dark">{ret.reason}</strong></span>}
                        </div>

                        {/* Returned Items in this receipt */}
                        {ret.items && ret.items.length > 0 && (
                          <div className="bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg p-2 flex flex-col gap-1.5 text-sm">
                            {ret.items.map((ritem, rIdx) => (
                              <div key={ritem.id || rIdx} className="flex justify-between items-center gap-3 min-h-9 py-1.5 px-3 rounded-md bg-surface dark:bg-surface-dark-3 border border-line/60 dark:border-line-dark/60 text-ink dark:text-ink-dark">
                                <span className="font-medium text-ink dark:text-ink-dark flex items-center gap-1.5 flex-wrap min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-warn dark:bg-warn-bright shrink-0" />
                                  <span className="font-semibold">{ritem.productName}</span>
                                  <span className="text-ink-muted dark:text-ink-dark-muted font-mono font-bold text-xs">
                                    × {ritem.unit === 'kg' ? (ritem.quantityMilli / 1000).toFixed(3) : ritem.quantityMilli / 1000} {formatUnitArabic(ritem.unit)}
                                  </span>
                                  {ritem.isDamaged && (
                                    <span className="text-danger dark:text-danger-bright font-bold text-xs bg-danger-soft dark:bg-danger-dark-soft px-2 py-0.5 rounded-full border border-danger/20 dark:border-danger-bright/30">
                                      تالف
                                    </span>
                                  )}
                                </span>
                                <span className="font-mono font-bold text-warn dark:text-warn-bright shrink-0 tabular-nums">
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
              <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-2xs flex flex-col text-sm shrink-0 overflow-hidden divide-y divide-line/60 dark:divide-line-dark/60">
                {(totalSaleDiscountPiasters(selectedSale) > 0 || selectedSale.taxPiasters > 0) && (
                  <div className="flex items-center justify-between min-h-10 px-4 text-ink-muted dark:text-ink-dark-muted">
                    <span>إجمالي الأصناف قبل الخصم:</span>
                    <span className="text-ink dark:text-ink-dark font-mono font-bold tabular-nums">{formatArabicCurrency(selectedSale.subtotalPiasters)}</span>
                  </div>
                )}
                {totalSaleDiscountPiasters(selectedSale) > 0 && (
                  <div className="flex items-center justify-between min-h-10 px-4 text-danger dark:text-danger-bright font-semibold">
                    <span>الخصم:</span>
                    <span className="font-mono tabular-nums">−{formatArabicCurrency(totalSaleDiscountPiasters(selectedSale))}</span>
                  </div>
                )}
                {selectedSale.taxPiasters > 0 && (
                  <div className="flex items-center justify-between min-h-10 px-4 text-ink-muted dark:text-ink-dark-muted">
                    <span>الضريبة:</span>
                    <span className="font-mono tabular-nums">{formatArabicCurrency(selectedSale.taxPiasters)}</span>
                  </div>
                )}
                {totalRefundedPiasters > 0 && (
                  <div className="flex items-center justify-between min-h-10 px-4 text-ink dark:text-ink-dark font-bold">
                    <span>إجمالي الفاتورة:</span>
                    <span className="text-ink dark:text-ink-dark font-mono font-bold tabular-nums">{formatArabicCurrency(selectedSale.totalPiasters)}</span>
                  </div>
                )}

                {totalRefundedPiasters > 0 && (
                  <div className="flex items-center justify-between min-h-10 px-4 text-warn dark:text-warn-bright font-bold bg-warn-soft dark:bg-warn-dark-soft">
                    <span>فلوس المرتجع اللي رجعت:</span>
                    <span className="tabular-nums font-mono font-bold">−{formatArabicCurrency(totalRefundedPiasters)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between min-h-14 px-4 py-2 text-brand dark:text-brand-bright bg-brand-soft dark:bg-surface-dark-3">
                  <span className="font-black text-base">{totalRefundedPiasters > 0 ? 'الصافي بعد المرتجع:' : 'المطلوب دفعه:'}</span>
                  <span className="t-kpi font-mono">{formatArabicCurrency(netSalePiasters)}</span>
                </div>

                <div className="flex items-center justify-between min-h-10 px-4 text-ink-muted dark:text-ink-dark-muted">
                  <span>الفلوس اللي دفعها الزبون:</span>
                  <span className="text-ink dark:text-ink-dark font-semibold font-mono tabular-nums">{formatArabicCurrency(selectedSale.paidPiasters)}</span>
                </div>
              </div>

              {/* Reprint feedback toast */}
              {reprintFeedback && (
                <div className={`rounded-xl p-3 text-sm font-semibold flex items-center gap-2 shrink-0 border ${reprintFailed ? 'bg-warn-soft dark:bg-warn-dark-soft border-warn-border dark:border-warn-bright/30 text-warn dark:text-warn-bright' : 'bg-brand-soft dark:bg-surface-dark-3 border-brand/30 dark:border-brand-bright/30 text-brand dark:text-brand-bright'}`}>
                  {reprintFailed ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  <span>{reprintFeedback}</span>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="h-16 bg-surface-2 dark:bg-surface-dark-2 hairline-t dark:border-line-dark px-5 sm:px-6 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                {selectedSale.status !== 'cancelled' && (canReturn || canCancelInvoice) && (
                  <div className="flex items-center gap-2">
                    {canReturn && (
                    <AppButton
                      variant="warning"
                      icon={RotateCcw}
                      onClick={() => setShowReturnModal(true)}
                      title="تسجيل مرتجع جزئي أو كلي لهذه الفاتورة"
                    >
                      مرتجع بضاعة
                    </AppButton>
                    )}
                    {canCancelInvoice && (
                    <AppButton
                      variant="danger"
                      icon={Ban}
                      onClick={() => setShowCancelModal(true)}
                      title="إلغاء الفاتورة بالكامل وإرجاع الأصناف للمخزون"
                    >
                      إلغاء الفاتورة
                    </AppButton>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {canReprint && reprintFailed && (
                <AppButton
                  variant="secondary"
                  icon={Download}
                  onClick={() => void saveReceiptImageWithNotice(selectedSale.id, selectedSale.invoiceNumber || '---')}
                  title="حفظ نفس الإيصال كصورة في مجلد التقارير بدل الطباعة"
                >
                  حفظ كصورة
                </AppButton>
                )}
                {canReprint && (
                <AppButton
                  variant="primary"
                  icon={Printer}
                  onClick={() => void handleReprint()}
                  loading={isReprinting}
                  disabled={loadingDetails}
                  title="طباعة نسخة طبق الأصل من فاتورة البيع وتوثيقها في السجل"
                >
                  {isReprinting ? 'جاري الطباعة...' : 'طباعة نسخة الفاتورة'}
                </AppButton>
                )}
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
