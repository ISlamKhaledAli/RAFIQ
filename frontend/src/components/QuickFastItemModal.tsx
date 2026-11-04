import React, { useState } from 'react';
import type { ReactNode } from 'react';
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
  Minus,
  Trash2,
  Store,
  ShoppingBag,
  Percent,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { extractProducts, type QuickItem, type Product } from '../types/models';
import { normalizeArabicNumerals } from '../utils/money';
import { CustomSelect } from './CustomSelect';
import { SegmentedTabs, type SegmentedTabOption } from './SegmentedTabs';
import { ToggleSwitch } from './ToggleSwitch';
import { useFeatures } from '../context/useFeatures';
import { useModalDismiss } from '../hooks/useModalDismiss';
import {
  QUICK_FIELD,
  QUICK_BTN,
  QUICK_BTN_SECONDARY,
  QUICK_BTN_PRIMARY,
  QUICK_BTN_ICON,
  FieldLabel,
  FormSection,
  ExtrasSection,
  PriceInput,
  InlineNotice,
  SmallChip,
} from './QuickItemFormParts';

interface QuickFastItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded?: (savedItem: QuickItem) => void;
  onOpenFullManager?: () => void;
  onOpenVariantMatrixModal?: () => void;
  existingCategories?: string[];
}

type QuickMode = 'warehouse' | 'bundle' | 'service';

const MODE_OPTIONS: SegmentedTabOption<QuickMode>[] = [
  { value: 'warehouse', label: 'صنف من المخزن', icon: Store, tone: 'paid' },
  { value: 'bundle', label: 'عرض تجميعي (كومبو)', icon: Boxes, tone: 'paid' },
  { value: 'service', label: 'صنف خدمة / كيس', icon: ShoppingBag, tone: 'paid' },
];

// Presets for standalone service mode
const QUICK_PRESETS = [
  { label: 'كيس بلاستيك كبير', price: '1.00', unit: 'piece' },
  { label: 'كيس بلاستيك صغير', price: '0.50', unit: 'piece' },
  { label: 'خدمة توصيل / دليفري', price: '15.00', unit: 'piece' },
  { label: 'كرتونة فارغة', price: '5.00', unit: 'piece' },
  { label: 'شاي / مشروب ساخن', price: '10.00', unit: 'piece' },
  { label: 'سعر حر (مبلغ مفتوح)', price: '', isOpenPrice: true, unit: 'piece' },
];

interface CategoryFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  isCustom: boolean;
  setIsCustom: (value: boolean) => void;
  customValue: string;
  setCustomValue: (value: string) => void;
}

const CategoryField = ({ value, onChange, options, isCustom, setIsCustom, customValue, setCustomValue }: CategoryFieldProps) => (
  <div>
    <FieldLabel>القسم / التبويب</FieldLabel>
    {!isCustom ? (
      <div className="flex gap-2 items-center">
        <div className="flex-1 min-w-0">
          <CustomSelect value={value} onChange={onChange} size="md" options={options} />
        </div>
        <button
          type="button"
          onClick={() => setIsCustom(true)}
          className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY}`}
          title="كتابة قسم جديد"
        >
          <Plus className="w-4 h-4" />
          <span>جديد</span>
        </button>
      </div>
    ) : (
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          placeholder="اسم القسم الجديد..."
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          className={QUICK_FIELD}
        />
        <button
          type="button"
          onClick={() => {
            setIsCustom(false);
            setCustomValue('');
          }}
          className={QUICK_BTN_ICON}
          title="الرجوع للأقسام الحالية"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )}
  </div>
);

interface ProductSearchBoxProps {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  searching: boolean;
  results: Product[];
  onPick: (product: Product) => void;
  trailing: (product: Product) => ReactNode;
}

const ProductSearchBox = ({ label, placeholder, query, onQueryChange, searching, results, onPick, trailing }: ProductSearchBoxProps) => (
  <div className="relative">
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Search className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className={`${QUICK_FIELD} pr-9`}
        />
        {searching && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted dark:text-ink-dark-muted font-bold animate-pulse">
            جاري البحث...
          </span>
        )}
      </div>
    </label>

    {results.length > 0 && (
      <div className="absolute z-20 top-full mt-1 w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg shadow-xl max-h-56 overflow-y-auto divide-y divide-line dark:divide-line-dark">
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="w-full min-h-12 px-3 py-2 text-right hover:bg-surface-2 dark:hover:bg-surface-dark-3 cursor-pointer flex items-center justify-between gap-3 text-sm transition-colors"
          >
            <span className="flex flex-col min-w-0">
              <span className="font-bold text-ink dark:text-ink-dark truncate">{p.name}</span>
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-mono">{p.barcode || 'بدون باركود'}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-mono font-bold tabular-nums text-paid dark:text-paid-bright">
                {(p.pricePiasters / 100).toFixed(2)} ج.م
              </span>
              {trailing(p)}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
);

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
  const [mode, setMode] = useState<QuickMode>('warehouse');

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

  const isDirty = Boolean(
    name.trim() ||
    priceEgp.trim() ||
    selectedProduct ||
    bundleName.trim() ||
    bundleItems.length > 0
  );

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل إضافة الصنف السريع؟',
    confirmMessage: 'هناك بيانات أو أصناف مضافة في هذا العرض/الصنف السريع، هل تريد الخروج وتجاهلها؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة الإدخال',
  });

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
      const res = await invoke<unknown>('products:search', { query: query.trim(), limit: 8 });
      setSearchResults(extractProducts(res));
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
      const res = await invoke<unknown>('products:search', { query: query.trim(), limit: 8 });
      setBundleSearchResults(extractProducts(res));
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

  const handleModeChange = (next: QuickMode) => {
    setMode(next);
    setError(null);
    if (next === 'bundle' && !bundlePriceEgp && totalBundleOriginalEgp !== '0.00') {
      setBundlePriceEgp(totalBundleOriginalEgp);
    }
  };

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
          color: null,
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

  const showUnitField = isEnabled('feature_scale_weight');
  const shownCategory = isCustomCategory ? customCategoryInput.trim() || 'قسم جديد' : categoryName;
  const shownBundleCategory = isCustomBundleCategory ? customBundleCategoryInput.trim() || 'قسم جديد' : bundleCategoryName;
  const itemExtrasSummary = `${showUnitField ? `${unit === 'kg' ? 'بالوزن' : 'بالقطعة'} · ` : ''}${shownCategory}`;

  const unitField = showUnitField ? (
    <div>
      <FieldLabel>وحدة البيع</FieldLabel>
      <SegmentedTabs
        ariaLabel="وحدة الصنف"
        fullWidth
        value={unit}
        onChange={setUnit}
        options={[
          { value: 'piece', label: 'قطعة / عدد', icon: Package },
          { value: 'kg', label: 'وزن (كجم)', icon: Scale },
        ]}
      />
    </div>
  ) : null;

  const openPriceToggle = (
    <ToggleSwitch
      size="sm"
      checked={isOpenPrice}
      onChange={(checked) => {
        setIsOpenPrice(checked);
        if (checked) setPriceEgp('');
      }}
      label="سعر حر"
      description="الكاشير يكتب السعر عند البيع"
    />
  );

  const priceBlock = (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block flex-1 min-w-[180px]">
          <FieldLabel required={!isOpenPrice}>سعر البيع</FieldLabel>
          <PriceInput
            value={priceEgp}
            onChange={(v) => setPriceEgp(normalizeArabicNumerals(v))}
            step="0.25"
            min="0"
            required={!isOpenPrice}
            disabled={isOpenPrice}
            placeholder={isOpenPrice ? 'سعر حر' : '0.00'}
          />
        </label>
        <div className="h-10 flex items-center">{openPriceToggle}</div>
      </div>
      {!isOpenPrice && mode === 'warehouse' && originalPriceEgp && (
        <InlineNotice tone="ok">
          السعر الأساسي في المخزن: <strong className="font-mono tabular-nums">{originalPriceEgp} ج.م</strong> - تقدر تسيبه أو تعدله لهذا الزر.
        </InlineNotice>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 select-none animate-in fade-in duration-150"
      onClick={handleBackdropClick}
      dir="rtl"
    >
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] text-ink dark:text-ink-dark">

        {/* Header */}
        <div className="h-16 px-5 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="t-modal-title text-ink dark:text-ink-dark leading-tight m-0 truncate">إضافة صنف سريع أو عرض</h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5 truncate">
                زر بنقرة واحدة في شاشة البيع
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="w-10 h-10 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3 flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-5 py-3 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark shrink-0">
          <SegmentedTabs ariaLabel="نوع الصنف السريع" fullWidth value={mode} onChange={handleModeChange} options={MODE_OPTIONS} />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {error && (
              <InlineNotice tone="danger" icon={<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}>
                {error}
              </InlineNotice>
            )}

            {/* Matrix variants shortcut (Feature #114) */}
            {isEnabled('feature_matrix_variants') && onOpenVariantMatrixModal && (
              <div className="rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink dark:text-ink-dark">صنف بمقاسات وألوان؟</div>
                    <div className="text-xs text-ink-muted dark:text-ink-dark-muted">مصفوفة سريعة (مقاس × لون) بباركود لكل خيار</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVariantMatrixModal();
                  }}
                  className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY} shrink-0`}
                >
                  <Plus className="w-4 h-4" />
                  <span>مصفوفة مقاسات</span>
                </button>
              </div>
            )}

            {/* MODE 1: WAREHOUSE PRODUCT (primary) */}
            {mode === 'warehouse' && (
              <>
                <FormSection title="الأساسيات">
                  <ProductSearchBox
                    label="اربط الزر بصنف من المخزن (اختياري)"
                    placeholder="اكتب اسم الصنف أو امسح الباركود..."
                    query={searchQuery}
                    onQueryChange={(q) => void handleProductSearch(q)}
                    searching={isSearching}
                    results={searchResults}
                    onPick={selectWarehouseProduct}
                    trailing={(p) => (
                      <SmallChip tone="neutral">
                        مخزون: <span className="font-mono tabular-nums">{p.stockQuantityMilli / 1000}</span>
                      </SmallChip>
                    )}
                  />

                  {selectedProduct && (
                    <InlineNotice tone="ok" icon={<CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold">تم ربط الصنف: {selectedProduct.name}</div>
                          <div className="font-mono tabular-nums opacity-90">
                            الرصيد المتاح: {selectedProduct.stockQuantityMilli / 1000} {selectedProduct.unit === 'kg' ? 'كجم' : 'قطعة'}
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
                          className="h-8 px-3 rounded-lg text-xs font-bold border border-current/30 hover:bg-surface/50 dark:hover:bg-surface-dark/50 cursor-pointer shrink-0"
                        >
                          تغيير
                        </button>
                      </div>
                    </InlineNotice>
                  )}

                  <label className="block">
                    <FieldLabel required>اسم الزر على الشاشة</FieldLabel>
                    <div className="relative">
                      <Tag className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        placeholder="مثال: عيش فينو، لبن جهينة، خيار..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`${QUICK_FIELD} pr-9`}
                      />
                    </div>
                  </label>

                  {priceBlock}
                </FormSection>

                <ExtrasSection summary={itemExtrasSummary}>
                  {unitField}
                  <CategoryField
                    value={categoryName}
                    onChange={setCategoryName}
                    options={existingCategories}
                    isCustom={isCustomCategory}
                    setIsCustom={setIsCustomCategory}
                    customValue={customCategoryInput}
                    setCustomValue={setCustomCategoryInput}
                  />
                </ExtrasSection>
              </>
            )}

            {/* MODE 2: BUNDLE / COMBO OFFER (e.g. Ramadan Box) */}
            {mode === 'bundle' && (
              <>
                <FormSection title="الأساسيات">
                  <label className="block">
                    <FieldLabel required>اسم العرض / الكرتونة</FieldLabel>
                    <div className="relative">
                      <Tag className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        placeholder="مثال: كرتونة رمضان الخير، باقة السحور..."
                        value={bundleName}
                        onChange={(e) => setBundleName(e.target.value)}
                        className={`${QUICK_FIELD} pr-9`}
                      />
                    </div>
                  </label>

                  <ProductSearchBox
                    label="أضف مكونات العرض من المخزن"
                    placeholder="ابحث عن صنف لإضافته (زيت، سكر، أرز...)"
                    query={bundleSearchQuery}
                    onQueryChange={(q) => void handleBundleSearch(q)}
                    searching={isBundleSearching}
                    results={bundleSearchResults}
                    onPick={addProductToBundle}
                    trailing={() => (
                      <SmallChip tone="ok">
                        <Plus className="w-3 h-3" />
                        <span>إضافة</span>
                      </SmallChip>
                    )}
                  />

                  <div className="rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 overflow-hidden">
                    <div className="h-10 px-3 flex items-center justify-between gap-2 border-b border-line dark:border-line-dark text-sm font-bold text-ink dark:text-ink-dark">
                      <span>
                        المكونات (<span className="tabular-nums">{bundleItems.length}</span>)
                      </span>
                      <span className="text-xs font-mono tabular-nums text-ink-muted dark:text-ink-dark-muted">
                        إجمالي سعرها: {totalBundleOriginalEgp} ج.م
                      </span>
                    </div>

                    {bundleItems.length === 0 ? (
                      <div className="py-6 px-3 text-center text-sm text-ink-muted dark:text-ink-dark-muted">
                        لسه ما ضفتش أي مكونات. ابحث في المخزن فوق وأضفها هنا.
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-line dark:divide-line-dark">
                        {bundleItems.map((item) => (
                          <div key={item.product.id} className="min-h-12 px-3 py-1.5 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-sm text-ink dark:text-ink-dark block truncate">{item.product.name}</span>
                              <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-mono tabular-nums">
                                {((item.product.pricePiasters * item.quantity) / 100).toFixed(2)} ج.م
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3">
                                <button
                                  type="button"
                                  onClick={() => updateBundleItemQuantity(item.product.id, -1)}
                                  className="w-8 h-8 flex items-center justify-center text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-r-lg cursor-pointer"
                                  title="إنقاص الكمية"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-8 text-center font-mono font-extrabold text-sm tabular-nums text-ink dark:text-ink-dark">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateBundleItemQuantity(item.product.id, 1)}
                                  className="w-8 h-8 flex items-center justify-center text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-l-lg cursor-pointer"
                                  title="زيادة الكمية"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeProductFromBundle(item.product.id)}
                                className="w-8 h-8 text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft flex items-center justify-center rounded-lg transition-colors cursor-pointer"
                                title="حذف من العرض"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="block">
                      <FieldLabel required>سعر بيع العرض (الإجمالي)</FieldLabel>
                      <PriceInput
                        value={bundlePriceEgp}
                        onChange={(v) => setBundlePriceEgp(normalizeArabicNumerals(v))}
                        step="0.5"
                        min="1"
                        required
                        placeholder="مثال: 150.00"
                      />
                    </label>
                    {bundleSavingsPiasters > 0 && (
                      <InlineNotice tone="ok" icon={<Percent className="w-4 h-4 shrink-0 mt-0.5" />}>
                        توفير للزبون: <span className="font-mono tabular-nums">{(bundleSavingsPiasters / 100).toFixed(2)} ج.م ({bundleSavingsPercent}%)</span>
                      </InlineNotice>
                    )}
                    <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 leading-relaxed">
                      عند بيع العرض بيتخصم تلقائياً مخزون كل مكون من المخزن.
                    </p>
                  </div>
                </FormSection>

                <ExtrasSection summary={shownBundleCategory}>
                  <CategoryField
                    value={bundleCategoryName}
                    onChange={setBundleCategoryName}
                    options={['عروض وتوفير', ...existingCategories.filter((c) => c !== 'عروض وتوفير')]}
                    isCustom={isCustomBundleCategory}
                    setIsCustom={setIsCustomBundleCategory}
                    customValue={customBundleCategoryInput}
                    setCustomValue={setCustomBundleCategoryInput}
                  />
                </ExtrasSection>
              </>
            )}

            {/* MODE 3: SERVICE / STANDALONE (bags, delivery, ...) */}
            {mode === 'service' && (
              <>
                <FormSection title="الأساسيات">
                  <div>
                    <FieldLabel>نماذج جاهزة</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PRESETS.map((preset) => (
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
                          className="h-9 px-3 text-xs font-bold rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand-soft dark:hover:bg-brand-dark-soft text-ink dark:text-ink-dark border border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 transition-colors active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>{preset.label}</span>
                          {!preset.isOpenPrice && preset.price && (
                            <span className="font-mono tabular-nums text-paid dark:text-paid-bright">{preset.price}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <FieldLabel required>اسم الصنف السريع</FieldLabel>
                    <div className="relative">
                      <Tag className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        placeholder="مثال: كيس بلاستيك كبير، خدمة توصيل..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`${QUICK_FIELD} pr-9`}
                      />
                    </div>
                  </label>

                  {priceBlock}
                </FormSection>

                <ExtrasSection summary={itemExtrasSummary}>
                  {unitField}
                  <CategoryField
                    value={categoryName}
                    onChange={setCategoryName}
                    options={existingCategories}
                    isCustom={isCustomCategory}
                    setIsCustom={setIsCustomCategory}
                    customValue={customCategoryInput}
                    setCustomValue={setCustomCategoryInput}
                  />
                </ExtrasSection>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between gap-2 shrink-0">
            {onOpenFullManager ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullManager();
                }}
                className="h-10 px-3 rounded-lg inline-flex items-center gap-2 text-sm font-bold text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:bg-surface dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                <span>إدارة وترتيب الأزرار السريعة</span>
              </button>
            ) : <span />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void requestClose()}
                disabled={loading}
                className={`${QUICK_BTN} ${QUICK_BTN_SECONDARY}`}
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`${QUICK_BTN} ${QUICK_BTN_PRIMARY} px-5`}
              >
                {loading ? (
                  <span>جاري الحفظ...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>{mode === 'bundle' ? 'حفظ العرض' : 'حفظ وإضافة'}</span>
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
