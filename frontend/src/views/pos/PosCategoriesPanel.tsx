import React, { useState, useMemo } from 'react';
import { 
  LayoutGrid, 
  Flame, 
  Star, 
  Package, 
  Search, 
  X, 
  FolderTree, 
  Coffee, 
  Sparkles, 
  Apple, 
  Layers, 
  Settings,
  ChevronLeft
} from 'lucide-react';
import type { Category } from '../../types/models';

interface PosCategoriesPanelProps {
  categories: Category[];
  activeCatalogTab: string;
  onSelectCategory: (tabKey: string) => void;
  totalProductsCount: number;
  popularItemsCount: number;
  customItemsCount: number;
  categoryProductCounts: Record<string, number>;
  onOpenCategoryManager?: () => void;
}

// Helper to choose a smart intuitive icon based on category title
const getCategoryIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('مشروب') || lower.includes('عصير') || lower.includes('شاي') || lower.includes('قهوة') || lower.includes('مياه')) {
    return Coffee;
  }
  if (lower.includes('ألبان') || lower.includes('جبن') || lower.includes('حليب') || lower.includes('زبادي')) {
    return Layers;
  }
  if (lower.includes('خضار') || lower.includes('فاكهة') || lower.includes('طازج')) {
    return Apple;
  }
  if (lower.includes('منظف') || lower.includes('صابون') || lower.includes('عناية')) {
    return Sparkles;
  }
  if (lower.includes('حلو') || lower.includes('شوكولا') || lower.includes('بسكويت') || lower.includes('شيبس')) {
    return Star;
  }
  if (lower.includes('توابل') || lower.includes('عطارة') || lower.includes('بهارات')) {
    return Flame;
  }
  return Package;
};

export const PosCategoriesPanel: React.FC<PosCategoriesPanelProps> = ({
  categories,
  activeCatalogTab,
  onSelectCategory,
  totalProductsCount,
  popularItemsCount,
  customItemsCount,
  categoryProductCounts,
  onOpenCategoryManager,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Combine categories with dynamic counts
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  return (
    <section className="w-[24%] min-w-[220px] max-w-[300px] h-full bg-[#f8faf9] border-r border-[#dce1dc] flex flex-col p-3 select-none overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-[#dce1dc] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#004d3f] flex items-center justify-center text-white shadow-2xs">
            <LayoutGrid className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-[#0f172a]">أقسام وتصنيفات المتجر</h2>
            <div className="text-[10px] text-[#52605d]">
              {categories.length} أقسام رئيسية
            </div>
          </div>
        </div>

        {onOpenCategoryManager && (
          <button
            type="button"
            onClick={onOpenCategoryManager}
            className="p-1.5 rounded-lg border border-[#dce1dc] bg-white hover:bg-[#eaf5ee] text-[#52605d] hover:text-[#006d41] transition-all cursor-pointer shadow-2xs"
            title="إدارة وتعديل التصنيفات"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Quick Search within Categories */}
      <div className="relative mb-2 shrink-0">
        <Search className="w-3.5 h-3.5 text-[#52605d] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث في الأقسام..."
          className="w-full h-8 pr-8 pl-7 text-xs bg-white rounded-lg border border-[#dce1dc] focus:border-[#006d41] focus:ring-1 focus:ring-[#006d41]/25 outline-none transition-all placeholder:text-[#52605d]/60 text-[#0f172a] font-medium shadow-2xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[#52605d] hover:text-[#0f172a] p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Categories List Container */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
        {/* 1. All Products Main Card */}
        <button
          type="button"
          onClick={() => onSelectCategory('__ALL__')}
          className={`w-full p-2.5 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
            activeCatalogTab === '__ALL__'
              ? 'bg-[#004d3f] border-[#00372d] text-white shadow-sm'
              : 'bg-white border-[#dce1dc] hover:border-[#006d41]/50 hover:bg-[#f1f7f4] text-[#0f172a]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              activeCatalogTab === '__ALL__'
                ? 'bg-white/20 text-white'
                : 'bg-[#eaf5ee] text-[#006d41]'
            }`}>
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-[13px] font-bold truncate">جميع الأصناف</div>
              <div className={`text-[10px] ${activeCatalogTab === '__ALL__' ? 'text-[#a3e2c3]' : 'text-[#52605d]'}`}>
                عرض كافة منتجات المتجر
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
              activeCatalogTab === '__ALL__'
                ? 'bg-white text-[#004d3f]'
                : 'bg-[#f1f5f4] text-[#0f172a] border border-[#dce1dc]'
            }`}>
              {totalProductsCount}
            </span>
            <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__ALL__' ? 'text-white' : 'text-[#52605d]'}`} />
          </div>
        </button>

        {/* 2. Top Sellers (الأكثر طلباً) Card */}
        <button
          type="button"
          onClick={() => onSelectCategory('__POPULAR__')}
          className={`w-full p-2.5 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
            activeCatalogTab === '__POPULAR__'
              ? 'bg-[#b3720e] border-[#8f5a08] text-white shadow-sm'
              : 'bg-white border-[#dce1dc] hover:border-[#b3720e]/50 hover:bg-[#fef7ec] text-[#0f172a]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              activeCatalogTab === '__POPULAR__'
                ? 'bg-white/20 text-white'
                : 'bg-[#fef7ec] text-[#b3720e]'
            }`}>
              <Flame className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-[13px] font-bold truncate">الأكثر طلباً ومبيعاً</div>
              <div className={`text-[10px] ${activeCatalogTab === '__POPULAR__' ? 'text-amber-100' : 'text-[#52605d]'}`}>
                الأكثر تكراراً بالكاشير
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
              activeCatalogTab === '__POPULAR__'
                ? 'bg-white text-[#b3720e]'
                : 'bg-[#fef7ec] text-[#b3720e] border border-[#f7e0bb]'
            }`}>
              {popularItemsCount}
            </span>
            <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__POPULAR__' ? 'text-white' : 'text-[#52605d]'}`} />
          </div>
        </button>

        {/* 3. Favorites & Fast Items (المفضلة) Card */}
        <button
          type="button"
          onClick={() => onSelectCategory('__CUSTOM__')}
          className={`w-full p-2.5 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
            activeCatalogTab === '__CUSTOM__'
              ? 'bg-[#00372d] border-[#00241e] text-white shadow-sm'
              : 'bg-white border-[#dce1dc] hover:border-[#00372d]/50 hover:bg-[#eaf5ee] text-[#0f172a]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              activeCatalogTab === '__CUSTOM__'
                ? 'bg-white/20 text-white'
                : 'bg-[#eaf5ee] text-[#00372d]'
            }`}>
              <Star className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-[13px] font-bold truncate">الأصناف المفضلة والسريعة</div>
              <div className={`text-[10px] ${activeCatalogTab === '__CUSTOM__' ? 'text-[#a3e2c3]' : 'text-[#52605d]'}`}>
                أزرار المحل المخصصة
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
              activeCatalogTab === '__CUSTOM__'
                ? 'bg-white text-[#00372d]'
                : 'bg-[#eaf5ee] text-[#00372d] border border-[#c4e3d0]'
            }`}>
              {customItemsCount}
            </span>
            <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${activeCatalogTab === '__CUSTOM__' ? 'text-white' : 'text-[#52605d]'}`} />
          </div>
        </button>

        {/* Separator */}
        <div className="pt-2 pb-1 flex items-center gap-2">
          <div className="h-px bg-[#dce1dc] flex-1" />
          <span className="text-[10px] font-bold text-[#52605d] uppercase tracking-wider flex items-center gap-1">
            <FolderTree className="w-3 h-3 text-[#006d41]" />
            <span>أقسام المتجر</span>
          </span>
          <div className="h-px bg-[#dce1dc] flex-1" />
        </div>

        {/* 4. Real Store Categories */}
        {filteredCategories.length === 0 ? (
          <div className="text-center py-6 text-xs text-[#52605d] bg-white rounded-xl border border-dashed border-[#dce1dc]">
            لا توجد أقسام مطابقة للبحث
          </div>
        ) : (
          filteredCategories.map((cat) => {
            const count = categoryProductCounts[cat.name] ?? categoryProductCounts[cat.id] ?? cat.productCount ?? 0;
            const isSelected = activeCatalogTab === cat.name || activeCatalogTab === cat.id;
            const IconComponent = getCategoryIcon(cat.name);

            return (
              <button
                type="button"
                key={cat.id || cat.name}
                onClick={() => onSelectCategory(cat.name)}
                className={`w-full p-2.5 rounded-xl border text-right transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99] ${
                  isSelected
                    ? 'bg-[#006d41] border-[#005734] text-white shadow-sm'
                    : 'bg-white border-[#dce1dc] hover:border-[#006d41]/50 hover:bg-[#eaf5ee]/50 text-[#0f172a]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-[#f1f5f4] text-[#006d41] group-hover:bg-[#eaf5ee]'
                  }`}>
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-[13px] font-bold truncate">
                      {cat.name}
                    </div>
                    <div className={`text-[10px] ${isSelected ? 'text-[#c4e3d0]' : 'text-[#52605d]'}`}>
                      {count} {count === 1 ? 'صنف متوفر' : 'أصناف متوفرة'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                    isSelected
                      ? 'bg-white text-[#006d41]'
                      : 'bg-[#f8faf9] text-[#0f172a] border border-[#dce1dc]'
                  }`}>
                    {count}
                  </span>
                  <ChevronLeft className={`w-3.5 h-3.5 opacity-60 ${isSelected ? 'text-white' : 'text-[#52605d]'}`} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};
