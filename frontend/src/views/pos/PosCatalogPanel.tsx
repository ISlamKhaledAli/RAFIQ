import React from 'react';
import { Sparkles, Plus, Settings, Search, X, Flame, Star } from 'lucide-react';
import type { SmartCatalogItem } from './types';
import { formatArabicCurrency } from '../../utils/money';

interface PosCatalogPanelProps {
  smartItems: SmartCatalogItem[];
  categoryTabs: { name: string; count: number }[];
  customItemsCount: number;
  popularItemsCount: number;
  catalogSearchQuery: string;
  setCatalogSearchQuery: (q: string) => void;
  activeCatalogTab: string;
  setActiveCatalogTab: (tab: string) => void;
  displayedCatalogItems: SmartCatalogItem[];
  handleSmartItemClick: (item: SmartCatalogItem) => void;
  onOpenQuickFastItemModal: () => void;
  onOpenQuickItemsManager: () => void;
}

export const PosCatalogPanel: React.FC<PosCatalogPanelProps> = ({
  smartItems,
  categoryTabs,
  customItemsCount,
  popularItemsCount,
  catalogSearchQuery,
  setCatalogSearchQuery,
  activeCatalogTab,
  setActiveCatalogTab,
  displayedCatalogItems,
  handleSmartItemClick,
  onOpenQuickFastItemModal,
  onOpenQuickItemsManager,
}) => {
  return (
    <section className="w-[34%] min-w-[290px] max-w-[440px] h-full bg-[#f7f8f6] border-l border-[#dce1dc] flex flex-col p-3 select-none overflow-hidden shrink-0">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#dce1dc] shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#0b4f42]" />
          <span className="text-xs sm:text-sm font-bold text-[#14181a]">أصناف المحل والسريعة</span>
          <span className="text-[10px] font-mono bg-[#e1eae5] text-[#0b4f42] font-bold px-2 py-0.5 rounded">
            {smartItems.length}
          </span>
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
            className="flex items-center gap-1 text-[11px] font-semibold text-[#14181a] bg-white hover:bg-[#f7f8f6] border border-[#dce1dc] px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إدارة وتخصيص وترتيب الأصناف السريعة والمفضلة"
          >
            <Settings className="w-3.5 h-3.5 text-[#5b6664]" />
            <span className="hidden sm:inline">إدارة</span>
          </button>
        </div>
      </div>

      {/* Quick Catalog Search Bar */}
      <div className="relative mb-2.5 shrink-0">
        <Search className="w-3.5 h-3.5 text-[#5b6664] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={catalogSearchQuery}
          onChange={(e) => setCatalogSearchQuery(e.target.value)}
          placeholder="بحث فوري في الأصناف..."
          className="w-full h-8 pr-9 pl-7 text-xs bg-white rounded-lg border border-[#dce1dc] focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42]/30 outline-none transition-all placeholder:text-[#5b6664]/70 text-[#14181a] font-medium"
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

      {/* Smart Navigation & Category Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-lg border border-[#dce1dc] mb-2.5 shrink-0 max-h-24 overflow-y-auto">
        <button
          type="button"
          key="__POPULAR__"
          onClick={() => setActiveCatalogTab('__POPULAR__')}
          className={`h-7 text-[11px] font-bold rounded-lg transition-all px-2.5 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
            activeCatalogTab === '__POPULAR__'
              ? 'bg-[#b3720e] text-white border-[#b3720e] shadow-xs'
              : 'bg-white text-[#14181a] border-[#dce1dc] hover:border-[#b3720e] hover:bg-[#fef7ec] hover:text-[#b3720e]'
          }`}
          title="المنتجات الأكثر مبيعاً واستخداماً تلقائياً"
        >
          <Flame className="w-3.5 h-3.5 text-current" />
          <span>الأكثر طلباً ({popularItemsCount})</span>
        </button>

        <button
          type="button"
          key="__CUSTOM__"
          onClick={() => setActiveCatalogTab('__CUSTOM__')}
          className={`h-7 text-[11px] font-bold rounded-lg transition-all px-2.5 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
            activeCatalogTab === '__CUSTOM__'
              ? 'bg-[#0b4f42] text-white border-[#0b4f42] shadow-xs'
              : 'bg-white text-[#14181a] border-[#dce1dc] hover:border-[#0b4f42] hover:bg-[#e1eae5] hover:text-[#0b4f42]'
          }`}
          title="الأصناف المخصصة والمفضلة يدوياً"
        >
          <Star className="w-3.5 h-3.5 text-current" />
          <span>المفضلة ({customItemsCount})</span>
        </button>

        <button
          type="button"
          key="__ALL__"
          onClick={() => setActiveCatalogTab('__ALL__')}
          className={`h-7 text-[11px] font-bold rounded-lg transition-all px-2.5 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
            activeCatalogTab === '__ALL__'
              ? 'bg-[#0b4f42] text-white border-[#0b4f42] shadow-xs'
              : 'bg-white text-[#14181a] border-[#dce1dc] hover:border-[#0b4f42] hover:bg-[#e1eae5] hover:text-[#0b4f42]'
          }`}
        >
          الكل ({smartItems.length})
        </button>

        {categoryTabs.map((cat) => (
          <button
            type="button"
            key={cat.name}
            onClick={() => setActiveCatalogTab(cat.name)}
            className={`h-7 text-[11px] font-bold rounded-lg transition-all px-2.5 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
              activeCatalogTab === cat.name
                ? 'bg-[#0b4f42] text-white border-[#0b4f42] shadow-xs'
                : 'bg-white text-[#14181a] border-[#dce1dc] hover:border-[#0b4f42] hover:bg-[#e1eae5] hover:text-[#0b4f42]'
            }`}
          >
            <span>{cat.name}</span>
            <span className="text-[10px] opacity-75 font-mono">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* 2-Column Grid of Smart Catalog Items */}
      <div className="flex-1 grid grid-cols-2 gap-2.5 overflow-y-auto pr-0.5 content-start">
        {displayedCatalogItems.map((item) => {
          const isOutOfStock = (item.stockQuantityMilli !== undefined) && item.stockQuantityMilli <= 0;
          const isTopSeller = item.salesCount > 0;

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleSmartItemClick(item)}
              className={`min-h-[86px] rounded-xl p-3 flex flex-col justify-between text-right transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] group cursor-pointer border ${
                isOutOfStock
                  ? 'bg-[#fdf3f2] border-[#f6cbc6] hover:border-[#b23a2e]'
                  : 'bg-white border-[#dce1dc] hover:border-[#006d41]'
              }`}
            >
              <div className="flex items-start justify-between w-full gap-1.5">
                <span className="text-xs sm:text-[13px] font-bold text-[#14181a] line-clamp-2 leading-snug group-hover:text-[#006d41] transition-colors">
                  {item.name}
                </span>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {item.isOpenPrice && (
                    <span className="text-[9px] bg-[#fef7ec] text-[#b3720e] border border-[#f5deb4] px-1.5 py-0.5 rounded-md font-bold">
                      حر
                    </span>
                  )}
                  {item.isCustomQuickItem && (
                    <span className="text-[9px] bg-[#eaf5ee] text-[#006d41] border border-[#c4e3d0] px-1.5 py-0.5 rounded-md font-bold" title="صنف مخصص">
                      ★
                    </span>
                  )}
                  {isTopSeller && activeCatalogTab === '__POPULAR__' && (
                    <span className="text-[9px] bg-orange-100 text-orange-800 border border-orange-300 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5" title={`تم بيعه ${item.salesCount} مرة`}>
                      🔥 {item.salesCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-[#dce1dc]/60 gap-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  {isOutOfStock ? (
                    <span className="text-[10px] font-bold bg-[#fdf3f2] text-[#b23a2e] border border-[#f6cbc6] px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b23a2e]" />
                      <span>نفد</span>
                    </span>
                  ) : item.unit === 'kg' ? (
                    <span className="text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded-md shrink-0">
                      ميزان
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#5b6664] font-medium truncate max-w-[85px] bg-[#f7f8f6] px-1.5 py-0.5 rounded border border-[#dce1dc]">
                      {item.categoryName || 'عام'}
                    </span>
                  )}
                </div>

                <div className="px-2 py-0.5 rounded-lg bg-[#eaf5ee] border border-[#c4e3d0] flex items-center shrink-0">
                  <span className="text-xs sm:text-[13px] font-mono font-bold text-[#006d41] tabular-nums">
                    {item.isOpenPrice ? 'سعر حر' : formatArabicCurrency(item.pricePiasters)}
                  </span>
                </div>
              </div>
            </button>
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
