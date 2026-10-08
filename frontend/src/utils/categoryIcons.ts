import type { LucideIcon } from 'lucide-react';
import {
  Milk,
  Croissant,
  Cookie,
  Candy,
  CupSoda,
  Coffee,
  IceCream,
  Popcorn,
  Apple,
  Carrot,
  Wheat,
  Bean,
  Beef,
  Drumstick,
  Fish,
  Egg,
  Snowflake,
  Cigarette,
  Sparkles,
  SprayCan,
  Flame,
  Pill,
  Home,
  Shirt,
  BookOpen,
  Scissors,
  Lightbulb,
  Smartphone,
  Gamepad2,
  Boxes,
  ShoppingBag,
  Tag,
  Store,
  Package
} from 'lucide-react';
import { normalizeArabicText } from './money';

export interface CategoryIconDef {
  key: string;
  name: string;
  group: 'food' | 'grocery' | 'general';
  icon: LucideIcon;
}

export const CATEGORY_ICON_CATALOG: CategoryIconDef[] = [
  // 1. Food & Sweets & Drinks
  { key: 'Milk', name: 'ألبان وأجبان', group: 'food', icon: Milk },
  { key: 'Croissant', name: 'مخبوزات ومعجنات', group: 'food', icon: Croissant },
  { key: 'Cookie', name: 'بسكويت وكوكيز', group: 'food', icon: Cookie },
  { key: 'Candy', name: 'حلويات وسكاكر', group: 'food', icon: Candy },
  { key: 'Popcorn', name: 'مقرمشات وسناكس', group: 'food', icon: Popcorn },
  { key: 'CupSoda', name: 'مشروبات وعصائر', group: 'food', icon: CupSoda },
  { key: 'Coffee', name: 'قهوة وشاي وساخن', group: 'food', icon: Coffee },
  { key: 'IceCream', name: 'مثلجات وآيس كريم', group: 'food', icon: IceCream },

  // 2. Fresh & Grocery
  { key: 'Apple', name: 'خضار وفواكه', group: 'grocery', icon: Apple },
  { key: 'Carrot', name: 'خضروات وجزر', group: 'grocery', icon: Carrot },
  { key: 'Wheat', name: 'بقوليات وحبوب ومعلبات', group: 'grocery', icon: Wheat },
  { key: 'Bean', name: 'بقوليات وفول', group: 'grocery', icon: Bean },
  { key: 'Drumstick', name: 'دواجن وفراخ', group: 'grocery', icon: Drumstick },
  { key: 'Beef', name: 'لحوم ومصنعات', group: 'grocery', icon: Beef },
  { key: 'Fish', name: 'أسماك وبحريات', group: 'grocery', icon: Fish },
  { key: 'Egg', name: 'بيض', group: 'grocery', icon: Egg },

  // 3. Retail & General
  { key: 'Snowflake', name: 'مجمدات وفريزر', group: 'general', icon: Snowflake },
  { key: 'Cigarette', name: 'دخان وسجائر وتبغ', group: 'general', icon: Cigarette },
  { key: 'Sparkles', name: 'منظفات وعناية شخصية', group: 'general', icon: Sparkles },
  { key: 'SprayCan', name: 'معطرات ورشاشات', group: 'general', icon: SprayCan },
  { key: 'Flame', name: 'توابل وبهارات وعطارة', group: 'general', icon: Flame },
  { key: 'Pill', name: 'أدوية ومستلزمات صيدلية', group: 'general', icon: Pill },
  { key: 'Home', name: 'أدوات ومستلزمات منزلية', group: 'general', icon: Home },
  { key: 'Shirt', name: 'ملابس وأقمشة', group: 'general', icon: Shirt },
  { key: 'BookOpen', name: 'مكتبية وقرطاسية', group: 'general', icon: BookOpen },
  { key: 'Scissors', name: 'خردوات ومقصات', group: 'general', icon: Scissors },
  { key: 'Lightbulb', name: 'كهرباء ولمبات', group: 'general', icon: Lightbulb },
  { key: 'Smartphone', name: 'إلكترونيات وموبايل', group: 'general', icon: Smartphone },
  { key: 'Gamepad2', name: 'ألعاب وتسالي', group: 'general', icon: Gamepad2 },
  { key: 'Boxes', name: 'كراتين وتخزين', group: 'general', icon: Boxes },
  { key: 'ShoppingBag', name: 'أكياس وحقائب', group: 'general', icon: ShoppingBag },
  { key: 'Tag', name: 'عروض وتخفيضات', group: 'general', icon: Tag },
  { key: 'Store', name: 'سوبرماركت ومتجر', group: 'general', icon: Store },
  { key: 'Package', name: 'صنف عام / افتراضي', group: 'general', icon: Package }
];

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_CATALOG.map((item) => [item.key, item.icon])
);

const STORAGE_KEY = 'rafiq_custom_category_icons';
export const CATEGORY_ICONS_CHANGED_EVENT = 'rafiq:category-icons-changed';

/**
 * استرجاع قائمة الأيقونات المخصصة يدويًا من التخزين المحلي
 */
export function getCustomCategoryIcons(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * حفظ أو إزالة أيقونة مخصصة لتصنيف معين
 */
export function setCustomCategoryIcon(catIdOrName: string, iconKey: string | null): void {
  try {
    const icons = getCustomCategoryIcons();
    const normalizedName = normalizeArabicText(catIdOrName);

    if (!iconKey || iconKey === 'auto') {
      delete icons[catIdOrName];
      if (normalizedName) delete icons[normalizedName];
    } else {
      icons[catIdOrName] = iconKey;
      if (normalizedName) icons[normalizedName] = iconKey;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
    window.dispatchEvent(new CustomEvent(CATEGORY_ICONS_CHANGED_EVENT, { detail: { catIdOrName, iconKey } }));
  } catch (err) {
    console.error('Failed to save category icon:', err);
  }
}

/**
 * استخراج مفتاح الأيقونة المخصصة للقسم إن وجد
 */
export function getCustomCategoryIconKey(categoryName: string, categoryId?: string): string | null {
  const customIcons = getCustomCategoryIcons();
  if (categoryId && customIcons[categoryId]) {
    return customIcons[categoryId];
  }
  if (customIcons[categoryName]) {
    return customIcons[categoryName];
  }
  const norm = normalizeArabicText(categoryName);
  if (norm && customIcons[norm]) {
    return customIcons[norm];
  }
  return null;
}

/**
 * خوارزمية ذكية لاكتشاف الأيقونة الأنسب تلقائياً بناءً على الكلمات المفتاحية في اسم القسم
 */
export function detectSmartCategoryIconKey(categoryName: string): string {
  const norm = normalizeArabicText(categoryName);
  if (!norm) return 'Package';

  // 1. الألبان والأجبان
  if (
    norm.includes('لبن') || norm.includes('البان') || norm.includes('جبن') || norm.includes('اجبان') ||
    norm.includes('حليب') || norm.includes('زبادي') || norm.includes('قشط') || norm.includes('ديري') ||
    norm.includes('رومي') || norm.includes('شيدر') || norm.includes('موزاريل') || norm.includes('زباد')
  ) {
    return 'Milk';
  }

  // 2. المخبوزات
  if (
    norm.includes('مخبوز') || norm.includes('خبز') || norm.includes('عيش') || norm.includes('فينو') ||
    norm.includes('توست') || norm.includes('باتيه') || norm.includes('كرواسون') || norm.includes('كيك') ||
    norm.includes('فطير') || norm.includes('معجنات') || norm.includes('عجين') || norm.includes('حلواني')
  ) {
    return 'Croissant';
  }

  // 3. البسكويت والكوكيز
  if (
    norm.includes('بسكويت') || norm.includes('بسكوت') || norm.includes('كوكيز') ||
    norm.includes('ويفر') || norm.includes('شابور')
  ) {
    return 'Cookie';
  }

  // 4. الحلويات والسكاكر
  if (
    norm.includes('حلوي') || norm.includes('حلويات') || norm.includes('شوكولا') || norm.includes('شيكولات') ||
    norm.includes('بونبون') || norm.includes('توفي') || norm.includes('مصاص') || norm.includes('سكاكر') ||
    norm.includes('مارشميلو') || norm.includes('حلاو')
  ) {
    return 'Candy';
  }

  // 5. المقرمشات والشيبس والتسالي
  if (
    norm.includes('مقرمش') || norm.includes('شيبس') || norm.includes('شيبسي') || norm.includes('سناكس') ||
    norm.includes('تسالي') || norm.includes('فشار') || norm.includes('كرانشي') || norm.includes('سوداني')
  ) {
    return 'Popcorn';
  }

  // 6. المشروبات والعصائر
  if (
    norm.includes('مشروب') || norm.includes('عصير') || norm.includes('عصائر') || norm.includes('كانز') ||
    norm.includes('غازي') || norm.includes('صودا') || norm.includes('بيبسي') || norm.includes('كولا') ||
    norm.includes('مياه') || norm.includes('ميه') || norm.includes('شويبس') || norm.includes('سفن')
  ) {
    return 'CupSoda';
  }

  // 7. القهوة والشاي والمشروبات الساخنة
  if (
    norm.includes('قهو') || norm.includes('شاي') || norm.includes('نسكافيه') || norm.includes('كابتشينو') ||
    norm.includes('بن') || norm.includes('اسبريسو') || norm.includes('اعشاب') || norm.includes('ينسون') ||
    norm.includes('نعناع') || norm.includes('كركديه') || norm.includes('كافيين')
  ) {
    return 'Coffee';
  }

  // 8. المجمدات
  if (norm.includes('مجمد') || norm.includes('تجميد') || norm.includes('مثلج') || norm.includes('فريزر')) {
    return 'Snowflake';
  }

  // 9. الآيس كريم والمثلجات
  if (
    norm.includes('ايس كريم') || norm.includes('جيلاتي') || norm.includes('جيلاتو') ||
    norm.includes('بوظ') || norm.includes('استيك')
  ) {
    return 'IceCream';
  }

  // 10. الدخان والسجائر
  if (
    norm.includes('دخان') || norm.includes('سجائر') || norm.includes('سجاير') || norm.includes('تبغ') ||
    norm.includes('معسل') || norm.includes('شيش') || norm.includes('ولاع')
  ) {
    return 'Cigarette';
  }

  // 11. الخضار والفاكهة
  if (
    norm.includes('فاكه') || norm.includes('فواكه') || norm.includes('تفاح') || norm.includes('موز') ||
    norm.includes('برتقال') || norm.includes('عنب') || norm.includes('مانجو') || norm.includes('خضار') ||
    norm.includes('خضروات') || norm.includes('طماطم') || norm.includes('خيار') || norm.includes('سلط')
  ) {
    return 'Apple';
  }

  // 12. الخضروات الجذرية
  if (norm.includes('جزر') || norm.includes('بطاطس') || norm.includes('بصل') || norm.includes('توم') || norm.includes('ثوم')) {
    return 'Carrot';
  }

  // 13. البقوليات والمعلبات والحبوب
  if (
    norm.includes('بقول') || norm.includes('معلب') || norm.includes('حبوب') || norm.includes('ارز') ||
    norm.includes('رز') || norm.includes('مكرون') || norm.includes('عدس') || norm.includes('لوبي') ||
    norm.includes('فاصولي') || norm.includes('حمص') || norm.includes('دقيق') || norm.includes('شوفان') ||
    norm.includes('نشويات') || norm.includes('صلص')
  ) {
    return 'Wheat';
  }

  // 14. الفول
  if (norm.includes('فول') || norm.includes('فوله')) {
    return 'Bean';
  }

  // 15. الدواجن والفراخ
  if (
    norm.includes('دواجن') || norm.includes('فراخ') || norm.includes('دجاج') || norm.includes('بانيه') ||
    norm.includes('بانية') || norm.includes('اوراك') || norm.includes('صدور') || norm.includes('طيور') ||
    norm.includes('بط') || norm.includes('حمام')
  ) {
    return 'Drumstick';
  }

  // 16. اللحوم والمصنعات
  if (
    norm.includes('لحم') || norm.includes('لحوم') || norm.includes('برجر') || norm.includes('سجق') ||
    norm.includes('كفت') || norm.includes('كبد') || norm.includes('مفروم') || norm.includes('بفتيك') ||
    norm.includes('سوسيس') || norm.includes('لانشون') || norm.includes('بسطرم')
  ) {
    return 'Beef';
  }

  // 17. الأسماك والبحريات
  if (
    norm.includes('سمك') || norm.includes('اسماك') || norm.includes('جمبري') || norm.includes('سي فود') ||
    norm.includes('تون') || norm.includes('سردين') || norm.includes('رنج') || norm.includes('فسيخ') ||
    norm.includes('ماكريل')
  ) {
    return 'Fish';
  }

  // 18. البيض
  if (norm.includes('بيض') || norm.includes('بيضه')) {
    return 'Egg';
  }

  // 19. المنظفات والعناية الشخصية والمنزلية
  if (
    norm.includes('منظف') || norm.includes('صابون') || norm.includes('شامبو') || norm.includes('مسحوق') ||
    norm.includes('غسيل') || norm.includes('كلور') || norm.includes('معطر') || norm.includes('ديتول') ||
    norm.includes('عناي') || norm.includes('نظاف') || norm.includes('مطهر') || norm.includes('معجون') ||
    norm.includes('بلسم') || norm.includes('شاور')
  ) {
    return 'Sparkles';
  }

  // 20. المعطرات والسبراي
  if (norm.includes('عطر') || norm.includes('عطور') || norm.includes('سبراي') || norm.includes('برفان') || norm.includes('رذاذ')) {
    return 'SprayCan';
  }

  // 21. التوابل والبهارات والعطارة
  if (
    norm.includes('توابل') || norm.includes('بهار') || norm.includes('عطار') || norm.includes('كمون') ||
    norm.includes('فلفل') || norm.includes('شطة') || norm.includes('كركم') || norm.includes('قرفة') ||
    norm.includes('هيل') || norm.includes('زعتر') || norm.includes('كزبر')
  ) {
    return 'Flame';
  }

  // 22. الأدوية والصيدلية
  if (
    norm.includes('ادوي') || norm.includes('دواء') || norm.includes('صيدل') || norm.includes('طبي') ||
    norm.includes('فيتامين') || norm.includes('شاش') || norm.includes('قطن') || norm.includes('اسعاف')
  ) {
    return 'Pill';
  }

  // 23. الأدوات المنزلية والبلاستيك
  if (
    norm.includes('منزل') || norm.includes('بلاستيك') || norm.includes('مطبخ') || norm.includes('اطباق') ||
    norm.includes('كاسات') || norm.includes('حلل') || norm.includes('مواعين') || norm.includes('ادوات منزل')
  ) {
    return 'Home';
  }

  // 24. الملابس والأقمشة
  if (
    norm.includes('ملابس') || norm.includes('احذي') || norm.includes('ازياء') || norm.includes('اقمش') ||
    norm.includes('شنط') || norm.includes('جوارب') || norm.includes('شراب')
  ) {
    return 'Shirt';
  }

  // 25. الأدوات المدرسية والمكتبية
  if (
    norm.includes('مدرسي') || norm.includes('قرطاسي') || norm.includes('مكتبي') || norm.includes('كشكول') ||
    norm.includes('كشاكيل') || norm.includes('اقلام') || norm.includes('دفاتر') || norm.includes('دفتر') ||
    norm.includes('ورق')
  ) {
    return 'BookOpen';
  }

  // 26. الكهرباء
  if (norm.includes('كهرب') || norm.includes('لمب') || norm.includes('اضاء') || norm.includes('مشترك') || norm.includes('فيش')) {
    return 'Lightbulb';
  }

  // 27. الإلكترونيات والموبايل
  if (
    norm.includes('الكترون') || norm.includes('موبايل') || norm.includes('شاحن') || norm.includes('كابل') ||
    norm.includes('سماعات') || norm.includes('هاتف')
  ) {
    return 'Smartphone';
  }

  // 28. الألعاب
  if (norm.includes('العاب') || norm.includes('لعب') || norm.includes('اطفال')) {
    return 'Gamepad2';
  }

  return 'Package';
}

/**
 * الحصول على المكون الأيقوني النهائي للقسم (مع مراعاة التخصيص اليدوي للمستخدم أولاً، ثم الاكتشاف الذكي)
 */
export function getCategoryIconComponent(categoryName: string, categoryId?: string): LucideIcon {
  const customKey = getCustomCategoryIconKey(categoryName, categoryId);
  if (customKey && CATEGORY_ICON_MAP[customKey]) {
    return CATEGORY_ICON_MAP[customKey];
  }

  const detectedKey = detectSmartCategoryIconKey(categoryName);
  return CATEGORY_ICON_MAP[detectedKey] || Package;
}
