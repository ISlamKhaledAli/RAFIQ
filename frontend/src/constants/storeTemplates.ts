export interface StoreTemplateDto {
  id: string;
  name: string;
  description: string;
  icon: string;
  featureFlags: Record<string, boolean>;
  categories?: string[];
  quickItems?: { Name: string; PricePiasters: number; Unit: string; CategoryName: string; IsOpenPrice?: boolean }[];
  defaultSettings?: Record<string, string>;
  productsCount?: number;
  featuresSummary: string[];
}

export const INITIAL_STORE_TEMPLATES: StoreTemplateDto[] = [
  {
    id: 'supermarket',
    name: 'سوبرماركت ومواد غذائية',
    description: 'مناسب لمحلات السوبرماركت ومحلات البقالة الكبيرة التي تستخدم الباركود والميزان والآجل وتواريخ الصلاحية',
    icon: 'shopping-cart',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: true },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['دعم الميزان الإلكتروني', 'تاريخ الصلاحية', 'البيع الآجل والديون', 'تعدد الوحدات والكرتونة'],
    defaultSettings: { receipt_header: 'أهلاً بكم في سوبرماركت رفيق', receipt_footer: 'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.' }
  },
  {
    id: 'phones_electronics',
    name: 'محلات هواتف وموبايل وإلكترونيات',
    description: 'مخصص لمحلات الهواتف الذكية والإلكترونيات وصيانة الجوال والإكسسوارات وخدمات الشحن السريع',
    icon: 'smartphone',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['إكسسوارات وأجهزة', 'صيانة وخدمات سريعة', 'البيع الآجل', 'بدون ميزان'],
    defaultSettings: { receipt_header: 'متجر رفيق للهواتف والإلكترونيات', receipt_footer: 'شكراً لتعاملكم معنا! نحرص دائماً على تقديم أفضل المنتجات والضمان المعتمد.' }
  },
  {
    id: 'produce_butchery',
    name: 'خضار وفاكهة ومجزر وجزارة',
    description: 'مناسب لمحلات الخضار والفاكهة والجزارة والمجمدات التي تعتمد أساسياً على الميزان الإلكتروني والوزن بالجرام',
    icon: 'apple',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['دعم الميزان الإلكتروني', 'حساب الوزن بالجرام', 'بيع آجل وسداد'],
    defaultSettings: { receipt_header: 'أسواق رفيق للخضار والفاكهة واللحوم الطازجة', receipt_footer: 'بضاعة طازجة بأعلى جودة.. شكراً لزيارتكم!' }
  },
  {
    id: 'dairy_bakery',
    name: 'ألبان ومخبوزات ومعلبات',
    description: 'مناسب لمحلات اللبانة والأجبان والمخابز التي تعتمد على البيع بالوزن والقطع والأصناف الطازجة',
    icon: 'milk',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: false },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['دعم الميزان', 'تاريخ الصلاحية للألبان', 'مخبوزات بالقطعة', 'البيع الآجل'],
    defaultSettings: { receipt_header: 'ألبان ومخبوزات رفيق', receipt_footer: 'منتجات طازجة يومياً.. شكراً لثقتكم الغالية' }
  },
  {
    id: 'stationery_gifts',
    name: 'مكتبات وأدوات مدرسية وهدايا',
    description: 'مناسب للمكتبات والقرطاسية والهدايا وخدمات الطباعة وتصوير المستندات ومستلزمات الدراسة',
    icon: 'book',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['أدوات وقرطاسية', 'طباعة وتصوير مستندات', 'هدايا وتغليف', 'بدون ميزان'],
    defaultSettings: { receipt_header: 'مكتبة رفيق للقرطاسية والهدايا', receipt_footer: 'نتمنى لطلابنا الأعزاء دوام التوفيق والنجاح!' }
  },
  {
    id: 'toys_kids',
    name: 'محلات ألعاب أطفال ومجسمات',
    description: 'مخصص لمحلات لعب الأطفال والهدايا والمجسمات والدمى والسيارات والتعليم التفاعلي',
    icon: 'package',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['ألعاب وهدايا', 'تغليف وفيونكات', 'بدون أوزان وميزان'],
    defaultSettings: { receipt_header: 'متجر عالم الألعاب للأطفال', receipt_footer: 'شكراً لاختياركم متجرنا! يسعدنا دائماً رسم البسمة على وجوه أطفالكم.' }
  },
  {
    id: 'spices_roastery',
    name: 'عطارة ومحامص وبن وتوابل',
    description: 'مناسب لمحلات العطارة والبن والمحامص والمكسرات بالأوزان الدقيقة والميزان الإلكتروني',
    icon: 'flame',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: false },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['ميزان إلكتروني دقيق', 'أوزان جرامات وثمن وربع', 'تواريخ صلاحية للعطارة'],
    defaultSettings: { receipt_header: 'عطارة ومحامص رفيق الفاخرة', receipt_footer: 'أجود أنواع البن والتوابل الطازجة.. بالهناء والشفاء' }
  },
  {
    id: 'clothing_apparel',
    name: 'ملابس وأحذية وأزياء',
    description: 'مناسب لمحلات الملابس والأحذية والأزياء والحقائب مع دعم إدارة المقاسات والألوان والباركود',
    icon: 'shirt',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false, feature_matrix_variants: true },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['مقاسات وألوان', 'باركود لكل قطعة', 'سياسة استبدال 14 يوم', 'بدون ميزان'],
    defaultSettings: { receipt_header: 'متاجر رفيق للملابس والأزياء', receipt_footer: 'شكراً لاختياركم متجرنا! الاستبدال خلال 14 يوماً مع وجود كارت الصنف والباركود.' }
  },
  {
    id: 'general_grocery',
    name: 'محل تجاري عام وميني ماركت',
    description: 'إعداد عام متوازن ومبسط يناسب كافة المحلات والأنشطة التجارية المتنوعة',
    icon: 'store',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: [],
    quickItems: [],
    productsCount: 0,
    featuresSummary: ['بيع نقدي وآجل', 'دعم الميزان والباركود', 'إعدادات متوازنة وشاملة'],
    defaultSettings: { receipt_header: 'أهلاً بكم في متجرنا', receipt_footer: 'شكراً لتعاملكم معنا' }
  }
];
