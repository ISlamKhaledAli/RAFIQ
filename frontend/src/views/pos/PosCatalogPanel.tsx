import React from 'react';
import { PANEL_TOGGLE_BUTTON_CLASS, PANEL_TOGGLE_ICON_CLASS } from '../../utils/panelToggle';
import { 
  Sparkles, 
  Flame,
  PanelLeftClose,
  Plus, 
  Search, 
  X, 
  Star, 
  Scale, 
  Package,
  Layers,
  Calendar,
  AlertTriangle,
  Building2,
  HeartPulse,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react';
import type { ProductUnit, Category } from '../../types/models';
import type { SmartCatalogItem } from './types';
import type { InsuranceClaimLine } from '../../types/insurance';
import { useFeatures } from '../../context/useFeatures';
import { getStoreTerminology } from '../../utils/storeTerminology';
import { formatUnitArabic } from '../../utils/units';
import { resolveDefaultSaleUnit } from './saleUnit';
import { POPULAR_ITEMS_LIMIT, POPULAR_WINDOW_DAYS } from './popularItems';

const CATALOG_COLLAPSED_KEY = 'rafiq_pos_catalog_collapsed';

interface PosCatalogPanelProps {
  customItemsCount: number;
  popularItemsCount: number;
  isPopularFallback: boolean;
  catalogSearchQuery: string;
  setCatalogSearchQuery: (q: string) => void;
  activeCatalogTab: string;
  setActiveCatalogTab: (tab: string) => void;
  displayedCatalogItems: SmartCatalogItem[];
  handleSmartItemClick: (item: SmartCatalogItem, specificUnit?: ProductUnit) => void;
  onOpenQuickFastItemModal: () => void;
  onOpenQuickItemsManager: () => void;
  onOpenVariantMatrixModal?: () => void;
  onOpenInsuranceModal?: () => void;
  onOpenChronicDispense?: () => void;
  onOpenQuickShortage?: () => void;
  onOpenDdiManager?: () => void;
  activeInsuranceClaim?: InsuranceClaimLine | null;
  isCartEmpty?: boolean;
  totalCatalogProductsCount?: number;
  categories?: Category[];
  /** Called after the panel is collapsed or expanded so the cashier's focus goes back to the barcode input. */
  onAfterToggle?: () => void;
  // Changes whenever the sections rail is expanded; the catalog opens with it
  expandSignal?: number;
  // Called when the catalog is collapsed, so the sections rail can close with it
  onCollapse?: () => void;
}

export const PosCatalogPanel: React.FC<PosCatalogPanelProps> = ({
  customItemsCount: _customItemsCount,
  popularItemsCount: _popularItemsCount,
  isPopularFallback,
  catalogSearchQuery,
  setCatalogSearchQuery,
  activeCatalogTab,
  setActiveCatalogTab: _setActiveCatalogTab,
  displayedCatalogItems,
  handleSmartItemClick,
  onOpenQuickFastItemModal,
  onOpenQuickItemsManager: _onOpenQuickItemsManager,
  onOpenVariantMatrixModal,
  onOpenInsuranceModal,
  onOpenChronicDispense,
  onOpenQuickShortage,
  onOpenDdiManager,
  activeInsuranceClaim,
  isCartEmpty = false,
  totalCatalogProductsCount = 0,
  categories: _categories = [],
  onAfterToggle,
  expandSignal = 0,
  onCollapse,
}) => {
  const { isEnabled } = useFeatures();
  // Progressive display to guarantee ultra-fast 60fps rendering even with 1000+ items
  const [prevFilter, setPrevFilter] = React.useState({ tab: activeCatalogTab, query: catalogSearchQuery });
  const [visibleCount, setVisibleCount] = React.useState(40);
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(CATALOG_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  // The body stays mounted while collapsed; only the grid's scroll position needs to be put back
  const gridRef = React.useRef<HTMLDivElement>(null);
  const savedScrollTopRef = React.useRef(0);

  React.useEffect(() => {
    if (!isCollapsed && gridRef.current) gridRef.current.scrollTop = savedScrollTopRef.current;
  }, [isCollapsed]);

  React.useEffect(() => {
    if (expandSignal === 0) return;
    setIsCollapsed(false);
    try {
      localStorage.setItem(CATALOG_COLLAPSED_KEY, 'false');
    } catch {
      // ignore
    }
  }, [expandSignal]);

  const toggleCollapsed = () => {
    if (!isCollapsed && gridRef.current) savedScrollTopRef.current = gridRef.current.scrollTop;
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem(CATALOG_COLLAPSED_KEY, String(next));
    } catch {
      // ignore
    }
    if (next) onCollapse?.();
    onAfterToggle?.();
  };

  if (prevFilter.tab !== activeCatalogTab || prevFilter.query !== catalogSearchQuery) {
    setPrevFilter({ tab: activeCatalogTab, query: catalogSearchQuery });
    setVisibleCount(40);
  }

  const terminology = React.useMemo(() => getStoreTerminology(), []);

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

  return (
    <section
      className={`${
        isCollapsed ? 'flex-none w-[3.625rem] min-w-[3.625rem]' : 'flex-1 min-w-[300px] p-2.5 sm:p-3'
      } h-full bg-surface-2 dark:bg-surface-dark-2 border-l border-line dark:border-line-dark flex flex-col select-none overflow-hidden shrink-0 transition-all duration-150 shadow-2xs`}
    >
      {isCollapsed && (
        // Collapsed: only the title as vertical text, the whole strip expands the panel (same as the categories rail)
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={false}
          aria-label="توسيع أصناف المحل"
          title="توسيع أصناف المحل"
          className="flex-1 w-full min-h-0 flex items-center justify-center cursor-pointer hover:bg-brand-soft dark:hover:bg-surface-dark-3 transition-colors"
        >
          <span
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            className="text-sm font-extrabold text-ink dark:text-ink-dark whitespace-nowrap"
          >
            أصناف المحل
          </span>
        </button>
      )}

      <div className={isCollapsed ? 'hidden' : 'contents'}>
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2 pb-2 border-b border-line dark:border-line-dark shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-paid-soft dark:bg-paid-dark-soft flex items-center justify-center text-paid dark:text-paid-bright border border-paid-border dark:border-paid/30 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-sm sm:text-base font-extrabold text-ink dark:text-ink-dark truncate">أصناف المحل</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenInsuranceModal && isEnabled('feature_insurance') && (
            <button
              type="button"
              onClick={onOpenInsuranceModal}
              disabled={isCartEmpty}
              className={`flex items-center gap-1 text-micro font-bold px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap border disabled:opacity-50 disabled:cursor-not-allowed ${
                activeInsuranceClaim
                  ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/30 hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80'
                  : 'bg-surface dark:bg-surface-dark-2 hover:bg-brand-soft dark:hover:bg-brand-dark-soft text-brand dark:text-brand-bright border-line dark:border-line-dark hover:border-brand/30'
              }`}
              title={isCartEmpty ? "يرجى إضافة أدوية للسلة أولاً لتطبيق التأمين" : activeInsuranceClaim ? "تعديل روشتة التأمين المطبقة" : "تطبيق روشتة تأمين طبي للشركات والتعاقدات"}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>{activeInsuranceClaim ? 'تأمين (مُفعّل)' : 'تأمين'}</span>
            </button>
          )}

          {onOpenChronicDispense && isEnabled('feature_patient_profiles') && (
            <button
              type="button"
              onClick={onOpenChronicDispense}
              className="flex items-center gap-1 text-micro font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 hover:bg-paid/20 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
              title="صرف أدوية الأمراض المزمنة للمرضى المسجلين بنقرة واحدة"
            >
              <HeartPulse className="w-3.5 h-3.5 shrink-0 text-paid dark:text-paid-bright" />
              <span>علاج شهري</span>
            </button>
          )}

          {isEnabled('feature_matrix_variants') && onOpenVariantMatrixModal && (
            <button
              type="button"
              onClick={onOpenVariantMatrixModal}
              className="flex items-center gap-1 text-micro font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-brand-dark-soft px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95"
              title="إضافة منتج بمقاسات وألوان متعددة للملابس والأحذية"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>مقاسات وألوان</span>
            </button>
          )}
          {onOpenQuickShortage && (
            <button
              type="button"
              onClick={onOpenQuickShortage}
              className="flex items-center gap-1 text-micro font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 hover:bg-warn-border/40 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
              title="تسجيل النواقص السريع في كشكول النواقص (Ctrl+Q)"
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0 text-warn dark:text-warn-bright" />
              <span>تسجيل نواقص</span>
            </button>
          )}

          {onOpenDdiManager && (isEnabled('feature_drug_interactions') || isEnabled('feature_pharmacy')) && (
            <button
              type="button"
              onClick={onOpenDdiManager}
              className="flex items-center gap-1 text-micro font-bold text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand/40 hover:bg-brand-soft/80 dark:hover:bg-brand-dark-soft/80 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
              title="إدارة وتعديل قاعدة بيانات التعارضات والتداخلات الدوائية"
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-brand dark:text-brand-bright" />
              <span>تداخلات دوائية</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenQuickFastItemModal}
            className="flex items-center gap-1 text-micro font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 hover:bg-paid/20 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95"
            title="إضافة صنف سريع يظهر في أزرار المحل بدون مخزن"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>صنف سريع</span>
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={true}
            aria-label="طي أصناف المحل"
            title="طي أصناف المحل"
            className={PANEL_TOGGLE_BUTTON_CLASS}
          >
            <PanelLeftClose className={PANEL_TOGGLE_ICON_CLASS} />
          </button>
        </div>
      </div>

      {/* Search & Category Filter Row */}
      <div className="flex flex-col gap-1.5 mb-2 shrink-0">
        {/* Quick Catalog Search Bar */}
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={catalogSearchQuery}
            onChange={(e) => setCatalogSearchQuery(e.target.value)}
            placeholder="بحث سريع في الأصناف المعروضة..."
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

        {activeCatalogTab === '__POPULAR__' && (
          <p className="flex items-start gap-1.5 text-xs font-medium leading-relaxed text-ink-muted dark:text-ink-dark-muted">
            <Flame className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warn dark:text-warn-bright" />
            <span>
              {isPopularFallback
                ? 'هتظهر هنا الأصناف الأكثر مبيعاً تلقائياً أول ما تبيع. لحد وقتها بنعرض آخر الأصناف اللي اتضافت.'
                : `أعلى ${POPULAR_ITEMS_LIMIT} صنف مبيعاً في آخر ${POPULAR_WINDOW_DAYS} يوم، مرتبة بعدد القطع المباعة.`}
            </span>
          </p>
        )}
      </div>

      {/* 2-Column Grid of Smart Catalog Items */}
      <div 
        ref={gridRef}
        onScroll={handleScroll}
        className="flex-1 grid grid-cols-2 auto-rows-max gap-2 overflow-y-auto pr-0.5 pt-2 pb-2 px-1 content-start custom-scrollbar"
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
              className={`group relative flex flex-col justify-between p-2 sm:p-2.5 rounded-xl bg-surface dark:bg-surface-dark border transition-all duration-150 shadow-2xs min-h-[6.5rem] cursor-pointer ${
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
              <div className="w-full min-w-0">
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <span
                    className="text-xs sm:text-sm font-bold text-ink dark:text-ink-dark line-clamp-2 leading-tight group-hover:text-brand dark:group-hover:text-brand-bright transition-colors"
                    title={item.name}
                  >
                    {item.name}
                  </span>

                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {item.isOpenPrice && (
                      <span className="text-micro font-extrabold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn-border dark:border-warn-bright/50 px-1.5 py-0.2 rounded shadow-2xs">
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
                    <span className="text-micro font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                      <Scale className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400" />
                      <span>ميزان</span>
                    </span>
                  ) : item.hasVariants ? (
                    <span className="text-micro font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 px-1.5 py-0.2 rounded flex items-center gap-1" title="صنف يحتوي على ألوان ومقاسات متعددة">
                      <Layers className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400" />
                      <span>مقاسات وألوان{item.variantsCount ? ` (${item.variantsCount})` : ''}</span>
                    </span>
                  ) : null}

                  {(item.variantColor || item.variantSize) && (
                    <span className="text-micro font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 px-1.5 py-0.2 rounded flex items-center gap-1 font-mono">
                      {item.variantColor && <span>{item.variantColor}</span>}
                      {item.variantColor && item.variantSize && <span className="opacity-40">|</span>}
                      {item.variantSize && <span>{terminology.badgePrefix}: {item.variantSize}</span>}
                    </span>
                  )}

                  {isEnabled('feature_expiry_dates') && item.isExpired && (
                    <span className="text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/40 px-1.5 py-0.2 rounded flex items-center gap-1 animate-pulse" title="يحتوي على دفعات منتهية الصلاحية!">
                      <AlertTriangle className="w-2.5 h-2.5 text-danger dark:text-danger-bright shrink-0" />
                      <span>منتهي الصلاحية</span>
                    </span>
                  )}

                  {isEnabled('feature_expiry_dates') && !item.isExpired && item.nearestExpiryDate && (
                    <span className="text-micro font-semibold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 px-1.5 py-0.2 rounded flex items-center gap-0.5 font-mono" title={`أقرب تشغيلة: ${item.suggestedBatchNumber || 'افتراضية'} - تاريخ الصلاحية: ${item.nearestExpiryDate}`}>
                      <Calendar className="w-2.5 h-2.5 text-warn dark:text-warn-bright shrink-0" />
                      <span>{item.suggestedBatchNumber ? `${item.suggestedBatchNumber} (${item.nearestExpiryDate})` : `صلاحية: ${item.nearestExpiryDate}`}</span>
                    </span>
                  )}

                  {isOutOfStock ? (
                    <span className="text-xs font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger dark:bg-danger-bright" />
                      <span>نفد</span>
                    </span>
                  ) : isLowStock && stockMilli !== null ? (
                    <span className="text-xs font-bold bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 px-2 py-0.5 rounded-md font-mono tabular-nums">
                      متبقي: {isScale ? `${(stockMilli / 1000).toFixed(1)} كجم` : Math.floor(stockMilli / 1000)}
                    </span>
                  ) : stockMilli !== null && stockMilli > 0 ? (
                    (() => {
                      const packUnit = item.units?.find((u) => !u.isBaseUnit && u.conversionFactor > 1);
                      const wholePacks = packUnit && packUnit.conversionFactor > 0 ? Math.floor(stockMilli / (packUnit.conversionFactor * 1000)) : null;
                      return (
                        <span className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted font-mono tabular-nums">
                          {isScale ? `${(stockMilli / 1000).toFixed(1)} كجم` : `${Math.floor(stockMilli / 1000)} ق${wholePacks !== null && wholePacks > 0 ? ` (${wholePacks} ${packUnit?.unitName})` : ''}`}
                        </span>
                      );
                    })()
                  ) : null}
                </div>

                {/* Multi-unit secondary package pills (excluding default sale unit which is already the card action) */}
                {(() => {
                  if (!item.units || item.units.length <= 1) return null;
                  const defaultUnit = resolveDefaultSaleUnit(item.units, item.defaultSaleUnitId, item.isLooseSellable);

                  const secondaryUnits = item.units.filter((u) => {
                    if (defaultUnit && u.id === defaultUnit.id) return false;
                    if (u.isBaseUnit && item.isLooseSellable === false) return false;
                    return true;
                  });

                  if (secondaryUnits.length === 0) return null;

                  return (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {secondaryUnits.map((u) => (
                        <span
                          key={u.id || u.unitName}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSmartItemClick(item, u);
                          }}
                          className="px-1.5 py-0.5 text-micro font-bold rounded bg-paid-soft dark:bg-surface-dark-3 hover:bg-paid dark:hover:bg-brand text-paid dark:text-paid-bright hover:text-white dark:hover:text-white border border-paid-border dark:border-line-dark transition-colors flex items-center gap-0.5 cursor-pointer shadow-2xs active:scale-95 shrink-0"
                          title={`إضافة ${formatUnitArabic(u.unitName)} (${u.conversionFactor} قطعة) بسعر ${(u.sellPricePiasters / 100).toFixed(2)} ج.م`}
                        >
                          <Package className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate max-w-[5.5rem]">{formatUnitArabic(u.unitName)} ({u.conversionFactor})</span>
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Bottom section: Price & Action Hint */}
              <div className="flex items-center justify-between gap-1 w-full mt-auto pt-1.5 border-t border-line/60 dark:border-line-dark/60 min-w-0">
                {(() => {
                  const defaultUnit = resolveDefaultSaleUnit(item.units, item.defaultSaleUnitId, item.isLooseSellable);
                  const effPrice = (defaultUnit && defaultUnit.sellPricePiasters > 0) ? defaultUnit.sellPricePiasters : item.pricePiasters;
                  const unitSuffix = (defaultUnit && !defaultUnit.isBaseUnit) ? ` / ${formatUnitArabic(defaultUnit.unitName)}` : '';

                  return (
                    <div className="min-w-0 shrink-0 whitespace-nowrap flex items-baseline gap-1 px-1.5 py-0.5 rounded-lg bg-paid-soft dark:bg-surface-dark-3 border border-paid-border dark:border-line-dark group-hover:bg-paid dark:group-hover:bg-brand group-hover:border-paid transition-all duration-150">
                      <span className="text-base sm:text-lg font-extrabold font-mono text-paid dark:text-paid-bright group-hover:text-white tabular-nums tracking-tight transition-colors">
                        {item.isOpenPrice ? 'سعر حر' : (effPrice / 100).toFixed(2)}
                      </span>
                      {!item.isOpenPrice && (
                        <span className="text-xs font-bold text-paid/80 dark:text-paid-bright/80 group-hover:text-white/90 transition-colors whitespace-nowrap">
                          ج.م{unitSuffix}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {item.hasVariants ? (
                  <span className="shrink-0 text-micro font-bold text-purple-700 dark:text-brand-bright bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-2xs group-hover:bg-purple-600 group-hover:text-white transition-all">
                    <Layers className="w-2.5 h-2.5 text-purple-600 dark:text-brand-bright group-hover:text-white transition-colors shrink-0" />
                    <span className="truncate max-w-[4rem]">{terminology.pickVariantPrompt}</span>
                  </span>
                ) : (
                  <span className="min-w-0 truncate text-micro text-ink-muted dark:text-ink-dark-muted opacity-0 group-hover:opacity-100 transition-opacity font-medium hidden sm:inline-block">
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
            {activeCatalogTab === '__CUSTOM__' ? (
              <p className="text-xs font-medium leading-relaxed">
                لسه ما عملتش أزرار سريعة لأصنافك المفضلة.<br />
                اضغط على «صنف سريع» بالأعلى لإنشاء أزرارك السريعة.
              </p>
            ) : (
              <div>
                <p className="text-xs font-medium text-ink dark:text-ink-dark">
                  {totalCatalogProductsCount === 0 ? 'مفيش أصناف متسجلة في المحل حالياً' : 'مفيش أصناف مطابقة للبحث أو القسم ده'}
                </p>
                {totalCatalogProductsCount === 0 && (
                  <p className="text-micro text-ink-muted dark:text-ink-dark-muted mt-1 leading-relaxed">
                    تقدر تضيف بضاعتك من شاشة «الأصناف والمخزن» أو تستورد ملف إكسل جاهز.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </section>
  );
};
