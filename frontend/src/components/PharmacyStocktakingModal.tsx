import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  X, 
  Layers, 
  Search, 
  Check, 
  AlertCircle, 
  Printer, 
  RefreshCw, 
  Scale, 
  Save, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Minus 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { CustomSelect } from './CustomSelect';
import { formatArabicCurrency } from '../utils/money';

interface PharmacyStocktakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onStocktakingCompleted?: () => void;
}

interface UnitDef {
  unitId: string;
  unitName: string;
  conversionFactor: number;
  isBaseUnit: boolean;
}

interface BatchItem {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  bookQuantityMilli: number;
  actualQuantityMilli?: number | null;
  unitCostPiasters: number;
  status: string;
}

interface StocktakingItem {
  productId: string;
  productName: string;
  barcode: string;
  scientificName: string;
  dosageForm: string;
  manufacturerName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  costPricePiasters: number;
  sellPricePiasters: number;
  bookQuantityMilli: number;
  units: UnitDef[];
  batches: BatchItem[];
}

interface StocktakingSheetResponse {
  generatedAt: string;
  locationId?: string;
  locationName?: string;
  manufacturerId?: string;
  manufacturerName?: string;
  totalItemsCount: number;
  totalBookCostPiasters: number;
  items: StocktakingItem[];
}

interface StorageLocationOption {
  id: string;
  name: string;
  code: string;
  type: string;
}

interface ManufacturerOption {
  id: string;
  nameAr: string;
}

export const PharmacyStocktakingModal: React.FC<PharmacyStocktakingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onStocktakingCompleted,
}) => {
  const [locations, setLocations] = useState<StorageLocationOption[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<StocktakingSheetResponse | null>(null);

  // Map of actual counts in milli: key is either batchId or productId
  const [actualCountsMilli, setActualCountsMilli] = useState<Record<string, number>>({});
  // Map of compound units input strings: key = `${id}_${unitId}`
  const [compoundInputs, setCompoundInputs] = useState<Record<string, string>>({});

  const [auditReason, setAuditReason] = useState('جرد صيدلي دوري ومطابقة الرفوف');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Load initial filter options
  useEffect(() => {
    if (!isOpen) return;

    const loadFilters = async () => {
      try {
        const [locsRes, mfgsRes] = await Promise.all([
          invoke<StorageLocationOption[]>('locations:list').catch(() => []),
          invoke<ManufacturerOption[]>('pharma:getManufacturers').catch(() => []),
        ]);
        setLocations(locsRes || []);
        setManufacturers(mfgsRes || []);
      } catch (err) {
        console.error('فشل تحميل تصنيفات ومواقع الجرد:', err);
      }
    };

    loadFilters();
  }, [isOpen]);

  // 2. Fetch stocktaking sheet
  const fetchSheet = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await invoke<StocktakingSheetResponse>('pharma:getStocktakingSheet', {
        locationId: selectedLocation !== 'all' ? selectedLocation : null,
        manufacturerId: selectedManufacturer !== 'all' ? selectedManufacturer : null,
        query: searchQuery.trim() || null,
        limit: 150,
      });

      setSheet(res || null);

      // Prepopulate actual counts with book counts
      const initialCounts: Record<string, number> = {};
      const initialCompound: Record<string, string> = {};

      if (res && res.items) {
        for (let i = 0; i < res.items.length; i++) {
          const item = res.items[i];
          if (item.batches && item.batches.length > 0) {
            for (let b = 0; b < item.batches.length; b++) {
              const batch = item.batches[b];
              initialCounts[batch.batchId] = batch.bookQuantityMilli;
            }
          } else {
            initialCounts[item.productId] = item.bookQuantityMilli;
          }
        }
      }

      setActualCountsMilli(initialCounts);
      setCompoundInputs(initialCompound);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`فشل جلب كشف الجرد: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedManufacturer, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      fetchSheet();
    }
  }, [isOpen, fetchSheet]);

  useDataSubscription(['products', 'all'], () => {
    if (isOpen) {
      void fetchSheet();
    }
  });

  // Update compound input and calculate actual quantity in milli
  const handleCompoundUnitChange = (
    targetKey: string, // productId or batchId
    unitId: string,
    value: string,
    units: UnitDef[]
  ) => {
    const inputKey = `${targetKey}_${unitId}`;
    const nextInputs = { ...compoundInputs, [inputKey]: value };
    setCompoundInputs(nextInputs);

    // Compute total milli across all units for this target
    let totalMilli = 0;
    for (let u = 0; u < units.length; u++) {
      const unit = units[u];
      const valStr = nextInputs[`${targetKey}_${unit.unitId}`] || '0';
      const parsed = parseFloat(valStr) || 0;
      if (parsed > 0) {
        totalMilli += Math.round(parsed * unit.conversionFactor * 1000);
      }
    }

    setActualCountsMilli((prev) => ({
      ...prev,
      [targetKey]: totalMilli,
    }));
  };

  // Direct actual input change for single batch/product
  const handleDirectMilliChange = (targetKey: string, unitsCount: number) => {
    const milli = Math.max(0, Math.round(unitsCount * 1000));
    setActualCountsMilli((prev) => ({
      ...prev,
      [targetKey]: milli,
    }));
  };

  // Summary statistics
  const stats = useMemo(() => {
    if (!sheet || !sheet.items) {
      return { totalBookCost: 0, totalCountedCost: 0, varianceCost: 0, diffCount: 0, matchingCount: 0 };
    }

    let totalBook = 0;
    let totalCounted = 0;
    let diffs = 0;
    let matches = 0;

    for (let i = 0; i < sheet.items.length; i++) {
      const item = sheet.items[i];
      if (item.batches && item.batches.length > 0) {
        for (let b = 0; b < item.batches.length; b++) {
          const batch = item.batches[b];
          const counted = actualCountsMilli[batch.batchId] !== undefined ? actualCountsMilli[batch.batchId] : batch.bookQuantityMilli;
          totalBook += Math.round((batch.bookQuantityMilli * batch.unitCostPiasters) / 1000);
          totalCounted += Math.round((counted * batch.unitCostPiasters) / 1000);
          if (counted === batch.bookQuantityMilli) matches++;
          else diffs++;
        }
      } else {
        const counted = actualCountsMilli[item.productId] !== undefined ? actualCountsMilli[item.productId] : item.bookQuantityMilli;
        totalBook += Math.round((item.bookQuantityMilli * item.costPricePiasters) / 1000);
        totalCounted += Math.round((counted * item.costPricePiasters) / 1000);
        if (counted === item.bookQuantityMilli) matches++;
        else diffs++;
      }
    }

    return {
      totalBookCost: totalBook,
      totalCountedCost: totalCounted,
      varianceCost: totalCounted - totalBook,
      diffCount: diffs,
      matchingCount: matches,
    };
  }, [sheet, actualCountsMilli]);

  // Submit adjustments
  const handleApplyAdjustments = async () => {
    if (!sheet || !sheet.items) return;

    const adjustmentsList: Array<{ productId: string; batchId?: string; countedQuantityMilli: number; reason: string }> = [];

    for (let i = 0; i < sheet.items.length; i++) {
      const item = sheet.items[i];
      if (item.batches && item.batches.length > 0) {
        for (let b = 0; b < item.batches.length; b++) {
          const batch = item.batches[b];
          const counted = actualCountsMilli[batch.batchId] !== undefined ? actualCountsMilli[batch.batchId] : batch.bookQuantityMilli;
          if (counted !== batch.bookQuantityMilli) {
            adjustmentsList.push({
              productId: item.productId,
              batchId: batch.batchId,
              countedQuantityMilli: counted,
              reason: auditReason || 'تسوية جرد صيدلي للتشغيلة',
            });
          }
        }
      } else {
        const counted = actualCountsMilli[item.productId] !== undefined ? actualCountsMilli[item.productId] : item.bookQuantityMilli;
        if (counted !== item.bookQuantityMilli) {
          adjustmentsList.push({
            productId: item.productId,
            countedQuantityMilli: counted,
            reason: auditReason || 'تسوية جرد صيدلي للصنف',
          });
        }
      }
    }

    if (adjustmentsList.length === 0) {
      setErrorMsg('كافة الأصناف والتشغيلات مطابقة للرصيد الدفتري، لا توجد فروقات للتسوية.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await invoke<{ success: boolean; adjustedCount: number }>('pharma:applyStocktaking', {
        auditReason: auditReason.trim(),
        locationId: selectedLocation !== 'all' ? selectedLocation : null,
        items: adjustmentsList,
      });

      if (res && res.success) {
        setSuccessMsg(`تم بنجاح اعتماد قيود التسوية الجردية لـ (${res.adjustedCount}) صنف وتشغيلة.`);
        if (onSuccess) onSuccess();
        if (onStocktakingCompleted) onStocktakingCompleted();
        setTimeout(() => {
          fetchSheet();
        }, 1200);
      } else {
        setErrorMsg('تعذر اعتماد التسوية الجردية.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`خطأ أثناء اعتماد التسوية: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div 
        className="w-full max-w-6xl bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark flex flex-col h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-ink dark:text-ink-dark leading-tight">
                  شاشة الجرد الصيدلي المتقدم والتسويات المخزنية
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-brand font-bold">
                  على مستوى الرف والتشغيلة
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5">
                إدخال الكميات بالوحدات المركبة (علب + شرائط + أقراص) مع معالجة وتثبيت الفروقات بقيود تسوية ذرية دقيقة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-3 transition-colors"
              title="طباعة كشف الجرد الورقي"
            >
              <Printer className="w-3.5 h-3.5 text-ink-muted" />
              <span>طباعة الكشف</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-ink-muted hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark rounded-lg hover:bg-surface-3 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="p-4 border-b border-line dark:border-line-dark bg-surface dark:bg-surface-dark grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
          {/* Location Filter */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">
              الموقع / الرف / الدرج
            </label>
            <CustomSelect
              value={selectedLocation}
              onChange={(val) => setSelectedLocation(val)}
              options={[
                { value: 'all', label: 'كافة المواقع والرفوف' },
                ...locations.map((loc) => ({
                  value: loc.id,
                  label: `${loc.code} - ${loc.name}`,
                })),
              ]}
            />
          </div>

          {/* Manufacturer Filter */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">
              الشركة المصنعة
            </label>
            <CustomSelect
              value={selectedManufacturer}
              onChange={(val) => setSelectedManufacturer(val)}
              options={[
                { value: 'all', label: 'كافة الشركات المصنعة' },
                ...manufacturers.map((mfg) => ({
                  value: mfg.id,
                  label: mfg.nameAr,
                })),
              ]}
            />
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">
              بحث بالاسم التجاري أو العلمي
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="اسم الدواء / الباركود..."
                className="w-full pr-8 pl-3 py-1.5 text-xs rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark focus:border-brand focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Summary Metric Ribbon */}
        <div className="px-6 py-2.5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-ink-muted">إجمالي الأصناف:</span>{' '}
              <strong className="text-ink dark:text-ink-dark font-mono font-bold">
                {sheet?.totalItemsCount || 0}
              </strong>
            </div>

            <div>
              <span className="text-ink-muted">تكلفة الرصيد الدفتري:</span>{' '}
              <strong className="text-ink dark:text-ink-dark font-mono font-bold">
                {formatArabicCurrency(stats.totalBookCost)}
              </strong>
            </div>

            <div>
              <span className="text-ink-muted">تكلفة الرصيد الفعلي:</span>{' '}
              <strong className="text-brand dark:text-brand-bright font-mono font-bold">
                {formatArabicCurrency(stats.totalCountedCost)}
              </strong>
            </div>

            <div>
              <span className="text-ink-muted">فرق الجرد المالي:</span>{' '}
              <strong className={`font-mono font-bold ${stats.varianceCost < 0 ? 'text-danger' : stats.varianceCost > 0 ? 'text-paid' : 'text-ink-muted'}`}>
                {stats.varianceCost > 0 ? '+' : ''}{formatArabicCurrency(stats.varianceCost)}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-paid-soft text-paid font-bold">
              مطابق: {stats.matchingCount}
            </span>
            {stats.diffCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-danger/10 text-danger font-bold">
                فروقات بحاجة لتسوية: {stats.diffCount}
              </span>
            )}
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-danger/10 border border-danger/20 flex items-center gap-2 text-danger text-xs shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-paid-soft border border-paid/20 flex items-center gap-2 text-paid text-xs shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-ink-muted">
              <RefreshCw className="w-8 h-8 animate-spin text-brand mb-2" />
              <span className="text-xs">جارٍ تجميع بيانات الرفوف والتشغيلات...</span>
            </div>
          ) : !sheet || sheet.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-ink-muted border border-dashed border-line rounded-xl">
              <Layers className="w-8 h-8 text-ink-muted mb-2 opacity-50" />
              <span className="text-xs font-bold">لا توجد أصناف تطابق محددات البحث المختارة</span>
            </div>
          ) : (
            <div className="space-y-4">
              {sheet.items.map((item) => {
                const hasBatches = item.batches && item.batches.length > 0;
                const units = item.units || [];

                return (
                  <div
                    key={item.productId}
                    className="p-4 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-xs"
                  >
                    {/* Item Title & Location Info */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line/60">
                      <div className="flex items-center gap-2">
                        {item.locationCode && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-brand-soft text-brand font-mono font-bold">
                            رف: {item.locationCode}
                          </span>
                        )}
                        <h4 className="text-sm font-black text-ink dark:text-ink-dark">
                          {item.productName}
                        </h4>
                        {item.scientificName && (
                          <span className="text-xs text-ink-muted font-sans">
                            ({item.scientificName})
                          </span>
                        )}
                        {item.dosageForm && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-surface-2 text-ink-muted">
                            {item.dosageForm}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono">
                        <div>
                          <span className="text-ink-muted text-[11px]">الرصيد الدفتري:</span>{' '}
                          <strong className="text-ink dark:text-ink-dark">
                            {(item.bookQuantityMilli / 1000).toFixed(0)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-ink-muted text-[11px]">التكلفة:</span>{' '}
                          <strong className="text-ink dark:text-ink-dark">
                            {formatArabicCurrency(item.costPricePiasters)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Packaging Units Indicators */}
                    {units.length > 1 && (
                      <div className="py-2 flex items-center gap-2 text-[11px] text-ink-muted">
                        <span className="font-bold text-ink">مستويات التعبئة:</span>
                        {units.map((u, ui) => (
                          <span key={u.unitId} className="px-2 py-0.5 rounded bg-surface-2 border border-line/60 font-mono">
                            {u.unitName} = {u.conversionFactor} {ui < units.length - 1 ? '←' : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Batches Table or Single Product Input */}
                    {hasBatches ? (
                      <div className="mt-2 space-y-2">
                        {item.batches.map((batch) => {
                          const countedMilli = actualCountsMilli[batch.batchId] !== undefined ? actualCountsMilli[batch.batchId] : batch.bookQuantityMilli;
                          const deltaMilli = countedMilli - batch.bookQuantityMilli;
                          const deltaUnits = deltaMilli / 1000;

                          return (
                            <div
                              key={batch.batchId}
                              className="p-3 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line/80 flex flex-wrap items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-4">
                                <span className="font-mono font-bold text-brand">
                                  تشغيلة: {batch.batchNumber}
                                </span>
                                <span className="font-mono text-ink-muted">
                                  صلاحية: {batch.expiryDate}
                                </span>
                                <span className="font-mono">
                                  دفتري: <strong>{(batch.bookQuantityMilli / 1000).toFixed(0)}</strong>
                                </span>
                              </div>

                              {/* Compound Entry or Direct Units */}
                              <div className="flex items-center gap-3">
                                {units.length > 1 ? (
                                  <div className="flex items-center gap-1.5">
                                    {units.map((u) => (
                                      <div key={u.unitId} className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          placeholder="0"
                                          value={compoundInputs[`${batch.batchId}_${u.unitId}`] || ''}
                                          onChange={(e) => handleCompoundUnitChange(batch.batchId, u.unitId, e.target.value, units)}
                                          className="w-14 px-2 py-1 text-center font-mono font-bold rounded border border-line bg-surface text-ink text-xs focus:border-brand focus:outline-hidden"
                                        />
                                        <span className="text-[10px] text-ink-muted">{u.unitName}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-ink-muted text-[11px]">الفعلي:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={countedMilli / 1000}
                                      onChange={(e) => handleDirectMilliChange(batch.batchId, parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1 text-center font-mono font-bold rounded border border-line bg-surface text-ink text-xs focus:border-brand focus:outline-hidden"
                                    />
                                  </div>
                                )}

                                {/* Delta badge */}
                                <div className="min-w-[90px] text-left">
                                  {deltaMilli === 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-paid-soft text-paid font-bold">
                                      <Minus className="w-3 h-3" /> مطابق
                                    </span>
                                  ) : deltaMilli < 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-danger/10 text-danger font-bold">
                                      <ArrowDownLeft className="w-3 h-3" /> عجز {deltaUnits}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-brand font-bold">
                                      <ArrowUpRight className="w-3 h-3" /> زيادة +{deltaUnits}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Single item compound inputs
                      <div className="mt-2 flex items-center justify-between p-3 rounded-lg bg-surface-2 dark:bg-surface-dark-2">
                        <span className="text-xs text-ink-muted">إدخال الكمية الفعلية للصنف:</span>
                        <div className="flex items-center gap-3">
                          {units.length > 1 ? (
                            <div className="flex items-center gap-1.5">
                              {units.map((u) => (
                                <div key={u.unitId} className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder="0"
                                    value={compoundInputs[`${item.productId}_${u.unitId}`] || ''}
                                    onChange={(e) => handleCompoundUnitChange(item.productId, u.unitId, e.target.value, units)}
                                    className="w-14 px-2 py-1 text-center font-mono font-bold rounded border border-line bg-surface text-ink text-xs focus:border-brand focus:outline-hidden"
                                  />
                                  <span className="text-[10px] text-ink-muted">{u.unitName}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                value={(actualCountsMilli[item.productId] ?? item.bookQuantityMilli) / 1000}
                                onChange={(e) => handleDirectMilliChange(item.productId, parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 text-center font-mono font-bold rounded border border-line bg-surface text-ink text-xs focus:border-brand focus:outline-hidden"
                              />
                            </div>
                          )}

                          {/* Delta */}
                          {(() => {
                            const cMilli = actualCountsMilli[item.productId] !== undefined ? actualCountsMilli[item.productId] : item.bookQuantityMilli;
                            const dMilli = cMilli - item.bookQuantityMilli;
                            const dUnits = dMilli / 1000;
                            return (
                              <div className="min-w-[90px] text-left">
                                {dMilli === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-paid-soft text-paid font-bold">
                                    <Minus className="w-3 h-3" /> مطابق
                                  </span>
                                ) : dMilli < 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-danger/10 text-danger font-bold">
                                    <ArrowDownLeft className="w-3 h-3" /> عجز {dUnits}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-brand font-bold">
                                    <ArrowUpRight className="w-3 h-3" /> زيادة +{dUnits}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              value={auditReason}
              onChange={(e) => setAuditReason(e.target.value)}
              placeholder="سبب اعتماد التسوية الجردية (مثال: جرد دوري معتمد)..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface text-ink focus:border-brand focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-ink-muted hover:text-ink rounded-lg hover:bg-surface-3 transition-colors"
            >
              إلغاء وتراجع
            </button>

            <button
              type="button"
              onClick={handleApplyAdjustments}
              disabled={submitting || stats.diffCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg bg-paid hover:bg-paid/90 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'جارٍ اعتماد القيود...' : `اعتماد تسوية الجرد (${stats.diffCount} فروقات)`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
