import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Category, Product } from '../../types';
import { ToggleSwitch } from './ToggleSwitch';
import { SmartPublishModal, type SmartPublishPreset } from './SmartPublishModal';
import { SingleDescriptionModal } from './SingleDescriptionModal';
import { BulkDescriptionModal } from './BulkDescriptionModal';
import { ProductPhotosModal } from './ProductPhotosModal';
import {
  Search,
  Camera,
  Star,
  LayoutGrid,
  List,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  Eye,
  EyeOff,
  FileEdit,
  FileText,
  Check,
  Loader2,
  Layers,
  ShieldCheck,
  Undo2,
  FolderOpen,
  AlertTriangle,
  Zap,
  ArrowUpDown,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

export interface CatalogUndoAction {
  label: string;
  onUndo: () => Promise<void> | void;
}

interface Props {
  categories: Category[];
  products: Product[];
  uploadingImageProductId: string | null;
  isBulkUpdating?: boolean;
  updatingCategoryId?: string | null;
  feedback: { type: 'success' | 'error'; text: string } | null;
  undoAction?: CatalogUndoAction | null;
  onDismissFeedback: () => void;
  onUploadImage: (productId: string, file: File | null) => void;
  onAddImageUrl?: (productId: string, url: string) => Promise<void> | void;
  onDeleteImage: (productId: string, url: string) => void;
  onToggleVisibility: (productId: string) => void;
  onToggleFeatured: (productId: string) => void;
  onSaveDescription: (productId: string, description: string) => Promise<void>;
  onBatchSaveDescriptions?: (updates: Array<{ id: string; description: string }>) => Promise<void>;
  onSmartPublish?: (preset: SmartPublishPreset, categoryId?: string) => Promise<void>;
  onToggleCategoryVisibility: (
    categoryId: string,
    nextOnline: boolean,
    cascadeProducts?: boolean
  ) => Promise<void> | void;
  onBulkToggleCategoriesVisibility: (
    categoryIds: string[],
    nextOnline: boolean
  ) => Promise<void> | void;
  onBulkUpdateProducts: (
    productIds: string[],
    patch: { is_online?: number; is_featured?: number }
  ) => Promise<void> | void;
}

type ProductFilter = 'all' | 'online' | 'hidden' | 'no_images' | 'no_desc' | 'featured';
type SortOption = 'default' | 'stock_desc' | 'stock_asc' | 'price_desc' | 'price_asc' | 'name_asc';

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
}

const SORT_LABELS: Record<SortOption, string> = {
  default: 'الترتيب الافتراضي',
  stock_desc: 'الأعلى مخزوناً',
  stock_asc: 'الأقل مخزوناً',
  price_desc: 'الأعلى سعراً',
  price_asc: 'الأقل سعراً',
  name_asc: 'أبجدياً (أ - ي)',
};

export const ProductsManagerPanel: React.FC<Props> = ({
  categories,
  products,
  uploadingImageProductId,
  isBulkUpdating = false,
  updatingCategoryId = null,
  feedback,
  undoAction = null,
  onDismissFeedback,
  onUploadImage,
  onAddImageUrl,
  onDeleteImage,
  onToggleVisibility,
  onToggleFeatured,
  onSaveDescription,
  onBatchSaveDescriptions,
  onSmartPublish,
  onToggleCategoryVisibility,
  onBulkToggleCategoriesVisibility,
  onBulkUpdateProducts,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [categorySearch, setCategorySearch] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [isSortOpen, setIsSortOpen] = useState(false);
  // Layout: Default on phone/mobile (< 1024px) is ALWAYS 'grid' (بطاقات), on desktop 'list' (قائمة)
  const [layout, setLayoutState] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list';
    if (window.innerWidth < 1024) return 'grid';
    try {
      const saved = localStorage.getItem('rafiq_admin_catalog_layout_desktop') as 'list' | 'grid' | null;
      if (saved === 'list' || saved === 'grid') return saved;
    } catch {}
    return 'list';
  });

  const setLayout = (nextLayout: 'list' | 'grid') => {
    setLayoutState(nextLayout);
    try {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      if (!isMobile) {
        localStorage.setItem('rafiq_admin_catalog_layout_desktop', nextLayout);
      }
    } catch {}
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(50);

  // Categories rail collapse state: Default on phone (< 1024px) is closed (false) so it doesn't push products down
  const [isCategoryRailOpen, setIsCategoryRailOpenState] = useState<boolean>(() => {
    try {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const key = isMobile ? 'rafiq_admin_catalog_rail_open_mobile' : 'rafiq_admin_catalog_rail_open_desktop';
      const saved = localStorage.getItem(key);
      if (saved !== null) return saved !== 'false';
      if (isMobile) return false;
    } catch {}
    return true;
  });

  const toggleCategoryRail = (open: boolean) => {
    setIsCategoryRailOpenState(open);
    try {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const key = isMobile ? 'rafiq_admin_catalog_rail_open_mobile' : 'rafiq_admin_catalog_rail_open_desktop';
      localStorage.setItem(key, String(open));
    } catch {}
  };

  // Modals
  const [isSmartPublishOpen, setIsSmartPublishOpen] = useState(false);
  const [isSmartPublishing, setIsSmartPublishing] = useState(false);
  const [singleDescProduct, setSingleDescProduct] = useState<Product | null>(null);
  const [isBulkDescOpen, setIsBulkDescOpen] = useState(false);
  const [isBulkSavingDesc, setIsBulkSavingDesc] = useState(false);
  const [photosModalProduct, setPhotosModalProduct] = useState<Product | null>(null);

  const lastClickedIndexRef = useRef<number | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset progressive load when search or filter changes
  useEffect(() => {
    setVisibleCount(50);
  }, [selectedCategoryId, search, filter, layout]);

  // Close confirmation dialog or clear bulk selection with Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDialog) {
          setConfirmDialog(null);
        } else if (selectedIds.size > 0) {
          setSelectedIds(new Set());
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDialog, selectedIds.size]);

  // Clean real categories (exclude virtual 'all')
  const realCategories = useMemo(
    () => categories.filter(c => c.id !== 'all' && c.id !== 'cat-1'),
    [categories]
  );

  // Map category_id -> Category for instant O(1) lookups
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of realCategories) {
      map.set(c.id, c);
    }
    return map;
  }, [realCategories]);

  const hiddenCategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of realCategories) {
      if (c.is_online === 0) set.add(c.id);
    }
    return set;
  }, [realCategories]);

  // Helper: is product individually enabled online?
  const isProductSelfOnline = (p: Product): boolean => p.is_online !== 0;

  // Helper: is product ACTUALLY visible to storefront customers?
  const isProductEffectivelyVisible = (p: Product): boolean => {
    if (!isProductSelfOnline(p)) return false;
    if (p.category_id && hiddenCategoryIds.has(p.category_id)) return false;
    return true;
  };

  // Live per-category statistics derived directly from current products & categories
  const categoryStats = useMemo(() => {
    const map = new Map<string, { total: number; effectiveVisible: number; selfOnline: number; selfHidden: number }>();
    for (const c of realCategories) {
      map.set(c.id, { total: 0, effectiveVisible: 0, selfOnline: 0, selfHidden: 0 });
    }
    let uncategorizedTotal = 0;
    let uncategorizedVisible = 0;

    for (const p of products) {
      const selfOn = isProductSelfOnline(p);
      const effOn = isProductEffectivelyVisible(p);
      if (p.category_id && map.has(p.category_id)) {
        const st = map.get(p.category_id)!;
        st.total++;
        if (effOn) st.effectiveVisible++;
        if (selfOn) st.selfOnline++;
        else st.selfHidden++;
      } else {
        uncategorizedTotal++;
        if (effOn) uncategorizedVisible++;
      }
    }

    return { byId: map, uncategorizedTotal, uncategorizedVisible };
  }, [products, realCategories, hiddenCategoryIds]);

  // Global KPI stats for header
  const globalStats = useMemo(() => {
    let effectiveOnline = 0;
    let effectiveHidden = 0;
    let withImages = 0;
    let inStockCount = 0;
    let outOfStockCount = 0;
    for (const p of products) {
      if (isProductEffectivelyVisible(p)) effectiveOnline++;
      else effectiveHidden++;
      if (p.image_urls && p.image_urls.length > 0) withImages++;
      if (p.stock_quantity > 0) inStockCount++;
      else outOfStockCount++;
    }
    const visibleCategoriesCount = realCategories.filter(c => c.is_online !== 0).length;
    const coveragePct = products.length > 0 ? Math.round((withImages / products.length) * 100) : 0;
    return {
      totalProducts: products.length,
      effectiveOnline,
      effectiveHidden,
      withImages,
      inStockCount,
      outOfStockCount,
      coveragePct,
      totalCategories: realCategories.length,
      visibleCategoriesCount,
      hiddenCategoriesCount: realCategories.length - visibleCategoriesCount,
    };
  }, [products, realCategories, hiddenCategoryIds]);

  // Categories filtered by quick search inside the rail
  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return realCategories;
    return realCategories.filter(c => c.name.toLowerCase().includes(q));
  }, [realCategories, categorySearch]);

  // Products scoped to the selected category
  const categoryScopedProducts = useMemo(() => {
    if (selectedCategoryId === 'all') return products;
    if (selectedCategoryId === '__uncategorized__') {
      return products.filter(p => !p.category_id || !categoryMap.has(p.category_id));
    }
    return products.filter(p => p.category_id === selectedCategoryId);
  }, [products, selectedCategoryId, categoryMap]);

  // Filter chip counts scoped to selected category (only relevant ones, out_of_stock removed)
  const scopedCounts = useMemo(() => {
    let online = 0;
    let hidden = 0;
    let noDesc = 0;
    let featured = 0;
    let noImages = 0;
    for (const p of categoryScopedProducts) {
      if (isProductEffectivelyVisible(p)) online++;
      else hidden++;
      if (!p.description || !p.description.trim()) noDesc++;
      if (p.is_featured === 1) featured++;
      if (!p.image_urls || p.image_urls.length === 0) noImages++;
    }
    return {
      all: categoryScopedProducts.length,
      online,
      hidden,
      noImages,
      noDesc,
      featured,
    };
  }, [categoryScopedProducts, hiddenCategoryIds]);

  // Final filtered & sorted products shown in the workspace
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = categoryScopedProducts.filter(p => {
      const effOnline = isProductEffectivelyVisible(p);
      if (filter === 'online' && !effOnline) return false;
      if (filter === 'hidden' && effOnline) return false;
      if (filter === 'no_images' && p.image_urls && p.image_urls.length > 0) return false;
      if (filter === 'no_desc' && Boolean(p.description && p.description.trim())) return false;
      if (filter === 'featured' && p.is_featured !== 1) return false;

      if (q) {
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesBarcode = Boolean(p.barcode && p.barcode.toLowerCase().includes(q));
        const matchesSku = Boolean(p.sku && p.sku.toLowerCase().includes(q));
        const catName = p.category_id ? categoryMap.get(p.category_id)?.name || '' : '';
        const matchesCat = catName.toLowerCase().includes(q);
        return matchesName || matchesBarcode || matchesSku || matchesCat;
      }
      return true;
    });

    // Sorting logic
    if (sortOption === 'stock_desc') {
      return [...list].sort((a, b) => b.stock_quantity - a.stock_quantity);
    }
    if (sortOption === 'stock_asc') {
      return [...list].sort((a, b) => a.stock_quantity - b.stock_quantity);
    }
    if (sortOption === 'price_desc') {
      return [...list].sort((a, b) => b.price_piasters - a.price_piasters);
    }
    if (sortOption === 'price_asc') {
      return [...list].sort((a, b) => a.price_piasters - b.price_piasters);
    }
    if (sortOption === 'name_asc') {
      return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }
    return list;
  }, [categoryScopedProducts, filter, search, categoryMap, hiddenCategoryIds, sortOption]);

  const activeCategory = useMemo(
    () => (selectedCategoryId !== 'all' && selectedCategoryId !== '__uncategorized__' ? categoryMap.get(selectedCategoryId) : null),
    [selectedCategoryId, categoryMap]
  );

  const activeCategoryStat = useMemo(
    () => (activeCategory ? categoryStats.byId.get(activeCategory.id) : null),
    [activeCategory, categoryStats]
  );

  const allFilteredSelected = useMemo(
    () => filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id)),
    [filteredProducts, selectedIds]
  );

  const toggleSelectItem = (id: string, index: number, isShiftKey: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isShiftKey && lastClickedIndexRef.current !== null) {
        const start = Math.min(lastClickedIndexRef.current, index);
        const end = Math.max(lastClickedIndexRef.current, index);
        for (let i = start; i <= end; i++) {
          const item = filteredProducts[i];
          if (item) next.add(item.id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      lastClickedIndexRef.current = index;
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const requestCategoryToggle = (category: Category, nextOnline: boolean) => {
    const stat = categoryStats.byId.get(category.id);
    const affectedCount = stat?.total ?? 0;
    if (!nextOnline && affectedCount > 0) {
      setConfirmDialog({
        title: `إخفاء قسم "${category.name}" بالكامل؟`,
        description: `سيتم إخفاء هذا القسم وجميع أصنافه (${affectedCount} صنف) تلقائياً عن متجرك الإلكتروني. لن يتمكن الزبائن من رؤيتها أو طلبها، بينما تظل متاحة على كاشير المحل بشكل طبيعي تماماً.`,
        confirmLabel: 'إخفاء القسم وأصنافه',
        tone: 'danger',
        onConfirm: async () => {
          setConfirmDialog(null);
          await onToggleCategoryVisibility(category.id, false, false);
        },
      });
      return;
    }
    void onToggleCategoryVisibility(category.id, nextOnline, false);
  };

  const requestAllCategoriesToggle = (nextOnline: boolean) => {
    const targetCats = realCategories.filter(c => (nextOnline ? c.is_online === 0 : c.is_online !== 0));
    if (targetCats.length === 0) return;
    const catIds = targetCats.map(c => c.id);

    setConfirmDialog({
      title: nextOnline ? 'إظهار جميع الأقسام في المتجر؟' : 'إخفاء جميع الأقسام في المتجر؟',
      description: nextOnline
        ? `سيتم إظهار ${catIds.length} قسم في المتجر الإلكتروني بضغطة واحدة.`
        : `سيتم إخفاء جميع الأقسام (${catIds.length} قسم) وأصنافها عن المتجر الإلكتروني. يمكنك دائماً التراجع بضغطة زر. الكاشير في المحل لا يتأثر نهائياً.`,
      confirmLabel: nextOnline ? 'إظهار الكل' : 'إخفاء الكل',
      tone: nextOnline ? 'primary' : 'danger',
      onConfirm: async () => {
        setConfirmDialog(null);
        await onBulkToggleCategoriesVisibility(catIds, nextOnline);
      },
    });
  };

  const executeBulkProductAction = (patch: { is_online?: number; is_featured?: number }, _label: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (patch.is_online === 0) {
      setConfirmDialog({
        title: `إخفاء ${ids.length} صنف عن المتجر؟`,
        description: `سيتم إخفاء الأصناف المحددة (${ids.length} صنف) عن واجهة المتجر الإلكتروني ولن تظهر للزبائن. لا يؤثر ذلك على كاشير المحل أو المخزون الفعلي.`,
        confirmLabel: 'إخفاء الأصناف',
        tone: 'danger',
        onConfirm: async () => {
          setConfirmDialog(null);
          await onBulkUpdateProducts(ids, patch);
          setSelectedIds(new Set());
        },
      });
      return;
    }

    void Promise.resolve(onBulkUpdateProducts(ids, patch)).then(() => {
      setSelectedIds(new Set());
    });
  };

  const triggerUndo = async () => {
    if (!undoAction || isUndoing) return;
    setIsUndoing(true);
    try {
      await undoAction.onUndo();
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      {/* 1. Header Banner & Live Status KPIs */}
      <div className="bg-white rounded-3xl border border-[#DCE1DC] p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-[#E6F2ED] text-[#004D3F] flex items-center justify-center font-bold">
                <Package className="w-4 h-4" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-[#0F172A]">
                مركز التحكم في كتالوج المتجر الإلكتروني
              </h3>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E6F2ED] text-[#004D3F] border border-[#004D3F]/15 text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>يؤثر على المتجر فقط — الكاشير والمخزن بالمحل لا يتأثران</span>
              </span>
            </div>
            <p className="text-xs text-[#52605D] leading-relaxed">
              تحكم بدقة فيما يراه زبائن المتجر أونلاين: أظهر أو أخفِ الأقسام والمنتجات، وصِغ أوصافاً تسويقية مميزة لكل منتج بنقرة واحدة كمنصات التجارة العالمية.
            </p>
          </div>

          {/* Quick Publish Wizard Button */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsSmartPublishOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#004D3F] to-[#00372D] hover:from-[#00372D] hover:to-[#002820] text-white text-xs font-black shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>معالج النشر السريع</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#DCE1DC]/60">
          <div className="bg-[#EAF5EE] border border-[#006D41]/20 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-[#006D41] flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                <span>معروض للعملاء</span>
              </div>
              <div className="text-xl font-black text-[#00372D] font-mono mt-1">
                {globalStats.effectiveOnline}
              </div>
            </div>
            <div className="text-[10px] font-mono font-bold text-[#006D41] bg-white/70 px-2 py-0.5 rounded-lg border border-[#006D41]/20">
              {globalStats.totalProducts > 0 ? Math.round((globalStats.effectiveOnline / globalStats.totalProducts) * 100) : 0}%
            </div>
          </div>

          <div className="bg-[#FDF2F2] border border-[#B23A2E]/20 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-[#B23A2E] flex items-center gap-1">
                <EyeOff className="w-3.5 h-3.5" />
                <span>مخفي عن المتجر</span>
              </div>
              <div className="text-xl font-black text-[#B23A2E] font-mono mt-1">
                {globalStats.effectiveHidden}
              </div>
            </div>
            <div className="text-[10px] font-mono font-bold text-[#B23A2E] bg-white/70 px-2 py-0.5 rounded-lg border border-[#B23A2E]/20">
              {globalStats.totalProducts > 0 ? Math.round((globalStats.effectiveHidden / globalStats.totalProducts) * 100) : 0}%
            </div>
          </div>

          <div className="bg-[#F8FAFC] border border-[#DCE1DC] rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-[#52605D] flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-[#004D3F]" />
                <span>الأقسام الظاهرة</span>
              </div>
              <div className="text-xl font-black text-[#0F172A] font-mono mt-1" dir="ltr">
                {globalStats.visibleCategoriesCount} / {globalStats.totalCategories}
              </div>
            </div>
            <div className="text-[10px] font-mono font-bold text-[#52605D] bg-white px-2 py-0.5 rounded-lg border border-[#DCE1DC]">
              قسم
            </div>
          </div>

          <div className="bg-[#F8FAFC] border border-[#DCE1DC] rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-[#52605D] flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-[#004D3F]" />
                <span>تغطية الصور</span>
              </span>
              <span className="font-black font-mono text-[#004D3F]">{globalStats.coveragePct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#DCE1DC] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#006D41] transition-all duration-300"
                style={{ width: `${globalStats.coveragePct}%` }}
              />
            </div>
            <div className="text-[10px] text-[#52605D] font-medium font-mono text-left">
              {globalStats.withImages} من {globalStats.totalProducts} صنف
            </div>
          </div>
        </div>
      </div>

      {/* 2. Feedback & Undo Banner */}
      {(feedback || undoAction) && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold flex flex-wrap items-center justify-between gap-3 border shadow-sm ${
            feedback?.type === 'error'
              ? 'bg-[#FDF2F2] border-[#B23A2E]/30 text-[#B23A2E]'
              : 'bg-[#EAF5EE] border-[#006D41]/25 text-[#00372D]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback?.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-[#B23A2E] flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#006D41] flex-shrink-0" />
            )}
            <span>{feedback?.text || undoAction?.label}</span>
          </div>

          <div className="flex items-center gap-2">
            {undoAction && feedback?.type !== 'error' && (
              <button
                type="button"
                disabled={isUndoing}
                onClick={() => void triggerUndo()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#004D3F] hover:bg-[#00372D] text-white text-[11px] font-black transition-colors cursor-pointer disabled:opacity-60"
              >
                {isUndoing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                <span>تراجع</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDismissFeedback}
              className="p-1 rounded-lg opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Workspace: Categories Rail + Products Workspace */}
      <div className={`grid grid-cols-1 ${isCategoryRailOpen ? 'lg:grid-cols-[280px_minmax(0,1fr)]' : 'lg:grid-cols-1'} gap-4 items-start`}>
        {/* Right Rail: Categories */}
        {isCategoryRailOpen && (
          <aside className="bg-white rounded-3xl border border-[#DCE1DC] shadow-sm overflow-hidden lg:sticky lg:top-4">
            <div className="p-4 border-b border-[#DCE1DC] bg-[#F8FAFC] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#004D3F]" />
                  <h4 className="text-xs font-black text-[#0F172A]">أقسام المتجر</h4>
                  <span className="px-2 py-0.5 rounded-full bg-[#E6F2ED] text-[#004D3F] text-[10px] font-mono font-black">
                    {realCategories.length}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {realCategories.length > 0 && (
                    <>
                      <button
                        type="button"
                        disabled={isBulkUpdating || globalStats.hiddenCategoriesCount === 0}
                        onClick={() => requestAllCategoriesToggle(true)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-[#006D41] hover:bg-[#EAF5EE] disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        إظهار الكل
                      </button>
                      <span className="text-[#DCE1DC]">|</span>
                      <button
                        type="button"
                        disabled={isBulkUpdating || globalStats.visibleCategoriesCount === 0}
                        onClick={() => requestAllCategoriesToggle(false)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-[#B23A2E] hover:bg-[#FDF2F2] disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        إخفاء الكل
                      </button>
                      <span className="text-[#DCE1DC]">|</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleCategoryRail(false)}
                    className="p-1 rounded-lg text-[#52605D] hover:text-[#0F172A] hover:bg-[#EBECEF] transition-colors cursor-pointer"
                    title="طي شريط الأقسام لتوسيع الجدول"
                  >
                    <PanelRightClose className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            {realCategories.length > 4 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#52605D] absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  placeholder="ابحث عن قسم..."
                  className="w-full pl-7 pr-8 py-1.5 rounded-xl border border-[#DCE1DC] bg-white text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#004D3F]/25"
                />
              </div>
            )}
          </div>

          <div className="p-2 space-y-1 max-h-[560px] overflow-y-auto">
            {/* Master 'All' item */}
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl text-right transition-all cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-[#E6F2ED] text-[#00372D] border border-[#004D3F]/30 font-black shadow-2xs'
                  : 'text-[#0F172A] hover:bg-[#F8FAFC] border border-transparent font-bold'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen className="w-4 h-4 text-[#004D3F] flex-shrink-0" />
                <span className="text-xs truncate">جميع الأقسام والأصناف</span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-[#DCE1DC] text-[#52605D] flex-shrink-0">
                {globalStats.effectiveOnline}/{globalStats.totalProducts}
              </span>
            </button>

            {/* Individual categories */}
            {filteredCategories.map(cat => {
              const isSelected = selectedCategoryId === cat.id;
              const isCatOnline = cat.is_online !== 0;
              const stat = categoryStats.byId.get(cat.id) || {
                total: cat.total_products ?? 0,
                effectiveVisible: cat.visible_products ?? 0,
                selfOnline: 0,
                selfHidden: 0,
              };

              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#E6F2ED] border-[#004D3F]/30 shadow-2xs'
                      : isCatOnline
                      ? 'bg-white border-transparent hover:bg-[#F8FAFC] hover:border-[#DCE1DC]'
                      : 'bg-[#FDF2F2]/50 border-[#B23A2E]/15 hover:bg-[#FDF2F2]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs truncate ${
                          isSelected ? 'font-black text-[#00372D]' : 'font-bold text-[#0F172A]'
                        } ${!isCatOnline ? 'opacity-70 line-through decoration-[#B23A2E]/40' : ''}`}
                      >
                        {cat.name}
                      </span>
                      {!isCatOnline && (
                        <span className="px-1.5 py-0.2 rounded bg-[#B23A2E]/10 text-[#B23A2E] text-[9px] font-black">
                          مخفي
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#52605D] mt-0.5 font-mono">
                      {stat.effectiveVisible} معروض من {stat.total}
                    </div>
                  </div>

                  <div
                    className="flex-shrink-0"
                    onClick={e => e.stopPropagation()}
                    title={isCatOnline ? `إخفاء قسم "${cat.name}" بالكامل عن المتجر` : `إظهار قسم "${cat.name}" بالمتجر`}
                  >
                    <ToggleSwitch
                      size="sm"
                      checked={isCatOnline}
                      disabled={updatingCategoryId === cat.id || isBulkUpdating}
                      onChange={nextVal => requestCategoryToggle(cat, nextVal)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
        )}

        {/* Left Main Workspace */}
        <div className="space-y-4 min-w-0">
          {/* Active Category Header (if specific category selected) */}
          {activeCategory && (
            <div
              className={`rounded-3xl border p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 ${
                activeCategory.is_online === 0
                  ? 'bg-[#FDF2F2] border-[#B23A2E]/25'
                  : 'bg-white border-[#DCE1DC]'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-black text-[#0F172A]">{activeCategory.name}</h4>
                  {activeCategory.is_online === 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#B23A2E] text-white text-[10px] font-black">
                      <EyeOff className="w-3 h-3" />
                      <span>القسم مخفي بالكامل عن المتجر</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EAF5EE] text-[#006D41] border border-[#006D41]/25 text-[10px] font-black">
                      <Eye className="w-3 h-3" />
                      <span>القسم ظاهر بالمتجر</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#52605D]">
                  {activeCategoryStat?.effectiveVisible ?? 0} صنف ظاهر للعملاء من أصل {activeCategoryStat?.total ?? 0} صنف
                </p>
              </div>

              <div className="flex items-center gap-3">
                <ToggleSwitch
                  checked={activeCategory.is_online !== 0}
                  disabled={updatingCategoryId === activeCategory.id || isBulkUpdating}
                  label={activeCategory.is_online !== 0 ? 'القسم معروض أونلاين' : 'القسم مخفي أونلاين'}
                  onChange={nextVal => requestCategoryToggle(activeCategory, nextVal)}
                />
              </div>
            </div>
          )}

          {/* Unified Controls & Filters Card */}
          <div className="bg-white rounded-3xl border border-[#DCE1DC] p-4 shadow-sm space-y-3.5">
            {/* Row 1: Search + Sort Dropdown + View Toggle */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#52605D] absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث باسم الصنف، الباركود، الكود، أو القسم..."
                  className="w-full pl-9 pr-10 py-2.5 rounded-2xl border border-[#DCE1DC] bg-[#F8FAFC] text-xs font-medium text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#004D3F]/25 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-[#52605D] hover:text-[#0F172A]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Controls Group */}
              <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                {/* Clean Custom Sort Dropdown */}
                <div className="relative" ref={sortDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsSortOpen(prev => !prev)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F4] border border-[#DCE1DC] text-xs font-bold text-[#0F172A] transition-colors cursor-pointer"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-[#004D3F]" />
                    <span>{SORT_LABELS[sortOption]}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-[#52605D] transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isSortOpen && (
                    <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-2xl border border-[#DCE1DC] shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                      {(Object.keys(SORT_LABELS) as SortOption[]).map(key => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSortOption(key);
                            setIsSortOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-right transition-colors cursor-pointer ${
                            sortOption === key
                              ? 'bg-[#E6F2ED] text-[#00372D]'
                              : 'text-[#0F172A] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <span>{SORT_LABELS[key]}</span>
                          {sortOption === key && <Check className="w-3.5 h-3.5 text-[#004D3F]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Categories Rail Toggle Button */}
                <button
                  type="button"
                  onClick={() => toggleCategoryRail(!isCategoryRailOpen)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                    isCategoryRailOpen
                      ? 'bg-[#F8FAFC] hover:bg-[#EBECEF] border-[#DCE1DC] text-[#52605D]'
                      : 'bg-[#E6F2ED] hover:bg-[#004D3F] border-[#004D3F]/30 text-[#004D3F] hover:text-white shadow-xs'
                  }`}
                  title={isCategoryRailOpen ? 'طي شريط الأقسام لتوسيع مساحة عرض المنتجات' : 'إظهار شريط الأقسام'}
                >
                  {isCategoryRailOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                  <span>{isCategoryRailOpen ? 'إخفاء الأقسام' : 'أقسام المتجر'}</span>
                </button>

                {/* Segmented View Switcher */}
                <div className="inline-flex items-center bg-[#F1F5F4] p-1 rounded-2xl border border-[#DCE1DC]">
                  <button
                    type="button"
                    onClick={() => setLayout('list')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      layout === 'list'
                        ? 'bg-white text-[#004D3F] shadow-xs'
                        : 'text-[#52605D] hover:text-[#0F172A]'
                    }`}
                    title="عرض القائمة المنظمة"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>قائمة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayout('grid')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      layout === 'grid'
                        ? 'bg-white text-[#004D3F] shadow-xs'
                        : 'text-[#52605D] hover:text-[#0F172A]'
                    }`}
                    title="عرض شبكة البطاقات"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>بطاقات</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Filter Tabs (Clean, out_of_stock removed!) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-0.5">
              {[
                { id: 'all' as ProductFilter, label: 'الكل', count: scopedCounts.all },
                { id: 'online' as ProductFilter, label: 'معروض فعلياً', count: scopedCounts.online },
                { id: 'hidden' as ProductFilter, label: 'مخفي', count: scopedCounts.hidden },
                { id: 'no_images' as ProductFilter, label: 'بدون صور', count: scopedCounts.noImages },
                { id: 'no_desc' as ProductFilter, label: 'بدون وصف', count: scopedCounts.noDesc },
                { id: 'featured' as ProductFilter, label: 'عروض مميزة', count: scopedCounts.featured },
              ].map(chip => {
                const active = filter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFilter(chip.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#004D3F] text-white shadow-xs'
                        : 'bg-[#F8FAFC] hover:bg-[#E6F2ED]/60 text-[#0F172A] border border-[#DCE1DC]'
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded-full font-mono font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-white text-[#52605D] border border-[#DCE1DC]/60'
                      }`}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select-All Bar & Range Selection */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  allFilteredSelected
                    ? 'bg-[#E6F2ED] border-[#004D3F]/40 text-[#00372D]'
                    : 'bg-white border-[#DCE1DC] text-[#52605D] hover:text-[#0F172A]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                    allFilteredSelected
                      ? 'bg-[#004D3F] border-[#004D3F] text-white'
                      : 'border-[#B5C0B7]'
                  }`}
                >
                  {allFilteredSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span>
                  {allFilteredSelected
                    ? `إلغاء التحديد (${filteredProducts.length})`
                    : `تحديد الكل في هذا العرض (${filteredProducts.length})`}
                </span>
              </button>
            </div>

            {/* Range Selection across entire dataset */}
            {selectedIds.size > 0 && selectedIds.size < filteredProducts.length && (
              <div className="inline-flex items-center gap-2 bg-[#E6F2ED]/80 border border-[#004D3F]/20 rounded-xl px-3 py-1.5 text-xs text-[#00372D] animate-in fade-in duration-150 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#006D41] flex-shrink-0" />
                <span>تم تحديد <strong className="font-mono">{selectedIds.size}</strong> صنفاً في هذه الصفحة.</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(filteredProducts.map(p => p.id)))}
                  className="font-black underline hover:text-[#004D3F] cursor-pointer transition-colors"
                >
                  تحديد جميع الـ {filteredProducts.length} صنفاً في هذا الفلتر
                </button>
              </div>
            )}
          </div>

          {/* Products List / Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#DCE1DC] p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F1F5F4] text-[#52605D] flex items-center justify-center mx-auto">
                <Package className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-[#0F172A]">لا توجد أصناف مطابقة</h4>
              <p className="text-xs text-[#52605D] max-w-sm mx-auto">
                جرب تعديل شروط البحث أو اختيار قسم مختلف.
              </p>
            </div>
          ) : layout === 'grid' ? (
            /* Grid View */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProducts.slice(0, visibleCount).map((prod, idx) => {
                  const imgs = prod.image_urls || [];
                  const selfOnline = isProductSelfOnline(prod);
                  const parentHidden = Boolean(prod.category_id && hiddenCategoryIds.has(prod.category_id));
                  const effOnline = selfOnline && !parentHidden;
                  const isSelected = selectedIds.has(prod.id);
                  const stockUnits = Math.round(prod.stock_quantity / 1000);
                  const catName = prod.category_id ? categoryMap.get(prod.category_id)?.name : null;

                  return (
                    <div
                      key={prod.id}
                      className={`bg-white rounded-3xl border shadow-xs hover:border-[#004D3F]/40 transition-colors flex flex-col justify-between overflow-hidden group ${
                        isSelected
                          ? 'border-[#004D3F] ring-2 ring-[#004D3F]/20'
                          : !effOnline
                          ? 'border-[#DCE1DC] bg-[#F8FAFC]/60'
                          : 'border-[#DCE1DC] hover:border-[#004D3F]/40'
                      }`}
                    >
                      {/* Image Hero Area */}
                      <div className="relative h-44 bg-gradient-to-b from-[#F8FAFC] to-[#EEF2F0] overflow-hidden flex items-center justify-center border-b border-[#DCE1DC]">
                        {imgs.length > 0 ? (
                          <img
                            src={imgs[0]}
                            alt={prod.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-[#52605D]">
                            <Package className="w-10 h-10 stroke-[1.5] text-[#52605D]/30 mb-1" />
                            <span className="text-xs font-bold text-[#52605D]/60">لا توجد صور</span>
                          </div>
                        )}

                        {/* Top Floating Controls */}
                        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between">
                          {/* Checkbox */}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            onClick={e => toggleSelectItem(prod.id, idx, e.shiftKey)}
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#004D3F] border-[#004D3F] text-white'
                                : 'bg-white border-[#B5C0B7] hover:border-[#004D3F]'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>

                          {/* Featured Star & Stock */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onToggleFeatured(prod.id)}
                              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                                prod.is_featured === 1
                                  ? 'bg-amber-400 text-white shadow-xs'
                                  : 'bg-white border border-[#DCE1DC] text-[#52605D] hover:text-amber-600'
                              }`}
                              title={prod.is_featured === 1 ? 'صنف مميز' : 'تمييز كعرض'}
                            >
                              <Star className={`w-3.5 h-3.5 ${prod.is_featured === 1 ? 'fill-white' : ''}`} />
                            </button>
                            <span className="px-2 py-0.5 rounded-lg bg-black/75 text-white text-[10px] font-mono font-bold">
                              {stockUnits} {prod.unit_name}
                            </span>
                          </div>
                        </div>

                        {/* Photo count button */}
                        <button
                          type="button"
                          onClick={() => setPhotosModalProduct(prod)}
                          className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white hover:bg-[#F8FAFC] border border-[#DCE1DC] text-[#0F172A] text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-[#004D3F]" />
                          <span>{imgs.length > 0 ? `${imgs.length}/3 صور` : '+ إضافة صورة'}</span>
                        </button>
                      </div>

                      {/* Card Content */}
                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-1.5">
                          {catName && (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-[#F1F5F4] text-[#52605D] text-[10px] font-bold">
                              {catName}
                            </span>
                          )}
                          <h4 className="text-sm font-black text-[#0F172A] line-clamp-2 leading-snug">
                            {prod.name}
                          </h4>

                          {prod.description ? (
                            <div
                              onClick={() => setSingleDescProduct(prod)}
                              className="p-2.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#E6F2ED]/50 border border-[#DCE1DC] hover:border-[#004D3F]/30 text-xs text-[#52605D] line-clamp-2 transition-colors cursor-pointer"
                              title="انقر لتعديل الوصف"
                            >
                              <p className="line-clamp-2 leading-relaxed">{prod.description}</p>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSingleDescProduct(prod)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#E6F2ED] text-[#004D3F] border border-[#DCE1DC] hover:border-[#004D3F]/30 text-xs font-bold transition-all cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#004D3F]" />
                              <span>كتابة وصف</span>
                            </button>
                          )}
                        </div>

                        {/* Card Footer */}
                        <div className="pt-3 border-t border-[#DCE1DC] flex items-center justify-between gap-2">
                          <div>
                            <div className="text-base font-black text-[#004D3F] font-mono">
                              {(prod.price_piasters / 100).toFixed(2)} ج.م
                            </div>
                            {prod.compare_price && prod.compare_price > prod.price_piasters && (
                              <div className="text-[10px] text-[#52605D] line-through font-mono">
                                {(prod.compare_price / 100).toFixed(2)} ج.م
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold ${effOnline ? 'text-[#006D41]' : 'text-[#52605D]'}`}>
                              {effOnline ? 'معروض' : 'مخفي'}
                            </span>
                            <ToggleSwitch
                              size="sm"
                              checked={selfOnline}
                              onChange={() => onToggleVisibility(prod.id)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More Button */}
              {filteredProducts.length > visibleCount && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + 50)}
                    className="px-6 py-2.5 rounded-2xl bg-white hover:bg-[#E6F2ED] border border-[#DCE1DC] text-xs font-black text-[#004D3F] shadow-sm transition-colors cursor-pointer"
                  >
                    عرض المزيد ({Math.min(50, filteredProducts.length - visibleCount)} صنف متبقي)
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Structured Data Table View (Shopify Polaris & Salla Style) */
            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-[#DCE1DC] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="w-full lg:min-w-[860px]">
                    {/* Table Header Row (Desktop) */}
                    <div className="hidden lg:grid grid-cols-[80px_minmax(200px,1.2fr)_minmax(220px,1.3fr)_100px_100px_130px] items-center gap-3 px-4 py-3 bg-[#F8FAFC] border-b border-[#DCE1DC] text-[11px] font-bold text-[#52605D]">
                      <div className="flex items-center justify-start pr-1">المنتج</div>
                      <div>اسم الصنف والتصنيف</div>
                      <div>وصف المنتج</div>
                      <div className="text-center">المخزون</div>
                      <div className="text-right">السعر</div>
                      <div className="text-left pl-2">الظهور بالمتجر</div>
                    </div>

                    {/* Table Body Rows */}
                    <div className="divide-y divide-[#DCE1DC]/60">
                      {filteredProducts.slice(0, visibleCount).map((prod, idx) => {
                        const imgs = prod.image_urls || [];
                        const selfOnline = isProductSelfOnline(prod);
                        const parentHidden = Boolean(prod.category_id && hiddenCategoryIds.has(prod.category_id));
                        const effOnline = selfOnline && !parentHidden;
                        const isSelected = selectedIds.has(prod.id);
                        const stockUnits = Math.round(prod.stock_quantity / 1000);
                        const catName = prod.category_id ? categoryMap.get(prod.category_id)?.name : null;

                        return (
                          <div
                            key={prod.id}
                            className={`p-3.5 sm:px-4 sm:py-3.5 transition-colors w-full lg:grid lg:grid-cols-[80px_minmax(200px,1.2fr)_minmax(220px,1.3fr)_100px_100px_130px] lg:items-center gap-3 ${
                              isSelected
                                ? 'bg-[#E6F2ED]/60'
                                : !effOnline
                                ? 'bg-[#F8FAFC]/75 hover:bg-[#F1F5F4]/70'
                                : 'hover:bg-[#F8FAFC]'
                            }`}
                          >
                            {/* ==================================================== */}
                            {/* A. MOBILE-NATIVE VIEW (< 1024px)                     */}
                            {/* ==================================================== */}
                            <div className="lg:hidden w-full space-y-2.5">
                              {/* Row 1: Checkbox + Thumbnail + Name/Category/Barcode + Star/Toggle */}
                              <div className="flex items-start gap-2.5">
                                {/* Checkbox */}
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isSelected}
                                  onClick={e => toggleSelectItem(prod.id, idx, e.shiftKey)}
                                  className={`w-5 h-5 rounded-lg border flex items-center justify-center flex-shrink-0 mt-1 transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#004D3F] border-[#004D3F] text-white'
                                      : 'bg-white border-[#B5C0B7] hover:border-[#004D3F]'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </button>

                                {/* Thumbnail */}
                                <div
                                  onClick={() => setPhotosModalProduct(prod)}
                                  className="relative group w-11 h-11 rounded-xl overflow-hidden border border-[#DCE1DC] bg-[#F8FAFC] flex-shrink-0 cursor-pointer shadow-2xs hover:border-[#004D3F] transition-all"
                                  title="إدارة صور المنتج (رفع أو رابط URL)"
                                >
                                  {imgs.length > 0 ? (
                                    <>
                                      <img
                                        src={imgs[0]}
                                        alt={prod.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                      <div className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/60 text-white text-[8px] font-mono font-bold">
                                        {imgs.length}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#52605D] group-hover:text-[#004D3F] group-hover:bg-[#E6F2ED]/50 transition-colors">
                                      <Camera className="w-4 h-4" />
                                    </div>
                                  )}
                                </div>

                                {/* Title & Meta */}
                                <div className="flex-1 min-w-0">
                                  <h4
                                    className="text-xs sm:text-sm font-black text-[#0F172A] leading-snug line-clamp-2"
                                    title={prod.name}
                                  >
                                    {prod.name}
                                  </h4>
                                  <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10px] text-[#52605D]">
                                    {catName && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded-md bg-[#F1F5F4] text-[#52605D] font-bold">
                                        {catName}
                                      </span>
                                    )}
                                    {prod.barcode && (
                                      <span className="font-mono text-[10px] text-[#52605D] bg-[#F8FAFC] border border-[#DCE1DC] px-1 py-0.2 rounded">
                                        {prod.barcode}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Star & Visibility Toggle */}
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => onToggleFeatured(prod.id)}
                                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                        prod.is_featured === 1
                                          ? 'bg-amber-50 border-amber-300 text-amber-600 shadow-2xs'
                                          : 'bg-white border-[#DCE1DC] text-[#52605D] hover:text-amber-600'
                                      }`}
                                      title={prod.is_featured === 1 ? 'صنف مميز' : 'تمييز كعرض'}
                                    >
                                      <Star className={`w-3.5 h-3.5 ${prod.is_featured === 1 ? 'fill-amber-500 text-amber-500' : ''}`} />
                                    </button>
                                    <ToggleSwitch
                                      size="sm"
                                      checked={selfOnline}
                                      onChange={() => onToggleVisibility(prod.id)}
                                    />
                                  </div>
                                  <span className={`text-[9px] font-bold ${effOnline ? 'text-[#006D41]' : parentHidden && selfOnline ? 'text-[#B3720E]' : 'text-[#52605D]'}`}>
                                    {effOnline ? 'معروض' : parentHidden && selfOnline ? 'القسم مخفي' : 'مخفي'}
                                  </span>
                                </div>
                              </div>

                              {/* Row 2: Description Box */}
                              <div className="w-full">
                                {prod.description ? (
                                  <div
                                    onClick={() => setSingleDescProduct(prod)}
                                    className="group/desc flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#E6F2ED]/50 border border-[#DCE1DC] hover:border-[#004D3F]/30 transition-all cursor-pointer"
                                    title="انقر لتعديل الوصف"
                                  >
                                    <p className="text-xs text-[#52605D] group-hover/desc:text-[#00372D] line-clamp-1 leading-normal flex-1">
                                      {prod.description}
                                    </p>
                                    <div className="w-6 h-6 rounded-lg bg-white border border-[#DCE1DC] text-[#52605D] group-hover/desc:text-[#004D3F] flex items-center justify-center flex-shrink-0 shadow-2xs">
                                      <FileEdit className="w-3 h-3" />
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSingleDescProduct(prod)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#E6F2ED] text-[#004D3F] border border-[#DCE1DC] hover:border-[#004D3F]/40 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-[#004D3F]" />
                                    <span>كتابة وصف</span>
                                  </button>
                                )}
                              </div>

                              {/* Row 3: Stock & Price Banner */}
                              <div className="flex items-center justify-between pt-2 border-t border-[#DCE1DC]/60 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-[#52605D]">المخزون:</span>
                                  <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#0F172A] bg-[#F8FAFC] border border-[#DCE1DC] px-2.5 py-0.5 rounded-xl">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>{stockUnits} {prod.unit_name}</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-[#52605D]">السعر:</span>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-sm font-black text-[#004D3F] font-mono">
                                      {(prod.price_piasters / 100).toFixed(2)} ج.م
                                    </span>
                                    {prod.compare_price && prod.compare_price > prod.price_piasters && (
                                      <span className="text-[10px] text-[#52605D] line-through font-mono">
                                        {(prod.compare_price / 100).toFixed(2)} ج.م
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* ==================================================== */}
                            {/* B. DESKTOP GRID VIEW (>= 1024px)                     */}
                            {/* ==================================================== */}
                            <div className="hidden lg:contents">
                              {/* 1. Checkbox + Thumbnail */}
                              <div className="flex items-center gap-2.5 flex-shrink-0">
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isSelected}
                                  onClick={e => toggleSelectItem(prod.id, idx, e.shiftKey)}
                                  className={`w-5 h-5 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#004D3F] border-[#004D3F] text-white'
                                      : 'bg-white border-[#B5C0B7] hover:border-[#004D3F]'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </button>

                                <div
                                  onClick={() => setPhotosModalProduct(prod)}
                                  className="relative group w-11 h-11 rounded-xl overflow-hidden border border-[#DCE1DC] bg-[#F8FAFC] flex-shrink-0 cursor-pointer shadow-2xs hover:border-[#004D3F] transition-all"
                                  title="إدارة صور المنتج (رفع أو رابط URL)"
                                >
                                  {imgs.length > 0 ? (
                                    <>
                                      <img
                                        src={imgs[0]}
                                        alt={prod.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                      <div className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/60 text-white text-[8px] font-mono font-bold">
                                        {imgs.length}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#52605D] group-hover:text-[#004D3F] group-hover:bg-[#E6F2ED]/50 transition-colors">
                                      <Camera className="w-4 h-4" />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 2. Product Name & Meta Subtext */}
                              <div className="min-w-0 space-y-0.5">
                                <h4
                                  className="text-xs sm:text-sm font-black text-[#0F172A] leading-snug line-clamp-1 hover:text-[#004D3F] transition-colors"
                                  title={prod.name}
                                >
                                  {prod.name}
                                </h4>
                                <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#52605D]">
                                  {catName && (
                                    <span className="inline-flex items-center px-2 py-0.2 rounded-md bg-[#F1F5F4] text-[#52605D] text-[10px] font-bold">
                                      {catName}
                                    </span>
                                  )}
                                  {prod.barcode && (
                                    <span className="font-mono text-[10px] text-[#52605D] bg-[#F8FAFC] border border-[#DCE1DC] px-1.5 py-0.2 rounded">
                                      {prod.barcode}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-[#52605D]/80">
                                    {prod.unit_name}
                                  </span>
                                </div>
                              </div>

                              {/* 3. Description Box */}
                              <div>
                                {prod.description ? (
                                  <div
                                    onClick={() => setSingleDescProduct(prod)}
                                    className="group/desc flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#E6F2ED]/50 border border-[#DCE1DC] hover:border-[#004D3F]/30 transition-all cursor-pointer"
                                    title="انقر لتعديل الوصف"
                                  >
                                    <p className="text-xs text-[#52605D] group-hover/desc:text-[#00372D] line-clamp-1 leading-normal flex-1">
                                      {prod.description}
                                    </p>
                                    <div className="w-6 h-6 rounded-lg bg-white border border-[#DCE1DC] text-[#52605D] group-hover/desc:text-[#004D3F] flex items-center justify-center flex-shrink-0 shadow-2xs">
                                      <FileEdit className="w-3 h-3" />
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSingleDescProduct(prod)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#E6F2ED] text-[#004D3F] border border-[#DCE1DC] hover:border-[#004D3F]/40 text-xs font-bold transition-all cursor-pointer shadow-2xs group"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-[#004D3F]" />
                                    <span>كتابة وصف</span>
                                  </button>
                                )}
                              </div>

                              {/* 4. Stock Column */}
                              <div className="text-center">
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#0F172A] bg-[#F8FAFC] border border-[#DCE1DC] px-2.5 py-1 rounded-xl">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>{stockUnits} {prod.unit_name}</span>
                                </span>
                              </div>

                              {/* 5. Price Column */}
                              <div className="text-right">
                                <div className="text-sm font-black text-[#004D3F] font-mono">
                                  {(prod.price_piasters / 100).toFixed(2)} ج.م
                                </div>
                                {prod.compare_price && prod.compare_price > prod.price_piasters && (
                                  <div className="text-[10px] text-[#52605D] line-through font-mono">
                                    {(prod.compare_price / 100).toFixed(2)} ج.م
                                  </div>
                                )}
                              </div>

                              {/* 6. Visibility & Star Column */}
                              <div className="flex items-center justify-end gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => onToggleFeatured(prod.id)}
                                  className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                    prod.is_featured === 1
                                      ? 'bg-amber-50 border-amber-300 text-amber-600 shadow-2xs'
                                      : 'bg-white border-[#DCE1DC] text-[#52605D] hover:text-amber-600 hover:border-amber-200'
                                  }`}
                                  title={prod.is_featured === 1 ? 'صنف مميز' : 'تمييز كعرض'}
                                >
                                  <Star className={`w-3.5 h-3.5 ${prod.is_featured === 1 ? 'fill-amber-500 text-amber-500' : ''}`} />
                                </button>

                                <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#DCE1DC] px-2.5 py-1 rounded-xl">
                                  <span className={`text-[10px] font-bold ${effOnline ? 'text-[#006D41]' : parentHidden && selfOnline ? 'text-[#B3720E]' : 'text-[#52605D]'}`}>
                                    {effOnline ? 'معروض' : parentHidden && selfOnline ? 'القسم مخفي' : 'مخفي'}
                                  </span>
                                  <ToggleSwitch
                                    size="sm"
                                    checked={selfOnline}
                                    onChange={() => onToggleVisibility(prod.id)}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Load More Button */}
              {filteredProducts.length > visibleCount && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + 50)}
                    className="px-6 py-2.5 rounded-2xl bg-white hover:bg-[#E6F2ED] border border-[#DCE1DC] text-xs font-black text-[#004D3F] shadow-sm transition-colors cursor-pointer"
                  >
                    عرض المزيد ({Math.min(50, filteredProducts.length - visibleCount)} صنف متبقي)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Bulk Action Command Pill (Docked bottom on selection, Portaled to Body) */}
      {selectedIds.size > 0 && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[calc(100vw-32px)] px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl sm:rounded-full bg-[#002B23]/95 backdrop-blur-xl border border-emerald-400/30 shadow-[0_16px_40px_-6px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)] flex items-center gap-2 sm:gap-2.5 whitespace-nowrap overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-200"
          dir="rtl"
        >
          {/* 1. Counter Pill */}
          <div className="flex items-center gap-1.5 flex-shrink-0 pr-0.5">
            <span className="min-w-6 h-6 px-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center font-mono font-black text-xs">
              {selectedIds.size}
            </span>
            <span className="text-xs font-bold text-white/90">محدد</span>
          </div>

          {/* Vertical Divider */}
          <div className="w-px h-5 bg-white/15 flex-shrink-0" />

          {/* 2. Primary Action: صياغة الأوصاف */}
          <button
            type="button"
            onClick={() => setIsBulkDescOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-[#00372D] text-xs font-black transition-all cursor-pointer shadow-xs flex-shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-[#00372D]" />
            <span>صياغة الأوصاف</span>
          </button>

          {/* 3. Action: إظهار بالمتجر */}
          <button
            type="button"
            onClick={() => executeBulkProductAction({ is_online: 1 }, 'إظهار')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 text-xs font-bold transition-all cursor-pointer flex-shrink-0"
            title="إظهار الأصناف المحددة بالمتجر"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>إظهار</span>
          </button>

          {/* 4. Action: إخفاء عن المتجر */}
          <button
            type="button"
            onClick={() => executeBulkProductAction({ is_online: 0 }, 'إخفاء')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 text-xs font-bold transition-all cursor-pointer flex-shrink-0"
            title="إخفاء الأصناف المحددة عن المتجر"
          >
            <EyeOff className="w-3.5 h-3.5 text-rose-300" />
            <span>إخفاء</span>
          </button>

          {/* 5. Action: تمييز كعرض */}
          <button
            type="button"
            onClick={() => executeBulkProductAction({ is_featured: 1 }, 'تمييز')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 text-xs font-bold transition-all cursor-pointer flex-shrink-0"
            title="تمييز الأصناف كعروض ترويجية"
          >
            <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300/40" />
            <span>تمييز</span>
          </button>

          {/* Vertical Divider */}
          <div className="w-px h-5 bg-white/15 flex-shrink-0" />

          {/* 6. Deselect Button */}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="inline-flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 active:bg-white/15 transition-all cursor-pointer text-xs flex-shrink-0"
            title="إلغاء التحديد (Esc)"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px] text-white/60">إلغاء</span>
            <kbd className="hidden md:inline-block text-[9px] text-white/40 bg-white/10 border border-white/10 px-1 py-0.2 rounded font-mono">Esc</kbd>
          </button>
        </div>,
        document.body
      )}

      {/* Confirmation Dialog (Portaled to Body) */}
      {confirmDialog && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" dir="rtl">
          <div className="bg-white rounded-3xl border border-[#DCE1DC] p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  confirmDialog.tone === 'danger'
                    ? 'bg-[#FDF2F2] text-[#B23A2E]'
                    : 'bg-[#E6F2ED] text-[#004D3F]'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="text-base font-black text-[#0F172A]">{confirmDialog.title}</h4>
            </div>

            <p className="text-xs text-[#52605D] leading-relaxed">
              {confirmDialog.description}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2.5 rounded-xl border border-[#DCE1DC] hover:bg-[#F8FAFC] text-xs font-bold text-[#52605D] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void confirmDialog.onConfirm()}
                className={`px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-sm cursor-pointer ${
                  confirmDialog.tone === 'danger'
                    ? 'bg-[#B23A2E] hover:bg-[#962A1E]'
                    : 'bg-[#004D3F] hover:bg-[#00372D]'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Smart Publish Wizard Modal */}
      <SmartPublishModal
        isOpen={isSmartPublishOpen}
        onClose={() => setIsSmartPublishOpen(false)}
        activeCategory={activeCategory || null}
        totalProductsCount={globalStats.totalProducts}
        inStockProductsCount={globalStats.inStockCount}
        withImagesProductsCount={globalStats.withImages}
        outOfStockProductsCount={globalStats.outOfStockCount}
        isExecuting={isSmartPublishing}
        onExecutePreset={async (preset: SmartPublishPreset, catId?: string) => {
          if (!onSmartPublish) return;
          setIsSmartPublishing(true);
          try {
            await onSmartPublish(preset, catId);
          } finally {
            setIsSmartPublishing(false);
          }
        }}
      />

      {/* Single Description Modal */}
      <SingleDescriptionModal
        isOpen={Boolean(singleDescProduct)}
        onClose={() => setSingleDescProduct(null)}
        product={singleDescProduct}
        categoryName={
          singleDescProduct?.category_id ? categoryMap.get(singleDescProduct.category_id)?.name : undefined
        }
        isSaving={false}
        onSave={async (id, desc) => {
          await onSaveDescription(id, desc);
          setSingleDescProduct(null);
        }}
      />

      {/* Bulk Description Modal */}
      <BulkDescriptionModal
        isOpen={isBulkDescOpen}
        onClose={() => setIsBulkDescOpen(false)}
        selectedProducts={products.filter(p => selectedIds.has(p.id))}
        categories={realCategories}
        isSaving={isBulkSavingDesc}
        onBatchSave={async (updates: Array<{ id: string; description: string }>) => {
          if (!onBatchSaveDescriptions) return;
          setIsBulkSavingDesc(true);
          try {
            await onBatchSaveDescriptions(updates);
            setSelectedIds(new Set());
          } finally {
            setIsBulkSavingDesc(false);
          }
        }}
      />

      {/* Product Photos Modal (File Upload + Direct Image URL) */}
      <ProductPhotosModal
        isOpen={Boolean(photosModalProduct)}
        onClose={() => setPhotosModalProduct(null)}
        product={photosModalProduct}
        categoryName={
          photosModalProduct?.category_id ? categoryMap.get(photosModalProduct.category_id)?.name : undefined
        }
        isUploading={uploadingImageProductId === photosModalProduct?.id}
        onUploadImage={(prodId, file) => onUploadImage(prodId, file)}
        onAddImageUrl={(prodId, url) => (onAddImageUrl ? onAddImageUrl(prodId, url) : undefined)}
        onDeleteImage={(prodId, url) => onDeleteImage(prodId, url)}
      />
    </div>
  );
};
