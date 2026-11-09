import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutGrid, 
  Flame, 
  Star, 
  ChevronLeft,
  PanelLeftClose
} from 'lucide-react';
import { SearchInput } from '../../components/SearchInput';
import type { Category } from '../../types/models';
import { PANEL_TOGGLE_BUTTON_CLASS, PANEL_TOGGLE_ICON_CLASS } from '../../utils/panelToggle';
import { normalizeArabicText } from '../../utils/money';
import { POPULAR_ITEMS_LIMIT, POPULAR_WINDOW_DAYS } from './popularItems';
import { getCategoryIconComponent, CATEGORY_ICONS_CHANGED_EVENT } from '../../utils/categoryIcons';

interface PosCategoriesPanelProps {
  categories: Category[];
  activeCatalogTab: string;
  onSelectCategory: (tabKey: string) => void;
  totalProductsCount: number;
  popularItemsCount: number;
  isPopularFallback: boolean;
  customItemsCount: number;
  categoryProductCounts: Record<string, number>;
  // Called when the rail is expanded, so the catalog panel can open with it
  onExpand?: () => void;
  // Changes whenever the catalog panel is collapsed; the rail closes with it
  collapseSignal?: number;
}

export const PosCategoriesPanel: React.FC<PosCategoriesPanelProps> = ({
  categories,
  activeCatalogTab,
  onSelectCategory,
  totalProductsCount,
  popularItemsCount,
  isPopularFallback,
  customItemsCount,
  categoryProductCounts,
  onExpand,
  collapseSignal = 0,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('rafiq_pos_categories_collapsed');
      if (saved !== null) return saved === 'true';
      return true; // Default to collapsed so screen breathes without 3-column crowding
    } catch {
      return true;
    }
  });

  const popularCaption = isPopularFallback ? 'آخر الأصناف المضافة' : `آخر ${POPULAR_WINDOW_DAYS} يوم`;
  const popularHint = isPopularFallback
    ? 'الأكثر طلباً - لسه مفيش مبيعات، بنعرض آخر الأصناف المضافة'
    : `الأكثر طلباً - أعلى ${POPULAR_ITEMS_LIMIT} صنف مبيعاً في آخر ${POPULAR_WINDOW_DAYS} يوم`;

  const [, setIconsTick] = useState(0);
  useEffect(() => {
    const handleIconsChanged = () => setIconsTick((t) => t + 1);
    window.addEventListener(CATEGORY_ICONS_CHANGED_EVENT, handleIconsChanged);
    return () => window.removeEventListener(CATEGORY_ICONS_CHANGED_EVENT, handleIconsChanged);
  }, []);

  useEffect(() => {
    if (collapseSignal === 0) return;
    setIsCollapsed(true);
    try {
      localStorage.setItem('rafiq_pos_categories_collapsed', 'true');
    } catch {
      // ignore
    }
  }, [collapseSignal]);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem('rafiq_pos_categories_collapsed', String(next));
    } catch {
      // ignore
    }
    if (!next) onExpand?.();
  };

  // Combine categories with dynamic counts
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  // Collapsed: only the title as vertical text; the whole strip is the expand button (no icons, no items)
  if (isCollapsed) {
    return (
      <section className="w-[3.625rem] min-w-[3.625rem] h-full bg-surface-2 dark:bg-surface-dark-2 border-r border-line dark:border-line-dark flex flex-col select-none overflow-hidden shrink-0 transition-all duration-150 motion-resize motion-swap-children shadow-2xs">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={false}
          aria-label="توسيع قائمة الأقسام"
          title="توسيع قائمة الأقسام"
          className="flex-1 w-full flex items-center justify-center cursor-pointer hover:bg-brand-soft dark:hover:bg-surface-dark-3 transition-colors"
        >
          <span
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            className="text-sm font-extrabold text-ink dark:text-ink-dark whitespace-nowrap"
          >
            أقسام المتجر
          </span>
        </button>
      </section>
    );
  }

  return (
    <section 
      className="w-[13.75rem] sm:w-[15rem] p-2.5 sm:p-3 h-full bg-surface-2 dark:bg-surface-dark-2 border-r border-line dark:border-line-dark flex flex-col select-none overflow-hidden shrink-0 transition-all duration-150 motion-resize motion-swap-children shadow-2xs"
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-line dark:border-line-dark shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center text-white shadow-2xs shrink-0">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="t-card-title text-ink dark:text-ink-dark truncate">أقسام المتجر</h2>
              <div className="text-micro text-ink-muted dark:text-ink-dark-muted truncate">
                <span className="text-xs font-extrabold tabular-nums text-ink dark:text-ink-dark">{categories.length}</span> أقسام رئيسية
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={true}
              aria-label="تصغير قائمة الأقسام"
              className={PANEL_TOGGLE_BUTTON_CLASS}
              title="تصغير قائمة الأقسام"
            >
              <PanelLeftClose className={PANEL_TOGGLE_ICON_CLASS} />
            </button>
          </div>
      </div>

      {/* Quick Search within Categories */}
      <SearchInput
        size="sm"
        searchButton={false}
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="بحث في الأقسام..."
        ariaLabel="بحث في الأقسام"
        className="mb-2 shrink-0"
      />

      {/* Categories List Container */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar w-full">
        {/* 1. All Products Main Card */}
        <button
          type="button"
          onClick={() => onSelectCategory('__ALL__')}
          className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group ${
            activeCatalogTab === '__ALL__'
              ? 'bg-brand border-brand-dark text-white dark:bg-brand-dark-soft dark:border-brand-bright/40 dark:ring-1 dark:ring-inset dark:ring-brand-bright/30 shadow-xs'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              activeCatalogTab === '__ALL__'
                ? 'bg-white/20 text-white'
                : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
            }`}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">جميع الأصناف</div>
              <div className={`text-micro ${activeCatalogTab === '__ALL__' ? 'text-white/80' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                كافة منتجات المتجر
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-xs font-mono font-extrabold tabular-nums px-2 py-0.5 rounded-md ${
              activeCatalogTab === '__ALL__'
                ? 'bg-white dark:bg-surface-dark text-brand dark:text-brand-bright'
                : 'bg-surface-2 dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark'
            }`}>
              {totalProductsCount}
            </span>
            <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__ALL__' ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
          </div>
        </button>

        {/* 2. Top Sellers (الأكثر طلباً) Card */}
        <button
          type="button"
          onClick={() => onSelectCategory('__POPULAR__')}
          title={`${popularHint} (${popularItemsCount})`}
          className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group ${
            activeCatalogTab === '__POPULAR__'
              ? 'bg-warn-bright border-warn-bright text-ink dark:bg-warn-dark-soft dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40 shadow-xs'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-warn/40 hover:bg-warn-soft/50 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              activeCatalogTab === '__POPULAR__'
                ? 'bg-white/20 text-white'
                : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright'
            }`}>
              <Flame className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">الأكثر طلباً ومبيعاً</div>
              <div className="text-micro font-medium opacity-80 truncate">{popularCaption}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-xs font-mono font-extrabold tabular-nums px-2 py-0.5 rounded-md ${
              activeCatalogTab === '__POPULAR__'
                ? 'bg-white dark:bg-surface-dark text-warn dark:text-warn-bright'
                : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30'
            }`}>
              {popularItemsCount}
            </span>
            <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__POPULAR__' ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
          </div>
        </button>

        {/* 3. Favorites & Fast Items (المفضلة) Card */}
        <button
          type="button"
          onClick={() => onSelectCategory('__CUSTOM__')}
          className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group ${
            activeCatalogTab === '__CUSTOM__'
              ? 'bg-brand-dark border-brand-dark text-white dark:bg-brand-dark-soft dark:border-brand-bright/40 dark:ring-1 dark:ring-inset dark:ring-brand-bright/30 shadow-xs'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-brand-dark/40 hover:bg-brand-soft/50 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              activeCatalogTab === '__CUSTOM__'
                ? 'bg-white/20 text-white'
                : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
            }`}>
              <Star className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">الأصناف المفضلة والسريعة</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-xs font-mono font-extrabold tabular-nums px-2 py-0.5 rounded-md ${
              activeCatalogTab === '__CUSTOM__'
                ? 'bg-white dark:bg-surface-dark text-brand-dark dark:text-brand-bright'
                : 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border'
            }`}>
              {customItemsCount}
            </span>
            <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__CUSTOM__' ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
          </div>
        </button>

        {/* Separator */}
        <div className="py-1 flex items-center w-full">
          <div className="h-px bg-line dark:bg-line-dark flex-1" />
        </div>

        {/* 4. Real Store Categories */}
        {filteredCategories.length === 0 ? (
          <div className="text-center py-4 text-xs text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark rounded-xl border border-dashed border-line dark:border-line-dark">
            لا توجد أقسام مطابقة للبحث
          </div>
        ) : (
          filteredCategories.map((cat) => {
            const count = categoryProductCounts[cat.name] ?? categoryProductCounts[cat.id] ?? cat.productCount ?? 0;
            const isSelected = activeCatalogTab === cat.name || 
              activeCatalogTab === cat.id || 
              (activeCatalogTab !== '__ALL__' && 
               activeCatalogTab !== '__POPULAR__' && 
               activeCatalogTab !== '__CUSTOM__' && 
               normalizeArabicText(cat.name.trim()) === normalizeArabicText(activeCatalogTab.trim()));
            const IconComponent = getCategoryIconComponent(cat.name, cat.id);

            return (
              <button
                type="button"
                key={cat.id || cat.name}
                onClick={() => onSelectCategory(cat.name)}
                className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group ${
                  isSelected
                    ? 'bg-brand border-brand-dark text-white dark:bg-brand-dark-soft dark:border-brand-bright/40 dark:ring-1 dark:ring-inset dark:ring-brand-bright/30 shadow-xs'
                    : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-surface-2 dark:bg-surface-dark-3 text-brand dark:text-brand-bright group-hover:bg-brand-soft dark:group-hover:bg-surface-dark-2'
                  }`}>
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">
                      {cat.name}
                    </div>
                    <div className={`text-micro ${isSelected ? 'text-white/80' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                      {count} {count === 1 ? 'صنف' : 'أصناف'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-xs font-mono font-extrabold tabular-nums px-2 py-0.5 rounded-md ${
                    isSelected
                      ? 'bg-white dark:bg-surface-dark text-brand dark:text-brand-bright'
                      : 'bg-surface-2 dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark'
                  }`}>
                    {count}
                  </span>
                  <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${isSelected ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};
