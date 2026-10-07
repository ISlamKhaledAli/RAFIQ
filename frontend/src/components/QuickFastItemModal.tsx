import React, { useState } from 'react';
import { 
  Sparkles, 
  X, 
  Tag, 
  Check, 
  AlertCircle,
  Settings,
  Scale,
  Package,
  Search,
  Boxes,
  Plus,
  Trash2,
  Store,
  ShoppingBag,
  Percent,
  CheckCircle2,
  Layers
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { QuickItem, Product } from '../types/models';
import { normalizeArabicNumerals } from '../utils/money';
import { CustomSelect } from './CustomSelect';
import { useFeatures } from '../context/useFeatures';

interface QuickFastItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded?: (savedItem: QuickItem) => void;
  onOpenFullManager?: () => void;
  onOpenVariantMatrixModal?: () => void;
  existingCategories?: string[];
}

export const QuickFastItemModal: React.FC<QuickFastItemModalProps> = ({
  isOpen,
  onClose,
  onItemAdded,
  onOpenFullManager,
  onOpenVariantMatrixModal,
  existingCategories = ['عام']
}) => {
  const { isEnabled } = useFeatures();
  // Mode selection: warehouse (default & primary) | bundle (combos like Ramadan box) | service (standalone/bags)
  const [mode, setMode] = useState<'warehouse' | 'bundle' | 'service'>('warehouse');

  // Warehouse Mode State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [priceEgp, setPriceEgp] = useState('');
  const [originalPriceEgp, setOriginalPriceEgp] = useState('');
  const [isOpenPrice, setIsOpenPrice] = useState(false);
  const [unit, setUnit] = useState<'piece' | 'kg'>('piece');
  const [categoryName, setCategoryName] = useState('عام');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  // Bundle / Combo Mode State
  const [bundleName, setBundleName] = useState('');
  const [bundleSearchQuery, setBundleSearchQuery] = useState('');
  const [bundleSearchResults, setBundleSearchResults] = useState<Product[]>([]);
  const [isBundleSearching, setIsBundleSearching] = useState(false);
  const [bundleItems, setBundleItems] = useState<{ product: Product; quantity: number }[]>([]);
  const [bundlePriceEgp, setBundlePriceEgp] = useState('');
  const [bundleCategoryName, setBundleCategoryName] = useState('عروض وتوفير');
  const [isCustomBundleCategory, setIsCustomBundleCategory] = useState(false);
  const [customBundleCategoryInput, setCustomBundleCategoryInput] = useState('');

  // General State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Search in warehouse products
  const handleProductSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await invoke<Product[]>('products:search', { query: query.trim(), limit: 8 });
      setSearchResults(Array.isArray(results) ? results : []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Select product from warehouse
  const selectWarehouseProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setName(prod.name);
    const basePrice = (prod.pricePiasters / 100).toFixed(2);
    setOriginalPriceEgp(basePrice);
    setPriceEgp(basePrice); // Default to base price as requested, user can modify if desired
    setIsOpenPrice(false);
    setUnit(prod.unit === 'kg' ? 'kg' : 'piece');
    if (prod.categoryName && prod.categoryName !== 'عام') {
      setCategoryName(prod.categoryName);
    }
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
  };

  // Search for bundle components
  const handleBundleSearch = async (query: string) => {
    setBundleSearchQuery(query);
    if (!query.trim()) {
      setBundleSearchResults([]);
      return;
    }
    setIsBundleSearching(true);
    try {
      const results = await invoke<Product[]>('products:search', { query: query.trim(), limit: 8 });
      setBundleSearchResults(Array.isArray(results) ? results : []);
    } catch {
      setBundleSearchResults([]);
    } finally {
      setIsBundleSearching(false);
    }
  };

  // Add product to bundle
  const addProductToBundle = (prod: Product) => {
    setBundleItems((prev) => {
      const existing = prev.find((item) => item.product.id === prod.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === prod.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product: prod, quantity: 1 }];
    });
    setBundleSearchQuery('');
    setBundleSearchResults([]);
    setError(null);
  };

  const removeProductFromBundle = (prodId: string) => {
    setBundleItems((prev) => prev.filter((item) => item.product.id !== prodId));
  };

  const updateBundleItemQuantity = (prodId: string, delta: number) => {
    setBundleItems((prev) =>
      prev
        .map((item) => {
          if (item.product.id === prodId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as { product: Product; quantity: number }[]
    );
  };

  // Calculate bundle original totals
  const totalBundleOriginalPiasters = bundleItems.reduce(
    (sum, item) => sum + item.product.pricePiasters * item.quantity,
    0
  );
  const totalBundleOriginalEgp = (totalBundleOriginalPiasters / 100).toFixed(2);
  const bundleOfferPricePiasters = Math.round(
    parseFloat(normalizeArabicNumerals(bundlePriceEgp) || '0') * 100
  );
  const bundleSavingsPiasters = Math.max(0, totalBundleOriginalPiasters - bundleOfferPricePiasters);
  const bundleSavingsPercent =
    totalBundleOriginalPiasters > 0
      ? Math.round((bundleSavingsPiasters / totalBundleOriginalPiasters) * 100)
      : 0;

  // Presets for standalone service mode
  const quickPresets = [
    { label: 'كيس بلاستيك كبير', price: '1.00', unit: 'piece' },
    { label: 'كيس بلاستيك صغير', price: '0.50', unit: 'piece' },
    { label: 'خدمة توصيل / دليفري', price: '15.00', unit: 'piece' },
    { label: 'كرتونة فارغة', price: '5.00', unit: 'piece' },
    { label: 'شاي / مشروب ساخن', price: '10.00', unit: 'piece' },
    { label: 'سعر حر (مبلغ مفتوح)', price: '', isOpenPrice: true, unit: 'piece' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'warehouse') {
        const trimmedName = name.trim();
        if (!trimmedName) {
          setError('يرجى اختيار صنف من المخزن أو كتابة اسم الصنف');
          setLoading(false);
          return;
        }

        let piasters = 0;
        if (!isOpenPrice) {
          const parsed = parseFloat(normalizeArabicNumerals(priceEgp));
          if (isNaN(parsed) || parsed < 0) {
            setError('يرجى إدخال سعر بيع صحيح بالجنيه أو تفعيل خيار السعر الحر');
            setLoading(false);
            return;
          }
          piasters = Math.round(parsed * 100);
        }

        const finalCategory = isCustomCategory
          ? customCategoryInput.trim() || 'عام'
          : categoryName.trim() || 'عام';

        const newItem: Partial<QuickItem> = {
          name: trimmedName,
          productId: selectedProduct ? selectedProduct.id : null,
          pricePiasters: piasters,
          isOpenPrice,
          unit,
          categoryName: finalCategory,
          color: null,
          displayOrder: 999
        };

        const saved = await invoke<QuickItem>('quickItems:save', newItem);
        if (onItemAdded) onItemAdded(saved);
        onClose();
      } else if (mode === 'bundle') {
        const trimmedBundleName = bundleName.trim();
        if (!trimmedBundleName) {
          setError('يرجى كتابة اسم العرض (مثال: كرتونة رمضان الخير)');
          setLoading(false);
          return;
        }

        if (bundleItems.length === 0) {
          setError('يرجى اختيار صنف واحد على الأقل من المخزن لمكونات العرض');
          setLoading(false);
          return;
        }

        const parsedPrice = parseFloat(normalizeArabicNumerals(bundlePriceEgp));
        if (isNaN(parsedPrice) || parsedPrice <= 0) {
          setError('يرجى كتابة سعر بيع العرض الإجمالي بالجنيه');
          setLoading(false);
          return;
        }

        const finalBundleCategory = isCustomBundleCategory
          ? customBundleCategoryInput.trim() || 'عروض وتوفير'
          : bundleCategoryName.trim() || 'عروض وتوفير';

        const bundlePayload = bundleItems.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          barcode: item.product.barcode,
          quantityMilli: item.quantity * 1000,
          unit: item.product.unit || 'piece',
          originalPricePiasters: item.product.pricePiasters
        }));

        const newBundleItem: Partial<QuickItem> = {
          name: trimmedBundleName,
          productId: null,
          pricePiasters: Math.round(parsedPrice * 100),
          isOpenPrice: false,
          unit: 'piece',
          categoryName: finalBundleCategory,
          color: '#006d41',
          displayOrder: 999,
          bundleItemsJson: JSON.stringify(bundlePayload)
        };

        const saved = await invoke<QuickItem>('quickItems:save', newBundleItem);
        if (onItemAdded) onItemAdded(saved);
        onClose();
      } else {
        // Service / Standalone mode
        const trimmedName = name.trim();
        if (!trimmedName) {
          setError('يرجى كتابة اسم الصنف السريع');
          setLoading(false);
          return;
        }

        let piasters = 0;
        if (!isOpenPrice) {
          const parsed = parseFloat(normalizeArabicNumerals(priceEgp));
          if (isNaN(parsed) || parsed < 0) {
            setError('يرجى إدخال سعر بيع صحيح بالجنيه أو تفعيل خيار السعر الحر');
            setLoading(false);
            return;
          }
          piasters = Math.round(parsed * 100);
        }

        const finalCategory = isCustomCategory
          ? customCategoryInput.trim() || 'عام'
          : categoryName.trim() || 'عام';

        const newItem: Partial<QuickItem> = {
          name: trimmedName,
          productId: null,
          pricePiasters: piasters,
          isOpenPrice,
          unit,
          categoryName: finalCategory,
          color: null,
          displayOrder: 999
        };

        const saved = await invoke<QuickItem>('quickItems:save', newItem);
        if (onItemAdded) onItemAdded(saved);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل حفظ الصنف: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 select-none animate-in fade-in duration-150" dir="rtl">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-100/90 dark:bg-slate-900 border-b border-line flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-[#006d41] dark:text-emerald-400 flex items-center justify-center shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink leading-tight m-0">إضافة صنف سريع أو عرض للمحل</h3>
              <p className="text-[11px] text-ink-muted m-0 mt-0.5">
                أزرار فورية بنقرة واحدة لشاشة البيع مع ربط بالمخزن وحسابات الجرد
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="p-3 bg-surface-2/60 border-b border-line shrink-0">
          <div className="grid grid-cols-3 gap-2 p-1 bg-surface rounded-lg border border-line">
            <button
              type="button"
              onClick={() => {
                setMode('warehouse');
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                mode === 'warehouse'
                  ? 'bg-[#006d41] text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>صنف من المخزن</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('bundle');
                setError(null);
                if (!bundlePriceEgp && totalBundleOriginalEgp !== '0.00') {
                  setBundlePriceEgp(totalBundleOriginalEgp);
                }
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                mode === 'bundle'
                  ? 'bg-[#006d41] text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>عرض تجميعي (كومبو)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('service');
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                mode === 'service'
                  ? 'bg-[#006d41] text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>صنف خدمة / كيس</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
          
          {/* Error Banner */}
          {error && (
            <div className="p-2.5 rounded-lg bg-danger-soft border border-danger-border text-danger text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Matrix Variants Quick Action (Feature #114) */}
          {isEnabled('feature_matrix_variants') && onOpenVariantMatrixModal && (
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2.5 text-purple-950 font-bold">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-purple-700" />
                </div>
                <div>
                  <div className="text-purple-950">هل تريد إنشاء صنف بـ مقاسات وألوان متعددة؟</div>
                  <div className="text-[11px] text-purple-700 font-normal">مصفوفة سريعة لملابس وأحذية (مقاس × لون) بباركود لكل خيار</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVariantMatrixModal();
                }}
                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg transition-colors shrink-0 text-xs shadow-xs cursor-pointer active:scale-95"
              >
                + مصفوفة مقاسات وألوان
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODE 1: WAREHOUSE PRODUCT (PRIMARY & RECOMMENDED)             */}
          {/* ============================================================== */}
          {mode === 'warehouse' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-100">
              
              {/* Product Search Field */}
              <div className="relative">
                <label className="block text-xs font-bold text-ink mb-1.5">
                  ابحث عن الصنف في المخزن لربطه بالزر السريع:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => void handleProductSearch(e.target.value)}
                    placeholder="اكتب اسم الصنف أو امسح الباركود للبحث في المخزن..."
                    className="w-full h-10 pr-9 pl-3 text-xs bg-surface border border-line rounded-lg text-ink focus:border-[#006d41] focus:outline-none transition-all font-medium"
                  />
                  {isSearching && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted font-bold animate-pulse">
                      جاري البحث...
                    </span>
                  )}
                </div>

                {/* Dropdown Results */}
                {searchResults.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-surface border border-line rounded-lg shadow-xl max-h-56 overflow-y-auto divide-y divide-line">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => selectWarehouseProduct(p)}
                        className="p-2.5 hover:bg-surface-2 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-ink">{p.name}</span>
                          <span className="text-[10px] text-ink-muted font-mono">{p.barcode || 'بدون باركود'}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-[#006d41]">
                            {(p.pricePiasters / 100).toFixed(2)} ج.م
                          </span>
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">
                            مخزون: {p.stockQuantityMilli / 1000}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Product Badge */}
              {selectedProduct ? (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#006d41] shrink-0" />
                    <div>
                      <span className="font-bold text-[#006d41]">تم ربط الصنف المخزني: </span>
                      <span className="font-semibold text-ink">{selectedProduct.name}</span>
                      <span className="block text-[10.5px] text-ink-muted font-mono mt-0.5">
                        الرصيد المتاح: {selectedProduct.stockQuantityMilli / 1000} {selectedProduct.unit === 'kg' ? 'كجم' : 'قطعة'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setName('');
                      setPriceEgp('');
                      setOriginalPriceEgp('');
                    }}
                    className="text-ink-muted hover:text-danger text-[11px] underline cursor-pointer"
                  >
                    تغيير الصنف
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-surface-2 border border-line text-[11.5px] text-ink-muted">
                  اختر صنفاً من المخزن أعلاه لجلبه تلقائياً، أو اكتب بيانات الصنف أدناه مباشرة.
                </div>
              )}

              {/* Item Name */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  اسم الصنف السريع على الشاشة <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="مثال: عيش فينو، لبن جهينة، خيار، إلخ..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-10 pr-9 pl-3 text-xs bg-surface-2 border border-line rounded-lg text-ink focus:border-[#006d41] focus:bg-surface focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              {/* Pricing Options */}
              <div className="bg-surface-2/60 p-3 rounded-lg border border-line/80 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink">
                    سعر البيع لهذا الزر
                  </label>
                  
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300 font-bold">
                    <input
                      type="checkbox"
                      checked={isOpenPrice}
                      onChange={(e) => {
                        setIsOpenPrice(e.target.checked);
                        if (e.target.checked) setPriceEgp('');
                      }}
                      className="w-4 h-4 rounded border-line text-[#006d41] focus:ring-0 cursor-pointer"
                    />
                    <span>سعر حر (مفتوح عند البيع)</span>
                  </label>
                </div>

                {!isOpenPrice ? (
                  <div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted font-mono pointer-events-none">
                        ج.م
                      </span>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        required={!isOpenPrice}
                        placeholder="0.00"
                        value={priceEgp}
                        onChange={(e) => setPriceEgp(normalizeArabicNumerals(e.target.value))}
                        className="w-full h-10 pr-3 pl-12 text-sm font-mono font-bold bg-surface border border-line rounded-lg text-[#006d41] focus:border-[#006d41] focus:outline-none transition-all"
                      />
                    </div>
                    {originalPriceEgp && (
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#006d41] bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded">
                        <span>السعر الأساسي في المخزن: <strong>{originalPriceEgp} ج.م</strong></span>
                        <span className="text-ink-muted text-[10px]">(يمكنك تركه كما هو أو تعديله لهذا الزر)</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-md text-[11.5px] text-amber-800 dark:text-amber-300 font-medium">
                    عند النقر على هذا الزر، سيطلب النظام من الكاشير كتابة السعر فورياً.
                  </div>
                )}
              </div>

              {/* Unit & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    وحدة الصنف
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 h-10 bg-surface-2 p-1 rounded-lg border border-line">
                    <button
                      type="button"
                      onClick={() => setUnit('piece')}
                      className={`flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        unit === 'piece'
                          ? 'bg-surface text-[#006d41] shadow-2xs border border-line'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>قطعة/عدد</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnit('kg')}
                      className={`flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        unit === 'kg'
                          ? 'bg-surface text-[#006d41] shadow-2xs border border-line'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>وزن (كجم)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    القسم / التبويب
                  </label>
                  {!isCustomCategory ? (
                    <div className="flex gap-1.5 items-center">
                      <div className="flex-1">
                        <CustomSelect
                          value={categoryName}
                          onChange={(val) => setCategoryName(val)}
                          size="md"
                          options={existingCategories}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCustomCategory(true)}
                        className="h-10 px-3 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs font-bold cursor-pointer shrink-0 transition-colors"
                        title="كتابة قسم جديد"
                      >
                        + جديد
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 h-10">
                      <input
                        type="text"
                        placeholder="اسم القسم الجديد..."
                        value={customCategoryInput}
                        onChange={(e) => setCustomCategoryInput(e.target.value)}
                        className="flex-1 px-2.5 text-xs bg-surface border border-[#006d41] rounded-lg text-ink focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false);
                          setCustomCategoryInput('');
                        }}
                        className="px-2 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODE 2: BUNDLE / COMBO OFFER (e.g. Ramadan Box)               */}
          {/* ============================================================== */}
          {mode === 'bundle' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-100">
              
              {/* Bundle Title */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  اسم العرض التجميعي / الكرتونة <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="مثال: كرتونة رمضان الخير، عرض التوفير الأسبوعي، باقة السحور..."
                    value={bundleName}
                    onChange={(e) => setBundleName(e.target.value)}
                    className="w-full h-10 pr-9 pl-3 text-xs bg-surface-2 border border-line rounded-lg text-ink focus:border-[#006d41] focus:bg-surface focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              {/* Add items to bundle search */}
              <div className="relative">
                <label className="block text-xs font-bold text-ink mb-1.5">
                  أضف الأصناف المكونة للعرض من المخزن:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={bundleSearchQuery}
                    onChange={(e) => void handleBundleSearch(e.target.value)}
                    placeholder="ابحث عن صنف لإضافته للعرض (زيت، سكر، أرز...)..."
                    className="w-full h-10 pr-9 pl-3 text-xs bg-surface border border-line rounded-lg text-ink focus:border-[#006d41] focus:outline-none transition-all font-medium"
                  />
                  {isBundleSearching && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted font-bold animate-pulse">
                      جاري البحث...
                    </span>
                  )}
                </div>

                {/* Dropdown Results */}
                {bundleSearchResults.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-surface border border-line rounded-lg shadow-xl max-h-56 overflow-y-auto divide-y divide-line">
                    {bundleSearchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => addProductToBundle(p)}
                        className="p-2.5 hover:bg-surface-2 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-ink">{p.name}</span>
                          <span className="text-[10px] text-ink-muted font-mono">{p.barcode || 'بدون باركود'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#006d41]">
                            {(p.pricePiasters / 100).toFixed(2)} ج.م
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded font-bold flex items-center gap-0.5">
                            <Plus className="w-3 h-3" /> إضافة للعرض
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bundle Components List */}
              <div className="bg-surface-2/60 rounded-lg border border-line p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink border-b border-line pb-2">
                  <span>مكونات العرض ({bundleItems.length} أصناف)</span>
                  <span className="font-mono text-[11px] text-ink-muted">
                    إجمالي سعر الأصناف في المخزن: {totalBundleOriginalEgp} ج.م
                  </span>
                </div>

                {bundleItems.length === 0 ? (
                  <div className="py-6 text-center text-xs text-ink-muted">
                    لم تقم بإضافة أي أصناف للعرض بعد. ابحث في المخزن أعلاه لإدراج الأصناف.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                    {bundleItems.map((item) => (
                      <div
                        key={item.product.id}
                        className="bg-surface p-2 rounded-md border border-line flex items-center justify-between text-xs"
                      >
                        <div className="flex-1 truncate pl-2">
                          <span className="font-bold text-ink block truncate">{item.product.name}</span>
                          <span className="text-[10.5px] text-ink-muted font-mono">
                            {((item.product.pricePiasters * item.quantity) / 100).toFixed(2)} ج.م
                          </span>
                        </div>

                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-line rounded bg-surface-2">
                            <button
                              type="button"
                              onClick={() => updateBundleItemQuantity(item.product.id, -1)}
                              className="w-6 h-6 flex items-center justify-center font-bold text-ink hover:bg-surface cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-mono font-bold text-xs">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateBundleItemQuantity(item.product.id, 1)}
                              className="w-6 h-6 flex items-center justify-center font-bold text-ink hover:bg-surface cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeProductFromBundle(item.product.id)}
                            className="w-6 h-6 text-ink-muted hover:text-danger flex items-center justify-center rounded transition-colors cursor-pointer"
                            title="حذف من العرض"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bundle Pricing */}
              <div className="bg-surface-2/60 p-3 rounded-lg border border-line/80 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink">
                    سعر بيع العرض للمستهلك (الإجمالي) <span className="text-danger">*</span>
                  </label>
                  {bundleSavingsPiasters > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-[#006d41] bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                      <Percent className="w-3 h-3" />
                      <span>توفير للزبون: {(bundleSavingsPiasters / 100).toFixed(2)} ج.م ({bundleSavingsPercent}%)</span>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted font-mono pointer-events-none">
                    ج.م
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    placeholder="مثال: 150.00"
                    value={bundlePriceEgp}
                    onChange={(e) => setBundlePriceEgp(normalizeArabicNumerals(e.target.value))}
                    className="w-full h-10 pr-3 pl-12 text-sm font-mono font-bold bg-surface border border-line rounded-lg text-[#006d41] focus:border-[#006d41] focus:outline-none transition-all"
                  />
                </div>
                <p className="text-[10.5px] text-ink-muted m-0">
                  عند بيع هذا العرض، سيقوم النظام تلقائياً بخصم كميات كافة الأصناف المكونة له من المخزن بدقة تامة.
                </p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  القسم / التبويب
                </label>
                {!isCustomBundleCategory ? (
                  <div className="flex gap-1.5 items-center">
                    <div className="flex-1">
                      <CustomSelect
                        value={bundleCategoryName}
                        onChange={(val) => setBundleCategoryName(val)}
                        size="md"
                        options={['عروض وتوفير', ...existingCategories.filter((c) => c !== 'عروض وتوفير')]}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCustomBundleCategory(true)}
                      className="h-10 px-3 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs font-bold cursor-pointer shrink-0 transition-colors"
                      title="كتابة قسم جديد"
                    >
                      + جديد
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5 h-10">
                    <input
                      type="text"
                      placeholder="اسم القسم الجديد..."
                      value={customBundleCategoryInput}
                      onChange={(e) => setCustomBundleCategoryInput(e.target.value)}
                      className="flex-1 px-2.5 text-xs bg-surface border border-[#006d41] rounded-lg text-ink focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomBundleCategory(false);
                        setCustomBundleCategoryInput('');
                      }}
                      className="px-2 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODE 3: SERVICE / STANDALONE (Bags, Delivery, etc.)           */}
          {/* ============================================================== */}
          {mode === 'service' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-100">
              
              {/* Presets */}
              <div>
                <label className="block text-[11px] font-bold text-ink-muted mb-1.5">
                  نماذج جاهزة للاختيار السريع:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {quickPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setName(preset.label);
                        if (preset.isOpenPrice) {
                          setIsOpenPrice(true);
                          setPriceEgp('');
                        } else {
                          setIsOpenPrice(false);
                          setPriceEgp(preset.price);
                        }
                        setUnit((preset.unit as 'piece' | 'kg') || 'piece');
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-surface-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-line transition-all active:scale-95 text-right flex items-center gap-1 cursor-pointer"
                    >
                      <span>{preset.label}</span>
                      {!preset.isOpenPrice && preset.price && (
                        <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                          ({preset.price} ج)
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item Name */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  اسم الصنف السريع <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="مثال: كيس بلاستيك كبير، خدمة توصيل، فنجان شاي..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-10 pr-9 pl-3 text-xs bg-surface-2 border border-line rounded-lg text-ink focus:border-[#006d41] focus:bg-surface focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              {/* Pricing Options */}
              <div className="bg-surface-2/60 p-3 rounded-lg border border-line/80 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink">
                    سعر البيع
                  </label>
                  
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300 font-bold">
                    <input
                      type="checkbox"
                      checked={isOpenPrice}
                      onChange={(e) => {
                        setIsOpenPrice(e.target.checked);
                        if (e.target.checked) setPriceEgp('');
                      }}
                      className="w-4 h-4 rounded border-line text-[#006d41] focus:ring-0 cursor-pointer"
                    />
                    <span>سعر حر (مفتوح عند البيع)</span>
                  </label>
                </div>

                {!isOpenPrice ? (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted font-mono pointer-events-none">
                      ج.م
                    </span>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      required={!isOpenPrice}
                      placeholder="0.00"
                      value={priceEgp}
                      onChange={(e) => setPriceEgp(normalizeArabicNumerals(e.target.value))}
                      className="w-full h-10 pr-3 pl-12 text-sm font-mono font-bold bg-surface border border-line rounded-lg text-[#006d41] focus:border-[#006d41] focus:outline-none transition-all"
                    />
                  </div>
                ) : (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-md text-[11.5px] text-amber-800 dark:text-amber-300 font-medium">
                    عند النقر على هذا الزر، سيطلب النظام من الكاشير كتابة السعر المطلوب لحظياً.
                  </div>
                )}
              </div>

              {/* Unit & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    وحدة الصنف
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 h-10 bg-surface-2 p-1 rounded-lg border border-line">
                    <button
                      type="button"
                      onClick={() => setUnit('piece')}
                      className={`flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        unit === 'piece'
                          ? 'bg-surface text-[#006d41] shadow-2xs border border-line'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>قطعة/عدد</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnit('kg')}
                      className={`flex items-center justify-center gap-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        unit === 'kg'
                          ? 'bg-surface text-[#006d41] shadow-2xs border border-line'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>وزن (كجم)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    القسم / التبويب
                  </label>
                  {!isCustomCategory ? (
                    <div className="flex gap-1.5 items-center">
                      <div className="flex-1">
                        <CustomSelect
                          value={categoryName}
                          onChange={(val) => setCategoryName(val)}
                          size="md"
                          options={existingCategories}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCustomCategory(true)}
                        className="h-10 px-3 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs font-bold cursor-pointer shrink-0 transition-colors"
                        title="كتابة قسم جديد"
                      >
                        + جديد
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 h-10">
                      <input
                        type="text"
                        placeholder="اسم القسم الجديد..."
                        value={customCategoryInput}
                        onChange={(e) => setCustomCategoryInput(e.target.value)}
                        className="flex-1 px-2.5 text-xs bg-surface border border-[#006d41] rounded-lg text-ink focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false);
                          setCustomCategoryInput('');
                        }}
                        className="px-2 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded-lg text-xs cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-2 pt-3 border-t border-line flex items-center justify-between gap-2 shrink-0">
            {onOpenFullManager && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullManager();
                }}
                className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-[#006d41] font-semibold py-1.5 px-2 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>إدارة وترتيب الأزرار السريعة</span>
              </button>
            )}

            <div className="flex items-center gap-2 mr-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 h-9 bg-surface-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-ink rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-5 h-9 bg-[#006d41] hover:bg-[#005231] active:bg-[#00372d] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <span>جاري الحفظ...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>
                      {mode === 'bundle' ? 'حفظ العرض وإضافته للمحل' : 'حفظ وإضافة للمحل'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
