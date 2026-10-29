import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Sliders,
  Shirt,
  Smartphone,
  Apple,
  Milk,
  Flame,
  Loader2,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import type { Category, Product, ProductUnit, StorageLocation } from '../../types/models';
import type {
  ProductPharmaInfo,
  PharmaDosageForm,
  PharmaManufacturer,
  TherapeuticClass,
  ActiveIngredient,
  DrugReferenceItem,
} from '../../types/pharma';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import { ProductUnitsEditor } from '../../components/ProductUnitsEditor';
import { useFeatures } from '../../context/useFeatures';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { getStoreTerminology, getCurrentStoreType } from '../../utils/storeTerminology';

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
  setFormError: _setFormError,
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
  const { isEnabled } = useFeatures();

  // Active Store Profile / Template Detection
  const [storeType, setStoreType] = useState<string>(() => {
    try {
      return localStorage.getItem('rafiq_store_type') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (isOpen) {
      void invoke<Record<string, string>>('settings:getAll')
        .then((settings) => {
          if (settings && settings.store_type) {
            setStoreType(settings.store_type);
            try {
              localStorage.setItem('rafiq_store_type', settings.store_type);
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Specific Store Flags
  const isPharmacy = storeType === 'pharmacy' || isEnabled('feature_pharmacy');
  const isClothing = storeType === 'clothing_apparel' || (!isPharmacy && isEnabled('feature_matrix_variants'));
  const isProduceOrButchery = storeType === 'produce_butchery';
  const isElectronics = storeType === 'phones_electronics';
  const isSpices = storeType === 'spices_roastery';
  const isDairy = storeType === 'dairy_bakery';
  const isSupermarket = storeType === 'supermarket';

  const effectiveStoreType = useMemo(() => {
    if (isPharmacy) return 'pharmacy';
    if (isClothing) return 'clothing_apparel';
    if (isProduceOrButchery) return 'produce_butchery';
    if (isElectronics) return 'phones_electronics';
    if (isSpices) return 'spices_roastery';
    if (isDairy) return 'dairy_bakery';
    if (isSupermarket) return 'supermarket';
    return storeType || getCurrentStoreType() || 'general_grocery';
  }, [isPharmacy, isClothing, isProduceOrButchery, isElectronics, isSpices, isDairy, isSupermarket, storeType]);

  const terminology = useMemo(() => getStoreTerminology(effectiveStoreType), [effectiveStoreType]);

  // Feature Applicability per Store Profile
  const supportsWeight = isProduceOrButchery || isSpices || isDairy || isEnabled('feature_scale_weight');
  const supportsExpiry = isPharmacy || isSupermarket || isDairy || isSpices || isEnabled('feature_expiry_dates');
  const supportsColdChain = isPharmacy || isDairy || isProduceOrButchery || Boolean(locationId || isColdChain);
  const supportsPackaging = true; // All store profiles can buy cartons/packs and sell loose pieces or packages
  const supportsShelfLocations = isPharmacy || isEnabled('feature_shelf_locations') || (storageLocations && storageLocations.length > 0) || Boolean(locationId);

  // Auto-default unit to kg for butchery and produce if new product
  useEffect(() => {
    if (isOpen && !editingId) {
      if ((isProduceOrButchery || isSpices) && unit !== 'kg') {
        setUnit('kg');
        setProductUnits(productUnits.map(u => u.isBaseUnit ? { ...u, unitName: 'كيلو', isDivisible: true } : u));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId, isProduceOrButchery, isSpices]);

  // Detected package if defined in product units
  const detectedPackage = productUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);

  // Smart Pack Name based on Store Profile
  const defaultPackName = useMemo(() => {
    if (isPharmacy) return 'علبة';
    if (isClothing) return 'دستة';
    if (isProduceOrButchery) return 'قفص / صندوق';
    if (isSpices) return 'شوال / كيس';
    return 'كرتونة';
  }, [isPharmacy, isClothing, isProduceOrButchery, isSpices]);

  const packName = detectedPackage ? detectedPackage.unitName : defaultPackName;

  // Base unit name (e.g. قرص in pharmacy, قطعة in grocery, كيلو in butchery/produce)
  const baseUnitName = useMemo(() => {
    const base = productUnits.find(u => u && u.isBaseUnit);
    if (base && base.unitName && base.unitName.trim()) return base.unitName.trim();
    if (editingProduct?.unit && editingProduct.unit !== 'piece') return editingProduct.unit;
    if (unit === 'kg') return 'كيلو';
    return terminology.baseUnitDefaultName || (isPharmacy ? 'قرص' : 'قطعة');
  }, [productUnits, editingProduct, unit, terminology, isPharmacy]);

  // Dynamic Carton/Box Calculator state
  const [packSizeInput, setPackSizeInput] = useState<string>('');
  const [cartonsInput, setCartonsInput] = useState<string>('');
  const [looseInput, setLooseInput] = useState<string>('');
  const [showAdditionalBarcodes, setShowAdditionalBarcodes] = useState<boolean>(additionalBarcodes.length > 0);

  // Advanced section collapsible toggle
  const [showAdvancedDetails, setShowAdvancedDetails] = useState<boolean>(false);

  // Story 130: Pharmacy Module State
  const [dosageForms, setDosageForms] = useState<PharmaDosageForm[]>([]);
  const [manufacturers, setManufacturers] = useState<PharmaManufacturer[]>([]);
  const [therapeuticClasses, setTherapeuticClasses] = useState<TherapeuticClass[]>([]);
  const [_activeIngredientsList, setActiveIngredientsList] = useState<ActiveIngredient[]>([]);
  const [showIngredientsDetail, setShowIngredientsDetail] = useState<boolean>(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [newIngredientStrength, setNewIngredientStrength] = useState('500');
  const [newIngredientUnit, setNewIngredientUnit] = useState('mg');
  const [newIngredientIsPrimary, setNewIngredientIsPrimary] = useState(false);

  // Unified Cold Chain handler (syncs both isColdChain and pharmaInfo.isRefrigerated)
  const isColdChainActive = Boolean(isColdChain || pharmaInfo?.isRefrigerated);
  const handleColdChainChange = useCallback((checked: boolean) => {
    setIsColdChain?.(checked);
    setPharmaInfo?.((prev) => ({
      ...prev,
      isRefrigerated: checked,
    }));
  }, [setIsColdChain, setPharmaInfo]);

  // Synchronize on modal open or editingId change
  useEffect(() => {
    if (!isOpen) return;

    if (!editingId) {
      setShowAdditionalBarcodes(false);
    } else {
      setShowAdditionalBarcodes(additionalBarcodes.length > 0);
    }

    // Auto open advanced if product already has special data
    const hasSpecialData = Boolean(
      taxRatePercent > 0 ||
      internalCode.trim() ||
      taxCategoryCode.trim() ||
      (pharmaInfo?.controlledSchedule && pharmaInfo.controlledSchedule !== 'none') ||
      pharmaInfo?.rxStatus === 'controlled' ||
      (pharmaInfo?.ingredients && pharmaInfo.ingredients.length > 0)
    );
    setShowAdvancedDetails(hasSpecialData);

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
      const detectedNew = productUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);
      setPackSizeInput(detectedNew && detectedNew.conversionFactor > 0 ? String(detectedNew.conversionFactor) : '');
      setCartonsInput('');
      setLooseInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId]);

  // Auto-sync pack size and cartons/loose units when product units load or change
  useEffect(() => {
    if (!isOpen) return;
    const pkg = productUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);
    if (pkg && pkg.conversionFactor > 1) {
      const factor = pkg.conversionFactor;
      setPackSizeInput(String(factor));
      const currentStock = parseFloat(stockInput) || 0;
      const c = Math.floor(currentStock / factor);
      const rem = Math.round(currentStock % factor);
      setCartonsInput(c > 0 ? String(c) : '0');
      setLooseInput(rem > 0 ? String(rem) : '0');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, productUnits]);

  const packSizeNum = parseInt(normalizeArabicNumerals(packSizeInput), 10) || 0;
  const cartonsNum = parseInt(normalizeArabicNumerals(cartonsInput), 10) || 0;
  const looseNum = parseInt(normalizeArabicNumerals(looseInput), 10) || 0;
  const totalStockNum = parseFloat(stockInput) || 0;

  // When user edits cartons/boxes:
  const handleCartonsChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setCartonsInput(clean);
    const c = parseInt(clean, 10);
    const cVal = isNaN(c) ? 0 : c;
    const factor = packSizeNum > 0 ? packSizeNum : 1;
    const newTotal = (cVal * factor) + looseNum;
    setStockInput(String(newTotal));
  };

  // When user edits pack capacity (سعة الكرتونة / العبوة):
  const handlePackSizeChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setPackSizeInput(clean);
    const size = parseInt(clean, 10);
    const factor = !isNaN(size) && size > 0 ? size : 1;
    const newTotal = (cartonsNum * factor) + looseNum;
    setStockInput(String(newTotal));
  };

  // When user edits loose units:
  const handleLoosePiecesChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setLooseInput(clean);
    const l = parseInt(clean, 10);
    const lVal = isNaN(l) ? 0 : l;
    const factor = packSizeNum > 0 ? packSizeNum : 1;
    const newTotal = (cartonsNum * factor) + lVal;
    setStockInput(String(newTotal));
  };

  // When user types directly into stockInput:
  const handleDirectStockChange = (val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    setStockInput(clean);
    const total = parseFloat(clean) || 0;
    if (packSizeNum > 1) {
      const c = Math.floor(total / packSizeNum);
      const rem = Math.round(total % packSizeNum);
      setCartonsInput(c > 0 ? String(c) : '0');
      setLooseInput(rem > 0 ? String(rem) : '0');
    } else {
      setCartonsInput('');
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

  // Drug Reference lookup state (Auto-filling pharmacy metadata from external directory)
  const [isLookingUpDrugRef, setIsLookingUpDrugRef] = useState(false);
  const [matchedDrugRef, setMatchedDrugRef] = useState<DrugReferenceItem | null>(null);

  // Apply drug reference metadata to the form fields (Supports 1-click apply and auto-fill)
  const handleApplyDrugRefData = useCallback((found: DrugReferenceItem) => {
    if (!found) return;

    if (found.tradeName) {
      setName(found.tradeName.trim());
    }
    if (found.publicPricePiasters && found.publicPricePiasters > 0) {
      setPricePiasters(found.publicPricePiasters);
    }

    // Set Strength / Size (التركيز / الحجم)
    if (found.strength && setVariantSize) {
      setVariantSize(found.strength.trim());
    }

    // Set Flavor / Dosage Form (النكهة / الشكل الدوائي)
    const flavorOrForm = (found.flavorForm || found.form || '').trim();
    if (flavorOrForm && setVariantColor) {
      setVariantColor(flavorOrForm);
    }

    // Match Category if provided in drug reference or fallback to pharmacy category
    if (categories && categories.length > 0) {
      if (found.category) {
        const normCat = found.category.trim().toLowerCase();
        const catMatch = categories.find(c => c.name.toLowerCase().includes(normCat) || normCat.includes(c.name.toLowerCase()));
        if (catMatch) {
          setCategoryId(catMatch.id);
        }
      } else {
        const pharmaCat = categories.find(c => c.name.includes('أدوية') || c.name.includes('صيدلية') || c.name.includes('مسكنات'));
        if (pharmaCat && (!categoryId || categoryId === 'cat_general')) {
          setCategoryId(pharmaCat.id);
        }
      }
    }

    // Match Shelf / Storage Location if provided in drug reference or fridge
    if (storageLocations && storageLocations.length > 0) {
      if (found.storageLocation) {
        const normLoc = found.storageLocation.trim().toLowerCase();
        const locMatch = storageLocations.find(l => l.name.toLowerCase().includes(normLoc) || normLoc.includes(l.name.toLowerCase()));
        if (locMatch) {
          setLocationId?.(locMatch.id);
        }
      } else if (found.isRefrigerated) {
        const fridgeLoc = storageLocations.find(l => l.type === 'fridge');
        if (fridgeLoc) {
          setLocationId?.(fridgeLoc.id);
        }
      }
    }

    // Sync Cold Chain / Refrigerator Checkbox
    if (found.isRefrigerated !== undefined) {
      handleColdChainChange(Boolean(found.isRefrigerated));
    }

    // Sync Pack Capacity (سعة العبوة وعدد الأشرطة)
    if (found.piecesPerPack && found.piecesPerPack > 1) {
      setPackSizeInput(String(found.piecesPerPack));
    }

    // Update PharmaInfo with clinical fields
    setPharmaInfo?.((prev) => {
      const current = prev || {
        productId: '',
        isPrescriptionOnly: false,
        isAntibiotic: false,
        isRefrigerated: false,
        ingredients: [],
      };

      // Match dosage form
      let matchedFormId = current.dosageFormId;
      let matchedFormName = current.dosageFormName;
      if (found.form && dosageForms.length > 0) {
        const normForm = found.form.trim().toLowerCase();
        const dMatch = dosageForms.find(d => 
          d.nameAr.toLowerCase().includes(normForm) || 
          normForm.includes(d.nameAr.toLowerCase()) ||
          (d.nameEn && normForm.includes(d.nameEn.toLowerCase()))
        );
        if (dMatch) {
          matchedFormId = dMatch.id;
          matchedFormName = dMatch.nameAr;
        }
      }

      // Match manufacturer
      let matchedMfgId = current.manufacturerId;
      let matchedMfgName = current.manufacturerName;
      if (found.manufacturer && manufacturers.length > 0) {
        const normMfg = found.manufacturer.trim().toLowerCase();
        const mMatch = manufacturers.find(m => 
          m.nameAr.toLowerCase().includes(normMfg) || 
          normMfg.includes(m.nameAr.toLowerCase()) ||
          (m.nameEn && normMfg.includes(m.nameEn.toLowerCase()))
        );
        if (mMatch) {
          matchedMfgId = mMatch.id;
          matchedMfgName = mMatch.nameAr;
        }
      }

      // Match therapeutic class
      let matchedTherapeuticId = current.therapeuticClassId;
      let matchedTherapeuticName = current.therapeuticClassName;
      if (found.therapeuticClass && therapeuticClasses.length > 0) {
        const normTherapeutic = found.therapeuticClass.trim().toLowerCase();
        const tMatch = therapeuticClasses.find(t => 
          t.nameAr.toLowerCase().includes(normTherapeutic) || 
          normTherapeutic.includes(t.nameAr.toLowerCase()) ||
          (t.nameEn && normTherapeutic.includes(t.nameEn.toLowerCase())) ||
          (t.code && normTherapeutic.includes(t.code.toLowerCase()))
        );
        if (tMatch) {
          matchedTherapeuticId = tMatch.id;
          matchedTherapeuticName = tMatch.nameAr;
        }
      }

      // Infer or match route of administration
      let resolvedRoute = current.routeOfAdministration || 'oral';
      if (found.route) {
        const lowerRoute = found.route.trim().toLowerCase();
        if (lowerRoute.includes('oral') || lowerRoute.includes('فم')) resolvedRoute = 'oral';
        else if (lowerRoute.includes('topical') || lowerRoute.includes('موضع') || lowerRoute.includes('كريم') || lowerRoute.includes('مرهم') || lowerRoute.includes('جل')) resolvedRoute = 'topical';
        else if (lowerRoute.includes('parenteral') || lowerRoute.includes('inject') || lowerRoute.includes('حقن') || lowerRoute.includes('عضل') || lowerRoute.includes('وريد')) resolvedRoute = 'parenteral';
        else if (lowerRoute.includes('drop') || lowerRoute.includes('قطر') || lowerRoute.includes('عين') || lowerRoute.includes('أذن')) resolvedRoute = 'ophthalmic';
        else if (lowerRoute.includes('inhal') || lowerRoute.includes('استنشاق') || lowerRoute.includes('بخاخ')) resolvedRoute = 'inhalation';
        else if (lowerRoute.includes('rectal') || lowerRoute.includes('لبوس') || lowerRoute.includes('شرج') || lowerRoute.includes('تحاميل')) resolvedRoute = 'rectal';
        else resolvedRoute = found.route;
      } else if (found.form) {
        const lowerForm = found.form.trim().toLowerCase();
        if (lowerForm.includes('حقن') || lowerForm.includes('أمبول') || lowerForm.includes('فيال') || lowerForm.includes('inject')) resolvedRoute = 'parenteral';
        else if (lowerForm.includes('كريم') || lowerForm.includes('مرهم') || lowerForm.includes('جل') || lowerForm.includes('لوشن')) resolvedRoute = 'topical';
        else if (lowerForm.includes('قطرة') || lowerForm.includes('نقط')) resolvedRoute = 'ophthalmic';
        else if (lowerForm.includes('استنشاق') || lowerForm.includes('بخاخ')) resolvedRoute = 'inhalation';
        else if (lowerForm.includes('لبوس') || lowerForm.includes('تحاميل')) resolvedRoute = 'rectal';
        else resolvedRoute = 'oral';
      }

      // Infer or match pregnancy category
      let resolvedPregnancy = current.pregnancyCategory || '';
      if (found.pregnancyCategory !== undefined && found.pregnancyCategory !== null) {
        const upperPreg = found.pregnancyCategory.trim().toUpperCase();
        if (['A', 'B', 'C', 'D', 'X'].includes(upperPreg)) {
          resolvedPregnancy = upperPreg;
        } else if (upperPreg === '' || upperPreg === 'NONE' || upperPreg.includes('غير محدد')) {
          resolvedPregnancy = '';
        }
      }

      // Infer or match antibiotic flag
      let resolvedAntibiotic = Boolean(current.isAntibiotic);
      if (found.isAntibiotic !== undefined && found.isAntibiotic !== null) {
        resolvedAntibiotic = Boolean(found.isAntibiotic);
      } else if (found.therapeuticClass) {
        const tc = found.therapeuticClass.toLowerCase();
        if (tc.includes('مضاد حيوي') || tc.includes('مضادات حيوية') || tc.includes('antibiotic')) {
          resolvedAntibiotic = true;
        }
      }

      // Infer or match prescription / Rx status
      let resolvedRx = current.rxStatus || 'otc';
      if (found.rxStatus) {
        const lowerRx = found.rxStatus.trim().toLowerCase();
        if (lowerRx.includes('control') || lowerRx.includes('جدول')) resolvedRx = 'controlled';
        else if (lowerRx.includes('rx') || lowerRx.includes('روشتة')) resolvedRx = 'rx';
        else resolvedRx = 'otc';
      } else if (resolvedAntibiotic) {
        resolvedRx = 'rx';
      }

      // Auto-populate active ingredients list if scientific name is provided (تثبيت كمادة فعالة رئيسية)
      const existingIngs = current.ingredients || [];
      let updatedIngredients = [...existingIngs];
      if (found.scientificName && found.scientificName.trim()) {
        const sci = found.scientificName.trim();
        const alreadyHasIt = existingIngs.some(ing => ing.ingredientName && ing.ingredientName.trim().toLowerCase() === sci.toLowerCase());
        if (!alreadyHasIt) {
          let strengthMilli = 0;
          if (found.strength) {
            const numMatch = found.strength.match(/(\d+)/);
            if (numMatch) {
              strengthMilli = parseInt(numMatch[1], 10) * 1000;
            }
          }
          const primaryIng = {
            ingredientId: `ing_${Date.now()}`,
            ingredientName: sci,
            strengthMilli: strengthMilli > 0 ? strengthMilli : 500000,
            strengthUnit: 'mg',
            isPrimary: existingIngs.length === 0 || !existingIngs.some(i => i.isPrimary),
          };
          updatedIngredients.push(primaryIng);
        }
      }

      const isCold = found.isRefrigerated ?? current.isRefrigerated;

      return {
        ...current,
        scientificName: found.scientificName || current.scientificName || '',
        dosageFormId: matchedFormId,
        dosageFormName: matchedFormName || (found.form || null),
        manufacturerId: matchedMfgId,
        manufacturerName: matchedMfgName || (found.manufacturer || null),
        therapeuticClassId: matchedTherapeuticId,
        therapeuticClassName: matchedTherapeuticName || (found.therapeuticClass || null),
        routeOfAdministration: resolvedRoute,
        pregnancyCategory: resolvedPregnancy,
        isAntibiotic: resolvedAntibiotic,
        rxStatus: resolvedRx,
        isPrescriptionOnly: resolvedRx === 'rx' || resolvedRx === 'controlled',
        isRefrigerated: isCold,
        ingredients: updatedIngredients,
      };
    });

    // Automatically expand advanced details and ingredients so user can see populated fields
    setShowAdvancedDetails(true);
    if (found.scientificName) {
      setShowIngredientsDetail(true);
    }
  }, [
    categories, 
    storageLocations, 
    dosageForms, 
    manufacturers, 
    therapeuticClasses, 
    setName, 
    setPricePiasters, 
    setCategoryId, 
    setLocationId, 
    setPharmaInfo, 
    setVariantSize, 
    setVariantColor, 
    handleColdChainChange, 
    setPackSizeInput,
    categoryId
  ]);

  // Auto-lookup drug reference by barcode when barcode changes
  useEffect(() => {
    if (!isOpen || !isPharmacy || !barcode.trim() || barcode.trim().length < 4) {
      setMatchedDrugRef(null);
      return;
    }

    const timer = setTimeout(() => {
      setIsLookingUpDrugRef(true);
      void invoke<DrugReferenceItem | null>('pharma:checkDrugReference', { barcode: barcode.trim() })
        .then((found) => {
          setMatchedDrugRef(found || null);
          // If adding a new product and user hasn't typed name yet or name is empty, auto-populate details
          if (found && !editingId && !name.trim()) {
            handleApplyDrugRefData(found);
          }
        })
        .catch(() => {
          setMatchedDrugRef(null);
        })
        .finally(() => {
          setIsLookingUpDrugRef(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [isOpen, isPharmacy, barcode, editingId, name, handleApplyDrugRefData]);

  // Load pharmacy data only when pharmacy mode is active
  useEffect(() => {
    if (isOpen && isPharmacy) {
      void invoke<PharmaDosageForm[]>('pharma:getDosageForms').then((res) => setDosageForms(res || []));
      void invoke<PharmaManufacturer[]>('pharma:getManufacturers').then((res) => setManufacturers(res || []));
      void invoke<TherapeuticClass[]>('pharma:getTherapeuticClasses').then((res) => setTherapeuticClasses(res || []));
      void invoke<ActiveIngredient[]>('pharma:getActiveIngredients').then((res) => setActiveIngredientsList(res || []));
    }
  }, [isOpen, isPharmacy]);

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
      ingredients: [...(prev?.ingredients || []), newIng],
    }));
    setNewIngredientName('');
    setNewIngredientStrength('500');
    setNewIngredientIsPrimary(false);
  };

  const handleRemoveIngredient = (idx: number) => {
    if (!setPharmaInfo) return;
    setPharmaInfo((prev) => ({
      ...prev,
      ingredients: (prev?.ingredients || []).filter((_, i) => i !== idx),
    }));
  };

  const handleUseGenericAsPrimaryIngredient = () => {
    if (!pharmaInfo?.scientificName?.trim() || !setPharmaInfo) return;
    const newIng = {
      ingredientId: `ing_${Date.now()}`,
      ingredientName: pharmaInfo.scientificName.trim(),
      strengthMilli: 500000,
      strengthUnit: 'mg',
      isPrimary: true,
    };
    setPharmaInfo((prev) => ({
      ...prev,
      ingredients: [newIng, ...(prev?.ingredients || []).filter(i => !i.isPrimary)],
    }));
    setShowIngredientsDetail(true);
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
    { value: '', label: 'فئة الحمل: غير محدد' },
    { value: 'A', label: 'فئة A (آمن تماماً للحوامل)' },
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
      additionalBarcodes.length > 0 ||
      pharmaInfo?.scientificName
    );
  }, [editingId, name, barcode, pricePiasters, costPiasters, stockInput, productUnits.length, additionalBarcodes.length, pharmaInfo?.scientificName]);

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

  // Contextual Header Icon & Title
  const headerIcon = useMemo(() => {
    if (isPharmacy) return <Pill className="w-4 h-4 text-brand dark:text-brand-bright" />;
    if (isClothing) return <Shirt className="w-4 h-4 text-purple-700 dark:text-purple-400" />;
    if (isProduceOrButchery) return <Apple className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />;
    if (isElectronics) return <Smartphone className="w-4 h-4 text-blue-700 dark:text-blue-400" />;
    if (isSpices) return <Flame className="w-4 h-4 text-amber-700 dark:text-amber-400" />;
    if (isDairy) return <Milk className="w-4 h-4 text-sky-700 dark:text-sky-400" />;
    return <Package className="w-4 h-4 text-brand dark:text-brand-bright" />;
  }, [isPharmacy, isClothing, isProduceOrButchery, isElectronics, isSpices, isDairy]);

  const headerTitle = useMemo(() => {
    if (editingId) {
      if (isPharmacy) return 'تعديل بيانات الدواء / الصنف';
      if (isClothing) return 'تعديل بيانات الموديل والقطعة';
      if (isProduceOrButchery) return 'تعديل صنف الخضار أو اللحوم';
      if (isElectronics) return 'تعديل بيانات الجهاز أو القطعة';
      if (isSpices) return 'تعديل صنف العطارة والبن';
      return 'تعديل بيانات الصنف';
    }
    if (isPharmacy) return 'إضافة دواء / صنف جديد للصيدلية';
    if (isClothing) return 'إضافة صنف / موديل ملابس وأزياء جديد';
    if (isProduceOrButchery) return 'إضافة صنف خضار أو لحوم طازجة بالميزان';
    if (isElectronics) return 'إضافة جهاز أو قطعة إلكترونيات جديدة';
    if (isSpices) return 'إضافة صنف عطارة أو بن وتوابل بالوزن';
    if (isDairy) return 'إضافة صنف ألبان أو مخبوزات';
    return 'إضافة صنف جديد لبضاعة المحل';
  }, [editingId, isPharmacy, isClothing, isProduceOrButchery, isElectronics, isSpices, isDairy]);

  const namePlaceholder = useMemo(() => {
    if (isPharmacy) return 'مثلاً: بانادول إكسترا 500 ملجم (Panadol Extra)';
    if (isClothing) return 'مثلاً: بنطلون جينز كاجوال سليم فت أو قميص أوكسفورد';
    if (isProduceOrButchery) return 'مثلاً: تفاح أحمر مستورد أو لحم كندوز بلدي طازج';
    if (isElectronics) return 'مثلاً: هاتف سامسونج A55 أو شاحن سريع 65W';
    if (isSpices) return 'مثلاً: بن برازيلي محوج بالحبهان أو كمون بلدي مطحون';
    if (isDairy) return 'مثلاً: جبنة براميلي بالفلفل أو لبن جاموسي طبيعي';
    return 'مثلاً: شاي العروسة 250 جم';
  }, [isPharmacy, isClothing, isProduceOrButchery, isElectronics, isSpices, isDairy]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-ink/40 dark:bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-3xl max-h-[92vh] bg-surface dark:bg-surface-dark rounded-xl border border-brand/50 dark:border-brand/40 shadow-2xl overflow-hidden flex flex-col select-none animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="h-[48px] bg-surface-2 dark:bg-surface-dark-2 hairline-b border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {headerIcon}
            <h3 className="text-[14px] font-bold text-ink dark:text-ink-dark m-0">
              {headerTitle}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={onOpenPriceHistory}
                className="mr-2 px-2 py-0.5 rounded bg-brand-soft dark:bg-brand-soft/20 hover:bg-brand/20 border border-brand/20 text-brand dark:text-brand-bright text-[11px] font-bold flex items-center gap-1 transition-colors"
                title="عرض تاريخ وتعديلات أسعار هذا الصنف"
              >
                <History className="w-3 h-3" />
                <span>سجل الأسعار</span>
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
          <div ref={formBodyRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3.5 text-[12px]">
            
            {/* Errors & Warnings */}
            {formError && (
              <div className="p-2.5 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright flex items-center gap-2 text-[12px] font-bold animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {similarWarning && (
              <div className="p-3 rounded-lg bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright flex flex-col gap-2 text-[12px]">
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
                    تعديل الاسم
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(undefined, true)}
                    className="px-3 py-1 bg-warn hover:bg-warn-dark text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                  >
                    <span>احفظ الصنف برضه</span>
                  </button>
                </div>
              </div>
            )}

            {/* CARD 1: بطاقة تعريف الصنف والهوية المخصصة */}
            <div className="p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col gap-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-line/60 dark:border-line-dark/60 pb-2">
                <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark text-[13px]">
                  <div className="w-6 h-6 rounded-md bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center">
                    {headerIcon}
                  </div>
                  <span>
                    {isPharmacy ? 'بطاقة تعريف الدواء والصنف' :
                     isClothing ? 'بيانات الموديل والمقاسات والألوان' :
                     isProduceOrButchery ? 'بيانات الصنف والوزن بالميزان' :
                     isElectronics ? 'بيانات الجهاز والماركة والموديل' : 'بيانات الصنف والباركود'}
                  </span>
                </div>

                {/* Secondary badge indicator */}
                {isClothing && (
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold">
                    أزياء وملابس
                  </span>
                )}
                {isProduceOrButchery && (
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold">
                    بيع ميزان طازج
                  </span>
                )}
                {isElectronics && (
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 font-bold">
                    أجهزة وإلكترونيات
                  </span>
                )}
                {isPharmacy && pharmaInfo?.scientificName && (
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright font-mono font-bold truncate max-w-[200px]">
                    {pharmaInfo.scientificName}
                  </span>
                )}
              </div>

              {/* Name & Barcode Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Product / Model Name */}
                <div>
                  <label className="block text-ink dark:text-ink-dark font-semibold mb-1">
                    {isPharmacy ? 'اسم الدواء التجاري *' :
                     isClothing ? 'اسم الموديل / القطعة *' :
                     isProduceOrButchery ? 'اسم الصنف أو نوع اللحم *' :
                     isElectronics ? 'اسم الجهاز أو القطعة *' : 'اسم الصنف *'}
                  </label>
                  <input
                    type="text"
                    placeholder={namePlaceholder}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-[36px] px-3 text-[13px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-sans"
                    autoFocus
                  />
                </div>

                {/* Primary Barcode with Contextual Generator */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-ink dark:text-ink-dark font-semibold">
                      {isProduceOrButchery ? 'كود الصنف / كود الميزان' : 'الباركود الرئيسي'}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onGenerateInternalBarcode}
                        className="text-[11px] text-brand dark:text-brand-bright hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        title={isProduceOrButchery ? 'توليد كود وزني قياسي يبدأ بـ 20' : 'توليد باركود قياسي تلقائياً'}
                      >
                        <Barcode className="w-3.5 h-3.5" />
                        <span>{isProduceOrButchery ? 'كود وزني تلقائي' : 'كود تلقائي'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAdditionalBarcodes(!showAdditionalBarcodes)}
                        className="text-[10.5px] text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:underline font-medium"
                      >
                        {showAdditionalBarcodes ? 'إخفاء الأكواد الإضافية' : '+ باركود بديل'}
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={isProduceOrButchery ? 'اضرب كود الميزان أو اضغط كود وزني تلقائي' : 'اضرب الباركود بالقارئ أو اضغط كود تلقائي'}
                      value={barcode}
                      onChange={(e) => setBarcode(normalizeArabicNumerals(e.target.value))}
                      className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-[36px] px-3 text-[13px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright font-mono"
                    />
                    {isLookingUpDrugRef && (
                      <div className="absolute left-2.5 top-2.5 flex items-center gap-1 text-[11px] text-brand dark:text-brand-bright animate-spin pointer-events-none">
                        <Loader2 className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* PHARMACY: Full-width Drug Reference Banner with 1-Click Auto-Fill */}
              {isPharmacy && matchedDrugRef && (
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px] text-emerald-900 dark:text-emerald-200 animate-in fade-in shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[12.5px] text-emerald-950 dark:text-emerald-100">
                          تم العثور بالدليل المرجعي: {matchedDrugRef.tradeName}
                        </span>
                        {matchedDrugRef.publicPricePiasters && matchedDrugRef.publicPricePiasters > 0 && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 font-bold text-emerald-800 dark:text-emerald-200">
                            سعر رسمي: {formatArabicCurrency(matchedDrugRef.publicPricePiasters)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300 mt-0.5 flex items-center gap-2 flex-wrap">
                        {matchedDrugRef.scientificName && (
                          <span>مادة فعالة: <span className="font-mono">{matchedDrugRef.scientificName}</span></span>
                        )}
                        {matchedDrugRef.form && <span>• {matchedDrugRef.form}</span>}
                        {matchedDrugRef.manufacturer && <span>• {matchedDrugRef.manufacturer}</span>}
                        {matchedDrugRef.isRefrigerated && (
                          <span className="font-bold text-paid dark:text-paid-bright flex items-center gap-0.5">
                            • ثلاجة / سلسلة تبريد
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApplyDrugRefData(matchedDrugRef)}
                    className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-[11px] font-bold transition-colors shadow-2xs flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                    title="تعبئة وتحديث الاسم والسعر الرسمي والشكل والشركة والمجموعة بالاستناد للدليل المرجعي"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>تطبيق بيانات الدليل</span>
                  </button>
                </div>
              )}

              {/* Additional Barcodes (Expandable on demand) */}
              {showAdditionalBarcodes && (
                <div className="p-2.5 bg-surface-2/80 dark:bg-surface-dark-2/80 border border-line dark:border-line-dark rounded-lg flex flex-col gap-2 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-ink dark:text-ink-dark">
                    <span>باركودات إضافية لنفس الصنف (تسهيل الضرب بالقارئ لو تغير الكود بالدفعة):</span>
                    <span className="text-[10.5px] text-ink-muted dark:text-ink-dark-muted font-mono">
                      {additionalBarcodes.length} كود مسجل
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="اضرب الباركود واضغط Enter..."
                      value={newBarcodeInput}
                      onChange={(e) => setNewBarcodeInput(normalizeArabicNumerals(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onAddBarcode();
                        }
                      }}
                      className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[32px] px-2.5 text-[11.5px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={onAddBarcode}
                      disabled={!newBarcodeInput.trim()}
                      className="px-3 h-[32px] bg-brand hover:bg-brand-hover disabled:bg-surface dark:disabled:bg-surface-dark disabled:text-ink-muted text-white rounded text-[11px] font-bold transition-colors shadow-2xs cursor-pointer"
                    >
                      إضافة
                    </button>
                  </div>
                  {additionalBarcodes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 max-h-20 overflow-y-auto">
                      {additionalBarcodes.map((bc, idx) => (
                        <span
                          key={bc}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded text-[10.5px] font-mono text-ink dark:text-ink-dark shadow-2xs"
                        >
                          <Barcode className="w-3 h-3 text-ink-muted" />
                          <span>{bc}</span>
                          <button
                            type="button"
                            onClick={() => onRemoveBarcode(idx)}
                            className="text-ink-muted hover:text-danger rounded p-0.5 cursor-pointer"
                            title="مسح"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CLOTHING STORE SPECIAL: Direct Size & Color + Matrix Quick Action */}
              {isClothing && (
                <div className="p-3 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 rounded-lg flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-purple-950 dark:text-purple-200 text-xs">
                      <Layers className="w-3.5 h-3.5 text-purple-700 dark:text-purple-300" />
                      <span>المقاس واللون ومصفوفة الموديل</span>
                    </div>
                    {!editingId && onOpenVariantMatrix && (
                      <button
                        type="button"
                        onClick={onOpenVariantMatrix}
                        className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg transition-colors text-[11px] shadow-2xs flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>+ عمل مصفوفة سريعة (مقاس × لون)</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-purple-900 dark:text-purple-300 mb-1">
                        المقاس (Size)
                      </label>
                      <input
                        type="text"
                        placeholder="مثلاً: S, M, L, XL, 32, 34..."
                        value={variantSize}
                        onChange={(e) => setVariantSize?.(e.target.value)}
                        className="w-full bg-white dark:bg-surface-dark border border-purple-200 dark:border-purple-800/60 rounded h-[34px] px-2.5 text-xs font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-purple-900 dark:text-purple-300 mb-1">
                        اللون (Color)
                      </label>
                      <input
                        type="text"
                        placeholder="مثلاً: أسود، كحلي، أبيض، رمادي..."
                        value={variantColor}
                        onChange={(e) => setVariantColor?.(e.target.value)}
                        className="w-full bg-white dark:bg-surface-dark border border-purple-200 dark:border-purple-800/60 rounded h-[34px] px-2.5 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ELECTRONICS STORE SPECIAL: Capacity, Color & SKU */}
              {isElectronics && (
                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-lg flex flex-col gap-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950 dark:text-blue-200 text-xs">
                    <Smartphone className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300" />
                    <span>مواصفات الجهاز / القطعة (السعة واللون وكود الموديل)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-blue-900 dark:text-blue-300 mb-1">
                        السعة / الإصدار
                      </label>
                      <input
                        type="text"
                        placeholder="مثلاً: 128GB أو 256GB أو Pro Max"
                        value={variantSize}
                        onChange={(e) => setVariantSize?.(e.target.value)}
                        className="w-full bg-white dark:bg-surface-dark border border-blue-200 dark:border-blue-800/60 rounded h-[32px] px-2.5 text-xs font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-blue-900 dark:text-blue-300 mb-1">
                        اللون
                      </label>
                      <input
                        type="text"
                        placeholder="مثلاً: تيتانيوم طبيعي، أسود فلكي"
                        value={variantColor}
                        onChange={(e) => setVariantColor?.(e.target.value)}
                        className="w-full bg-white dark:bg-surface-dark border border-blue-200 dark:border-blue-800/60 rounded h-[32px] px-2.5 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-blue-900 dark:text-blue-300 mb-1">
                        كود الموديل / القطعة (SKU)
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: SM-A556B"
                        value={internalCode}
                        onChange={(e) => setInternalCode(e.target.value)}
                        className="w-full bg-white dark:bg-surface-dark border border-blue-200 dark:border-blue-800/60 rounded h-[32px] px-2.5 text-xs font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PHARMACY CLINICAL FIELDS */}
              {isPharmacy && (
                <>
                  {/* Generic Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11.5px] font-bold text-ink dark:text-ink-dark">
                        الاسم العلمي / المادة الفعالة الأساسية (Generic Name)
                      </label>
                      {pharmaInfo?.scientificName?.trim() && (!pharmaInfo?.ingredients || pharmaInfo.ingredients.length === 0) && (
                        <button
                          type="button"
                          onClick={handleUseGenericAsPrimaryIngredient}
                          className="text-[10.5px] text-brand dark:text-brand-bright hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                          title="إنشاء مادة فعالة رئيسية من الاسم العلمي"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>تثبيت كمادة فعالة رئيسية</span>
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={pharmaInfo?.scientificName || ''}
                        onChange={(e) => setPharmaInfo?.((prev) => ({ ...prev, scientificName: e.target.value }))}
                        placeholder="مثلاً: Paracetamol, Amoxicillin, Ibuprofen..."
                        className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg h-[34px] px-3 pr-8 text-[12px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand shadow-2xs"
                      />
                      <Sparkles className="w-3.5 h-3.5 text-brand absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  {/* Dosage Form, Manufacturer, and Therapeutic Class in 3 Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
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
                        searchable
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
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
                        searchable
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                        المجموعة العلاجية (Therapeutic)
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
                        searchable
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Category, Shelf Location & Cold Chain Row */}
              <div className={`grid grid-cols-1 ${supportsShelfLocations ? 'sm:grid-cols-2' : ''} gap-3 pt-1 border-t border-line/60 dark:border-line-dark/60`}>
                {/* Category Selection */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-ink dark:text-ink-dark font-semibold text-[11.5px]">قسم وتصنيف الصنف بالمحل</label>
                    <button
                      type="button"
                      onClick={onOpenCategoryModal}
                      className="text-[10.5px] text-brand dark:text-brand-bright hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Tags className="w-3 h-3" />
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
                    size="sm"
                    searchable
                  />
                </div>

                {/* Storage Location & Cold Chain (Only if shelves are enabled or store is pharmacy) */}
                {supportsShelfLocations && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-ink dark:text-ink-dark font-semibold text-[11.5px]">
                        {supportsColdChain ? 'الرف ومكان التخزين وسلسلة التبريد' : 'الرف / مكان التخزين بالمحل'}
                      </label>
                      {onOpenStorageLocationsModal && (
                        <button
                          type="button"
                          onClick={onOpenStorageLocationsModal}
                          className="text-[10.5px] text-brand dark:text-brand-bright hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Boxes className="w-3 h-3" />
                          <span>إدارة الرفوف</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <CustomSelect
                          value={locationId || ''}
                          onChange={(val) => {
                            if (setLocationId) setLocationId(val);
                            const selectedLoc = storageLocations?.find(l => l.id === val);
                            if (selectedLoc && selectedLoc.type === 'fridge') {
                              handleColdChainChange(true);
                            }
                          }}
                          options={[
                            { value: '', label: 'بدون رف محدد' },
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
                          size="sm"
                          searchable
                        />
                      </div>

                      {/* Cold Chain Checkbox */}
                      {supportsColdChain && (
                        <label 
                          className={`flex items-center gap-1.5 px-2.5 h-[34px] rounded-lg border cursor-pointer select-none transition-colors shrink-0 ${
                            isColdChainActive 
                              ? 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-300' 
                              : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink-muted'
                          }`}
                          title="تحديد الصنف كصنف يحتاج تبريد وثلاجة (2 إلى 8 درجات مئوية)"
                        >
                          <input
                            type="checkbox"
                            checked={isColdChainActive}
                            onChange={(e) => handleColdChainChange(e.target.checked)}
                            className="rounded border-line text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                          />
                          <Snowflake className={`w-3.5 h-3.5 ${isColdChainActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-ink-muted'}`} />
                          <span className="text-[11px] font-bold">ثلاجة</span>
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Independent Cold Chain Bar (If cold chain supported but no shelf system) */}
              {!supportsShelfLocations && supportsColdChain && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">حفظ الصنف وتخزينه:</span>
                  <label 
                    className={`flex items-center gap-1.5 px-3 h-[30px] rounded-lg border cursor-pointer select-none transition-colors ${
                      isColdChainActive 
                        ? 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-300' 
                        : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink-muted'
                    }`}
                    title="تحديد الصنف كصنف يحتاج تبريد وثلاجة (2 إلى 8 درجات مئوية)"
                  >
                    <input
                      type="checkbox"
                      checked={isColdChainActive}
                      onChange={(e) => handleColdChainChange(e.target.checked)}
                      className="rounded border-line text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                    />
                    <Snowflake className={`w-3.5 h-3.5 ${isColdChainActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-ink-muted'}`} />
                    <span className="text-[11px] font-bold">يحتاج حفظ في الثلاجة (تبريد)</span>
                  </label>
                </div>
              )}

              {/* Weight Mode Selection (Shown only for stores that support scales) */}
              {supportsWeight && (
                <div className="pt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-ink dark:text-ink-dark">
                    طريقة بيع الصنف (الوحدة الأساسية):
                  </span>
                  <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-0.5 rounded-lg border border-line dark:border-line-dark">
                    <button
                      type="button"
                      onClick={() => {
                        setUnit('piece');
                        setProductUnits(productUnits.map(u => u.isBaseUnit ? { ...u, unitName: terminology.baseUnitDefaultName || 'قطعة', isDivisible: false } : u));
                      }}
                      className={`py-1 px-3 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        unit === 'piece'
                          ? 'bg-brand text-white shadow-2xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Package className="w-3 h-3" />
                      <span>بالـ ({terminology.baseUnitDefaultName || 'قطعة'})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUnit('kg');
                        setProductUnits(productUnits.map(u => u.isBaseUnit ? { ...u, unitName: 'كيلو', isDivisible: true } : u));
                      }}
                      className={`py-1 px-3 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        unit === 'kg'
                          ? 'bg-brand text-white shadow-2xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Scale className="w-3 h-3" />
                      <span>بالوزن (كيلوجرام)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* CARD 2: التسعير وهوامش الربح وتجزئة العبوات */}
            <div className="p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col gap-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-line/60 dark:border-line-dark/60 pb-2">
                <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark text-[13px]">
                  <div className="w-6 h-6 rounded-md bg-paid-soft dark:bg-paid-soft/20 text-paid dark:text-paid flex items-center justify-center">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    {unit === 'kg' ? 'تسعير الكيلو وتكلفة الشراء وهامش الربح' :
                     isPharmacy ? 'التسعير وتجزئة العلبة (الشرائط والأمبولات)' :
                     isClothing ? 'تسعير البيع وتكلفة الشراء للموديل' : 'التسعير وتكلفة الشراء والعبوات'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
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
                    className={`text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      showCostCalculator
                        ? 'bg-brand text-white border-brand shadow-xs'
                        : 'bg-brand-soft/70 dark:bg-brand-soft/20 text-brand dark:text-brand-bright hover:bg-brand/15 border-brand/20'
                    }`}
                    title="حساب تكلفة الوحدة من سعر الكرتونة أو إجمالي الفاتورة"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>حاسبة التكلفة</span>
                  </button>
                </div>
              </div>

              {/* Selling Price & Cost in Piasters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink dark:text-ink-dark font-semibold mb-1">
                    {unit === 'kg' ? 'سعر بيع الكيلو للزبون *' :
                     isPharmacy ? 'سعر بيع العلبة للجمهور *' :
                     isClothing ? 'سعر بيع القطعة للزبون *' : 'سعر البيع للزبون (للقطعة) *'}
                  </label>
                  <MoneyInput
                    valuePiasters={pricePiasters}
                    onChangePiasters={setPricePiasters}
                    className="h-[38px] text-[13px] font-bold text-brand dark:text-brand-bright"
                  />
                </div>

                <div>
                  <label className="block text-ink dark:text-ink-dark font-semibold mb-1">
                    {unit === 'kg' ? 'تكلفة شراء الكيلو من المورد' :
                     isPharmacy ? 'تكلفة شراء العلبة من الشركات' :
                     isClothing ? 'تكلفة شراء القطعة من المصنع' : 'تكلفة الشراء من الشركات والموردين'}
                  </label>
                  <MoneyInput
                    valuePiasters={costPiasters}
                    onChangePiasters={setCostPiasters}
                    className="h-[38px] text-[13px]"
                  />
                </div>
              </div>

              {/* Smart Supplier Cost Calculator Card (Expandable) */}
              {showCostCalculator && (
                <div className="p-3 bg-brand-soft/50 dark:bg-brand-soft/10 border border-brand/30 dark:border-brand/40 rounded-lg flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between border-b border-brand/15 dark:border-brand/30 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-brand dark:text-brand-bright" />
                      <span className="text-[12px] font-bold text-ink dark:text-ink-dark">
                        {unit === 'kg' ? 'حاسبة تكلفة شراء الكيلو من إجمالي الفاتورة والوزن:' : 'حاسبة تكلفة الشراء من الشركات والموردين:'}
                      </span>
                    </div>
                    {unit !== 'kg' && (
                      <div className="flex items-center gap-1 bg-surface dark:bg-surface-dark p-0.5 rounded-md border border-line dark:border-line-dark">
                        <button
                          type="button"
                          onClick={() => setCostCalcMode('carton')}
                          className={`px-2.5 py-1 rounded text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            costCalcMode === 'carton'
                              ? 'bg-brand text-white shadow-xs'
                              : 'text-ink-muted hover:text-ink'
                          }`}
                        >
                          <Boxes className="w-3 h-3" />
                          <span>من سعر {packName}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCostCalcMode('invoice')}
                          className={`px-2.5 py-1 rounded text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            costCalcMode === 'invoice'
                              ? 'bg-brand text-white shadow-xs'
                              : 'text-ink-muted hover:text-ink'
                          }`}
                        >
                          <Receipt className="w-3 h-3" />
                          <span>من إجمالي الفاتورة</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {costCalcMode === 'carton' && unit !== 'kg' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                      <div>
                        <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                          سعر شراء الـ {packName} بالكامل:
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
                          سعة الـ {packName} (فيها كام {baseUnitName}):
                        </label>
                        <input
                          type="text"
                          value={calcCartonCapacity}
                          onChange={(e) => setCalcCartonCapacity(normalizeArabicNumerals(e.target.value))}
                          placeholder={packSizeNum > 0 ? String(packSizeNum) : 'مثلاً: 12'}
                          className="w-full bg-white dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-3 text-[12.5px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
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
                          {unit === 'kg' ? 'إجمالي الوزن المستلم (كجم):' : 'إجمالي عدد القطع المستلمة:'}
                        </label>
                        <input
                          type="text"
                          value={calcInvoiceQty}
                          onChange={(e) => setCalcInvoiceQty(normalizeArabicNumerals(e.target.value))}
                          placeholder={stockInput ? stockInput : (unit === 'kg' ? 'مثلاً: 25.5' : 'مثلاً: 50')}
                          className="w-full bg-white dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-3 text-[12.5px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-white dark:bg-surface-dark p-2 rounded-md border border-brand/20 dark:border-brand/30 mt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                        {unit === 'kg' ? 'تكلفة الكيلو المحسوبة:' : 'تكلفة القطعة المحسوبة:'}
                      </span>
                      <span className="font-mono text-[13px] font-extrabold text-brand dark:text-brand-bright">
                        {formatArabicCurrency(activeCalculatedCost)}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={activeCalculatedCost <= 0}
                      onClick={() => {
                        setCostPiasters(activeCalculatedCost);
                        setShowCostCalculator(false);
                      }}
                      className="px-3 py-1 bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>تطبيق التكلفة</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Live Profit Margin Breakdown */}
              {(() => {
                const profitPiasters = pricePiasters - costPiasters;
                const markupPercent = costPiasters > 0 ? ((profitPiasters / costPiasters) * 100) : 0;
                const marginPercent = pricePiasters > 0 ? ((profitPiasters / pricePiasters) * 100) : 0;
                const isLoss = profitPiasters < 0;
                const isBreakEven = profitPiasters === 0;

                if (isLoss) {
                  return (
                    <div className="p-2.5 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 text-danger dark:text-danger-bright flex flex-col gap-1 text-[11.5px]">
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
                    <div className="p-2 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted text-[11px] flex items-center justify-between font-mono">
                      <span>مكسب الصنف: 0.00 ج.م (رأس برأس من غير مكسب)</span>
                      <span>سعر البيع نفس سعر الشراء بالظبط</span>
                    </div>
                  );
                }

                return (
                  <div className="p-2.5 rounded-lg bg-paid-soft/80 dark:bg-paid-soft/20 border border-paid/20 text-paid dark:text-paid flex flex-col gap-1 text-[11.5px]">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-paid shrink-0" />
                        <span>
                          {unit === 'kg' ? 'المكسب الصافي للكيلو:' :
                           isPharmacy ? 'المكسب الصافي للعلبة:' :
                           isClothing ? 'المكسب الصافي للقطعة:' : 'المكسب الصافي للوحدة:'}
                        </span>
                      </span>
                      <span className="font-mono text-[12px] font-bold">
                        +{formatArabicCurrency(profitPiasters)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10.5px] text-paid/90">
                      <span>نسبة الربح من التكلفة (Markup): +{markupPercent.toFixed(1)}%</span>
                      <span>هامش الربح من البيع (Margin): {marginPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })()}

              {/* Below Cost Warning Modal Prompt */}
              {belowCostWarning && (
                <div className="p-3 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 rounded-lg text-warn flex flex-col gap-2">
                  <div className="flex items-start gap-2 text-[11.5px] font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-warn mt-0.5" />
                    <div>
                      <p>سعر البيع ({formatArabicCurrency(belowCostWarning.pricePiasters)}) أقل من سعر التكلفة ({formatArabicCurrency(belowCostWarning.costPiasters)}).</p>
                      <p className="text-[11px] font-normal text-ink-muted mt-0.5">متأكد إنك عاوز تكمل وتحفظ الصنف بسعر بيع فيه خسارة؟</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-warn/20">
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
                      className="px-2.5 h-6 bg-warn hover:bg-warn-dark text-white rounded text-[11px] font-bold transition-colors shadow-2xs cursor-pointer"
                    >
                      احفظ الصنف بالخسارة عادي
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Units & Packaging Editor (Shown for stores with multi-unit support) */}
              {supportsPackaging && (
                <div className="pt-2 border-t border-line/60 dark:border-line-dark/60">
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
                        if (cfg.updatedStockQuantityMilli !== undefined) {
                          editingProduct.stockQuantityMilli = cfg.updatedStockQuantityMilli;
                        }
                      }
                      const base = cfg.units.find(u => u.isBaseUnit) || cfg.units[cfg.units.length - 1];
                      if (base) {
                        if (base.sellPricePiasters > 0) setPricePiasters(base.sellPricePiasters);
                        if (base.costPricePiasters > 0) setCostPiasters(base.costPricePiasters);
                      }
                      const topUnit = cfg.units.find(u => !u.isBaseUnit && u.conversionFactor > 1);
                      if (topUnit && topUnit.conversionFactor > 1) {
                        const factor = topUnit.conversionFactor;
                        setPackSizeInput(String(factor));
                        if (cfg.updatedStockQuantityMilli !== undefined) {
                          const newStock = Math.round(cfg.updatedStockQuantityMilli / 1000);
                          setStockInput(String(newStock));
                          const c = Math.floor(newStock / factor);
                          const rem = newStock % factor;
                          setCartonsInput(String(c));
                          setLooseInput(String(rem));
                        } else {
                          const curStock = parseFloat(stockInput) || 0;
                          const c = Math.floor(curStock / factor);
                          const rem = Math.round(curStock % factor);
                          setCartonsInput(String(c));
                          setLooseInput(String(rem));
                        }
                      } else {
                        setPackSizeInput('');
                        setCartonsInput('');
                        if (cfg.updatedStockQuantityMilli !== undefined) {
                          const newStock = Math.round(cfg.updatedStockQuantityMilli / 1000);
                          setStockInput(String(newStock));
                          setLooseInput(String(newStock));
                        }
                      }
                    }}
                    basePricePiasters={pricePiasters}
                    baseCostPiasters={costPiasters}
                    baseUnitName={baseUnitName}
                    isWeightItem={unit === 'kg' || isProduceOrButchery || isSpices}
                    primaryBarcode={barcode}
                    storeType={effectiveStoreType}
                  />
                </div>
              )}
            </div>

            {/* CARD 3: رصيد المخزن والصلاحية وتنبيه النواقص */}
            <div className="p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col gap-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-line/60 dark:border-line-dark/60 pb-2">
                <div className="flex items-center gap-2 font-bold text-ink dark:text-ink-dark text-[13px]">
                  <div className="w-6 h-6 rounded-md bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center">
                    <Boxes className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    {unit === 'kg' ? 'الرصيد الفعلي بالميزان وتنبيه النواقص' :
                     isPharmacy ? 'رصيد الصيدلية وتاريخ الصلاحية وجرد العلب' :
                     isClothing ? 'رصيد القطع بالمحل وحد تنبيه النواقص' : 'رصيد المخزن وجرد الكراتين وتاريخ الصلاحية'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright text-[10.5px] font-bold">
                    حساب فوري ولحظي
                  </span>
                </div>
              </div>

              {/* Dynamic Inputs for Pieces or Weight */}
              {unit === 'piece' ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center bg-surface-2 dark:bg-surface-dark-2 p-2.5 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                    {/* 1. Cartons / Boxes */}
                    <div>
                      <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1 truncate" title={`عدد الـ (${packName})`}>
                        عدد الـ ({packName}):
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cartonsInput}
                        onChange={(e) => handleCartonsChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[36px] px-2 text-[13px] font-mono text-center font-bold text-brand dark:text-brand-bright focus:outline-none focus:border-brand"
                      />
                    </div>

                    {/* 2. Pack Capacity (سعة الكرتونة / العلبة بالقطع) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-ink dark:text-ink-dark truncate" title={`سعة الـ (${packName}) بالـ (${baseUnitName})`}>
                          سعة الـ ({packName}):
                        </label>
                        <span className="text-[9.5px] text-ink-muted font-bold">
                          {baseUnitName}
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={packSizeInput}
                        onChange={(e) => handlePackSizeChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder={detectedPackage?.conversionFactor ? String(detectedPackage.conversionFactor) : '1'}
                        className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[36px] px-2 text-[13px] font-mono text-center font-bold text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                      />
                    </div>

                    {/* 3. Loose units */}
                    <div>
                      <label 
                        className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1 truncate" 
                        title={`${baseUnitName === 'قرص' ? 'أقراص' : baseUnitName === 'شريط' ? 'أشرطة' : baseUnitName === 'قطعة' ? 'قطع' : baseUnitName} فرط:`}
                      >
                        {baseUnitName === 'قرص' ? 'أقراص فرط:' : baseUnitName === 'شريط' ? 'أشرطة فرط:' : baseUnitName === 'قطعة' ? 'قطع فرط فردانية:' : isProduceOrButchery || isSpices ? 'وحدات فرط صغيرة:' : `${baseUnitName} فرط:`}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={looseInput}
                        onChange={(e) => handleLoosePiecesChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[36px] px-2 text-[13px] font-mono text-center font-bold text-brand dark:text-brand-bright focus:outline-none focus:border-brand"
                      />
                    </div>

                    {/* 4. Equals sign symbol */}
                    <div className="hidden sm:flex items-center justify-center font-extrabold text-ink-muted text-xl pt-4">
                      =
                    </div>

                    {/* 5. Calculated Total Stock Result Field */}
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[11px] font-extrabold text-brand dark:text-brand-bright mb-1 truncate">
                        {editingId ? `الرصيد الفعلي الحالي (بـ ${baseUnitName}):` : `الرصيد الافتتاحي (بـ ${baseUnitName}):`}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={stockInput}
                          onChange={(e) => handleDirectStockChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          disabled={Boolean(editingId)}
                          readOnly={Boolean(editingId)}
                          placeholder="0"
                          title={editingId ? "يتم تعديل رصيد المخزون رسمياً عبر شاشة تسوية الجرد أو فواتير الشراء والبيع" : "الرصيد الافتتاحي للصنف الجديد"}
                          className={`w-full rounded h-[36px] px-2 text-[13px] font-mono text-center font-extrabold focus:outline-none ${
                            editingId
                              ? 'bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted cursor-not-allowed'
                              : 'bg-brand-soft dark:bg-brand-soft/20 border-2 border-brand dark:border-brand-bright text-brand dark:text-brand-bright'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stock Alert & Breakdown Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Min Stock Reorder Alert Input */}
                    <div className="flex items-center gap-2 bg-surface-2 dark:bg-surface-dark-2 px-3 py-2 rounded-lg border border-line dark:border-line-dark">
                      <label className="text-[11px] font-semibold text-ink dark:text-ink-dark shrink-0">
                        حد تنبيه النواقص:
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
                        className="w-20 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[28px] px-2 text-[12px] font-mono text-center text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                      />
                      <span className="text-[10px] text-ink-muted truncate">تنبيه عند اقتراب نفاذ الصنف</span>
                    </div>

                    {/* Live Inventory Valuation (Invested Capital) */}
                    <div className="px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-ink-muted">
                        <Coins className="w-3.5 h-3.5 text-brand" />
                        <span>قيمة البضاعة بالتكلفة:</span>
                      </div>
                      <span className="font-mono font-bold text-brand dark:text-brand-bright text-[11.5px]">
                        {parseFloat(stockInput) > 0 && costPiasters > 0
                          ? formatArabicCurrency(Math.round(parseFloat(stockInput) * costPiasters))
                          : '0.00 ج.م'}
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Equation Breakdown Banner */}
                  <div className="p-2 bg-brand-soft/50 dark:bg-brand-soft/20 border border-brand/20 rounded-lg text-brand dark:text-brand-bright text-[11px] font-bold flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {cartonsNum > 0 ? (
                          <>
                            الناتج: {cartonsNum} {packName}
                            {packSizeNum > 1 ? ` × ${packSizeNum} ${baseUnitName}` : ''}
                            {looseNum > 0 ? ` + ${looseNum} فرط` : ''}
                            {' = '}
                            {totalStockNum} {baseUnitName} رصيد فعلي
                          </>
                        ) : totalStockNum > 0 ? (
                          <>الرصيد الفعلي بالمحل: {totalStockNum} {baseUnitName}</>
                        ) : (
                          <>الرصيد الحالي: 0 {baseUnitName}</>
                        )}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] bg-white dark:bg-surface-dark text-brand dark:text-brand-bright px-2 py-0.5 rounded border border-brand/20">
                      {totalStockNum} {baseUnitName}
                    </span>
                  </div>
                </>
              ) : (
                /* Weight Mode (kg) for Produce, Butchery, Spices, Dairy */
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-ink dark:text-ink-dark font-semibold mb-1 text-[11.5px]">
                        {editingId ? 'الرصيد الفعلي الحالي (كجم)' : 'الرصيد الافتتاحي (كجم) *'}
                      </label>
                      <input
                        type="text"
                        value={stockInput}
                        onChange={(e) => setStockInput(normalizeArabicNumerals(e.target.value))}
                        disabled={Boolean(editingId)}
                        readOnly={Boolean(editingId)}
                        title={editingId ? "يتم تعديل رصيد المخزون رسمياً عبر شاشة تسوية الجرد أو فواتير الشراء والبيع" : "الرصيد الافتتاحي للصنف الجديد"}
                        placeholder="مثلاً: 12.5"
                        className={`w-full border rounded h-[36px] px-3 text-[13px] focus:outline-none font-mono font-bold ${
                          editingId
                            ? 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink-muted cursor-not-allowed'
                            : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark focus:border-brand'
                        }`}
                      />
                      <p className="text-[10px] text-ink-muted mt-1">
                        {editingId ? 'الرصيد محمي من الاستبدال؛ يتم تعديله عبر تسوية الجرد' : 'الوزن الكلي المتوفر حالياً بالمحل للبيع'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-ink dark:text-ink-dark font-semibold mb-1 text-[11.5px]">
                        حد تنبيه النواقص (كجم)
                      </label>
                      <input
                        type="text"
                        value={minStockInput}
                        onChange={(e) => setMinStockInput(normalizeArabicNumerals(e.target.value))}
                        placeholder="5"
                        className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-[36px] px-3 text-[13px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand font-mono"
                      />
                      <p className="text-[10px] text-ink-muted mt-1">تنبيه تلقائي عند هبوط الوزن عن هذا الحد</p>
                    </div>
                  </div>

                  {parseFloat(stockInput) > 0 && costPiasters > 0 && (
                    <div className="px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-ink-muted">
                        <Coins className="w-3.5 h-3.5 text-brand" />
                        <span>قيمة الوزن المتوفر بالتكلفة:</span>
                      </div>
                      <span className="font-mono font-bold text-brand dark:text-brand-bright text-[11.5px]">
                        {formatArabicCurrency(Math.round(parseFloat(stockInput) * costPiasters))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Expiry Date & Batch (Only for stores that actually deal with expiries) */}
              {supportsExpiry && (
                <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg flex flex-col gap-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-bold text-[12px]">
                      <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                      <span>تاريخ الصلاحية ورقم الشحنة (التشغيلة / Batch)</span>
                    </div>
                    <span className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">تسجيل رصيد أول المدة بالمخزن</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                        تاريخ انتهاء الصلاحية
                      </label>
                      <CustomDatePicker
                        value={initialExpiryDate || ''}
                        onChange={(val) => setInitialExpiryDate?.(val)}
                        placeholder="اختر تاريخ الصلاحية"
                        size="sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted mb-1">
                        رقم التشغيلة / إذن الاستلام (اختياري)
                      </label>
                      <input
                        type="text"
                        placeholder="مثلاً: LOT-2026-A1 أو رقم الفاتورة"
                        value={initialBatchNumber}
                        onChange={(e) => setInitialBatchNumber?.(e.target.value)}
                        className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[32px] px-2.5 text-[11.5px] font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CARD 4: خيارات وبيانات متقدمة (قابلة للطي لجميع المتاجر) */}
            <div className="p-3.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col gap-3 shadow-2xs">
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-surface-2 dark:bg-surface-dark-2 text-ink-muted flex items-center justify-center">
                    <Sliders className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-ink dark:text-ink-dark text-[13px]">
                    خيارات وبيانات متقدمة (ضرائب، فواتير إلكترونية{isPharmacy ? '، رقابة وأدوية جدول' : ''})
                  </span>
                  {((pharmaInfo?.controlledSchedule && pharmaInfo.controlledSchedule !== 'none') || pharmaInfo?.rxStatus === 'controlled') && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn border border-warn/30 animate-pulse">
                      دواء جدول
                    </span>
                  )}
                  {taxRatePercent > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/10 text-brand">
                      ضريبة {taxRatePercent}%
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="p-1 text-ink-muted hover:text-ink"
                >
                  {showAdvancedDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {showAdvancedDetails && (
                <div className="flex flex-col gap-3.5 pt-2 border-t border-line/60 dark:border-line-dark/60 animate-in fade-in duration-150">
                  
                  {/* Pharmacy Clinical & Regulatory Details */}
                  {isPharmacy && (
                    <>
                      {/* Story 131: Controlled Drug & Prescription Classification */}
                      <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-ink dark:text-ink-dark">
                            <ShieldAlert className="w-3.5 h-3.5 text-warn" />
                            <span>تصنيف الصرف والرقابة والجدول (Controlled Drugs & Rx Status)</span>
                          </div>
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
                                  controlledSchedule: val !== 'controlled' ? 'none' : (prev?.controlledSchedule && prev.controlledSchedule !== 'none' ? prev.controlledSchedule : 'schedule_2'),
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
                                  rxStatus: val !== 'none' ? 'controlled' : (prev?.rxStatus === 'controlled' ? 'rx' : prev?.rxStatus || 'otc'),
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

                      {/* Clinical Usage, Route & Pregnancy Toggles */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-ink-muted mb-1">طريقة الاستخدام (Route)</label>
                          <CustomSelect
                            options={routeOptions}
                            value={pharmaInfo?.routeOfAdministration || 'oral'}
                            onChange={(val) => setPharmaInfo?.((prev) => ({ ...prev, routeOfAdministration: val }))}
                            size="sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-ink-muted mb-1">فئة الحمل والرضاعة</label>
                          <CustomSelect
                            options={pregnancyOptions}
                            value={pharmaInfo?.pregnancyCategory || ''}
                            onChange={(val) => setPharmaInfo?.((prev) => ({ ...prev, pregnancyCategory: val }))}
                            size="sm"
                          />
                        </div>

                        <div className="flex items-end">
                          <label className="flex items-center gap-2 p-2 w-full h-[34px] bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(pharmaInfo?.isAntibiotic)}
                              onChange={(e) => setPharmaInfo?.((prev) => ({ ...prev, isAntibiotic: e.target.checked }))}
                              className="rounded text-brand focus:ring-brand w-3.5 h-3.5"
                            />
                            <span className="text-[11px] font-bold text-ink dark:text-ink-dark">مضاد حيوي (Antibiotic)</span>
                          </label>
                        </div>
                      </div>

                      {/* Active Ingredients Sub-Table for Combination Drugs */}
                      <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg flex flex-col gap-2">
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setShowIngredientsDetail(!showIngredientsDetail)}
                        >
                          <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink dark:text-ink-dark">
                            <Sparkles className="w-3.5 h-3.5 text-brand" />
                            <span>تفصيل المواد الفعالة وتركيزاتها (Active Ingredients)</span>
                            <span className="text-[10px] text-ink-muted font-mono font-normal">
                              ({pharmaInfo?.ingredients?.length || 0} مادة)
                            </span>
                          </div>
                          <button type="button" className="text-xs text-ink-muted">
                            {showIngredientsDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {(showIngredientsDetail || (pharmaInfo?.ingredients && pharmaInfo.ingredients.length > 0)) && (
                          <div className="flex flex-col gap-2 pt-1 border-t border-line/40">
                            {/* Add Ingredient Form */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <input
                                type="text"
                                value={newIngredientName}
                                onChange={(e) => setNewIngredientName(e.target.value)}
                                placeholder="اسم المادة الفعالة..."
                                className="flex-1 min-w-[120px] h-8 px-2 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                              />
                              <input
                                type="number"
                                value={newIngredientStrength}
                                onChange={(e) => setNewIngredientStrength(e.target.value)}
                                placeholder="التركيز"
                                className="w-16 h-8 px-2 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-mono text-center text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                              />
                              <div className="w-24">
                                <CustomSelect
                                  options={strengthUnitOptions}
                                  value={newIngredientUnit}
                                  onChange={(val) => setNewIngredientUnit(val)}
                                  size="sm"
                                />
                              </div>
                              <label className="flex items-center gap-1 text-[10.5px] text-ink-muted cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={newIngredientIsPrimary}
                                  onChange={(e) => setNewIngredientIsPrimary(e.target.checked)}
                                  className="rounded text-brand w-3 h-3"
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
                                  <thead className="bg-surface dark:bg-surface-dark text-ink-muted text-[10.5px]">
                                    <tr>
                                      <th className="px-2.5 py-1.5">المادة الفعالة</th>
                                      <th className="px-2.5 py-1.5 text-center">التركيز</th>
                                      <th className="px-2.5 py-1.5 text-center">النوع</th>
                                      <th className="px-2.5 py-1.5 text-center w-8"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-line/40 dark:divide-line-dark/40 bg-surface dark:bg-surface-dark">
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
                                            className="p-0.5 text-ink-muted hover:text-danger rounded cursor-pointer"
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
                        )}
                      </div>
                    </>
                  )}

                  {/* Tax & ETA E-Invoicing Readiness (Feature #6) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface-2 dark:bg-surface-dark-2 p-3 rounded-lg border border-line dark:border-line-dark">
                    <div>
                      <label className="block text-ink dark:text-ink-dark font-semibold mb-1 text-[11px]">نسبة الضريبة (%)</label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={taxRatePercent}
                          onChange={(e) => setTaxRatePercent(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
                          placeholder="0"
                          className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-2.5 text-[12px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand font-mono pl-7"
                        />
                        <Percent className="w-3.5 h-3.5 text-ink-muted absolute left-2 pointer-events-none" />
                      </div>
                      <p className="text-[9.5px] text-ink-muted mt-0.5">اكتب 0 لو الصنف معفي من الضريبة</p>
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
                        className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-2.5 text-[12px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand font-mono"
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
                        className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-[34px] px-2.5 text-[12px] text-ink dark:text-ink-dark focus:outline-none focus:border-brand font-mono"
                      />
                    </div>
                  </div>

                  {/* Variant Size and Color (Shown in advanced if not clothing and has data) */}
                  {!isClothing && !isElectronics && Boolean(variantSize || variantColor) && (
                    <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg flex flex-col gap-2">
                      <span className="text-[11.5px] font-bold text-ink dark:text-ink-dark">{terminology.sizeLabel} و {terminology.colorLabel} (اختياري)</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10.5px] text-ink-muted mb-1">{terminology.sizeLabel}</label>
                          <input
                            type="text"
                            placeholder={terminology.sizePlaceholder}
                            value={variantSize}
                            onChange={(e) => setVariantSize?.(e.target.value)}
                            className="w-full bg-surface dark:bg-surface-dark border border-line rounded h-[32px] px-2 text-xs font-mono text-ink"
                          />
                        </div>
                        <div>
                          <label className="block text-[10.5px] text-ink-muted mb-1">{terminology.colorLabel}</label>
                          <input
                            type="text"
                            placeholder={terminology.colorPlaceholder}
                            value={variantColor}
                            onChange={(e) => setVariantColor?.(e.target.value)}
                            className="w-full bg-surface dark:bg-surface-dark border border-line rounded h-[32px] px-2 text-xs text-ink"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Footer Actions (Docked at bottom) */}
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
                className="h-[36px] px-4 bg-surface dark:bg-surface-dark hover:bg-surface-3 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-lg text-[12px] font-semibold transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={loading}
                className="h-[36px] px-5 bg-brand hover:bg-brand-hover dark:hover:bg-emerald-700 text-white rounded-lg text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {editingId 
                    ? 'حفظ التعديلات' 
                    : (isPharmacy ? 'حفظ الدواء في الصيدلية' :
                       isClothing ? 'حفظ الموديل بالمحل' :
                       isProduceOrButchery ? 'حفظ الصنف بالمحل' :
                       isElectronics ? 'حفظ الجهاز بالمحل' : 'حفظ الصنف في المحل')}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
