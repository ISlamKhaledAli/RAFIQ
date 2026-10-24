import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Coins,
  Layers,
  Calendar,
  Calculator,
  Receipt,
  Snowflake,
  Pill,
  Plus,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import type { Category, Product, ProductUnit, StorageLocation } from '../../types/models';
import type {
  ProductPharmaInfo,
  PharmaDosageForm,
  PharmaManufacturer,
  TherapeuticClass,
  ActiveIngredient,
} from '../../types/pharma';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import { ProductUnitsEditor } from '../../components/ProductUnitsEditor';
import { useFeatures } from '../../context/useFeatures';
import { useModalDismiss } from '../../hooks/useModalDismiss';

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
  isLooseSellable?: boolean;
  setIsLooseSellable?: (v: boolean) => void;
  defaultSaleUnitId?: string | null;
  setDefaultSaleUnitId?: (v: string | null) => void;
  defaultPurchaseUnitId?: string | null;
  setDefaultPurchaseUnitId?: (v: string | null) => void;
  editingProduct?: Product | null;
  locationId?: string;
  setLocationId?: (v: string) => void;
  isColdChain?: boolean;
  setIsColdChain?: (v: boolean) => void;
  storageLocations?: StorageLocation[];
  onOpenStorageLocationsModal?: () => void;
  pharmaInfo?: ProductPharmaInfo;
  setPharmaInfo?: React.Dispatch<React.SetStateAction<ProductPharmaInfo>>;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  editingId,
  name,
  setName,
  onOpenVariantMatrix,
  pharmaInfo,
  setPharmaInfo,
  variantSize = '',
  setVariantSize,
  variantColor = '',
  setVariantColor,
  initialExpiryDate = '',
  setInitialExpiryDate,
  initialBatchNumber = '',
  setInitialBatchNumber,
  isLooseSellable,
  setIsLooseSellable,
  defaultSaleUnitId,
  setDefaultSaleUnitId,
  defaultPurchaseUnitId: _defaultPurchaseUnitId,
  setDefaultPurchaseUnitId,
  editingProduct,
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
  locationId = '',
  setLocationId,
  isColdChain = false,
  setIsColdChain,
  storageLocations = [],
  onOpenStorageLocationsModal,
}) => {
  // Detected package if defined in product units
  const detectedPackage = productUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);
  const packName = detectedPackage ? detectedPackage.unitName : 'كرتونة';

  // Dynamic Carton Calculator state: allow empty string and 0
  const [packSizeInput, setPackSizeInput] = useState<string>('');
  const [cartonsInput, setCartonsInput] = useState<string>('');
  const [looseInput, setLooseInput] = useState<string>('');
  const [showVariantFields, setShowVariantFields] = useState<boolean>(false);

  // Synchronize on modal open or editingId change
  useEffect(() => {
    if (!isOpen) return;

    if (!editingId) {
      setShowVariantFields(false);
    }

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

  // Story 130: Pharmacy Module State
  const [dosageForms, setDosageForms] = useState<PharmaDosageForm[]>([]);
  const [manufacturers, setManufacturers] = useState<PharmaManufacturer[]>([]);
  const [therapeuticClasses, setTherapeuticClasses] = useState<TherapeuticClass[]>([]);
  const [_activeIngredientsList, setActiveIngredientsList] = useState<ActiveIngredient[]>([]);
  const [isPharmaSectionOpen, setIsPharmaSectionOpen] = useState(true);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [newIngredientStrength, setNewIngredientStrength] = useState('500');
  const [newIngredientUnit, setNewIngredientUnit] = useState('mg');
  const [newIngredientIsPrimary, setNewIngredientIsPrimary] = useState(false);

  useEffect(() => {
    if (isOpen && isEnabled('feature_pharmacy')) {
      void invoke<PharmaDosageForm[]>('pharma:getDosageForms').then((res) => setDosageForms(res || []));
      void invoke<PharmaManufacturer[]>('pharma:getManufacturers').then((res) => setManufacturers(res || []));
      void invoke<TherapeuticClass[]>('pharma:getTherapeuticClasses').then((res) => setTherapeuticClasses(res || []));
      void invoke<ActiveIngredient[]>('pharma:getActiveIngredients').then((res) => setActiveIngredientsList(res || []));
    }
  }, [isOpen, isEnabled]);

  const handleAddIngredient = () => {
    if (!newIngredientName.trim() || !setPharmaInfo) return;
    const strNum = parseFloat(newIngredientStrength) || 0;
    const newIng = {
      ingredientId: `ing_${Date.now()}`,
      ingredientName: newIngredientName.trim(),
      strengthMilli: Math.round(strNum * 1000),
      strengthUnit: newIngredientUnit,
      isPrimary: newIngredientIsPrimary || (pharmaInfo?.ingredients?.length === 0),
    };
    setPharmaInfo((prev) => ({
      ...prev,
      ingredients: [...(prev.ingredients || []), newIng],
    }));
    setNewIngredientName('');
    setNewIngredientStrength('500');
    setNewIngredientIsPrimary(false);
  };

  const handleRemoveIngredient = (idx: number) => {
    if (!setPharmaInfo) return;
    setPharmaInfo((prev) => ({
      ...prev,
      ingredients: (prev.ingredients || []).filter((_, i) => i !== idx),
    }));
  };

  const dosageOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'اختر الشكل الدوائي...' },
      ...dosageForms.map((d) => ({ value: d.id, label: d.nameAr })),
    ];
  }, [dosageForms]);

  const manufacturerOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'اختر الشركة المصنعة...' },
      ...manufacturers.map((m) => ({ value: m.id, label: m.nameAr })),
    ];
  }, [manufacturers]);

  const therapeuticOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'اختر المجموعة العلاجية...' },
      ...therapeuticClasses.map((t) => ({ value: t.id, label: `${t.nameAr}${t.code ? ` (${t.code})` : ''}` })),
    ];
  }, [therapeuticClasses]);

  const routeOptions: SelectOption[] = [
    { value: 'oral', label: 'فموي (Oral)' },
    { value: 'topical', label: 'موضعي (Topical)' },
    { value: 'parenteral', label: 'حقن عضل / وريد (Parenteral)' },
    { value: 'ophthalmic', label: 'قطرة عين / أذن (Drops)' },
    { value: 'inhalation', label: 'استنشاق (Inhalation)' },
    { value: 'rectal', label: 'لبوس / شرجي (Rectal)' },
  ];

  const pregnancyOptions: SelectOption[] = [
    { value: '', label: 'غير محدد' },
    { value: 'A', label: 'فئة A (آمن تماماً)' },
    { value: 'B', label: 'فئة B (آمن إلى حد كبير)' },
    { value: 'C', label: 'فئة C (بحذر وإشراف طبي)' },
    { value: 'D', label: 'فئة D (مخاطر محتملة للضرورة)' },
    { value: 'X', label: 'فئة X (محظور وممنوع للحامل)' },
  ];

  const strengthUnitOptions: SelectOption[] = [
    { value: 'mg', label: 'ملجم (mg)' },
    { value: 'mcg', label: 'ميكروجرام (mcg)' },
    { value: 'g', label: 'جرام (g)' },
    { value: 'ml', label: 'مل (ml)' },
    { value: 'IU', label: 'وحدة دولية (IU)' },
    { value: '%', label: 'نسبة مئوية (%)' },
  ];

  const rxStatusOptions: SelectOption[] = [
    { value: 'otc', label: 'دواء متاح بدون وصفة (OTC)' },
    { value: 'rx', label: 'يتطلب وصفة طبية (Rx)' },
    { value: 'controlled', label: 'دواء جدول ورقابة مشددة (Controlled)' },
  ];

  const controlledScheduleOptions: SelectOption[] = [
    { value: 'none', label: 'عادي (غير خاضع للجدول)' },
    { value: 'schedule_1', label: 'جدول أول (مواد مخدرة وتأثير عقلي شديد)' },
    { value: 'schedule_2', label: 'جدول ثانٍ (مهدئات وأدوية نفسية خاضعة للرقابة)' },
    { value: 'schedule_3', label: 'جدول ثالث (أدوية مؤثرة على الحالة النفسية)' },
    { value: 'narcotic', label: 'تخدير ورقابة مشددة' },
    { value: 'sedative', label: 'مهدئات خاضعة للتسجيل' },
  ];

  const isDirty = useMemo(() => {
    if (editingId) {
      return Boolean(name.trim() || barcode.trim() || pricePiasters > 0);
    }
    return Boolean(
      name.trim() ||
      barcode.trim() ||
      pricePiasters > 0 ||
      costPiasters > 0 ||
      (stockInput && stockInput !== '0') ||
      productUnits.length > 0 ||
      additionalBarcodes.length > 0
    );
  }, [editingId, name, barcode, pricePiasters, costPiasters, stockInput, productUnits.length, additionalBarcodes.length]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل تعديلات الصنف؟',
    confirmMessage: 'هناك بيانات أو تعديلات غير محفوظة على هذا الصنف، هل أنت متأكد من الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة التعديل',
  });

  const formBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError && formBodyRef.current) {
      formBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [formError]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-ink/40 dark:bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-3xl max-h-[92vh] bg-surface dark:bg-surface-dark rounded-xl border border-brand/50 dark:border-brand/40 shadow-2xl overflow-hidden flex flex-col select-none animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header (Fixed at top) */}
        <div className="h-[48px] bg-surface-2 dark:bg-surface-dark-2 hairline-b border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-brand dark:text-brand-bright" />
            <h3 className="text-[14px] font-bold text-ink dark:text-ink-dark m-0">
              {editingId ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد لبضاعة المحل'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={onOpenPriceHistory}
                className="mr-2 px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-soft/20 hover:bg-brand/20 border border-brand/20 text-brand dark:text-brand-bright text-[11px] font-bold flex items-center gap-1 transition-colors"
                title="عرض تاريخ وتعديلات أسعار هذا الصنف"
              >
                <History className="w-3 h-3" />
                <span>سجل وتاريخ الأسعار</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright p-1 rounded transition-colors"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={(e) => onSave(e)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div ref={formBodyRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 text-[12px]">
            {formError && (
              <div className="p-2.5 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright flex items-center gap-2 text-[12px] font-bold animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {similarWarning && (
              <div className="p-3 rounded bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright flex flex-col gap-2 text-[12px]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{similarWarning}</span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-warn/20 dark:border-warn-bright/30">
                  <button
                    type="button"
                    onClick={() => setSimilarWarning(null)}
                    className="px-2.5 py-1 bg-white dark:bg-surface-dark hover:bg-surface dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded text-[11px] font-bold transition-colors"
                  >
                    تعديل اسم الصنف
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(undefined, true)}
                    className="px-3 py-1 bg-warn hover:bg-warn-dark text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                  >
                    <span>عادي، احفظ الصنف برضه</span>
                  </button>
                </div>
              </div>
            )}

            {/* Matrix Variants Quick Action (Feature #114) */}
            {!editingId && onOpenVariantMatrix && isEnabled('feature_matrix_variants') && (
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 text-purple-950 dark:text-purple-200 font-bold">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-purple-700 dark:text-purple-300" />
                  </div>
                  <div>
                    <div className="text-purple-950 dark:text-purple-200">هل الصنف ده فيه منه مقاسات وألوان مختلفة (زي الهدوم والأحذية)؟</div>
                    <div className="text-[11px] text-purple-700 dark:text-purple-400 font-normal">اعمل مصفوفة سريعة (مقاس × لون) بباركود وسعر ورصيد لكل خيار بدفعة واحدة</div>
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
              <label className="block text-ink dark:text-ink-dark font-semibold mb-1">اسم الصنف *</label>
              <input
                type="text"
                placeholder="مثلاً: شاي العروسة 250 جم"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[38px] px-3 text-[13px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-sans"
                autoFocus
              />
            </div>

            {/* Primary Barcode with Auto-Generate button */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-ink dark:text-ink-dark font-semibold">الباركود الرئيسي</label>
                <button
                  type="button"
                  onClick={onGenerateInternalBarcode}
                  className="text-[11px] text-brand dark:text-brand-bright hover:underline font-semibold flex items-center gap-1"
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
                className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[38px] px-3 text-[13px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
              />
            </div>

            {/* Multiple Additional Barcodes Editor (Feature #15 / Task 15-3) */}
            <div className="p-3 bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark rounded flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink dark:text-ink-dark">
                <span>باركودات إضافية لنفس الصنف (تسهيل الضرب بالقارئ):</span>
                <span className="text-[10.5px] text-ink-muted dark:text-ink-dark-muted font-mono font-normal">
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
                  className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-3 text-[12px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                />
                <button
                  type="button"
                  onClick={onAddBarcode}
                  disabled={!newBarcodeInput.trim()}
                  className="px-3 h-[34px] bg-brand hover:bg-brand-hover dark:hover:bg-emerald-700 disabled:bg-surface dark:disabled:bg-surface-dark disabled:text-ink-muted dark:disabled:text-ink-dark-muted text-white rounded text-[11.5px] font-bold transition-colors shadow-xs"
                >
                  إضافة كود
                </button>
              </div>

              {additionalBarcodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                  {additionalBarcodes.map((bc, idx) => (
                    <span
                      key={bc}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded text-[11px] font-mono text-ink dark:text-ink-dark shadow-xs"
                    >
                      <Barcode className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                      <span>{bc}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveBarcode(idx)}
                        className="text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft rounded p-0.5 cursor-pointer"
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
                <label className="block text-ink dark:text-ink-dark font-semibold">قسم وتصنيف الصنف</label>
                <button
                  type="button"
                  onClick={onOpenCategoryModal}
                  className="text-[11px] text-brand dark:text-brand-bright hover:underline font-semibold flex items-center gap-1"
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

            {/* Storage Location & Cold Chain (Feature #185 / Tasks 185-3) */}
            {(isEnabled('feature_shelf_locations') || Boolean(locationId || isColdChain)) && (
              <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 text-ink dark:text-ink-dark font-semibold text-[13px]">
                    <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>موقع التخزين والرف وسلسلة التبريد</span>
                  </div>
                  {onOpenStorageLocationsModal && (
                    <button
                      type="button"
                      onClick={onOpenStorageLocationsModal}
                      className="text-[11px] text-brand dark:text-brand-bright hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Boxes className="w-3.5 h-3.5" />
                      <span>إدارة الرفوف والمواقع</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink-muted dark:text-ink-dark-muted text-[11.5px] font-medium mb-1">
                      الرف / الدرج / الموقع
                    </label>
                    <CustomSelect
                      value={locationId || ''}
                      onChange={(val) => {
                        if (setLocationId) setLocationId(val);
                        // If selecting a fridge location, auto-suggest cold chain
                        const selectedLoc = storageLocations?.find(l => l.id === val);
                        if (selectedLoc && selectedLoc.type === 'fridge' && setIsColdChain) {
                          setIsColdChain(true);
                        }
                      }}
                      options={[
                        { value: '', label: 'بدون موقع محدد' },
                        ...(storageLocations || []).map((loc) => ({
                          value: loc.id,
                          label: `${loc.code} - ${loc.name} (${
                            loc.type === 'shelf' ? 'رف' :
                            loc.type === 'rack' ? 'استاند' :
                            loc.type === 'drawer' ? 'درج' :
                            loc.type === 'fridge' ? 'ثلاجة' : 'مستودع'
                          })`
                        }))
                      ]}
                      size="md"
                      searchable
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2.5 p-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded cursor-pointer select-none hover:border-brand transition-colors">
                      <input
                        type="checkbox"
                        checked={Boolean(isColdChain)}
                        onChange={(e) => setIsColdChain && setIsColdChain(e.target.checked)}
                        className="rounded border-line text-brand focus:ring-brand w-4 h-4"
                      />
                      <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink dark:text-ink-dark">
                        <Snowflake className={`w-4 h-4 ${isColdChain ? 'text-cyan-600 dark:text-cyan-400' : 'text-ink-muted'}`} />
                        <span>يتطلب سلسلة تبريد (ثلاجة 2-8 مئوية)</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Unit Selection: Piece vs Weight (Feature #19 / Tasks 19-1 & 19-2) */}
            {(isEnabled('feature_scale_weight') || unit === 'kg') && (
              <div>
                <label className="block text-ink dark:text-ink-dark font-semibold mb-1">طريقة بيع الصنف (الوحدة) *</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark">
                  <button
                    type="button"
                    onClick={() => {
                      setUnit('piece');
                      setProductUnits(productUnits.map(u => u.isBaseUnit ? { ...u, unitName: 'قطعة', isDivisible: false } : u));
                    }}
                    className={`py-1.5 px-3 rounded text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      unit === 'piece'
                        ? 'bg-brand dark:bg-brand text-white shadow-xs'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
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
                    className={`py-1.5 px-3 rounded text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      unit === 'kg'
                        ? 'bg-brand dark:bg-brand text-white shadow-xs'
                        : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>بالوزن / ميزان (كيلوجرام)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Variant Attributes: Size & Color (Feature #114) */}
            {(isEnabled('feature_matrix_variants') || Boolean(variantSize || variantColor) || showVariantFields) ? (
              <div className="p-3 bg-brand-soft/60 dark:bg-brand-soft/10 border border-brand/20 dark:border-brand/30 rounded-lg flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-brand-dark dark:text-brand-bright font-bold text-[12px]">
                    <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>المقاس واللون (اختياري)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!editingId && onOpenVariantMatrix && isEnabled('feature_matrix_variants') && (
                      <button
                        type="button"
                        onClick={onOpenVariantMatrix}
                        className="text-[11px] text-brand dark:text-brand-bright hover:text-brand-dark dark:hover:text-emerald-300 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>عمل مصفوفة سريعة (مقاس × لون)</span>
                      </button>
                    )}
                    {!isEnabled('feature_matrix_variants') && !variantSize && !variantColor && showVariantFields && (
                      <button
                        type="button"
                        onClick={() => setShowVariantFields(false)}
                        className="text-[11px] text-ink-muted hover:text-danger font-medium hover:underline cursor-pointer"
                      >
                        إلغاء وإخفاء
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">المقاس</label>
                    <input
                      type="text"
                      placeholder="مثلاً: 1.2 متر أو 6.7 بوصة أو L"
                      value={variantSize}
                      onChange={(e) => setVariantSize?.(e.target.value)}
                      className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[36px] px-3 text-[12px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">اللون</label>
                    <input
                      type="text"
                      placeholder="مثلاً: أبيض أو أسود أو كحلي"
                      value={variantColor}
                      onChange={(e) => setVariantColor?.(e.target.value)}
                      className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[36px] px-3 text-[12px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setShowVariantFields(true)}
                  className="text-[11px] font-bold text-brand dark:text-brand-bright hover:text-brand-dark dark:hover:text-emerald-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-soft/50 hover:bg-brand-soft transition-all cursor-pointer border border-brand/20 shadow-2xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>+ إضافة مقاس أو لون لهذا الصنف (اختياري للإكسسوارات والجرابات)</span>
                </button>
              </div>
            )}

            {/* Selling Price & Cost in Piasters */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-ink dark:text-ink-dark font-semibold mb-1">
                  {unit === 'kg' ? 'سعر بيع الكيلو للزبون *' : 'سعر البيع للزبون (للقطعة) *'}
                </label>
                <MoneyInput
                  valuePiasters={pricePiasters}
                  onChangePiasters={setPricePiasters}
                  className="h-[38px] text-[13px] font-bold text-brand dark:text-brand-bright"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-ink dark:text-ink-dark font-semibold">
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
                        ? 'bg-brand dark:bg-brand text-white border-brand shadow-xs'
                        : 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright hover:bg-brand/15 border-brand/20 dark:border-brand/30'
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
              <div className="p-3 bg-brand-soft/60 dark:bg-brand-soft/10 border border-brand/30 dark:border-brand/40 rounded-lg flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between border-b border-brand/15 dark:border-brand/30 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span className="text-[12px] font-bold text-ink dark:text-ink-dark">حاسبة تكلفة الشراء من الشركات والموردين:</span>
                  </div>
                  <div className="flex items-center gap-1 bg-surface dark:bg-surface-dark p-0.5 rounded-md border border-line dark:border-line-dark">
                    <button
                      type="button"
                      onClick={() => setCostCalcMode('carton')}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        costCalcMode === 'carton'
                          ? 'bg-brand dark:bg-brand text-white shadow-xs'
                          : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
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
                          ? 'bg-brand dark:bg-brand text-white shadow-xs'
                          : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
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
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                        سعر شراء الكرتونة بالكامل من المورد:
                      </label>
                      <MoneyInput
                        valuePiasters={calcCartonPricePiasters}
                        onChangePiasters={setCalcCartonPricePiasters}
                        placeholder="0.00"
                        className="h-[34px] text-[12.5px] bg-white dark:bg-surface-dark"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                        سعة الكرتونة (فيها كام قطعة):
                      </label>
                      <input
                        type="text"
                        value={calcCartonCapacity}
                        onChange={(e) => setCalcCartonCapacity(normalizeArabicNumerals(e.target.value))}
                        placeholder={packSizeNum > 0 ? String(packSizeNum) : 'مثلاً: 24'}
                        className="w-full bg-white dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-3 text-[12.5px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                    <div>
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                        إجمالي المبلغ المدفوع في فاتورة المورد:
                      </label>
                      <MoneyInput
                        valuePiasters={calcInvoiceTotalPiasters}
                        onChangePiasters={setCalcInvoiceTotalPiasters}
                        placeholder="0.00"
                        className="h-[34px] text-[12.5px] bg-white dark:bg-surface-dark"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                        {unit === 'kg' ? 'إجمالي الوزن المستلم (كجم):' : 'إجمالي عدد القطع المستلمة في الفاتورة:'}
                      </label>
                      <input
                        type="text"
                        value={calcInvoiceQty}
                        onChange={(e) => setCalcInvoiceQty(normalizeArabicNumerals(e.target.value))}
                        placeholder={stockInput ? stockInput : 'مثلاً: 50'}
                        className="w-full bg-white dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-3 text-[12.5px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                      />
                    </div>
                  </div>
                )}

                {/* Calculation Result Action Bar */}
                <div className="flex items-center justify-between bg-white dark:bg-surface-dark p-2 rounded-md border border-brand/20 dark:border-brand/30 mt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">تكلفة القطعة المحسوبة:</span>
                    <span className="font-mono text-[13px] font-extrabold text-brand dark:text-brand-bright">
                      {formatArabicCurrency(activeCalculatedCost)}
                    </span>
                    {activeCalculatedCost > 0 && costCalcMode === 'carton' && cartonCapNum > 0 && (
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">
                        ({formatArabicCurrency(calcCartonPricePiasters)} ÷ {cartonCapNum} قطعة)
                      </span>
                    )}
                    {activeCalculatedCost > 0 && costCalcMode === 'invoice' && invoiceQtyNum > 0 && (
                      <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">
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
                    className="px-3 py-1 bg-brand hover:bg-brand-hover dark:hover:bg-emerald-700 disabled:bg-surface-2 dark:disabled:bg-surface-dark-2 disabled:text-ink-muted dark:disabled:text-ink-dark-muted text-white rounded text-[11.5px] font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
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
                  <div className="p-2.5 rounded bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright flex flex-col gap-1 text-[11.5px]">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-danger dark:text-danger-bright shrink-0" />
                        <span>تنبيه: سعر البيع أقل من التكلفة (هتبيع بخسارة!)</span>
                      </span>
                      <span className="font-mono text-[12px]">
                        -{formatArabicCurrency(Math.abs(profitPiasters))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10.5px] text-danger/80 dark:text-danger-bright/90">
                      <span>نسبة الخسارة من التكلفة: -{Math.abs(markupPercent).toFixed(1)}%</span>
                      <span>تكلفة: {formatArabicCurrency(costPiasters)} | بيع: {formatArabicCurrency(pricePiasters)}</span>
                    </div>
                  </div>
                );
              }

              if (isBreakEven) {
                return (
                  <div className="p-2 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-[11px] flex items-center justify-between font-mono">
                    <span>مكسب القطعة: 0.00 ج.م (رأس برأس من غير مكسب)</span>
                    <span>سعر البيع نفس سعر الشراء بالظبط</span>
                  </div>
                );
              }

              return (
                <div className="p-2.5 rounded bg-brand-soft/80 dark:bg-brand-soft/20 border border-brand/20 dark:border-brand/30 text-brand dark:text-brand-bright flex flex-col gap-1 text-[11.5px]">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                      <span>{unit === 'kg' ? 'المكسب الصافي للكيلو:' : 'المكسب الصافي للقطعة:'}</span>
                    </span>
                    <span className="font-mono text-[12px] font-bold">
                      +{formatArabicCurrency(profitPiasters)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-brand/80 dark:text-brand-bright/80">
                    <span>نسبة الزيادة على التكلفة (Markup): +{markupPercent.toFixed(1)}%</span>
                    <span>هامش الربح من البيع (Margin): {marginPercent.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })()}

            {/* Below Cost Warning Modal / Prompt if Loss Detected (Task 17-1) */}
            {belowCostWarning && (
              <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded text-warn dark:text-warn-bright flex flex-col gap-2">
                <div className="flex items-start gap-2 text-[11.5px] font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-warn dark:text-warn-bright mt-0.5" />
                  <div>
                    <p>سعر البيع ({formatArabicCurrency(belowCostWarning.pricePiasters)}) أقل من سعر التكلفة ({formatArabicCurrency(belowCostWarning.costPiasters)}).</p>
                    <p className="text-[11px] font-normal text-ink-muted dark:text-ink-dark-muted mt-0.5">متأكد إنك عاوز تكمل وتحفظ الصنف بسعر بيع فيه خسارة للمحل؟</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-warn/20 dark:border-warn-bright/30">
                  <button
                    type="button"
                    onClick={() => setBelowCostWarning(null)}
                    className="px-2.5 h-6 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark rounded text-[11px] font-semibold text-ink dark:text-ink-dark transition-colors"
                  >
                    تعديل الأسعار والتكلفة
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(undefined, false, true)}
                    className="px-2.5 h-6 bg-warn hover:bg-warn-dark text-white rounded text-[11px] font-bold transition-colors shadow-xs cursor-pointer"
                  >
                    أيوه، احفظ الصنف بالخسارة عادي
                  </button>
                </div>
              </div>
            )}

            {/* Multi-Units Management (Feature #161 / Tasks 161-1 to 161-4 & 161-13 to 161-15 & Feature #183) */}
            <div className="shrink-0 w-full">
              <ProductUnitsEditor
                units={productUnits}
                product={editingProduct}
                isLooseSellable={isLooseSellable}
                defaultSaleUnitId={defaultSaleUnitId}
                onChange={(newUnits) => {
                  setProductUnits(newUnits);
                  if (newUnits.length <= 1) {
                    const base = newUnits.find(u => u.isBaseUnit);
                    if (base) {
                      if (base.sellPricePiasters !== pricePiasters) setPricePiasters(base.sellPricePiasters);
                      if (base.costPricePiasters !== costPiasters) setCostPiasters(base.costPricePiasters);
                    }
                  }
                }}
                onPackagingConfigChange={(cfg) => {
                  setIsLooseSellable?.(cfg.isLooseSellable);
                  setDefaultSaleUnitId?.(cfg.defaultSaleUnitId);
                  setDefaultPurchaseUnitId?.(cfg.defaultPurchaseUnitId);
                  if (editingProduct) {
                    editingProduct.isLooseSellable = cfg.isLooseSellable;
                    editingProduct.defaultSaleUnitId = cfg.defaultSaleUnitId;
                    editingProduct.defaultPurchaseUnitId = cfg.defaultPurchaseUnitId;
                  }
                }}
                basePricePiasters={pricePiasters}
                baseCostPiasters={costPiasters}
                baseUnitName={unit === 'kg' ? 'كيلو' : 'قطعة'}
                isWeightItem={unit === 'kg'}
                primaryBarcode={barcode}
              />
            </div>

            {/* Integrated Dynamic Packaging & Stock Quantity Engine */}
            <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border-2 border-brand/30 dark:border-brand/40 rounded-lg flex flex-col gap-3 shadow-2xs">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span className="text-[13px] font-bold text-ink dark:text-ink-dark">رصيد المخزن وجرد الكراتين *</span>
                  <span className="px-1.5 py-0.5 bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright border border-brand/20 rounded text-[10px] font-bold">
                    حساب فوري ولحظي
                  </span>
                </div>
                {unit === 'piece' && (
                  packSizeNum > 0 ? (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-brand dark:text-brand-bright bg-white dark:bg-surface-dark px-2 py-0.5 rounded-md border border-brand/20 shadow-2xs">
                      <Package className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                      <span>العبوة: {packName} ({packSizeNum} قطعة)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted bg-white dark:bg-surface-dark px-2 py-0.5 rounded-md border border-line dark:border-line-dark shadow-2xs">
                      <Package className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted" />
                      <span>قطع فرط فرداني (من غير كراتين)</span>
                    </div>
                  )
                )}
              </div>

              {/* Dynamic Equation Inputs for Pieces or Weight */}
              {unit === 'piece' ? (
                <>
                  {/* Dynamic 4-Box Mathematical Calculation Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center bg-white dark:bg-surface-dark p-2.5 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                    {/* Cartons */}
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                        عدد الكراتين ({packName}):
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cartonsInput}
                        onChange={(e) => handleCartonsChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-[36px] px-2 text-[13px] font-mono text-center font-bold text-brand dark:text-brand-bright focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                      />
                    </div>

                    {/* Loose pieces */}
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                        قطع فرط فردانية:
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={looseInput}
                        onChange={(e) => handleLoosePiecesChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-[36px] px-2 text-[13px] font-mono text-center font-bold text-brand dark:text-brand-bright focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                      />
                    </div>

                    {/* Equals sign symbol */}
                    <div className="hidden sm:flex items-center justify-center font-extrabold text-ink-muted text-lg pt-4">
                      =
                    </div>

                    {/* Calculated Total Stock Result Field */}
                    <div className="flex-1">
                      <label className="block text-[11px] font-extrabold text-brand dark:text-brand-bright mb-1">
                        إجمالي الرصيد (بالقطعة):
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={stockInput}
                          onChange={(e) => handleDirectStockChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-full bg-brand-soft dark:bg-brand-soft/20 border-2 border-brand dark:border-brand-bright rounded h-[36px] pr-5 pl-2 text-[13px] font-mono text-center font-extrabold text-brand dark:text-brand-bright focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Min Stock Reorder Alert Input */}
                  <div className="flex items-center gap-2 bg-white dark:bg-surface-dark px-3 py-2 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                    <label className="text-[11.5px] font-semibold text-ink dark:text-ink-dark shrink-0">
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
                      className="w-32 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-[30px] px-2 text-[12px] font-mono text-center text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                    />
                    <span className="text-[10.5px] text-ink-muted dark:text-ink-dark-muted">النظام هينبهك تلقائياً أول ما الرصيد يقل عن كده عشان تطلب بضاعة من الموردين</span>
                  </div>

                  {/* Dynamic Equation Live Breakdown Banner */}
                  <div className="p-2.5 bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand/30 rounded-md text-brand dark:text-brand-bright text-[11.5px] font-bold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                      <span>
                        {packSizeNum > 0 && cartonsNum > 0 ? (
                          <>
                            الناتج المحسوب: {cartonsNum} {packName} × {packSizeNum} قطعة
                            {looseNum > 0 ? ` + ${looseNum} فرط` : ''}
                            {' = '}
                            {totalStockNum} قطعة رصيد فعلي في المحل
                          </>
                        ) : totalStockNum > 0 ? (
                          <>
                            الناتج المحسوب: {totalStockNum} قطعة رصيد فعلي في المحل (بيع بالقطعة الفردية)
                          </>
                        ) : (
                          <>الرصيد الفعلي في المحل: 0 قطعة</>
                        )}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] bg-white dark:bg-surface-dark text-brand dark:text-brand-bright px-2 py-0.5 rounded border border-brand/20 dark:border-brand/30">
                      {totalStockNum} قطعة
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {/* Weight Mode (kg) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-ink dark:text-ink-dark font-semibold mb-1 text-[12px]">
                        الرصيد الفعلي المتوفر (كجم) *
                      </label>
                      <input
                        type="text"
                        value={stockInput}
                        onChange={(e) => setStockInput(normalizeArabicNumerals(e.target.value))}
                        placeholder="مثلاً: 12.5 كجم"
                        className="w-full bg-white dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[38px] px-3 text-[13px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono font-bold"
                      />
                      <p className="text-[10.5px] text-ink-muted dark:text-ink-dark-muted mt-1 leading-tight">الوزن الإجمالي المتوفر حالياً على الرف أو في المحل</p>
                    </div>

                    <div>
                      <label className="block text-ink dark:text-ink-dark font-semibold mb-1 text-[12px]">
                        حد تنبيه النواقص (كجم)
                      </label>
                      <input
                        type="text"
                        value={minStockInput}
                        onChange={(e) => setMinStockInput(normalizeArabicNumerals(e.target.value))}
                        placeholder="تنبيه عند: 5 كجم"
                        className="w-full bg-white dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[38px] px-3 text-[13px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                      />
                      <p className="text-[10.5px] text-ink-muted dark:text-ink-dark-muted mt-1 leading-tight">النظام هينبهك تلقائياً أول ما الوزن يقل عن كده عشان تشتري بضاعة</p>
                    </div>
                  </div>
                </>
              )}

              {/* Live Inventory Valuation (Capital invested in this item) */}
              {parseFloat(stockInput) > 0 && costPiasters > 0 && (
                <div className="px-2.5 py-1.5 bg-white dark:bg-surface-dark border border-brand/20 dark:border-brand/30 rounded text-[11px] text-ink-muted dark:text-ink-dark-muted flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>إجمالي فلوس البضاعة المركونة في المخزن (بسعر التكلفة):</span>
                  </div>
                  <span className="font-mono font-bold text-brand dark:text-brand-bright text-[12px]">
                    {formatArabicCurrency(Math.round(parseFloat(stockInput) * costPiasters))}
                  </span>
                </div>
              )}
            </div>

            {/* Expiry Date & Batch for Initial Stock (Feature #60) */}
            {isEnabled('feature_expiry_dates') && (
              <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-lg flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-warn dark:text-warn-bright font-bold text-[12px]">
                    <Calendar className="w-4 h-4 text-warn dark:text-warn-bright" />
                    <span>تاريخ الصلاحية ورقم الشحنة (اختياري)</span>
                  </div>
                  <span className="text-[10px] text-warn dark:text-warn-bright font-medium">تسجيل تلقائي لرصيد أول المدة بالمخزن</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">تاريخ انتهاء الصلاحية</label>
                    <CustomDatePicker
                      value={initialExpiryDate || ''}
                      onChange={(val) => setInitialExpiryDate?.(val)}
                      placeholder="اختر تاريخ الصلاحية"
                      size="md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                      رقم الشحنة أو إذن الاستلام (اختياري)
                    </label>
                    <input
                      type="text"
                      placeholder="مثلاً: شحنة 1 أو رقم الفاتورة (هيتعمل تلقائي لو سبته فاضي)"
                      value={initialBatchNumber}
                      onChange={(e) => setInitialBatchNumber?.(e.target.value)}
                      className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-3 text-[12px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Story 130 / Task 187-2: Pharmacy Extension Card */}
            {isEnabled('feature_pharmacy') && (
              <div className="p-3.5 bg-brand-soft/20 dark:bg-brand-soft/10 border border-brand/30 dark:border-brand-bright/30 rounded-xl flex flex-col gap-3 shadow-2xs">
                <div
                  className="flex items-center justify-between cursor-pointer select-none"
                  onClick={() => setIsPharmaSectionOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2 text-brand dark:text-brand-bright font-bold text-xs">
                    <Pill className="w-4 h-4 text-brand dark:text-brand-bright" />
                    <span>البيانات الدوائية والمواد الفعالة (صيدليات)</span>
                    {pharmaInfo?.scientificName && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand/10 font-mono">
                        {pharmaInfo.scientificName}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="p-1 text-ink-muted hover:text-ink dark:hover:text-ink-dark"
                  >
                    {isPharmaSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isPharmaSectionOpen && (
                  <div className="flex flex-col gap-3 pt-2 border-t border-brand/20 animate-in fade-in duration-150">
                    {/* Scientific Name */}
                    <div>
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                        الاسم العلمي / المادة الأساسية (Generic Name)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={pharmaInfo?.scientificName || ''}
                          onChange={(e) => setPharmaInfo?.((prev) => ({ ...prev, scientificName: e.target.value }))}
                          placeholder="مثلاً: Paracetamol, Amoxicillin, Ibuprofen..."
                          className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-3 pr-8 text-[12px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand shadow-2xs"
                        />
                        <Sparkles className="w-3.5 h-3.5 text-brand absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    {/* Dosage Form & Manufacturer */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                          الشكل الدوائي (Dosage Form)
                        </label>
                        <CustomSelect
                          options={dosageOptions}
                          value={pharmaInfo?.dosageFormId || ''}
                          onChange={(val) => {
                            const found = dosageForms.find((d) => d.id === val);
                            setPharmaInfo?.((prev) => ({
                              ...prev,
                              dosageFormId: val || null,
                              dosageFormName: found ? found.nameAr : null,
                            }));
                          }}
                          size="sm"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                          الشركة المصنعة (Manufacturer)
                        </label>
                        <CustomSelect
                          options={manufacturerOptions}
                          value={pharmaInfo?.manufacturerId || ''}
                          onChange={(val) => {
                            const found = manufacturers.find((m) => m.id === val);
                            setPharmaInfo?.((prev) => ({
                              ...prev,
                              manufacturerId: val || null,
                              manufacturerName: found ? found.nameAr : null,
                            }));
                          }}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Therapeutic Class & Route */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                          المجموعة / التصنيف العلاجي (Therapeutic Class)
                        </label>
                        <CustomSelect
                          options={therapeuticOptions}
                          value={pharmaInfo?.therapeuticClassId || ''}
                          onChange={(val) => {
                            const found = therapeuticClasses.find((t) => t.id === val);
                            setPharmaInfo?.((prev) => ({
                              ...prev,
                              therapeuticClassId: val || null,
                              therapeuticClassName: found ? found.nameAr : null,
                            }));
                          }}
                          size="sm"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                          طريقة الاستخدام (Route)
                        </label>
                        <CustomSelect
                          options={routeOptions}
                          value={pharmaInfo?.routeOfAdministration || 'oral'}
                          onChange={(val) => setPharmaInfo?.((prev) => ({ ...prev, routeOfAdministration: val }))}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Toggles: Rx, Antibiotic, Cold Chain, Pregnancy */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <label className="flex items-center gap-1.5 p-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(pharmaInfo?.isPrescriptionOnly)}
                          onChange={(e) => setPharmaInfo?.((prev) => ({ ...prev, isPrescriptionOnly: e.target.checked }))}
                          className="rounded text-brand focus:ring-brand"
                        />
                        <span className="text-[11px] font-semibold text-ink dark:text-ink-dark">روشتة فقط (Rx)</span>
                      </label>

                      <label className="flex items-center gap-1.5 p-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(pharmaInfo?.isAntibiotic)}
                          onChange={(e) => setPharmaInfo?.((prev) => ({ ...prev, isAntibiotic: e.target.checked }))}
                          className="rounded text-brand focus:ring-brand"
                        />
                        <span className="text-[11px] font-semibold text-ink dark:text-ink-dark">مضاد حيوي</span>
                      </label>

                      <label className="flex items-center gap-1.5 p-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(pharmaInfo?.isRefrigerated)}
                          onChange={(e) => setPharmaInfo?.((prev) => ({ ...prev, isRefrigerated: e.target.checked }))}
                          className="rounded text-brand focus:ring-brand"
                        />
                        <span className="text-[11px] font-semibold text-ink dark:text-ink-dark">يحفظ في الثلاجة</span>
                      </label>

                      <div>
                        <CustomSelect
                          options={pregnancyOptions}
                          value={pharmaInfo?.pregnancyCategory || ''}
                          onChange={(val) => setPharmaInfo?.((prev) => ({ ...prev, pregnancyCategory: val }))}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Story 131: Controlled Drug & Prescription Classification */}
                    <div className="p-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-ink dark:text-ink-dark">
                          <ShieldAlert className="w-3.5 h-3.5 text-warn" />
                          <span>تصنيف الصرف والرقابة والجدول (Controlled Drugs & Rx)</span>
                        </div>
                        {((pharmaInfo?.controlledSchedule && pharmaInfo.controlledSchedule !== 'none') || pharmaInfo?.rxStatus === 'controlled') && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn border border-warn/30 animate-pulse">
                            خاضع للرقابة والتفتيش
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                            نوع الوصفة / الصرف (Rx Status)
                          </label>
                          <CustomSelect
                            options={rxStatusOptions}
                            value={pharmaInfo?.rxStatus || (pharmaInfo?.isPrescriptionOnly ? 'rx' : 'otc')}
                            onChange={(val) => {
                              setPharmaInfo?.((prev) => ({
                                ...prev,
                                rxStatus: val,
                                isPrescriptionOnly: val === 'rx' || val === 'controlled',
                              }));
                            }}
                            size="sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                            جدول المواد المخدرة والمهدئات (Controlled Schedule)
                          </label>
                          <CustomSelect
                            options={controlledScheduleOptions}
                            value={pharmaInfo?.controlledSchedule || 'none'}
                            onChange={(val) => {
                              setPharmaInfo?.((prev) => ({
                                ...prev,
                                controlledSchedule: val,
                                rxStatus: val !== 'none' ? 'controlled' : prev?.rxStatus || 'otc',
                                isPrescriptionOnly: val !== 'none' ? true : prev?.isPrescriptionOnly || false,
                              }));
                            }}
                            size="sm"
                          />
                        </div>
                      </div>

                      {((pharmaInfo?.controlledSchedule && pharmaInfo.controlledSchedule !== 'none') || pharmaInfo?.rxStatus === 'controlled') && (
                        <div className="p-2 rounded-lg bg-warn/10 border border-warn/25 text-[11px] text-warn-dark dark:text-warn flex items-start gap-1.5 leading-relaxed">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-warn mt-0.5" />
                          <span>
                            تنبيه رقابي: عند بيع هذا الصنف في الكاشير، سيتم تسجيل وتوثيق بيانات المريض والطبيب والروشتة إجبارياً في «دفتر أدوية الجدول والتفتيش الصيدلي»، ولن يُسمح بتعليق الفاتورة.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Active Ingredients Sub-Table */}
                    <div className="p-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col gap-2">
                      <div className="text-[11px] font-bold text-ink dark:text-ink-dark flex items-center justify-between">
                        <span>المواد الفعالة وتركيزاتها (Active Ingredients):</span>
                        <span className="text-[10px] text-ink-muted font-mono font-normal">
                          {pharmaInfo?.ingredients?.length || 0} مادة فعالة
                        </span>
                      </div>

                      {/* Add Ingredient Form */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <input
                          type="text"
                          value={newIngredientName}
                          onChange={(e) => setNewIngredientName(e.target.value)}
                          placeholder="اسم المادة الفعالة..."
                          className="flex-1 min-w-[120px] h-8 px-2 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                        />
                        <input
                          type="number"
                          value={newIngredientStrength}
                          onChange={(e) => setNewIngredientStrength(e.target.value)}
                          placeholder="التركيز"
                          className="w-20 h-8 px-2 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs font-mono text-center text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                        />
                        <div className="w-24">
                          <CustomSelect
                            options={strengthUnitOptions}
                            value={newIngredientUnit}
                            onChange={(val) => setNewIngredientUnit(val)}
                            size="sm"
                          />
                        </div>
                        <label className="flex items-center gap-1 text-[10px] text-ink-muted cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={newIngredientIsPrimary}
                            onChange={(e) => setNewIngredientIsPrimary(e.target.checked)}
                            className="rounded text-brand"
                          />
                          <span>رئيسية</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleAddIngredient}
                          className="h-8 px-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>إضافة</span>
                        </button>
                      </div>

                      {/* Ingredients List */}
                      {pharmaInfo?.ingredients && pharmaInfo.ingredients.length > 0 && (
                        <div className="border border-line/60 dark:border-line-dark/60 rounded-lg overflow-hidden mt-1">
                          <table className="w-full text-right text-xs">
                            <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted text-[10.5px]">
                              <tr>
                                <th className="px-2.5 py-1.5">المادة الفعالة</th>
                                <th className="px-2.5 py-1.5 text-center">التركيز</th>
                                <th className="px-2.5 py-1.5 text-center">النوع</th>
                                <th className="px-2.5 py-1.5 text-center w-8"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line/40 dark:divide-line-dark/40">
                              {pharmaInfo.ingredients.map((ing, idx) => (
                                <tr key={ing.ingredientId || idx}>
                                  <td className="px-2.5 py-1.5 font-bold text-ink dark:text-ink-dark font-mono text-[11px]">
                                    {ing.ingredientName}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-center font-mono font-bold text-brand">
                                    {ing.strengthMilli / 1000} {ing.strengthUnit}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-center text-[10px]">
                                    {ing.isPrimary ? (
                                      <span className="px-1.5 py-0.2 rounded bg-brand/10 text-brand font-bold">
                                        رئيسية
                                      </span>
                                    ) : (
                                      <span className="text-ink-muted">إضافية</span>
                                    )}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveIngredient(idx)}
                                      className="p-0.5 text-ink-muted hover:text-danger rounded"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tax & ETA E-Invoicing Readiness (Feature #6) */}
            <div className="grid grid-cols-3 gap-3 bg-canvas/60 dark:bg-canvas-dark/60 p-2.5 rounded border border-line dark:border-line-dark">
              <div>
                <label className="block text-ink dark:text-ink-dark font-semibold mb-1 text-[11px]">نسبة الضريبة (%)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={taxRatePercent}
                    onChange={(e) => setTaxRatePercent(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
                    placeholder="0"
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-2.5 text-[12px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono pl-7"
                  />
                  <Percent className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted absolute left-2 pointer-events-none" />
                </div>
                <p className="text-[9.5px] text-ink-muted dark:text-ink-dark-muted mt-0.5 leading-tight">اكتب 0 لو الصنف معفي من الضريبة</p>
              </div>

              <div>
                <label className="block text-ink-muted dark:text-ink-dark-muted font-semibold mb-1 text-[11px]">
                  كود الصنف الداخلي (SKU)
                </label>
                <input
                  type="text"
                  placeholder="مثال: ITM-00124"
                  value={internalCode}
                  onChange={(e) => setInternalCode(e.target.value)}
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-2.5 text-[12px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                />
              </div>

              <div>
                <label className="block text-ink-muted dark:text-ink-dark-muted font-semibold mb-1 text-[11px]">
                  كود الفاتورة الإلكترونية (GS1 / EGS)
                </label>
                <input
                  type="text"
                  placeholder="اختياري - لمنظومة الضرائب"
                  value={taxCategoryCode}
                  onChange={(e) => setTaxCategoryCode(e.target.value)}
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-2.5 text-[12px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions (Docked and Fixed at bottom) */}
          <div className="h-[52px] bg-surface-2 dark:bg-surface-dark-2 hairline-t border-t border-line dark:border-line-dark px-4 sm:px-5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex-1 min-w-0 pl-2">
              {formError && (
                <div className="text-danger dark:text-danger-bright text-[11.5px] font-bold truncate flex items-center gap-1.5" title={formError}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{formError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void requestClose()}
                className="h-[36px] px-4 bg-surface dark:bg-surface-dark hover:bg-surface-3 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded text-[12px] font-semibold transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={loading}
                className="h-[36px] px-5 bg-brand hover:bg-brand-hover dark:hover:bg-emerald-700 text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'حفظ التعديلات' : 'حفظ الصنف في المحل'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
