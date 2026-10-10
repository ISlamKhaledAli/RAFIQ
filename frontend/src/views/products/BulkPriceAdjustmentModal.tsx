import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  Percent,
  Coins,
  FileSpreadsheet,
  AlertTriangle,
  Check,
  X,
  Search,
  RefreshCw,
  Sliders,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { CustomSelect } from '../../components/CustomSelect';
import type {
  Category,
  BulkPricePreviewResult,
  BulkPriceApplyRequest,
  BulkPriceApplyResult,
  BulkPriceExcelItem,
} from '../../types/models';

export interface BulkPriceAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  selectedProductIds: string[];
  onSuccess: (message: string) => void;
}

export const BulkPriceAdjustmentModal: React.FC<BulkPriceAdjustmentModalProps> = ({
  isOpen,
  onClose,
  categories,
  selectedProductIds,
  onSuccess,
}) => {
  // Scope & Filter Configuration
  const [scope, setScope] = useState<'selected' | 'category' | 'all'>(
    selectedProductIds.length > 0 ? 'selected' : 'all'
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('cat_general');

  // Adjustment Parameters
  const [targetField, setTargetField] = useState<'price' | 'cost' | 'both'>('price');
  const [method, setMethod] = useState<'percentage' | 'fixed_amount' | 'excel'>('percentage');
  const [percentageValue, setPercentageValue] = useState<string>('10');
  const [amountValue, setAmountValue] = useState<string>('2.00');
  const [roundingRule, setRoundingRule] = useState<
    'none' | 'half_pound' | 'one_pound' | 'five_pounds' | 'ceil_pound' | 'psychological_95' | 'psychological_50'
  >('one_pound');
  const [reason, setReason] = useState<string>('تحديث أسعار دوري');

  // Excel Upload State
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelItems, setExcelItems] = useState<BulkPriceExcelItem[]>([]);

  // Preview State
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BulkPricePreviewResult | null>(null);
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, boolean>>({});
  const [confirmBelowCostWarning, setConfirmBelowCostWarning] = useState<boolean>(false);

  // Execution State
  const [applying, setApplying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset or initialize on open without cascading effect renders
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setScope(selectedProductIds.length > 0 ? 'selected' : 'all');
      setErrorMsg(null);
      setConfirmBelowCostWarning(false);
    }
  }

  // Handle Excel / CSV File Drop or Select
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          setErrorMsg('الملف لا يحتوي على بيانات كافية (الحد الأدنى سطر عناوين وسطر بيانات)');
          return;
        }

        // Simple CSV parser: first column barcode/id, second column new price, third column (optional) new cost
        const parsedItems: BulkPriceExcelItem[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length >= 2 && cols[0]) {
            const iden = cols[0];
            const pVal = parseFloat(normalizeArabicNumerals(cols[1]));
            const cVal = cols.length >= 3 ? parseFloat(normalizeArabicNumerals(cols[2])) : NaN;

            parsedItems.push({
              identifier: iden,
              newPricePiasters: !isNaN(pVal) ? Math.round(pVal * 100) : null,
              newCostPiasters: !isNaN(cVal) ? Math.round(cVal * 100) : null,
            });
          }
        }

        setExcelItems(parsedItems);
        setErrorMsg(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(`فشل قراءة الملف: ${msg}`);
      }
    };

    reader.readAsText(file);
  };

  // Generate Preview
  const handleGeneratePreview = useCallback(async () => {
    setErrorMsg(null);
    setPreviewLoading(true);

    try {
      const parsedPercent = parseFloat(normalizeArabicNumerals(percentageValue)) || 0;
      const parsedAmount = parseFloat(normalizeArabicNumerals(amountValue)) || 0;
      const amountPiasters = Math.round(parsedAmount * 100);

      const payload = {
        scope,
        productIds: scope === 'selected' ? selectedProductIds : [],
        categoryId: scope === 'category' ? selectedCategoryId : undefined,
        targetField,
        method,
        percentageValue: parsedPercent,
        amountPiasters,
        roundingRule,
        reason,
        excelItems: method === 'excel' ? excelItems : [],
      };

      const result = await invoke<BulkPricePreviewResult>('products:previewBulkPriceAdjustment', payload);
      setPreviewResult(result);

      // Select all items in preview by default
      const initialMap: Record<string, boolean> = {};
      result.items.forEach(it => {
        initialMap[it.productId] = true;
      });
      setSelectedItemsMap(initialMap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`تعذر توليد المعاينة: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    scope,
    selectedProductIds,
    selectedCategoryId,
    targetField,
    method,
    percentageValue,
    amountValue,
    roundingRule,
    reason,
    excelItems,
  ]);

  // Trigger preview on initial modal load and when major options change
  useEffect(() => {
    if (isOpen) {
      void handleGeneratePreview();
    }
  }, [isOpen, handleGeneratePreview]);

  // Filtered Preview Items
  const filteredPreviewItems = useMemo(() => {
    if (!previewResult) return [];
    if (!previewSearch.trim()) return previewResult.items;

    const query = previewSearch.trim().toLowerCase();
    return previewResult.items.filter(it => 
      it.productName.toLowerCase().includes(query) ||
      (it.barcode && it.barcode.toLowerCase().includes(query)) ||
      (it.categoryName && it.categoryName.toLowerCase().includes(query))
    );
  }, [previewResult, previewSearch]);

  // Selected Count & Below Cost Alerts in current selection
  const activeSelectedCount = useMemo(() => {
    return Object.values(selectedItemsMap).filter(Boolean).length;
  }, [selectedItemsMap]);

  const activeBelowCostCount = useMemo(() => {
    if (!previewResult) return 0;
    return previewResult.items.filter(it => selectedItemsMap[it.productId] && it.belowCost).length;
  }, [previewResult, selectedItemsMap]);

  const toggleSelectAll = (checked: boolean) => {
    const updated: Record<string, boolean> = {};
    if (previewResult) {
      previewResult.items.forEach(it => {
        updated[it.productId] = checked;
      });
    }
    setSelectedItemsMap(updated);
  };

  const toggleItem = (productId: string) => {
    setSelectedItemsMap(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  // Apply Changes
  const handleApplyChanges = async () => {
    if (!previewResult || activeSelectedCount === 0) {
      setErrorMsg('يرجى تحديد صنف واحد على الأقل لتطبيق التعديل');
      return;
    }

    if (activeBelowCostCount > 0 && !confirmBelowCostWarning) {
      setConfirmBelowCostWarning(true);
      return;
    }

    setApplying(true);
    setErrorMsg(null);

    try {
      const itemsToApply = previewResult.items
        .filter(it => selectedItemsMap[it.productId])
        .map(it => ({
          productId: it.productId,
          newPricePiasters: it.newPricePiasters,
          newCostPiasters: it.newCostPiasters,
          oldPricePiasters: it.currentPricePiasters,
          oldCostPiasters: it.currentCostPiasters,
        }));

      const req: BulkPriceApplyRequest = {
        items: itemsToApply,
        reason: reason.trim() || 'تعديل أسعار جماعي',
        userId: 'usr_admin_default',
      };

      const result = await invoke<BulkPriceApplyResult>('products:applyBulkPriceAdjustment', req);
      if (result.success) {
        onSuccess(result.message || `تم تحديث أسعار ${result.updatedCount} صنف بنجاح`);
        onClose();
      } else {
        setErrorMsg(result.message || 'حدث خطأ أثناء تطبيق الأسعار');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`فشل تطبيق التعديل: ${msg}`);
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-ink/60 backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[92vh] max-h-[820px] bg-surface rounded-2xl border border-line shadow-2xl flex flex-col overflow-hidden">
        
        {/* 1. Header */}
        <div className="h-14 px-5 bg-brand-dark text-white flex items-center justify-between border-b border-brand shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-paid/20 text-paid flex items-center justify-center border border-paid/30">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">تعديل أسعار وتكلفة البضاعة بالجملة</h2>
              <p className="text-[11px] text-emerald-100/70">تغيير أسعار البيع والتكلفة بنسبة مئوية أو بمبلغ ثابت أو من شيت إكسل دفعة واحدة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Top Control Panel (Form Inputs) */}
        <div className="p-4 bg-surface border-b border-line grid grid-cols-1 md:grid-cols-4 gap-3.5 shrink-0 text-xs">
          
          {/* Scope Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="font-bold text-ink flex items-center gap-1.5">
              <span>البضاعة المستهدفة للتعديل</span>
              {selectedProductIds.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-paid-soft text-paid font-bold">
                  {selectedProductIds.length} محدد
                </span>
              )}
            </label>
            <CustomSelect
              value={scope}
              onChange={(val) => setScope(val as 'selected' | 'category' | 'all')}
              options={[
                ...(selectedProductIds.length > 0
                  ? [{ value: 'selected', label: `الأصناف المحددة في الجدول (${selectedProductIds.length})` }]
                  : []),
                { value: 'all', label: 'كل بضاعة وأصناف المحل' },
                { value: 'category', label: 'أصناف قسم معين في المحل' },
              ]}
              size="sm"
            />
            {scope === 'category' && (
              <div className="mt-1">
                <CustomSelect
                  value={selectedCategoryId}
                  onChange={(val) => setSelectedCategoryId(val)}
                  options={categories.map(c => ({ value: c.id, label: c.name }))}
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* Target Field & Method */}
          <div className="flex flex-col gap-1.5">
            <label className="font-bold text-ink">عاوز تعدل إيه؟</label>
            <CustomSelect
              value={targetField}
              onChange={(val) => setTargetField(val as 'price' | 'cost' | 'both')}
              options={[
                { value: 'price', label: 'سعر البيع للزبون فقط' },
                { value: 'cost', label: 'سعر الشراء (التكلفة) فقط' },
                { value: 'both', label: 'سعر البيع والتكلفة مع بعض' },
              ]}
              size="sm"
            />
            <div className="mt-1 flex gap-1">
              <button
                type="button"
                onClick={() => setMethod('percentage')}
                className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                  method === 'percentage'
                    ? 'bg-brand text-white border-brand shadow-2xs'
                    : 'bg-surface-2 text-ink-muted border-line hover:text-ink'
                }`}
              >
                <Percent className="w-3 h-3" />
                <span>نسبة %</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('fixed_amount')}
                className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                  method === 'fixed_amount'
                    ? 'bg-brand text-white border-brand shadow-2xs'
                    : 'bg-surface-2 text-ink-muted border-line hover:text-ink'
                }`}
              >
                <Coins className="w-3 h-3" />
                <span>مبلغ ثابت</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('excel')}
                className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                  method === 'excel'
                    ? 'bg-brand text-white border-brand shadow-2xs'
                    : 'bg-surface-2 text-ink-muted border-line hover:text-ink'
                }`}
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>شيت إكسل</span>
              </button>
            </div>
          </div>

          {/* Value Input */}
          <div className="flex flex-col gap-1.5">
            {method === 'percentage' && (
              <>
                <label className="font-bold text-ink">نسبة التغيير (+ زيادة، - تخفيض)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={percentageValue}
                    onChange={(e) => setPercentageValue(normalizeArabicNumerals(e.target.value))}
                    placeholder="مثلاً 10 أو -5"
                    className="w-full h-8 px-3 rounded-xl border border-line bg-surface font-mono font-bold text-ink focus:border-brand focus:outline-none"
                  />
                  <span className="absolute left-2.5 text-ink-muted font-bold text-xs pointer-events-none">%</span>
                </div>
              </>
            )}

            {method === 'fixed_amount' && (
              <>
                <label className="font-bold text-ink">المبلغ بالجنيه (+ زيادة، - تخفيض)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={amountValue}
                    onChange={(e) => setAmountValue(normalizeArabicNumerals(e.target.value))}
                    placeholder="مثلاً 2.50 أو -1.00"
                    className="w-full h-8 px-3 rounded-xl border border-line bg-surface font-mono font-bold text-ink focus:border-brand focus:outline-none"
                  />
                  <span className="absolute left-2.5 text-ink-muted font-bold text-xs pointer-events-none">ج.م</span>
                </div>
              </>
            )}

            {method === 'excel' && (
              <>
                <label className="font-bold text-ink">ملف إكسل أو CSV للأسعار</label>
                <div className="flex items-center gap-2">
                  <label className="h-8 px-3 rounded-xl border border-brand bg-brand-soft text-brand text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-brand-soft/80">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{excelFileName ? 'تغيير الملف' : 'رفع شيت الأسعار'}</span>
                    <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                  {excelFileName && (
                    <span className="text-[10px] text-ink-muted truncate max-w-[120px] font-mono">{excelFileName}</span>
                  )}
                </div>
              </>
            )}

            {/* Reason */}
            <div className="mt-1">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="سبب تغيير الأسعار (بيتسجل في تاريخ الصنف)"
                className="w-full h-7 px-2.5 text-[11px] rounded-lg border border-line bg-surface-2 text-ink focus:bg-surface focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          {/* Rounding Rule & Trigger Button */}
          <div className="flex flex-col gap-1.5 justify-between">
            <div>
              <label className="font-bold text-ink">قاعدة التقريب</label>
              <CustomSelect
                value={roundingRule}
                onChange={(val) => setRoundingRule(val as typeof roundingRule)}
                options={[
                  { value: 'none', label: 'بدون تقريب (بالقروش الأصلية زي ما هي)' },
                  { value: 'half_pound', label: 'لأقرب نص جنيه (0.50 ج.م)' },
                  { value: 'one_pound', label: 'لأقرب جنيه سليم (1.00 ج.م)' },
                  { value: 'five_pounds', label: 'لأقرب 5 جنيه' },
                  { value: 'ceil_pound', label: 'تقريب لفوق دايماً (سقف لأقرب جنيه)' },
                  { value: 'psychological_95', label: 'تسويقي ينتهي بـ 95 قرش (زي 24.95)' },
                  { value: 'psychological_50', label: 'تسويقي ينتهي بـ 50 قرش (زي 24.50)' },
                ]}
                size="sm"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleGeneratePreview()}
              disabled={previewLoading}
              className="h-8 px-4 bg-brand-soft text-brand hover:bg-brand hover:text-white border border-brand/30 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-98"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
              <span>{previewLoading ? 'جاري الحساب والمعاينة...' : 'تحديث ومعاينة الأسعار'}</span>
            </button>
          </div>
        </div>

        {/* 3. Summary & Quick Stats Bar */}
        {previewResult && (
          <div className="h-10 px-5 bg-surface-2 border-b border-line flex items-center justify-between text-xs shrink-0 font-bold select-none">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-ink">
                <Sliders className="w-3.5 h-3.5 text-brand" />
                <span>إجمالي الأصناف:</span>
                <span className="font-mono text-brand font-black">{previewResult.totalCount}</span>
              </span>

              <span className="flex items-center gap-1.5 text-ink">
                <span>جاهز للتعديل:</span>
                <span className="font-mono text-paid font-black">{activeSelectedCount}</span>
              </span>

              <span className="flex items-center gap-1.5 text-ink">
                <span>متوسط التغيير:</span>
                <span className={`font-mono font-black ${previewResult.averageIncreasePercent >= 0 ? 'text-paid' : 'text-danger'}`}>
                  {previewResult.averageIncreasePercent > 0 ? `+${previewResult.averageIncreasePercent}%` : `${previewResult.averageIncreasePercent}%`}
                </span>
              </span>

              {activeBelowCostCount > 0 && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-amber-700" />
                  <span>{activeBelowCostCount} صنف سعر بيعه هيبقى أقل من التكلفة (خسارة)!</span>
                </span>
              )}
            </div>

            {/* Preview Search Filter */}
            <div className="relative w-56 h-7 flex items-center bg-surface border border-line rounded-lg px-2">
              <Search className="w-3.5 h-3.5 text-ink-muted ml-1.5 pointer-events-none" />
              <input
                type="text"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(normalizeArabicNumerals(e.target.value))}
                placeholder="دور في البضاعة المعروضة..."
                className="w-full bg-transparent border-none text-[11px] text-ink placeholder:text-ink-muted focus:outline-none"
              />
              {previewSearch && (
                <button type="button" onClick={() => setPreviewSearch('')} className="text-ink-muted hover:text-ink">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 4. Error / Warning Alert */}
        {errorMsg && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-bold flex items-center justify-between animate-in fade-in shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button type="button" onClick={() => setErrorMsg(null)} className="p-1 hover:text-ink">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Below Cost Warning Modal Prompt */}
        {confirmBelowCostWarning && (
          <div className="mx-4 mt-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center justify-between shrink-0 shadow-xs animate-in zoom-in-95">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="m-0 text-[12px] font-black text-amber-900">
                  تنبيه: فيه {activeBelowCostCount} صنف سعر بيعهم الجديد هيكون أقل من سعر التكلفة (بيع بالخسارة)!
                </p>
                <p className="m-0 text-[11px] text-amber-800 font-normal">
                  متأكد إنك عاوز تكمل وتطبق الأسعار دي بالخسارة للأصناف المحددة؟
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmBelowCostWarning(false)}
                className="px-3 py-1 bg-surface border border-line text-ink rounded-lg text-xs font-bold hover:bg-surface-2 cursor-pointer"
              >
                إلغاء ومراجعة الأسعار
              </button>
              <button
                type="button"
                onClick={() => void handleApplyChanges()}
                className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
              >
                أيوه، اعتمد الأسعار رغم الخسارة
              </button>
            </div>
          </div>
        )}

        {/* 5. Preview Table */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 pt-2">
          <div className="flex-1 bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-2xs">
            {/* Table Header */}
            <div className="h-9 bg-surface-2 border-b border-line px-4 grid grid-cols-12 items-center text-[11.5px] font-bold text-ink-muted shrink-0 select-none">
              <div className="col-span-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    filteredPreviewItems.length > 0 &&
                    filteredPreviewItems.every(it => selectedItemsMap[it.productId])
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-line accent-paid cursor-pointer"
                  title="تحديد أو إلغاء تحديد الكل"
                />
                <span>تطبيق</span>
              </div>
              <span className="col-span-2">الباركود</span>
              <span className="col-span-3">اسم الصنف والقسم</span>
              <span className="col-span-2 text-center flex items-center justify-center gap-1">
                <span>السعر الحالي</span>
                <ArrowLeft className="w-3 h-3 text-ink-muted" />
                <span>الجديد</span>
              </span>
              <span className="col-span-1 text-center">نسبة الفرق</span>
              <span className="col-span-2 text-center flex items-center justify-center gap-1">
                <span>التكلفة الحالية</span>
                <ArrowLeft className="w-3 h-3 text-ink-muted" />
                <span>الجديدة</span>
              </span>
              <span className="col-span-1 text-center">الحالة</span>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto divide-y divide-line/60">
              {previewLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2.5 text-ink-muted p-8">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand" />
                  <span className="text-xs font-bold">جاري حساب الأسعار وتطبيق قواعد التقريب...</span>
                </div>
              ) : filteredPreviewItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-ink-muted p-8">
                  <Search className="w-8 h-8 text-line-hover" />
                  <p className="text-xs font-bold m-0 text-ink">مافيش أصناف مطابقة لبحثك أو للنطاق المختار</p>
                  <p className="text-[11px] text-ink-muted m-0">اتأكد من اختيار القسم أو الأصناف الصح واضغط 'تحديث ومعاينة'</p>
                </div>
              ) : (
                filteredPreviewItems.map((item) => {
                  const isChecked = !!selectedItemsMap[item.productId];
                  const hasPriceChange = item.newPricePiasters !== item.currentPricePiasters;
                  const hasCostChange = item.newCostPiasters !== item.currentCostPiasters;

                  return (
                    <div
                      key={item.productId}
                      className={`h-11 px-4 grid grid-cols-12 items-center text-xs font-semibold transition-colors ${
                        !isChecked
                          ? 'opacity-40 bg-surface-2/40'
                          : item.belowCost
                          ? 'bg-amber-50/70 hover:bg-amber-50'
                          : 'hover:bg-brand-soft/20'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="col-span-1 flex items-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(item.productId)}
                          className="w-4 h-4 rounded border-line accent-paid cursor-pointer"
                        />
                      </div>

                      {/* Barcode */}
                      <div className="col-span-2 font-mono text-[11px] text-ink-muted truncate">
                        {item.barcode || '—'}
                      </div>

                      {/* Name & Category */}
                      <div className="col-span-3 flex flex-col pr-1 truncate">
                        <span className="font-bold text-ink truncate text-[11.5px]">{item.productName}</span>
                        <span className="text-[10px] text-ink-muted font-normal">{item.categoryName}</span>
                      </div>

                      {/* Sale Price Comparison */}
                      <div className="col-span-2 flex items-center justify-center gap-1.5 font-mono text-xs">
                        <span className="text-ink-muted line-through text-[11px]">
                          {formatArabicCurrency(item.currentPricePiasters)}
                        </span>
                        <ArrowLeft className="w-3 h-3 text-ink-muted shrink-0" />
                        <span className={`font-bold ${hasPriceChange ? 'text-paid text-[12.5px]' : 'text-ink'}`}>
                          {formatArabicCurrency(item.newPricePiasters)}
                        </span>
                      </div>

                      {/* Price Diff */}
                      <div className="col-span-1 text-center font-mono text-[11px]">
                        {item.priceDiffPiasters !== 0 ? (
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              item.priceDiffPiasters > 0
                                ? 'bg-paid-soft text-paid'
                                : 'bg-danger/10 text-danger'
                            }`}
                          >
                            {item.priceDiffPiasters > 0 ? `+${item.priceDiffPercent}%` : `${item.priceDiffPercent}%`}
                          </span>
                        ) : (
                          <span className="text-ink-muted font-normal">ثابت</span>
                        )}
                      </div>

                      {/* Cost Comparison */}
                      <div className="col-span-2 flex items-center justify-center gap-1.5 font-mono text-xs">
                        <span className="text-ink-muted text-[11px]">
                          {formatArabicCurrency(item.currentCostPiasters)}
                        </span>
                        {hasCostChange && (
                          <>
                            <ArrowLeft className="w-3 h-3 text-ink-muted shrink-0" />
                            <span className="font-bold text-ink text-[12px]">
                              {formatArabicCurrency(item.newCostPiasters)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Status / Alert Badge */}
                      <div className="col-span-1 flex items-center justify-center">
                        {item.belowCost ? (
                          <span
                            className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300 flex items-center gap-1"
                            title="سعر البيع الجديد أقل من سعر التكلفة"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                            <span>بيع بخسارة</span>
                          </span>
                        ) : hasPriceChange || hasCostChange ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-paid text-[10px] font-bold border border-paid/20">
                            هيتغير
                          </span>
                        ) : (
                          <span className="text-ink-muted text-[10px]">ثابت زي ما هو</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 6. Footer Actions */}
        <div className="h-14 px-5 bg-surface border-t border-line flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2 text-ink-muted text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-paid" />
            <span>كل تغيير في الأسعار بيتسجل تلقائياً في سجل وتاريخ الأسعار في النظام بدون إنترنت.</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-line text-ink font-bold text-xs hover:bg-surface-2 transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              disabled={applying || activeSelectedCount === 0 || previewLoading}
              onClick={() => void handleApplyChanges()}
              className="h-9 px-5 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-98"
            >
              <Check className="w-4 h-4 text-emerald-300" />
              <span>
                {applying
                  ? 'جاري حفظ الأسعار الجديدة...'
                  : `اعتماد وتطبيق الأسعار الجديدة (${activeSelectedCount} صنف)`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
