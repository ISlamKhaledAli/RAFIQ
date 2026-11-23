// ============================================================================
// Rafiq Professional Retail Catalog Description Engine
// Generates accurate, concise, and professional Arabic retail product descriptions.
// Factual, realistic, and based on standard retail commerce catalogs.
// Supports: Supermarket & Grocery, Pharmacy & Medical, Restaurants & Cafes,
// Electronics & Phones, Clothing & Fashion, Roastery & Spices, Butchery & Produce,
// Bakery & Dairy, Stationery & Office, Toys & Kids, and General Retail.
// ============================================================================

export type DescriptionTone = 'catchy' | 'short' | 'detailed';

export interface GeneratedDescriptions {
  catchy: string;
  short: string;
  detailed: string;
}

export type StoreActivityType =
  | 'pharmacy'
  | 'cafe_restaurant'
  | 'restaurant'
  | 'stationery_gifts'
  | 'clothing_apparel'
  | 'phones_electronics'
  | 'spices_roastery'
  | 'produce_butchery'
  | 'dairy_bakery'
  | 'toys_kids'
  | 'supermarket'
  | 'general';

export interface ProductLike {
  name: string;
  category_name?: string | null;
  unit_name?: string | null;
  barcode?: string | null;
  price_piasters?: number;
  store_type?: string | null;
}

// ============================================================================
// Regular Expressions for Extracting Product Specs & Sizing
// ============================================================================

const PHARMA_STRENGTH_REGEX = /(\d+(?:\.\d+)?)\s*(مجم|ملجم|ميكروجرام|مل|لتر|وحدة|mg|mcg|ml|g|gm|iu)\b/i;
const PHARMA_PACK_REGEX = /(\d+)\s*(قرص|كبسولة|شريط|أمبول|امبول|كيس|نقط|تحميلة|لبوس|tab|cap|capsule|amp)\b/i;
const CLOTHING_SIZE_REGEX = /\b(XXXL|XXL|XL|L|M|S|XS|مقاس\s*\d+|size\s*\d+)\b/i;
const STATIONERY_SPECS_REGEX = /\b(A3|A4|A5|B5|\d+\s*ورقة|\d+\s*قلم|دستة|باكت|\d+(?:\.\d+)?\s*مم|\d+(?:\.\d+)?\s*سم)\b/i;
const ELECTRONICS_SPECS_REGEX = /\b(\d+\s*GB|\d+\s*TB|\d+\s*جيجا|\d+\s*رام|\d+\s*واط|\d+\s*W|\d+\s*mAh|\d+\s*بوصة|\d+\s*Hz)\b/i;
const FOOD_VOLUME_REGEX = /(\d+(?:\.\d+)?)\s*(مل|لتر|جم|جرام|كجم|كيلو|قطعة|حبة|علبة|كيس|زجاجة|برطمان|باكت)/i;

// ============================================================================
// Domain Keywords Mapping
// ============================================================================

const PHARMACY_KEYWORDS = [
  'صيدلي', 'دواء', 'دوائي', 'علاج', 'أقراص', 'اقراص', 'كبسول', 'كبسولات', 'شراب', 'نقط', 'قطرة', 'مرهم', 'كريم طبي',
  'جل', 'فوار', 'حقن', 'أمبول', 'امبول', 'لبوس', 'تحاميل', 'بخاخ', 'مسكن', 'خافض', 'مضاد حيوي', 'فيتامين', 'مكمل',
  'أوميجا', 'اوميجا', 'كالسيوم', 'حديد', 'زنك', 'بيوتين', 'كولاجين', 'ضغط', 'سكر', 'معدة', 'قولون', 'حساسية',
  'شاش', 'قطن طبي', 'بلاستر', 'ضمادة', 'سرنجة', 'كحول', 'مطهر', 'بيتادين', 'جوانتي', 'قفاز', 'كمامة', 'ترمومتر',
  'جهاز ضغط', 'جهاز سكر', 'سيروم', 'واقي شمس', 'غسول', 'لوشن', 'شامبو قشرة', 'بامبرز', 'حفاض', 'ببرونة', 'لهاية',
  'بانادول', 'كونجستال', 'كومتركس', 'أوجمنتين', 'اوجمنتين', 'كتافلام', 'أنتينال', 'سيتال', 'أدول', 'بروفين'
];

const RESTAURANT_KEYWORDS = [
  'مطعم', 'كافيه', 'وجبة', 'وجبات', 'ساندوتش', 'سندوتش', 'برجر', 'شاورما', 'زنجر', 'بانيه', 'فاهيتا', 'كريب',
  'حواوشي', 'كفتة', 'كبدة', 'سجق', 'مشويات', 'كباب', 'شيش', 'ريش', 'طاجن', 'طواجن', 'بيتزا', 'فطير', 'كالزوني',
  'مكرونة', 'باستا', 'أرز بسمتي', 'مندي', 'كبسة', 'ستيك', 'بطاطس مقلية', 'قهوة', 'إسبريسو', 'اسبريسو', 'لاتيه',
  'كابتشينو', 'ميكياتو', 'أمريكانو', 'سحلب', 'هوت شوكليت', 'سموذي', 'موهيتو', 'ميلك شيك', 'عصير فريش', 'آيس كوفي',
  'وافل', 'بان كيك', 'تشيز كيك', 'مولتن', 'كنافة', 'بسبوسة', 'أم علي', 'كومبو', 'سنجل', 'دبل'
];

const STATIONERY_KEYWORDS = [
  'مكتبة', 'مكتبه', 'قرطاسية', 'أدوات مدرسية', 'كشكول', 'كراس', 'نوت بوك', 'أجندة', 'ورق تصوير', 'ورق a4', 'ورق رسم',
  'اسكتش', 'فايل', 'دوسيه', 'حافظة', 'قلم', 'قلم جاف', 'قلم حبر', 'قلم رصاص', 'سنون', 'ماركر', 'فلوماستر', 'ألوان خشب',
  'ألوان مائية', 'هايلايتر', 'كوريكتور', 'مزيل', 'مسطرة', 'براية', 'أستيكة', 'ممحاة', 'دباسة', 'خرامة', 'دبابيس',
  'صمغ', 'غراء', 'سوليتيب', 'مقص', 'كتر', 'حاسبة علمية', 'برجل', 'منقلة', 'شنطة مدرسية', 'لانش بوكس', 'مقلمة',
  'روترنج', 'فابر كاستل', 'بريما', 'زيبرا', 'ستيدلر', 'كانسون'
];

const CLOTHING_KEYWORDS = [
  'ملابس', 'أزياء', 'ازياء', 'فاشون', 'أحذية', 'احذية', 'تيشرت', 'قميص', 'بنطلون', 'جينز', 'هودي', 'سويت شيرت',
  'بولو', 'شورت', 'ترينج', 'فستان', 'بلوزة', 'جيب', 'تنورة', 'جاكيت', 'كارديجان', 'بدلة', 'بليزر', 'عباية', 'طرحة',
  'شال', 'كوتشي', 'سنيكرز', 'حذاء', 'صندل', 'شبشب', 'بوت', 'بيجامة', 'روب', 'شراب', 'جوارب', 'حزام جلد', 'محفظة'
];

const ELECTRONICS_KEYWORDS = [
  'موبايل', 'هاتف', 'تابلت', 'آيباد', 'ايباد', 'شاحن', 'كابل', 'وصلة', 'باور بنك', 'type-c', 'lightning', 'شاحن سيارة',
  'سماعة', 'إيربودز', 'ايربودز', 'هيدفون', 'بلوتوث', 'صب', 'مكبر صوت', 'ساعة ذكية', 'سمارت ووتش', 'باند',
  'جراب', 'كفر', 'سكرينة', 'فلاشة', 'كارت ميموري', 'ماوس', 'كيبورد', 'راوتر', 'مشترك كهرباء', 'سامسونج', 'شاومي',
  'آيفون', 'ايفون', 'أوبو', 'ريلمي', 'أنكر', 'anker', 'هوائي', 'أدابتر'
];

const ROASTERY_KEYWORDS = [
  'محمصة', 'محمصه', 'عطارة', 'عطاره', 'توابل', 'بهارات', 'بن', 'قهوة تركي', 'بن محوج', 'بن سادة', 'مكسرات', 'كاجو',
  'فستق', 'لوز', 'عين جمل', 'بندق', 'لب', 'سوداني', 'تسالي', 'فلفل أسود', 'كمون', 'كزبرة', 'قرفة', 'جنزبيل',
  'حبهان', 'بابريكا', 'كركم', 'شمر', 'كركديه', 'يانسون', 'نعناع', 'زعتر', 'عسل نحل', 'طحينة', 'تمر', 'ياميش'
];

const BUTCHERY_PRODUCE_KEYWORDS = [
  'جزارة', 'جزاره', 'لحوم', 'لحم', 'كفتة', 'كبدة', 'بفتيك', 'مفروم', 'ضاني', 'كندوز', 'بتلو', 'فراخ', 'دواجن', 'دجاج',
  'بانيه', 'سمك', 'أسماك', 'جمبري', 'طماطم', 'خيار', 'بطاطس', 'بصل', 'ليمون', 'تفاح', 'موز', 'برتقال', 'فراولة',
  'عنب', 'مانجو', 'خضروات', 'فواكه'
];

const BAKERY_DAIRY_KEYWORDS = [
  'مخبز', 'مخابز', 'ألبان', 'البان', 'حليب', 'لبن', 'جبن', 'جبنة', 'قشطة', 'زبدة', 'سمن بلدي', 'جبنة قريش', 'براميلي',
  'موتزاريلا', 'خبز', 'عيش', 'توست', 'كيزر', 'فينو', 'باتيه', 'كرواسون', 'بوريك', 'فطير مشلتت', 'قرص طرية', 'كعك'
];

const TOYS_KEYWORDS = [
  'ألعاب', 'العاب', 'أطفال', 'اطفال', 'لعبة', 'دمية', 'عروسة', 'سيارة أطفال', 'بازل', 'مكعبات', 'ليجو', 'صلصال',
  'سلايم', 'مسدس مائي', 'ألعاب ذكاء', 'ألعاب تعليمية'
];

const ICE_CREAM_KEYWORDS = ['آيس كريم', 'ايس كريم', 'أستيك', 'استيك', 'جيلاتي', 'مثلجات', 'كونو', 'ميجا'];
const DAIRY_KEYWORDS = ['لبن', 'حليب', 'جبن', 'جبنة', 'قشطة', 'زبادي', 'زبدة', 'موتزاريلا', 'رومي', 'شيدر', 'فيتا', 'براميلي', 'قريش', 'بيض'];
const DRINKS_KEYWORDS = ['عصير', 'بيبسي', 'كوكاكولا', 'كولا', 'شويبس', 'مياه', 'مشروب', 'سفن اب', 'سبرايت', 'ميراندا', 'فانتا', 'شاي', 'نسكافيه'];
const SWEETS_KEYWORDS = ['بسكويت', 'شوكولاتة', 'شوكولاته', 'شيبسي', 'كرانشي', 'دوريتوس', 'تايجر', 'كيك', 'مولتو', 'ويفر', 'بونبون', 'مارشميلو'];
const CLEANING_KEYWORDS = ['منظف', 'صابون', 'مسحوق', 'برسيل', 'أريال', 'اريال', 'تايد', 'فيري', 'بريل', 'كلور', 'كلوركس', 'ديتول', 'معطر', 'مناديل', 'سلك', 'إسفنج'];
const PERSONAL_CARE_KEYWORDS = ['شامبو', 'بلسم', 'شاور', 'لوشن', 'كريم', 'معجون', 'فرشاة', 'سيجنال', 'دوف', 'نيفيا', 'بانتين', 'صانسيلك', 'فازلين', 'مزيل عرق'];
const GROCERIES_KEYWORDS = ['أرز', 'ارز', 'مكرونة', 'زيت', 'سمن', 'سكر', 'شاي', 'دقيق', 'تونة', 'فول', 'صلصة', 'عدس', 'لوبيا', 'فاصوليا', 'ملح'];

// ============================================================================
// Keyword Matcher with Arabic Word Boundary Safety
// ============================================================================

function matchKeyword(text: string, kw: string): boolean {
  if (!text || !kw) return false;
  if (kw.length <= 3) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`(^|[\\s,،.؛_\\-()])${escaped}([\\s,،.؛_\\-()]|$)`, 'i');
    return rx.test(text);
  }
  return text.includes(kw);
}

export function detectEnvironmentStoreType(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    const direct =
      localStorage.getItem('rafiq_store_type') ||
      localStorage.getItem('rafiq_preferred_store_type') ||
      localStorage.getItem('online_store_type');
    if (direct && direct.trim()) return direct.trim();

    const flagsStr = localStorage.getItem('rafiq_feature_flags');
    if (flagsStr) {
      const parsed = JSON.parse(flagsStr);
      if (parsed.feature_pharmacy) return 'pharmacy';
      if (parsed.feature_matrix_variants) return 'clothing_apparel';
      if (parsed.feature_restaurant || parsed.feature_cafe) return 'cafe_restaurant';
      if (parsed.feature_kitchen_printer) return 'cafe_restaurant';
    }
  } catch {
    // ignore
  }
  return '';
}

export function resolveEffectiveActivityType(
  explicitStoreType?: string | null,
  productName?: string,
  categoryName?: string | null
): StoreActivityType {
  const explicit = (explicitStoreType || '').trim().toLowerCase();

  if (explicit === 'pharmacy') return 'pharmacy';
  if (['restaurant', 'cafe', 'cafe_restaurant', 'food'].includes(explicit)) return 'cafe_restaurant';
  if (['stationery', 'stationery_gifts', 'bookstore', 'office'].includes(explicit)) return 'stationery_gifts';
  if (['clothing', 'clothing_apparel', 'fashion', 'shoes'].includes(explicit)) return 'clothing_apparel';
  if (['electronics', 'phones_electronics', 'mobile', 'computers'].includes(explicit)) return 'phones_electronics';
  if (['roastery', 'spices_roastery', 'spices'].includes(explicit)) return 'spices_roastery';
  if (['butchery', 'produce_butchery', 'produce', 'meat'].includes(explicit)) return 'produce_butchery';
  if (['bakery', 'dairy_bakery', 'dairy'].includes(explicit)) return 'dairy_bakery';
  if (['toys', 'toys_kids', 'kids'].includes(explicit)) return 'toys_kids';
  if (['supermarket', 'grocery', 'general_grocery'].includes(explicit)) return 'supermarket';

  const envType = detectEnvironmentStoreType();
  if (envType) {
    return resolveEffectiveActivityType(envType);
  }

  if (categoryName) {
    const catLower = categoryName.toLowerCase();
    if (['جزارة', 'جزاره', 'لحوم', 'خضار', 'خضروات', 'فواكه'].some((k) => matchKeyword(catLower, k))) return 'produce_butchery';
    if (['صيدل', 'أدوية', 'ادوية', 'علاج', 'مسكن', 'فيتامين'].some((k) => matchKeyword(catLower, k))) return 'pharmacy';
    if (['مطعم', 'كافيه', 'ساندوتش', 'سندوتش', 'وجبات', 'وجبة', 'مشويات', 'مشروبات', 'حلويات'].some((k) => matchKeyword(catLower, k))) return 'cafe_restaurant';
    if (['مكتب', 'قرطاس', 'أدوات مدرسية', 'ادوات مدرسية', 'كشاكيل', 'دفاتر'].some((k) => matchKeyword(catLower, k))) return 'stationery_gifts';
    if (['ملابس', 'أزياء', 'ازياء', 'أحذية', 'احذية', 'فاشون'].some((k) => matchKeyword(catLower, k))) return 'clothing_apparel';
    if (['موبايل', 'إلكترونيات', 'الكترونيات', 'شواحن', 'كمبيوتر', 'هواتف'].some((k) => matchKeyword(catLower, k))) return 'phones_electronics';
    if (['محمص', 'عطار', 'توابل', 'بهارات', 'بن'].some((k) => matchKeyword(catLower, k))) return 'spices_roastery';
    if (['مخبز', 'ألبان', 'البان', 'معجنات'].some((k) => matchKeyword(catLower, k))) return 'dairy_bakery';
    if (['ألعاب', 'العاب', 'أطفال', 'اطفال'].some((k) => matchKeyword(catLower, k))) return 'toys_kids';
  }

  const target = `${productName || ''} ${categoryName || ''}`.toLowerCase();
  if (CLOTHING_KEYWORDS.some((k) => matchKeyword(target, k))) return 'clothing_apparel';
  if (PHARMACY_KEYWORDS.some((k) => matchKeyword(target, k))) return 'pharmacy';
  if (RESTAURANT_KEYWORDS.some((k) => matchKeyword(target, k))) return 'cafe_restaurant';
  if (STATIONERY_KEYWORDS.some((k) => matchKeyword(target, k))) return 'stationery_gifts';
  if (ELECTRONICS_KEYWORDS.some((k) => matchKeyword(target, k))) return 'phones_electronics';
  if (ROASTERY_KEYWORDS.some((k) => matchKeyword(target, k))) return 'spices_roastery';
  if (BUTCHERY_PRODUCE_KEYWORDS.some((k) => matchKeyword(target, k))) return 'produce_butchery';
  if (BAKERY_DAIRY_KEYWORDS.some((k) => matchKeyword(target, k))) return 'dairy_bakery';
  if (TOYS_KEYWORDS.some((k) => matchKeyword(target, k))) return 'toys_kids';

  return 'supermarket';
}

interface ExtractedSpecs {
  sizePhrase: string;
  specsSummary: string;
}

function extractProductSpecs(name: string, activity: StoreActivityType): ExtractedSpecs {
  if (activity === 'pharmacy') {
    const strengthMatch = name.match(PHARMA_STRENGTH_REGEX);
    const packMatch = name.match(PHARMA_PACK_REGEX);
    const parts: string[] = [];
    if (strengthMatch) parts.push(`تركيز ${strengthMatch[1]} ${strengthMatch[2]}`);
    if (packMatch) parts.push(`عبوة ${packMatch[1]} ${packMatch[2]}`);
    const sizePhrase = parts.length > 0 ? ` (${parts.join(' - ')})` : '';
    return { sizePhrase, specsSummary: parts.join(' - ') };
  }

  if (activity === 'clothing_apparel') {
    const match = name.match(CLOTHING_SIZE_REGEX);
    const sizePhrase = match ? ` (مقاس ${match[1]})` : '';
    return { sizePhrase, specsSummary: match ? match[1] : '' };
  }

  if (activity === 'stationery_gifts') {
    const match = name.match(STATIONERY_SPECS_REGEX);
    const sizePhrase = match ? ` (${match[1]})` : '';
    return { sizePhrase, specsSummary: match ? match[1] : '' };
  }

  if (activity === 'phones_electronics') {
    const match = name.match(ELECTRONICS_SPECS_REGEX);
    const sizePhrase = match ? ` (${match[1]})` : '';
    return { sizePhrase, specsSummary: match ? match[1] : '' };
  }

  const volMatch = name.match(FOOD_VOLUME_REGEX);
  const sizePhrase = volMatch ? ` (${volMatch[1]} ${volMatch[2]})` : '';
  return { sizePhrase, specsSummary: volMatch ? `${volMatch[1]} ${volMatch[2]}` : '' };
}

// ============================================================================
// Realistic, Professional Arabic Description Engine
// ============================================================================

export function generateSmartDescriptionOptions(
  product: ProductLike,
  categoryName?: string | null,
  storeType?: string | null
): GeneratedDescriptions {
  const name = product.name ? product.name.trim() : 'الصنف';
  const cat = categoryName || product.category_name || '';
  const activity = resolveEffectiveActivityType(storeType || product.store_type, name, cat);
  const { sizePhrase, specsSummary } = extractProductSpecs(name, activity);
  const targetLower = `${name} ${cat}`.toLowerCase();

  // --------------------------------------------------------------------------
  // 1. PHARMACY & MEDICAL
  // --------------------------------------------------------------------------
  if (activity === 'pharmacy') {
    // Vitamins & Dietary Supplements
    if (['فيتامين', 'مكمل', 'أوميجا', 'اوميجا', 'زنك', 'كالسيوم', 'حديد', 'بيوتين', 'كولاجين', 'ماغنسيوم'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - مكمل غذائي لتعويض النقص اليومي ودعم الصحة العامة والنشاط البدني.`,
        catchy: `${name}${sizePhrase} مكمل غذائي معتمد لدعم التوازن الصحي وتعزيز مستويات الطاقة والنشاط اليومي. تركيبة غنية بالعناصر الأساسية سهلة الامتصاص ومصنعة وفق أعلى المعايير الصيدلانية.`,
        detailed: `• الصنف: ${name}
• التصنيف: مكملات غذائية وفيتامينات
• المواصفات: ${specsSummary || 'عبوة أصلية محكمة'}
• الجرعة والاستخدام: يؤخذ طبقاً للجرعة المحددة على العبوة أو حسب إرشادات الطبيب/الصيدلي.
• شروط الحفظ: يُحفظ في مكان جاف وبارد بدرجة حرارة أقل من 30° مئوية وبعيداً عن متناول الأطفال.`
      };
    }

    // First Aid & Sterile Supplies
    if (['شاش', 'قطن', 'بلاستر', 'ضمادة', 'سرنجة', 'كحول', 'مطهر', 'بيتادين', 'جوانتي', 'قفاز', 'كمامة', 'ترمومتر', 'جهاز'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - مستلزم طبي معقم ومطابق للمواصفات الصحية للإسعافات الأولية والرعاية المنزلية.`,
        catchy: `${name}${sizePhrase} مستلزم طبي أساسي لحقيبة الإسعافات الأولية والرعاية المنزلية والعيادات. خامات طبية معقمة ولطيفة على الجلد ومطابقة لاشتراطات السلامة الصحية القياسية.`,
        detailed: `• الصنف: ${name}
• الاستخدام: إسعافات أولية ورعاية طبية وتمريضية
• المواصفات: خامات طبية معقمة ومحكمة الغلق${sizePhrase ? ` - ${sizePhrase}` : ''}
• الأمان: خالي من المواد المسببة للتحسس ومطابق للاشتراطات الصحية.
• الحفظ: يُحفظ في مكان جاف ومعقم للاستخدام عند الحاجة.`
      };
    }

    // Dermocosmetics & Skincare
    if (['سيروم', 'كريم', 'غسول', 'واقي شمس', 'مرطب', 'لوشن', 'تفتيح', 'حب شباب', 'هالات', 'شامبو'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - مستحضر عناية بالبشرة بتركيبة مختبرة جلدياً تمنح ترطيباً وحماية فعالة.`,
        catchy: `${name}${sizePhrase} مستحضر عناية يومي للبشرة، مصمم بتركيبة متوازنة وسريعة الامتصاص تدعم ترطيب خلايا البشرة وتحميها من الجفاف مع ملمس ناعم وخفيف.`,
        detailed: `• المنتج: ${name}
• نوع العناية: مستحضرات تجميل وعناية جلدية علاجية
• الحجم/العبوة: ${specsSummary || 'عبوة عملية سهلة الاستخدام'}
• طريقة الاستخدام: يوضع على بشرة نظيفة ويدلك بلطف حتى الامتصاص التام.
• الصلاحية والحفظ: يُحفظ مغلقاً في مكان معتدل بعيداً عن أشعة الشمس المباشرة.`
      };
    }

    // Painkillers & Antipyretics
    if (['بانادول', 'كتافلام', 'بروفين', 'سيتال', 'أدول', 'كونجستال', 'كومتركس', 'مسكن', 'خافض'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - مسكن فعال للآلام وخافض للحرارة بتركيبة صيدلانية سريعة المفعول.`,
        catchy: `${name}${sizePhrase} مستحضر دوائي معتمد لتخفيف الصداع، آلام العضلات، الأسنان وخفض درجات الحرارة المرتفعة. تركيبة فعالة وسريعة التأثير عند الاستخدام حسب التعليمات.`,
        detailed: `• الدواء: ${name}
• دواعي الاستخدام: مسكن للآلام ومضاد للالتهاب وخافض للحرارة
• التركيز والعبوة: ${specsSummary || 'أقراص/كبسولات معتمدة صيدلانياً'}
• إرشادات الجرعة: تُتبع الجرعة المدونة في النشرة الداخلية أو توجيهات الصيدلي.
• التخزين: يُحفظ في درجة حرارة لا تتعدى 30° مئوية في مكان جاف وبعيد عن الأطفال.`
      };
    }

    // Standard Pharmacy Medications
    return {
      short: `${name}${sizePhrase} - مستحضر دوائي معتمد ومصنع وفق أعلى المعايير الصيدلانية القياسية.`,
      catchy: `${name}${sizePhrase} مستحضر دوائي رسمي معتمد لتخفيف الأعراض ومتابعة الخطة العلاجية الموصى بها. يرجى دائماً مراجعة النشرة الداخلية المرفقة للاطلاع على دواعي وموانع الاستعمال.`,
      detailed: `• المستحضر: ${name}
• التصنيف: أدوية وعلاجات صيدلانية معتمدة
• العبوة: ${specsSummary || 'عبوة دوائية أصلية ومحكمة'}
• طريقة الاستخدام: حسب النشرة الطبية المرفقة أو استشارة الصيدلي المعالج.
• شروط التخزين: يُحفظ في مكان بارد وجاف بعيداً عن الرطوبة وحرارة الشمس المباشرة.`
    };
  }

  // --------------------------------------------------------------------------
  // 2. RESTAURANTS, CAFES & FAST FOOD
  // --------------------------------------------------------------------------
  if (activity === 'cafe_restaurant') {
    // Hot Drinks / Coffee
    if (['قهوة', 'إسبريسو', 'اسبريسو', 'لاتيه', 'كابتشينو', 'ميكياتو', 'أمريكانو', 'شاي', 'سحلب', 'هوت شوكليت'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - محضر طازجاً من أجود حبوب البن المختارة بدرجة تحميص متوازنة.`,
        catchy: `${name}${sizePhrase} مشروب ساخن يُحضر طازجاً عند الطلب من بن نقي ومطحون باحترافية لنكهة غنية وقوام متجانس يمنحك الطاقة والانتعاش طوال اليوم.`,
        detailed: `• المشروب: ${name}
• طريقة التحضير: طازج فور استلام الأوردر بأحدث ماكينات الإسبريسو والتحضير
• التقديم: في كوب حراري محكم يحافظ على درجة الحرارة والنكهة الأصلية
• المكونات: بن نقي 100% مع حليب طازج ومكونات عالية الجودة.`
      };
    }

    // Cold Drinks / Juices
    if (['سموذي', 'موهيتو', 'ميلك شيك', 'عصير', 'كوكتيل', 'آيس كوفي', 'مشروب بارد'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - مشروب بارد ومنعش محضر من فواكه طبيعية ومكونات طازجة.`,
        catchy: `${name}${sizePhrase} مشروب مثلج منعش يُعد طازجاً من فواكه طبيعية مختارة ومكونات فريش، يقدم مبرداً في عبوة محكمة لترطيب مثالي في كل وقت.`,
        detailed: `• الصنف: ${name}
• النوع: عصائر ومشروبات باردة
• الحجم: ${specsSummary || 'كوب متوسط/كبير'}
• التقديم: مثلج فور الطلب في عبوة مخصصة للدليفري والتنقل السريع.`
      };
    }

    // Pizza & Bakery
    if (['بيتزا', 'فطير', 'مارجريتا', 'بيبروني', 'فطيرة', 'كالزوني'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - مخبوزة طازجة في الفرن بعجينة هشة وجبنة موتزاريلا طبيعية 100%.`,
        catchy: `${name}${sizePhrase} بيتزا وفطائر مخبوزة على درجات حرارة مثالية، تتميز بعجينة طازجة مخمرة باحترافية، صلصة طماطم غنية بالأعشاب وجبنة طبيعية ذائبة وإضافات منتقاة بعناية.`,
        detailed: `• الصنف: ${name}
• العجينة: مخبوزة طازجة يومياً بمكونات إيطالية ومحلية عالية الجودة
• الإضافات: جبنة موتزاريلا طبيعية + خضروات طازجة ومكونات فاخرة
• التغليف: كرتونة حرارية مخصصة للدليفري تصلك ساخنة ومقرمشة.`
      };
    }

    // Sandwiches & Meals
    return {
      short: `${name}${sizePhrase} - وجبة شهية محضرة فور طلبك بأجود المكونات الطازجة والتتبيلة الخاصة.`,
      catchy: `${name}${sizePhrase} ساندوتش ووجبة محضرة طازجة من لحوم ومكونات ممتازة ومتبلة بخلطة المحل الخاصة، تقدم في خبز طازج مع الصوصات والإضافات المختارة بعناية.`,
      detailed: `• الوجبة: ${name}
• التجهيز: طهي طازج فور ورود الطلب لضمان أعلى جودة ونظافة
• المكونات: لحوم ومكونات طازجة يومياً + صوصات وخضروات نظيفة
• التغليف: تغليف حراري محكم يحفظ سخونة ونضارة الوجبة حتى باب منزلك.`
    };
  }

  // --------------------------------------------------------------------------
  // 3. ELECTRONICS, MOBILES & HARDWARE
  // --------------------------------------------------------------------------
  if (activity === 'phones_electronics') {
    // Chargers, Cables, Power Banks
    if (['شاحن', 'كابل', 'وصلة', 'باور بنك', 'شحن', 'فيشة', 'محول', 'أدابتر'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - شاحن وملحق معتمد يدعم الشحن السريع وتقنيات الحماية من الجهد الزائد.`,
        catchy: `${name}${sizePhrase} ملحق شحن سريع وعالي الاعتمادية، يوفر نقلاً آمناً ومستقراً للطاقة والبيانات مع دوائر حماية مدمجة ضد الحرارة والجهد الزائد للحفاظ على بطارية هاتفك.`,
        detailed: `• المنتج: ${name}
• المواصفات التقنية: ${specsSummary || 'يدعم تقنيات الشحن السريع QC / PD'}
• الأمان: حماية مدمجة ضد الماس الكهربائي والحرارة الزائدة
• التوافق: متوافق مع معظم الهواتف الذكية والأجهزة اللوحية
• الضمان: منتج أصلي ومطابق للمواصفات القياسية للأجهزة.`
      };
    }

    // Audio / Headphones / Smartwatches
    if (['سماعة', 'إيربودز', 'ايربودز', 'هيدفون', 'بلوتوث', 'صب', 'مكبر', 'ساعة', 'سمارت ووتش'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - صوت نقي واتصال بلوتوث مستقر مع بطارية تدوم لساعات طويلة من الاستخدام.`,
        catchy: `${name}${sizePhrase} جهاز صوتي وإلكتروني عالي الأداء، يتميز بنقاء صوتي متوازن مع ميكروفون مدمج للمكالمات الواضحة واتصال لاسلكي سريع وثابت مع مختلف الأجهزة.`,
        detailed: `• الجهاز: ${name}
• نوع الاتصال: بلوتوث لاسلكي سريع المدى
• المواصفات: ${specsSummary || 'صوت استريو نقي وبطارية ممتدة'}
• الملحقات: كابل الشحن ودليل التشغيل السريع داخل العبوة الأصلية
• التوافق: يعمل بسلاسة مع أنظمة أندرويد وiOS وأجهزة الكمبيوتر.`
      };
    }

    // General Electronics
    return {
      short: `${name}${sizePhrase} - ملحق إلكتروني أصلي بجودة تصنيع متينة واعتمادية عالية للاستخدام اليومي.`,
      catchy: `${name}${sizePhrase} إكسسوار إلكتروني عملي ومصنوع من خامات متينة ومقاومة للصدمات ليوفر أداءً سلساً ومستقراً لأجهزتك الذكية مع سهولة في الاستخدام والتوصيل.`,
      detailed: `• المنتج: ${name}
• الاستخدام: ملحقات وإلكترونيات استهلاكية
• المواصفات: ${specsSummary || 'خامات تصنيع قياسية عالية الجودة'}
• التوافق: متوافق مع المعايير الشائعة للأجهزة والمعدات الحديثة
• التغليف: عبوة المصنع الأصلية والمغلقة بإحكام.`
    };
  }

  // --------------------------------------------------------------------------
  // 4. CLOTHING, FOOTWEAR & FASHION
  // --------------------------------------------------------------------------
  if (activity === 'clothing_apparel') {
    // Footwear
    if (['كوتشي', 'سنيكرز', 'حذاء', 'صندل', 'شبشب', 'بوت', 'شوز'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - حذاء خفيف ومريح بنعل مرن يمتص الصدمات وخامات تهوية ممتازة.`,
        catchy: `${name}${sizePhrase} حذاء عصري مريح مصمم بنعل خفيف ومرن يمنح القدمين الراحة التامة أثناء المشي اليومي والرياضة، مع خامات علوية نفاذة للهواء تمنع تراكم الرطوبة.`,
        detailed: `• الصنف: ${name}
• المقاس والمواصفات: ${specsSummary || 'متوفر بمقاسات قياسية'}
• النعل: نعل مرن وخفيف ممتص للصدمات ومقاوم للانزلاق
• الخامة: قماش شبكي/جلد متين عالي الجودة سهل التنظيف
• الاستخدام: مناسب للمشي اليومي، الدوام، والمشاوير الرياضية.`
      };
    }

    // Apparel / Shirts / Pants
    return {
      short: `${name}${sizePhrase} - خامات قطنية ناعمة ومريحة للاستخدام اليومي وقصة متقنة ومقاومة للانكماش.`,
      catchy: `${name}${sizePhrase} قطعة ملابس عملية ومحاكة من خامات قطنية مريحة وناعمة على البشرة، تتميز بقصة مريحة وثبات عالي للألوان ومقاومة للتمدد والانكماش مع الغسيل المتكرر.`,
      detailed: `• القطعة: ${name}
• المقاس: ${specsSummary || 'مقاس قياسي مريح'}
• الخامة: أقمشة قطنية منتقاة ناعمة وذات تهوية ممتازة
• تعليمات الغسيل: يُغسل بماء فاتر بدون مبيضات للحفاظ على رونق الألوان ونعومة النسيج.`
    };
  }

  // --------------------------------------------------------------------------
  // 5. ROASTERY, COFFEE & SPICES
  // --------------------------------------------------------------------------
  if (activity === 'spices_roastery') {
    // Coffee
    if (['بن', 'قهوة', 'اسبريسو', 'محوج', 'سادة', 'يمني', 'برازيلي', 'كولومبي'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - بن محمص ومطحون طازجاً بنكهة غنية وقوام متماسك ووش كثيف.`,
        catchy: `${name}${sizePhrase} بن فاخر محمص ومطحون طازجاً من حبوب أرابيكا وروبوستا منتقاة، يتميز بنكهة متوازنة ورائحة زكية ووش غني ومثالي لعشاق الفنجان المضبوط.`,
        detailed: `• الصنف: ${name}
• التحميص: محمص طازجاً بدرجة وسط/غامق حسب الأصول
• التحويجة: ${targetLower.includes('محوج') ? 'تحويجة هيل ومستكة طبيعية فاخرة' : 'بن نقي 100% بدون إضافات'}
• التعبئة: كيس صمام ثلاثي الطبقات يحفظ الزيوت العطرية والنكهة الطازجة
• الحفظ: يُغلق بإحكام ويُحفظ في مكان جاف وبارد بعيداً عن الروائح النفاذة.`
      };
    }

    // Nuts & Seeds
    if (['مكسرات', 'كاجو', 'فستق', 'لوز', 'عين جمل', 'بندق', 'لب', 'سوداني', 'تسالي'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - مكسرات وتسالي محمصة يومياً على الجاف بقرمشة طازجة ونقاء مضمون.`,
        catchy: `${name}${sizePhrase} مكسرات وتسالي فاخرة محمصة طازجة بدرجة ملح خفيفة ومحكمة الغلق، خالية من الرطوبة والشوائب وغنية بالزيوت والدهون الصحية المفيدة.`,
        detailed: `• الصنف: ${name}
• التجهيز: تحميص جاف طازج بدون دهون مهدرجة
• الوزن/العبوة: ${specsSummary || 'عبوة محكمة الغلق عازلة للرطوبة'}
• الجودة: حبات كاملة منتقاة درجة أولى
• التخزين: يُحفظ في عبوة محكمة الإغلاق في مكان بارد وجاف.`
      };
    }

    // Spices & Herbs
    return {
      short: `${name}${sizePhrase} - توابل وأعشاب طبيعية ونقية 100% برائحة عطرية قوية وطعم أصيل للطهي.`,
      catchy: `${name}${sizePhrase} بهارات وتوابل طبيعية منتقاة ومجففة بعناية فائقة، خالية تماماً من الشوائب والألوان الصناعية لتمنح وصفاتك المنزلية النكهة الأصيلة والرائحة الزكية.`,
      detailed: `• الصنف: ${name}
• النقاء: 100% طبيعي بدون مواد حافظة أو ملونات مضافة
• الاستخدام: توابل أساسية لإعداد أشهى الأطباق والوصفات
• الحفظ: يُحفظ في برطمان زجاجي أو علبة محكمة بعيداً عن الرطوبة وحرارة الفرن.`
    };
  }

  // --------------------------------------------------------------------------
  // 6. BUTCHERY & FRESH PRODUCE
  // --------------------------------------------------------------------------
  if (activity === 'produce_butchery') {
    // Meat & Poultry
    if (['لحم', 'كفتة', 'كبدة', 'بفتيك', 'مفروم', 'ضاني', 'كندوز', 'بتلو', 'فراخ', 'دواجن', 'سمك', 'جمبري'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - ذبح بلدي طازج يومياً تحت إشراف بيطري كامل ونظافة وتشفية دقيقة.`,
        catchy: `${name}${sizePhrase} لحوم ودواجن بلدية طازجة، مذبوحة ومجهزة يومياً وفق الاشتراطات الصحية الصارمة، مقطعة ومنظفة باحترافية وتصلك مغلفة مبردة بأعلى درجات النظافة.`,
        detailed: `• الصنف: ${name}
• المصدر: ذبح يومي طازج بإشراف بيطري معتمد
• التجهيز: تقطيع وتشفية احترافية ونسبة دهن متوازنة
• التغليف: أطباق وأكياس حفظ صحية مخصصة للمبردات
• الحفظ: تحفظ مبردة فور الاستلام أو تجمد للاستخدام لاحقاً.`
      };
    }

    // Fruits & Vegetables
    return {
      short: `${name}${sizePhrase} - خضار وفاكهة طازجة فريش قطفة أولى منتقاة بعناية للمائدة اليومية.`,
      catchy: `${name}${sizePhrase} ثمار طازجة قطفة أولى مفرزة ومنتقاة بعناية تامة، خالية من التلف والذبول وتصلك نظيفة ومغلفة لتحافظ على نضارتها وقيمتها الغذائية في ثلاجتك.`,
      detailed: `• الصنف: ${name}
• الجودة: فرز أول طازج ونظيف
• التعبئة: أكياس وأطباق حفظ جيدة التهوية
• التخزين: تحفظ في درج الثلاجة للحفاظ على طزاجة الثمار.`
    };
  }

  // --------------------------------------------------------------------------
  // 7. BAKERY & DAIRY
  // --------------------------------------------------------------------------
  if (activity === 'dairy_bakery') {
    // Dairy & Cheeses
    if (['حليب', 'لبن', 'جبن', 'جبنة', 'قشطة', 'زبدة', 'سمن', 'قريش', 'براميلي', 'موتزاريلا'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - منتج ألبان طبيعي 100% طازج ومبستر بدون زيوت نباتية مهدرجة.`,
        catchy: `${name}${sizePhrase} منتجات ألبان طازجة ومحضرة من حليب طبيعي نقي 100%، غنية بالكالسيوم والبروتين وتتميز بقوام متماسك وطعم بلدي أصيل للإفطار والوجبات اليومية.`,
        detailed: `• الصنف: ${name}
• المكونات: حليب طبيعي نقي 100% بدون إضافات دهون مهدرجة
• الوزن/العبوة: ${specsSummary || 'عبوة محكمة للحفظ الصحي'}
• الاستخدام: وجبات الإفطار والعشاء والسندوتشات والطهي المنزلي
• شروط الحفظ: يحفظ مبرداً دائماً في الثلاجة بدرجة حرارة 2-5° مئوية.`
      };
    }

    // Bakery
    return {
      short: `${name}${sizePhrase} - مخبوز طازج يومياً بعجينة هشة ومكونات فاخرة خالية من المواد الحافظة.`,
      catchy: `${name}${sizePhrase} مخبوزات طازجة ومعدة يومياً بأجود أنواع الدقيق النقي والمكونات الفاخرة، تتميز بقوام هش ومورق ومغلفة بعناية لتصلك بطراوتها وطعمها اللذيذ.`,
      detailed: `• الصنف: ${name}
• التجهيز: خبز يومي طازج في أفران آلية حديثة
• المكونات: دقيق فاخر نقي ومكونات طبيعية خالية من المحسنات الضارة
• التغليف: كيس حفظ غذائي يحافظ على طراوة العجين
• الاستهلاك: يفضل استهلاكه طازجاً أو حفظه مغلقاً بإحكام.`
    };
  }

  // --------------------------------------------------------------------------
  // 8. STATIONERY, BOOKS & OFFICE SUPPLIES
  // --------------------------------------------------------------------------
  if (activity === 'stationery_gifts') {
    if (['كشكول', 'كراس', 'نوت بوك', 'أجندة', 'ورق', 'ورق تصوير', 'اسكتش'].some(k => targetLower.includes(k))) {
      return {
        short: `${name}${sizePhrase} - ورق ناصع البياض عالي الكثافة لا ينفذ الحبر مع غلاف متين وتسطير دقيق.`,
        catchy: `${name}${sizePhrase} دفاتر وورقيات دراسية ومكتبية بجودة تصنيع ممتازة، تتميز بورق أبيض ناعم عالي النقاء وسماكة ممتازة تمنع نفاذ الحبر للجهة الأخرى وغلاف مقوى يحمي الأوراق.`,
        detailed: `• الصنف: ${name}
• المواصفات: ${specsSummary || 'ورق عالي الكثافة مناسب للكتابة والطباعة'}
• التسطير: تسطير قياسي واضح ومريح للعين
• الغلاف: غلاف قوي مقاوم للثني والاستخدام الدراسي اليومي.`
      };
    }

    return {
      short: `${name}${sizePhrase} - أدوات مكتبية ومدرسية متينة وعملية ومصممة للاستخدام اليومي المستمر.`,
      catchy: `${name}${sizePhrase} مستلزمات مكتبية ودراسية أصلية وعالية الدقة والاعتمادية، مصممة بهيكل مريح يساعدك على إنجاز مهام الكتابة والدراسة والعمل المكتبي بسلاسة وثبات.`,
      detailed: `• الصنف: ${name}
• الاستخدام: أدوات مدرسية ومكتبية وهندسية
• المواصفات: ${specsSummary || 'خامات تصنيع قياسية متينة'}
• الاعتمادية: مصمم لتحمل الاستخدام المتكرر والمستمر.`
    };
  }

  // --------------------------------------------------------------------------
  // 9. SUPERMARKET & GENERAL GROCERY
  // --------------------------------------------------------------------------
  if (CLEANING_KEYWORDS.some(k => targetLower.includes(k))) {
    return {
      short: `${name}${sizePhrase} - منظف عالي الفاعلية يزيل أصعب البقع والدهون ويترك رائحة انتعاش تدوم.`,
      catchy: `${name}${sizePhrase} منتج تنظيف منزلي قوي ومجرب، يقضي على البقع الصعبة والرواسب الدهنية بسرعة وسهولة مع الحفاظ على لمعان الأسطح وإضفاء رائحة نظافة منعشة.`,
      detailed: `• المنتج: ${name}
• الاستخدام: تنظيف وتطهير الأسطح والأواني والمنسوجات
• العبوة: ${specsSummary || 'عبوة عملية سهلة الاستخدام والسكب'}
• الأمان: يُحفظ بعيداً عن متناول الأطفال ويُراعى تجنب ملامسة العينين.`
    };
  }

  if (PERSONAL_CARE_KEYWORDS.some(k => targetLower.includes(k))) {
    return {
      short: `${name}${sizePhrase} - منتج عناية شخصية بتركيبة لطيفة تمنح ترطيباً وانتعاشاً ملموساً طوال اليوم.`,
      catchy: `${name}${sizePhrase} مستحضر عناية شخصية لطيف على البشرة والشعر، يوفر تنظيفاً فعالاً وترطيباً متوازناً مع رائحة عطرة تناسب الاستخدام اليومي لجميع أفراد الأسرة.`,
      detailed: `• الصنف: ${name}
• نوع الاستخدام: نظافة وعناية شخصية يومية
• العبوة: ${specsSummary || 'عبوة قياسية سهلة الاستخدام'}
• الملاءمة: تركيبة متوازنة مختبرة للاستخدام العائلي اليومي.`
    };
  }

  if (DRINKS_KEYWORDS.some(k => targetLower.includes(k))) {
    return {
      short: `${name}${sizePhrase} - مشروب منعش ولذيذ يفضل تقديمه بارداً للترطيب واستعادة الحيوية.`,
      catchy: `${name}${sizePhrase} مشروب منعش منتقى من أفضل العلامات التجارية، يقدم مذاقاً لذيذاً ومروياً للعطش في الأوقات اليومية ومع الوجبات وتجمعات العائلة.`,
      detailed: `• الصنف: ${name}
• الحجم/العبوة: ${specsSummary || 'عبوة عملية محكمة'}
• طريقة التقديم: يُفضل تقديمه مبرداً لمذاق منعش
• التخزين: يُحفظ في مكان جاف وبارد بعيداً عن حرارة الشمس المباشرة.`
    };
  }

  if (SWEETS_KEYWORDS.some(k => targetLower.includes(k))) {
    return {
      short: `${name}${sizePhrase} - سناك خفيف ولذيذ بمذاق غني وقرمشة طازجة ومناسب لجميع الأوقات.`,
      catchy: `${name}${sizePhrase} حلوى وتسالي شهية ومصنوعة من مكونات عالية الجودة، مثالية للتحلية السريعة وسناك منتصف اليوم والجمعات والمشاركة مع الأصدقاء.`,
      detailed: `• الصنف: ${name}
• الوزن/العبوة: ${specsSummary || 'عبوة فردية/عائلية مغلفة بعناية'}
• الاستخدام: سناك وتحلية خفيفة
• الحفظ: يُحفظ مغلقاً في مكان بارد وجاف للحفاظ على القرمشة والجودة.`
    };
  }

  // Default Supermarket & General Retail
  return {
    short: `${name}${sizePhrase} - صنف أصلي عالي الجودة ومعبأ آلياً وفق المواصفات القياسية المعتمدة.`,
    catchy: `${name}${sizePhrase} منتج استهلاكي أصلي ومختار بعناية لتلبية احتياجات منزلك ومتجرك اليومية، يتميز بجودة تصنيع موثوقة وعبوة عملية ومحكمة تضمن سلامة الصنف وسهولة استخدامه.`,
    detailed: `• الصنف: ${name}
• التصنيف: سلع استهلاكية وتجزئة
• المواصفات: ${specsSummary || 'عبوة قياسية أصلية ومحكمة الغلق'}
• الجودة: منتج أصلي ومطابق للمواصفات القياسية للسلع
• التخزين: يُحفظ في مكان مناسب ونظيف بعيداً عن الرطوبة والحرارة.`
  };
}

export function generateSmartDescription(
  product: ProductLike,
  categoryName?: string | null,
  tone: DescriptionTone = 'catchy',
  storeType?: string | null
): string {
  const options = generateSmartDescriptionOptions(product, categoryName, storeType);
  return options[tone] || options.catchy;
}
