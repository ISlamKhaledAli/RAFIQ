import React, { useState, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Check, 
  RotateCcw,
  Layers
} from 'lucide-react';
import { SearchInput } from './SearchInput';
import { 
  CATEGORY_ICON_CATALOG, 
  CATEGORY_ICON_MAP, 
  detectSmartCategoryIconKey, 
  setCustomCategoryIcon,
  getCustomCategoryIconKey,
  type CategoryIconDef
} from '../utils/categoryIcons';
import { normalizeArabicText } from '../utils/money';
import { getCurrentStoreType } from '../utils/storeTerminology';
import { AppButton } from './AppButton';
import { ToggleSwitch } from './ToggleSwitch';
import MotionHeight from './MotionHeight';
import { useMotionPanel } from '../hooks/useMotionPanel';
import { filterIconsForStoreType, getStoreTypeIconLabel } from '../utils/categoryIconFilter';

interface CategoryIconPickerModalProps {
  categoryName: string;
  categoryId?: string;
  onClose: () => void;
  onIconSelected?: (iconKey: string | null) => void;
}

interface FilterTab {
  id: string;
  label: string;
  matcher: (item: CategoryIconDef) => boolean;
}

export const CategoryIconPickerModal: React.FC<CategoryIconPickerModalProps> = ({
  categoryName,
  categoryId,
  onClose,
  onIconSelected
}) => {
  const storeType = useMemo(() => getCurrentStoreType(), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTabId, setSelectedTabId] = useState<string>('recommended');
  const [showAllActivities, setShowAllActivities] = useState(false);
  const gridPanel = useMotionPanel(`${selectedTabId}|${showAllActivities}`);

  const smartSuggestedKey = useMemo(() => {
    return detectSmartCategoryIconKey(categoryName, storeType);
  }, [categoryName, storeType]);

  const currentCustomKey = useMemo(() => {
    return getCustomCategoryIconKey(categoryName, categoryId);
  }, [categoryName, categoryId]);

  const activeKey = currentCustomKey || smartSuggestedKey;
  const isAutoMode = !currentCustomKey;

  // الأيقونات المناسبة لنشاط المتجر، مع إبقاء المختارة حالياً والمقترحة ظاهرة دائماً
  const visibleIcons = useMemo(
    () => (showAllActivities ? CATEGORY_ICON_CATALOG : filterIconsForStoreType(CATEGORY_ICON_CATALOG, storeType, [activeKey, smartSuggestedKey])),
    [showAllActivities, storeType, activeKey, smartSuggestedKey]
  );

  // Custom filter tabs per store profile to reduce distraction and clutter
  const filterTabs = useMemo<FilterTab[]>(() => {
    if (storeType === 'pharmacy') {
      return [
        {
          id: 'recommended',
          label: 'الموصى به للصيدلية',
          matcher: (item) => Boolean(item.storeTypes?.includes('pharmacy') || item.group === 'pharmacy')
        },
        {
          id: 'meds',
          label: 'أدوية وعلاج',
          matcher: (item) => ['Pill', 'Syringe', 'Bandage', 'FlaskConical', 'Stethoscope'].includes(item.key)
        },
        {
          id: 'systemic',
          label: 'قلب وسكر وباطنة',
          matcher: (item) => ['HeartPulse', 'Droplet', 'Wind', 'ShieldPlus'].includes(item.key)
        },
        {
          id: 'care',
          label: 'أطفال وتجميل وحواس',
          matcher: (item) => ['Baby', 'Sparkles', 'Smile', 'Eye', 'Ear', 'Zap', 'Thermometer', 'ShieldCheck'].includes(item.key)
        },
        {
          id: 'all',
          label: 'الكل',
          matcher: () => true
        }
      ];
    }

    if (storeType === 'clothing_apparel') {
      return [
        {
          id: 'recommended',
          label: 'الموصى به للملابس',
          matcher: (item) => Boolean(item.storeTypes?.includes('clothing_apparel') || item.group === 'clothing')
        },
        {
          id: 'wear',
          label: 'أزياء وملابس',
          matcher: (item) => ['Shirt', 'Crown', 'Baby', 'Scissors'].includes(item.key)
        },
        {
          id: 'shoes_bags',
          label: 'أحذية وشنط',
          matcher: (item) => ['Footprints', 'Luggage', 'ShoppingBag'].includes(item.key)
        },
        {
          id: 'accessories',
          label: 'إكسسوارات وساعات',
          matcher: (item) => ['Watch', 'Glasses', 'Gem', 'Tag'].includes(item.key)
        },
        {
          id: 'all',
          label: 'الكل',
          matcher: () => true
        }
      ];
    }

    if (storeType === 'phones_electronics') {
      return [
        {
          id: 'recommended',
          label: 'الموصى به للإلكترونيات',
          matcher: (item) => Boolean(item.storeTypes?.includes('phones_electronics') || item.group === 'electronics')
        },
        {
          id: 'devices',
          label: 'هواتف وأجهزة',
          matcher: (item) => ['Smartphone', 'Laptop', 'Tv', 'Camera'].includes(item.key)
        },
        {
          id: 'audio_game',
          label: 'صوتيات وجيمينج',
          matcher: (item) => ['Headphones', 'Speaker', 'Gamepad2', 'Watch'].includes(item.key)
        },
        {
          id: 'cables_parts',
          label: 'شواحن وكابلات وقطع',
          matcher: (item) => ['Battery', 'Plug', 'Cable', 'Cpu', 'HardDrive', 'Lightbulb'].includes(item.key)
        },
        {
          id: 'all',
          label: 'الكل',
          matcher: () => true
        }
      ];
    }

    if (storeType === 'spices_roastery') {
      return [
        {
          id: 'recommended',
          label: 'الموصى به للعطارة والبن',
          matcher: (item) => Boolean(item.storeTypes?.includes('spices_roastery') || item.group === 'roastery')
        },
        {
          id: 'coffee',
          label: 'بن ومشروبات',
          matcher: (item) => ['Coffee', 'Soup', 'CupSoda'].includes(item.key)
        },
        {
          id: 'spices',
          label: 'توابل وأعشاب',
          matcher: (item) => ['Flame', 'Leaf', 'Flower2', 'Wheat'].includes(item.key)
        },
        {
          id: 'nuts',
          label: 'تسالي ومكسرات',
          matcher: (item) => ['Bean', 'Popcorn', 'Apple', 'Scale'].includes(item.key)
        },
        {
          id: 'all',
          label: 'الكل',
          matcher: () => true
        }
      ];
    }

    if (storeType === 'produce_butchery') {
      return [
        {
          id: 'recommended',
          label: 'الموصى به للجزارة والطازج',
          matcher: (item) => Boolean(item.storeTypes?.includes('produce_butchery') || item.group === 'butchery')
        },
        {
          id: 'meats',
          label: 'لحوم ودواجن وأسماك',
          matcher: (item) => ['Beef', 'Drumstick', 'Fish', 'UtensilsCrossed'].includes(item.key)
        },
        {
          id: 'fresh',
          label: 'خضار وفاكهة وبيض',
          matcher: (item) => ['Apple', 'Carrot', 'Egg', 'Snowflake', 'Scale'].includes(item.key)
        },
        {
          id: 'all',
          label: 'الكل',
          matcher: () => true
        }
      ];
    }

    if (storeType === 'dairy_bakery') {
      return [
        {
          id: 'recommended',
          label: 'الموصى به للألبان والمخبوزات',
          matcher: (item) => Boolean(item.storeTypes?.includes('dairy_bakery') || item.group === 'bakery')
        },
        {
          id: 'dairy',
          label: 'ألبان وأجبان',
          matcher: (item) => ['Milk', 'Egg', 'Snowflake', 'IceCream'].includes(item.key)
        },
        {
          id: 'bakery',
          label: 'مخبوزات وحلويات',
          matcher: (item) => ['Croissant', 'Cake', 'Cookie', 'Candy', 'Wheat', 'Coffee'].includes(item.key)
        },
        {
          id: 'all',
          label: 'الكل',
          matcher: () => true
        }
      ];
    }

    // Default: Supermarket / General Grocery
    return [
      {
        id: 'recommended',
        label: 'الموصى به للمتجر',
        matcher: (item) => Boolean(item.storeTypes?.includes('supermarket') || item.group === 'food' || item.group === 'grocery')
      },
      {
        id: 'food',
        label: 'أغذية ومشروبات',
        matcher: (item) => item.group === 'food' || item.group === 'bakery'
      },
      {
        id: 'fresh',
        label: 'طازج ومجمدات',
        matcher: (item) => item.group === 'grocery' || item.group === 'butchery'
      },
      {
        id: 'general',
        label: 'منظفات وعامة',
        matcher: (item) => item.group === 'general'
      },
      {
        id: 'all',
        label: 'الكل',
        matcher: () => true
      }
    ];
  }, [storeType]);

  const activeTab = useMemo(() => {
    return filterTabs.find((t) => t.id === selectedTabId) || filterTabs[0];
  }, [filterTabs, selectedTabId]);

  const filteredIcons = useMemo(() => {
    const query = normalizeArabicText(searchQuery.trim());
    return visibleIcons.filter((item) => {
      // Searching covers the whole visible set, regardless of the selected tab
      if (query) {
        const itemName = normalizeArabicText(item.name);
        return itemName.includes(query) || item.key.toLowerCase().includes(query.toLowerCase());
      }
      return activeTab.matcher(item);
    });
  }, [searchQuery, activeTab, visibleIcons]);

  const handleToggleAllActivities = (checked: boolean) => {
    setShowAllActivities(checked);
    setSelectedTabId(checked ? 'all' : 'recommended');
  };

  const handleSelectIcon = (key: string | null) => {
    setCustomCategoryIcon(categoryId || categoryName, key);
    onIconSelected?.(key);
    onClose();
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const SmartIconComponent = CATEGORY_ICON_MAP[smartSuggestedKey];
  const smartIconName = CATEGORY_ICON_CATALOG.find((item) => item.key === smartSuggestedKey)?.name;
  const storeTypeLabel = getStoreTypeIconLabel(storeType);

  return (
    <div 
      className="fixed inset-0 z-60 bg-ink/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark overflow-hidden flex flex-col text-right text-ink dark:text-ink-dark">
        {/* Header */}
        <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-b border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
            <div>
              <h3 className="t-modal-title text-ink dark:text-ink-dark m-0">
                اختيار أيقونة للقسم: <span className="text-brand dark:text-brand-bright font-extrabold">{categoryName}</span>
              </h3>
            </div>
          </div>
          <AppButton variant="subtle" size="sm" icon={X} onClick={onClose} aria-label="إغلاق" />
        </div>

        {/* Body */}
        <MotionHeight className="flex-1 min-h-0 overflow-y-auto bg-surface dark:bg-surface-dark">
        <div className="p-4 flex flex-col gap-3.5 text-xs">
          {/* Smart Auto Card */}
          <div className="p-3 rounded-xl bg-brand-soft/40 dark:bg-brand-dark-soft border border-brand/20 dark:border-brand/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-surface dark:bg-surface-dark-2 border border-brand/30 dark:border-brand/40 flex items-center justify-center text-brand dark:text-brand-bright shrink-0 shadow-xs">
                {SmartIconComponent && <SmartIconComponent className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-ink dark:text-ink-dark">الأيقونة الذكية المقترحة:</span>
                  {smartIconName && (
                    <span className="text-brand dark:text-brand-bright font-bold">{smartIconName}</span>
                  )}
                  {isAutoMode && (
                    <span className="text-micro bg-brand dark:bg-brand-container text-white font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>نشطة حالياً</span>
                    </span>
                  )}
                </div>
                <p className="text-micro text-ink-muted dark:text-ink-dark-muted mt-0.5">
                  تم تحديدها تلقائياً بناءً على نشاط المحل واسم القسم بدقة لمنع التشتيت.
                </p>
              </div>
            </div>

            {!isAutoMode && (
              <AppButton
                variant="secondary"
                size="xs"
                icon={RotateCcw}
                onClick={() => handleSelectIcon(null)}
                className="shrink-0"
                title="إعادة التعيين للاقتراح الذكي"
              >
                استعادة التلقائي
              </AppButton>
            )}
          </div>

          {/* Store type filter note + toggle to reveal every activity */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark px-3 py-2">
            <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
              {showAllActivities ? 'تُعرض أيقونات كل الأنشطة' : `أيقونات مناسبة لنشاط: ${storeTypeLabel}`}
            </span>
            <ToggleSwitch
              size="sm"
              checked={showAllActivities}
              onChange={handleToggleAllActivities}
              label="عرض أيقونات كل الأنشطة"
            />
          </div>

          {/* Search Bar & Store Tailored Filter Tabs */}
          <div className="flex flex-col gap-2">
            <SearchInput
              size="sm"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ابحث في جميع الأيقونات بالاسم أو الكود..."
              autoFocus
              ariaLabel="بحث في الأيقونات"
              className="w-full"
            />

            {/* Filter Tabs (Tailored to active store type) */}
            <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-lg border border-line dark:border-line-dark overflow-x-auto shrink-0">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedTabId(tab.id);
                    setSearchQuery('');
                  }}
                  className={`px-2.5 py-1 rounded text-micro font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedTabId === tab.id && !searchQuery
                      ? 'bg-surface dark:bg-surface-dark text-brand dark:text-brand-bright shadow-xs border border-line dark:border-line-dark'
                      : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Icons Grid */}
          <div {...gridPanel}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2 p-1">
            {filteredIcons.length === 0 ? (
              <div className="col-span-full py-8 text-center text-ink-muted dark:text-ink-dark-muted bg-surface-2/50 dark:bg-surface-dark-2 rounded-xl border border-dashed border-line dark:border-line-dark">
                لا توجد أيقونة مطابقة للبحث
              </div>
            ) : (
              filteredIcons.map((item) => {
                const IconComponent = item.icon;
                const isCurrent = activeKey === item.key;
                const isCustomCurrent = currentCustomKey === item.key;

                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => handleSelectIcon(item.key)}
                    title={item.name}
                    className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2.5 cursor-pointer group relative ${
                      isCustomCurrent
                        ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-bold shadow-xs'
                        : isCurrent
                        ? 'border-brand/40 dark:border-brand-bright/40 bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold'
                        : 'border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isCustomCurrent
                        ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40'
                        : 'bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark text-brand dark:text-brand-bright group-hover:bg-brand-soft dark:group-hover:bg-brand-dark-soft'
                    }`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-micro break-words leading-snug">
                        {item.name}
                      </div>
                    </div>

                    {isCustomCurrent && (
                      <Check className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          </div>
        </div>
        </MotionHeight>

        {/* Footer */}
        <div className="h-11 shrink-0 bg-surface-2 dark:bg-surface-dark-2 hairline-t border-t border-line dark:border-line-dark px-4 flex items-center justify-between text-micro text-ink-muted dark:text-ink-dark-muted">
          <span>يتم تطبيق الأيقونة فوراً في شريط الكاشير وكافة شاشات المتجر.</span>
        </div>
      </div>
    </div>
  );
};
