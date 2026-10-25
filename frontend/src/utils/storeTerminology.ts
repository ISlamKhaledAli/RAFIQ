/**
 * قاموس التسميات والمصطلحات المخصصة حسب طبيعة المتجر ونشاط البيع
 * Store Profile Terminology Dictionary & Localization
 */

export interface StoreTerminology {
  sizeLabel: string;              // التسمية لسمة الحجم / التركيز / السعة
  sizePlaceholder: string;        // نص الإرشاد داخل الحقل
  colorLabel: string;             // التسمية للون أو النكهة أو التحويجة
  colorPlaceholder: string;       // نص الإرشاد للون
  modelOrCodeLabel: string;       // كود الموديل أو التشغيلة
  modelOrCodePlaceholder: string;
  badgePrefix: string;            // البادئة في كروت البيع (مثال: تركيز، مقاس، سعة، حجم)
  variantsTitle: string;          // عنوان الأصناف المتفرعة (مثال: المقاسات والألوان، التركيزات والعبوات)
  pickVariantPrompt: string;      // نص الزر في الكاشير (مثال: اختر المقاس واللون، اختر التركيز أو النوع)
  filterBySizeLabel: string;      // نص الفلترة (مثال: تصفية بالمقاس، تصفية بالتركيز)
  quickAddAction: string;         // نص زر الإضافة السريعة للمتغيرات

  // منظومة التعبئة والوحدات والبيع بالتجزئة (Packaging & Multi-Unit Localization)
  packagingSectionTitle: string;     // عنوان قسم التعبئة في شاشة الصنف
  packagingAddAction: string;        // نص زر إضافة العبوات والتجزئة
  packagingTopUnitDefault: string;   // اسم العبوة الكبرى الافتراضية
  baseUnitDefaultName: string;       // اسم الوحدة الأساسية الافتراضية
  looseSellingLabel: string;         // تسمية خيار البيع المفكوك
  packagingLevelPlaceholder: string; // نص إرشاد إضافة مستوى
}

const TERMINOLOGY_MAP: Record<string, StoreTerminology> = {
  pharmacy: {
    sizeLabel: 'التركيز / الحجم',
    sizePlaceholder: 'مثلاً: 500mg أو 100ml أو 20mcg/ml',
    colorLabel: 'النكهة / الشكل الدوائي',
    colorPlaceholder: 'مثلاً: أقراص، شراب، فوار، بدون سكر',
    modelOrCodeLabel: 'رقم التشغيلة / كود الدواء',
    modelOrCodePlaceholder: 'مثلاً: B-2026 أو كود المستحضر',
    badgePrefix: 'تركيز',
    variantsTitle: 'التركيزات والأشكال الدوائية المتفرعة',
    pickVariantPrompt: 'اختر التركيز أو العبوة ↵',
    filterBySizeLabel: 'تصفية بالتركيز:',
    quickAddAction: '+ إضافة تركيز أو شكل دوائي (للمستحضرات المتعددة)',

    packagingSectionTitle: 'تجزئة وعبوات الدواء:',
    packagingAddAction: 'إضافة تجزئة للعلبة (شريط / قرص)',
    packagingTopUnitDefault: 'علبة',
    baseUnitDefaultName: 'قرص',
    looseSellingLabel: 'البيع بالتجزئة (بالشريط والقرص):',
    packagingLevelPlaceholder: 'إضافة شريط أو قرص للأدوية',
  },
  clothing_apparel: {
    sizeLabel: 'المقاس (Size)',
    sizePlaceholder: 'مثلاً: S, M, L, XL, 32, 34...',
    colorLabel: 'اللون (Color)',
    colorPlaceholder: 'مثلاً: أسود، كحلي، أبيض، رمادي...',
    modelOrCodeLabel: 'كود الموديل (SKU)',
    modelOrCodePlaceholder: 'مثلاً: MOD-2026-X',
    badgePrefix: 'مقاس',
    variantsTitle: 'المقاسات والألوان ومصفوفة الموديل',
    pickVariantPrompt: 'اختر المقاس واللون ↵',
    filterBySizeLabel: 'تصفية بالمقاس:',
    quickAddAction: '+ إضافة مقاس أو لون لهذا الموديل',

    packagingSectionTitle: 'تعبئة ودستة الموديل:',
    packagingAddAction: 'إضافة دستة أو باكت للموديل',
    packagingTopUnitDefault: 'دستة',
    baseUnitDefaultName: 'قطعة',
    looseSellingLabel: 'البيع الفردي بالقطعة:',
    packagingLevelPlaceholder: 'إضافة دستة أو باكت ملابس',
  },
  phones_electronics: {
    sizeLabel: 'السعة / الرام / الإصدار',
    sizePlaceholder: 'مثلاً: 128GB, 256GB, 8GB Ram, Pro Max',
    colorLabel: 'اللون',
    colorPlaceholder: 'مثلاً: تيتانيوم طبيعي، أسود فلكي، كحلي',
    modelOrCodeLabel: 'كود الموديل / القطعة (SKU)',
    modelOrCodePlaceholder: 'مثلاً: SM-A556B',
    badgePrefix: 'سعة',
    variantsTitle: 'السعات والموديلات والألوان',
    pickVariantPrompt: 'اختر السعة واللون ↵',
    filterBySizeLabel: 'تصفية بالسعة والإصدار:',
    quickAddAction: '+ إضافة سعة أو لون أو إصدار للجهاز',

    packagingSectionTitle: 'عبوات وباكت الأجهزة والقطع:',
    packagingAddAction: 'إضافة باكت أو كرتونة للأجهزة',
    packagingTopUnitDefault: 'كرتونة',
    baseUnitDefaultName: 'قطعة',
    looseSellingLabel: 'البيع بالقطعة الفردية:',
    packagingLevelPlaceholder: 'إضافة كرتونة أو باكت إلكترونيات',
  },
  spices_roastery: {
    sizeLabel: 'الوزن / الحجم',
    sizePlaceholder: 'مثلاً: ربع كيلو، ثمن كيلو، 250 جم',
    colorLabel: 'نوع التحويجة / النكهة',
    colorPlaceholder: 'مثلاً: محوج حبهان، سادة فاتح، وسط، غامق',
    modelOrCodeLabel: 'الدرجة / المصدر',
    modelOrCodePlaceholder: 'مثلاً: برازيلي درجة أولى، يمني',
    badgePrefix: 'حجم',
    variantsTitle: 'الأوزان والتحويجات المتوفرة',
    pickVariantPrompt: 'اختر الوزن والتحويجة ↵',
    filterBySizeLabel: 'تصفية بالوزن / الحجم:',
    quickAddAction: '+ إضافة وزن أو تحويجة مخصصة',

    packagingSectionTitle: 'تعبئة وأوزان الصنف:',
    packagingAddAction: 'إضافة عبوات وأوزان (أكياس / علب / شيكارة)',
    packagingTopUnitDefault: 'شيكارة',
    baseUnitDefaultName: 'كيلو',
    looseSellingLabel: 'البيع المجزأ (بالوزن الصغير):',
    packagingLevelPlaceholder: 'إضافة كيس أو علبة أو شيكارة',
  },
  dairy_bakery: {
    sizeLabel: 'الوزن / الحجم',
    sizePlaceholder: 'مثلاً: 1 كجم، 500 جم، قالب كبير',
    colorLabel: 'النوع / النكهة',
    colorPlaceholder: 'مثلاً: قليل الملح، دسم كامل، بالفلفل',
    modelOrCodeLabel: 'كود الصنف / الدفعة',
    modelOrCodePlaceholder: 'مثلاً: كود الدفعة',
    badgePrefix: 'حجم',
    variantsTitle: 'الأحجام والأوزان والأنواع المتفرعة',
    pickVariantPrompt: 'اختر الحجم أو النوع ↵',
    filterBySizeLabel: 'تصفية بالحجم / الوزن:',
    quickAddAction: '+ إضافة حجم أو نكهة للصنف',

    packagingSectionTitle: 'أحجام وعبوات وتجزئة الصنف:',
    packagingAddAction: 'إضافة عبوات (كرتونة / قالب)',
    packagingTopUnitDefault: 'كرتونة',
    baseUnitDefaultName: 'قطعة',
    looseSellingLabel: 'البيع بالتجزئة (بالقطعة / الشريحة):',
    packagingLevelPlaceholder: 'إضافة كرتونة أو قالب مخبوزات',
  },
  produce_butchery: {
    sizeLabel: 'الوزن / درجة القطعية',
    sizePlaceholder: 'مثلاً: بالعظم، موزة، فلتو، درجة أولى',
    colorLabel: 'النوع / المصدر',
    colorPlaceholder: 'مثلاً: بلدي، مستورد، عجالي، ضاني',
    modelOrCodeLabel: 'كود الميزان / الصنف',
    modelOrCodePlaceholder: 'مثلاً: كود الميزان',
    badgePrefix: 'نوع',
    variantsTitle: 'القطعيات والأنواع المتوفرة',
    pickVariantPrompt: 'اختر القطعية أو النوع ↵',
    filterBySizeLabel: 'تصفية بالقطعية:',
    quickAddAction: '+ إضافة نوع قطعية أو تصنيف للصنف',

    packagingSectionTitle: 'تعبئة وتجزئة الصنف والأقفاص:',
    packagingAddAction: 'إضافة قفص أو صندوق أو كرتونة',
    packagingTopUnitDefault: 'قفص',
    baseUnitDefaultName: 'كيلو',
    looseSellingLabel: 'البيع بالتجزئة (بالواحدة / بالوزن الصغير):',
    packagingLevelPlaceholder: 'إضافة قفص أو كرتونة خضار ولحوم',
  },
  stationery_gifts: {
    sizeLabel: 'الحجم / المقاس',
    sizePlaceholder: 'مثلاً: A4, A5, كبير, وسط, 80 ورقة',
    colorLabel: 'اللون / التصميم',
    colorPlaceholder: 'مثلاً: أزرق، أحمر، سادة، مسطر، كوشيه',
    modelOrCodeLabel: 'كود الصنف / الموديل (SKU)',
    modelOrCodePlaceholder: 'مثلاً: ST-101',
    badgePrefix: 'مقاس',
    variantsTitle: 'المقاسات والألوان والأنواع المتوفرة',
    pickVariantPrompt: 'اختر المقاس أو اللون ↵',
    filterBySizeLabel: 'تصفية بالمقاس / السعة:',
    quickAddAction: '+ إضافة مقاس أو لون للأدوات',

    packagingSectionTitle: 'تعبئة وباكتات الأدوات:',
    packagingAddAction: 'إضافة باكت أو دستة أو كرتونة',
    packagingTopUnitDefault: 'دستة',
    baseUnitDefaultName: 'قطعة',
    looseSellingLabel: 'البيع الفردي بالقطعة:',
    packagingLevelPlaceholder: 'إضافة دستة أو باكت أدوات مكتبية',
  },
  toys_kids: {
    sizeLabel: 'الحجم / المقاس / الفئة',
    sizePlaceholder: 'مثلاً: كبير، متوسط، فئة +3 سنوات',
    colorLabel: 'اللون / الشخصية',
    colorPlaceholder: 'مثلاً: أحمر، سبايدرمان، باتمان',
    modelOrCodeLabel: 'كود الموديل (SKU)',
    modelOrCodePlaceholder: 'مثلاً: TOY-2026',
    badgePrefix: 'نوع',
    variantsTitle: 'الموديلات والأحجام والألوان',
    pickVariantPrompt: 'اختر الموديل أو اللون ↵',
    filterBySizeLabel: 'تصفية بالحجم:',
    quickAddAction: '+ إضافة موديل أو لون للعبة',

    packagingSectionTitle: 'عبوات وباكت الألعاب:',
    packagingAddAction: 'إضافة باكت أو كرتونة للألعاب',
    packagingTopUnitDefault: 'كرتونة',
    baseUnitDefaultName: 'قطعة',
    looseSellingLabel: 'البيع الفردي بالقطعة:',
    packagingLevelPlaceholder: 'إضافة كرتونة أو باكت ألعاب',
  },
  supermarket: {
    sizeLabel: 'الحجم / العبوة',
    sizePlaceholder: 'مثلاً: 1 لتر، 500 مل، عائلي، جامبو',
    colorLabel: 'النكهة / الصنف',
    colorPlaceholder: 'مثلاً: شيكولاتة، فانيليا، مانجو، بدون ملح',
    modelOrCodeLabel: 'كود الصنف (SKU)',
    modelOrCodePlaceholder: 'مثلاً: SKU-101',
    badgePrefix: 'حجم',
    variantsTitle: 'الأحجام والعبوات والنكهات المتفرعة',
    pickVariantPrompt: 'اختر الحجم أو النكهة ↵',
    filterBySizeLabel: 'تصفية بالحجم والعبوة:',
    quickAddAction: '+ إضافة حجم أو عبوة أو نكهة للصنف',

    packagingSectionTitle: 'عبوات وتجزئة الصنف:',
    packagingAddAction: 'إضافة عبوات (كرتونة / باكت)',
    packagingTopUnitDefault: 'كرتونة',
    baseUnitDefaultName: 'قطعة',
    looseSellingLabel: 'البيع المفكوك (بالقطعة / بالبيضة / بالواحدة):',
    packagingLevelPlaceholder: 'إضافة كرتونة أو باكت للمنتجات',
  },
  general_grocery: {
    sizeLabel: 'الحجم / المقاس',
    sizePlaceholder: 'مثلاً: كبير، وسط، صغير، 1 لتر',
    colorLabel: 'اللون / النوع',
    colorPlaceholder: 'مثلاً: أبيض، أحمر، نوع عادي',
    modelOrCodeLabel: 'كود الصنف الداخلي (SKU)',
    modelOrCodePlaceholder: 'مثلاً: SKU-001',
    badgePrefix: 'حجم',
    variantsTitle: 'المتغيرات والأحجام المتفرعة',
    pickVariantPrompt: 'اختر الحجم أو اللون ↵',
    filterBySizeLabel: 'تصفية بالحجم:',
    quickAddAction: '+ إضافة حجم أو لون أو صنف متفرع',

    packagingSectionTitle: 'عبوات وتجزئة الصنف:',
    packagingAddAction: 'إضافة عبوات وتجزئة الصنف',
    packagingTopUnitDefault: 'كرتونة',
    baseUnitDefaultName: 'قطعة',
    looseSellingLabel: 'البيع المفكوك بالوحدة الصغرى:',
    packagingLevelPlaceholder: 'إضافة كرتونة أو باكت',
  },
};

/**
 * جلب نوع المتجر الحالي من التخزين المحلي أو الإعدادات الذكية
 */
export function getCurrentStoreType(): string {
  try {
    const direct = localStorage.getItem('rafiq_store_type') || localStorage.getItem('rafiq_preferred_store_type');
    if (direct && direct.trim()) return direct.trim();

    // Auto-detection from feature flags
    const flagsStr = localStorage.getItem('rafiq_feature_flags');
    if (flagsStr) {
      const parsed = JSON.parse(flagsStr);
      if (parsed.feature_pharmacy) return 'pharmacy';
      if (parsed.feature_matrix_variants) return 'clothing_apparel';
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * الحصول على مصفوفة التسميات الخاصة بنشاط المتجر المحدد مع دعم التخصيص الذكي
 */
export function getStoreTerminology(storeType?: string): StoreTerminology {
  let type = (storeType || getCurrentStoreType() || '').trim();

  // If no storeType, or if storeType is generic, check if specific feature flags are enabled
  if (!type || type === 'general_grocery') {
    try {
      const flagsStr = localStorage.getItem('rafiq_feature_flags');
      if (flagsStr) {
        const parsed = JSON.parse(flagsStr);
        if (parsed.feature_pharmacy) {
          type = 'pharmacy';
        } else if (parsed.feature_matrix_variants) {
          type = 'clothing_apparel';
        }
      }
    } catch {
      // ignore
    }
  }

  if (type && TERMINOLOGY_MAP[type]) {
    return TERMINOLOGY_MAP[type];
  }

  return TERMINOLOGY_MAP.general_grocery;
}
