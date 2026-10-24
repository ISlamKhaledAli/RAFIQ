import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Calendar, 
  TrendingUp, 
  AlertTriangle, 
  Clock, 
  Building2, 
  Pill, 
  Printer, 
  RefreshCw, 
  ChevronDown, 
  ChevronLeft, 
  DollarSign, 
  BarChart2, 
  Layers 
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { formatArabicCurrency } from '../utils/money';

interface SpecializedPharmacyReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'expiry' | 'stagnant' | 'profitability';
}

interface ExpiryBatchDetail {
  batchId: string;
  productId: string;
  productName: string;
  scientificName: string;
  batchNumber: string;
  expiryDate: string;
  quantityMilli: number;
  costPricePiasters: number;
  totalCostPiasters: number;
  retailPricePiasters: number;
  totalRetailPiasters: number;
  locationCode: string;
  daysRemaining: number;
  status: string;
}

interface ExpiryMonthBucket {
  monthKey: string;
  monthLabel: string;
  batchCount: number;
  productCount: number;
  totalQuantityMilli: number;
  totalCostPiasters: number;
  totalRetailPiasters: number;
  isExpired: boolean;
  isUrgent: boolean;
  batches: ExpiryBatchDetail[];
}

interface ExpiryHeatmapReport {
  generatedAt: string;
  totalBatchesCount: number;
  totalExpiredBatchesCount: number;
  totalExpiringSoonBatchesCount: number;
  totalCapitalAtRiskPiasters: number;
  totalExpiredCapitalPiasters: number;
  totalInventoryCostPiasters: number;
  monthBuckets: ExpiryMonthBucket[];
}

interface StagnantDrugItem {
  productId: string;
  productName: string;
  barcode: string;
  scientificName: string;
  dosageForm: string;
  manufacturerName: string;
  stockQuantityMilli: number;
  mixedStockDisplay: string;
  costPricePiasters: number;
  totalCostPiasters: number;
  sellPricePiasters: number;
  closestExpiryDate: string;
  closestBatchNumber: string;
  locationCode: string;
  lastSaleDate: string;
  daysWithoutSale: number;
}

interface StagnantDrugsReport {
  generatedAt: string;
  thresholdDays: number;
  totalStagnantCount: number;
  totalTiedCapitalPiasters: number;
  items: StagnantDrugItem[];
}

interface ManufacturerProfitItem {
  manufacturerId: string;
  manufacturerName: string;
  country: string;
  productsCount: number;
  invoicesCount: number;
  quantitySoldMilli: number;
  totalSalesPiasters: number;
  totalCostPiasters: number;
  grossProfitPiasters: number;
  profitMarginBps: number;
}

interface IngredientProfitItem {
  ingredientId: string;
  ingredientNameEn: string;
  ingredientNameAr: string;
  productsCount: number;
  invoicesCount: number;
  quantitySoldMilli: number;
  totalSalesPiasters: number;
  totalCostPiasters: number;
  grossProfitPiasters: number;
  profitMarginBps: number;
}

interface ProfitabilityReport {
  generatedAt: string;
  period: string;
  totalSalesPiasters: number;
  totalCostPiasters: number;
  grossProfitPiasters: number;
  overallMarginBps: number;
  manufacturers: ManufacturerProfitItem[];
  activeIngredients: IngredientProfitItem[];
}

export const SpecializedPharmacyReportsModal: React.FC<SpecializedPharmacyReportsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'expiry',
}) => {
  const [activeTab, setActiveTab] = useState<'expiry' | 'stagnant' | 'profitability'>(initialTab);

  // Expiry state
  const [heatmap, setHeatmap] = useState<ExpiryHeatmapReport | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // Stagnant state
  const [stagnantReport, setStagnantReport] = useState<StagnantDrugsReport | null>(null);
  const [stagnantThreshold, setStagnantThreshold] = useState<number>(60);

  // Profitability state
  const [profReport, setProfReport] = useState<ProfitabilityReport | null>(null);
  const [profPeriod, setProfPeriod] = useState<string>('month');
  const [profSubView, setProfSubView] = useState<'manufacturers' | 'ingredients'>('manufacturers');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Fetch Expiry Heatmap
  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await invoke<ExpiryHeatmapReport>('reports:getPharmaExpiryHeatmap', { months: 12 });
      setHeatmap(res || null);
      if (res && res.monthBuckets && res.monthBuckets.length > 0) {
        // Expand first 2 buckets by default
        const initExp: Record<string, boolean> = {};
        for (let i = 0; i < Math.min(2, res.monthBuckets.length); i++) {
          initExp[res.monthBuckets[i].monthKey] = true;
        }
        setExpandedMonths(initExp);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`فشل جلب خريطة الصلاحيات: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch Stagnant Drugs
  const fetchStagnant = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await invoke<StagnantDrugsReport>('reports:getPharmaStagnant', {
        thresholdDays: stagnantThreshold,
        limit: 100,
      });
      setStagnantReport(res || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`فشل جلب تقرير الأدوية الراكدة: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [stagnantThreshold]);

  // 3. Fetch Profitability
  const fetchProfitability = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await invoke<ProfitabilityReport>('reports:getPharmaProfitability', {
        period: profPeriod,
      });
      setProfReport(res || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`فشل جلب تقرير الأرباح: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [profPeriod]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'expiry') fetchHeatmap();
    else if (activeTab === 'stagnant') fetchStagnant();
    else if (activeTab === 'profitability') fetchProfitability();
  }, [isOpen, activeTab, fetchHeatmap, fetchStagnant, fetchProfitability]);

  if (!isOpen) return null;

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-ink dark:text-ink-dark leading-tight">
                  التقارير والتحليلات الصيدلية التخصصية
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-brand font-bold">
                  رقابة مالية وطبية
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5">
                خريطة الصلاحيات برأس المال، تحليل الأدوية الراكدة، وهوامش ربحية الشركات والمواد الفعالة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-3 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-ink-muted" />
              <span>طباعة التقرير</span>
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

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-line dark:border-line-dark bg-surface dark:bg-surface-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('expiry')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'expiry'
                  ? 'border-brand text-brand dark:text-brand-bright'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>خريطة الصلاحيات الشهرية</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stagnant')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'stagnant'
                  ? 'border-brand text-brand dark:text-brand-bright'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>تحليل الأدوية الراكدة</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profitability')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'profitability'
                  ? 'border-brand text-brand dark:text-brand-bright'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>أرباح الشركات والمواد الفعالة</span>
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'expiry') fetchHeatmap();
                else if (activeTab === 'stagnant') fetchStagnant();
                else if (activeTab === 'profitability') fetchProfitability();
              }}
              disabled={loading}
              className="p-1.5 rounded-lg text-ink-muted hover:text-brand hover:bg-surface-2 transition-colors"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-danger/10 border border-danger/20 flex items-center gap-2 text-danger text-xs shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: EXPIRY HEATMAP */}
          {activeTab === 'expiry' && (
            <div className="space-y-6">
              {/* Metric Cards Ribbon */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line">
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                    <span>إجمالي التشغيلات النشطة</span>
                    <Layers className="w-4 h-4 text-brand" />
                  </div>
                  <div className="text-xl font-black font-mono text-ink dark:text-ink-dark">
                    {heatmap?.totalBatchesCount || 0}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-1">تشغيلة مسجلة ومتاحة</div>
                </div>

                <div className="p-4 rounded-xl bg-danger/10 border border-danger/20">
                  <div className="flex items-center justify-between text-xs text-danger mb-1 font-bold">
                    <span>منتهية الصلاحية</span>
                    <AlertTriangle className="w-4 h-4 text-danger" />
                  </div>
                  <div className="text-xl font-black font-mono text-danger">
                    {formatArabicCurrency(heatmap?.totalExpiredCapitalPiasters || 0)}
                  </div>
                  <div className="text-[11px] text-danger/80 mt-1 font-mono">
                    {heatmap?.totalExpiredBatchesCount || 0} تشغيلة منتهية بالكامل
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-warn/10 border border-warn/20">
                  <div className="flex items-center justify-between text-xs text-warn mb-1 font-bold">
                    <span>تنتهي خلال 30 يوماً</span>
                    <Clock className="w-4 h-4 text-warn" />
                  </div>
                  <div className="text-xl font-black font-mono text-warn">
                    {heatmap?.totalExpiringSoonBatchesCount || 0}
                  </div>
                  <div className="text-[11px] text-warn/80 mt-1">تشغيلة حرجة عاجلة للإرجاع أو البيع</div>
                </div>

                <div className="p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line">
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                    <span>رأس المال المهدد</span>
                    <DollarSign className="w-4 h-4 text-paid" />
                  </div>
                  <div className="text-xl font-black font-mono text-brand dark:text-brand-bright">
                    {formatArabicCurrency(heatmap?.totalCapitalAtRiskPiasters || 0)}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-1">إجمالي تكلفة التشغيلات المتبقية</div>
                </div>
              </div>

              {/* Month Buckets Accordion */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                  جدول استحقاق وانتهاء الصلاحيات حسب الشهور
                </h3>

                {heatmap?.monthBuckets.map((bucket) => {
                  const isExpanded = Boolean(expandedMonths[bucket.monthKey]);
                  return (
                    <div
                      key={bucket.monthKey}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        bucket.isExpired
                          ? 'border-danger/40 bg-danger/5'
                          : bucket.isUrgent
                          ? 'border-warn/40 bg-warn/5'
                          : 'border-line bg-surface dark:bg-surface-dark'
                      }`}
                    >
                      {/* Bucket Header */}
                      <button
                        type="button"
                        onClick={() => toggleMonth(bucket.monthKey)}
                        className="w-full px-5 py-3.5 flex items-center justify-between text-right hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${
                            bucket.isExpired
                              ? 'bg-danger text-white'
                              : bucket.isUrgent
                              ? 'bg-warn text-white'
                              : 'bg-brand-soft text-brand'
                          }`}>
                            {bucket.isExpired ? (
                              <AlertTriangle className="w-4 h-4" />
                            ) : (
                              <Calendar className="w-4 h-4" />
                            )}
                          </div>

                          <div>
                            <div className="text-sm font-black text-ink dark:text-ink-dark">
                              {bucket.monthLabel}
                            </div>
                            <div className="text-[11px] text-ink-muted font-mono">
                              {bucket.batchCount} تشغيلة ({bucket.productCount} صنف) - {(bucket.totalQuantityMilli / 1000).toFixed(0)} عبوة
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-left font-mono">
                            <div className="text-xs font-black text-ink dark:text-ink-dark">
                              {formatArabicCurrency(bucket.totalCostPiasters)}
                            </div>
                            <div className="text-[10px] text-ink-muted">
                              سعر البيع: {formatArabicCurrency(bucket.totalRetailPiasters)}
                            </div>
                          </div>

                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-ink-muted" />
                          ) : (
                            <ChevronLeft className="w-4 h-4 text-ink-muted" />
                          )}
                        </div>
                      </button>

                      {/* Batches Table */}
                      {isExpanded && (
                        <div className="px-5 pb-4 overflow-x-auto">
                          <table className="w-full text-right text-xs">
                            <thead>
                              <tr className="border-b border-line/60 text-ink-muted text-[11px]">
                                <th className="py-2 font-bold">اسم الدواء والصنف</th>
                                <th className="py-2 font-bold">رقم التشغيلة</th>
                                <th className="py-2 font-bold">تاريخ الانتهاء</th>
                                <th className="py-2 font-bold">الكمية</th>
                                <th className="py-2 font-bold">سعر التكلفة</th>
                                <th className="py-2 font-bold">إجمالي التكلفة</th>
                                <th className="py-2 font-bold">الموقع</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line/40">
                              {bucket.batches.map((b) => (
                                <tr key={b.batchId} className="hover:bg-surface-2/60">
                                  <td className="py-2 font-bold text-ink dark:text-ink-dark">
                                    {b.productName}
                                    {b.scientificName && (
                                      <span className="block text-[10px] text-ink-muted font-sans">
                                        {b.scientificName}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 font-mono text-brand font-bold">{b.batchNumber}</td>
                                  <td className="py-2 font-mono">{b.expiryDate}</td>
                                  <td className="py-2 font-mono">{(b.quantityMilli / 1000).toFixed(0)}</td>
                                  <td className="py-2 font-mono">{formatArabicCurrency(b.costPricePiasters)}</td>
                                  <td className="py-2 font-mono font-bold">{formatArabicCurrency(b.totalCostPiasters)}</td>
                                  <td className="py-2 font-mono text-ink-muted">{b.locationCode || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: STAGNANT DRUGS */}
          {activeTab === 'stagnant' && (
            <div className="space-y-6">
              {/* Filter & Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-ink">فترة الركود بدون بيع:</span>
                  <div className="w-48">
                    <CustomSelect
                      value={String(stagnantThreshold)}
                      onChange={(val) => setStagnantThreshold(parseInt(val) || 60)}
                      options={[
                        { value: '30', label: 'أكثر من 30 يوماً' },
                        { value: '60', label: 'أكثر من 60 يوماً (شهرين)' },
                        { value: '90', label: 'أكثر من 90 يوماً (3 شهور)' },
                        { value: '180', label: 'أكثر من 180 يوماً (6 شهور)' },
                      ]}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6 font-mono text-xs">
                  <div>
                    <span className="text-ink-muted">الأصناف الراكدة:</span>{' '}
                    <strong className="text-ink dark:text-ink-dark font-bold">
                      {stagnantReport?.totalStagnantCount || 0}
                    </strong>
                  </div>
                  <div>
                    <span className="text-ink-muted">رأس المال المجمد:</span>{' '}
                    <strong className="text-danger font-bold">
                      {formatArabicCurrency(stagnantReport?.totalTiedCapitalPiasters || 0)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-line bg-surface dark:bg-surface-dark">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line text-ink-muted text-[11px]">
                      <th className="p-3 font-bold">اسم الدواء والصنف</th>
                      <th className="p-3 font-bold">الاسم العلمي والشكل</th>
                      <th className="p-3 font-bold">الشركة المصنعة</th>
                      <th className="p-3 font-bold">الرصيد المتاح</th>
                      <th className="p-3 font-bold">رأس المال المجمد</th>
                      <th className="p-3 font-bold">تاريخ آخر بيع</th>
                      <th className="p-3 font-bold">أيام الركود</th>
                      <th className="p-3 font-bold">أقرب صلاحية</th>
                      <th className="p-3 font-bold">الرف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {stagnantReport?.items.map((item) => (
                      <tr key={item.productId} className="hover:bg-surface-2/60">
                        <td className="p-3 font-bold text-ink dark:text-ink-dark">{item.productName}</td>
                        <td className="p-3 text-ink-muted">
                          {item.scientificName || '—'} {item.dosageForm ? `(${item.dosageForm})` : ''}
                        </td>
                        <td className="p-3 text-ink-muted">{item.manufacturerName || '—'}</td>
                        <td className="p-3 font-mono font-bold">{item.mixedStockDisplay}</td>
                        <td className="p-3 font-mono font-bold text-danger">
                          {formatArabicCurrency(item.totalCostPiasters)}
                        </td>
                        <td className="p-3 font-mono text-ink-muted">
                          {item.lastSaleDate ? item.lastSaleDate.split('T')[0] : 'لم يباع قط'}
                        </td>
                        <td className="p-3 font-mono font-bold text-warn">{item.daysWithoutSale} يوم</td>
                        <td className="p-3 font-mono">{item.closestExpiryDate || '—'}</td>
                        <td className="p-3 font-mono text-brand">{item.locationCode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: PROFITABILITY */}
          {activeTab === 'profitability' && (
            <div className="space-y-6">
              {/* Filter Bar & Summary Ribbon */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line">
                <div className="flex items-center gap-3">
                  <div className="w-40">
                    <CustomSelect
                      value={profPeriod}
                      onChange={(val) => setProfPeriod(val)}
                      options={[
                        { value: 'today', label: 'اليوم' },
                        { value: 'yesterday', label: 'أمس' },
                        { value: 'week', label: 'آخر 7 أيام' },
                        { value: 'month', label: 'آخر 30 يوماً' },
                      ]}
                    />
                  </div>

                  <div className="flex rounded-lg border border-line bg-surface p-0.5">
                    <button
                      type="button"
                      onClick={() => setProfSubView('manufacturers')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        profSubView === 'manufacturers'
                          ? 'bg-brand text-white'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      الشركات المصنعة
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfSubView('ingredients')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        profSubView === 'ingredients'
                          ? 'bg-brand text-white'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      المواد الفعالة
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-6 font-mono text-xs">
                  <div>
                    <span className="text-ink-muted">المبيعات:</span>{' '}
                    <strong className="text-ink dark:text-ink-dark font-bold">
                      {formatArabicCurrency(profReport?.totalSalesPiasters || 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-ink-muted">التكلفة:</span>{' '}
                    <strong className="text-ink dark:text-ink-dark font-bold">
                      {formatArabicCurrency(profReport?.totalCostPiasters || 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-ink-muted">صافي الربح:</span>{' '}
                    <strong className="text-paid font-bold">
                      {formatArabicCurrency(profReport?.grossProfitPiasters || 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-ink-muted">الهامش:</span>{' '}
                    <strong className="text-brand font-bold">
                      {((profReport?.overallMarginBps || 0) / 100).toFixed(1)}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl border border-line bg-surface dark:bg-surface-dark">
                {profSubView === 'manufacturers' ? (
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line text-ink-muted text-[11px]">
                        <th className="p-3 font-bold">الشركة المصنعة</th>
                        <th className="p-3 font-bold">بلد المنشأ</th>
                        <th className="p-3 font-bold">عدد الأصناف</th>
                        <th className="p-3 font-bold">الفواتير</th>
                        <th className="p-3 font-bold">المبيعات</th>
                        <th className="p-3 font-bold">التكلفة</th>
                        <th className="p-3 font-bold">مجمل الربح</th>
                        <th className="p-3 font-bold">هامش الربح %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {profReport?.manufacturers.map((m) => (
                        <tr key={m.manufacturerId} className="hover:bg-surface-2/60">
                          <td className="p-3 font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-brand" />
                            <span>{m.manufacturerName}</span>
                          </td>
                          <td className="p-3 text-ink-muted">{m.country}</td>
                          <td className="p-3 font-mono">{m.productsCount}</td>
                          <td className="p-3 font-mono">{m.invoicesCount}</td>
                          <td className="p-3 font-mono font-bold">{formatArabicCurrency(m.totalSalesPiasters)}</td>
                          <td className="p-3 font-mono text-ink-muted">{formatArabicCurrency(m.totalCostPiasters)}</td>
                          <td className="p-3 font-mono font-bold text-paid">{formatArabicCurrency(m.grossProfitPiasters)}</td>
                          <td className="p-3 font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                              m.profitMarginBps >= 2000
                                ? 'bg-paid-soft text-paid'
                                : m.profitMarginBps >= 1000
                                ? 'bg-brand-soft text-brand'
                                : 'bg-warn/10 text-warn'
                            }`}>
                              {(m.profitMarginBps / 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line text-ink-muted text-[11px]">
                        <th className="p-3 font-bold">المادة الفعالة</th>
                        <th className="p-3 font-bold">الاسم الإنجليزي</th>
                        <th className="p-3 font-bold">عدد الأصناف</th>
                        <th className="p-3 font-bold">الفواتير</th>
                        <th className="p-3 font-bold">المبيعات</th>
                        <th className="p-3 font-bold">التكلفة</th>
                        <th className="p-3 font-bold">مجمل الربح</th>
                        <th className="p-3 font-bold">هامش الربح %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {profReport?.activeIngredients.map((ing) => (
                        <tr key={ing.ingredientId} className="hover:bg-surface-2/60">
                          <td className="p-3 font-bold text-ink dark:text-ink-dark flex items-center gap-2">
                            <Pill className="w-3.5 h-3.5 text-brand" />
                            <span>{ing.ingredientNameAr}</span>
                          </td>
                          <td className="p-3 font-sans text-ink-muted">{ing.ingredientNameEn}</td>
                          <td className="p-3 font-mono">{ing.productsCount}</td>
                          <td className="p-3 font-mono">{ing.invoicesCount}</td>
                          <td className="p-3 font-mono font-bold">{formatArabicCurrency(ing.totalSalesPiasters)}</td>
                          <td className="p-3 font-mono text-ink-muted">{formatArabicCurrency(ing.totalCostPiasters)}</td>
                          <td className="p-3 font-mono font-bold text-paid">{formatArabicCurrency(ing.grossProfitPiasters)}</td>
                          <td className="p-3 font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                              ing.profitMarginBps >= 2000
                                ? 'bg-paid-soft text-paid'
                                : ing.profitMarginBps >= 1000
                                ? 'bg-brand-soft text-brand'
                                : 'bg-warn/10 text-warn'
                            }`}>
                              {(ing.profitMarginBps / 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
