import React from 'react';
import type { FormEvent } from 'react';
import {
  Package,
  History,
  X,
  AlertCircle,
  AlertTriangle,
  Barcode,
  Scale,
  Tags,
  TrendingUp,
  Percent,
  Check,
} from 'lucide-react';
import type { Category, ProductUnit } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { ProductUnitsEditor } from '../../components/ProductUnitsEditor';

export interface BelowCostWarningData {
  pricePiasters: number;
  costPiasters: number;
  lossPiasters: number;
}

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
  name: string;
  setName: (v: string) => void;
  barcode: string;
  setBarcode: (v: string) => void;
  additionalBarcodes: string[];
  newBarcodeInput: string;
  setNewBarcodeInput: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  categories: Category[];
  onOpenCategoryModal: () => void;
  pricePiasters: number;
  setPricePiasters: (v: number) => void;
  costPiasters: number;
  setCostPiasters: (v: number) => void;
  unit: 'piece' | 'kg';
  setUnit: (v: 'piece' | 'kg') => void;
  productUnits: ProductUnit[];
  setProductUnits: (v: ProductUnit[]) => void;
  stockInput: string;
  setStockInput: (v: string) => void;
  minStockInput: string;
  setMinStockInput: (v: string) => void;
  taxRatePercent: number;
  setTaxRatePercent: (v: number) => void;
  internalCode: string;
  setInternalCode: (v: string) => void;
  taxCategoryCode: string;
  setTaxCategoryCode: (v: string) => void;
  formError: string;
  setFormError: (v: string) => void;
  similarWarning: string | null;
  setSimilarWarning: (v: string | null) => void;
  belowCostWarning: BelowCostWarningData | null;
  setBelowCostWarning: (v: BelowCostWarningData | null) => void;
  loading: boolean;
  onSave: (e?: FormEvent, forceConfirmSimilar?: boolean, forceConfirmCost?: boolean) => void;
  onOpenPriceHistory: () => void;
  onGenerateInternalBarcode: () => void;
  onAddBarcode: () => void;
  onRemoveBarcode: (index: number) => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  editingId,
  name,
  setName,
  barcode,
  setBarcode,
  additionalBarcodes,
  newBarcodeInput,
  setNewBarcodeInput,
  categoryId,
  setCategoryId,
  categories,
  onOpenCategoryModal,
  pricePiasters,
  setPricePiasters,
  costPiasters,
  setCostPiasters,
  unit,
  setUnit,
  productUnits,
  setProductUnits,
  stockInput,
  setStockInput,
  minStockInput,
  setMinStockInput,
  taxRatePercent,
  setTaxRatePercent,
  internalCode,
  setInternalCode,
  taxCategoryCode,
  setTaxCategoryCode,
  formError,
  similarWarning,
  setSimilarWarning,
  belowCostWarning,
  setBelowCostWarning,
  loading,
  onSave,
  onOpenPriceHistory,
  onGenerateInternalBarcode,
  onAddBarcode,
  onRemoveBarcode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92vh] bg-surface rounded-xl border border-brand/50 shadow-2xl overflow-hidden flex flex-col select-none animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header (Fixed at top) */}
        <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-brand" />
            <h3 className="text-[14px] font-bold text-ink m-0">
              {editingId ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد للكتالوج'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={onOpenPriceHistory}
                className="mr-2 px-2 py-0.5 rounded bg-brand-soft hover:bg-brand/20 border border-brand/20 text-brand text-[11px] font-bold flex items-center gap-1 transition-colors"
                title="عرض تاريخ وتعديلات أسعار هذا الصنف"
              >
                <History className="w-3 h-3" />
                <span>سجل الأسعار</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={(e) => onSave(e)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 text-[12px]">
            {formError && (
              <div className="p-2.5 rounded bg-danger-soft border border-danger-border text-danger flex items-center gap-2 text-[12px] font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {similarWarning && (
              <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-900 flex flex-col gap-2 text-[12px]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{similarWarning}</span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200">
                  <button
                    type="button"
                    onClick={() => setSimilarWarning(null)}
                    className="px-2.5 py-1 bg-white hover:bg-surface border border-line text-ink rounded text-[11px] font-bold transition-colors"
                  >
                    تعديل الاسم
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(undefined, true)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <span>تجاهل وتأكيد الحفظ</span>
                  </button>
                </div>
              </div>
            )}


            {/* Name */}
            <div>
              <label className="block text-ink font-semibold mb-1">اسم الصنف *</label>
              <input
                type="text"
                placeholder="مثال: شاي العروسة 250 جم"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                autoFocus
              />
            </div>

            {/* Primary Barcode with Auto-Generate button */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-ink font-semibold">الباركود الرئيسي</label>
                <button
                  type="button"
                  onClick={onGenerateInternalBarcode}
                  className="text-[11px] text-brand hover:underline font-semibold flex items-center gap-1"
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span>توليد كود تلقائي</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="امسح الباركود الرئيسي أو اضغط توليد كود تلقائي"
                value={barcode}
                onChange={(e) => setBarcode(normalizeArabicNumerals(e.target.value))}
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
              />
            </div>

            {/* Multiple Additional Barcodes Editor (Feature #15 / Task 15-3) */}
            <div className="p-3 bg-surface-2/60 border border-line rounded flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink">
                <span>باركودات إضافية لنفس الصنف (مسح سريع بالقارئ):</span>
                <span className="text-[10.5px] text-ink-muted font-mono font-normal">
                  {additionalBarcodes.length} باركود إضافي
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="امسح بالباركود واضغط Enter للإضافة..."
                  value={newBarcodeInput}
                  onChange={(e) => setNewBarcodeInput(normalizeArabicNumerals(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onAddBarcode();
                    }
                  }}
                  className="flex-1 bg-surface border border-line rounded h-[34px] px-3 text-[12px] font-mono text-ink focus:outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={onAddBarcode}
                  disabled={!newBarcodeInput.trim()}
                  className="px-3 h-[34px] bg-brand hover:bg-brand-hover disabled:bg-surface disabled:text-ink-muted text-white rounded text-[11.5px] font-bold transition-colors shadow-xs"
                >
                  + إضافة
                </button>
              </div>

              {additionalBarcodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                  {additionalBarcodes.map((bc, idx) => (
                    <span
                      key={bc}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-line rounded text-[11px] font-mono text-ink shadow-xs"
                    >
                      <Barcode className="w-3 h-3 text-ink-muted" />
                      <span>{bc}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveBarcode(idx)}
                        className="text-ink-muted hover:text-danger hover:bg-danger-soft rounded p-0.5 cursor-pointer"
                        title="حذف هذا الباركود"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Unit Selection: Piece vs Weight (Feature #19 / Tasks 19-1 & 19-2) */}
            <div>
              <label className="block text-ink font-semibold mb-1">نوع بيع الصنف (الوحدة) *</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded border border-line">
                <button
                  type="button"
                  onClick={() => {
                    setUnit('piece');
                    setProductUnits(productUnits.map(u => u.isBaseUnit ? { ...u, unitName: 'قطعة', isDivisible: false } : u));
                  }}
                  className={`py-1.5 px-3 rounded text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                    unit === 'piece'
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>بالقطعة / بالعدد (قطعة)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUnit('kg');
                    setProductUnits(productUnits.map(u => u.isBaseUnit ? { ...u, unitName: 'كيلو', isDivisible: true } : u));
                  }}
                  className={`py-1.5 px-3 rounded text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                    unit === 'kg'
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>بالوزن / ميزان (كيلوجرام)</span>
                </button>
              </div>
            </div>

            {/* Multi-Units Management (Feature #161 / Tasks 161-1 to 161-4 & 161-13 to 161-15) */}
            <div className="shrink-0 w-full">
              <ProductUnitsEditor
                units={productUnits}
                onChange={(newUnits) => {
                  setProductUnits(newUnits);
                  const base = newUnits.find(u => u.isBaseUnit);
                  if (base) {
                    if (base.sellPricePiasters !== pricePiasters) setPricePiasters(base.sellPricePiasters);
                    if (base.costPricePiasters !== costPiasters) setCostPiasters(base.costPricePiasters);
                  }
                }}
                basePricePiasters={pricePiasters}
                baseCostPiasters={costPiasters}
                baseUnitName={unit === 'kg' ? 'كيلو' : 'قطعة'}
                isWeightItem={unit === 'kg'}
                primaryBarcode={barcode}
              />
            </div>

            {/* Category Selection Dropdown (Task 16-3) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-ink font-semibold">قسم وتصنيف الصنف</label>
                <button
                  type="button"
                  onClick={onOpenCategoryModal}
                  className="text-[11px] text-brand hover:underline font-semibold flex items-center gap-1"
                >
                  <Tags className="w-3.5 h-3.5" />
                  <span>إدارة الأقسام</span>
                </button>
              </div>
              <CustomSelect
                value={categoryId}
                onChange={(val) => setCategoryId(val)}
                options={
                  categories.length > 0
                    ? categories.map((cat) => ({ value: cat.id, label: cat.name }))
                    : [{ value: 'cat_general', label: 'عام / متنوع' }]
                }
                size="md"
                searchable
              />
            </div>

            {/* Selling Price & Cost in Piasters */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">
                  {unit === 'kg' ? 'سعر بيع الكيلو للجمهور *' : 'سعر البيع للجمهور (للقطعة) *'}
                </label>
                <MoneyInput
                  valuePiasters={pricePiasters}
                  onChangePiasters={setPricePiasters}
                  className="h-[38px] text-[13px] font-bold text-brand"
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">
                  {unit === 'kg' ? 'تكلفة شراء الكيلو من المورد' : 'تكلفة الشراء من المورد (للقطعة)'}
                </label>
                <MoneyInput
                  valuePiasters={costPiasters}
                  onChangePiasters={setCostPiasters}
                  className="h-[38px] text-[13px]"
                />
              </div>
            </div>

            {/* Live Profit Margin Card (Feature #17 / Task 17-2) */}
            {(() => {
              const profitPiasters = pricePiasters - costPiasters;
              const markupPercent = costPiasters > 0 ? ((profitPiasters / costPiasters) * 100) : 0;
              const marginPercent = pricePiasters > 0 ? ((profitPiasters / pricePiasters) * 100) : 0;
              const isLoss = profitPiasters < 0;
              const isBreakEven = profitPiasters === 0;

              if (isLoss) {
                return (
                  <div className="p-2.5 rounded bg-danger-soft border border-danger/30 text-danger flex flex-col gap-1 text-[11.5px]">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
                        <span>تنبيه: سعر البيع أقل من التكلفة (بيع بالخسارة)</span>
                      </span>
                      <span className="font-mono text-[12px]">
                        -{formatArabicCurrency(Math.abs(profitPiasters))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10.5px] text-danger/80">
                      <span>نسبة الخسارة من التكلفة: -{Math.abs(markupPercent).toFixed(1)}%</span>
                      <span>تكلفة: {formatArabicCurrency(costPiasters)} | بيع: {formatArabicCurrency(pricePiasters)}</span>
                    </div>
                  </div>
                );
              }

              if (isBreakEven) {
                return (
                  <div className="p-2 rounded bg-surface-2 border border-line text-ink-muted text-[11px] flex items-center justify-between font-mono">
                    <span>هامش الربح: 0.00 ج.م (رأس برأس)</span>
                    <span>سعر البيع يطابق سعر الشراء تماماً</span>
                  </div>
                );
              }

              return (
                <div className="p-2.5 rounded bg-brand-soft/80 border border-brand/20 text-brand flex flex-col gap-1 text-[11.5px]">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-brand shrink-0" />
                      <span>{unit === 'kg' ? 'الربح الصافي للكيلو:' : 'الربح الصافي للقطعة:'}</span>
                    </span>
                    <span className="font-mono text-[12px] font-bold">
                      +{formatArabicCurrency(profitPiasters)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-brand/80">
                    <span>نسبة الربح من التكلفة (Markup): +{markupPercent.toFixed(1)}%</span>
                    <span>هامش المبيعات (Margin): {marginPercent.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })()}

            {/* Below Cost Warning Modal / Prompt if Loss Detected (Task 17-1) */}
            {belowCostWarning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-800 dark:text-amber-300 flex flex-col gap-2">
                <div className="flex items-start gap-2 text-[11.5px] font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p>سعر البيع ({formatArabicCurrency(belowCostWarning.pricePiasters)}) أقل من سعر التكلفة ({formatArabicCurrency(belowCostWarning.costPiasters)}).</p>
                    <p className="text-[11px] font-normal text-ink-muted mt-0.5">هل تريد بالتأكيد المتابعة وحفظ المنتج بالخسارة؟</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-500/20">
                  <button
                    type="button"
                    onClick={() => setBelowCostWarning(null)}
                    className="px-2.5 h-6 bg-surface hover:bg-surface-2 border border-line rounded text-[11px] font-semibold text-ink transition-colors"
                  >
                    تعديل الأسعار
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(undefined, false, true)}
                    className="px-2.5 h-6 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold transition-colors shadow-xs"
                  >
                    نعم، تأكيد الحفظ بالخسارة
                  </button>
                </div>
              </div>
            )}


            {/* Initial Stock, Min Stock Threshold, & Tax Rate (Feature #18 & #19) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-ink font-semibold mb-1 text-[12px]">
                  {unit === 'kg' ? 'رصيد المخزن الفعلي (كجم)' : 'رصيد المخزن الفعلي (قطعة)'}
                </label>
                <input
                  type="text"
                  value={stockInput}
                  onChange={(e) => setStockInput(normalizeArabicNumerals(e.target.value))}
                  placeholder={unit === 'kg' ? 'مثلاً: 12.5 كجم' : 'مثلاً: 10 قطع'}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
                <p className="text-[10px] text-ink-muted mt-1 leading-tight">الكمية المتوفرة حالياً على الرف</p>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1 text-[12px]">
                  {unit === 'kg' ? 'حد التنبيه بالنواقص (كجم)' : 'حد التنبيه بالنواقص (قطعة)'}
                </label>
                <input
                  type="text"
                  value={minStockInput}
                  onChange={(e) => setMinStockInput(normalizeArabicNumerals(e.target.value))}
                  placeholder={unit === 'kg' ? 'تنبيه عند: 5 كجم' : 'تنبيه عند: 5 قطع'}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
                <p className="text-[10px] text-ink-muted mt-1 leading-tight">ينبهك النظام لشراء بضاعة جديدة</p>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1 text-[12px]">نسبة الضريبة (%)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={taxRatePercent}
                    onChange={(e) => setTaxRatePercent(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
                    placeholder="0"
                    className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono pl-8"
                  />
                  <Percent className="w-3.5 h-3.5 text-ink-muted absolute left-3 pointer-events-none" />
                </div>
                <p className="text-[10px] text-ink-muted mt-1 leading-tight">اكتب 0 للأصناف المعفية</p>
              </div>
            </div>

            {/* Tax & ETA E-Invoicing Readiness (Feature #6) */}
            <div className="grid grid-cols-2 gap-3 bg-canvas/60 p-2.5 rounded border border-line">
              <div>
                <label className="block text-ink-muted font-semibold mb-1 text-[11px]">
                  كود الصنف الداخلي (SKU)
                </label>
                <input
                  type="text"
                  placeholder="مثال: ITM-00124"
                  value={internalCode}
                  onChange={(e) => setInternalCode(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[34px] px-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>

              <div>
                <label className="block text-ink-muted font-semibold mb-1 text-[11px]">
                  كود التصنيف الضريبي (GS1 / EGS)
                </label>
                <input
                  type="text"
                  placeholder="اختياري - للفاتورة الإلكترونية"
                  value={taxCategoryCode}
                  onChange={(e) => setTaxCategoryCode(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[34px] px-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions (Docked and Fixed at bottom) */}
          <div className="h-[52px] bg-surface-2 hairline-t px-4 sm:px-5 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-[36px] px-4 bg-surface hover:bg-surface-3 border border-line text-ink rounded text-[12px] font-semibold transition-colors"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={loading}
              className="h-[36px] px-5 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>{editingId ? 'حفظ التعديلات' : 'حفظ الصنف في قاعدة البيانات'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
