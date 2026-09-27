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
    <section className="w-[34%] min-w-[290px] max-w-[440px] h-full bg-slate-50 dark:bg-slate-950 hairline-l flex flex-col p-2.5 sm:p-3 select-none overflow-hidden shrink-0">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2 pb-1.5 hairline-b shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-brand" />
          <span className="text-[13px] font-bold text-ink">أصناف المحل والسريعة</span>
          <span className="text-[10px] font-mono bg-brand-soft text-brand font-bold px-1.5 py-0.5 rounded">
            {smartItems.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenQuickFastItemModal}
            className="flex items-center gap-1 text-[11px] font-bold text-white bg-[#006d41] hover:bg-[#005231] active:bg-[#00372d] px-2.5 py-0.5 rounded-md transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إضافة صنف سريع جديد يظهر في أزرار المحل بدون مخزن"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>+ صنف سريع</span>
          </button>
          <button
            type="button"
            onClick={onOpenQuickItemsManager}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-surface hover:bg-surface-2 border border-line px-2 py-0.5 rounded-md transition-all shadow-2xs cursor-pointer active:translate-y-0.5"
            title="إدارة وتخصيص وترتيب الأصناف السريعة والمفضلة"
          >
            <Settings className="w-3.5 h-3.5 text-ink-muted" />
            <span className="hidden sm:inline">إدارة</span>
          </button>
        </div>
      </div>

      {/* Quick Catalog Search Bar */}
      <div className="relative mb-2 shrink-0">
        <Search className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={catalogSearchQuery}
          onChange={(e) => setCatalogSearchQuery(e.target.value)}
          placeholder="بحث فوري في الأصناف..."
          className="w-full h-7 pr-8 pl-6 text-[11px] bg-surface rounded-md border border-line focus:border-brand focus:ring-1 focus:ring-brand/30 outline-hidden transition-all placeholder:text-ink-muted/70 text-ink font-medium"
        />
        {catalogSearchQuery && (
          <button
            type="button"
            onClick={() => setCatalogSearchQuery('')}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Smart Navigation & Category Tabs */}
      <div className="flex flex-wrap gap-1 bg-surface-2 p-1 rounded-lg border border-line mb-2 shrink-0 max-h-24 overflow-y-auto">
        <button
          type="button"
          key="__POPULAR__"
          onClick={() => setActiveCatalogTab('__POPULAR__')}
          className={`h-6 text-[10px] sm:text-[11px] font-bold rounded-md transition-all px-2 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
            activeCatalogTab === '__POPULAR__'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-1 ring-amber-600/30'
              : 'bg-surface text-slate-700 border-slate-300 hover:border-amber-500 hover:bg-amber-50 hover:text-amber-800'
          }`}
          title="المنتجات الأكثر مبيعاً واستخداماً تلقائياً"
        >
          <Flame className="w-3 h-3 text-current" />
          <span>الأكثر طلباً ({popularItemsCount})</span>
        </button>

        <button
          type="button"
          key="__CUSTOM__"
          onClick={() => setActiveCatalogTab('__CUSTOM__')}
          className={`h-6 text-[10px] sm:text-[11px] font-bold rounded-md transition-all px-2 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
            activeCatalogTab === '__CUSTOM__'
              ? 'bg-brand text-white border-brand shadow-xs ring-1 ring-brand/30'
              : 'bg-surface text-slate-700 border-slate-300 hover:border-brand/70 hover:bg-brand-soft/50 hover:text-brand'
          }`}
          title="الأصناف المخصصة والمفضلة يدوياً"
        >
          <Star className="w-3 h-3 text-current" />
          <span>المفضلة ({customItemsCount})</span>
        </button>

        <button
          type="button"
          key="__ALL__"
          onClick={() => setActiveCatalogTab('__ALL__')}
          className={`h-6 text-[10px] sm:text-[11px] font-bold rounded-md transition-all px-2 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
            activeCatalogTab === '__ALL__'
              ? 'bg-brand text-white border-brand shadow-xs ring-1 ring-brand/30'
              : 'bg-surface text-slate-700 border-slate-300 hover:border-brand/70 hover:bg-brand-soft/50 hover:text-brand'
          }`}
        >
          الكل ({smartItems.length})
        </button>

        {categoryTabs.map((cat) => (
          <button
            type="button"
            key={cat.name}
            onClick={() => setActiveCatalogTab(cat.name)}
            className={`h-6 text-[10px] sm:text-[11px] font-bold rounded-md transition-all px-2 py-0.5 text-center cursor-pointer border shadow-2xs flex items-center gap-1 ${
              activeCatalogTab === cat.name
                ? 'bg-brand text-white border-brand shadow-xs ring-1 ring-brand/30'
                : 'bg-surface text-slate-700 border-slate-300 hover:border-brand/70 hover:bg-brand-soft/50 hover:text-brand'
            }`}
          >
            <span>{cat.name}</span>
            <span className="text-[9px] opacity-75 font-mono">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* 2-Column Grid of Smart Catalog Items */}
      <div className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto pr-0.5 content-start">
        {displayedCatalogItems.map((item) => {
          const isOutOfStock = (item.stockQuantityMilli !== undefined) && item.stockQuantityMilli <= 0;
          const isTopSeller = item.salesCount > 0;

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleSmartItemClick(item)}
              className={`min-h-[82px] sm:min-h-[86px] rounded-xl p-2.5 flex flex-col justify-between text-right transition-all duration-150 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] group cursor-pointer border ${
                isOutOfStock
                  ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/50 hover:border-rose-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-[#006d41] dark:hover:border-emerald-500'
              }`}
            >
              <div className="flex items-start justify-between w-full gap-1.5">
                <span className="text-[12px] sm:text-[12.5px] font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-[#006d41] dark:group-hover:text-emerald-400 transition-colors">
                  {item.name}
                </span>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {item.isOpenPrice && (
                    <span className="text-[9px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300/60 px-1.5 py-0.5 rounded-md font-bold">
                      حر
                    </span>
                  )}
                  {item.isCustomQuickItem && (
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 px-1.5 py-0.5 rounded-md font-bold" title="صنف مخصص">
                      ★
                    </span>
                  )}
                  {isTopSeller && activeCatalogTab === '__POPULAR__' && (
                    <span className="text-[9px] bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-300/60 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5" title={`تم بيعه ${item.salesCount} مرة`}>
                      🔥 {item.salesCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between w-full mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 gap-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  {isOutOfStock ? (
                    <span className="text-[10px] font-bold bg-rose-100/90 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300/80 px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <span>نفد</span>
                    </span>
                  ) : item.unit === 'kg' ? (
                    <span className="text-[10px] font-bold bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200/80 px-1.5 py-0.5 rounded-md shrink-0">
                      ميزان
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[85px] bg-slate-100/80 dark:bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/50">
                      {item.categoryName || 'عام'}
                    </span>
                  )}
                </div>

                <div className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/90 dark:border-emerald-800/60 flex items-center shrink-0">
                  <span className="text-[12px] sm:text-[13px] font-mono font-black text-emerald-800 dark:text-emerald-300 tabular-nums">
                    {item.isOpenPrice ? 'سعر حر' : formatArabicCurrency(item.pricePiasters)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}

        {displayedCatalogItems.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center p-6 text-center text-ink-muted my-auto">
            <Sparkles className="w-8 h-8 mb-2 opacity-30 text-brand" />
            {activeCatalogTab === '__POPULAR__' ? (
              <p className="text-[12px] font-medium leading-relaxed">
                لم تسجل أي عمليات بيع بعد لحساب الأكثر طلباً.<br />
                ستظهر الأصناف الأكثر مبيعاً هنا تلقائياً بمجرد إتمام الفواتير.
              </p>
            ) : activeCatalogTab === '__CUSTOM__' ? (
              <p className="text-[12px] font-medium leading-relaxed">
                لم تقم بتخصيص أزرار سريعة بعد.<br />
                اضغط على «تخصيص» بالأسفل لإنشاء أزرارك السريعة.
              </p>
            ) : (
              <p className="text-[12px] font-medium">لا توجد أصناف تطابق هذا البحث أو القسم</p>
            )}
            {activeCatalogTab === '__CUSTOM__' && (
              <button
                type="button"
                onClick={onOpenQuickFastItemModal}
                className="mt-3 px-3 py-1.5 bg-[#006d41] hover:bg-[#005231] text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ إضافة أول صنف سريع الآن</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Quick Items Manage Strip */}
      <div className="mt-1.5 bg-surface hover:bg-surface-2 p-1.5 rounded border border-line flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted transition-colors shrink-0">
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
          className="flex items-center gap-1 text-ink-muted hover:text-ink cursor-pointer"
          title="تخصيص وترتيب الأصناف السريعة"
        >
          <Settings className="w-3.5 h-3.5 text-brand" />
          <span className="font-mono text-[9px] sm:text-[10px]">{customItemsCount} صنف مخصص</span>
        </button>
      </div>
    </section>
  );
};
