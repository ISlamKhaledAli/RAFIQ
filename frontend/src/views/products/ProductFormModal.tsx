import React, { useState, useEffect } from 'react';
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
  Boxes,
  RotateCcw,
  Plus,
  Coins,
  Layers,
  Calendar,
  Calculator,
  Receipt,
} from 'lucide-react';
import type { Category, ProductUnit } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import { ProductUnitsEditor } from '../../components/ProductUnitsEditor';
import { useFeatures } from '../../context/useFeatures';

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
  onOpenVariantMatrix?: () => void;
  variantSize?: string;
  setVariantSize?: (v: string) => void;
  variantColor?: string;
  setVariantColor?: (v: string) => void;
  initialExpiryDate?: string;
  setInitialExpiryDate?: (v: string) => void;
  initialBatchNumber?: string;
  setInitialBatchNumber?: (v: string) => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  editingId,
  name,
  setName,
  onOpenVariantMatrix,
  variantSize = '',
  setVariantSize,
  variantColor = '',
  setVariantColor,
  initialExpiryDate = '',
  setInitialExpiryDate,
  initialBatchNumber = '',
  setInitialBatchNumber,
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
  // Detected package if defined in product units
  const detectedPackage = productUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);
  const packName = detectedPackage ? detectedPackage.unitName : 'كرتونة';

  // Dynamic Carton Calculator state: allow empty string and 0
  const [packSizeInput, setPackSizeInput] = useState<string>('');
  const [cartonsInput, setCartonsInput] = useState<string>('');
  const [looseInput, setLooseInput] = useState<string>('');

  // Synchronize on modal open or editingId change
  useEffect(() => {
    if (!isOpen) return;

    const detected = productUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);
    if (editingId) {
      if (detected && detected.conversionFactor > 0) {
        const factor = detected.conversionFactor;
        setPackSizeInput(String(factor));
        const currentStock = parseFloat(stockInput) || 0;
        const c = Math.floor(currentStock / factor);
        const rem = Math.round(currentStock % factor);
        setCartonsInput(c > 0 ? String(c) : '0');
        setLooseInput(rem > 0 ? String(rem) : '0');
      } else {
        setPackSizeInput('');
        setCartonsInput('');
        const currentStock = parseFloat(stockInput) || 0;
        setLooseInput(currentStock > 0 ? String(currentStock) : '0');
      }
    } else {
      // Adding new product: start clean with 0 / empty defaults
      setPackSizeInput('');
      setCartonsInput('');
      setLooseInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId]);

  const packSizeNum = parseInt(normalizeArabicNumerals(packSizeInput), 10) || 0;
  const cartonsNum = parseInt(normalizeArabicNumerals(cartonsInput), 10) || 0;
  const looseNum = parseInt(normalizeArabicNumerals(looseInput), 10) || 0;
  const totalStockNum = parseFloat(stockInput) || 0;

  // When user edits cartons:
  const handleCartonsChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setCartonsInput(clean);
    const c = parseInt(clean, 10);
    const cVal = isNaN(c) ? 0 : c;
    const newTotal = (cVal * packSizeNum) + looseNum;
    setStockInput(String(newTotal));
  };

  // When user edits pack size:
  const handlePackSizeChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setPackSizeInput(clean);
    const p = parseInt(clean, 10);
    const pVal = isNaN(p) ? 0 : p;
    const newTotal = (cartonsNum * pVal) + looseNum;
    setStockInput(String(newTotal));
  };

  // When user edits loose pieces:
  const handleLoosePiecesChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setLooseInput(clean);
    const l = parseInt(clean, 10);
    const lVal = isNaN(l) ? 0 : l;
    const newTotal = (cartonsNum * packSizeNum) + lVal;
    setStockInput(String(newTotal));
  };

  // When user types directly into stockInput:
  const handleDirectStockChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setStockInput(clean);
    const total = parseFloat(clean) || 0;
    if (packSizeNum > 0) {
      const c = Math.floor(total / packSizeNum);
      const rem = Math.round(total % packSizeNum);
      setCartonsInput(c > 0 ? String(c) : '0');
      setLooseInput(rem > 0 ? String(rem) : '0');
    } else {
      setCartonsInput('0');
      setLooseInput(clean || '0');
    }
  };

  // Quick increment function
  const handleQuickAddStock = (amount: number) => {
    const current = parseFloat(stockInput) || 0;
    const nextVal = Math.max(0, current + amount);
    setStockInput(String(nextVal));
    if (packSizeNum > 0) {
      const c = Math.floor(nextVal / packSizeNum);
      const rem = Math.round(nextVal % packSizeNum);
      setCartonsInput(c > 0 ? String(c) : '0');
      setLooseInput(rem > 0 ? String(rem) : '0');
    } else {
      setCartonsInput('0');
      setLooseInput(String(nextVal));
    }
  };

  // Reset stock function
  const handleResetStock = () => {
    setStockInput('0');
    setCartonsInput('0');
    setLooseInput('0');
  };

  // Smart Supplier Cost Calculator state
  const [showCostCalculator, setShowCostCalculator] = useState(false);
  const [costCalcMode, setCostCalcMode] = useState<'carton' | 'invoice'>('carton');
  const [calcCartonPricePiasters, setCalcCartonPricePiasters] = useState<number>(0);
  const [calcCartonCapacity, setCalcCartonCapacity] = useState<string>('');
  const [calcInvoiceTotalPiasters, setCalcInvoiceTotalPiasters] = useState<number>(0);
  const [calcInvoiceQty, setCalcInvoiceQty] = useState<string>('');

  // Derived calculation for cost calculator
  const cartonCapNum = parseInt(normalizeArabicNumerals(calcCartonCapacity), 10) || 0;
  const calculatedFromCarton = cartonCapNum > 0 ? Math.round(calcCartonPricePiasters / cartonCapNum) : 0;

  const invoiceQtyNum = parseFloat(normalizeArabicNumerals(calcInvoiceQty)) || 0;
  const calculatedFromInvoice = invoiceQtyNum > 0 ? Math.round(calcInvoiceTotalPiasters / invoiceQtyNum) : 0;

  const activeCalculatedCost = costCalcMode === 'carton' ? calculatedFromCarton : calculatedFromInvoice;
  const { isEnabled } = useFeatures();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92vh] bg-surface rounded-xl border border-brand/50 shadow-2xl overflow-hidden flex flex-col select-none animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header (Fixed at top) */}
        <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-brand" />
            <h3 className="text-[14px] font-bold text-ink m-0">
              {editingId ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد لبضاعة المحل'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={onOpenPriceHistory}
                className="mr-2 px-2 py-0.5 rounded bg-brand-soft hover:bg-brand/20 border border-brand/20 text-brand text-[11px] font-bold flex items-center gap-1 transition-colors"
                title="عرض تاريخ وتعديلات أسعار هذا الصنف"
              >
                <History className="w-3 h-3" />
                <span>سجل وتاريخ الأسعار</span>
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
                    تعديل اسم الصنف
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(undefined, true)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <span>عادي، احفظ الصنف برضه</span>
                  </button>
                </div>
              </div>
            )}

            {/* Matrix Variants Quick Action (Feature #114) */}
            {!editingId && onOpenVariantMatrix && isEnabled('feature_matrix_variants') && (
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 text-purple-950 font-bold">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-purple-700" />
                  </div>
                  <div>
                    <div className="text-purple-950">هل الصنف ده فيه منه مقاسات وألوان مختلفة (زي الهدوم والأحذية)؟</div>
                    <div className="text-[11px] text-purple-700 font-normal">اعمل مصفوفة سريعة (مقاس × لون) بباركود وسعر ورصيد لكل خيار بدفعة واحدة</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenVariantMatrix}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg transition-colors shrink-0 text-xs shadow-xs cursor-pointer active:scale-95"
                >
                  + عمل مقاسات وألوان للصنف
                </button>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-ink font-semibold mb-1">اسم الصنف *</label>
              <input
                type="text"
                placeholder="مثلاً: شاي العروسة 250 جم"
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
                  <span>عمل باركود تلقائي</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="اضرب الباركود بالقارئ أو دوس عمل كود تلقائي"
                value={barcode}
                onChange={(e) => setBarcode(normalizeArabicNumerals(e.target.value))}
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
              />
            </div>

            {/* Multiple Additional Barcodes Editor (Feature #15 / Task 15-3) */}
            <div className="p-3 bg-surface-2/60 border border-line rounded flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink">
                <span>باركودات إضافية لنفس الصنف (تسهيل الضرب بالقارئ):</span>
                <span className="text-[10.5px] text-ink-muted font-mono font-normal">
                  {additionalBarcodes.length} باركود إضافي
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="اضرب الباركود ودوس Enter للإضافة..."
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
                  + إضافة كود
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
                        title="مسح هذا الباركود"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                    : [{ value: 'cat_general', label: 'عام / تشكيلة متنوعة' }]
                }
                size="md"
                searchable
              />
            </div>

            {/* Unit Selection: Piece vs Weight (Feature #19 / Tasks 19-1 & 19-2) */}
            <div>
              <label className="block text-ink font-semibold mb-1">طريقة بيع الصنف (الوحدة) *</label>
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
                  <span>بالقطعة / بالواحدة (قطعة)</span>
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

            {/* Variant Attributes: Size & Color (Feature #114) */}
            {isEnabled('feature_matrix_variants') && (
              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-lg flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-purple-950 font-bold text-[12px]">
                    <Layers className="w-4 h-4 text-purple-700" />
                    <span>المقاس واللون (اختياري)</span>
                  </div>
                  {!editingId && onOpenVariantMatrix && (
                    <button
                      type="button"
                      onClick={onOpenVariantMatrix}
                      className="text-[11px] text-purple-700 hover:text-purple-900 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>+ عمل مصفوفة سريعة (مقاس × لون)</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">المقاس</label>
                    <input
                      type="text"
                      placeholder="مثلاً: L أو 42 أو 2XL"
                      value={variantSize}
                      onChange={(e) => setVariantSize?.(e.target.value)}
                      className="w-full bg-surface border border-line rounded h-[36px] px-3 text-[12px] font-mono text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">اللون</label>
                    <input
                      type="text"
                      placeholder="مثلاً: كحلي أو أبيض أو أسود"
                      value={variantColor}
                      onChange={(e) => setVariantColor?.(e.target.value)}
                      className="w-full bg-surface border border-line rounded h-[36px] px-3 text-[12px] text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Expiry Date & Batch for Initial Stock (Feature #60) */}
            {isEnabled('feature_expiry_dates') && (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-950 font-bold text-[12px]">
                    <Calendar className="w-4 h-4 text-amber-700" />
                    <span>تاريخ الصلاحية ورقم الشحنة (اختياري)</span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-medium">تسجيل تلقائي لرصيد أول المدة بالمخزن</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">تاريخ انتهاء الصلاحية</label>
                    <CustomDatePicker
                      value={initialExpiryDate || ''}
                      onChange={(val) => setInitialExpiryDate?.(val)}
                      placeholder="اختر تاريخ الصلاحية"
                      size="md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                      رقم الشحنة أو إذن الاستلام (اختياري)
                    </label>
                    <input
                      type="text"
                      placeholder="مثلاً: شحنة 1 أو رقم الفاتورة (هيتعمل تلقائي لو سبته فاضي)"
                      value={initialBatchNumber}
                      onChange={(e) => setInitialBatchNumber?.(e.target.value)}
                      className="w-full bg-surface border border-line rounded h-[34px] px-3 text-[12px] font-mono text-ink focus:outline-none focus:border-brand shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Integrated Dynamic Packaging & Stock Quantity Engine */}
            <div className="p-3 bg-surface-2 border-2 border-brand/30 rounded-lg flex flex-col gap-3 shadow-2xs">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-brand" />
                  <span className="text-[13px] font-bold text-ink">رصيد المخزن وجرد الكراتين *</span>
                  <span className="px-1.5 py-0.5 bg-brand-soft text-brand border border-brand/20 rounded text-[10px] font-bold">
                    حساب فوري ولحظي
                  </span>
                </div>
                {unit === 'piece' && (
                  packSizeNum > 0 ? (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-brand bg-white px-2 py-0.5 rounded-md border border-brand/20 shadow-2xs">
                      <Package className="w-3.5 h-3.5 text-brand" />
                      <span>العبوة: {packName} ({packSizeNum} قطعة)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted bg-white px-2 py-0.5 rounded-md border border-line shadow-2xs">
                      <Package className="w-3.5 h-3.5 text-ink-muted" />
                      <span>قطع فرط فرداني (من غير كراتين)</span>
                    </div>
                  )
                )}
              </div>

              {/* Dynamic Equation Inputs for Pieces or Weight */}
              {unit === 'piece' ? (
                <>
                  {/* Dynamic 4-Box Mathematical Calculation Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center bg-white p-2.5 rounded-lg border border-line shadow-2xs">
                    {/* Cartons */}
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-ink mb-1">
                        عدد الكراتين ({packName}):
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cartonsInput}
                        onChange={(e) => handleCartonsChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full bg-surface-2 border border-line rounded h-[36px] px-2 text-[13px] font-mono text-center font-bold text-brand focus:outline-none focus:border-brand"
                      />
                    </div>

                    {/* Pack Size */}
                    <div className="flex-1 relative">
                      <label className="block text-[11px] font-bold text-ink mb-1">
                        سعة الـ {packName} (فيها كام حتة):
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute right-2 text-ink-muted text-xs font-bold pointer-events-none select-none">×</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={packSizeInput}
                          onChange={(e) => handlePackSizeChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full bg-surface-2 border border-line rounded h-[36px] pr-5 pl-2 text-[13px] font-mono text-center font-bold text-ink focus:outline-none focus:border-brand"
                        />
                      </div>
                    </div>

                    {/* Loose Pieces */}
                    <div className="flex-1 relative">
                      <label className="block text-[11px] font-bold text-ink mb-1">
                        قطع فرط (فرداني):
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute right-2 text-ink-muted text-xs font-bold pointer-events-none select-none">+</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={looseInput}
                          onChange={(e) => handleLoosePiecesChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full bg-surface-2 border border-line rounded h-[36px] pr-5 pl-2 text-[13px] font-mono text-center font-bold text-ink focus:outline-none focus:border-brand"
                        />
                      </div>
                    </div>

                    {/* Total Stock Pieces */}
                    <div className="flex-1 relative">
                      <label className="block text-[11px] font-bold text-brand mb-1">
                        إجمالي الرصيد (بالقطعة) *
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute right-2 text-brand text-xs font-bold pointer-events-none select-none">=</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={stockInput}
                          onChange={(e) => handleDirectStockChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full bg-brand-soft border-2 border-brand rounded h-[36px] pr-5 pl-2 text-[13px] font-mono text-center font-extrabold text-brand focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Min Stock Reorder Alert Input */}
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-line shadow-2xs">
                    <label className="text-[11.5px] font-semibold text-ink shrink-0">
                      حد تنبيه النواقص (قطعة):
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={minStockInput}
                      onChange={(e) => {
                        const clean = normalizeArabicNumerals(e.target.value).replace(/[^\d]/g, '');
                        setMinStockInput(clean.length > 1 ? clean.replace(/^0+/, '') || '0' : clean);
                      }}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-32 bg-surface-2 border border-line rounded h-[30px] px-2 text-[12px] font-mono text-center text-ink focus:outline-none focus:border-brand"
                    />
                    <span className="text-[10.5px] text-ink-muted">النظام هينبهك تلقائياً أول ما الرصيد يقل عن كده عشان تطلب بضاعة من الموردين</span>
                  </div>

                  {/* Dynamic Equation Live Breakdown Banner */}
                  <div className="p-2.5 bg-brand-soft border border-brand/20 rounded-md text-brand text-[11.5px] font-bold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-brand shrink-0" />
                      <span>
                        {packSizeNum > 0 && cartonsNum > 0 ? (
                          <>
                            الناتج المحسوب: {cartonsNum} {packName} × {packSizeNum} حتة
                            {looseNum > 0 ? ` + ${looseNum} فرط` : ''}
                            {' = '}
                            {totalStockNum} حتة رصيد فعلي في المحل
                          </>
                        ) : totalStockNum > 0 ? (
                          <>
                            الناتج المحسوب: {totalStockNum} حتة رصيد فعلي في المحل (بيع بالقطعة الفردية)
                          </>
                        ) : (
                          <>الرصيد الفعلي في المحل: 0 قطعة</>
                        )}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] bg-white text-brand px-2 py-0.5 rounded border border-brand/20">
                      {totalStockNum} قطعة
                    </span>
                  </div>

                  {/* Quick Increment Buttons in RTL Order */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold text-ink-muted ml-1 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-ink-muted" />
                      <span>تزويد سريع:</span>
                    </span>
                    {packSizeNum > 0 && (
                      <button
                        type="button"
                        onClick={() => handleQuickAddStock(packSizeNum)}
                        className="px-2.5 py-1 bg-white hover:bg-brand-soft border border-brand/20 text-brand rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        title={`إضافة ${packName} كاملة (+${packSizeNum} قطعة)`}
                      >
                        <Plus className="w-3 h-3" />
                        <span>+1 {packName} ({packSizeNum})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(12)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+12 (دستة)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(24)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+24 (كرتونة)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(50)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+50</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(100)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+100</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(500)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+500</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(1000)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+1000</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetStock}
                      className="px-2.5 py-1 bg-white hover:bg-danger-soft border border-line text-danger hover:border-danger-border rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs mr-auto"
                      title="تصفير الرصيد (0)"
                    >
                      <RotateCcw className="w-3 h-3 text-danger" />
                      <span>تصفير (0)</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Weight Mode (kg) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-ink font-semibold mb-1 text-[12px]">
                        الرصيد الفعلي المتوفر (كجم) *
                      </label>
                      <input
                        type="text"
                        value={stockInput}
                        onChange={(e) => setStockInput(normalizeArabicNumerals(e.target.value))}
                        placeholder="مثلاً: 12.5 كجم"
                        className="w-full bg-white border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono font-bold"
                      />
                      <p className="text-[10.5px] text-ink-muted mt-1 leading-tight">الوزن الإجمالي المتوفر حالياً على الرف أو في المحل</p>
                    </div>

                    <div>
                      <label className="block text-ink font-semibold mb-1 text-[12px]">
                        حد تنبيه النواقص (كجم)
                      </label>
                      <input
                        type="text"
                        value={minStockInput}
                        onChange={(e) => setMinStockInput(normalizeArabicNumerals(e.target.value))}
                        placeholder="تنبيه عند: 5 كجم"
                        className="w-full bg-white border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                      />
                      <p className="text-[10.5px] text-ink-muted mt-1 leading-tight">النظام هينبهك تلقائياً أول ما الوزن يقل عن كده عشان تشتري بضاعة</p>
                    </div>
                  </div>

                  {/* Quick Weight Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold text-ink-muted ml-1 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-ink-muted" />
                      <span>تزويد سريع:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(1)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+1 كجم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(5)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+5 كجم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(10)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+10 كجم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddStock(25)}
                      className="px-2 py-1 bg-white hover:bg-surface-2 border border-line text-ink rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 text-ink-muted" />
                      <span>+25 كجم</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetStock}
                      className="px-2.5 py-1 bg-white hover:bg-danger-soft border border-line text-danger hover:border-danger-border rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs mr-auto"
                      title="تصفير الرصيد (0)"
                    >
                      <RotateCcw className="w-3 h-3 text-danger" />
                      <span>تصفير (0)</span>
                    </button>
                  </div>
                </>
              )}

              {/* Live Inventory Valuation (Capital invested in this item) */}
              {parseFloat(stockInput) > 0 && costPiasters > 0 && (
                <div className="px-2.5 py-1.5 bg-white border border-brand/20 rounded text-[11px] text-ink-muted flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-brand" />
                    <span>إجمالي فلوس البضاعة المركونة في المخزن (بسعر التكلفة):</span>
                  </div>
                  <span className="font-mono font-bold text-brand text-[12px]">
                    {formatArabicCurrency(Math.round(parseFloat(stockInput) * costPiasters))}
                  </span>
                </div>
              )}
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

            {/* Selling Price & Cost in Piasters */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">
                  {unit === 'kg' ? 'سعر بيع الكيلو للزبون *' : 'سعر البيع للزبون (للقطعة) *'}
                </label>
                <MoneyInput
                  valuePiasters={pricePiasters}
                  onChangePiasters={setPricePiasters}
                  className="h-[38px] text-[13px] font-bold text-brand"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-ink font-semibold">
                    {unit === 'kg' ? 'تكلفة شراء الكيلو من المورد' : 'تكلفة الشراء من الشركات والموردين (للقطعة)'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!showCostCalculator) {
                        if (!calcCartonCapacity && packSizeNum > 0) {
                          setCalcCartonCapacity(String(packSizeNum));
                        }
                        if (!calcInvoiceQty && parseFloat(stockInput) > 0) {
                          setCalcInvoiceQty(stockInput);
                        }
                      }
                      setShowCostCalculator(!showCostCalculator);
                    }}
                    className={`text-[11px] font-bold flex items-center gap-1 px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                      showCostCalculator
                        ? 'bg-brand text-white border-brand shadow-xs'
                        : 'bg-brand-soft text-brand hover:bg-brand/15 border-brand/20'
                    }`}
                    title="حاسبة لحساب تكلفة شراء القطعة من سعر الكرتونة أو إجمالي الفاتورة"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>حاسبة التكلفة</span>
                  </button>
                </div>
                <MoneyInput
                  valuePiasters={costPiasters}
                  onChangePiasters={setCostPiasters}
                  className="h-[38px] text-[13px]"
                />
              </div>
            </div>

            {/* Smart Supplier Cost Calculator Card */}
            {showCostCalculator && (
              <div className="p-3 bg-brand-soft/60 border border-brand/30 rounded-lg flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between border-b border-brand/15 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-brand" />
                    <span className="text-[12px] font-bold text-ink">حاسبة تكلفة الشراء من الشركات والموردين:</span>
                  </div>
                  <div className="flex items-center gap-1 bg-surface p-0.5 rounded-md border border-line">
                    <button
                      type="button"
                      onClick={() => setCostCalcMode('carton')}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        costCalcMode === 'carton'
                          ? 'bg-brand text-white shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Boxes className="w-3 h-3" />
                      <span>من سعر الكرتونة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostCalcMode('invoice')}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        costCalcMode === 'invoice'
                          ? 'bg-brand text-white shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Receipt className="w-3 h-3" />
                      <span>من إجمالي فاتورة الشراء</span>
                    </button>
                  </div>
                </div>

                {costCalcMode === 'carton' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                    <div>
                      <label className="block text-[11px] font-bold text-ink mb-1">
                        سعر شراء الكرتونة بالكامل من المورد:
                      </label>
                      <MoneyInput
                        valuePiasters={calcCartonPricePiasters}
                        onChangePiasters={setCalcCartonPricePiasters}
                        placeholder="0.00"
                        className="h-[34px] text-[12.5px] bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink mb-1">
                        سعة الكرتونة (فيها كام حتة):
                      </label>
                      <input
                        type="text"
                        value={calcCartonCapacity}
                        onChange={(e) => setCalcCartonCapacity(normalizeArabicNumerals(e.target.value))}
                        placeholder={packSizeNum > 0 ? String(packSizeNum) : 'مثلاً: 24'}
                        className="w-full bg-white border border-line rounded h-[34px] px-3 text-[12.5px] font-mono text-ink focus:outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                    <div>
                      <label className="block text-[11px] font-bold text-ink mb-1">
                        إجمالي المبلغ المدفوع في فاتورة المورد:
                      </label>
                      <MoneyInput
                        valuePiasters={calcInvoiceTotalPiasters}
                        onChangePiasters={setCalcInvoiceTotalPiasters}
                        placeholder="0.00"
                        className="h-[34px] text-[12.5px] bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink mb-1">
                        {unit === 'kg' ? 'إجمالي الوزن المستلم (كجم):' : 'إجمالي عدد القطع المستلمة في الفاتورة:'}
                      </label>
                      <input
                        type="text"
                        value={calcInvoiceQty}
                        onChange={(e) => setCalcInvoiceQty(normalizeArabicNumerals(e.target.value))}
                        placeholder={stockInput ? stockInput : 'مثلاً: 50'}
                        className="w-full bg-white border border-line rounded h-[34px] px-3 text-[12.5px] font-mono text-ink focus:outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                )}

                {/* Calculation Result Action Bar */}
                <div className="flex items-center justify-between bg-white p-2 rounded-md border border-brand/20 mt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted">تكلفة القطعة المحسوبة:</span>
                    <span className="font-mono text-[13px] font-extrabold text-brand">
                      {formatArabicCurrency(activeCalculatedCost)}
                    </span>
                    {activeCalculatedCost > 0 && costCalcMode === 'carton' && cartonCapNum > 0 && (
                      <span className="text-[10px] text-ink-muted">
                        ({formatArabicCurrency(calcCartonPricePiasters)} ÷ {cartonCapNum} قطعة)
                      </span>
                    )}
                    {activeCalculatedCost > 0 && costCalcMode === 'invoice' && invoiceQtyNum > 0 && (
                      <span className="text-[10px] text-ink-muted">
                        ({formatArabicCurrency(calcInvoiceTotalPiasters)} ÷ {invoiceQtyNum} {unit === 'kg' ? 'كجم' : 'قطعة'})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={activeCalculatedCost <= 0}
                    onClick={() => {
                      setCostPiasters(activeCalculatedCost);
                      setShowCostCalculator(false);
                    }}
                    className="px-3 py-1 bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded text-[11.5px] font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>تطبيق التكلفة</span>
                  </button>
                </div>
              </div>
            )}

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
                        <span>تنبيه: سعر البيع أقل من التكلفة (هتبيع بخسارة!)</span>
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
                    <span>مكسب القطعة: 0.00 ج.م (رأس برأس من غير مكسب)</span>
                    <span>سعر البيع نفس سعر الشراء بالظبط</span>
                  </div>
                );
              }

              return (
                <div className="p-2.5 rounded bg-brand-soft/80 border border-brand/20 text-brand flex flex-col gap-1 text-[11.5px]">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-brand shrink-0" />
                      <span>{unit === 'kg' ? 'المكسب الصافي للكيلو:' : 'المكسب الصافي للقطعة:'}</span>
                    </span>
                    <span className="font-mono text-[12px] font-bold">
                      +{formatArabicCurrency(profitPiasters)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-brand/80">
                    <span>نسبة الزيادة على التكلفة (Markup): +{markupPercent.toFixed(1)}%</span>
                    <span>هامش الربح من البيع (Margin): {marginPercent.toFixed(1)}%</span>
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
                    <p className="text-[11px] font-normal text-ink-muted mt-0.5">متأكد إنك عاوز تكمل وتحفظ الصنف بسعر بيع فيه خسارة للمحل؟</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-500/20">
                  <button
                    type="button"
                    onClick={() => setBelowCostWarning(null)}
                    className="px-2.5 h-6 bg-surface hover:bg-surface-2 border border-line rounded text-[11px] font-semibold text-ink transition-colors"
                  >
                    تعديل الأسعار والتكلفة
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(undefined, false, true)}
                    className="px-2.5 h-6 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold transition-colors shadow-xs"
                  >
                    أيوه، احفظ الصنف بالخسارة عادي
                  </button>
                </div>
              </div>
            )}


            {/* Tax & ETA E-Invoicing Readiness (Feature #6) */}
            <div className="grid grid-cols-3 gap-3 bg-canvas/60 p-2.5 rounded border border-line">
              <div>
                <label className="block text-ink font-semibold mb-1 text-[11px]">نسبة الضريبة (%)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={taxRatePercent}
                    onChange={(e) => setTaxRatePercent(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
                    placeholder="0"
                    className="w-full bg-surface border border-line rounded h-[34px] px-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-mono pl-7"
                  />
                  <Percent className="w-3.5 h-3.5 text-ink-muted absolute left-2 pointer-events-none" />
                </div>
                <p className="text-[9.5px] text-ink-muted mt-0.5 leading-tight">اكتب 0 لو الصنف معفي من الضريبة</p>
              </div>

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
                  كود الفاتورة الإلكترونية (GS1 / EGS)
                </label>
                <input
                  type="text"
                  placeholder="اختياري - لمنظومة الضرائب"
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
              <span>{editingId ? 'حفظ التعديلات' : 'حفظ الصنف في المحل'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
