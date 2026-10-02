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
  FolderOpen
} from 'lucide-react';
import type { ProductUnit } from '../../types/models';
import type { SmartCatalogItem } from './types';

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
}) => {
  // Determine display label for the active category/tab
  const getActiveTabLabel = () => {
    if (activeCatalogTab === '__ALL__') return 'جميع الأصناف';
    if (activeCatalogTab === '__POPULAR__') return 'الأكثر طلباً ومبيعاً';
    if (activeCatalogTab === '__CUSTOM__') return 'الأصناف المفضلة والسريعة';
    return `قسم: ${activeCatalogTab}`;
  };

  return (
    <section className="flex-1 min-w-[320px] max-w-[480px] h-full bg-[#f8faf9] border-l border-[#dce1dc] flex flex-col p-3 select-none overflow-hidden shrink-0">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#dce1dc] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#eaf5ee] flex items-center justify-center text-[#006d41] border border-[#c4e3d0]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-bold text-[#14181a]">أصناف المحل والمنتجات</span>
              <span className="text-[10px] font-mono bg-[#e1eae5] text-[#0b4f42] font-bold px-1.5 py-0.2 rounded-full">
                {smartItems.length}
              </span>
            </div>
            <div className="text-[10px] text-[#5b6664]">انقر على أي صنف لإضافته مباشرة للسلة</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenQuickFastItemModal}
            className="flex items-center gap-1 text-[11px] font-bold text-white bg-[#006d41] hover:bg-[#005230] active:bg-[#00372d] px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إضافة صنف سريع جديد يظهر في أزرار المحل بدون مخزن"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>+ صنف سريع</span>
          </button>
          <button
            type="button"
            onClick={onOpenQuickItemsManager}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#14181a] bg-white hover:bg-[#f7f8f6] border border-[#dce1dc] px-2 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إدارة وتخصيص وترتيب الأصناف السريعة والمفضلة"
          >
            <Settings className="w-3.5 h-3.5 text-[#5b6664]" />
            <span className="hidden sm:inline">إدارة</span>
          </button>
        </div>
      </div>

      {/* Active Category Info Bar & Search Bar */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        {/* Active Category Indicator Pill */}
        <div className="flex items-center gap-1.5 bg-white border border-[#dce1dc] px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 shadow-2xs">
          <FolderOpen className="w-3.5 h-3.5 text-[#006d41]" />
          <span className="text-[#0f172a] truncate max-w-[130px]">{getActiveTabLabel()}</span>
          <span className="text-[10px] font-mono text-[#006d41] bg-[#eaf5ee] px-1.5 py-0.2 rounded">
            {displayedCatalogItems.length}
          </span>
          {activeCatalogTab !== '__ALL__' && (
            <button
              type="button"
              onClick={() => setActiveCatalogTab('__ALL__')}
              className="text-[#5b6664] hover:text-[#b23a2e] mr-1 p-0.5 rounded cursor-pointer"
              title="إلغاء التصفية وعرض الكل"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Quick Catalog Search Bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-[#5b6664] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={catalogSearchQuery}
            onChange={(e) => setCatalogSearchQuery(e.target.value)}
            placeholder="بحث فوري في الأصناف..."
            className="w-full h-8 pr-8 pl-7 text-xs bg-white rounded-lg border border-[#dce1dc] focus:border-[#006d41] focus:ring-1 focus:ring-[#006d41]/30 outline-none transition-all placeholder:text-[#5b6664]/70 text-[#14181a] font-medium shadow-2xs"
          />
          {catalogSearchQuery && (
            <button
              type="button"
              onClick={() => setCatalogSearchQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[#5b6664] hover:text-[#14181a] p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Grid of Smart Catalog Items */}
      <div className="flex-1 grid grid-cols-2 gap-2.5 overflow-y-auto pr-0.5 content-start auto-rows-fr">
        {displayedCatalogItems.map((item) => {
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
              className="group relative flex flex-col justify-between p-2.5 sm:p-3 rounded-xl bg-white border border-[#dce1dc] hover:border-[#006d41] text-right transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_16px_rgba(0,55,45,0.09)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer min-h-[105px] h-full"
            >
              {/* Top subtle emerald gradient highlight bar on hover */}
              <div className="absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-[#006d41] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-t-xl" />

              {/* Top section: Name & Badges */}
              <div className="w-full shrink-0">
                <div className="flex items-start justify-between gap-1.5 mb-1.5">
                  <span
                    className="text-[13px] sm:text-[13.5px] font-bold text-[#14181a] line-clamp-2 leading-[1.3] group-hover:text-[#006d41] transition-colors"
                    title={item.name}
                  >
                    {item.name}
                  </span>

                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {item.isOpenPrice && (
                      <span className="text-[9px] bg-[#fef7ec] text-[#b3720e] border border-[#f5deb4] px-1.5 py-0.5 rounded font-bold">
                        حر
                      </span>
                    )}
                    {item.isCustomQuickItem && (
                      <span className="p-0.5 bg-[#eaf5ee] text-[#006d41] border border-[#c4e3d0] rounded flex items-center justify-center" title="صنف مخصص">
                        <Star className="w-2.5 h-2.5 fill-[#006d41]" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Category & Status Tags */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isScale ? (
                    <span className="text-[9.5px] font-semibold bg-sky-50 text-sky-800 border border-sky-200/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Scale className="w-2.5 h-2.5 text-sky-600" />
                      <span>ميزان</span>
                    </span>
                  ) : item.hasVariants ? (
                    <span className="text-[9.5px] font-bold bg-[#f3e8ff] text-[#6b21a8] border border-[#d8b4fe] px-1.5 py-0.5 rounded flex items-center gap-1" title="صنف يحتوي على ألوان ومقاسات">
                      <Layers className="w-2.5 h-2.5 text-[#7e22ce]" />
                      <span>ألوان ومقاسات</span>
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-medium text-[#5b6664] bg-[#f7f8f6] border border-[#dce1dc]/80 px-1.5 py-0.5 rounded truncate max-w-[85px]">
                      {item.categoryName || 'عام'}
                    </span>
                  )}

                  {(item.variantColor || item.variantSize) && (
                    <span className="text-[9.5px] font-semibold bg-[#e0e7ff] text-[#3730a3] border border-[#c7d2fe] px-1.5 py-0.5 rounded flex items-center gap-0.5 font-mono">
                      {item.variantColor && <span>{item.variantColor}</span>}
                      {item.variantSize && <span>({item.variantSize})</span>}
                    </span>
                  )}

                  {isOutOfStock ? (
                    <span className="text-[9.5px] font-bold bg-[#fdf3f2] text-[#b23a2e] border border-[#f6cbc6] px-1.5 py-0.5 rounded flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b23a2e]" />
                      <span>نفد</span>
                    </span>
                  ) : isLowStock && stockMilli !== null ? (
                    <span className="text-[9.5px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/70 px-1.5 py-0.5 rounded font-mono">
                      متبقي: {isScale ? `${(stockMilli / 1000).toFixed(1)} كجم` : Math.floor(stockMilli / 1000)}
                    </span>
                  ) : stockMilli !== null && stockMilli > 0 ? (
                    (() => {
                      const packUnit = item.units?.find((u) => !u.isBaseUnit && u.conversionFactor > 1);
                      const wholePacks = packUnit && packUnit.conversionFactor > 0 ? Math.floor(stockMilli / (packUnit.conversionFactor * 1000)) : null;
                      return (
                        <span className="text-[9.5px] font-medium text-[#5b6664] font-mono tabular-nums opacity-80">
                          {isScale ? `${(stockMilli / 1000).toFixed(1)} كجم` : `${Math.floor(stockMilli / 1000)} ق${wholePacks !== null && wholePacks > 0 ? ` (${wholePacks} ${packUnit?.unitName})` : ''}`}
                        </span>
                      );
                    })()
                  ) : null}
                </div>

                {/* Multi-unit package pills for direct carton/box sales */}
                {item.units && item.units.length > 1 && (
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {item.units.filter((u) => !u.isBaseUnit && u.conversionFactor > 1).map((u) => (
                      <span
                        key={u.id || u.unitName}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSmartItemClick(item, u);
                        }}
                        className="px-1.5 py-0.5 text-[9.5px] font-bold rounded-md bg-[#eaf5ee] hover:bg-[#006d41] text-[#006d41] hover:text-white border border-[#c4e3d0] transition-colors flex items-center gap-0.5 cursor-pointer shadow-2xs active:scale-95"
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
              <div className="flex items-center justify-between w-full mt-auto pt-2 border-t border-[#f1f3f1] shrink-0">
                <div className="flex items-baseline gap-1 px-2.5 py-0.5 rounded-lg bg-[#eaf5ee] border border-[#c4e3d0] group-hover:bg-[#006d41] group-hover:border-[#006d41] transition-all duration-150">
                  <span className="text-[13px] sm:text-[14px] font-bold font-mono text-[#006d41] group-hover:text-white tabular-nums tracking-tight transition-colors">
                    {item.isOpenPrice ? 'سعر حر' : (item.pricePiasters / 100).toFixed(2)}
                  </span>
                  {!item.isOpenPrice && (
                    <span className="text-[10px] font-bold text-[#006d41]/80 group-hover:text-white/90 transition-colors">
                      ج.م
                    </span>
                  )}
                </div>

                {item.hasVariants ? (
                  <span className="text-[10px] font-bold text-[#6b21a8] bg-[#f3e8ff] border border-[#d8b4fe] px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Layers className="w-2.5 h-2.5 text-[#7e22ce]" />
                    <span>تحديد الخيار</span>
                  </span>
                ) : (
                  <span className="text-[10.5px] text-[#5b6664] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    إضافة للسلة ↵
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {displayedCatalogItems.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center p-6 text-center text-[#5b6664] my-auto">
            <Sparkles className="w-8 h-8 mb-2 opacity-30 text-[#0b4f42]" />
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
              <p className="text-xs font-medium">لا توجد أصناف تطابق هذا البحث أو القسم</p>
            )}
            {activeCatalogTab === '__CUSTOM__' && (
              <button
                type="button"
                onClick={onOpenQuickFastItemModal}
                className="mt-3 px-3.5 py-1.5 bg-[#006d41] hover:bg-[#005230] text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ إضافة أول صنف سريع الآن</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Quick Items Manage Strip */}
      <div className="mt-2 bg-white hover:bg-[#f7f8f6] p-2 rounded-lg border border-[#dce1dc] flex items-center justify-between text-xs text-[#5b6664] transition-colors shrink-0">
        <button
          type="button"
          onClick={onOpenQuickFastItemModal}
          className="flex items-center gap-1 font-bold text-[#006d41] hover:underline cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>إضافة صنف سريع بدون مخزون</span>
        </button>
        <button
          type="button"
          onClick={onOpenQuickItemsManager}
          className="flex items-center gap-1 text-[#5b6664] hover:text-[#14181a] cursor-pointer"
          title="تخصيص وترتيب الأصناف السريعة"
        >
          <Settings className="w-3.5 h-3.5 text-[#0b4f42]" />
          <span className="font-mono text-[10px]">{customItemsCount} صنف مخصص</span>
        </button>
      </div>
    </section>
  );
};
