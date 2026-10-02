import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  AlertTriangle,
  Clock,
  Search,
  X,
  RefreshCw,
  Trash2,
  Sliders,
  DollarSign,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import type { ProductBatch, BatchSummary } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { CustomSelect } from '../../components/CustomSelect';
import { ConfirmModal } from '../../components/ConfirmModal';
import { rafiqAlert } from '../../utils/dialogService';

export interface BatchesTabProps {
  onBatchChanged?: () => void;
}

export const BatchesTab: React.FC<BatchesTabProps> = ({ onBatchChanged }) => {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring' | 'expired' | 'active'>('all');
  const [alertDays, setAlertDays] = useState<number>(30);

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

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden select-none">
      {/* Top Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {/* 1. Active Batches */}
        <div className="bg-surface p-3.5 rounded-xl border border-line flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center font-bold border border-brand/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-ink-muted font-bold">إجمالي الدفعات النشطة</div>
              <div className="text-[18px] font-mono font-bold text-ink">
                {(summary?.totalActiveBatches || 0).toLocaleString('ar-EG')} دفعة
              </div>
            </div>
          </div>
          <span className="text-[10px] text-paid bg-paid-soft px-2 py-0.5 rounded-full border border-paid/20 font-bold">
            FEFO مفعّل
          </span>
        </div>

        {/* 2. Expiring Soon Card */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'expiring' ? 'all' : 'expiring')}
          className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all shadow-2xs ${
            statusFilter === 'expiring' ? 'ring-2 ring-warn ring-offset-1' : ''
          } ${
            (summary?.expiringSoonCount || 0) > 0
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-surface border-line'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-amber-900 font-bold">
                أوشكت على الانتهاء ({alertDays} يوم)
              </div>
              <div className="text-[18px] font-mono font-bold text-amber-950">
                {(summary?.expiringSoonCount || 0).toLocaleString('ar-EG')} دفعة
              </div>
            </div>
          </div>
          <span className="text-[10.5px] font-mono font-bold text-amber-900 bg-white/80 px-2 py-0.5 rounded-full border border-amber-300">
            {formatArabicCurrency(summary?.expiringSoonValuePiasters || 0)}
          </span>
        </div>

        {/* 3. Expired Card */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')}
          className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all shadow-2xs ${
            statusFilter === 'expired' ? 'ring-2 ring-danger ring-offset-1' : ''
          } ${
            (summary?.expiredCount || 0) > 0
              ? 'bg-rose-50/80 border-rose-200'
              : 'bg-surface border-line'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-rose-900 font-bold">دفعات منتهية الصلاحية</div>
              <div className="text-[18px] font-mono font-bold text-rose-950">
                {(summary?.expiredCount || 0).toLocaleString('ar-EG')} دفعة
              </div>
            </div>
          </div>
          <span className="text-[10.5px] font-mono font-bold text-rose-900 bg-white/80 px-2 py-0.5 rounded-full border border-rose-300">
            هالك: {formatArabicCurrency(summary?.expiredValuePiasters || 0)}
          </span>
        </div>

        {/* 4. Total Batch Stock Value */}
        <div className="bg-surface p-3.5 rounded-xl border border-line flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-paid-soft text-paid flex items-center justify-center font-bold border border-paid/20">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-ink-muted font-bold">قيمة مخزون الدفعات</div>
              <div className="text-[16px] font-mono font-bold text-paid">
                {formatArabicCurrency(summary?.totalBatchStockValuePiasters || 0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-surface border border-line rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-brand text-white shadow-xs'
                : 'text-ink-muted hover:text-ink hover:bg-surface'
            }`}
          >
            كافة الدفعات ({batches.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expiring')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'expiring'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-800 hover:bg-amber-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>قريبة الانتهاء</span>
            {summary && summary.expiringSoonCount > 0 && (
              <span className="font-mono text-[11px] mr-1">({summary.expiringSoonCount})</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'expired'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-800 hover:bg-rose-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>منتهية الصلاحية</span>
            {summary && summary.expiredCount > 0 && (
              <span className="font-mono text-[11px] mr-1">({summary.expiredCount})</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-paid text-white shadow-xs'
                : 'text-ink-muted hover:text-ink hover:bg-surface'
            }`}
          >
            صالحة ومستقرة
          </button>
        </div>

        {/* Right Search & Alert Threshold */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Alert Days Selector */}
          <div className="flex items-center gap-1.5 bg-surface-2 px-2.5 py-1 rounded-xl border border-line">
            <span className="text-xs text-ink-muted font-bold whitespace-nowrap">فترة التنبيه:</span>
            <CustomSelect
              value={String(alertDays)}
              onChange={(val) => setAlertDays(parseInt(val, 10) || 30)}
              options={[
                { value: '7', label: 'خلال 7 أيام' },
                { value: '15', label: 'خلال 15 يوماً' },
                { value: '30', label: 'خلال 30 يوماً (المعتاد)' },
                { value: '60', label: 'خلال 60 يوماً' },
                { value: '90', label: 'خلال 90 يوماً' },
              ]}
              className="w-36"
              size="sm"
            />
          </div>

          {/* Search Box */}
          <div className="relative w-56 h-8 flex items-center bg-surface-2 border border-line rounded-xl px-2.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-all">
            <Search className="w-3.5 h-3.5 text-ink-muted ml-1.5 shrink-0" />
            <input
              type="text"
              placeholder="بحث بالصنف أو رقم الدفعة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
              className="w-full bg-transparent border-none text-xs text-ink placeholder:text-ink-muted focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-ink-muted hover:text-ink text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadData(alertDays)}
            disabled={loading}
            className="h-8 w-8 flex items-center justify-center bg-surface hover:bg-surface-2 border border-line text-ink-muted hover:text-ink rounded-xl transition-colors shadow-2xs cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand' : ''}`} />
          </button>
        </div>
      </div>

      {/* Batches Table */}
      <div className="flex-1 bg-surface border border-line rounded-2xl overflow-hidden flex flex-col shadow-xs">
        <div className="h-10 bg-surface-2 border-b border-line grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted shrink-0">
          <div className="col-span-3">اسم الصنف والباركود</div>
          <div className="col-span-2">رقم الدفعة</div>
          <div className="col-span-2">تاريخ الصلاحية والمهلة</div>
          <div className="col-span-1 text-center">الرصيد المتبقي</div>
          <div className="col-span-1 text-center">سعر التكلفة</div>
          <div className="col-span-1 text-center">إجمالي القيمة</div>
          <div className="col-span-1 text-center">الحالة</div>
          <div className="col-span-1 text-left">إجراءات</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {filteredBatches.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-ink-muted gap-2">
              <Calendar className="w-10 h-10 opacity-30" />
              <span className="text-sm font-semibold">لا توجد دفعات مطابقة للمعايير المحددة</span>
              <span className="text-xs text-ink-muted">
                يتم تسجيل الدفعات وتواريخ الصلاحية تلقائياً عند استلام فواتير الشراء
              </span>
            </div>
          ) : (
            filteredBatches.map((b) => {
              const qtyFormatted = (b.quantityMilli / 1000).toLocaleString('ar-EG', {
                maximumFractionDigits: 3,
              });
              const totalValPiasters = Math.round((b.quantityMilli * b.costPricePiasters) / 1000);

              return (
                <div
                  key={b.id}
                  className={`h-14 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 transition-colors ${
                    b.isExpired ? 'bg-rose-50/40' : b.isExpiringSoon ? 'bg-amber-50/30' : ''
                  }`}
                >
                  {/* Product Info */}
                  <div className="col-span-3 pr-1">
                    <span className="font-bold text-ink block truncate">{b.productName}</span>
                    <span className="text-[11px] font-mono text-ink-muted">
                      كود: {b.productBarcode || '—'}
                    </span>
                  </div>

                  {/* Batch Number */}
                  <div className="col-span-2">
                    <span className="font-mono font-bold text-brand bg-brand-soft/70 px-2 py-0.5 rounded border border-brand/20">
                      {b.batchNumber}
                    </span>
                    {b.productionDate && (
                      <span className="text-[10px] text-ink-muted block mt-0.5">
                        إنتاج: {b.productionDate}
                      </span>
                    )}
                  </div>

                  {/* Expiry Date & Remaining Days */}
                  <div className="col-span-2">
                    <div className="font-mono font-bold text-ink">{b.expiryDate || '—'}</div>
                    {b.isExpired ? (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded mt-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        منتهي الصلاحية
                      </span>
                    ) : b.isExpiringSoon ? (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded mt-0.5">
                        <Clock className="w-3 h-3" />
                        أوشك على الانتهاء
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-paid font-medium">صالح ومستقر</span>
                    )}
                  </div>

                  {/* Current Quantity */}
                  <div className="col-span-1 text-center font-mono font-bold text-ink">
                    {qtyFormatted} {b.unit || 'قطعة'}
                  </div>

                  {/* Unit Cost */}
                  <div className="col-span-1 text-center font-mono font-medium text-ink-muted">
                    {formatArabicCurrency(b.costPricePiasters)}
                  </div>

                  {/* Total Value */}
                  <div className="col-span-1 text-center font-mono font-bold text-ink">
                    {formatArabicCurrency(totalValPiasters)}
                  </div>

                  {/* Status Badge */}
                  <div className="col-span-1 text-center">
                    {b.status === 'EXPIRED' || b.isExpired ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        منتهي
                      </span>
                    ) : b.status === 'DEPLETED' ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                        مستهلك
                      </span>
                    ) : b.isExpiringSoon ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        تنبيه
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft text-paid border border-paid/20">
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
                      className="p-1.5 text-ink-muted hover:text-brand hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
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
                        className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
      </div>

      {/* Adjust Batch Quantity Modal */}
      {adjustingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-line bg-surface-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand" />
                <h3 className="font-bold text-sm text-ink">تسوية رصيد الدفعة يدويّاً</h3>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingBatch(null)}
                className="text-ink-muted hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="p-5 flex flex-col gap-4">
              <div className="bg-surface-2 p-3 rounded-xl border border-line text-xs space-y-1">
                <div className="font-bold text-ink">{adjustingBatch.productName}</div>
                <div className="text-ink-muted font-mono">
                  رقم الدفعة: {adjustingBatch.batchNumber} | تاريخ الانتهاء: {adjustingBatch.expiryDate || 'غير محدد'}
                </div>
                <div className="text-ink-muted">
                  الرصيد المسجل حالياً: {(adjustingBatch.quantityMilli / 1000).toFixed(3)}{' '}
                  {adjustingBatch.unit || 'قطعة'}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  الرصيد الفعلي الجديد بعد التسوية <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={adjustQtyInput}
                  onChange={(e) => setAdjustQtyInput(normalizeArabicNumerals(e.target.value))}
                  placeholder="مثال: 15"
                  className="w-full h-10 px-3 font-mono font-bold text-sm text-ink bg-surface border border-line rounded-xl focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  سبب التسوية الجردية
                </label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="مثال: جرد يدوي / كسر عبوة"
                  className="w-full h-10 px-3 text-xs text-ink bg-surface border border-line rounded-xl focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setAdjustingBatch(null)}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface border border-line rounded-xl text-xs font-bold text-ink cursor-pointer"
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
