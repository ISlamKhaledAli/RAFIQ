import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutGrid, 
  Flame, 
  Star, 
  Search, 
  X, 
  FolderTree, 
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import type { Category } from '../../types/models';
import { normalizeArabicText } from '../../utils/money';
import { getCategoryIconComponent, CATEGORY_ICONS_CHANGED_EVENT } from '../../utils/categoryIcons';

interface PosCategoriesPanelProps {
  categories: Category[];
  activeCatalogTab: string;
  onSelectCategory: (tabKey: string) => void;
  totalProductsCount: number;
  popularItemsCount: number;
  customItemsCount: number;
  categoryProductCounts: Record<string, number>;
}

export const PosCategoriesPanel: React.FC<PosCategoriesPanelProps> = ({
  categories,
  activeCatalogTab,
  onSelectCategory,
  totalProductsCount,
  popularItemsCount,
  customItemsCount,
  categoryProductCounts,
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

  const [, setIconsTick] = useState(0);
  useEffect(() => {
    const handleIconsChanged = () => setIconsTick((t) => t + 1);
    window.addEventListener(CATEGORY_ICONS_CHANGED_EVENT, handleIconsChanged);
    return () => window.removeEventListener(CATEGORY_ICONS_CHANGED_EVENT, handleIconsChanged);
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('rafiq_pos_categories_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Combine categories with dynamic counts
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  return (
    <section 
      className={`${
        isCollapsed ? 'w-[58px] min-w-[58px] p-2 items-center' : 'w-[220px] sm:w-[240px] p-2.5 sm:p-3'
      } h-full bg-surface-2 dark:bg-surface-dark-2 border-r border-line dark:border-line-dark flex flex-col select-none overflow-hidden shrink-0 transition-all duration-150 shadow-2xs`}
    >
      {/* Header */}
      <div className={`w-full flex items-center justify-between pb-2 mb-2 border-b border-line dark:border-line-dark shrink-0 ${
        isCollapsed ? 'flex-col gap-2' : ''
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center text-white shadow-2xs shrink-0">
            <LayoutGrid className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-ink dark:text-ink-dark truncate">أقسام المتجر</h2>
              <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted truncate">
                {categories.length} أقسام رئيسية
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">

          <button
            type="button"
            onClick={toggleCollapsed}
            className="p-1 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark hover:bg-brand-soft dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright transition-all cursor-pointer shadow-2xs"
            title={isCollapsed ? 'توسيع قائمة الأقسام' : 'تصغير قائمة الأقسام'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
            ) : (
              <PanelLeftClose className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright" />
            )}
          </button>
        </div>
      </div>

      {/* Quick Search within Categories (Only when expanded) */}
      {!isCollapsed && (
        <div className="relative mb-2 shrink-0">
          <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في الأقسام..."
            className="w-full h-7.5 pr-8 pl-6 text-xs bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand/20 outline-none transition-all placeholder:text-ink-muted/60 dark:placeholder:text-ink-dark-muted/60 text-ink dark:text-ink-dark font-medium shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-0.5 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Categories List Container */}
      <div className={`flex-1 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar w-full ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
        {/* 1. All Products Main Card */}
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => onSelectCategory('__ALL__')}
            title={`جميع الأصناف (${totalProductsCount})`}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeCatalogTab === '__ALL__'
                ? 'bg-brand text-white shadow-xs'
                : 'bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark border border-line dark:border-line-dark'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 font-mono text-[9px] font-bold px-1 rounded-full bg-surface-2 dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark">
              {totalProductsCount > 99 ? '99+' : totalProductsCount}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelectCategory('__ALL__')}
            className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
              activeCatalogTab === '__ALL__'
                ? 'bg-brand border-brand-dark text-white shadow-xs'
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
                <div className={`text-[10px] ${activeCatalogTab === '__ALL__' ? 'text-white/80' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                  كافة منتجات المتجر
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                activeCatalogTab === '__ALL__'
                  ? 'bg-white text-brand'
                  : 'bg-surface-2 dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark'
              }`}>
                {totalProductsCount}
              </span>
              <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__ALL__' ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
            </div>
          </button>
        )}

        {/* 2. Top Sellers (الأكثر طلباً) Card */}
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => onSelectCategory('__POPULAR__')}
            title={`الأكثر طلباً (${popularItemsCount})`}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeCatalogTab === '__POPULAR__'
                ? 'bg-warn text-white shadow-xs'
                : 'bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark border border-line dark:border-line-dark'
            }`}
          >
            <Flame className="w-4 h-4 text-warn dark:text-warn-bright" />
            <span className="absolute -top-1 -right-1 font-mono text-[9px] font-bold px-1 rounded-full bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30">
              {popularItemsCount > 99 ? '99+' : popularItemsCount}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelectCategory('__POPULAR__')}
            className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
              activeCatalogTab === '__POPULAR__'
                ? 'bg-warn border-warn text-white shadow-xs'
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
                <div className={`text-[10px] ${activeCatalogTab === '__POPULAR__' ? 'text-amber-100' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                  الأكثر تكراراً بالكاشير
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                activeCatalogTab === '__POPULAR__'
                  ? 'bg-white text-warn'
                  : 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30'
              }`}>
                {popularItemsCount}
              </span>
              <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__POPULAR__' ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
            </div>
          </button>
        )}

        {/* 3. Favorites & Fast Items (المفضلة) Card */}
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => onSelectCategory('__CUSTOM__')}
            title={`الأصناف المفضلة والسريعة (${customItemsCount})`}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeCatalogTab === '__CUSTOM__'
                ? 'bg-brand-dark text-white shadow-xs'
                : 'bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark border border-line dark:border-line-dark'
            }`}
          >
            <Star className="w-4 h-4 text-paid dark:text-emerald-300" />
            <span className="absolute -top-1 -right-1 font-mono text-[9px] font-bold px-1 rounded-full bg-paid-soft dark:bg-emerald-950/60 text-paid dark:text-emerald-300 border border-paid-border dark:border-emerald-600/40">
              {customItemsCount > 99 ? '99+' : customItemsCount}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelectCategory('__CUSTOM__')}
            className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
              activeCatalogTab === '__CUSTOM__'
                ? 'bg-brand-dark border-brand-dark text-white shadow-xs'
                : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:border-brand-dark/40 hover:bg-brand-soft/50 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                activeCatalogTab === '__CUSTOM__'
                  ? 'bg-white/20 text-white'
                  : 'bg-paid-soft dark:bg-emerald-950/40 text-paid dark:text-emerald-300'
              }`}>
                <Star className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">الأصناف المفضلة والسريعة</div>
                <div className={`text-[10px] ${activeCatalogTab === '__CUSTOM__' ? 'text-white/80' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                  أزرار المحل المخصصة
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                activeCatalogTab === '__CUSTOM__'
                  ? 'bg-white text-brand-dark'
                  : 'bg-paid-soft dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-paid-border dark:border-emerald-600/40'
              }`}>
                {customItemsCount}
              </span>
              <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__CUSTOM__' ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted'}`} />
            </div>
          </button>
        )}

        {/* Separator */}
        <div className="py-1 flex items-center gap-2 w-full">
          <div className="h-px bg-line dark:bg-line-dark flex-1" />
          {!isCollapsed && (
            <div className="flex items-center justify-between w-full px-1">
              <span className="text-[10px] font-bold text-ink-muted dark:text-ink-dark-muted uppercase tracking-wider flex items-center gap-1">
                <FolderTree className="w-3 h-3 text-brand dark:text-brand-bright" />
                <span>أقسام المتجر</span>
              </span>
            </div>
          )}
          <div className="h-px bg-line dark:bg-line-dark flex-1" />
        </div>

        {/* 4. Real Store Categories */}
        {filteredCategories.length === 0 ? (
          !isCollapsed && (
            <div className="text-center py-4 text-xs text-ink-muted dark:text-ink-dark-muted bg-surface dark:bg-surface-dark rounded-xl border border-dashed border-line dark:border-line-dark">
              لا توجد أقسام مطابقة للبحث
            </div>
          )
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

            if (isCollapsed) {
              return (
                <button
                  type="button"
                  key={cat.id || cat.name}
                  onClick={() => onSelectCategory(cat.name)}
                  title={`${cat.name} (${count} صنف)`}
                  className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark border border-line dark:border-line-dark'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                  {count > 0 && (
                    <span className="absolute -top-1 -right-1 font-mono text-[9px] font-bold px-1 rounded-full bg-surface-2 dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                type="button"
                key={cat.id || cat.name}
                onClick={() => onSelectCategory(cat.name)}
                className={`w-full p-2 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
                  isSelected
                    ? 'bg-brand border-brand-dark text-white shadow-xs'
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
                    <div className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                      {count} {count === 1 ? 'صنف' : 'أصناف'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                    isSelected
                      ? 'bg-white text-brand'
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
