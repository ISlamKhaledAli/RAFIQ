import { useState, useEffect } from 'react';
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
  HelpCircle,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { openHelpCenter } from '../utils/helpService';
import type { Sale } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { VoidInvoiceModal } from '../components/VoidInvoiceModal';
import { ReturnModal } from '../components/ReturnModal';

export const SalesHistoryView = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
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

  const handleSaleCancelled = (cancelled: Sale) => {
    setSelectedSale(cancelled);
    setSales((prev) => prev.map((s) => (s.id === cancelled.id ? cancelled : s)));
    setShowCancelModal(false);
    setReprintFeedback('تم إلغاء الفاتورة بنجاح، وإرجاع الأصناف للمخزون، وتوثيق العملية في سجل النظام.');
  };

  const handleReturnCompleted = () => {
    setShowReturnModal(false);
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
    void loadSales();
  }, []);

  const handleOpenDetails = async (sale: Sale) => {
    setSelectedSale(sale);
    setReprintFeedback(null);
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
  const handleReprint = async () => {
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
  };

  // Keyboard shortcut listener: F9 to reprint, Esc to close
  useEffect(() => {
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
  });

  // Client-side filtering across criteria (Tasks 133-1 & 133-2)
  const filteredSales = sales.filter((s) => {
    // 1. Status Filter
    if (statusFilter !== 'all') {
      const sStatus = s.status || 'completed';
      if (statusFilter === 'completed' && sStatus !== 'completed') return false;
      if (statusFilter === 'cancelled' && sStatus !== 'cancelled') return false;
      if (statusFilter === 'refunded' && sStatus !== 'refunded') return false;
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

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] p-3.5 gap-3 overflow-hidden select-none">
      {/* 1. Stat Summary Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {/* Card 1: Total Sales */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-[#52605D] block mb-1">إجمالي المبيعات النشطة</span>
            <div className="text-[22px] font-black font-mono text-[#006D41] tabular-nums tracking-tight">
              {formatArabicCurrency(totalSalesPiasters)}
            </div>
            <span className="text-[10px] text-[#52605D] block mt-0.5">الفواتير غير الملغاة</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#006D41] border border-emerald-200/80 flex items-center justify-center shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Invoice Count */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-[#52605D] block mb-1">عدد الفواتير المعروضة</span>
            <div className="text-[22px] font-black font-mono text-[#0F172A] tabular-nums tracking-tight">
              {invoiceCount}
              <span className="text-xs font-bold text-[#52605D] mr-1">فاتورة</span>
            </div>
            <span className="text-[10px] text-[#52605D] block mt-0.5">وفق معايير التصفية</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-[#52605D] border border-slate-200 flex items-center justify-center shadow-2xs">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Average Ticket */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-[#52605D] block mb-1">متوسط قيمة الفاتورة</span>
            <div className="text-[22px] font-black font-mono text-[#004D3F] tabular-nums tracking-tight">
              {formatArabicCurrency(averageInvoicePiasters)}
            </div>
            <span className="text-[10px] text-[#52605D] block mt-0.5">لكل عملية بيع</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#004D3F] border border-emerald-200 flex items-center justify-center shadow-2xs">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Actions & Refresh */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold text-[#52605D] block mb-1">سجل الفواتير وقاعدة البيانات</span>
            <div className="text-[12px] font-bold text-[#0F172A] mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>سجل محمي بوضع WAL</span>
            </div>
            <span className="text-[10px] text-[#52605D] block mt-0.5">معاملات ذرية فورية</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openHelpCenter('sales')}
              className="w-10 h-10 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F4] border border-[#E2E8F0] text-[#006D41] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="دليل وشروحات المبيعات والورديات والإغلاق اليومي (F1)"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => void loadSales()}
              disabled={loading}
              className="w-10 h-10 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F4] border border-[#E2E8F0] text-[#52605D] hover:text-[#0F172A] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#006D41]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Comprehensive Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0 shadow-xs">
        {/* Search input with Enter key trigger */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-lg relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#52605D]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void handleSearchInvoice();
              }
            }}
            placeholder="بحث برقم الفاتورة، اسم العميل، ملاحظات، أو المبلغ..."
            className="w-full h-9 pr-9 pl-8 text-xs bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] placeholder:text-[#52605D] focus:outline-none focus:ring-2 focus:ring-[#006D41]/20 focus:border-[#006D41] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchError(null);
              }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52605D] hover:text-[#0F172A] cursor-pointer"
              title="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Date Filter Pills */}
        <div className="flex items-center gap-1 bg-[#F1F5F4] p-1 rounded-xl border border-[#E2E8F0] text-xs">
          <button
            onClick={() => setDateFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'all' 
                ? 'bg-[#00372D] text-white shadow-xs' 
                : 'text-[#52605D] hover:text-[#004D3F] hover:bg-white/60'
            }`}
          >
            الكل
          </button>
          <button
            onClick={() => setDateFilter('today')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'today' 
                ? 'bg-[#00372D] text-white shadow-xs' 
                : 'text-[#52605D] hover:text-[#004D3F] hover:bg-white/60'
            }`}
          >
            اليوم
          </button>
          <button
            onClick={() => setDateFilter('yesterday')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'yesterday' 
                ? 'bg-[#00372D] text-white shadow-xs' 
                : 'text-[#52605D] hover:text-[#004D3F] hover:bg-white/60'
            }`}
          >
            الأمس
          </button>
          <button
            onClick={() => setDateFilter('week')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'week' 
                ? 'bg-[#00372D] text-white shadow-xs' 
                : 'text-[#52605D] hover:text-[#004D3F] hover:bg-white/60'
            }`}
          >
            آخر 7 أيام
          </button>
          <button
            onClick={() => setDateFilter('custom')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
              dateFilter === 'custom' 
                ? 'bg-[#00372D] text-white shadow-xs' 
                : 'text-[#52605D] hover:text-[#004D3F] hover:bg-white/60'
            }`}
            title="تحديد تاريخ معين"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>تاريخ</span>
          </button>
        </div>

        {/* Custom date input if active */}
        {dateFilter === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="h-9 px-3 text-xs bg-white rounded-xl border border-[#006D41] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#006D41]/20 font-mono shadow-xs"
          />
        )}

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-[#F1F5F4] p-1 rounded-xl border border-[#E2E8F0] text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all' 
                ? 'bg-[#00372D] text-white shadow-xs' 
                : 'text-[#52605D] hover:text-[#004D3F] hover:bg-white/60'
            }`}
          >
            كافة الحالات
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'completed' 
                ? 'bg-[#006D41] text-white shadow-xs' 
                : 'text-[#52605D] hover:text-[#006D41] hover:bg-white/60'
            }`}
          >
            سليمة
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'cancelled' 
                ? 'bg-rose-700 text-white shadow-xs' 
                : 'text-[#52605D] hover:text-rose-700 hover:bg-white/60'
            }`}
          >
            ملغاة
          </button>
          <button
            onClick={() => setStatusFilter('refunded')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'refunded' 
                ? 'bg-amber-600 text-white shadow-xs' 
                : 'text-[#52605D] hover:text-amber-600 hover:bg-white/60'
            }`}
          >
            مرتجع
          </button>
        </div>

        {searchError && (
          <div className="w-full flex items-center gap-1.5 text-xs text-rose-700 font-semibold bg-rose-50 p-2 rounded-xl border border-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* 3. Invoices Ledger Table */}
      <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl flex flex-col overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="h-10 bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 grid grid-cols-12 items-center text-xs font-bold text-[#52605D] shrink-0 select-none">
          <span className="col-span-2">رقم الفاتورة</span>
          <span className="col-span-2">تاريخ ووقت البيع</span>
          <span className="col-span-2">العميل</span>
          <span className="col-span-2 text-center">الحالة والدفع</span>
          <span className="col-span-2 text-center">الخصم المالي</span>
          <span className="col-span-1 text-left pl-2">الإجمالي</span>
          <span className="col-span-1 text-center">معاينة</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {filteredSales.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
              <Clock className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-40" />
              <p className="text-[14px] font-semibold text-ink m-0">
                {searchQuery || statusFilter !== 'all' || dateFilter !== 'all' 
                  ? 'لا توجد فواتير مطابقة لمعايير البحث والتصفية المحددة' 
                  : 'لم تسجل أي فواتير مبيعات بعد'}
              </p>
              <p className="text-[12px] text-ink-muted m-0">
                {searchQuery ? 'تأكد من رقم الفاتورة أو الاسم واضغط Enter للبحث' : 'توجه لشاشة البيع لتسجيل الفواتير'}
              </p>
            </div>
          ) : (
            filteredSales.map((sale) => {
              const isCancelled = sale.status === 'cancelled';
              const isRefunded = sale.status === 'refunded';
              return (
                <div 
                  key={sale.id || sale.invoiceNumber} 
                  className={`h-12 border-b border-[#E2E8F0] px-4 grid grid-cols-12 items-center text-xs hover:bg-[#F1F5F4]/60 transition-colors cursor-pointer ${
                    isCancelled ? 'bg-rose-50/50 hover:bg-rose-50/80 opacity-80' : ''
                  }`}
                  onClick={() => void handleOpenDetails(sale)}
                >
                  {/* Invoice Number */}
                  <span className={`col-span-2 font-mono font-bold text-xs flex items-center gap-1.5 ${
                    isCancelled ? 'text-rose-700 line-through' : 'text-[#004D3F]'
                  }`}>
                    <span>#{sale.invoiceNumber}</span>
                    {isCancelled && <span className="text-[10px] text-rose-700 no-underline font-normal">(ملغاة)</span>}
                  </span>

                  {/* Date / Time */}
                  <span className="col-span-2 font-mono text-[#0F172A] text-xs tabular-nums">
                    {sale.createdAt ? new Date(sale.createdAt).toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </span>

                  {/* Customer */}
                  <span className="col-span-2 text-[#0F172A] text-xs truncate" title={sale.customerName || 'عميل نقدي'}>
                    {sale.customerName ? (
                      <span className="flex items-center gap-1 font-bold text-[#0F172A]">
                        <User className="w-3.5 h-3.5 text-[#006D41] shrink-0" />
                        <span className="truncate">{sale.customerName}</span>
                      </span>
                    ) : (
                      <span className="text-[#52605D]/70">عميل نقدي عام</span>
                    )}
                  </span>

                  {/* Status & Payment Method Badges */}
                  <div className="col-span-2 flex items-center justify-center gap-1.5">
                    {isCancelled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                        <Ban className="w-3 h-3" />
                        <span>ملغاة</span>
                      </span>
                    ) : isRefunded ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        مرتجع
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-[#006D41] border border-emerald-200">
                        {sale.paymentMethod === 'cash' ? 'نقدي' : sale.paymentMethod === 'credit' ? 'آجل' : 'بطاقة'}
                      </span>
                    )}
                  </div>

                  {/* Discount */}
                  <span className="col-span-2 text-center font-mono text-[#52605D] text-xs tabular-nums">
                    {sale.discountPiasters > 0 ? formatArabicCurrency(sale.discountPiasters) : '—'}
                  </span>

                  {/* Total Piasters */}
                  <span className={`col-span-1 text-left pl-2 font-mono font-bold text-xs tabular-nums ${
                    isCancelled ? 'text-[#52605D] line-through' : 'text-[#006D41]'
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
                      className="w-7 h-7 rounded-lg bg-white hover:bg-emerald-50 text-[#52605D] hover:text-[#006D41] border border-[#E2E8F0] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
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
        <div className="h-8 bg-[#F8FAFC] border-t border-[#E2E8F0] px-4 flex items-center justify-between text-[11px] text-[#52605D] shrink-0 font-mono">
          <span>قاعدة بيانات SQLite - محرك المعاملات الذرية نشط</span>
          <span className="tabular-nums font-bold">
            المعروض: {filteredSales.length} من أصل {sales.length} فاتورة
          </span>
        </div>
      </div>

      {/* 4. Full Invoice Details Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-[#006D41]/30 shadow-2xl overflow-hidden flex flex-col select-none max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="h-12 bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#004D3F]" />
                <h3 className="text-sm font-bold text-[#0F172A] m-0">
                  تفاصيل الفاتورة #{selectedSale.invoiceNumber}
                </h3>
                {selectedSale.status === 'cancelled' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-700 text-white">
                    ملغاة
                  </span>
                )}
                {selectedSale.status === 'refunded' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                    بها مرتجع
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
                title="إغلاق (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex flex-col gap-3 overflow-y-auto font-mono text-[12px]">
              {/* Cancelled Banner if applicable */}
              {selectedSale.status === 'cancelled' && (
                <div className="bg-danger-soft border border-danger/30 rounded p-2.5 flex items-start gap-2 text-danger">
                  <Ban className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">تم إلغاء هذه الفاتورة رسمياً</div>
                    <div className="text-[11px] mt-0.5 text-danger/90">
                      {selectedSale.notes || 'تم الإلغاء بناء على طلب الكاشير وتصحيح المخزون.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-2 bg-canvas p-3 rounded hairline-all text-[12px]">
                <div>
                  <span className="text-ink-muted text-[11px]">تاريخ ووقت البيع: </span>
                  <span className="text-ink font-bold tabular-nums">
                    {selectedSale.createdAt ? new Date(selectedSale.createdAt).toLocaleString('ar-EG-u-nu-latn') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted text-[11px]">طريقة الدفع: </span>
                  <span className="text-ink font-bold">
                    {selectedSale.paymentMethod === 'cash' ? 'نقدي (كاش)' : selectedSale.paymentMethod === 'credit' ? 'آجل' : 'بطاقة دفع'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted text-[11px]">العميل: </span>
                  <span className="text-ink font-bold">
                    {selectedSale.customerName || 'عميل نقدي عام'}
                  </span>
                  {selectedSale.customerPhone && (
                    <span className="text-ink-muted text-[11px] mr-1">({selectedSale.customerPhone})</span>
                  )}
                </div>
                <div>
                  <span className="text-ink-muted text-[11px]">الكاشير: </span>
                  <span className="text-ink font-bold">{selectedSale.cashierId || 'الكاشير الرئيسي'}</span>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="border border-line rounded overflow-hidden">
                <div className="bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-ink-muted grid grid-cols-12">
                  <span className="col-span-5">الصنف</span>
                  <span className="col-span-2 text-center">الكمية</span>
                  <span className="col-span-2 text-center">سعر الوحدة</span>
                  <span className="col-span-3 text-left pl-1">الإجمالي</span>
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-line/60">
                  {loadingDetails ? (
                    <div className="p-4 text-center text-ink-muted flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-brand" />
                      <span>جاري تحميل بنود الفاتورة من قاعدة البيانات...</span>
                    </div>
                  ) : selectedSale.items && selectedSale.items.length > 0 ? (
                    selectedSale.items.map((item, idx) => (
                      <div key={item.id || idx} className="px-3 py-2 text-[12px] grid grid-cols-12 items-center">
                        <div className="col-span-5">
                          <div className="font-bold text-ink truncate">{item.productName}</div>
                          {item.barcode && <div className="text-[10px] text-ink-muted">{item.barcode}</div>}
                        </div>
                        <div className="col-span-2 text-center font-mono tabular-nums text-ink">
                          {item.unit === 'kg' ? (item.quantityMilli / 1000).toFixed(3) : item.quantityMilli / 1000}{' '}
                          <span className="text-[10px] text-ink-muted">{item.unit === 'kg' ? 'كجم' : 'قطعة'}</span>
                        </div>
                        <div className="col-span-2 text-center font-mono tabular-nums text-ink">
                          {formatArabicCurrency(item.unitPricePiasters)}
                        </div>
                        <div className="col-span-3 text-left pl-1 font-mono font-bold text-brand tabular-nums">
                          {formatArabicCurrency(item.totalPiasters)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-ink-muted text-xs">
                      تم حفظ تفاصيل البنود في قاعدة بيانات المتجر
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="bg-canvas p-3 rounded hairline-all flex flex-col gap-1.5 text-[12px]">
                <div className="flex justify-between text-ink-muted">
                  <span>المجموع الفرعي:</span>
                  <span className="text-ink tabular-nums">{formatArabicCurrency(selectedSale.subtotalPiasters)}</span>
                </div>
                {selectedSale.discountPiasters > 0 && (
                  <div className="flex justify-between text-danger font-semibold">
                    <span>الخصم الممنوح:</span>
                    <span className="tabular-nums">−{formatArabicCurrency(selectedSale.discountPiasters)}</span>
                  </div>
                )}
                {selectedSale.taxPiasters > 0 && (
                  <div className="flex justify-between text-ink-muted">
                    <span>ضريبة القيمة المضافة:</span>
                    <span className="tabular-nums">{formatArabicCurrency(selectedSale.taxPiasters)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[15px] text-brand pt-2 border-t border-line">
                  <span>الصافي المستحق:</span>
                  <span className="tabular-nums">{formatArabicCurrency(selectedSale.totalPiasters)}</span>
                </div>
                <div className="flex justify-between text-ink-muted text-[11px] pt-1 border-t border-line/60">
                  <span>المبلغ المدفوع:</span>
                  <span className="text-ink font-semibold tabular-nums">{formatArabicCurrency(selectedSale.paidPiasters)}</span>
                </div>
              </div>

              {/* Reprint feedback toast */}
              {reprintFeedback && (
                <div className="bg-brand-soft border border-brand/30 rounded p-2 text-xs text-brand font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-brand" />
                  <span>{reprintFeedback}</span>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="h-[52px] bg-surface-2 hairline-t px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-ink-muted">
                  اضغط <kbd className="bg-surface px-1.5 py-0.5 rounded border border-line text-ink font-mono">F9</kbd> لطباعة نسخة
                </span>
                {selectedSale.status !== 'cancelled' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowReturnModal(true)}
                      className="h-[32px] px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="تسجيل مرتجع جزئي أو كلي لهذه الفاتورة"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>عمل مرتجع</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      className="h-[32px] px-3 bg-danger-soft hover:bg-danger/20 text-danger border border-danger/30 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
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
                  onClick={() => setSelectedSale(null)}
                  className="h-[36px] px-4 bg-surface hover:bg-surface-2 border border-line text-ink rounded text-[12px] font-semibold transition-colors"
                >
                  إغلاق (Esc)
                </button>
                <button
                  type="button"
                  onClick={() => void handleReprint()}
                  disabled={isReprinting}
                  className="h-[36px] px-4 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="طباعة إيصال يحمل علامة نسخة طبق الأصل وتوثيقه في السجل"
                >
                  <Printer className={`w-4 h-4 ${isReprinting ? 'animate-spin' : ''}`} />
                  <span>{isReprinting ? 'جاري الطباعة...' : 'إعادة طباعة نسخة (F9)'}</span>
                </button>
              </div>
            </div>

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
        </div>
      )}
    </div>
  );
};
