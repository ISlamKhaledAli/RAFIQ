import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  Clock,
  Flame,
  User,
  Phone,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Truck,
  TrendingDown,
  X,
  Package,
  RotateCcw,
  Receipt,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShoppingCart,
  Layers,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import type {
  ShortageEntry,
  ShortagePurchaseProposal,
  LostSalesReportSummary,
  LostSalesReportItem,
} from '../../types/shortage';
import { formatArabicCurrency } from '../../utils/money';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { QuickShortageModal } from '../../components/QuickShortageModal';
import { PaginationBar } from '../../components/PaginationBar';

interface ShortagesTabProps {
  onLoadProposalToNewPurchase?: (proposal: ShortagePurchaseProposal) => void;
}

export const ShortagesTab: React.FC<ShortagesTabProps> = ({ onLoadProposalToNewPurchase }) => {
  const [shortages, setShortages] = useState<ShortageEntry[]>([]);
  const [_loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals & Sub-views
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isProposalsModalOpen, setIsProposalsModalOpen] = useState(false);
  const [proposals, setProposals] = useState<ShortagePurchaseProposal[]>([]);
  const [isLostSalesReportOpen, setIsLostSalesReportOpen] = useState(false);
  const [lostSalesReport, setLostSalesReport] = useState<LostSalesReportSummary | null>(null);
  const [reportScope, setReportScope] = useState<'unmet' | 'all'>('unmet');
  const [reportSource, setReportSource] = useState<string>('all');
  const [reportDays, setReportDays] = useState<number>(30);
  const [reportSortBy, setReportSortBy] = useState<'revenue' | 'requests' | 'qty' | 'name'>('revenue');
  const [reportSortOrder, setReportSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isGeneratingAuto, setIsGeneratingAuto] = useState(false);

  interface PendingAction {
    type: 'order' | 'cancel' | 'receive' | 'restore' | 'delete';
    item: ShortageEntry;
  }
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const loadShortages = useCallback(async () => {
    setLoading(true);
    try {
      let data: ShortageEntry[] = [];
      try {
        data = await invoke<ShortageEntry[]>('shortages:list', {
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: searchQuery.trim() || undefined,
          limit: 200,
        });
      } catch {
        data = await invoke<ShortageEntry[]>('shortages:getAll', {
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: searchQuery.trim() || undefined,
          limit: 200,
        });
      }
      setShortages(data || []);
      setSelectedIds([]);
    } catch {
      showToast('تعذر تحميل بيانات دفتر النواقص', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, showToast]);

  useEffect(() => {
    void loadShortages();
  }, [loadShortages]);

  useDataSubscription(['shortages', 'purchases', 'products', 'all'], () => {
    void loadShortages();
  });

  const filteredShortages = useMemo(() => {
    return shortages.filter((item) => {
      const itemUrgency = item.urgency || (item as unknown as { priority?: string }).priority || 'normal';
      if (urgencyFilter !== 'all' && itemUrgency !== urgencyFilter) return false;
      if (sourceFilter !== 'all') {
        const itemSrc: string = item.source || 'pos';
        if (sourceFilter === 'manual_pos' && itemSrc !== 'manual_pos' && itemSrc !== 'pos') return false;
        if (sourceFilter !== 'manual_pos' && itemSrc !== sourceFilter) return false;
      }
      return true;
    });
  }, [shortages, urgencyFilter, sourceFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, urgencyFilter, sourceFilter]);

  const paginatedShortages = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredShortages.slice(startIndex, startIndex + pageSize);
  }, [filteredShortages, currentPage, pageSize]);

  const handleSelectAll = () => {
    if (selectedIds.length === filteredShortages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredShortages.map((s) => s.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleStatusChange = async (
    id: string,
    newStatus: string,
    productName?: string,
    increaseStock: boolean = true,
    qtyMilli?: number,
    unit?: string
  ) => {
    try {
      await invoke('shortages:updateStatus', { id, status: newStatus, increaseStock });
      const name = productName || 'الصنف';
      if (newStatus === 'ordered') {
        showToast(`تم نقل "${name}" إلى قائمة (تم الطلب من المورد). يمكنك استعراضه من تبويب "تم الطلب".`, 'success');
      } else if (newStatus === 'cancelled') {
        showToast(`تم نقل "${name}" إلى قائمة (الملغيات).`, 'success');
      } else if (newStatus === 'received') {
        const addedQty = typeof qtyMilli === 'number' && qtyMilli > 0 ? qtyMilli / 1000 : 1;
        const u = unit || 'قطعة';
        showToast(`تم استلام "${name}" وتزويد رصيد المخزن بمقدار (+${addedQty} ${u}) بنجاح.`, 'success');
      } else if (newStatus === 'pending') {
        showToast(`تمت إعادة تفعيل "${name}" ونقله إلى قائمة (بانتظار الطلب).`, 'success');
      } else {
        showToast(`تم تحديث حالة "${name}" بنجاح`, 'success');
      }
      void loadShortages();
    } catch {
      showToast('تعذر تحديث الحالة', 'error');
    }
  };

  const handleConvertToPurchaseSingle = async (item: ShortageEntry) => {
    if (!onLoadProposalToNewPurchase) {
      showToast('خاصية التحويل لفاتورة شراء غير متاحة حالياً', 'error');
      return;
    }

    try {
      if (item.status === 'pending') {
        await invoke('shortages:updateStatus', { id: item.id, status: 'ordered', increaseStock: false });
      }
    } catch {
      // ignore
    }

    const proposal: ShortagePurchaseProposal = {
      supplierId: item.preferredSupplierId || '',
      supplierName: item.preferredSupplierName || 'مورد عام',
      supplierPhone: null,
      items: [
        {
          shortageId: item.id,
          productId: item.productId || '',
          productName: item.productName,
          barcode: item.barcode || null,
          unit: item.unit || 'قطعة',
          suggestedQuantityMilli: item.requestedQuantityMilli || 1000,
          costPiasters: item.costPiasters || 0,
          totalEstimatedCostPiasters: Math.round(((item.requestedQuantityMilli || 1000) / 1000) * (item.costPiasters || 0)),
        },
      ],
    };

    onLoadProposalToNewPurchase(proposal);
    showToast(`تم تجهيز الصنف ونقله إلى فاتورة شراء جديدة`, 'success');
  };

  const handleDelete = async (id: string, productName?: string) => {
    try {
      await invoke('shortages:delete', { id });
      const name = productName || 'الصنف';
      showToast(`تم حذف "${name}" نهائياً من دفتر النواقص`, 'success');
      void loadShortages();
    } catch {
      showToast('تعذر حذف القيد', 'error');
    }
  };

  const handleGenerateAutoShortages = async () => {
    setIsGeneratingAuto(true);
    try {
      let autoList: ShortageEntry[] = [];
      try {
        autoList = await invoke<ShortageEntry[]>('shortages:getAutoShortages', { targetCoverDays: 15 });
      } catch {
        autoList = await invoke<ShortageEntry[]>('shortages:getAuto', { targetCoverDays: 15 });
      }

      if (autoList && autoList.length > 0) {
        showToast(`تم فحص المخزون واكتشاف وإدراج ${autoList.length} صنف في النواقص بنجاح`, 'success');
      } else {
        showToast('كافة الأصناف متوفرة وأعلى من حدود الأمان ومعدلات الاستهلاك', 'success');
      }
      setStatusFilter('pending');
      void loadShortages();
    } catch {
      showToast('تعذر فحص النواقص التلقائية', 'error');
    } finally {
      setIsGeneratingAuto(false);
    }
  };

  const handleConvertToPurchase = async () => {
    if (selectedIds.length === 0) {
      showToast('يرجى تحديد بند واحد على الأقل من النواقص لتحويله لطلبية', 'error');
      return;
    }

    try {
      const rawProps = await invoke<unknown>('shortages:convertToPurchase', {
        shortageIds: selectedIds,
      });
      const list = Array.isArray(rawProps) ? rawProps : (rawProps ? [rawProps] : []);
      const normalized: ShortagePurchaseProposal[] = list.map((p: any) => ({
        supplierId: p.supplierId || '',
        supplierName: p.supplierName || 'مورد عام',
        supplierPhone: p.supplierPhone || null,
        items: ((p.items || p.lines || []) as any[]).map((i: any) => ({
          shortageId: i.shortageId || i.productId || Math.random().toString(),
          productId: i.productId || '',
          productName: i.productName || i.itemName || 'صنف',
          barcode: i.barcode || null,
          unit: i.unit || 'وحدة',
          suggestedQuantityMilli: i.suggestedQuantityMilli ?? i.suggestedQtyMilli ?? 1000,
          costPiasters: i.costPiasters ?? i.costPricePiasters ?? 0,
          totalEstimatedCostPiasters: i.totalEstimatedCostPiasters ?? Math.round(((i.suggestedQuantityMilli ?? i.suggestedQtyMilli ?? 1000) / 1000) * (i.costPiasters ?? i.costPricePiasters ?? 0)),
        })),
      }));
      setProposals(normalized);
      setIsProposalsModalOpen(true);
    } catch {
      showToast('تعذر تحويل النواقص لأوامر شراء', 'error');
    }
  };

  const loadLostSalesReport = useCallback(
    async (scope: string = reportScope, src: string = reportSource, days: number = reportDays) => {
      setIsReportLoading(true);
      try {
        const report = await invoke<any>('shortages:getLostSalesReport', {
          days: days > 0 ? days : undefined,
          status: scope,
          source: src === 'all' ? undefined : src,
        });
        if (report) {
          const rawItems = (report.topRequestedProducts || report.items || []) as any[];
          setLostSalesReport({
            totalUnmetRequestsCount: report.totalUnmetRequestsCount ?? report.totalRequests ?? 0,
            totalCustomerRequestsCount: report.totalCustomerRequestsCount ?? 0,
            totalAutoReorderCount: report.totalAutoReorderCount ?? 0,
            uniqueProductsCount: report.uniqueProductsCount ?? rawItems.length,
            totalEstimatedLostRevenuePiasters:
              report.totalEstimatedLostRevenuePiasters ?? report.totalLostRevenuePiasters ?? 0,
            topRequestedProducts: rawItems.map((p: any) => ({
              productId: p.productId || '',
              productName: p.productName || p.itemName || 'صنف غير محدد',
              barcode: p.barcode || null,
              unit: p.unit || 'قطعة',
              source: p.source || 'pos',
              status: p.status || 'pending',
              requestCount: p.requestCount || 0,
              totalRequestedQuantityMilli: p.totalRequestedQuantityMilli ?? p.totalRequestedQtyMilli ?? 0,
              unitPricePiasters: p.unitPricePiasters || 0,
              estimatedLostRevenuePiasters: p.estimatedLostRevenuePiasters || 0,
              currentStockMilli: p.currentStockMilli ?? 0,
              preferredSupplierName: p.preferredSupplierName || null,
            })),
          });
        }
      } catch {
        showToast('تعذر جلب تقرير المبيعات المفقودة', 'error');
      } finally {
        setIsReportLoading(false);
      }
    },
    [reportScope, reportSource, reportDays, showToast]
  );

  const handleOpenLostSalesReport = () => {
    setIsLostSalesReportOpen(true);
    void loadLostSalesReport(reportScope, reportSource, reportDays);
  };

  const handleScopeChange = (newScope: 'unmet' | 'all') => {
    setReportScope(newScope);
    void loadLostSalesReport(newScope, reportSource, reportDays);
  };

  const handleReportSourceChange = (newSrc: string) => {
    setReportSource(newSrc);
    void loadLostSalesReport(reportScope, newSrc, reportDays);
  };

  const handleReportDaysChange = (newDays: number) => {
    setReportDays(newDays);
    void loadLostSalesReport(reportScope, reportSource, newDays);
  };

  const sortedReportItems = useMemo(() => {
    if (!lostSalesReport?.topRequestedProducts) return [];
    const list = [...lostSalesReport.topRequestedProducts];
    list.sort((a, b) => {
      let comp = 0;
      if (reportSortBy === 'revenue') {
        comp = a.estimatedLostRevenuePiasters - b.estimatedLostRevenuePiasters;
      } else if (reportSortBy === 'requests') {
        comp = a.requestCount - b.requestCount;
      } else if (reportSortBy === 'qty') {
        comp = a.totalRequestedQuantityMilli - b.totalRequestedQuantityMilli;
      } else if (reportSortBy === 'name') {
        comp = a.productName.localeCompare(b.productName, 'ar');
      }
      return reportSortOrder === 'desc' ? -comp : comp;
    });
    return list;
  }, [lostSalesReport, reportSortBy, reportSortOrder]);

  const toggleReportSort = (col: 'revenue' | 'requests' | 'qty' | 'name') => {
    if (reportSortBy === col) {
      setReportSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setReportSortBy(col);
      setReportSortOrder('desc');
    }
  };

  const handleOrderFromReport = (p: LostSalesReportItem) => {
    if (!onLoadProposalToNewPurchase) {
      showToast('خاصية التحويل لفاتورة شراء غير متاحة حالياً', 'error');
      return;
    }
    const proposal: ShortagePurchaseProposal = {
      supplierId: '',
      supplierName: p.preferredSupplierName || 'مورد عام',
      supplierPhone: null,
      items: [
        {
          shortageId: p.productId ? `rep_${p.productId}` : 'rep_item',
          productId: p.productId || '',
          productName: p.productName,
          barcode: p.barcode || null,
          unit: p.unit || 'قطعة',
          suggestedQuantityMilli: p.totalRequestedQuantityMilli || 1000,
          costPiasters: 0,
          totalEstimatedCostPiasters: 0,
        },
      ],
    };
    setIsLostSalesReportOpen(false);
    onLoadProposalToNewPurchase(proposal);
    showToast(`تم تجهيز "${p.productName}" ونقله لفاتورة الشراء بنجاح`, 'success');
  };

  const reportSourceOptions: SelectOption[] = [
    { value: 'all', label: 'كافة المصادر' },
    { value: 'customer', label: 'طلبات العملاء (الكاشير)' },
    { value: 'auto_reorder', label: 'تنبيهات نفاد المخزون' },
  ];

  const reportDaysOptions: SelectOption[] = [
    { value: '30', label: 'آخر 30 يوماً' },
    { value: '60', label: 'آخر 60 يوماً' },
    { value: '90', label: 'آخر 90 يوماً' },
    { value: '0', label: 'كافة الفترات (الكل)' },
  ];



  const urgencyOptions: SelectOption[] = [
    { value: 'all', label: 'كافة درجات الأهمية' },
    { value: 'normal', label: 'عادي' },
    { value: 'urgent', label: 'عاجل' },
    { value: 'critical', label: 'حرج' },
  ];

  const sourceOptions: SelectOption[] = [
    { value: 'all', label: 'كافة المصادر' },
    { value: 'customer_request', label: 'طلبات العملاء' },
    { value: 'manual_pos', label: 'تسجيل الكاشير' },
    { value: 'auto_reorder', label: 'تنبيه النواقص التلقائي' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden gap-3">
      {/* Toast */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl border font-bold text-xs shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid/30 text-paid dark:text-paid-bright'
              : 'bg-danger-soft border-danger/30 text-danger'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Top Action Bar */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم الصنف أو العميل..."
              className="w-full h-8 px-2.5 pr-8 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
            />
            <Search className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-2.5 pointer-events-none" />
          </div>



          <div className="w-40">
            <CustomSelect
              options={urgencyOptions}
              value={urgencyFilter}
              onChange={(val) => setUrgencyFilter(val)}
              size="sm"
            />
          </div>

          <div className="w-44">
            <CustomSelect
              options={sourceOptions}
              value={sourceFilter}
              onChange={(val) => setSourceFilter(val)}
              size="sm"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenLostSalesReport}
            className="h-8 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark hover:bg-surface-2 text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="تقرير المبيعات المفقودة والفرص الضائعة"
          >
            <TrendingDown className="w-3.5 h-3.5 text-danger" />
            <span>المبيعات الضائعة</span>
          </button>

          <button
            type="button"
            onClick={() => void handleGenerateAutoShortages()}
            disabled={isGeneratingAuto}
            className="h-8 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark hover:bg-surface-2 text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="فحص المخزون واستخراج الأصناف التي تحت حد الطلب التلقائي"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${isGeneratingAuto ? 'animate-spin' : ''}`} />
            <span>فحص النواقص التلقائي</span>
          </button>

          <button
            type="button"
            onClick={() => void handleConvertToPurchase()}
            disabled={selectedIds.length === 0}
            className="h-8 px-3.5 rounded-lg bg-paid hover:bg-paid-hover text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:opacity-40"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>تحويل للطلبية ({selectedIds.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQuickAddOpen(true)}
            className="h-8 px-3.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>تسجيل نواقص</span>
          </button>
        </div>
      </div>

      {/* Status Workflow Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs select-none">
        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`h-8 px-3 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            statusFilter === 'pending'
              ? 'bg-warn text-white shadow-xs'
              : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>بانتظار الطلب (معلق)</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('ordered')}
          className={`h-8 px-3 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            statusFilter === 'ordered'
              ? 'bg-brand text-white shadow-xs'
              : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>تم الطلب من المورد</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('received')}
          className={`h-8 px-3 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            statusFilter === 'received'
              ? 'bg-paid text-white shadow-xs'
              : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>تم الاستلام بالمخزن</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('cancelled')}
          className={`h-8 px-3 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            statusFilter === 'cancelled'
              ? 'bg-ink-muted text-white shadow-xs'
              : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2'
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>الملغيات</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`h-8 px-3 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            statusFilter === 'all'
              ? 'bg-brand-dark text-white shadow-xs'
              : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2'
          }`}
        >
          <span>كافة النواقص</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl overflow-hidden flex flex-col shadow-2xs">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted sticky top-0 z-10 font-bold select-none">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-ink-muted hover:text-ink cursor-pointer"
                  >
                    {selectedIds.length > 0 && selectedIds.length === filteredShortages.length ? (
                      <CheckSquare className="w-4 h-4 text-brand" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2.5">الصنف الناقص</th>
                <th className="px-3 py-2.5">الأهمية</th>
                <th className="px-3 py-2.5 text-center">الكمية المطلوبة</th>
                <th className="px-3 py-2.5 text-center">الرصيد / حد الطلب</th>
                <th className="px-3 py-2.5">المصدر / العميل</th>
                <th className="px-3 py-2.5">المورد المفضل</th>
                <th className="px-3 py-2.5">الحالة</th>
                <th className="px-3 py-2.5">تاريخ التسجيل</th>
                <th className="px-3 py-2.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 dark:divide-line-dark/60">
              {filteredShortages.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-ink-muted">
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30 text-brand" />
                    <div className="font-bold">لا توجد نواقص مطابقة للشروط المحددة</div>
                    <p className="text-[11px] mt-1">
                      يمكنك تسجيل صنف ناقص يدوياً أو الضغط على "فحص النواقص التلقائي"
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedShortages.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-brand-soft/20 dark:hover:bg-brand-soft/5 transition-colors ${
                        isSelected ? 'bg-brand-soft/30 dark:bg-brand-soft/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(item.id)}
                          className="text-ink-muted hover:text-ink cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>{item.productName}</span>
                        </div>
                        {item.barcode && (
                          <div className="text-[10px] text-ink-muted font-mono">{item.barcode}</div>
                        )}
                        {item.notes && (
                          <div className="text-[11px] text-ink-muted/90 italic mt-0.5">{item.notes}</div>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        {item.urgency === 'critical' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger-soft text-danger text-[10.5px] font-bold">
                            <Flame className="w-3 h-3" />
                            حرج
                          </span>
                        ) : item.urgency === 'urgent' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warn-soft text-warn text-[10.5px] font-bold">
                            <AlertTriangle className="w-3 h-3" />
                            عاجل
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 text-ink-muted text-[10.5px]">
                            <Clock className="w-3 h-3" />
                            عادي
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-center font-bold font-mono">
                        {typeof item.requestedQuantityMilli === 'number' && !isNaN(item.requestedQuantityMilli)
                          ? item.requestedQuantityMilli / 1000
                          : 1}{' '}
                        {item.unit || 'قطعة'}
                      </td>

                      <td className="px-3 py-2.5 text-center font-mono text-[11px]">
                        <span
                          className={
                            typeof item.currentStockMilli === 'number' && item.currentStockMilli > 0
                              ? 'text-warn font-bold'
                              : 'text-danger font-bold'
                          }
                        >
                          {typeof item.currentStockMilli === 'number' && !isNaN(item.currentStockMilli)
                            ? item.currentStockMilli / 1000
                            : 0}
                        </span>
                        <span className="text-ink-muted mx-1">/</span>
                        <span className="text-ink-muted">
                          {typeof item.minStockMilli === 'number' && !isNaN(item.minStockMilli)
                            ? item.minStockMilli / 1000
                            : 0}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        {item.customerName ? (
                          <div className="flex flex-col">
                            <span className="font-bold flex items-center gap-1 text-ink dark:text-ink-dark">
                              <User className="w-3 h-3 text-brand" />
                              {item.customerName}
                            </span>
                            {item.customerPhone && (
                              <span className="text-[10.5px] text-ink-muted font-mono flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5" />
                                {item.customerPhone}
                              </span>
                            )}
                          </div>
                        ) : item.source === 'auto_reorder' ? (
                          <span className="text-[11px] text-brand font-medium">نظام إعادة الطلب التلقائي</span>
                        ) : (
                          <span className="text-[11px] text-ink-muted">تسجيل كاشير المحل</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        {item.preferredSupplierName ? (
                          <span className="font-semibold text-ink dark:text-ink-dark">
                            {item.preferredSupplierName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-muted italic">غير محدد</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        {item.status === 'pending' && (
                          <span className="px-2 py-0.5 rounded-full bg-warn-soft text-warn font-bold text-[10.5px]">
                            بانتظار الطلب
                          </span>
                        )}
                        {item.status === 'ordered' && (
                          <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand font-bold text-[10.5px]">
                            تم الطلب
                          </span>
                        )}
                        {item.status === 'received' && (
                          <span className="px-2 py-0.5 rounded-full bg-paid-soft text-paid font-bold text-[10.5px]">
                            تم الاستلام
                          </span>
                        )}
                        {item.status === 'cancelled' && (
                          <span className="px-2 py-0.5 rounded-full bg-surface-2 text-ink-muted font-bold text-[10.5px]">
                            ملغي
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-[11px] text-ink-muted font-mono">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-EG') : '-'}
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => void handleConvertToPurchaseSingle(item)}
                              className="p-1.5 rounded-lg border border-brand/30 hover:bg-brand-soft text-brand transition-all cursor-pointer shadow-2xs"
                              title="تحويل مباشر إلى فاتورة شراء جديدة"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: 'order', item })}
                              className="p-1.5 rounded-lg border border-brand/20 hover:bg-brand-soft text-brand transition-all cursor-pointer shadow-2xs"
                              title="طلب من المورد (نقل الصنف إلى قائمة تم الطلب)"
                            >
                              <Truck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.status === 'ordered' && (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: 'receive', item })}
                              className="p-1.5 rounded-lg border border-paid/20 hover:bg-paid-soft text-paid transition-all cursor-pointer shadow-2xs"
                              title="استلام بالمخزن (تأكيد استلام الشحنة وتوريدها)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: 'cancel', item })}
                              className="p-1.5 rounded-lg border border-line hover:bg-surface-2 text-ink-muted hover:text-ink transition-all cursor-pointer shadow-2xs"
                              title="إلغاء الطلب (نقل الصنف إلى الملغيات)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.status === 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: 'restore', item })}
                              className="p-1.5 rounded-lg border border-brand/20 hover:bg-brand-soft text-brand transition-all cursor-pointer shadow-2xs"
                              title="إعادة تفعيل القيد (نقل الصنف إلى بانتظار الطلب)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPendingAction({ type: 'delete', item })}
                            className="p-1.5 rounded-lg border border-danger/20 hover:bg-danger-soft text-danger transition-all cursor-pointer shadow-2xs"
                            title="حذف نهائي من الدفتر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={filteredShortages.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          pageSizeOptions={[25, 50, 100]}
          itemLabel="بند نواقص"
          className="rounded-none border-x-0 border-b-0 border-t"
        />
      </div>

      {/* Quick Add Shortage Modal */}
      <QuickShortageModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSuccess={() => {
          showToast('تم تسجيل النواقص بنجاح', 'success');
          void loadShortages();
        }}
      />

      {/* Purchase Proposals Modal (Grouped by Supplier) */}
      {isProposalsModalOpen && (
        <div className="fixed inset-0 bg-ink/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="h-14 px-5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark">
                  مقترحات أوامر الشراء مجمعة حسب الموردين
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProposalsModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">
              {proposals.length === 0 ? (
                <div className="py-8 text-center text-ink-muted">
                  لا توجد مقترحات شراء مولدة.
                </div>
              ) : (
                proposals.map((prop, idx) => {
                  const totalEst = prop.items.reduce((s, i) => s + i.totalEstimatedCostPiasters, 0);
                  return (
                    <div
                      key={prop.supplierId || idx}
                      className="rounded-xl border border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between border-b border-line/60 dark:border-line-dark/60 pb-2">
                        <div>
                          <div className="text-sm font-bold text-ink dark:text-ink-dark">
                            المورد: {prop.supplierName}
                          </div>
                          {prop.supplierPhone && (
                            <div className="text-[11px] text-ink-muted font-mono flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {prop.supplierPhone}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-left font-mono">
                            <div className="text-[10px] text-ink-muted">التكلفة التقديرية</div>
                            <div className="text-xs font-bold text-brand">
                              {formatArabicCurrency(totalEst)}
                            </div>
                          </div>
                          {onLoadProposalToNewPurchase && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsProposalsModalOpen(false);
                                onLoadProposalToNewPurchase(prop);
                              }}
                              className="h-8 px-3 rounded-lg bg-brand text-white font-bold flex items-center gap-1 hover:bg-brand-hover shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>تحميل في فاتورة شراء</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-[11.5px]">
                          <thead className="text-ink-muted border-b border-line/40 dark:border-line-dark/40 font-bold">
                            <tr>
                              <th className="py-1">الصنف</th>
                              <th className="py-1 text-center">الكمية المقترحة</th>
                              <th className="py-1 text-center">سعر التكلفة</th>
                              <th className="py-1 text-left">الإجمالي التقديري</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line/30 dark:divide-line-dark/30">
                            {prop.items.map((pi) => (
                              <tr key={pi.shortageId}>
                                <td className="py-1.5 font-semibold text-ink dark:text-ink-dark">
                                  {pi.productName}
                                </td>
                                <td className="py-1.5 text-center font-mono">
                                  {pi.suggestedQuantityMilli / 1000} {pi.unit}
                                </td>
                                <td className="py-1.5 text-center font-mono">
                                  {formatArabicCurrency(pi.costPiasters)}
                                </td>
                                <td className="py-1.5 text-left font-mono font-bold text-ink dark:text-ink-dark">
                                  {formatArabicCurrency(pi.totalEstimatedCostPiasters)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="h-12 px-5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsProposalsModalOpen(false)}
                className="h-8 px-4 rounded-lg border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Sales Report Modal */}
      {isLostSalesReportOpen && (
        <div className="fixed inset-0 bg-ink/50 dark:bg-black/70 z-50 flex items-center justify-center p-3 select-none backdrop-blur-xs">
          <div className="w-full max-w-4xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="h-14 px-5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-danger-soft text-danger flex items-center justify-center shrink-0">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                    <span>تقرير المبيعات المفقودة والفرص الضائعة</span>
                    {isReportLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand" />}
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    {reportScope === 'unmet'
                      ? 'تحليل لفرص المبيعات المعطلة بسبب الأصناف غير المتوفرة حالياً بالرصيد'
                      : 'تحليل تراكمي شامل لكافة طلبات ونواقص المبيعات (شاملة الأصناف المستلمة لاحقاً)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void loadLostSalesReport(reportScope, reportSource, reportDays)}
                  className="w-8 h-8 rounded-lg border border-line dark:border-line-dark flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface dark:hover:bg-surface-dark"
                  title="تحديث التقرير"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReportLoading ? 'animate-spin text-brand' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsLostSalesReportOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Filter Bar */}
            <div className="px-5 py-2.5 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleScopeChange('unmet')}
                  className={`h-7 px-3 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
                    reportScope === 'unmet'
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark hover:bg-line/40'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>النواقص غير المتوفرة حالياً</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    reportScope === 'unmet' ? 'bg-white/20 text-white' : 'bg-line text-ink'
                  }`}>
                    {reportScope === 'unmet' ? (lostSalesReport?.uniqueProductsCount || 0) : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleScopeChange('all')}
                  className={`h-7 px-3 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
                    reportScope === 'all'
                      ? 'bg-brand-dark text-white shadow-xs'
                      : 'bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark hover:bg-line/40'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>كافة النواقص والطلبات</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-44">
                  <CustomSelect
                    options={reportSourceOptions}
                    value={reportSource}
                    onChange={(val) => handleReportSourceChange(val)}
                    size="sm"
                  />
                </div>
                <div className="w-36">
                  <CustomSelect
                    options={reportDaysOptions}
                    value={reportDays.toString()}
                    onChange={(val) => handleReportDaysChange(parseInt(val, 10) || 0)}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* KPI 1: Lost Revenue */}
                <div className="p-4 rounded-xl bg-danger-soft border border-danger/25 flex flex-col gap-1 shadow-2xs">
                  <div className="flex items-center justify-between text-danger">
                    <span className="text-[11px] font-bold">إجمالي الإيرادات المفقودة المقدرة</span>
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-bold font-mono text-danger tracking-tight">
                    {formatArabicCurrency(lostSalesReport?.totalEstimatedLostRevenuePiasters || 0)}
                  </span>
                  <span className="text-[10px] text-danger/80">
                    قيمة مبيعات كان يمكن تحقيقها لو توافرت الأصناف على الرف
                  </span>
                </div>

                {/* KPI 2: Total Requests & Products Breakdown */}
                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-1 shadow-2xs">
                  <div className="flex items-center justify-between text-ink-muted">
                    <span className="text-[11px] font-bold">حجم الطلب والأصناف</span>
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold font-mono text-ink dark:text-ink-dark">
                      {lostSalesReport?.totalUnmetRequestsCount || 0}
                    </span>
                    <span className="text-xs text-ink-muted font-bold">
                      طلب ({lostSalesReport?.uniqueProductsCount || 0} صنف)
                    </span>
                  </div>
                  <span className="text-[10px] text-ink-muted flex items-center gap-1">
                    <span className="font-bold text-ink dark:text-ink-dark">
                      {lostSalesReport?.totalCustomerRequestsCount || 0}
                    </span>
                    <span>طلب عميل مباشر</span>
                    <span>•</span>
                    <span className="font-bold text-ink dark:text-ink-dark">
                      {lostSalesReport?.totalAutoReorderCount || 0}
                    </span>
                    <span>تنبيه نفاد مخزون</span>
                  </span>
                </div>

                {/* KPI 3: Top Offender Product */}
                <div className="p-4 rounded-xl bg-brand-soft/40 dark:bg-brand-soft/10 border border-brand/20 flex flex-col gap-1 shadow-2xs">
                  <div className="flex items-center justify-between text-brand">
                    <span className="text-[11px] font-bold">أعلى صنف مسبب للخسارة</span>
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="truncate font-bold text-ink dark:text-ink-dark text-xs" title={sortedReportItems[0]?.productName || 'لا يوجد'}>
                    {sortedReportItems[0]?.productName || 'لا يوجد'}
                  </div>
                  <div className="text-[11px] font-bold font-mono text-brand flex items-center gap-1.5">
                    <span>
                      {sortedReportItems[0] ? formatArabicCurrency(sortedReportItems[0].estimatedLostRevenuePiasters) : '0.00 ج.م'}
                    </span>
                    {sortedReportItems[0] && (
                      <span className="text-[10px] text-ink-muted font-normal">
                        ({sortedReportItems[0].totalRequestedQuantityMilli / 1000} {sortedReportItems[0].unit})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Missing Products Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-ink dark:text-ink-dark flex items-center gap-1.5">
                    <span>أكثر الأصناف المطلوبة غير المتوفرة (Top Missing Opportunities):</span>
                    <span className="text-[11px] text-ink-muted font-mono font-normal">
                      ({sortedReportItems.length} صنف)
                    </span>
                  </h4>
                  <span className="text-[10px] text-ink-muted">
                    انقر على رأس أي عمود لتغيير الترتيب
                  </span>
                </div>

                {sortedReportItems.length === 0 ? (
                  <div className="py-12 text-center text-ink-muted border border-line dark:border-line-dark rounded-xl bg-surface-2 dark:bg-surface-dark-2">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-paid opacity-60" />
                    <div className="font-bold">لا توجد مبيعات ضائعة مسجلة وفقاً للشروط الحالية</div>
                    <p className="text-[11px] mt-1">كافة المنتجات المطلوبة متوفرة بالرصيد الحالي للمخزن</p>
                  </div>
                ) : (
                  <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted font-bold select-none">
                        <tr>
                          <th
                            className="px-3 py-2 cursor-pointer hover:text-ink transition-colors"
                            onClick={() => toggleReportSort('name')}
                          >
                            <div className="flex items-center gap-1">
                              <span>الصنف والباركود</span>
                              {reportSortBy === 'name' ? (
                                reportSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-brand" /> : <ArrowUp className="w-3 h-3 text-brand" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30" />
                              )}
                            </div>
                          </th>
                          <th className="px-3 py-2 text-center">المصدر</th>
                          <th
                            className="px-3 py-2 text-center cursor-pointer hover:text-ink transition-colors"
                            onClick={() => toggleReportSort('requests')}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span>مرات الطلب</span>
                              {reportSortBy === 'requests' ? (
                                reportSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-brand" /> : <ArrowUp className="w-3 h-3 text-brand" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30" />
                              )}
                            </div>
                          </th>
                          <th
                            className="px-3 py-2 text-center cursor-pointer hover:text-ink transition-colors"
                            onClick={() => toggleReportSort('qty')}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span>الكمية المطلوبة</span>
                              {reportSortBy === 'qty' ? (
                                reportSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-brand" /> : <ArrowUp className="w-3 h-3 text-brand" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30" />
                              )}
                            </div>
                          </th>
                          <th className="px-3 py-2 text-center">سعر الوحدة</th>
                          <th
                            className="px-3 py-2 text-left cursor-pointer hover:text-ink transition-colors"
                            onClick={() => toggleReportSort('revenue')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>قيمة المبيعات الضائعة</span>
                              {reportSortBy === 'revenue' ? (
                                reportSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-danger" /> : <ArrowUp className="w-3 h-3 text-danger" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30" />
                              )}
                            </div>
                          </th>
                          <th className="px-3 py-2 text-center">إجراء سريع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/40 dark:divide-line-dark/40">
                        {sortedReportItems.map((p, idx) => (
                          <tr
                            key={p.productId || p.productName}
                            className="hover:bg-brand-soft/20 dark:hover:bg-brand-soft/5 transition-colors"
                          >
                            <td className="px-3 py-2 font-bold text-ink dark:text-ink-dark">
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-[10px] font-mono text-ink-muted text-center shrink-0">
                                  #{idx + 1}
                                </span>
                                <div>
                                  <div className="font-bold">{p.productName}</div>
                                  {p.barcode && (
                                    <div className="text-[10px] text-ink-muted font-mono">{p.barcode}</div>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-3 py-2 text-center">
                              {p.source === 'customer_request' || p.source === 'pos' || p.source === 'manual_pos' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-soft text-brand text-[10px] font-bold">
                                  <User className="w-2.5 h-2.5" />
                                  طلب عميل
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warn-soft text-warn text-[10px] font-bold">
                                  <Clock className="w-2.5 h-2.5" />
                                  تنبيه مخزون
                                </span>
                              )}
                            </td>

                            <td className="px-3 py-2 text-center font-mono font-bold text-ink dark:text-ink-dark">
                              <span className={p.requestCount > 1 ? 'text-danger font-bold' : ''}>
                                {p.requestCount} مرة
                              </span>
                            </td>

                            <td className="px-3 py-2 text-center font-mono font-bold">
                              <span>{p.totalRequestedQuantityMilli / 1000}</span>
                              <span className="text-[10px] text-ink-muted font-normal mr-1">{p.unit || 'قطعة'}</span>
                            </td>

                            <td className="px-3 py-2 text-center font-mono text-ink-muted">
                              {p.unitPricePiasters > 0 ? (
                                <span>{formatArabicCurrency(p.unitPricePiasters)}</span>
                              ) : (
                                <span className="text-[10px] text-ink-muted">-</span>
                              )}
                            </td>

                            <td className="px-3 py-2 text-left font-mono font-bold text-danger">
                              {formatArabicCurrency(p.estimatedLostRevenuePiasters)}
                            </td>

                            <td className="px-3 py-2 text-center">
                              {onLoadProposalToNewPurchase && (
                                <button
                                  type="button"
                                  onClick={() => handleOrderFromReport(p)}
                                  className="h-6 px-2 rounded-md bg-brand-soft hover:bg-brand text-brand hover:text-white transition-colors text-[10.5px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                  title="إنشاء طلبية شراء فورية لهذا الصنف"
                                >
                                  <ShoppingCart className="w-3 h-3" />
                                  <span>طلب الآن</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="h-12 px-5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-between shrink-0">
              <div className="text-[11px] text-ink-muted">
                إجمالي الأصناف المعروضة: <span className="font-bold font-mono text-ink dark:text-ink-dark">{sortedReportItems.length}</span> صنف
              </div>
              <button
                type="button"
                onClick={() => setIsLostSalesReportOpen(false)}
                className="h-8 px-5 rounded-lg border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & Explanation Modal for Actions */}
      {pendingAction && (
        <div
          className="fixed inset-0 bg-ink/50 dark:bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-xs select-none animate-in fade-in duration-150"
          onClick={() => setPendingAction(null)}
        >
          <div
            className="w-full max-w-md bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    pendingAction.type === 'order'
                      ? 'bg-brand-soft text-brand'
                      : pendingAction.type === 'receive'
                      ? 'bg-paid-soft text-paid'
                      : pendingAction.type === 'cancel'
                      ? 'bg-warn-soft text-warn'
                      : pendingAction.type === 'restore'
                      ? 'bg-brand-soft text-brand'
                      : 'bg-danger-soft text-danger'
                  }`}
                >
                  {pendingAction.type === 'order' && <Truck className="w-4 h-4" />}
                  {pendingAction.type === 'receive' && <CheckCircle2 className="w-4 h-4" />}
                  {pendingAction.type === 'cancel' && <XCircle className="w-4 h-4" />}
                  {pendingAction.type === 'restore' && <RotateCcw className="w-4 h-4" />}
                  {pendingAction.type === 'delete' && <Trash2 className="w-4 h-4" />}
                </div>
                <h4 className="text-sm font-bold text-ink dark:text-ink-dark m-0">
                  {pendingAction.type === 'order' && 'تأكيد طلب الصنف من المورد'}
                  {pendingAction.type === 'receive' && 'تأكيد استلام الصنف بالمخزن'}
                  {pendingAction.type === 'cancel' && 'إلغاء طلب الصنف الناقص'}
                  {pendingAction.type === 'restore' && 'إعادة تفعيل قيد الصنف'}
                  {pendingAction.type === 'delete' && 'حذف القيد نهائياً من الدفتر'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="w-7 h-7 rounded-lg border border-line dark:border-line-dark flex items-center justify-center text-ink-muted hover:text-danger cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex flex-col gap-3 text-xs">
              <div className="bg-surface-2 dark:bg-surface-dark-2 rounded-xl p-3 border border-line dark:border-line-dark">
                <div className="font-bold text-ink dark:text-ink-dark text-sm mb-1">
                  {pendingAction.item.productName}
                </div>
                {pendingAction.item.barcode && (
                  <div className="text-[11px] text-ink-muted font-mono mb-1">
                    باركود: {pendingAction.item.barcode}
                  </div>
                )}
                <div className="flex items-center gap-2 text-ink-muted">
                  <span>
                    الكمية: {typeof pendingAction.item.requestedQuantityMilli === 'number' && !isNaN(pendingAction.item.requestedQuantityMilli) ? pendingAction.item.requestedQuantityMilli / 1000 : 1} {pendingAction.item.unit || 'قطعة'}
                  </span>
                  <span>•</span>
                  <span>
                    الحالة الحالية:{' '}
                    {pendingAction.item.status === 'pending'
                      ? 'بانتظار الطلب'
                      : pendingAction.item.status === 'ordered'
                      ? 'تم الطلب'
                      : pendingAction.item.status === 'received'
                      ? 'تم الاستلام'
                      : 'ملغي'}
                  </span>
                </div>
              </div>

              <div className="text-ink dark:text-ink-dark leading-relaxed">
                {pendingAction.type === 'order' && (
                  <div>
                    هل قمت بالتواصل مع شركة التوريد وطلب هذا الصنف؟
                    <div className="text-ink-muted text-[11px] mt-1.5 p-2 bg-brand-soft/40 dark:bg-brand-dark-soft/40 rounded-lg border border-brand/20">
                      سيتم نقل الصنف تلقائياً إلى قائمة <strong>"تم الطلب من المورد"</strong>. يمكنك متابعته واستلامه من تبويب "تم الطلب" بالأعلى.
                    </div>
                  </div>
                )}
                {pendingAction.type === 'receive' && (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-ink dark:text-ink-dark leading-relaxed font-semibold">
                      وصلت البضاعة وتريد توريدها؟ اختر طريقة الاستلام المناسبة:
                    </p>

                    {/* Option 1: Convert to Purchase Invoice */}
                    <button
                      type="button"
                      onClick={() => {
                        const item = pendingAction.item;
                        setPendingAction(null);
                        void handleConvertToPurchaseSingle(item);
                      }}
                      className="w-full text-right p-3 rounded-xl border border-brand/40 bg-brand-soft/40 hover:bg-brand-soft transition-all flex items-start gap-2.5 cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs group-hover:scale-105 transition-transform">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-brand-dark dark:text-brand-bright text-xs flex items-center justify-between">
                          <span>تحويل إلى فاتورة شراء جديدة (المسار المحاسبي)</span>
                          <span className="text-[10px] bg-brand text-white px-2 py-0.5 rounded-full font-bold">موصى به</span>
                        </div>
                        <p className="text-[11px] text-ink-muted mt-1 leading-normal">
                          ينقل الصنف لشاشة الشراء لتسجيل المورد، سعر التكلفة، والدفع (كاش/آجل)، ويزيد المخزون رسمياً عند حفظ الفاتورة.
                        </p>
                      </div>
                    </button>

                    {/* Option 2: Direct Warehouse Stock Receipt */}
                    <button
                      type="button"
                      onClick={async () => {
                        const item = pendingAction.item;
                        setPendingAction(null);
                        await handleStatusChange(item.id, 'received', item.productName, true, item.requestedQuantityMilli, item.unit || 'قطعة');
                      }}
                      className="w-full text-right p-3 rounded-xl border border-paid/40 bg-paid-soft/40 hover:bg-paid-soft transition-all flex items-start gap-2.5 cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-paid text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs group-hover:scale-105 transition-transform">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-paid-dark dark:text-paid-bright text-xs">
                          استلام فوري وزيادة رصيد المخزن مباشرة (+{typeof pendingAction.item.requestedQuantityMilli === 'number' && !isNaN(pendingAction.item.requestedQuantityMilli) ? pendingAction.item.requestedQuantityMilli / 1000 : 1} {pendingAction.item.unit || 'قطعة'})
                        </div>
                        <p className="text-[11px] text-ink-muted mt-1 leading-normal">
                          يزيد رصيد المخزن فوراً ويسجل حركة مخزنية رسمية ويحدث حالة القيد إلى تم الاستلام دون فتح فاتورة شراء.
                        </p>
                      </div>
                    </button>
                  </div>
                )}
                {pendingAction.type === 'cancel' && (
                  <div>
                    هل تود إلغاء طلب هذا الصنف؟
                    <div className="text-ink-muted text-[11px] mt-1.5 p-2 bg-surface-2 rounded-lg border border-line">
                      سيتم نقله إلى قائمة <strong>"الملغيات"</strong> ولن يظهر في الطلبيات الحالية. يمكنك إعادة تفعيله في أي وقت.
                    </div>
                  </div>
                )}
                {pendingAction.type === 'restore' && (
                  <div>
                    هل تود إعادة تفعيل هذا القيد؟
                    <div className="text-ink-muted text-[11px] mt-1.5 p-2 bg-brand-soft/40 dark:bg-brand-dark-soft/40 rounded-lg border border-brand/20">
                      سيتم إرجاع الصنف إلى قائمة <strong>"بانتظار الطلب (معلق)"</strong> لإدراجه في طلبيات التوريد القادمة.
                    </div>
                  </div>
                )}
                {pendingAction.type === 'delete' && (
                  <div className="p-2.5 rounded-lg bg-danger-soft/50 border border-danger/30 text-danger font-medium">
                    تحذير: سيتم حذف هذا القيد نهائياً من قاعدة البيانات ولا يمكن استرجاعه.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="h-8 px-3 rounded-lg border border-line text-ink dark:text-ink-dark hover:bg-surface text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>

              {pendingAction.type !== 'receive' && (
                <button
                  type="button"
                  onClick={async () => {
                    const action = pendingAction;
                    setPendingAction(null);
                    if (action.type === 'order') {
                      await handleStatusChange(action.item.id, 'ordered', action.item.productName);
                    } else if (action.type === 'cancel') {
                      await handleStatusChange(action.item.id, 'cancelled', action.item.productName);
                    } else if (action.type === 'restore') {
                      await handleStatusChange(action.item.id, 'pending', action.item.productName);
                    } else if (action.type === 'delete') {
                      await handleDelete(action.item.id, action.item.productName);
                    }
                  }}
                  className={`h-8 px-4 rounded-lg text-white text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer ${
                    pendingAction.type === 'order'
                      ? 'bg-brand hover:bg-brand-hover'
                      : pendingAction.type === 'cancel'
                      ? 'bg-warn hover:bg-warn-hover'
                      : pendingAction.type === 'restore'
                      ? 'bg-brand hover:bg-brand-hover'
                      : 'bg-danger hover:bg-danger-hover'
                  }`}
                >
                  {pendingAction.type === 'order' && 'تأكيد ونقل لـ "تم الطلب"'}
                  {pendingAction.type === 'cancel' && 'تأكيد الإلغاء'}
                  {pendingAction.type === 'restore' && 'إعادة التفعيل'}
                  {pendingAction.type === 'delete' && 'حذف نهائي'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
