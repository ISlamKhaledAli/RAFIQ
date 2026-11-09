import type { CategoryIconDef } from './categoryIcons';

// أسماء مختصرة لأنشطة المتاجر تظهر في ملاحظة فلتر أيقونات الأقسام
const STORE_TYPE_SHORT_LABELS: Record<string, string> = {
  supermarket: 'سوبر ماركت',
  general_grocery: 'محل تجاري عام',
  pharmacy: 'صيدلية',
  clothing_apparel: 'ملابس وأحذية',
  phones_electronics: 'موبايلات وإلكترونيات',
  produce_butchery: 'خضار وجزارة',
  dairy_bakery: 'ألبان ومخبوزات',
  spices_roastery: 'عطارة وبن',
  stationery_gifts: 'مكتبات وهدايا',
  toys_kids: 'ألعاب أطفال',
  cafe_restaurant: 'مطاعم وكافيهات',
};

// الأيقونة الاحتياطية للصنف العام تظهر دائماً مهما كان النشاط
const ALWAYS_VISIBLE_KEYS = ['Package'];

export function findStoreTypeLabel(storeType: string): string | undefined {
  return STORE_TYPE_SHORT_LABELS[storeType.trim()];
}

export function getStoreTypeIconLabel(storeType: string): string {
  return findStoreTypeLabel(storeType) || STORE_TYPE_SHORT_LABELS.general_grocery;
}

/**
 * الأنشطة التي تُعرض أيقوناتها افتراضياً: النشاط الحالي، ويُضاف السوبر ماركت
 * عندما يكون النشاط غير محدد أو عاماً أو بلا أيقونات موسومة خاصة به.
 */
export function resolveIconStoreTypes(storeType: string, catalog: readonly CategoryIconDef[]): string[] {
  const current = storeType.trim();
  const types = current ? [current] : [];
  const hasTaggedIcons = catalog.some((item) => item.storeTypes?.includes(current));
  if (!current || current === 'general_grocery' || !hasTaggedIcons) types.push('supermarket');
  return types;
}

/**
 * الأيقونات المناسبة لنشاط المتجر: الموسومة بنشاطه، وغير الموسومة (عامة)،
 * والأيقونة الاحتياطية، والأيقونات المطلوب إبقاؤها ظاهرة (المختارة حالياً والمقترحة).
 */
export function filterIconsForStoreType(
  catalog: readonly CategoryIconDef[],
  storeType: string,
  pinnedKeys: readonly string[] = []
): CategoryIconDef[] {
  const types = resolveIconStoreTypes(storeType, catalog);
  return catalog.filter((item) => {
    if (!item.storeTypes || item.storeTypes.length === 0) return true;
    if (ALWAYS_VISIBLE_KEYS.includes(item.key) || pinnedKeys.includes(item.key)) return true;
    return item.storeTypes.some((t) => types.includes(t));
  });
}
