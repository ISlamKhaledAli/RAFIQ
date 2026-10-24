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
  BarChart3,
  X,
  Package,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import type {
  ShortageEntry,
  ShortagePurchaseProposal,
  LostSalesReportSummary,
} from '../../types/shortage';
import { formatArabicCurrency } from '../../utils/money';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { QuickShortageModal } from '../../components/QuickShortageModal';

interface ShortagesTabProps {
  onLoadProposalToNewPurchase?: (proposal: ShortagePurchaseProposal) => void;
}

export const ShortagesTab: React.FC<ShortagesTabProps> = ({ onLoadProposalToNewPurchase }) => {
  const [shortages, setShortages] = useState<ShortageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals & Sub-views
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isProposalsModalOpen, setIsProposalsModalOpen] = useState(false);
  const [proposals, setProposals] = useState<ShortagePurchaseProposal[]>([]);
  const [isLostSalesReportOpen, setIsLostSalesReportOpen] = useState(false);
  const [lostSalesReport, setLostSalesReport] = useState<LostSalesReportSummary | null>(null);
  const [isGeneratingAuto, setIsGeneratingAuto] = useState(false);

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const loadShortages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ShortageEntry[]>('shortages:getAll', {
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery.trim() || undefined,
        limit: 200,
      });
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

  const filteredShortages = useMemo(() => {
    return shortages.filter((item) => {
      if (urgencyFilter !== 'all' && item.urgency !== urgencyFilter) return false;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      return true;
    });
  }, [shortages, urgencyFilter, sourceFilter]);

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

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await invoke('shortages:updateStatus', { id, status: newStatus });
      showToast('تم تحديث حالة الصنف بنجاح', 'success');
      void loadShortages();
    } catch {
      showToast('تعذر تحديث الحالة', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('shortages:delete', { id });
      showToast('تم حذف القيد من الدفتر', 'success');
      void loadShortages();
    } catch {
      showToast('تعذر حذف القيد', 'error');
    }
  };

  const handleGenerateAutoShortages = async () => {
    setIsGeneratingAuto(true);
    try {
      const autoList = await invoke<ShortageEntry[]>('shortages:getAutoShortages', { targetCoverDays: 15 });
      if (autoList && autoList.length > 0) {
        showToast(`تم فحص المخزون واكتشاف ${autoList.length} صنف بحاجة لإعادة طلب`, 'success');
      } else {
        showToast('لا توجد أصناف تقل عن حد الطلب الأدنى حالياً', 'success');
      }
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
      const props = await invoke<ShortagePurchaseProposal[]>('shortages:convertToPurchase', {
        shortageIds: selectedIds,
      });
      setProposals(props || []);
      setIsProposalsModalOpen(true);
    } catch {
      showToast('تعذر تحويل النواقص لأوامر شراء', 'error');
    }
  };

  const handleOpenLostSalesReport = async () => {
    try {
      const report = await invoke<LostSalesReportSummary>('shortages:getLostSalesReport', { days: 30 });
      setLostSalesReport(report);
      setIsLostSalesReportOpen(true);
    } catch {
      showToast('تعذر جلب تقرير المبيعات المفقودة', 'error');
    }
  };

  const statusOptions: SelectOption[] = [
    { value: 'all', label: 'كافة الحالات' },
    { value: 'pending', label: 'معلق (بانتظار الطلب)' },
    { value: 'ordered', label: 'تم الطلب من المورد' },
    { value: 'received', label: 'تم الاستلام بالمخزن' },
    { value: 'cancelled', label: 'ملغي / غير متوفر' },
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

          <div className="w-44">
            <CustomSelect
              options={statusOptions}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              size="sm"
            />
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

          <button
            type="button"
            onClick={() => void loadShortages()}
            className="w-8 h-8 rounded-lg border border-line dark:border-line-dark flex items-center justify-center text-ink-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand' : ''}`} />
          </button>
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
                filteredShortages.map((item) => {
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
                        {item.requestedQuantityMilli / 1000} {item.unit || 'قطعة'}
                      </td>

                      <td className="px-3 py-2.5 text-center font-mono text-[11px]">
                        <span className="text-danger font-bold">
                          {item.currentStockMilli / 1000}
                        </span>
                        {' / '}
                        <span className="text-ink-muted">
                          {item.minStockMilli / 1000}
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
                              onClick={() => void handleStatusChange(item.id, 'ordered')}
                              className="p-1 rounded hover:bg-brand-soft text-brand"
                              title="تعليم كـ تم الطلب"
                            >
                              <Truck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.status === 'ordered' && (
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(item.id, 'received')}
                              className="p-1 rounded hover:bg-paid-soft text-paid"
                              title="تعليم كـ تم الاستلام بالمخزن"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(item.id, 'cancelled')}
                              className="p-1 rounded hover:bg-surface-2 text-ink-muted"
                              title="إلغاء الطلب"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDelete(item.id)}
                            className="p-1 rounded hover:bg-danger-soft text-danger"
                            title="حذف من الدفتر"
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
        <div className="fixed inset-0 bg-ink/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="h-14 px-5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-danger" />
                <div>
                  <h3 className="text-sm font-bold text-ink dark:text-ink-dark">
                    تقرير المبيعات المفقودة والفرص الضائعة
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    تحليل لآخر 30 يوماً من طلبات العملاء غير الملباة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLostSalesReportOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-danger-soft border border-danger/20 flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-danger">إجمالي الإيرادات المفقودة المقدرة</span>
                  <span className="text-xl font-bold font-mono text-danger">
                    {formatArabicCurrency(lostSalesReport?.totalEstimatedLostRevenuePiasters || 0)}
                  </span>
                  <span className="text-[10px] text-danger/80">قيمة مبيعات كان يمكن تحقيقها لو توافرت الأصناف</span>
                </div>

                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-ink-muted">عدد الطلبات المفقودة</span>
                  <span className="text-xl font-bold font-mono text-ink dark:text-ink-dark">
                    {lostSalesReport?.totalUnmetRequestsCount || 0} طلب
                  </span>
                  <span className="text-[10px] text-ink-muted">عملاء سألوا عن أصناف ولم تكن متوفرة</span>
                </div>
              </div>

              {/* Top Missing Products */}
              <div>
                <h4 className="text-xs font-bold text-ink dark:text-ink-dark mb-2">
                  أكثر الأصناف المطلوبة غير المتوفرة (Top Missing):
                </h4>
                {(!lostSalesReport?.topRequestedProducts || lostSalesReport.topRequestedProducts.length === 0) ? (
                  <div className="py-6 text-center text-ink-muted">
                    لا توجد طلبات غير ملباة مسجلة في هذه الفترة.
                  </div>
                ) : (
                  <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted font-bold">
                        <tr>
                          <th className="px-3 py-2">الصنف</th>
                          <th className="px-3 py-2 text-center">مرات الطلب</th>
                          <th className="px-3 py-2 text-center">إجمالي الكمية المطلوبة</th>
                          <th className="px-3 py-2 text-left">قيمة المبيعات الضائعة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/40 dark:divide-line-dark/40">
                        {lostSalesReport.topRequestedProducts.map((p) => (
                          <tr key={p.productId || p.productName}>
                            <td className="px-3 py-2 font-bold text-ink dark:text-ink-dark">
                              {p.productName}
                            </td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-danger">
                              {p.requestCount} مرة
                            </td>
                            <td className="px-3 py-2 text-center font-mono">
                              {p.totalRequestedQuantityMilli / 1000}
                            </td>
                            <td className="px-3 py-2 text-left font-mono font-bold text-danger">
                              {formatArabicCurrency(p.estimatedLostRevenuePiasters)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="h-12 px-5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsLostSalesReportOpen(false)}
                className="h-8 px-4 rounded-lg border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
