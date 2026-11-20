import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  UploadCloud,
  X,
  Boxes,
  Layers,
  Check,
  Filter,
  ShieldCheck,
  Info,
  AlertTriangle,
  Folder,
  ChevronDown,
  Package,
} from 'lucide-react';
import { AppButton } from '../AppButton';
import { ToggleSwitch } from '../ToggleSwitch';
import { SearchInput } from '../SearchInput';
import { invoke } from '../../bridge/ipc';
import {
  getCatalogSyncStats,
  getCategoryProducts,
  type CatalogSyncOptions,
  type CategoryProductItem,
} from '../../bridge/onlineStoreIpc';

interface CategoryItem {
  id: string;
  name: string;
  productCount?: number;
  isActive?: boolean;
}

export interface UploadCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmUpload: (options: CatalogSyncOptions) => Promise<void>;
  isUploading: boolean;
}

export const UploadCatalogModal: React.FC<UploadCatalogModalProps> = ({
  isOpen,
  onClose,
  onConfirmUpload,
  isUploading,
}) => {
  const [scope, setScope] = useState<'all' | 'custom'>('all');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [excludedProductIds, setExcludedProductIds] = useState<string[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [categoryProductsMap, setCategoryProductsMap] = useState<Record<string, CategoryProductItem[]>>({});
  const [loadingCategoryProducts, setLoadingCategoryProducts] = useState<Record<string, boolean>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQueries, setProductSearchQueries] = useState<Record<string, string>>({});

  const [onlyInStock, setOnlyInStock] = useState(true);
  const [onlyOnline, setOnlyOnline] = useState(true);
  const [statsCount, setStatsCount] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingCats, setLoadingCats] = useState(false);

  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Load categories on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingCats(true);

    invoke<CategoryItem[]>('categories:getAll', { includeArchived: false })
      .then((res) => {
        if (!isMounted) return;
        const validCats = Array.isArray(res)
          ? res.filter((c) => c && c.isActive !== false)
          : [];
        setCategories(validCats);
        setSelectedCategoryIds(validCats.map((c) => c.id));
        setExcludedProductIds([]);
        setExpandedCategoryIds([]);
      })
      .catch(() => {
        if (!isMounted) return;
        setCategories([]);
        setSelectedCategoryIds([]);
      })
      .finally(() => {
        if (isMounted) setLoadingCats(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Master Checkbox state logic
  const isAllCategoriesSelected = useMemo(() => {
    return (
      categories.length > 0 &&
      selectedCategoryIds.length === categories.length &&
      excludedProductIds.length === 0
    );
  }, [categories, selectedCategoryIds, excludedProductIds]);

  const isNoneCategoriesSelected = useMemo(() => {
    return selectedCategoryIds.length === 0;
  }, [selectedCategoryIds]);

  const isMasterIndeterminate = useMemo(() => {
    return !isAllCategoriesSelected && !isNoneCategoriesSelected;
  }, [isAllCategoriesSelected, isNoneCategoriesSelected]);

  // Update HTML input indeterminate property
  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isMasterIndeterminate;
    }
  }, [isMasterIndeterminate]);

  // Master toggle handler
  const handleMasterToggle = () => {
    if (isUploading) return;
    if (isAllCategoriesSelected) {
      // Deselect all
      setSelectedCategoryIds([]);
      setExcludedProductIds([]);
    } else {
      // Select all
      setSelectedCategoryIds(categories.map((c) => c.id));
      setExcludedProductIds([]);
    }
  };

  const handleSelectAll = () => {
    setSelectedCategoryIds(categories.map((c) => c.id));
    setExcludedProductIds([]);
  };

  const handleDeselectAll = () => {
    setSelectedCategoryIds([]);
    setExcludedProductIds([]);
  };

  // Lazy load products when expanding a category
  const toggleCategoryExpand = async (catId: string) => {
    const isExpanded = expandedCategoryIds.includes(catId);
    if (isExpanded) {
      setExpandedCategoryIds((prev) => prev.filter((id) => id !== catId));
    } else {
      setExpandedCategoryIds((prev) => [...prev, catId]);
      if (!categoryProductsMap[catId]) {
        setLoadingCategoryProducts((prev) => ({ ...prev, [catId]: true }));
        try {
          const prods = await getCategoryProducts(catId, false, false);
          setCategoryProductsMap((prev) => ({ ...prev, [catId]: prods || [] }));
        } catch {
          setCategoryProductsMap((prev) => ({ ...prev, [catId]: [] }));
        } finally {
          setLoadingCategoryProducts((prev) => ({ ...prev, [catId]: false }));
        }
      }
    }
  };

  // Toggle Category Checkbox
  const toggleCategorySelection = (catId: string) => {
    if (isUploading) return;
    const isSelected = selectedCategoryIds.includes(catId);
    const catProds = categoryProductsMap[catId] || [];

    if (isSelected) {
      // Uncheck category -> remove from selectedCategoryIds and clean up its excluded products
      setSelectedCategoryIds((prev) => prev.filter((id) => id !== catId));
      if (catProds.length > 0) {
        const catProdIds = new Set(catProds.map((p) => p.id));
        setExcludedProductIds((prev) => prev.filter((id) => !catProdIds.has(id)));
      }
    } else {
      // Check category -> add to selectedCategoryIds and include all its products
      setSelectedCategoryIds((prev) => [...prev, catId]);
      if (catProds.length > 0) {
        const catProdIds = new Set(catProds.map((p) => p.id));
        setExcludedProductIds((prev) => prev.filter((id) => !catProdIds.has(id)));
      }
    }
  };

  // Toggle Single Product Checkbox
  const toggleProductSelection = (catId: string, prodId: string) => {
    if (isUploading) return;

    // Ensure category is selected
    if (!selectedCategoryIds.includes(catId)) {
      setSelectedCategoryIds((prev) => [...prev, catId]);
    }

    const isExcluded = excludedProductIds.includes(prodId);
    if (isExcluded) {
      // Re-include product
      setExcludedProductIds((prev) => prev.filter((id) => id !== prodId));
    } else {
      // Exclude product
      const nextExcluded = [...excludedProductIds, prodId];
      setExcludedProductIds(nextExcluded);

      // Check if ALL products of this category are now excluded
      const catProds = categoryProductsMap[catId] || [];
      if (catProds.length > 0) {
        const catProdIds = catProds.map((p) => p.id);
        const allExcluded = catProdIds.every((id) => nextExcluded.includes(id));
        if (allExcluded) {
          // Deselect the category itself
          setSelectedCategoryIds((prev) => prev.filter((id) => id !== catId));
          setExcludedProductIds((prev) => prev.filter((id) => !catProdIds.includes(id)));
        }
      }
    }
  };

  // Category selection helpers
  const getCategoryStatus = (cat: CategoryItem) => {
    const isCatSelected = selectedCategoryIds.includes(cat.id);
    if (!isCatSelected) return { isChecked: false, isIndeterminate: false, selectedCount: 0 };

    const catProds = categoryProductsMap[cat.id];
    if (!catProds || catProds.length === 0) {
      // If products not loaded yet, use category productCount
      return { isChecked: true, isIndeterminate: false, selectedCount: cat.productCount ?? 0 };
    }

    const excludedCount = catProds.filter((p) => excludedProductIds.includes(p.id)).length;
    const selectedCount = catProds.length - excludedCount;

    if (selectedCount === catProds.length) {
      return { isChecked: true, isIndeterminate: false, selectedCount };
    }
    if (selectedCount > 0) {
      return { isChecked: false, isIndeterminate: true, selectedCount };
    }
    return { isChecked: false, isIndeterminate: false, selectedCount: 0 };
  };

  // Refresh live matching product stats
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const catIds = scope === 'custom' ? selectedCategoryIds : undefined;
      const exIds = scope === 'custom' && excludedProductIds.length > 0 ? excludedProductIds : undefined;

      const res = await getCatalogSyncStats({
        onlyInStock,
        onlyOnline,
        categoryIds: catIds,
        excludedProductIds: exIds,
      });
      setStatsCount(res?.count ?? 0);
    } catch {
      setStatsCount(null);
    } finally {
      setLoadingStats(false);
    }
  }, [scope, selectedCategoryIds, excludedProductIds, onlyInStock, onlyOnline]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void fetchStats();
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen, fetchStats]);

  // Filtered categories by search query
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  const handleConfirm = async () => {
    if (scope === 'custom' && selectedCategoryIds.length === 0) return;

    const options: CatalogSyncOptions = {
      fullCatalog: true,
      categoryIds: scope === 'custom' ? selectedCategoryIds : undefined,
      excludedProductIds: scope === 'custom' && excludedProductIds.length > 0 ? excludedProductIds : undefined,
      onlyInStock,
      onlyOnline,
      pruneOutOfStock: scope === 'all', // Only prune when uploading full store catalog
    };

    await onConfirmUpload(options);
  };

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen || isUploading) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isUploading, onClose]);

  if (!isOpen) return null;

  const isConfirmDisabled =
    isUploading || (scope === 'custom' && selectedCategoryIds.length === 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-2xl bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark flex flex-col max-h-[92vh] overflow-hidden text-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark bg-canvas dark:bg-surface-dark-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright flex items-center justify-center shrink-0 shadow-sm border border-paid/20">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink dark:text-ink-dark">
                رفع الكتالوج للمتجر الإلكتروني
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark mt-0.5">
                حدد نطاق الأقسام والأصناف المطلوبة لمزامنتها مع المتجر أونلاين
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark dark:text-ink-muted-dark dark:hover:text-ink-dark transition-colors disabled:opacity-50"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Scope Selection Cards */}
          <div>
            <label className="block text-xs font-bold text-ink dark:text-ink-dark mb-2.5">
              نطاق الرفع والمزامنة
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScope('all')}
                disabled={isUploading}
                className={`p-3.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
                  scope === 'all'
                    ? 'border-brand bg-brand-soft/40 dark:bg-brand-dark/20 dark:border-brand-soft text-brand-dark dark:text-white shadow-sm ring-1 ring-brand'
                    : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-brand dark:text-brand-soft shrink-0" />
                    الكتالوج بالكامل
                  </span>
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      scope === 'all'
                        ? 'border-brand bg-brand text-white dark:border-brand-soft'
                        : 'border-line dark:border-line-dark'
                    }`}
                  >
                    {scope === 'all' && <span className="w-2 h-2 rounded-full bg-white" />}
                  </span>
                </div>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                  مزامنة جميع أقسام المحل وأصنافها المؤهلة في عملية واحدة
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('custom')}
                disabled={isUploading}
                className={`p-3.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
                  scope === 'custom'
                    ? 'border-brand bg-brand-soft/40 dark:bg-brand-dark/20 dark:border-brand-soft text-brand-dark dark:text-white shadow-sm ring-1 ring-brand'
                    : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-brand dark:text-brand-soft shrink-0" />
                    أقسام وأصناف محددة
                  </span>
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      scope === 'custom'
                        ? 'border-brand bg-brand text-white dark:border-brand-soft'
                        : 'border-line dark:border-line-dark'
                    }`}
                  >
                    {scope === 'custom' && <span className="w-2 h-2 rounded-full bg-white" />}
                  </span>
                </div>
                <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                  تحديد أقسام معينة أو اختيار أصناف مخصصة من داخل كل قسم
                </p>
              </button>
            </div>
          </div>

          {/* Categories Selector (When Custom Scope) */}
          {scope === 'custom' && (
            <div className="p-4 rounded-xl border border-line dark:border-line-dark bg-canvas dark:bg-surface-dark-2 space-y-3 animate-fade-in">
              {/* Header with Master Checkbox & Quick Actions */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-line/60 dark:border-line-dark/60">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    ref={masterCheckboxRef}
                    checked={isAllCategoriesSelected}
                    onChange={handleMasterToggle}
                    disabled={isUploading || categories.length === 0}
                    className="cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <Folder className="w-4 h-4 text-brand dark:text-brand-soft" />
                    <span className="text-xs font-bold text-ink dark:text-ink-dark">
                      {isAllCategoriesSelected
                        ? 'تحديد الكل (كافة الأقسام مشمولة)'
                        : isNoneCategoriesSelected
                        ? 'تحديد الكل (لم يتم تحديد أي قسم)'
                        : `تحديد جزئي (${selectedCategoryIds.length} من ${categories.length} قسم)`}
                    </span>
                  </div>
                </label>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={isUploading || isAllCategoriesSelected}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 disabled:opacity-40 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 text-paid" />
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={isUploading || isNoneCategoriesSelected}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 disabled:opacity-40 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-danger" />
                    إلغاء التحديد
                  </button>
                </div>
              </div>

              {/* Search input for categories */}
              {categories.length > 5 && (
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="ابحث في أسماء الأقسام..."
                  size="sm"
                  ariaLabel="البحث في الأقسام"
                />
              )}

              {/* Category Items List with Accordion / Drill-down */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                {loadingCats ? (
                  <p className="text-xs text-center py-4 text-ink-muted dark:text-ink-muted-dark">
                    جاري تحميل الأقسام...
                  </p>
                ) : filteredCategories.length === 0 ? (
                  <p className="text-xs text-center py-4 text-ink-muted dark:text-ink-muted-dark">
                    لا توجد أقسام مطابقة للبحث
                  </p>
                ) : (
                  filteredCategories.map((c) => {
                    const status = getCategoryStatus(c);
                    const isExpanded = expandedCategoryIds.includes(c.id);
                    const prods = categoryProductsMap[c.id] || [];
                    const isLoadingProds = loadingCategoryProducts[c.id] || false;
                    const prodSearch = (productSearchQueries[c.id] || '').trim().toLowerCase();

                    const filteredProds = prodSearch
                      ? prods.filter((p) => p.name.toLowerCase().includes(prodSearch))
                      : prods;

                    return (
                      <div
                        key={c.id}
                        className={`rounded-xl border transition-all ${
                          status.isChecked || status.isIndeterminate
                            ? 'bg-surface dark:bg-surface-dark border-brand/50 shadow-2xs'
                            : 'bg-surface/60 dark:bg-surface-dark/60 border-line dark:border-line-dark opacity-90'
                        }`}
                      >
                        {/* Category Header Row */}
                        <div className="flex items-center justify-between p-3 select-none">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={status.isChecked}
                              ref={(el) => {
                                if (el) el.indeterminate = status.isIndeterminate;
                              }}
                              onChange={() => toggleCategorySelection(c.id)}
                              disabled={isUploading}
                              className="cursor-pointer shrink-0"
                            />
                            <span
                              onClick={() => toggleCategorySelection(c.id)}
                              className="font-bold text-xs text-ink dark:text-ink-dark truncate cursor-pointer hover:text-brand transition-colors"
                            >
                              {c.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-ink-muted dark:text-ink-muted-dark bg-surface-2 dark:bg-surface-dark-2 px-2 py-0.5 rounded border border-line/50 dark:border-line-dark/50 font-medium">
                              {status.selectedCount} من {c.productCount ?? 0} صنف
                            </span>

                            {/* Drill-down Toggle Button */}
                            <button
                              type="button"
                              onClick={() => void toggleCategoryExpand(c.id)}
                              disabled={isUploading}
                              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
                                isExpanded
                                  ? 'bg-brand text-white border-brand shadow-xs'
                                  : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                              }`}
                              title={isExpanded ? 'إخفاء أصناف القسم' : 'عرض وتحديد الأصناف من هذا القسم'}
                            >
                              <Package className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">
                                {isExpanded ? 'إخفاء الأصناف' : 'تخصيص الأصناف'}
                              </span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Products Sub-list */}
                        {isExpanded && (
                          <div className="border-t border-line/60 dark:border-line-dark/60 bg-canvas/60 dark:bg-surface-dark-2/60 p-3 rounded-b-xl space-y-2 animate-fade-in">
                            {/* Product Sub-toolbar */}
                            <div className="flex items-center justify-between gap-2 text-xs text-ink-muted dark:text-ink-muted-dark pb-1">
                              <span>قائمة أصناف قسم ({c.name}):</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Include all in this category
                                    if (!selectedCategoryIds.includes(c.id)) {
                                      setSelectedCategoryIds((prev) => [...prev, c.id]);
                                    }
                                    const catProdIds = new Set(prods.map((p) => p.id));
                                    setExcludedProductIds((prev) =>
                                      prev.filter((id) => !catProdIds.has(id))
                                    );
                                  }}
                                  className="text-xs text-paid dark:text-paid-bright hover:underline font-medium"
                                >
                                  تحديد الكل
                                </button>
                                <span>•</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Exclude all in this category
                                    const catProdIds = prods.map((p) => p.id);
                                    setExcludedProductIds((prev) => [...new Set([...prev, ...catProdIds])]);
                                    setSelectedCategoryIds((prev) => prev.filter((id) => id !== c.id));
                                  }}
                                  className="text-xs text-danger dark:text-danger-bright hover:underline font-medium"
                                >
                                  إلغاء الكل
                                </button>
                              </div>
                            </div>

                            {/* Search inside this category if > 5 products */}
                            {prods.length > 5 && (
                              <SearchInput
                                value={productSearchQueries[c.id] || ''}
                                onChange={(val) =>
                                  setProductSearchQueries((prev) => ({ ...prev, [c.id]: val }))
                                }
                                placeholder="ابحث داخل هذا القسم..."
                                size="sm"
                                ariaLabel={`البحث داخل قسم ${c.name}`}
                              />
                            )}

                            {/* Product Rows */}
                            <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                              {isLoadingProds ? (
                                <p className="text-xs text-center py-3 text-ink-muted dark:text-ink-muted-dark">
                                  جاري تحميل أصناف القسم...
                                </p>
                              ) : filteredProds.length === 0 ? (
                                <p className="text-xs text-center py-3 text-ink-muted dark:text-ink-muted-dark">
                                  لا توجد أصناف مطابقة داخل هذا القسم
                                </p>
                              ) : (
                                filteredProds.map((p) => {
                                  const isProdExcluded = excludedProductIds.includes(p.id);
                                  const isProdSelected =
                                    selectedCategoryIds.includes(c.id) && !isProdExcluded;

                                  const isOutOfStock = p.stockQuantityMilli <= 0;

                                  return (
                                    <div
                                      key={p.id}
                                      onClick={() => toggleProductSelection(c.id, p.id)}
                                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                                        isProdSelected
                                          ? 'bg-surface dark:bg-surface-dark border-brand/40 text-ink dark:text-ink-dark'
                                          : 'bg-surface/40 dark:bg-surface-dark/40 border-line/50 text-ink-muted dark:text-ink-muted-dark hover:bg-surface dark:hover:bg-surface-dark'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isProdSelected}
                                          onChange={() => toggleProductSelection(c.id, p.id)}
                                          disabled={isUploading}
                                          className="cursor-pointer shrink-0"
                                        />
                                        <span className="truncate">{p.name}</span>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs font-bold text-ink dark:text-ink-dark">
                                          {p.priceFormatted}
                                        </span>
                                        <span
                                          className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                            isOutOfStock
                                              ? 'bg-warn-soft text-warn dark:bg-warn-dark-soft dark:text-warn-bright'
                                              : 'bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright'
                                          }`}
                                        >
                                          الرصيد: {p.stockFormatted}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {selectedCategoryIds.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-danger font-medium pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  يرجى تحديد قسم واحد على الأقل للبدء
                </div>
              )}
            </div>
          )}

          {/* Product Filter Toggles */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 mb-1">
              <Filter className="w-4 h-4 text-brand dark:text-brand-soft" />
              <label className="text-xs font-bold text-ink dark:text-ink-dark">
                شروط وفلاتر الأصناف
              </label>
            </div>

            <div className="p-3.5 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-ink dark:text-ink-dark block">
                    رفع الأصناف المتوفرة فقط (الرصيد بالمخزن &gt; 0)
                  </span>
                  <span className="text-xs text-ink-muted dark:text-ink-muted-dark block">
                    يمنع ظهور الأصناف النافذة على الموقع لحماية المحل من طلبات غير متوفرة
                  </span>
                </div>
                <ToggleSwitch
                  checked={onlyInStock}
                  onChange={setOnlyInStock}
                  disabled={isUploading}
                  size="sm"
                />
              </div>

              <div className="border-t border-line/60 dark:border-line-dark/60 pt-3 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-ink dark:text-ink-dark block">
                    الأصناف المحددة للمتجر أونلاين فقط
                  </span>
                  <span className="text-xs text-ink-muted dark:text-ink-muted-dark block">
                    رفع الأصناف التي تم تفعيل خيار البيع أونلاين لها في بطاقة الصنف
                  </span>
                </div>
                <ToggleSwitch
                  checked={onlyOnline}
                  onChange={setOnlyOnline}
                  disabled={isUploading}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Safety & Pruning Notice */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              scope === 'custom'
                ? 'bg-paid-soft text-paid-dark border-paid/30 dark:bg-paid-dark-soft dark:text-paid-bright'
                : 'bg-surface-2 text-ink-muted border-line dark:bg-surface-dark-2 dark:text-ink-muted-dark dark:border-line-dark'
            }`}
          >
            {scope === 'custom' ? (
              <ShieldCheck className="w-4 h-4 shrink-0 text-paid mt-0.5" />
            ) : (
              <Info className="w-4 h-4 shrink-0 text-ink-muted dark:text-ink-muted-dark mt-0.5" />
            )}
            <div className="leading-relaxed">
              {scope === 'custom' ? (
                <>
                  <strong className="font-semibold text-paid-dark dark:text-paid-bright">
                    حماية تلقائية للمتجر:
                  </strong>{' '}
                  عند اختيار أقسام أو أصناف معينة، سيتم تحديث هذه المنتجات فقط دون المساس ببقية
                  الأصناف المرفوعة سابقاً من الأقسام الأخرى على المتجر الإلكتروني.
                </>
              ) : (
                <>
                  <strong className="font-semibold text-ink dark:text-ink-dark">
                    تنظيف تلقائي:
                  </strong>{' '}
                  مزامنة الكتالوج بالكامل ستقوم بتحديث كافة الأصناف وإخفاء أي منتجات محذوفة
                  أو نفدت كميتها من المتجر الإلكتروني.
                </>
              )}
            </div>
          </div>

          {/* Live Matching Summary Badge & Helpful Out-of-Stock Advice */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-canvas dark:bg-surface-dark-2 border border-line dark:border-line-dark">
              <span className="text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
                الأصناف المتوقع رفعها ومزامنتها:
              </span>
              <span className="text-sm font-bold text-brand dark:text-brand-soft">
                {loadingStats ? (
                  <span className="text-xs font-normal opacity-60">جاري الحساب...</span>
                ) : statsCount !== null ? (
                  `${statsCount} صنف مؤهل`
                ) : (
                  '--'
                )}
              </span>
            </div>

            {statsCount === 0 && onlyInStock && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warn-soft/60 text-warn-dark border border-warn/30 text-xs leading-relaxed animate-fade-in">
                <Info className="w-4 h-4 shrink-0 text-warn" />
                <span>
                  ملاحظة: الرصيد المخزني الحالي لهذه الأصناف هو 0، لذلك تم استثناؤها بواسطة شرط (المتوفر فقط). قم بتعطيل الخيار بالأعلى لرفع المنتجات برصيد 0.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-line dark:border-line-dark bg-canvas dark:bg-surface-dark-2 flex items-center justify-end gap-3">
          <AppButton
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isUploading}
          >
            إلغاء
          </AppButton>
          <AppButton
            variant="primary"
            size="md"
            icon={UploadCloud}
            loading={isUploading}
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            {isUploading ? 'جاري الرفع...' : 'بدء الرفع للسحابة'}
          </AppButton>
        </div>
      </div>
    </div>
  );
};
