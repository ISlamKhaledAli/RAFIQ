import type { LucideIcon } from 'lucide-react';
import {
  // 1. الصيدلية والمستلزمات الطبية
  Pill,
  Syringe,
  HeartPulse,
  Droplet,
  Wind,
  Eye,
  Ear,
  Smile,
  Bandage,
  Baby,
  Zap,
  FlaskConical,
  Thermometer,
  ShieldPlus,
  ShieldCheck,
  Stethoscope,

  // 2. الملابس والأزياء والأحذية
  Shirt,
  Footprints,
  Luggage,
  Glasses,
  Watch,
  Gem,
  Crown,
  Scissors,

  // 3. الموبايلات والإلكترونيات والكمبيوتر
  Smartphone,
  Laptop,
  Headphones,
  Cable,
  Battery,
  Plug,
  Camera,
  Tv,
  Speaker,
  Gamepad2,
  Cpu,
  HardDrive,

  // 4. العطارة والمحامص والبن والأعشاب
  Coffee,
  Flame,
  Leaf,
  Bean,
  Flower2,
  Wheat,
  Scale,
  Soup,

  // 5. الجزارة واللحوم والأسماك والخضار
  Beef,
  Drumstick,
  Fish,
  Apple,
  Carrot,
  UtensilsCrossed,

  // 6. الألبان والمخبوزات والحلويات
  Milk,
  Croissant,
  Cake,
  Cookie,
  Candy,
  IceCream,
  Egg,

  // 7. السوبرماركت والتجزئة والمنظفات والعام
  CupSoda,
  Cigarette,
  Sparkles,
  SprayCan,
  Snowflake,
  Home,
  BookOpen,
  Lightbulb,
  Boxes,
  ShoppingBag,
  Tag,
  Store,
  Package,
  Popcorn
} from 'lucide-react';
import { normalizeArabicText } from './money';
import { getCurrentStoreType } from './storeTerminology';

export type CategoryGroupType =
  | 'all'
  | 'pharmacy'
  | 'clothing'
  | 'electronics'
  | 'roastery'
  | 'butchery'
  | 'bakery'
  | 'food'
  | 'grocery'
  | 'general';

export interface CategoryIconDef {
  key: string;
  name: string;
  group: CategoryGroupType;
  storeTypes?: string[]; // المتاجر التي تُوصى فيها هذه الأيقونة
  icon: LucideIcon;
}

export const CATEGORY_ICON_CATALOG: CategoryIconDef[] = [
  // ==========================================
  // 1. القطاع الطبي والصيدليات (Pharmacy & Healthcare)
  // ==========================================
  { key: 'Pill', name: 'أدوية وكبسولات ومضادات', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Pill },
  { key: 'HeartPulse', name: 'القلب والضغط والدم', group: 'pharmacy', storeTypes: ['pharmacy'], icon: HeartPulse },
  { key: 'Droplet', name: 'السكر والغدد والتحاليل', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Droplet },
  { key: 'Syringe', name: 'حقن وأمبولات وسرنجات', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Syringe },
  { key: 'Bandage', name: 'مسكنات وعظام ومفاصل', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Bandage },
  { key: 'Wind', name: 'جهاز تنفسي وصدر وكحة', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Wind },
  { key: 'Eye', name: 'عيون وقطرات وبصريات', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Eye },
  { key: 'Ear', name: 'أنف وأذن وحنجرة', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Ear },
  { key: 'Smile', name: 'أسنان وفم ولثة وغسول', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Smile },
  { key: 'Baby', name: 'أطفال ورضع وحفاضات', group: 'pharmacy', storeTypes: ['pharmacy', 'clothing_apparel'], icon: Baby },
  { key: 'Zap', name: 'فيتامينات ومقويات وطاقة', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Zap },
  { key: 'Sparkles', name: 'تجميل وعناية بالبشرة', group: 'pharmacy', storeTypes: ['pharmacy', 'supermarket'], icon: Sparkles },
  { key: 'FlaskConical', name: 'محاليل ومطهرات ومختبر', group: 'pharmacy', storeTypes: ['pharmacy'], icon: FlaskConical },
  { key: 'Thermometer', name: 'حرارة وترمومترات وأجهزة', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Thermometer },
  { key: 'ShieldPlus', name: 'جهاز هضمي ومعدة ومناعة', group: 'pharmacy', storeTypes: ['pharmacy'], icon: ShieldPlus },
  { key: 'ShieldCheck', name: 'مستلزمات طبية وإسعافات', group: 'pharmacy', storeTypes: ['pharmacy'], icon: ShieldCheck },
  { key: 'Stethoscope', name: 'كشف طبي وسماعات ورعاية', group: 'pharmacy', storeTypes: ['pharmacy'], icon: Stethoscope },

  // ==========================================
  // 2. محلات الملابس والأزياء والأحذية (Clothing & Apparel)
  // ==========================================
  { key: 'Shirt', name: 'ملابس وقمصان وتيشرتات', group: 'clothing', storeTypes: ['clothing_apparel'], icon: Shirt },
  { key: 'Footprints', name: 'أحذية وسنيكرز وشباشب', group: 'clothing', storeTypes: ['clothing_apparel'], icon: Footprints },
  { key: 'Luggage', name: 'حقائب وشنط يد وسفر', group: 'clothing', storeTypes: ['clothing_apparel'], icon: Luggage },
  { key: 'Glasses', name: 'نظارات شمسية وإكسسوار', group: 'clothing', storeTypes: ['clothing_apparel'], icon: Glasses },
  { key: 'Watch', name: 'ساعات يد ومجوهرات', group: 'clothing', storeTypes: ['clothing_apparel', 'phones_electronics'], icon: Watch },
  { key: 'Gem', name: 'إكسسوارات فاخرة وحلي', group: 'clothing', storeTypes: ['clothing_apparel'], icon: Gem },
  { key: 'Crown', name: 'ماركات وبراندات فاخرة', group: 'clothing', storeTypes: ['clothing_apparel'], icon: Crown },
  { key: 'Scissors', name: 'تفصيل وخياطة وأقمشة', group: 'clothing', storeTypes: ['clothing_apparel'], icon: Scissors },

  // ==========================================
  // 3. الموبايلات والإلكترونيات (Phones & Electronics)
  // ==========================================
  { key: 'Smartphone', name: 'هواتف وموبايلات وتابلت', group: 'electronics', storeTypes: ['phones_electronics'], icon: Smartphone },
  { key: 'Laptop', name: 'كمبيوتر ولابتوب وشاشات', group: 'electronics', storeTypes: ['phones_electronics'], icon: Laptop },
  { key: 'Headphones', name: 'سماعات وإيربودز وصوتيات', group: 'electronics', storeTypes: ['phones_electronics'], icon: Headphones },
  { key: 'Cable', name: 'كابلات ووصلات وتحويلات', group: 'electronics', storeTypes: ['phones_electronics'], icon: Cable },
  { key: 'Battery', name: 'بطاريات وباور بنك وشحن', group: 'electronics', storeTypes: ['phones_electronics'], icon: Battery },
  { key: 'Plug', name: 'شواحن وأفياش ومحولات', group: 'electronics', storeTypes: ['phones_electronics'], icon: Plug },
  { key: 'Camera', name: 'كاميرات وتصوير وعدسات', group: 'electronics', storeTypes: ['phones_electronics'], icon: Camera },
  { key: 'Tv', name: 'شاشات عرض وتلفزيونات', group: 'electronics', storeTypes: ['phones_electronics'], icon: Tv },
  { key: 'Speaker', name: 'مكبرات صوت واستريو وصب', group: 'electronics', storeTypes: ['phones_electronics'], icon: Speaker },
  { key: 'Gamepad2', name: 'ألعاب وبلايستيشن وجيمينج', group: 'electronics', storeTypes: ['phones_electronics'], icon: Gamepad2 },
  { key: 'Cpu', name: 'قطع غيار وكروت ومعالجات', group: 'electronics', storeTypes: ['phones_electronics'], icon: Cpu },
  { key: 'HardDrive', name: 'تخزين وهاردات وفلاشات', group: 'electronics', storeTypes: ['phones_electronics'], icon: HardDrive },

  // ==========================================
  // 4. العطارة والمحامص والبن (Spices & Roastery)
  // ==========================================
  { key: 'Coffee', name: 'بن وقهوة وتوليفات ومحمص', group: 'roastery', storeTypes: ['spices_roastery', 'dairy_bakery', 'supermarket'], icon: Coffee },
  { key: 'Flame', name: 'توابل وبهارات وشطة حارة', group: 'roastery', storeTypes: ['spices_roastery', 'produce_butchery'], icon: Flame },
  { key: 'Leaf', name: 'أعشاب طبيعية وبابونج وزهور', group: 'roastery', storeTypes: ['spices_roastery', 'pharmacy'], icon: Leaf },
  { key: 'Bean', name: 'مكسرات وفول وتسالي وحبوب', group: 'roastery', storeTypes: ['spices_roastery', 'supermarket'], icon: Bean },
  { key: 'Flower2', name: 'كركديه وياسمين ونباتات', group: 'roastery', storeTypes: ['spices_roastery'], icon: Flower2 },
  { key: 'Soup', name: 'مشروبات ساخنة وحبوب شرب', group: 'roastery', storeTypes: ['spices_roastery'], icon: Soup },

  // ==========================================
  // 5. الجزارة والدواجن والأسماك والخضار (Butchery & Fresh)
  // ==========================================
  { key: 'Beef', name: 'لحوم ومفروم وكبدة ومصنعات', group: 'butchery', storeTypes: ['produce_butchery', 'supermarket'], icon: Beef },
  { key: 'Drumstick', name: 'دواجن وفراخ وبانيه وطيور', group: 'butchery', storeTypes: ['produce_butchery', 'supermarket'], icon: Drumstick },
  { key: 'Fish', name: 'أسماك وبحريات وجمبري وتونة', group: 'butchery', storeTypes: ['produce_butchery', 'supermarket'], icon: Fish },
  { key: 'Apple', name: 'فواكه وطماطم وخضروات طازجة', group: 'grocery', storeTypes: ['produce_butchery', 'supermarket'], icon: Apple },
  { key: 'Carrot', name: 'جزر وبطاطس وبصل وخضار جذري', group: 'grocery', storeTypes: ['produce_butchery', 'supermarket'], icon: Carrot },
  { key: 'UtensilsCrossed', name: 'قطعية وتجهيز وشواء وتتبيل', group: 'butchery', storeTypes: ['produce_butchery'], icon: UtensilsCrossed },
  { key: 'Scale', name: 'ميزان وحصص بالوزن والجرام', group: 'butchery', storeTypes: ['produce_butchery', 'spices_roastery'], icon: Scale },

  // ==========================================
  // 6. الألبان والمخبوزات والحلويات (Dairy & Bakery)
  // ==========================================
  { key: 'Milk', name: 'ألبان وأجبان وحليب وزبادي', group: 'bakery', storeTypes: ['dairy_bakery', 'supermarket'], icon: Milk },
  { key: 'Croissant', name: 'مخبوزات وفينو وتوست وباتيه', group: 'bakery', storeTypes: ['dairy_bakery', 'supermarket'], icon: Croissant },
  { key: 'Cake', name: 'كيك وتورت وجاتوه وحلويات', group: 'bakery', storeTypes: ['dairy_bakery', 'supermarket'], icon: Cake },
  { key: 'Cookie', name: 'بسكويت وكوكيز وويفر', group: 'food', storeTypes: ['dairy_bakery', 'supermarket'], icon: Cookie },
  { key: 'Candy', name: 'حلويات وشوكولاتة وسكاكر', group: 'food', storeTypes: ['dairy_bakery', 'supermarket'], icon: Candy },
  { key: 'IceCream', name: 'آيس كريم وجيلاتي ومثلجات', group: 'food', storeTypes: ['dairy_bakery', 'supermarket'], icon: IceCream },
  { key: 'Egg', name: 'بيض مائدة وأطباق بيض', group: 'bakery', storeTypes: ['dairy_bakery', 'produce_butchery', 'supermarket'], icon: Egg },
  { key: 'Wheat', name: 'دقيق وردة وعجائن وغلال', group: 'bakery', storeTypes: ['dairy_bakery', 'spices_roastery', 'supermarket'], icon: Wheat },

  // ==========================================
  // 7. السوبرماركت والتجزئة والعام (Supermarket & General)
  // ==========================================
  { key: 'CupSoda', name: 'عصائر ومشروبات باردة وكانز', group: 'food', storeTypes: ['supermarket', 'dairy_bakery'], icon: CupSoda },
  { key: 'Popcorn', name: 'مقرمشات وشيبس وسناكس', group: 'food', storeTypes: ['supermarket', 'spices_roastery'], icon: Popcorn },
  { key: 'Snowflake', name: 'مجمدات وفريزر ومثلجات', group: 'grocery', storeTypes: ['supermarket', 'produce_butchery'], icon: Snowflake },
  { key: 'Cigarette', name: 'سجائر وتبغ ومعسل وولاعات', group: 'general', storeTypes: ['supermarket', 'general_grocery'], icon: Cigarette },
  { key: 'SprayCan', name: 'معطرات ورشاشات وسبراي', group: 'general', storeTypes: ['supermarket', 'general_grocery'], icon: SprayCan },
  { key: 'Home', name: 'أدوات منزلية ومطبخ وبلاستيك', group: 'general', storeTypes: ['supermarket', 'general_grocery'], icon: Home },
  { key: 'BookOpen', name: 'مكتبية وأدوات مدرسية ودفاتر', group: 'general', storeTypes: ['general_grocery'], icon: BookOpen },
  { key: 'Lightbulb', name: 'لمبات كهرباء وإضاءة', group: 'general', storeTypes: ['phones_electronics', 'general_grocery'], icon: Lightbulb },
  { key: 'Boxes', name: 'كراتين وتخزين وجملة', group: 'general', storeTypes: ['general_grocery', 'supermarket'], icon: Boxes },
  { key: 'ShoppingBag', name: 'حقائب تسوق وأكياس', group: 'general', storeTypes: ['clothing_apparel', 'general_grocery'], icon: ShoppingBag },
  { key: 'Tag', name: 'عروض وتخفيضات وبكجات', group: 'general', storeTypes: ['general_grocery', 'supermarket', 'clothing_apparel'], icon: Tag },
  { key: 'Store', name: 'متجر عام وسوبرماركت', group: 'general', storeTypes: ['supermarket', 'general_grocery'], icon: Store },
  { key: 'Package', name: 'صنف عام / تصنيف افتراضي', group: 'general', storeTypes: ['general_grocery'], icon: Package }
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
 * خوارزمية ذكية لاكتشاف الأيقونة الأنسب تلقائياً بناءً على الكلمات المفتاحية في اسم القسم ونوع المتجر
 */
export function detectSmartCategoryIconKey(categoryName: string, explicitStoreType?: string): string {
  const norm = normalizeArabicText(categoryName);
  if (!norm) return 'Package';

  const storeType = (explicitStoreType || getCurrentStoreType() || '').trim();

  // ==========================================
  // أولاً: قواعد الصيدلية الطبية المتخصصة
  // ==========================================
  if (storeType === 'pharmacy') {
    // 1. القلب والأوعية والضغط
    if (
      norm.includes('قلب') || norm.includes('ضغط') || norm.includes('اوعي') || norm.includes('شريان') ||
      norm.includes('شرايين') || norm.includes('كوليسترول') || norm.includes('جلط') || norm.includes('تجلط') ||
      norm.includes('دورة دموي')
    ) {
      return 'HeartPulse';
    }

    // 2. السكر والغدد والتحاليل
    if (
      norm.includes('سكر') || norm.includes('انسولين') || norm.includes('جلوكوز') || norm.includes('تحليل') ||
      norm.includes('غدد') || norm.includes('شرائط سكر') || norm.includes('شكاك') || norm.includes('غدة')
    ) {
      return 'Droplet';
    }

    // 3. التنفس والصدر والكحة والربو
    if (
      norm.includes('تنفس') || norm.includes('صدر') || norm.includes('كح') || norm.includes('بلغم') ||
      norm.includes('ربو') || norm.includes('شعب') || norm.includes('استنشاق') || norm.includes('نيبولايزر') ||
      norm.includes('رئ') || norm.includes('رئة') || norm.includes('حساسية صدر')
    ) {
      return 'Wind';
    }

    // 4. العيون والبصريات والقطرات
    if (
      norm.includes('عين') || norm.includes('عيون') || norm.includes('قطرة عين') || norm.includes('بصري') ||
      norm.includes('عدس') || norm.includes('جفاف عين') || norm.includes('رمد') || norm.includes('قطرات عين')
    ) {
      return 'Eye';
    }

    // 5. الأذن والأنف والحنجرة
    if (
      norm.includes('اذن') || norm.includes('انف') || norm.includes('حنجر') || norm.includes('سمع') ||
      norm.includes('جيوب انفي') || norm.includes('بخاخ انف') || norm.includes('قطرة اذن') || norm.includes('احتقان')
    ) {
      return 'Ear';
    }

    // 6. الفم والأسنان واللثة
    if (
      norm.includes('اسنان') || norm.includes('فم') || norm.includes('لث') || norm.includes('معجون') ||
      norm.includes('غسول فم') || norm.includes('فرشاة') || norm.includes('قرح') || norm.includes('تبييض')
    ) {
      return 'Smile';
    }

    // 7. الحقن والأمبولات والسرنجات
    if (
      norm.includes('حقن') || norm.includes('امبول') || norm.includes('سرنج') || norm.includes('دريب') ||
      norm.includes('كانيول') || norm.includes('مذيب') || norm.includes('فيال')
    ) {
      return 'Syringe';
    }

    // 8. الأطفال والرضع وحديثي الولادة
    if (
      norm.includes('اطفال') || norm.includes('رضع') || norm.includes('طفل') || norm.includes('ولاد') ||
      norm.includes('حليب اطفال') || norm.includes('حفاض') || norm.includes('ببرون') || norm.includes('لهاي')
    ) {
      return 'Baby';
    }

    // 9. المسكنات والعظام والمفاصل والروماتيزم
    if (
      norm.includes('مسكن') || norm.includes('عظام') || norm.includes('روماتيزم') || norm.includes('مفاصل') ||
      norm.includes('غضروف') || norm.includes('بسط عضل') || norm.includes('مرهم مسكن') || norm.includes('جل مسكن') ||
      norm.includes('لصق') || norm.includes('ضماد') || norm.includes('الم') || norm.includes('التهاب')
    ) {
      return 'Bandage';
    }

    // 10. الفيتامينات والمقويات والمعادن
    if (
      norm.includes('فيتامين') || norm.includes('مقوي') || norm.includes('طاق') || norm.includes('نشاط') ||
      norm.includes('حديد') || norm.includes('كالسيوم') || norm.includes('زنك') || norm.includes('اوميجا') ||
      norm.includes('معادن') || norm.includes('مكمل') || norm.includes('كولاجين')
    ) {
      return 'Zap';
    }

    // 11. التجميل والعناية بالبشرة والشعر
    if (
      norm.includes('بشر') || norm.includes('شعر') || norm.includes('تجميل') || norm.includes('كوزمتك') ||
      norm.includes('كريم') || norm.includes('لوشن') || norm.includes('سيروم') || norm.includes('واقي شمس') ||
      norm.includes('صابون طبي') || norm.includes('عناي')
    ) {
      return 'Sparkles';
    }

    // 12. المحاليل والمطهرات والمختبر
    if (
      norm.includes('محلول') || norm.includes('مطهر') || norm.includes('كحول') || norm.includes('بيتادين') ||
      norm.includes('معقم') || norm.includes('مختبر') || norm.includes('جلسات')
    ) {
      return 'FlaskConical';
    }

    // 13. الحرارة والترمومترات وأجهزة القياس
    if (
      norm.includes('حرار') || norm.includes('ترمومتر') || norm.includes('قياس') || norm.includes('جهاز ضغط') ||
      norm.includes('اجهزة طبي') || norm.includes('سماعة طبي')
    ) {
      return 'Thermometer';
    }

    // 14. الجهاز الهضمي والمعدة والمناعة
    if (
      norm.includes('معد') || norm.includes('هضم') || norm.includes('قولون') || norm.includes('حموض') ||
      norm.includes('اسهال') || norm.includes('امساك') || norm.includes('كبد') || norm.includes('انتفاخ') ||
      norm.includes('ديدان')
    ) {
      return 'ShieldPlus';
    }

    // 15. المستلزمات الطبية والإسعافات
    if (
      norm.includes('مستلزم') || norm.includes('اسعاف') || norm.includes('شاش') || norm.includes('قطن') ||
      norm.includes('جوانتي') || norm.includes('قفاز') || norm.includes('كمام') || norm.includes('وقاي')
    ) {
      return 'ShieldCheck';
    }

    // 16. المضادات الحيوية والأدوية العامة
    if (
      norm.includes('مضاد') || norm.includes('حيوي') || norm.includes('كبسول') || norm.includes('اقراص') ||
      norm.includes('فوار') || norm.includes('شراب') || norm.includes('ادوي') || norm.includes('دواء') ||
      norm.includes('علاج')
    ) {
      return 'Pill';
    }
  }

  // ==========================================
  // ثانياً: قواعد محلات الملابس والأزياء
  // ==========================================
  if (storeType === 'clothing_apparel') {
    if (norm.includes('حذاء') || norm.includes('احذي') || norm.includes('كوتشي') || norm.includes('جزم') || norm.includes('شبشب') || norm.includes('صندل') || norm.includes('سنيكرز')) {
      return 'Footprints';
    }
    if (norm.includes('شنط') || norm.includes('حقائب') || norm.includes('شنطة') || norm.includes('حقيبة') || norm.includes('باك باك')) {
      return 'Luggage';
    }
    if (norm.includes('نظار') || norm.includes('شمس') || norm.includes('بصري')) {
      return 'Glasses';
    }
    if (norm.includes('ساع') || norm.includes('ساعات')) {
      return 'Watch';
    }
    if (norm.includes('اكسسوار') || norm.includes('مجوهر') || norm.includes('حلي') || norm.includes('فض') || norm.includes('ذهب')) {
      return 'Gem';
    }
    if (norm.includes('براند') || norm.includes('مارك') || norm.includes('فاخر')) {
      return 'Crown';
    }
    if (norm.includes('اطفال') || norm.includes('بيبي') || norm.includes('مواليد')) {
      return 'Baby';
    }
    if (norm.includes('تفصيل') || norm.includes('اقمش') || norm.includes('قماش') || norm.includes('خياط')) {
      return 'Scissors';
    }
    if (
      norm.includes('ملابس') || norm.includes('قميص') || norm.includes('تيشرت') || norm.includes('بنطلون') ||
      norm.includes('فستان') || norm.includes('عباي') || norm.includes('جاكيت') || norm.includes('سويت شيرت') ||
      norm.includes('شروال') || norm.includes('أزياء')
    ) {
      return 'Shirt';
    }
  }

  // ==========================================
  // ثالثاً: قواعد الإلكترونيات والموبايلات
  // ==========================================
  if (storeType === 'phones_electronics') {
    if (norm.includes('موبايل') || norm.includes('هاتف') || norm.includes('ايفون') || norm.includes('سامسونج') || norm.includes('تابلت') || norm.includes('سمارت')) {
      return 'Smartphone';
    }
    if (norm.includes('لابتوب') || norm.includes('كمبيوتر') || norm.includes('حاسب') || norm.includes('شاشات كمبيوتر')) {
      return 'Laptop';
    }
    if (norm.includes('سماع') || norm.includes('ايربودز') || norm.includes('هيدفون') || norm.includes('صوتيات')) {
      return 'Headphones';
    }
    if (norm.includes('كابل') || norm.includes('سلك') || norm.includes('وصل') || norm.includes('تحويل')) {
      return 'Cable';
    }
    if (norm.includes('بطاري') || norm.includes('باور بنك') || norm.includes('شاحن متنقل')) {
      return 'Battery';
    }
    if (norm.includes('شاحن') || norm.includes('فيش') || norm.includes('محول') || norm.includes('راس شاحن')) {
      return 'Plug';
    }
    if (norm.includes('كامير') || norm.includes('تصوير') || norm.includes('عدس') || norm.includes('رينج لايت')) {
      return 'Camera';
    }
    if (norm.includes('شاش') || norm.includes('تلفزيون') || norm.includes('ريسيفر') || norm.includes('عرض')) {
      return 'Tv';
    }
    if (norm.includes('صب') || norm.includes('مكبر') || norm.includes('سبيكر') || norm.includes('ساوند')) {
      return 'Speaker';
    }
    if (norm.includes('العاب') || norm.includes('بلايستيشن') || norm.includes('دراع') || norm.includes('جيمينج')) {
      return 'Gamepad2';
    }
    if (norm.includes('قطع غيار') || norm.includes('معالج') || norm.includes('رام') || norm.includes('كارت')) {
      return 'Cpu';
    }
    if (norm.includes('هارد') || norm.includes('فلاش') || norm.includes('ميموري') || norm.includes('تخزين')) {
      return 'HardDrive';
    }
    if (norm.includes('ساع') || norm.includes('سمارت ووتش')) {
      return 'Watch';
    }
  }

  // ==========================================
  // رابعاً: قواعد العطارة والبن والمحامص
  // ==========================================
  if (storeType === 'spices_roastery') {
    if (norm.includes('بن') || norm.includes('قهو') || norm.includes('اسبريسو') || norm.includes('توليف') || norm.includes('محمص')) {
      return 'Coffee';
    }
    if (norm.includes('بهار') || norm.includes('توابل') || norm.includes('شط') || norm.includes('فلفل') || norm.includes('حار') || norm.includes('كمون')) {
      return 'Flame';
    }
    if (norm.includes('اعشاب') || norm.includes('ينسون') || norm.includes('نعناع') || norm.includes('بابونج') || norm.includes('قرف') || norm.includes('كركم')) {
      return 'Leaf';
    }
    if (norm.includes('مكسرات') || norm.includes('سوداني') || norm.includes('تسالي') || norm.includes('لب') || norm.includes('بندق') || norm.includes('لوز') || norm.includes('كاجو') || norm.includes('فستق')) {
      return 'Bean';
    }
    if (norm.includes('كركديه') || norm.includes('زهور') || norm.includes('ورد') || norm.includes('ياسمين')) {
      return 'Flower2';
    }
    if (norm.includes('ميزان') || norm.includes('وزن') || norm.includes('كيلو')) {
      return 'Scale';
    }
    if (norm.includes('فشار') || norm.includes('مقرمش')) {
      return 'Popcorn';
    }
  }

  // ==========================================
  // خامساً: قواعد الجزارة واللحوم والأسماك
  // ==========================================
  if (storeType === 'produce_butchery') {
    if (norm.includes('لحم') || norm.includes('لحوم') || norm.includes('كندوز') || norm.includes('بتلو') || norm.includes('ضاني') || norm.includes('مفروم') || norm.includes('كبد') || norm.includes('سجق') || norm.includes('برجر') || norm.includes('ستيك')) {
      return 'Beef';
    }
    if (norm.includes('دواجن') || norm.includes('فراخ') || norm.includes('دجاج') || norm.includes('بانيه') || norm.includes('بط') || norm.includes('حمام') || norm.includes('طيور')) {
      return 'Drumstick';
    }
    if (norm.includes('سمك') || norm.includes('اسماك') || norm.includes('جمبري') || norm.includes('بحري') || norm.includes('سي فود') || norm.includes('تون') || norm.includes('رنج') || norm.includes('فسيخ')) {
      return 'Fish';
    }
    if (norm.includes('فاكه') || norm.includes('فواكه') || norm.includes('تفاح') || norm.includes('موز') || norm.includes('برتقال') || norm.includes('عنب') || norm.includes('مانجو') || norm.includes('سلط')) {
      return 'Apple';
    }
    if (norm.includes('خضار') || norm.includes('خضروات') || norm.includes('جزر') || norm.includes('بطاطس') || norm.includes('طماطم') || norm.includes('خيار') || norm.includes('بصل') || norm.includes('ثوم')) {
      return 'Carrot';
    }
    if (norm.includes('بيض')) {
      return 'Egg';
    }
    if (norm.includes('مجمد') || norm.includes('فريزر')) {
      return 'Snowflake';
    }
    if (norm.includes('قطعي') || norm.includes('شواء') || norm.includes('تتبيل')) {
      return 'UtensilsCrossed';
    }
  }

  // ==========================================
  // سادساً: القواعد العامة الشاملة (للسوبرماركت والبقالة وجميع المحلات)
  // ==========================================

  // الألبان والأجبان
  if (
    norm.includes('لبن') || norm.includes('البان') || norm.includes('جبن') || norm.includes('اجبان') ||
    norm.includes('حليب') || norm.includes('زبادي') || norm.includes('قشط') || norm.includes('ديري') ||
    norm.includes('رومي') || norm.includes('شيدر') || norm.includes('موزاريل')
  ) {
    return 'Milk';
  }

  // المخبوزات
  if (
    norm.includes('مخبوز') || norm.includes('خبز') || norm.includes('عيش') || norm.includes('فينو') ||
    norm.includes('توست') || norm.includes('باتيه') || norm.includes('كرواسون') || norm.includes('معجنات')
  ) {
    return 'Croissant';
  }

  // الحلويات والتورت
  if (norm.includes('كيك') || norm.includes('تورت') || norm.includes('جاتوه') || norm.includes('حلواني')) {
    return 'Cake';
  }

  // البسكويت
  if (norm.includes('بسكويت') || norm.includes('بسكوت') || norm.includes('كوكيز') || norm.includes('ويفر') || norm.includes('شابور')) {
    return 'Cookie';
  }

  // الشوكولاتة والسكاكر
  if (norm.includes('حلوي') || norm.includes('شوكولا') || norm.includes('شيكولات') || norm.includes('بونبون') || norm.includes('توفي') || norm.includes('مصاص') || norm.includes('سكاكر')) {
    return 'Candy';
  }

  // المقرمشات والشيبس
  if (norm.includes('مقرمش') || norm.includes('شيبس') || norm.includes('شيبسي') || norm.includes('سناكس') || norm.includes('تسالي') || norm.includes('فشار') || norm.includes('كرانشي')) {
    return 'Popcorn';
  }

  // المشروبات والعصائر
  if (norm.includes('مشروب') || norm.includes('عصير') || norm.includes('عصائر') || norm.includes('كانز') || norm.includes('غازي') || norm.includes('صودا') || norm.includes('بيبسي') || norm.includes('كولا') || norm.includes('مياه') || norm.includes('ميه')) {
    return 'CupSoda';
  }

  // القهوة والشاي
  if (norm.includes('قهو') || norm.includes('شاي') || norm.includes('نسكافيه') || norm.includes('بن') || norm.includes('اسبريسو') || norm.includes('كابتشينو')) {
    return 'Coffee';
  }

  // الآيس كريم والمثلجات
  if (norm.includes('ايس كريم') || norm.includes('جيلاتي') || norm.includes('جيلاتو') || norm.includes('بوظ') || norm.includes('استيك')) {
    return 'IceCream';
  }

  // الدخان والسجائر
  if (norm.includes('دخان') || norm.includes('سجائر') || norm.includes('سجاير') || norm.includes('تبغ') || norm.includes('معسل') || norm.includes('شيش') || norm.includes('ولاع')) {
    return 'Cigarette';
  }

  // المنظفات
  if (norm.includes('منظف') || norm.includes('صابون') || norm.includes('شامبو') || norm.includes('مسحوق') || norm.includes('غسيل') || norm.includes('كلور') || norm.includes('ديتول') || norm.includes('مطهر')) {
    return 'Sparkles';
  }

  // المعطرات
  if (norm.includes('عطر') || norm.includes('عطور') || norm.includes('سبراي') || norm.includes('برفان') || norm.includes('معطر')) {
    return 'SprayCan';
  }

  // التوابل
  if (norm.includes('توابل') || norm.includes('بهار') || norm.includes('عطار') || norm.includes('كمون') || norm.includes('فلفل') || norm.includes('شطة')) {
    return 'Flame';
  }

  // الأدوية
  if (norm.includes('ادوي') || norm.includes('دواء') || norm.includes('صيدل') || norm.includes('طبي') || norm.includes('فيتامين')) {
    return 'Pill';
  }

  // اللحوم
  if (norm.includes('لحم') || norm.includes('لحوم') || norm.includes('برجر') || norm.includes('سجق')) {
    return 'Beef';
  }

  // الدواجن
  if (norm.includes('دواجن') || norm.includes('فراخ') || norm.includes('دجاج') || norm.includes('بانيه')) {
    return 'Drumstick';
  }

  // الأسماك
  if (norm.includes('سمك') || norm.includes('اسماك') || norm.includes('جمبري') || norm.includes('تون')) {
    return 'Fish';
  }

  // الخضار والفاكهة
  if (norm.includes('فاكه') || norm.includes('فواكه') || norm.includes('خضار') || norm.includes('طماطم') || norm.includes('تفاح')) {
    return 'Apple';
  }

  // الجزر والبطاطس
  if (norm.includes('جزر') || norm.includes('بطاطس') || norm.includes('بصل') || norm.includes('ثوم')) {
    return 'Carrot';
  }

  // البيض
  if (norm.includes('بيض')) {
    return 'Egg';
  }

  // البقوليات والمعلبات
  if (norm.includes('بقول') || norm.includes('معلب') || norm.includes('ارز') || norm.includes('رز') || norm.includes('مكرون') || norm.includes('فول') || norm.includes('دقيق')) {
    return 'Wheat';
  }

  // المجمدات
  if (norm.includes('مجمد') || norm.includes('تجميد') || norm.includes('فريزر')) {
    return 'Snowflake';
  }

  // المنزلية والبلاستيك
  if (norm.includes('منزل') || norm.includes('بلاستيك') || norm.includes('مطبخ') || norm.includes('اطباق')) {
    return 'Home';
  }

  // الملابس
  if (norm.includes('ملابس') || norm.includes('ازياء') || norm.includes('احذي')) {
    return 'Shirt';
  }

  // الموبايل والإلكترونيات
  if (norm.includes('موبايل') || norm.includes('الكترون') || norm.includes('شاحن') || norm.includes('سماع')) {
    return 'Smartphone';
  }

  return 'Package';
}

/**
 * الحصول على المكون الأيقوني النهائي للقسم (مع مراعاة التخصيص اليدوي للمستخدم أولاً، ثم الاكتشاف الذكي)
 */
export function getCategoryIconComponent(categoryName: string, categoryId?: string, storeType?: string): LucideIcon {
  const customKey = getCustomCategoryIconKey(categoryName, categoryId);
  if (customKey && CATEGORY_ICON_MAP[customKey]) {
    return CATEGORY_ICON_MAP[customKey];
  }

  const detectedKey = detectSmartCategoryIconKey(categoryName, storeType);
  return CATEGORY_ICON_MAP[detectedKey] || Package;
}
