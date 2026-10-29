import { useState, useMemo } from 'react';
import { 
  SlidersHorizontal, 
  Sparkles, 
  Search, 
  Store, 
  ShoppingCart, 
  Package, 
  Wallet, 
  CreditCard, 
  Scale, 
  Calendar, 
  Layers, 
  Pill, 
  FileText, 
  Users, 
  Building2, 
  Percent, 
  RotateCcw, 
  ShieldAlert, 
  Info,
  Smartphone,
  BookOpen,
  Split,
  FileCheck2,
  Tag,
  Activity,
  Coffee,
  Utensils,
  Printer,
  Truck,
  Flame,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { useFeatures } from '../../context/useFeatures';
import { rafiqAlert } from '../../utils/dialogService';
import { INITIAL_STORE_TEMPLATES } from '../../constants/storeTemplates';

interface StoreFeaturesTabProps {
  flags: Record<string, boolean>;
  toggleFlag: (key: string, enabled: boolean) => Promise<void>;
  canManageFeatures?: boolean;
  onOpenWizard?: () => void;
}

type FeatureCategory = 'all' | 'pos' | 'inventory' | 'epay_wallets' | 'cafe_restaurant' | 'pharmacy' | 'finance';

interface FeatureCategoryMeta {
  id: FeatureCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const CATEGORIES: FeatureCategoryMeta[] = [
  { id: 'all', label: 'كافة الميزات', icon: SlidersHorizontal, description: 'عرض جميع الميزات المتاحة بالنظام' },
  { id: 'pos', label: 'نقاط البيع والكاشير', icon: ShoppingCart, description: 'أزرار اللمس، الميزان، الضرائب، ومدفوعات الكاشير' },
  { id: 'inventory', label: 'المنتجات والمخزون', icon: Package, description: 'المقاسات والألوان، التواريخ، الوحدات، وفك العبوات والأرفف' },
  { id: 'epay_wallets', label: 'المدفوعات والمحافظ', icon: Wallet, description: 'إنستاباي، المحافظ، وخدمات الدفع وماكينات الكشك' },
  { id: 'cafe_restaurant', label: 'الكافيهات والمطاعم', icon: Coffee, description: 'إدارة الطاولات، المطبخ، الإضافات، الدليفري، والرسبي' },
  { id: 'pharmacy', label: 'الصيدلية والطبية', icon: Pill, description: 'الأدوية، الروشتات، التأمين الطبي، والدليل الدوائي' },
  { id: 'finance', label: 'المالية والمشتريات', icon: FileText, description: 'حسابات الشكك، النواقص، وتسعير الباتشات' },
];

// Map features to categories
const FEATURE_CATEGORY_MAP: Record<string, FeatureCategory> = {
  feature_pos_digital_payments: 'pos',
  feature_fast_buttons: 'pos',
  feature_scale_weight: 'pos',
  feature_taxes: 'pos',

  feature_matrix_variants: 'inventory',
  feature_multi_units: 'inventory',
  feature_loose_selling: 'inventory',
  feature_expiry_dates: 'inventory',
  feature_shelf_locations: 'inventory',

  feature_digital_wallets: 'epay_wallets',
  feature_epay_services: 'epay_wallets',

  feature_cafe_restaurant: 'cafe_restaurant',
  feature_table_management: 'cafe_restaurant',
  feature_kitchen_printer: 'cafe_restaurant',
  feature_item_modifiers: 'cafe_restaurant',
  feature_delivery_management: 'cafe_restaurant',
  feature_manufacturing_recipes: 'cafe_restaurant',

  feature_pharmacy: 'pharmacy',
  feature_pharma_alternatives: 'pharmacy',
  feature_controlled_drugs: 'pharmacy',
  feature_prescriptions: 'pharmacy',
  feature_patient_profiles: 'pharmacy',
  feature_insurance: 'pharmacy',
  feature_drug_reference: 'pharmacy',
  feature_expiry_returns: 'pharmacy',
  feature_drug_interactions: 'pharmacy',

  feature_credit_debts: 'finance',
  feature_shortage_book: 'finance',
  feature_batch_pricing: 'finance',
};

// Icon mapping
const FEATURE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  feature_pos_digital_payments: Smartphone,
  feature_fast_buttons: ShoppingCart,
  feature_scale_weight: Scale,
  feature_taxes: Percent,

  feature_matrix_variants: Split,
  feature_multi_units: Layers,
  feature_loose_selling: Tag,
  feature_expiry_dates: Calendar,
  feature_shelf_locations: Building2,

  feature_digital_wallets: Wallet,
  feature_epay_services: CreditCard,

  feature_pharmacy: Pill,
  feature_pharma_alternatives: RotateCcw,
  feature_controlled_drugs: ShieldAlert,
  feature_prescriptions: FileCheck2,
  feature_patient_profiles: Users,
  feature_insurance: Building2,
  feature_drug_reference: BookOpen,
  feature_expiry_returns: Calendar,
  feature_drug_interactions: Activity,

  feature_credit_debts: Users,
  feature_shortage_book: FileText,
  feature_batch_pricing: Tag,

  feature_cafe_restaurant: Coffee,
  feature_table_management: Utensils,
  feature_kitchen_printer: Printer,
  feature_item_modifiers: Layers,
  feature_delivery_management: Truck,
  feature_manufacturing_recipes: Flame,
};

export const StoreFeaturesTab = ({
  flags,
  toggleFlag,
  canManageFeatures = true,
  onOpenWizard,
}: StoreFeaturesTabProps) => {
  const { registry } = useFeatures();
  const [selectedCategory, setSelectedCategory] = useState<FeatureCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTipBanner, setShowTipBanner] = useState(false);

  // Active Store Preset detection
  const currentStoreType = useMemo(() => {
    try {
      return localStorage.getItem('rafiq_store_type') || 'general_grocery';
    } catch {
      return 'general_grocery';
    }
  }, []);

  const activeTemplate = useMemo(() => {
    return INITIAL_STORE_TEMPLATES.find((t) => t.id === currentStoreType) || INITIAL_STORE_TEMPLATES[0];
  }, [currentStoreType]);

  // Active count
  const activeCount = useMemo(() => {
    return registry.filter((feat) => flags[feat.key] ?? feat.defaultValue ?? false).length;
  }, [registry, flags]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: registry.length };
    CATEGORIES.forEach((cat) => {
      if (cat.id !== 'all') counts[cat.id] = 0;
    });
    registry.forEach((feat) => {
      const cat = FEATURE_CATEGORY_MAP[feat.key] || 'pos';
      if (counts[cat] !== undefined) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [registry]);

  const filteredFeatures = useMemo(() => {
    return registry.filter((feat) => {
      // Category filter
      const cat = FEATURE_CATEGORY_MAP[feat.key] || 'pos';
      if (selectedCategory !== 'all' && cat !== selectedCategory) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchName = feat.nameAr.toLowerCase().includes(query);
        const matchDesc = feat.descriptionAr.toLowerCase().includes(query);
        return matchName || matchDesc;
      }
      return true;
    });
  }, [registry, selectedCategory, searchQuery]);

  return (
    <div className="flex flex-col gap-3.5 text-xs text-ink dark:text-ink-dark animate-in fade-in pb-8 select-none">
      
      {/* 1. Store Activity Header Banner */}
      <div className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xs p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Store className="w-5 h-5 text-brand dark:text-brand-bright" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-muted-dark">نشاط المتجر الحالي:</span>
              <span className="text-xs font-black text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-dark-soft px-2.5 py-0.5 rounded-lg border border-brand/20 dark:border-brand-bright/20">
                {activeTemplate?.name || 'سوبر ماركت وبقالة'}
              </span>
              <span className="text-[10px] font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-2 py-0.5 rounded-md border border-paid/20">
                {activeCount} من {registry.length} ميزة مفعّلة
              </span>
            </div>
            <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0 mt-0.5 leading-relaxed line-clamp-1">
              {activeTemplate?.description || 'نظام ذكي متكامل لضبط المبيعات والمخزون والحسابات اليومية'}
            </p>
          </div>
        </div>

        {onOpenWizard && (
          <button
            type="button"
            onClick={onOpenWizard}
            className="px-3.5 py-2 bg-paid hover:bg-paid-dark text-white rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>تغيير نشاط المتجر (المعالج السريع)</span>
          </button>
        )}
      </div>

      {/* 2. Compact Collapsible Clarification Banner: InstaPay POS vs Wallet Agency */}
      <div className="bg-paid-soft/40 dark:bg-paid-dark-soft/20 border border-paid/20 dark:border-paid/30 rounded-2xl p-3 shadow-2xs transition-all">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
            <span className="text-xs font-bold text-ink dark:text-ink-dark">
              توضيح هام حول إنستاباي والمحافظ الإلكترونية في المحلات
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowTipBanner(!showTipBanner)}
            className="text-[11px] font-bold text-paid hover:text-paid-dark dark:text-paid-bright flex items-center gap-1 cursor-pointer bg-paid-soft dark:bg-paid-dark-soft px-2 py-1 rounded-lg border border-paid/20"
          >
            <span>{showTipBanner ? 'إخفاء التفاصيل' : 'عرض التوضيح'}</span>
            {showTipBanner ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showTipBanner && (
          <div className="mt-2.5 pt-2.5 border-t border-paid/15 dark:border-paid/20 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
            <div className="bg-surface/80 dark:bg-surface-dark/80 p-2.5 rounded-xl border border-line/60">
              <strong className="text-paid dark:text-paid-bright block mb-0.5">1. قبول الدفع في الكاشير:</strong>
              متاح لجميع الأنشطة (ملابس، كافيهات، مخابز، جزارة، صيدليات) لتمكين الزبائن من سداد ثمن مشترياتهم عبر إنستاباي أو محفظة كاش.
            </div>
            <div className="bg-surface/80 dark:bg-surface-dark/80 p-2.5 rounded-xl border border-line/60">
              <strong className="text-warn dark:text-warn-bright block mb-0.5">2. خدمات وكالة سحب وإيداع المحافظ:</strong>
              مخصصة فقط لمحلات الموبايل والسوبرماركت التي تقدم خدمة السحب والإيداع النقدي للجمهور مقابل عمولة.
            </div>
          </div>
        )}
      </div>

      {/* 3. RBAC Alert Banner if Read-Only */}
      {!canManageFeatures && (
        <div className="bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-xl p-3 text-xs text-warn-dark dark:text-warn-bright font-bold flex items-center gap-2.5 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
          <span>مفاتيح الميزات للعرض فقط: تعديل ميزات النظام محصور بالمشرف الفني الأعلى (Root) لحماية إعدادات المتجر.</span>
        </div>
      )}

      {/* 4. Controls: Categories Filter Pills & Live Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-2.5 shadow-2xs">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-paid text-white shadow-2xs'
                    : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-ink-muted dark:text-ink-muted-dark'}`} />
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-line/40 text-ink-muted dark:text-ink-muted-dark'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-muted-dark absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في أسماء الميزات..."
            className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl h-8.5 pr-8 pl-8 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 5. Features Grid - Senior Redesigned Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredFeatures.map((feat) => {
          const isEnabled = flags[feat.key] ?? feat.defaultValue ?? false;
          const FeatIcon = FEATURE_ICON_MAP[feat.key] || SlidersHorizontal;
          const isPosPayments = feat.key === 'feature_pos_digital_payments';
          const isWalletsAgency = feat.key === 'feature_digital_wallets';

          return (
            <div
              key={feat.key}
              onClick={async () => {
                if (!canManageFeatures) return;
                try {
                  await toggleFlag(feat.key, !isEnabled);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  await rafiqAlert(msg || 'تعذر تعديل حالة الميزة');
                }
              }}
              className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 shadow-2xs ${
                canManageFeatures ? 'cursor-pointer hover:shadow-xs hover:border-line-hover' : 'cursor-not-allowed opacity-80'
              } ${
                isEnabled
                  ? 'bg-paid-soft/30 dark:bg-paid-dark-soft/20 border-paid/40 dark:border-paid/40'
                  : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark'
              }`}
            >
              <div className="flex flex-col gap-2">
                {/* Header row with Title & ToggleSwitch */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isEnabled 
                        ? 'bg-paid text-white shadow-2xs' 
                        : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark'
                    }`}>
                      <FeatIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-ink dark:text-ink-dark truncate m-0">
                        {feat.nameAr}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-paid' : 'bg-ink-muted/40'}`} />
                        <span className={`text-[10px] font-semibold ${
                          isEnabled ? 'text-paid dark:text-paid-bright' : 'text-ink-muted dark:text-ink-muted-dark'
                        }`}>
                          {isEnabled ? 'مفعّلة' : 'معطّلة'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="shrink-0 pt-0.5"
                  >
                    <ToggleSwitch
                      checked={isEnabled}
                      disabled={!canManageFeatures}
                      onChange={async (next) => {
                        if (!canManageFeatures) return;
                        try {
                          await toggleFlag(feat.key, next);
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : String(err);
                          await rafiqAlert(msg || 'تعذر تعديل حالة الميزة');
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Badges for special distinction */}
                {isPosPayments && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 px-2 py-0.5 rounded-md w-fit">
                    <Smartphone className="w-3 h-3" />
                    <span>سداد الفواتير في شاشة البيع</span>
                  </div>
                )}
                {isWalletsAgency && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 px-2 py-0.5 rounded-md w-fit">
                    <Wallet className="w-3 h-3" />
                    <span>خدمة سحب وإيداع نقدي للجمهور (كيوسك)</span>
                  </div>
                )}

                {/* Description */}
                <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0 font-sans line-clamp-2">
                  {feat.descriptionAr}
                </p>
              </div>

              {/* Dependencies if any */}
              {feat.requires && feat.requires.length > 0 && (
                <div className="text-[10px] text-ink-muted dark:text-ink-muted-dark flex items-center gap-1 pt-1.5 border-t border-line/40 dark:border-line-dark/40">
                  <span className="font-bold text-ink/70 dark:text-ink-dark/70">تتطلب:</span>
                  <span className="truncate">
                    {feat.requires
                      .map((r) => registry.find((x) => x.key === r)?.nameAr || r)
                      .join('، ')}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredFeatures.length === 0 && (
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-2 text-ink-muted dark:text-ink-muted-dark">
          <SlidersHorizontal className="w-8 h-8 text-ink-muted/50" />
          <span className="font-bold text-xs">لا توجد ميزات تطابق البحث في هذا القسم</span>
        </div>
      )}

    </div>
  );
};
