import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  Clock,
  X,
  Trash2,
  Sliders,
  DollarSign,
  Layers,
  ArrowUpDown,
  Check,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import type { ProductBatch, BatchSummary } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { CustomSelect } from '../../components/CustomSelect';
import { SegmentedTabs, type SegmentedTabOption } from '../../components/SegmentedTabs';
import { ConfirmModal } from '../../components/ConfirmModal';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { rafiqAlert } from '../../utils/dialogService';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
import { RequiredMark } from '../../components/RequiredMark';
import { ExpiryRangeFilter } from '../../components/ExpiryRangeFilter';
import { AppButton } from '../../components/AppButton';
import { SearchInput } from '../../components/SearchInput';
import { describeDateFilter, normalizeDateRange } from '../../utils/dateFilter';
import { formatUnitArabic } from '../../utils/units';
import { isSameFormValue } from '../../utils/dirtyForm';
import {
  EMPTY_EXPIRY_RANGE,
  isExpiryRangeActive,
  matchesExpiryRange,
  summarizeBatches,
  type ExpiryRange,
} from '../../utils/expiryRange';

export interface BatchesTabProps {
  onBatchChanged?: () => void;
  initialSearchQuery?: string;
}

type BatchStatusFilter = 'all' | 'expiring' | 'expired' | 'active';

const BATCH_STATUS_TABS: SegmentedTabOption<BatchStatusFilter>[] = [
  { value: 'all', label: 'كافة الدفعات' },
  { value: 'expiring', label: 'قريبة الانتهاء', icon: Clock, tone: 'warn' },
  { value: 'expired', label: 'منتهية الصلاحية', icon: AlertTriangle, tone: 'danger' },
  { value: 'active', label: 'صالحة ومستقرة', tone: 'paid' },
];

const BATCH_PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

export const BatchesTab: React.FC<BatchesTabProps> = ({ onBatchChanged, initialSearchQuery }) => {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const showLoading = useSmoothLoading(loading, 300);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [statusFilter, setStatusFilter] = useState<BatchStatusFilter>('all');
  const [alertDays, setAlertDays] = useState<number>(30);
  const [isCustomDays, setIsCustomDays] = useState(false);
  const [customDaysInput, setCustomDaysInput] = useState('30');
  // Expiry-date range (from/to, inclusive); independent of the alert window, both apply together
  const [expiryRange, setExpiryRange] = useState<ExpiryRange>({ ...EMPTY_EXPIRY_RANGE });
  const isExpiryActive = isExpiryRangeActive(expiryRange);
  const expiryLabel = describeDateFilter({ preset: 'custom', ...normalizeDateRange(expiryRange.startDate, expiryRange.endDate) });

  const standardDayOptions = [7, 15, 30, 60, 90, 120, 180, 365];
  const isStandardOption = standardDayOptions.includes(alertDays);

  const handleApplyCustomDays = () => {
    const num = parseInt(normalizeArabicNumerals(customDaysInput), 10);
    if (!num || isNaN(num) || num <= 0) {
      void rafiqAlert({
        title: 'قيمة غير صحيحة',
        message: 'يرجى إدخال عدد أيام صحيح أكبر من الصفر.',
        variant: 'warning',
      });
      return;
    }
    setAlertDays(num);
    setIsCustomDays(false);
  };

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Modals state
  const [adjustingBatch, setAdjustingBatch] = useState<ProductBatch | null>(null);
  const [adjustQtyInput, setAdjustQtyInput] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  const isAdjustDirty = useCallback(() => {
    if (!adjustingBatch) return false;
    const initialQty = (adjustingBatch.quantityMilli / 1000).toString();
    return !isSameFormValue(adjustQtyInput, initialQty) || adjustNote.trim().length > 0;
  }, [adjustingBatch, adjustQtyInput, adjustNote]);

  const { requestClose: requestCloseAdjust, handleBackdropClick: handleAdjustBackdropClick } = useModalDismiss({
    isOpen: Boolean(adjustingBatch),
    onClose: () => {
      setAdjustingBatch(null);
      setAdjustQtyInput('');
      setAdjustNote('');
    },
    isDirty: isAdjustDirty,
    confirmTitle: 'تعديلات تسوية الدفعة غير محفوظة',
    confirmMessage: 'لقد قمت بإدخال تعديلات على رصيد الدفعة. هل أنت متأكد من الخروج وتجاهل التعديلات؟',
  });

  const [disposingBatch, setDisposingBatch] = useState<ProductBatch | null>(null);
  const [disposalReason, setDisposalReason] = useState('تالف ومنتهي الصلاحية');
  const [disposeLoading, setDisposeLoading] = useState(false);

  const loadData = useCallback(async (days = alertDays) => {
    setLoading(true);
    try {
      const [summaryRes, expiringRes, expiredRes, allActive] = await Promise.all([
        invoke<BatchSummary>('batch:summary', { days }),
        invoke<ProductBatch[]>('batch:listExpiring', { days }),
        invoke<ProductBatch[]>('batch:listExpired'),
        invoke<ProductBatch[]>('batch:listExpiring', { days: 3650 }),
      ]);

      setSummary(summaryRes || null);

      // Merge and deduplicate lists
      const map = new Map<string, ProductBatch>();
      (expiredRes || []).forEach((b) => {
        map.set(b.id, { ...b, isExpired: true, isExpiringSoon: false });
      });
      (expiringRes || []).forEach((b) => {
        if (!map.has(b.id)) {
          map.set(b.id, { ...b, isExpiringSoon: true, isExpired: false });
        }
      });

      (allActive || []).forEach((b) => {
        if (!map.has(b.id)) {
          map.set(b.id, b);
        }
      });

      setBatches(Array.from(map.values()));
    } catch (err: unknown) {
      console.error('Failed to load batches:', err);
    } finally {
      setLoading(false);
    }
  }, [alertDays]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [summaryRes, expiringRes, expiredRes, allActive] = await Promise.all([
          invoke<BatchSummary>('batch:summary', { days: alertDays }),
          invoke<ProductBatch[]>('batch:listExpiring', { days: alertDays }),
          invoke<ProductBatch[]>('batch:listExpired'),
          invoke<ProductBatch[]>('batch:listExpiring', { days: 3650 }),
        ]);

        if (!active) return;
        setSummary(summaryRes || null);

        const map = new Map<string, ProductBatch>();
        (expiredRes || []).forEach((b) => {
          map.set(b.id, { ...b, isExpired: true, isExpiringSoon: false });
        });
        (expiringRes || []).forEach((b) => {
          if (!map.has(b.id)) {
            map.set(b.id, { ...b, isExpiringSoon: true, isExpired: false });
          }
        });

        (allActive || []).forEach((b) => {
          if (!map.has(b.id)) {
            map.set(b.id, b);
          }
        });

        setBatches(Array.from(map.values()));
      } catch (err: unknown) {
        console.error('Failed to load batches:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [alertDays]);

  useDataSubscription(['products', 'all'], () => {
    void loadData(alertDays);
  });

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingBatch) return;

    const parsedQty = parseFloat(normalizeArabicNumerals(adjustQtyInput));
    if (isNaN(parsedQty) || parsedQty < 0) {
      void rafiqAlert({
        title: 'قيمة غير صالحة',
        message: 'يرجى إدخال كمية صحيحة (صفر أو أكثر)',
        variant: 'warning',
      });
      return;
    }

    setAdjustLoading(true);
    try {
      const newMilli = Math.round(parsedQty * 1000);
      await invoke('batch:adjust', {
        batchId: adjustingBatch.id,
        newQuantityMilli: newMilli,
        note: adjustNote.trim() || 'تسوية رصيد يدوي للدفعة',
      });

      setAdjustingBatch(null);
      setAdjustQtyInput('');
      setAdjustNote('');
      void loadData(alertDays);
      onBatchChanged?.();
      void rafiqAlert({
        title: 'تمت التسوية',
        message: 'تم تحديث رصيد الدفعة وتسجيل الحركة في دفتر المخزون.',
        variant: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل تسوية الرصيد',
        message: msg,
        variant: 'error',
      });
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleDisposeConfirm = async () => {
    if (!disposingBatch) return;
    setDisposeLoading(true);
    try {
      await invoke('batch:disposeExpired', {
        batchId: disposingBatch.id,
        reason: disposalReason.trim() || 'إتلاف بضاعة منتهية الصلاحية',
        userId: 'admin',
      });

      setDisposingBatch(null);
      void loadData(alertDays);
      onBatchChanged?.();
      void rafiqAlert({
        title: 'تم إتلاف الدفعة',
        message: 'تم إتلاف الدفعة وتسجيل قيد هالك المخزون.',
        variant: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'فشل إتلاف الدفعة',
        message: msg,
        variant: 'error',
      });
    } finally {
      setDisposeLoading(false);
    }
  };

  // Cards follow the expiry range; without a range they keep the backend totals
  const expirySummary = useMemo(
    () => (isExpiryActive ? summarizeBatches(batches.filter((b) => matchesExpiryRange(b.expiryDate, expiryRange))) : null),
    [batches, expiryRange, isExpiryActive],
  );
  const cardActiveCount = expirySummary ? expirySummary.activeCount : summary?.totalActiveBatches || 0;
  const cardExpiringCount = expirySummary ? expirySummary.expiringSoonCount : summary?.expiringSoonCount || 0;
  const cardExpiringValue = expirySummary ? expirySummary.expiringSoonValuePiasters : summary?.expiringSoonValuePiasters || 0;
  const cardExpiredCount = expirySummary ? expirySummary.expiredCount : summary?.expiredCount || 0;
  const cardExpiredValue = expirySummary ? expirySummary.expiredValuePiasters : summary?.expiredValuePiasters || 0;
  const cardTotalValue = expirySummary ? expirySummary.totalValuePiasters : summary?.totalBatchStockValuePiasters || 0;

  const resetAllFilters = () => {
    setExpiryRange({ ...EMPTY_EXPIRY_RANGE });
    setStatusFilter('all');
    setSearchQuery('');
  };

  // Filtered batches
  const filteredBatches = batches.filter((b) => {
    // Expiry range
    if (isExpiryActive && !matchesExpiryRange(b.expiryDate, expiryRange)) return false;

    // Status Filter
    if (statusFilter === 'expired' && !b.isExpired) return false;
    if (statusFilter === 'expiring' && (!b.isExpiringSoon || b.isExpired)) return false;
    if (statusFilter === 'active' && (b.isExpired || b.isExpiringSoon)) return false;

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const nameMatch = (b.productName || '').toLowerCase().includes(q);
      const barcodeMatch = (b.productBarcode || '').toLowerCase().includes(q);
      const batchNoMatch = (b.batchNumber || '').toLowerCase().includes(q);
      return nameMatch || barcodeMatch || batchNoMatch;
    }

    return true;
  });

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedBatches,
  } = useClientPagination(filteredBatches, 25, `${searchQuery}_${statusFilter}_${alertDays}_${expiryRange.startDate}_${expiryRange.endDate}`);

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto select-none">
      {/* Top Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {/* 1. Active Batches */}
        <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold border border-brand/20 dark:border-brand-bright/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold">إجمالي الدفعات النشطة</div>
              <div className="text-lg font-mono font-bold text-ink dark:text-ink-dark">
                {cardActiveCount.toLocaleString('en-US')} دفعة
              </div>
              <div className={`text-micro font-bold ${isExpiryActive ? 'text-brand dark:text-brand-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                تنتهي: {isExpiryActive ? expiryLabel : 'كل التواريخ'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Expiring Soon Card */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-2xs ${
            cardExpiringCount > 0
              ? 'bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-micro text-warn dark:text-warn-bright font-bold">
                أوشكت على الانتهاء ({alertDays} يوم)
              </div>
              <div className="text-lg font-mono font-bold text-warn dark:text-warn-bright">
                {cardExpiringCount.toLocaleString('en-US')} دفعة
              </div>
            </div>
          </div>
          {cardExpiringCount > 0 && (
            <span className="text-micro font-mono font-bold text-warn dark:text-warn-bright bg-white/80 dark:bg-surface-dark-2 px-2 py-0.5 rounded-full border border-warn/20 dark:border-warn-bright/30">
              {formatArabicCurrency(cardExpiringValue)}
            </span>
          )}
        </div>

        {/* 3. Expired Card */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-2xs ${
            cardExpiredCount > 0
              ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-micro text-danger dark:text-danger-bright font-bold">دفعات منتهية الصلاحية</div>
              <div className="text-lg font-mono font-bold text-danger dark:text-danger-bright">
                {cardExpiredCount.toLocaleString('en-US')} دفعة
              </div>
            </div>
          </div>
          {cardExpiredCount > 0 && (
            <span className="text-micro font-mono font-bold text-danger dark:text-danger-bright bg-white/80 dark:bg-surface-dark-2 px-2 py-0.5 rounded-full border border-danger/20 dark:border-danger-bright/30">
              هالك: {formatArabicCurrency(cardExpiredValue)}
            </span>
          )}
        </div>

        {/* 4. Total Batch Stock Value */}
        <div className="bg-surface dark:bg-surface-dark p-4 rounded-xl border border-line dark:border-line-dark flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center font-bold border border-paid/20 dark:border-emerald-800/40">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold">قيمة مخزون الدفعات</div>
              <div className="text-base font-mono font-bold text-paid dark:text-paid-bright">
                {formatArabicCurrency(cardTotalValue)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 flex flex-col gap-4 shrink-0 shadow-xs">
        {/* Status Tabs */}
        <SegmentedTabs
          ariaLabel="تصفية الدفعات حسب حالة الصلاحية"
          fullWidth
          value={statusFilter}
          onChange={setStatusFilter}
          options={BATCH_STATUS_TABS}
        />

        {/* Search & Alert Threshold */}
        <div className="flex items-center gap-x-8 gap-y-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
          {/* Alert Days Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-muted dark:text-ink-dark-muted font-bold whitespace-nowrap">فترة التنبيه:</span>
            {isCustomDays ? (
              <div className="flex items-center gap-1">
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={customDaysInput}
                    onChange={(e) => setCustomDaysInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyCustomDays();
                      if (e.key === 'Escape') setIsCustomDays(false);
                    }}
                    className="w-20 h-10 px-2 text-sm font-mono font-bold bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink dark:text-ink-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none text-center"
                    placeholder="الأيام"
                    autoFocus
                  />
                  <span className="text-micro text-ink-muted dark:text-ink-dark-muted mr-1 font-bold">يوم</span>
                </div>
                <AppButton variant="primary" icon={Check} onClick={handleApplyCustomDays} title="تطبيق فترة التنبيه">
                  تطبيق
                </AppButton>
                <AppButton
                  variant="secondary"
                  icon={X}
                  onClick={() => setIsCustomDays(false)}
                  aria-label="إلغاء والعودة للقائمة"
                  title="إلغاء والعودة للقائمة"
                />
              </div>
            ) : (
              <CustomSelect
                value={isStandardOption ? String(alertDays) : 'custom'}
                onChange={(val) => {
                  if (val === 'custom') {
                    setCustomDaysInput(String(alertDays));
                    setIsCustomDays(true);
                  } else {
                    setAlertDays(parseInt(val, 10) || 30);
                  }
                }}
                options={[
                  { value: '7', label: 'خلال 7 أيام' },
                  { value: '15', label: 'خلال 15 يوماً' },
                  { value: '30', label: 'خلال 30 يوماً (المعتاد)' },
                  { value: '60', label: 'خلال 60 يوماً' },
                  { value: '90', label: 'خلال 90 يوماً' },
                  { value: '120', label: 'خلال 120 يوماً (4 أشهر)' },
                  { value: '180', label: 'خلال 180 يوماً (6 أشهر)' },
                  { value: '365', label: 'خلال سنة (365 يوماً)' },
                  {
                    value: 'custom',
                    label: isStandardOption ? '+ إدخال عدد أيام مخصص...' : `مخصص: ${alertDays} يوماً (تعديل)`,
                    isAction: true,
                  },
                ]}
                className="w-56"
                size="lg"
              />
            )}
          </div>

          {/* Expiry date range: from/to, applies together with the alert window, status tabs and search */}
          <ExpiryRangeFilter value={expiryRange} onChange={setExpiryRange} size="lg" />
          </div>
          {/* Search Box */}
          <SearchInput
            size="md"
            value={searchQuery}
            onChange={(value) => setSearchQuery(normalizeArabicNumerals(value))}
            placeholder="بحث بالصنف أو رقم الدفعة..."
            ariaLabel="بحث في الدفعات وتواريخ الصلاحية"
            className="flex-1 min-w-[18rem]"
          />


        </div>
      </div>

      {/* Batches Table */}
      <div className="flex-1 min-h-[20rem] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl overflow-hidden flex flex-col shadow-xs">
        <div className="h-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted shrink-0">
          <div className="col-span-3">اسم الصنف والباركود</div>
          <div className="col-span-2">رقم الدفعة</div>
          <div className="col-span-2">تاريخ الصلاحية والمهلة</div>
          <div className="col-span-1 text-center">الرصيد المتبقي</div>
          <div className="col-span-1 text-center">سعر التكلفة</div>
          <div className="col-span-1 text-center">إجمالي القيمة</div>
          <div className="col-span-1 text-center">الحالة</div>
          <div className="col-span-1 text-left">إجراءات</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark">
          {showLoading ? (
            <RafiqLoadingState 
              label="جاري فحص وتحديث تواريخ الصلاحية والدفعات..." 
              sublabel="الاتصال بقاعدة البيانات ومطابقة المهل الزمنية وحساب الهالك" 
            />
          ) : filteredBatches.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
              <Calendar className="w-10 h-10 opacity-40 dark:opacity-100" />
              <span className="text-sm font-semibold text-ink dark:text-ink-dark">
                {isExpiryActive ? `لا توجد دفعات تنتهي صلاحيتها في الفترة دي (${expiryLabel})` : 'لا توجد دفعات مطابقة للمعايير المحددة'}
              </span>
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                يتم تسجيل الدفعات وتواريخ الصلاحية تلقائياً عند استلام فواتير الشراء
              </span>
              {(isExpiryActive || statusFilter !== 'all' || searchQuery.trim() !== '') && (
                <AppButton variant="soft" onClick={resetAllFilters} className="mt-1">
                  مسح الفلاتر وعرض كل الدفعات
                </AppButton>
              )}
            </div>
          ) : (
            pagedBatches.map((b) => {
              const qtyFormatted = (b.quantityMilli / 1000).toLocaleString('en-US', {
                maximumFractionDigits: 3,
              });
              const totalValPiasters = Math.round((b.quantityMilli * b.costPricePiasters) / 1000);

              return (
                <div
                  key={b.id}
                  className={`h-14 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors ${
                    b.isExpired ? 'bg-danger-soft/40 dark:bg-danger-dark-soft/40' : b.isExpiringSoon ? 'bg-warn-soft/40 dark:bg-warn-dark-soft/40' : ''
                  }`}
                >
                  {/* Product Info */}
                  <div className="col-span-3 pr-1">
                    <span className="font-bold text-ink dark:text-ink-dark block truncate">{b.productName}</span>
                    <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                      كود: {b.productBarcode || '—'}
                    </span>
                  </div>

                  {/* Batch Number */}
                  <div className="col-span-2">
                    <span className="font-mono font-bold text-brand dark:text-brand-bright bg-brand-soft/70 dark:bg-brand-dark-soft px-2 py-0.5 rounded border border-brand/20 dark:border-brand-bright/20">
                      {b.batchNumber}
                    </span>
                    {b.productionDate && (
                      <span className="text-micro text-ink-muted dark:text-ink-dark-muted block mt-0.5">
                        إنتاج: {b.productionDate}
                      </span>
                    )}
                  </div>

                  {/* Expiry Date & Remaining Days */}
                  <div className="col-span-2">
                    <div className="font-mono font-bold text-ink dark:text-ink-dark">{b.expiryDate || '—'}</div>
                    {typeof b.daysUntilExpiry === 'number' && (
                      <span
                        className={`text-micro font-bold ${
                          b.isExpired
                            ? 'text-danger dark:text-danger-bright'
                            : b.isExpiringSoon
                              ? 'text-warn dark:text-warn-bright'
                              : 'text-ink-muted dark:text-ink-dark-muted'
                        }`}
                      >
                        {b.daysUntilExpiry < 0
                          ? `منذ ${Math.abs(b.daysUntilExpiry)} يوم`
                          : b.daysUntilExpiry === 0
                            ? 'ينتهي اليوم'
                            : `باقي ${b.daysUntilExpiry} يوم`}
                      </span>
                    )}
                  </div>

                  {/* Current Quantity */}
                  <div className="col-span-1 text-center font-mono font-bold text-ink dark:text-ink-dark">
                    {qtyFormatted} {formatUnitArabic(b.unit)}
                  </div>

                  {/* Unit Cost */}
                  <div className="col-span-1 text-center font-mono font-medium text-ink-muted dark:text-ink-dark-muted">
                    {formatArabicCurrency(b.costPricePiasters)}
                  </div>

                  {/* Total Value */}
                  <div className="col-span-1 text-center font-mono font-bold text-ink dark:text-ink-dark">
                    {formatArabicCurrency(totalValPiasters)}
                  </div>

                  {/* Status Badge */}
                  <div className="col-span-1 text-center">
                    {b.status === 'EXPIRED' || b.isExpired ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30">
                        منتهي
                      </span>
                    ) : b.status === 'DEPLETED' ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-micro font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        مستهلك
                      </span>
                    ) : b.isExpiringSoon ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-micro font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30">
                        تنبيه
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-micro font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-emerald-800/40">
                        نشط
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="col-span-1 text-left flex items-center justify-end gap-1">
                    <AppButton
                      variant="subtle"
                      size="xs"
                      icon={Sliders}
                      onClick={() => {
                        setAdjustingBatch(b);
                        setAdjustQtyInput((b.quantityMilli / 1000).toString());
                        setAdjustNote('');
                      }}
                      aria-label="تسوية رصيد هذه الدفعة"
                      title="تسوية رصيد هذه الدفعة"
                    />
                    {(b.isExpired || b.isExpiringSoon) && (
                      <AppButton
                        variant="dangerSubtle"
                        size="xs"
                        icon={Trash2}
                        onClick={() => {
                          setDisposingBatch(b);
                          setDisposalReason('تالف ومنتهي الصلاحية');
                        }}
                        aria-label="إتلاف الدفعة وتصفير رصيدها"
                        title="إتلاف الدفعة وتصفير رصيدها"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Pagination Bar: only when more than one page is possible */}
      {filteredBatches.length > BATCH_PAGE_SIZE_OPTIONS[0] && (
        <PaginationBar
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={filteredBatches.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={BATCH_PAGE_SIZE_OPTIONS}
          itemLabel="دفعة"
        />
      )}

      {/* Adjust Batch Quantity Modal */}
      {adjustingBatch && (
        <div onClick={handleAdjustBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand dark:text-brand-bright" />
                <h3 className="t-card-title text-ink dark:text-ink-dark">تسوية رصيد الدفعة يدويّاً</h3>
              </div>
              <AppButton variant="subtle" size="xs" icon={X} onClick={() => void requestCloseAdjust()} aria-label="إغلاق" />
            </div>

            <form onSubmit={handleAdjustSubmit} className="p-5 flex flex-col gap-4">
              <div className="bg-surface-2 dark:bg-surface-dark-2 p-3 rounded-xl border border-line dark:border-line-dark text-xs space-y-1">
                <div className="font-bold text-ink dark:text-ink-dark">{adjustingBatch.productName}</div>
                <div className="text-ink-muted dark:text-ink-dark-muted font-mono">
                  رقم الدفعة: {adjustingBatch.batchNumber} | تاريخ الانتهاء: {adjustingBatch.expiryDate || 'غير محدد'}
                </div>
                <div className="text-ink-muted dark:text-ink-dark-muted">
                  الرصيد المسجل حالياً: {(adjustingBatch.quantityMilli / 1000).toFixed(3)}{' '}
                  {formatUnitArabic(adjustingBatch.unit)}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                  الرصيد الفعلي الجديد بعد التسوية <RequiredMark />
                </label>
                <input
                  type="text"
                  autoFocus
                  value={adjustQtyInput}
                  onChange={(e) => setAdjustQtyInput(normalizeArabicNumerals(e.target.value))}
                  placeholder="مثال: 15"
                  className="w-full h-10 px-3 font-mono font-bold text-sm text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                  سبب التسوية الجردية
                </label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="مثال: جرد يدوي / كسر عبوة"
                  className="w-full h-10 px-3 text-xs text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line dark:border-line-dark">
                <AppButton variant="secondary" onClick={() => void requestCloseAdjust()}>
                  إلغاء
                </AppButton>
                <AppButton type="submit" variant="primary" icon={ArrowUpDown} disabled={adjustLoading}>
                  {adjustLoading ? 'جاري الحفظ...' : 'تأكيد وحفظ التسوية'}
                </AppButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispose Expired Batch Confirmation Modal */}
      {disposingBatch && (
        <ConfirmModal
          isOpen={!!disposingBatch}
          title="تأكيد إتلاف الدفعة المنتهية الصلاحية"
          message={`هل أنت متأكد من إتلاف الدفعة (${disposingBatch.batchNumber}) للصنف "${disposingBatch.productName}"؟ سيتم تصفير رصيدها (${(disposingBatch.quantityMilli / 1000).toFixed(0)} ${disposingBatch.unit || 'قطعة'}) وتسجيل قيد هالك في سجل المخزون.`}
          confirmText={disposeLoading ? 'جاري الإتلاف...' : 'تأكيد الإتلاف وتصفير الرصيد'}
          cancelText="تراجع"
          isDanger={true}
          onConfirm={() => void handleDisposeConfirm()}
          onCancel={() => setDisposingBatch(null)}
        />
      )}
    </div>
  );
};
