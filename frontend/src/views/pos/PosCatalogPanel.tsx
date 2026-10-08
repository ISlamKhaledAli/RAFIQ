import React from 'react';
import { 
  Sparkles, 
  Plus, 
  Settings, 
  Search, 
  X, 
  Star, 
  Scale, 
  Package, 
  Layers,
  Calendar,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import type { ProductUnit, Category } from '../../types/models';
import type { SmartCatalogItem } from './types';
import { useFeatures } from '../../context/useFeatures';

interface PosCatalogPanelProps {
  smartItems: SmartCatalogItem[];
  customItemsCount: number;
  popularItemsCount: number;
  catalogSearchQuery: string;
  setCatalogSearchQuery: (q: string) => void;
  activeCatalogTab: string;
  setActiveCatalogTab: (tab: string) => void;
  displayedCatalogItems: SmartCatalogItem[];
  handleSmartItemClick: (item: SmartCatalogItem, specificUnit?: ProductUnit) => void;
  onOpenQuickFastItemModal: () => void;
  onOpenQuickItemsManager: () => void;
  onOpenVariantMatrixModal?: () => void;
  totalCatalogProductsCount?: number;
  categories?: Category[];
}

export const PosCatalogPanel: React.FC<PosCatalogPanelProps> = ({
  smartItems,
  customItemsCount,
  popularItemsCount: _popularItemsCount,
  catalogSearchQuery,
  setCatalogSearchQuery,
  activeCatalogTab,
  setActiveCatalogTab,
  displayedCatalogItems,
  handleSmartItemClick,
  onOpenQuickFastItemModal,
  onOpenQuickItemsManager,
  onOpenVariantMatrixModal,
  totalCatalogProductsCount = 0,
  categories = [],
}) => {
  const { isEnabled } = useFeatures();
  // Progressive display to guarantee ultra-fast 60fps rendering even with 1000+ items
  const [prevFilter, setPrevFilter] = React.useState({ tab: activeCatalogTab, query: catalogSearchQuery });
  const [visibleCount, setVisibleCount] = React.useState(40);

  if (prevFilter.tab !== activeCatalogTab || prevFilter.query !== catalogSearchQuery) {
    setPrevFilter({ tab: activeCatalogTab, query: catalogSearchQuery });
    setVisibleCount(40);
  }

  const itemsToRender = React.useMemo(() => {
    return displayedCatalogItems.slice(0, visibleCount);
  }, [displayedCatalogItems, visibleCount]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 100) {
      if (visibleCount < displayedCatalogItems.length) {
        setVisibleCount((prev) => Math.min(prev + 40, displayedCatalogItems.length));
      }
    }
  };

  // Determine display label for the active category/tab
  const getActiveTabLabel = () => {
    if (activeCatalogTab === '__ALL__') return 'جميع الأصناف';
    if (activeCatalogTab === '__POPULAR__') return 'الأكثر طلباً ومبيعاً';
    if (activeCatalogTab === '__CUSTOM__') return 'الأصناف المفضلة والسريعة';
    const foundCat = categories.find((c) => c.id === activeCatalogTab || c.name === activeCatalogTab);
    return `قسم: ${foundCat ? foundCat.name : activeCatalogTab}`;
  };

  return (
    <section className="flex-1 min-w-[280px] max-w-[560px] h-full bg-surface-2 border-l border-line flex flex-col p-2.5 sm:p-3 select-none overflow-hidden shrink-0 shadow-2xs">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-line shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-paid-soft flex items-center justify-center text-paid border border-paid-border shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-bold text-ink truncate">أصناف المحل والمنتجات</span>
              <span className="text-[10px] font-mono bg-brand-soft text-brand-dark font-bold px-1.5 py-0.2 rounded-full shrink-0">
                {smartItems.length}
              </span>
            </div>
            <div className="text-[10px] text-ink-muted truncate">انقر على أي صنف لإضافته مباشرة للسلة</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isEnabled('feature_matrix_variants') && onOpenVariantMatrixModal && (
            <button
              type="button"
              onClick={onOpenVariantMatrixModal}
              className="flex items-center gap-1 text-[11px] font-bold text-white bg-purple-700 hover:bg-purple-800 active:bg-purple-900 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
              title="إضافة منتج بمقاسات وألوان متعددة للملابس والأحذية"
            >
              <Layers className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>+ مقاسات وألوان</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenQuickFastItemModal}
            className="flex items-center gap-1 text-[11px] font-bold text-white bg-paid hover:bg-paid-hover active:bg-brand-dark px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إضافة صنف سريع جديد يظهر في أزرار المحل بدون مخزن"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span> صنف سريع</span>
          </button>
          <button
            type="button"
            onClick={onOpenQuickItemsManager}
            className="flex items-center gap-1 text-[11px] font-semibold text-ink bg-surface hover:bg-surface-2 border border-line px-2 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إدارة وتخصيص وترتيب الأصناف السريعة والمفضلة"
          >
            <Settings className="w-3.5 h-3.5 text-ink-muted" />
            <span className="hidden sm:inline">إدارة</span>
          </button>
        </div>
      </div>

      {/* Active Category Info Bar & Search Bar */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        {/* Active Category Indicator Pill */}
        <div className="flex items-center gap-1.5 bg-surface border border-line px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 shadow-2xs">
          <FolderOpen className="w-3.5 h-3.5 text-paid" />
          <span className="text-ink truncate max-w-[120px]">{getActiveTabLabel()}</span>
          <span className="text-[10px] font-mono text-paid bg-paid-soft px-1.5 py-0.2 rounded">
            {displayedCatalogItems.length}
          </span>
          {activeCatalogTab !== '__ALL__' && (
            <button
              type="button"
              onClick={() => setActiveCatalogTab('__ALL__')}
              className="text-ink-muted hover:text-danger mr-1 p-0.5 rounded cursor-pointer"
              title="إلغاء التصفية وعرض الكل"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Quick Catalog Search Bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={catalogSearchQuery}
            onChange={(e) => setCatalogSearchQuery(e.target.value)}
            placeholder="بحث فوري في الأصناف..."
            className="w-full h-8 pr-8 pl-7 text-xs bg-surface rounded-lg border border-line focus:border-brand focus:ring-1 focus:ring-brand/30 outline-none transition-all placeholder:text-ink-muted/70 text-ink font-medium shadow-2xs"
          />
          {catalogSearchQuery && (
            <button
              type="button"
              onClick={() => setCatalogSearchQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Grid of Smart Catalog Items */}
      <div 
        onScroll={handleScroll}
        className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto pr-0.5 content-start custom-scrollbar"
      >
        {itemsToRender.map((item) => {
          const stockMilli = typeof item.stockQuantityMilli === 'number' ? item.stockQuantityMilli : null;
          const isOutOfStock = stockMilli !== null && stockMilli <= 0;
          const isLowStock = stockMilli !== null && stockMilli > 0 && stockMilli <= 5000;
          const isScale = item.unit === 'kg';

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSmartItemClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSmartItemClick(item);
                }
              }}
              className="group relative flex flex-col justify-between p-2.5 rounded-xl bg-surface border border-line hover:border-paid text-right transition-all duration-150 shadow-2xs hover:shadow-card hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer min-h-[105px]"
            >
              {/* Top subtle highlight on hover */}
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-paid to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-t-xl" />

              {/* Top section: Name & Badges */}
              <div className="w-full shrink-0">
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <span
                    className="text-xs sm:text-[13px] font-bold text-ink line-clamp-2 leading-[1.3] group-hover:text-brand transition-colors"
                    title={item.name}
                  >
                    {item.name}
                  </span>

                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {item.isOpenPrice && (
                      <span className="text-[10px] bg-warn-soft text-warn border border-warn-border px-1.5 py-0.2 rounded font-bold">
                        حر
                      </span>
                    )}
                    {item.isCustomQuickItem && (
                      <span className="p-0.5 bg-paid-soft text-paid border border-paid-border rounded flex items-center justify-center" title="صنف مخصص">
                        <Star className="w-2.5 h-2.5 fill-paid" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Category & Status Tags */}
                <div className="flex items-center gap-1 flex-wrap">
                  {isScale ? (
                    <span className="text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                      <Scale className="w-2.5 h-2.5 text-sky-600" />
                      <span>ميزان</span>
                    </span>
                  ) : item.hasVariants ? (
                    <span className="text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.2 rounded flex items-center gap-1" title="صنف يحتوي على ألوان ومقاسات متعددة">
                      <Layers className="w-2.5 h-2.5 text-purple-600" />
                      <span>مقاسات وألوان{item.variantsCount ? ` (${item.variantsCount})` : ''}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-ink-muted bg-surface-2 border border-line px-1.5 py-0.2 rounded truncate max-w-[85px]">
                      {item.categoryName || 'عام'}
                    </span>
                  )}

                  {(item.variantColor || item.variantSize) && (
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded flex items-center gap-1 font-mono">
                      {item.variantColor && <span>{item.variantColor}</span>}
                      {item.variantColor && item.variantSize && <span className="opacity-40">|</span>}
                      {item.variantSize && <span>مقاس: {item.variantSize}</span>}
                    </span>
                  )}

                  {isEnabled('feature_expiry_dates') && item.isExpired && (
                    <span className="text-[10px] font-bold bg-danger-soft text-danger border border-danger-border px-1.5 py-0.2 rounded flex items-center gap-1 animate-pulse" title="يحتوي على دفعات منتهية الصلاحية!">
                      <AlertTriangle className="w-2.5 h-2.5 text-danger shrink-0" />
                      <span>منتهي الصلاحية</span>
                    </span>
                  )}

                  {isEnabled('feature_expiry_dates') && !item.isExpired && item.nearestExpiryDate && (
                    <span className="text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded flex items-center gap-0.5 font-mono" title={`أقرب تاريخ صلاحية: ${item.nearestExpiryDate}`}>
                      <Calendar className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                      <span>صلاحية: {item.nearestExpiryDate}</span>
                    </span>
                  )}

                  {isOutOfStock ? (
                    <span className="text-[10px] font-bold bg-danger-soft text-danger border border-danger-border px-1.5 py-0.2 rounded flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                      <span>نفد</span>
                    </span>
                  ) : isLowStock && stockMilli !== null ? (
                    <span className="text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded font-mono">
                      متبقي: {isScale ? `${(stockMilli / 1000).toFixed(1)} كجم` : Math.floor(stockMilli / 1000)}
                    </span>
                  ) : stockMilli !== null && stockMilli > 0 ? (
                    (() => {
                      const packUnit = item.units?.find((u) => !u.isBaseUnit && u.conversionFactor > 1);
                      const wholePacks = packUnit && packUnit.conversionFactor > 0 ? Math.floor(stockMilli / (packUnit.conversionFactor * 1000)) : null;
                      return (
                        <span className="text-[10px] font-medium text-ink-muted font-mono tabular-nums opacity-85">
                          {isScale ? `${(stockMilli / 1000).toFixed(1)} كجم` : `${Math.floor(stockMilli / 1000)} ق${wholePacks !== null && wholePacks > 0 ? ` (${wholePacks} ${packUnit?.unitName})` : ''}`}
                        </span>
                      );
                    })()
                  ) : null}
                </div>

                {/* Multi-unit package pills for direct carton/box sales */}
                {item.units && item.units.length > 1 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {item.units.filter((u) => !u.isBaseUnit && u.conversionFactor > 1).map((u) => (
                      <span
                        key={u.id || u.unitName}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSmartItemClick(item, u);
                        }}
                        className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-paid-soft hover:bg-paid text-paid hover:text-white border border-paid-border transition-colors flex items-center gap-0.5 cursor-pointer shadow-2xs active:scale-95"
                        title={`إضافة ${u.unitName} (${u.conversionFactor} قطعة) بسعر ${(u.sellPricePiasters / 100).toFixed(2)} ج.م`}
                      >
                        <Package className="w-2.5 h-2.5" />
                        <span>+ {u.unitName} ({u.conversionFactor})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom section: Price & Action Hint */}
              <div className="flex items-center justify-between w-full mt-auto pt-1.5 border-t border-line/60 shrink-0">
                <div className="flex items-baseline gap-1 px-2 py-0.5 rounded-lg bg-paid-soft border border-paid-border group-hover:bg-paid group-hover:border-paid transition-all duration-150">
                  <span className="text-xs sm:text-[13px] font-bold font-mono text-paid group-hover:text-white tabular-nums tracking-tight transition-colors">
                    {item.isOpenPrice ? 'سعر حر' : (item.pricePiasters / 100).toFixed(2)}
                  </span>
                  {!item.isOpenPrice && (
                    <span className="text-[10px] font-bold text-paid/80 group-hover:text-white/90 transition-colors">
                      ج.م
                    </span>
                  )}
                </div>

                {item.hasVariants ? (
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs group-hover:bg-purple-600 group-hover:text-white transition-all">
                    <Layers className="w-3 h-3 text-purple-600 group-hover:text-white transition-colors" />
                    <span>اختر المقاس واللون ↵</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    إضافة للسلة ↵
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {displayedCatalogItems.length > visibleCount && (
          <div className="col-span-2 pt-1 pb-1">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => Math.min(prev + 40, displayedCatalogItems.length))}
              className="w-full py-2 bg-surface hover:bg-paid-soft text-paid border border-paid-border rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
            >
              <span>عرض المزيد (+{displayedCatalogItems.length - visibleCount} صنف)</span>
            </button>
          </div>
        )}

        {displayedCatalogItems.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center p-6 text-center text-ink-muted my-auto">
            <Sparkles className="w-8 h-8 mb-2 opacity-30 text-brand" />
            {activeCatalogTab === '__POPULAR__' ? (
              <p className="text-xs font-medium leading-relaxed">
                لم تسجل أي عمليات بيع بعد لحساب الأكثر طلباً.<br />
                ستظهر الأصناف الأكثر مبيعاً هنا تلقائياً بمجرد إتمام الفواتير.
              </p>
            ) : activeCatalogTab === '__CUSTOM__' ? (
              <p className="text-xs font-medium leading-relaxed">
                لم تقم بتخصيص أزرار سريعة بعد.<br />
                اضغط على «تخصيص» بالأسفل لإنشاء أزرارك السريعة.
              </p>
            ) : (
              <div>
                <p className="text-xs font-medium text-ink">
                  {totalCatalogProductsCount === 0 ? 'قائمة الأصناف فارغة حالياً' : 'لا توجد أصناف تطابق هذا البحث أو القسم'}
                </p>
                {totalCatalogProductsCount === 0 && (
                  <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                    يمكنك إضافة أصنافك الأولى من شاشة «إدارة الأصناف» أو استيراد ملف إكسل جاهز.
                  </p>
                )}
              </div>
            )}
            {activeCatalogTab === '__CUSTOM__' && (
              <button
                type="button"
                onClick={onOpenQuickFastItemModal}
                className="mt-3 px-3.5 py-1.5 bg-paid hover:bg-paid-hover text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ إضافة أول صنف سريع الآن</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Quick Items Manage Strip */}
      <div className="mt-1.5 bg-surface hover:bg-surface-2 p-1.5 px-2.5 rounded-lg border border-line flex items-center justify-between text-xs text-ink-muted transition-colors shrink-0">
        <button
          type="button"
          onClick={onOpenQuickFastItemModal}
          className="flex items-center gap-1 font-bold text-paid hover:underline cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>إضافة صنف سريع بدون مخزون</span>
        </button>
        <button
          type="button"
          onClick={onOpenQuickItemsManager}
          className="flex items-center gap-1 text-ink-muted hover:text-ink cursor-pointer"
          title="تخصيص وترتيب الأصناف السريعة"
        >
          <Settings className="w-3.5 h-3.5 text-brand" />
          <span className="font-mono text-[10px]">{customItemsCount} صنف مخصص</span>
        </button>
      </div>
    </section>
  );
};
