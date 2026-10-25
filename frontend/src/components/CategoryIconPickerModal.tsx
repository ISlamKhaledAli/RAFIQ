import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Sparkles, 
  Check, 
  RotateCcw,
  Layers
} from 'lucide-react';
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

  const smartSuggestedKey = useMemo(() => {
    return detectSmartCategoryIconKey(categoryName, storeType);
  }, [categoryName, storeType]);

  const currentCustomKey = useMemo(() => {
    return getCustomCategoryIconKey(categoryName, categoryId);
  }, [categoryName, categoryId]);

  const activeKey = currentCustomKey || smartSuggestedKey;
  const isAutoMode = !currentCustomKey;

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
          label: 'كل الأيقونات',
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
          label: 'كل الأيقونات',
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
          label: 'كل الأيقونات',
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
          label: 'كل الأيقونات',
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
          label: 'كل الأيقونات',
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
          label: 'كل الأيقونات',
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
        label: 'كل الأيقونات',
        matcher: () => true
      }
    ];
  }, [storeType]);

  const activeTab = useMemo(() => {
    return filterTabs.find((t) => t.id === selectedTabId) || filterTabs[0];
  }, [filterTabs, selectedTabId]);

  const filteredIcons = useMemo(() => {
    const query = normalizeArabicText(searchQuery.trim());
    return CATEGORY_ICON_CATALOG.filter((item) => {
      // If user is searching, search everywhere across catalog
      if (query) {
        const itemName = normalizeArabicText(item.name);
        return itemName.includes(query) || item.key.toLowerCase().includes(query.toLowerCase());
      }
      // Otherwise filter by selected tab matcher
      return activeTab.matcher(item);
    });
  }, [searchQuery, activeTab]);

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

  return (
    <div 
      className="fixed inset-0 z-60 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl max-h-[85vh] bg-surface rounded-xl shadow-2xl border border-line overflow-hidden flex flex-col text-right">
        {/* Header */}
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand" />
            <div>
              <h3 className="text-xs font-bold text-ink m-0">
                اختيار أيقونة للقسم: <span className="text-brand font-extrabold">{categoryName}</span>
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-danger p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
          {/* Smart Auto Card */}
          <div className="p-3 rounded-xl bg-brand-soft/40 border border-brand/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-surface border border-brand/30 flex items-center justify-center text-brand shrink-0 shadow-xs">
                {SmartIconComponent && <SmartIconComponent className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-ink">الأيقونة الذكية المقترحة:</span>
                  <span className="font-mono text-brand font-bold">{smartSuggestedKey}</span>
                  {isAutoMode && (
                    <span className="text-[10px] bg-brand text-white font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>نشطة حالياً</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  تم تحديدها تلقائياً بناءً على نشاط المحل واسم القسم بدقة لمنع التشتيت.
                </p>
              </div>
            </div>

            {!isAutoMode && (
              <button
                type="button"
                onClick={() => handleSelectIcon(null)}
                className="px-2.5 py-1.5 rounded-lg bg-surface border border-line hover:border-brand hover:bg-surface-2 text-ink text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
                title="إعادة التعيين للاقتراح الذكي"
              >
                <RotateCcw className="w-3 h-3 text-brand" />
                <span>استعادة التلقائي</span>
              </button>
            )}
          </div>

          {/* Search Bar & Store Tailored Filter Tabs */}
          <div className="flex flex-col gap-2">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث في جميع الأيقونات بالاسم أو الكود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg h-9 pr-9 pl-3 text-xs text-ink focus:outline-none focus:border-brand"
                autoFocus
              />
            </div>

            {/* Filter Tabs (Tailored to active store type) */}
            <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-line overflow-x-auto shrink-0">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedTabId(tab.id);
                    setSearchQuery('');
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedTabId === tab.id && !searchQuery
                      ? 'bg-surface text-brand shadow-xs border border-line'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Icons Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-1">
            {filteredIcons.length === 0 ? (
              <div className="col-span-full py-8 text-center text-ink-muted bg-surface-2/50 rounded-xl border border-dashed border-line">
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
                    className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2.5 cursor-pointer group relative ${
                      isCustomCurrent
                        ? 'border-brand bg-brand-soft text-brand font-bold shadow-xs'
                        : isCurrent
                        ? 'border-brand/40 bg-surface-2 text-ink font-bold'
                        : 'border-line hover:border-brand/40 hover:bg-surface-2 text-ink'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isCustomCurrent
                        ? 'bg-brand text-white'
                        : 'bg-surface border border-line text-brand group-hover:bg-brand-soft'
                    }`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] truncate leading-tight">
                        {item.name}
                      </div>
                      <div className="text-[9.5px] text-ink-muted truncate font-mono mt-0.5">
                        {item.key}
                      </div>
                    </div>

                    {isCustomCurrent && (
                      <Check className="w-3.5 h-3.5 text-brand shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-11 bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted">
          <span>يتم تطبيق الأيقونة فوراً في شريط الكاشير وكافة شاشات المتجر.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-surface border border-line rounded-lg text-ink hover:bg-surface-2 text-xs font-bold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
