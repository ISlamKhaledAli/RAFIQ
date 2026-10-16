import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  AlertTriangle,
  Clock,
  Search,
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
import { ConfirmModal } from '../../components/ConfirmModal';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { rafiqAlert } from '../../utils/dialogService';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';

export interface BatchesTabProps {
  onBatchChanged?: () => void;
  initialSearchQuery?: string;
}

export const BatchesTab: React.FC<BatchesTabProps> = ({ onBatchChanged, initialSearchQuery }) => {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const showLoading = useSmoothLoading(loading, 300);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring' | 'expired' | 'active'>('all');
  const [alertDays, setAlertDays] = useState<number>(30);
  const [isCustomDays, setIsCustomDays] = useState(false);
  const [customDaysInput, setCustomDaysInput] = useState('30');

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
        title: 'تمت التسوية بنجاح',
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
        message: 'تم إتلاف الدفعة وتصفير رصيدها وتسجيل قيد هالك المخزون بنجاح.',
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

  // Filtered batches
  const filteredBatches = batches.filter((b) => {
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
  } = useClientPagination(filteredBatches, 25, `${searchQuery}_${statusFilter}_${alertDays}`);

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden select-none">
      {/* Top Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {/* 1. Active Batches */}
        <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center font-bold border border-brand/20 dark:border-brand-bright/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold">إجمالي الدفعات النشطة</div>
              <div className="text-[18px] font-mono font-bold text-ink dark:text-ink-dark">
                {(summary?.totalActiveBatches || 0).toLocaleString('en-US')} دفعة
              </div>
            </div>
          </div>
          <span className="text-[10px] text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-2 py-0.5 rounded-full border border-paid/20 dark:border-emerald-800/40 font-bold">
            نظام الصلاحية نشط
          </span>
        </div>

        {/* 2. Expiring Soon Card */}
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between shadow-2xs ${
            (summary?.expiringSoonCount || 0) > 0
              ? 'bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-warn dark:text-warn-bright font-bold">
                أوشكت على الانتهاء ({alertDays} يوم)
              </div>
              <div className="text-[18px] font-mono font-bold text-warn dark:text-warn-bright">
                {(summary?.expiringSoonCount || 0).toLocaleString('en-US')} دفعة
              </div>
            </div>
          </div>
          <span className="text-[10.5px] font-mono font-bold text-warn dark:text-warn-bright bg-white/80 dark:bg-surface-dark-2 px-2 py-0.5 rounded-full border border-warn/20 dark:border-warn-bright/30">
            {formatArabicCurrency(summary?.expiringSoonValuePiasters || 0)}
          </span>
        </div>

        {/* 3. Expired Card */}
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between shadow-2xs ${
            (summary?.expiredCount || 0) > 0
              ? 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-danger dark:text-danger-bright font-bold">دفعات منتهية الصلاحية</div>
              <div className="text-[18px] font-mono font-bold text-danger dark:text-danger-bright">
                {(summary?.expiredCount || 0).toLocaleString('en-US')} دفعة
              </div>
            </div>
          </div>
          <span className="text-[10.5px] font-mono font-bold text-danger dark:text-danger-bright bg-white/80 dark:bg-surface-dark-2 px-2 py-0.5 rounded-full border border-danger/20 dark:border-danger-bright/30">
            هالك: {formatArabicCurrency(summary?.expiredValuePiasters || 0)}
          </span>
        </div>

        {/* 4. Total Batch Stock Value */}
        <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-xl border border-line dark:border-line-dark flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center font-bold border border-paid/20 dark:border-emerald-800/40">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold">قيمة مخزون الدفعات</div>
              <div className="text-[16px] font-mono font-bold text-paid dark:text-paid-bright">
                {formatArabicCurrency(summary?.totalBatchStockValuePiasters || 0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-brand text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark'
            }`}
          >
            كافة الدفعات
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expiring')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'expiring'
                ? 'bg-warn text-white shadow-xs'
                : 'text-warn dark:text-warn-bright hover:bg-warn-soft dark:hover:bg-warn-dark-soft'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>قريبة الانتهاء</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'expired'
                ? 'bg-danger text-white shadow-xs'
                : 'text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>منتهية الصلاحية</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-paid text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark'
            }`}
          >
            صالحة ومستقرة
          </button>
        </div>

        {/* Right Search & Alert Threshold */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Alert Days Selector */}
          <div className="flex items-center gap-1.5 bg-surface-2 dark:bg-surface-dark-2 px-2.5 py-1 rounded-xl border border-line dark:border-line-dark">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold whitespace-nowrap">فترة التنبيه:</span>
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
                    className="w-16 h-7 px-2 text-xs font-mono font-bold bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink dark:text-ink-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none text-center"
                    placeholder="الأيام"
                    autoFocus
                  />
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted mr-1 font-bold">يوم</span>
                </div>
                <button
                  type="button"
                  onClick={handleApplyCustomDays}
                  className="h-7 px-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition-colors cursor-pointer flex items-center gap-0.5 shadow-2xs"
                  title="تطبيق فترة التنبيه"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>تطبيق</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomDays(false)}
                  className="h-7 px-1.5 bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark border border-line dark:border-line-dark rounded-lg text-xs transition-colors cursor-pointer"
                  title="إلغاء والعودة للقائمة"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
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
                className="w-44"
                size="sm"
              />
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-56 h-8 flex items-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-2.5 focus-within:border-brand dark:focus-within:border-brand-bright focus-within:ring-2 focus-within:ring-brand/20 transition-all">
            <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted ml-1.5 shrink-0" />
            <input
              type="text"
              placeholder="بحث بالصنف أو رقم الدفعة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
              className="w-full bg-transparent border-none text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>


        </div>
      </div>

      {/* Batches Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl overflow-hidden flex flex-col shadow-xs">
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
              <Calendar className="w-10 h-10 opacity-30" />
              <span className="text-sm font-semibold text-ink dark:text-ink-dark">لا توجد دفعات مطابقة للمعايير المحددة</span>
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                يتم تسجيل الدفعات وتواريخ الصلاحية تلقائياً عند استلام فواتير الشراء
              </span>
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
                    <span className="text-[11px] font-mono text-ink-muted dark:text-ink-dark-muted">
                      كود: {b.productBarcode || '—'}
                    </span>
                  </div>

                  {/* Batch Number */}
                  <div className="col-span-2">
                    <span className="font-mono font-bold text-brand dark:text-brand-bright bg-brand-soft/70 dark:bg-brand-soft/20 px-2 py-0.5 rounded border border-brand/20 dark:border-brand-bright/20">
                      {b.batchNumber}
                    </span>
                    {b.productionDate && (
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">
                        إنتاج: {b.productionDate}
                      </span>
                    )}
                  </div>

                  {/* Expiry Date & Remaining Days */}
                  <div className="col-span-2">
                    <div className="font-mono font-bold text-ink dark:text-ink-dark">{b.expiryDate || '—'}</div>
                    {b.isExpired ? (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 px-1.5 py-0.2 rounded mt-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        منتهي الصلاحية
                      </span>
                    ) : b.isExpiringSoon ? (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 px-1.5 py-0.2 rounded mt-0.5">
                        <Clock className="w-3 h-3" />
                        أوشك على الانتهاء
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-paid dark:text-paid-bright font-medium">صالح ومستقر</span>
                    )}
                  </div>

                  {/* Current Quantity */}
                  <div className="col-span-1 text-center font-mono font-bold text-ink dark:text-ink-dark">
                    {qtyFormatted} {b.unit || 'قطعة'}
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
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30">
                        منتهي
                      </span>
                    ) : b.status === 'DEPLETED' ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        مستهلك
                      </span>
                    ) : b.isExpiringSoon ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/30">
                        تنبيه
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-emerald-800/40">
                        نشط
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="col-span-1 text-left flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustingBatch(b);
                        setAdjustQtyInput((b.quantityMilli / 1000).toString());
                        setAdjustNote('');
                      }}
                      className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-lg transition-colors cursor-pointer"
                      title="تسوية رصيد هذه الدفعة"
                    >
                      <Sliders className="w-4 h-4" />
                    </button>
                    {(b.isExpired || b.isExpiringSoon) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDisposingBatch(b);
                          setDisposalReason('تالف ومنتهي الصلاحية');
                        }}
                        className="p-1.5 text-danger dark:text-danger-bright hover:text-red-700 dark:hover:text-red-300 hover:bg-danger-soft dark:hover:bg-danger-dark-soft rounded-lg transition-colors cursor-pointer"
                        title="إتلاف الدفعة وتصفير رصيدها"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table Footer */}
        <div className="h-9 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-4 flex items-center justify-between text-xs text-ink-muted dark:text-ink-dark-muted shrink-0">
          <span>إجمالي الدفعات المسجلة: {batches.length} دفعة</span>
        </div>
      </div>

      {/* Pagination Bar */}
      <PaginationBar
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={filteredBatches.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[15, 25, 50, 100]}
        itemLabel="دفعة"
      />

      {/* Adjust Batch Quantity Modal */}
      {adjustingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand dark:text-brand-bright" />
                <h3 className="font-bold text-sm text-ink dark:text-ink-dark">تسوية رصيد الدفعة يدويّاً</h3>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingBatch(null)}
                className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="p-5 flex flex-col gap-4">
              <div className="bg-surface-2 dark:bg-surface-dark-2 p-3 rounded-xl border border-line dark:border-line-dark text-xs space-y-1">
                <div className="font-bold text-ink dark:text-ink-dark">{adjustingBatch.productName}</div>
                <div className="text-ink-muted dark:text-ink-dark-muted font-mono">
                  رقم الدفعة: {adjustingBatch.batchNumber} | تاريخ الانتهاء: {adjustingBatch.expiryDate || 'غير محدد'}
                </div>
                <div className="text-ink-muted dark:text-ink-dark-muted">
                  الرصيد المسجل حالياً: {(adjustingBatch.quantityMilli / 1000).toFixed(3)}{' '}
                  {adjustingBatch.unit || 'قطعة'}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                  الرصيد الفعلي الجديد بعد التسوية <span className="text-danger dark:text-danger-bright">*</span>
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
                <button
                  type="button"
                  onClick={() => setAdjustingBatch(null)}
                  className="px-4 py-2 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark rounded-xl text-xs font-bold text-ink dark:text-ink-dark cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="px-5 py-2 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{adjustLoading ? 'جاري الحفظ...' : 'تأكيد وحفظ التسوية'}</span>
                </button>
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
