import React from 'react';
import { 
  Sparkles, 
  Plus, 
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
  customItemsCount: _customItemsCount,
  popularItemsCount: _popularItemsCount,
  catalogSearchQuery,
  setCatalogSearchQuery,
  activeCatalogTab,
  setActiveCatalogTab,
  displayedCatalogItems,
  handleSmartItemClick,
  onOpenQuickFastItemModal,
  onOpenQuickItemsManager: _onOpenQuickItemsManager,
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
    if (activeCatalogTab === '__ALL__') return 'كل الأصناف';
    if (activeCatalogTab === '__POPULAR__') return 'أكتر بضاعة بتتباع';
    if (activeCatalogTab === '__CUSTOM__') return 'أصنافي السريعة';
    const foundCat = categories.find((c) => c.id === activeCatalogTab || c.name === activeCatalogTab);
    return `قسم: ${foundCat ? foundCat.name : activeCatalogTab}`;
  };

  return (
    <section className="flex-1 min-w-[280px] max-w-[560px] h-full bg-surface-2 dark:bg-surface-dark-2 border-l border-line dark:border-line-dark flex flex-col p-2.5 sm:p-3 select-none overflow-hidden shrink-0 shadow-2xs">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-line dark:border-line-dark shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft flex items-center justify-center text-paid dark:text-paid-bright border border-paid-border dark:border-paid/30 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-bold text-ink dark:text-ink-dark truncate">أصناف وبضاعة المحل</span>
              <span className="text-[10px] font-mono bg-brand-soft dark:bg-surface-dark-3 text-brand-dark dark:text-brand-bright font-bold px-1.5 py-0.2 rounded-full shrink-0">
                {smartItems.length}
              </span>
            </div>
            <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted truncate">اضغط على أي صنف عشان ينزل علطول في الفاتورة</div>
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
              <span>مقاسات وألوان</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenQuickFastItemModal}
            className="flex items-center gap-1 text-[11px] font-bold text-white bg-paid hover:bg-paid-hover active:bg-brand-dark px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إضافة صنف سريع يظهر في أزرار المحل بدون مخزن"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>صنف سريع</span>
          </button>
        </div>
      </div>

      {/* Active Category Info Bar & Search Bar */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        {/* Active Category Indicator Pill */}
        <div className="flex items-center gap-1.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 shadow-2xs">
          <FolderOpen className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
          <span className="text-ink dark:text-ink-dark truncate max-w-[120px]">{getActiveTabLabel()}</span>
          <span className="text-[10px] font-mono text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-1.5 py-0.2 rounded">
            {displayedCatalogItems.length}
          </span>
          {activeCatalogTab !== '__ALL__' && (
            <button
              type="button"
              onClick={() => setActiveCatalogTab('__ALL__')}
              className="text-ink-muted dark:text-ink-dark-muted hover:text-danger mr-1 p-0.5 rounded cursor-pointer"
              title="عرض كل الأصناف"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Quick Catalog Search Bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={catalogSearchQuery}
            onChange={(e) => setCatalogSearchQuery(e.target.value)}
            placeholder="دور على صنف بالاسم أو الباركود..."
            className="w-full h-8 pr-8 pl-7 text-xs bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand/30 outline-none transition-all placeholder:text-ink-muted/70 dark:placeholder:text-ink-dark-muted/70 text-ink dark:text-ink-dark font-medium shadow-2xs"
          />
          {catalogSearchQuery && (
            <button
              type="button"
              onClick={() => setCatalogSearchQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Grid of Smart Catalog Items */}
      <div 
        onScroll={handleScroll}
        className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto pr-0.5 pt-2.5 pb-2 px-1 content-start custom-scrollbar"
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
              className={`group relative flex flex-col justify-between p-2.5 rounded-xl bg-surface dark:bg-surface-dark border transition-all duration-150 shadow-2xs min-h-[105px] cursor-pointer ${
                isOutOfStock
                  ? 'border-line/80 dark:border-line-dark opacity-85 hover:border-danger/50'
                  : 'border-line dark:border-line-dark hover:border-paid dark:hover:border-paid hover:shadow-card hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]'
              }`}
            >
              {/* Top subtle highlight on hover */}
              <div className={`absolute top-0 inset-x-0 h-[2px] transition-opacity duration-200 rounded-t-xl ${
                isOutOfStock
                  ? 'bg-gradient-to-r from-transparent via-danger to-transparent opacity-0 group-hover:opacity-100'
                  : 'bg-gradient-to-r from-transparent via-paid to-transparent opacity-0 group-hover:opacity-100'
              }`} />

              {/* Top section: Name & Badges */}
              <div className="w-full shrink-0">
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <span
                    className="text-xs sm:text-[13px] font-bold text-ink dark:text-ink-dark line-clamp-2 leading-[1.3] group-hover:text-brand dark:group-hover:text-brand-bright transition-colors"
                    title={item.name}
                  >
                    {item.name}
                  </span>

                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {item.isOpenPrice && (
                      <span className="text-[10px] font-extrabold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/50 px-1.5 py-0.2 rounded shadow-2xs">
                        حر
                      </span>
                    )}
                    {item.isCustomQuickItem && (
                      <span className="p-0.5 bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid/40 rounded flex items-center justify-center shadow-2xs" title="صنف مخصص">
                        <Star className="w-2.5 h-2.5 fill-paid dark:fill-paid-bright" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Status & Stock Tags */}
                <div className="flex items-center gap-1 flex-wrap">
                  {isScale ? (
                    <span className="text-[10px] font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                      <Scale className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400" />
                      <span>ميزان</span>
                    </span>
                  ) : item.hasVariants ? (
                    <span className="text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 px-1.5 py-0.2 rounded flex items-center gap-1" title="صنف يحتوي على ألوان ومقاسات متعددة">
                      <Layers className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400" />
                      <span>مقاسات وألوان{item.variantsCount ? ` (${item.variantsCount})` : ''}</span>
                    </span>
                  ) : null}

                  {(item.variantColor || item.variantSize) && (
                    <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 px-1.5 py-0.2 rounded flex items-center gap-1 font-mono">
                      {item.variantColor && <span>{item.variantColor}</span>}
                      {item.variantColor && item.variantSize && <span className="opacity-40">|</span>}
                      {item.variantSize && <span>مقاس: {item.variantSize}</span>}
                    </span>
                  )}

                  {isEnabled('feature_expiry_dates') && item.isExpired && (
                    <span className="text-[10px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/40 px-1.5 py-0.2 rounded flex items-center gap-1 animate-pulse" title="يحتوي على دفعات منتهية الصلاحية!">
                      <AlertTriangle className="w-2.5 h-2.5 text-danger dark:text-danger-bright shrink-0" />
                      <span>منتهي الصلاحية</span>
                    </span>
                  )}

                  {isEnabled('feature_expiry_dates') && !item.isExpired && item.nearestExpiryDate && (
                    <span className="text-[10px] font-semibold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 px-1.5 py-0.2 rounded flex items-center gap-0.5 font-mono" title={`أقرب تشغيلة: ${item.suggestedBatchNumber || 'افتراضية'} - تاريخ الصلاحية: ${item.nearestExpiryDate}`}>
                      <Calendar className="w-2.5 h-2.5 text-warn dark:text-warn-bright shrink-0" />
                      <span>{item.suggestedBatchNumber ? `${item.suggestedBatchNumber} (${item.nearestExpiryDate})` : `صلاحية: ${item.nearestExpiryDate}`}</span>
                    </span>
                  )}

                  {isOutOfStock ? (
                    <span className="text-[10px] font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/40 px-1.5 py-0.2 rounded flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger dark:bg-danger-bright" />
                      <span>نفد</span>
                    </span>
                  ) : isLowStock && stockMilli !== null ? (
                    <span className="text-[10px] font-semibold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 px-1.5 py-0.2 rounded font-mono">
                      متبقي: {isScale ? `${(stockMilli / 1000).toFixed(1)} كجم` : Math.floor(stockMilli / 1000)}
                    </span>
                  ) : stockMilli !== null && stockMilli > 0 ? (
                    (() => {
                      const packUnit = item.units?.find((u) => !u.isBaseUnit && u.conversionFactor > 1);
                      const wholePacks = packUnit && packUnit.conversionFactor > 0 ? Math.floor(stockMilli / (packUnit.conversionFactor * 1000)) : null;
                      return (
                        <span className="text-[10px] font-medium text-ink-muted dark:text-ink-dark-muted font-mono tabular-nums opacity-85">
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
                        className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-paid-soft dark:bg-surface-dark-3 hover:bg-paid dark:hover:bg-brand text-paid dark:text-paid-bright hover:text-white border border-paid-border dark:border-line-dark transition-colors flex items-center gap-0.5 cursor-pointer shadow-2xs active:scale-95"
                        title={`إضافة ${u.unitName} (${u.conversionFactor} قطعة) بسعر ${(u.sellPricePiasters / 100).toFixed(2)} ج.م`}
                      >
                        <Package className="w-2.5 h-2.5" />
                        <span>{u.unitName} ({u.conversionFactor})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom section: Price & Action Hint */}
              <div className="flex items-center justify-between w-full mt-auto pt-1.5 border-t border-line/60 dark:border-line-dark/60 shrink-0">
                <div className="flex items-baseline gap-1 px-2 py-0.5 rounded-lg bg-paid-soft dark:bg-surface-dark-3 border border-paid-border dark:border-line-dark group-hover:bg-paid dark:group-hover:bg-brand group-hover:border-paid transition-all duration-150">
                  <span className="text-xs sm:text-[13px] font-bold font-mono text-paid dark:text-paid-bright group-hover:text-white tabular-nums tracking-tight transition-colors">
                    {item.isOpenPrice ? 'سعر حر' : (item.pricePiasters / 100).toFixed(2)}
                  </span>
                  {!item.isOpenPrice && (
                    <span className="text-[10px] font-bold text-paid/80 dark:text-paid-bright/80 group-hover:text-white/90 transition-colors">
                      ج.م
                    </span>
                  )}
                </div>

                {item.hasVariants ? (
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs group-hover:bg-purple-600 group-hover:text-white transition-all">
                    <Layers className="w-3 h-3 text-purple-600 group-hover:text-white transition-colors" />
                    <span>اختر المقاس واللون ↵</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted opacity-0 group-hover:opacity-100 transition-opacity font-medium">
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
              className="w-full py-2 bg-surface dark:bg-surface-dark hover:bg-paid-soft dark:hover:bg-surface-dark-3 text-paid dark:text-paid-bright border border-paid-border dark:border-line-dark rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
            >
              <span>عرض المزيد (+{displayedCatalogItems.length - visibleCount} صنف)</span>
            </button>
          </div>
        )}

        {displayedCatalogItems.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center p-6 text-center text-ink-muted dark:text-ink-dark-muted my-auto">
            <Sparkles className="w-8 h-8 mb-2 opacity-30 text-brand dark:text-brand-bright" />
            {activeCatalogTab === '__POPULAR__' ? (
              <p className="text-xs font-medium leading-relaxed">
                لسه مفيش مبيعات اتسجلت عشان نحسب أكتر بضاعة بتتباع.<br />
                الأصناف الأكثر مبيعاً هتظهر هنا تلقائياً أول ما تبيعها في الفواتير.
              </p>
            ) : activeCatalogTab === '__CUSTOM__' ? (
              <p className="text-xs font-medium leading-relaxed">
                لسه ما عملتش أزرار سريعة لأصنافك المفضلة.<br />
                اضغط على «تخصيص» بالأسفل لإنشاء أزرارك السريعة.
              </p>
            ) : (
              <div>
                <p className="text-xs font-medium text-ink dark:text-ink-dark">
                  {totalCatalogProductsCount === 0 ? 'مفيش أصناف متسجلة في المحل حالياً' : 'مفيش أصناف مطابقة للبحث أو القسم ده'}
                </p>
                {totalCatalogProductsCount === 0 && (
                  <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-1 leading-relaxed">
                    تقدر تضيف بضاعتك من شاشة «الأصناف والمخزن» أو تستورد ملف إكسل جاهز.
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
                <span>ضيف أول صنف سريع دلوقتي</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
