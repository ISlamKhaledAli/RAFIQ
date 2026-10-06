export interface StoreTemplateDto {
  id: string;
  name: string;
  description: string;
  icon: string;
  featureFlags: Record<string, boolean>;
  categories: string[];
  quickItems: { Name: string; PricePiasters: number; Unit: string; CategoryName: string; IsOpenPrice?: boolean }[];
  defaultSettings?: Record<string, string>;
  productsCount?: number;
}

export const INITIAL_STORE_TEMPLATES: StoreTemplateDto[] = [
  {
    id: 'supermarket',
    name: 'سوبرماركت ومواد غذائية',
    description: 'مناسب لمحلات السوبرماركت ومحلات البقالة الكبيرة التي تستخدم الباركود والميزان والآجل',
    icon: 'shopping-cart',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: true },
    categories: ['معلبات وبقوليات', 'ألبان وأجبان', 'منظفات وعناية منزلية', 'بسكويت وحلويات', 'مشروبات وعصائر', 'مخبوزات', 'خضار وفاكهة', 'مجمدات', 'دخان وسجائر'],
    quickItems: [
      { Name: 'خبز بلدي طازج', PricePiasters: 100, Unit: 'piece', CategoryName: 'مخبوزات', IsOpenPrice: false },
      { Name: 'عيش فينو كيس 5 رغيف', PricePiasters: 1000, Unit: 'piece', CategoryName: 'مخبوزات', IsOpenPrice: false },
      { Name: 'سكر حر ناعم 1 كجم', PricePiasters: 3500, Unit: 'piece', CategoryName: 'معلبات وبقوليات', IsOpenPrice: false },
      { Name: 'شاي العروسة 40 جم', PricePiasters: 1200, Unit: 'piece', CategoryName: 'معلبات وبقوليات', IsOpenPrice: false },
      { Name: 'مياه معدنية 1.5 لتر', PricePiasters: 800, Unit: 'piece', CategoryName: 'مشروبات وعصائر', IsOpenPrice: false },
      { Name: 'لبن جهينة 1 لتر', PricePiasters: 4200, Unit: 'piece', CategoryName: 'ألبان وأجبان', IsOpenPrice: false },
      { Name: 'طماطم بلدي طازجة', PricePiasters: 1500, Unit: 'kg', CategoryName: 'خضار وفاكهة', IsOpenPrice: false },
      { Name: 'كيس تسوق كبير', PricePiasters: 150, Unit: 'piece', CategoryName: 'عام', IsOpenPrice: false },
    ],
    productsCount: 168,
    defaultSettings: { receipt_header: 'أهلاً بكم في سوبرماركت رفيق', receipt_footer: 'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.' }
  },
  {
    id: 'phones_electronics',
    name: 'محلات هواتف وموبايل وإلكترونيات',
    description: 'مخصص لمحلات الهواتف الذكية والإلكترونيات وصيانة الجوال والإكسسوارات (بدون ميزان وأوزان)',
    icon: 'smartphone',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: ['كابلات وشواحن', 'سماعات وصوتيات', 'جرابات وحافظات', 'لاصقات حماية وشاشات', 'باور بانك وبطاريات', 'كروت ميموري وفلاشات', 'صيانة وخدمات سريعة'],
    quickItems: [
      { Name: 'كابل شحن سريع Type-C', PricePiasters: 4500, Unit: 'piece', CategoryName: 'كابلات وشواحن', IsOpenPrice: false },
      { Name: 'كابل شحن آيفون Lightning', PricePiasters: 5000, Unit: 'piece', CategoryName: 'كابلات وشواحن', IsOpenPrice: false },
      { Name: 'رأس شاحن سريع 20W', PricePiasters: 12000, Unit: 'piece', CategoryName: 'كابلات وشواحن', IsOpenPrice: false },
      { Name: 'لاصقة حماية شاشة 9D', PricePiasters: 3000, Unit: 'piece', CategoryName: 'لاصقات حماية وشاشات', IsOpenPrice: false },
      { Name: 'جراب سيليكون شفاف حماية', PricePiasters: 3500, Unit: 'piece', CategoryName: 'جرابات وحافظات', IsOpenPrice: false },
      { Name: 'سماعة أذن سلكية AUX', PricePiasters: 4000, Unit: 'piece', CategoryName: 'سماعات وصوتيات', IsOpenPrice: false },
      { Name: 'كارت ميموري 32 جيجا', PricePiasters: 9500, Unit: 'piece', CategoryName: 'كروت ميموري وفلاشات', IsOpenPrice: false },
      { Name: 'صيانة وتركيب سريع', PricePiasters: 3000, Unit: 'piece', CategoryName: 'صيانة وخدمات سريعة', IsOpenPrice: true }
    ],
    productsCount: 44,
    defaultSettings: { receipt_header: 'متجر رفيق للهواتف والإلكترونيات', receipt_footer: 'شكراً لتعاملكم معنا! نحرص دائماً على تقديم أفضل المنتجات والضمان المعتمد.' }
  },
  {
    id: 'dairy_bakery',
    name: 'ألبان ومخبوزات ومعلبات',
    description: 'مناسب لمحلات اللبانة والأجبان والمخابز التي تعتمد على البيع بالوزن والأصناف الطازجة',
    icon: 'milk',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: false },
    categories: ['ألبان سائبة ومعبأة', 'أجبان بيضاء ومطبوخة', 'مخبوزات طازجة', 'بيض ومستلزمات', 'معلبات وعسل'],
    quickItems: [
      { Name: 'لبن جاموسي طازج كجم', PricePiasters: 3000, Unit: 'kg', CategoryName: 'ألبان سائبة ومعبأة', IsOpenPrice: false },
      { Name: 'لبن بقري طازج كجم', PricePiasters: 2600, Unit: 'kg', CategoryName: 'ألبان سائبة ومعبأة', IsOpenPrice: false },
      { Name: 'جبنة قريش كجم', PricePiasters: 7000, Unit: 'kg', CategoryName: 'أجبان بيضاء ومطبوخة', IsOpenPrice: false },
      { Name: 'جبنة براميلي فلفل كجم', PricePiasters: 14000, Unit: 'kg', CategoryName: 'أجبان بيضاء ومطبوخة', IsOpenPrice: false },
      { Name: 'رغيف فينو', PricePiasters: 150, Unit: 'piece', CategoryName: 'مخبوزات طازجة', IsOpenPrice: false },
      { Name: 'طبق بيض أحمر 30 بيضة', PricePiasters: 16500, Unit: 'piece', CategoryName: 'بيض ومستلزمات', IsOpenPrice: false },
      { Name: 'زبادي بلدي كبير', PricePiasters: 800, Unit: 'piece', CategoryName: 'ألبان سائبة ومعبأة', IsOpenPrice: false },
    ],
    productsCount: 41,
    defaultSettings: { receipt_header: 'ألبان ومخبوزات رفيق', receipt_footer: 'منتجات طازجة يومياً.. شكراً لثقتكم الغالية' }
  },
  {
    id: 'produce_butchery',
    name: 'خضار وفاكهة ومجزر',
    description: 'مناسب لمحلات الخضار والفاكهة والجزارة والمجمدات التي تعتمد أساسياً على الميزان الإلكتروني',
    icon: 'apple',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: ['خضروات طازجة', 'فواكه موسمية', 'ورقيات وأعشاب', 'لحوم ودواجن', 'مجمدات'],
    quickItems: [
      { Name: 'طماطم بلدي طازجة', PricePiasters: 1500, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
      { Name: 'بطاطس تحمير كجم', PricePiasters: 1800, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
      { Name: 'بصل أحمر بلدي كجم', PricePiasters: 1400, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
      { Name: 'خيار صوب بلدي كجم', PricePiasters: 1600, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
      { Name: 'ليمون بلدي كجم', PricePiasters: 2500, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
      { Name: 'موز بلدي طازج كجم', PricePiasters: 2000, Unit: 'kg', CategoryName: 'فواكه موسمية', IsOpenPrice: false },
      { Name: 'تفاح أحمر سكري كجم', PricePiasters: 4500, Unit: 'kg', CategoryName: 'فواكه موسمية', IsOpenPrice: false }
    ],
    productsCount: 48,
    defaultSettings: { receipt_header: 'أسواق رفيق للخضار والفاكهة الطازجة', receipt_footer: 'بضاعة طازجة بأعلى جودة.. شكراً لزيارتكم!' }
  },
  {
    id: 'stationery_gifts',
    name: 'مكتبات وأدوات مدرسية وهدايا',
    description: 'مناسب للمكتبات والقرطاسية، الهدايا، الألعاب ومستلزمات الطباعة (بدون ميزان)',
    icon: 'book',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: ['أدوات كتابة وأقلام', 'كشاكيل ودفاتر', 'أدوات هندسية ومدرسية', 'ألعاب وهدايا', 'طباعة وتصوير مستندات'],
    quickItems: [
      { Name: 'قلم جاف أزرق', PricePiasters: 500, Unit: 'piece', CategoryName: 'أدوات كتابة وأقلام', IsOpenPrice: false },
      { Name: 'كشكول سلك 60 ورقة', PricePiasters: 2000, Unit: 'piece', CategoryName: 'كشاكيل ودفاتر', IsOpenPrice: false },
      { Name: 'باكت ورق تصوير A4', PricePiasters: 18000, Unit: 'piece', CategoryName: 'طباعة وتصوير مستندات', IsOpenPrice: false },
      { Name: 'تصوير مستند وجهين', PricePiasters: 150, Unit: 'piece', CategoryName: 'طباعة وتصوير مستندات', IsOpenPrice: false },
      { Name: 'تغليف هدية فاخر', PricePiasters: 2500, Unit: 'piece', CategoryName: 'ألعاب وهدايا', IsOpenPrice: true },
      { Name: 'كيس هدايا كرتون', PricePiasters: 1000, Unit: 'piece', CategoryName: 'ألعاب وهدايا', IsOpenPrice: false },
      { Name: 'بطارية قلم AA', PricePiasters: 1500, Unit: 'piece', CategoryName: 'أدوات هندسية ومدرسية', IsOpenPrice: false }
    ],
    productsCount: 42,
    defaultSettings: { receipt_header: 'مكتبة رفيق للقرطاسية والهدايا', receipt_footer: 'نتمنى لطلابنا الأعزاء دوام التوفيق والنجاح!' }
  },
  {
    id: 'toys_kids',
    name: 'محلات ألعاب أطفال وهدايا',
    description: 'مخصص لمحلات لعب الأطفال والهدايا والمجسمات والدمى والسيارات (بدون ميزان وأوزان)',
    icon: 'package',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: ['ألعاب ذكاء وتركيب', 'سيارات وطائرات تحكم', 'عرائس ومجسمات', 'ألعاب تعليمية ورضع', 'ألعاب حركية ورياضية', 'سكوتر وركوب', 'هدايا وتغليف وبطاريات'],
    quickItems: [
      { Name: 'حجارة قلم AA باكت 4 حجر', PricePiasters: 4000, Unit: 'piece', CategoryName: 'هدايا وتغليف وبطاريات', IsOpenPrice: false },
      { Name: 'كيس هدايا كرتون كبير', PricePiasters: 1500, Unit: 'piece', CategoryName: 'هدايا وتغليف وبطاريات', IsOpenPrice: false },
      { Name: 'شريط تغليف وفيونكة هدية', PricePiasters: 500, Unit: 'piece', CategoryName: 'هدايا وتغليف وبطاريات', IsOpenPrice: false },
      { Name: 'فقاعات صابون بابلز كبيرة', PricePiasters: 2000, Unit: 'piece', CategoryName: 'ألعاب حركية ورياضية', IsOpenPrice: false },
      { Name: 'سلايم ألوان للأطفال', PricePiasters: 2500, Unit: 'piece', CategoryName: 'ألعاب ذكاء وتركيب', IsOpenPrice: false },
      { Name: 'مكعبات تركيب ليجو علبة صغيرة', PricePiasters: 5500, Unit: 'piece', CategoryName: 'ألعاب ذكاء وتركيب', IsOpenPrice: false },
      { Name: 'عربية صغيرة معدن سباق', PricePiasters: 3500, Unit: 'piece', CategoryName: 'سيارات وطائرات تحكم', IsOpenPrice: false }
    ],
    productsCount: 51,
    defaultSettings: { receipt_header: 'متجر عالم الألعاب للأطفال', receipt_footer: 'شكراً لاختياركم متجرنا! يسعدنا دائماً رسم البسمة على وجوه أطفالكم.' }
  },
  {
    id: 'spices_roastery',
    name: 'عطارة ومحامص وبن وتوابل',
    description: 'مناسب لمحلات العطارة والبن والمحامص والمكسرات بالأوزان والجرامات والميزان',
    icon: 'flame',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: false },
    categories: ['بن ومشروبات ساخنة', 'مكسرات ومحامص', 'توابل وبهارات', 'أعشاب طبيعية', 'ياميش وتمور'],
    quickItems: [
      { Name: 'ثمن بن محوج وسط', PricePiasters: 4500, Unit: 'piece', CategoryName: 'بن ومشروبات ساخنة', IsOpenPrice: false },
      { Name: 'ربع بن سادة فاتح', PricePiasters: 7000, Unit: 'piece', CategoryName: 'بن ومشروبات ساخنة', IsOpenPrice: false },
      { Name: 'كمون بلدي مطحون 100 جم', PricePiasters: 2500, Unit: 'piece', CategoryName: 'توابل وبهارات', IsOpenPrice: false },
      { Name: 'فلفل أسود حب 100 جم', PricePiasters: 3500, Unit: 'piece', CategoryName: 'توابل وبهارات', IsOpenPrice: false },
      { Name: 'فول سوداني مقشر 250 جم', PricePiasters: 2500, Unit: 'piece', CategoryName: 'مكسرات ومحامص', IsOpenPrice: false },
      { Name: 'لب سوبر ممتاز 250 جم', PricePiasters: 3500, Unit: 'piece', CategoryName: 'مكسرات ومحامص', IsOpenPrice: false }
    ],
    productsCount: 45,
    defaultSettings: { receipt_header: 'عطارة ومحامص رفيق الفاخرة', receipt_footer: 'أجود أنواع البن والتوابل الطازجة.. بالهناء والشفاء' }
  },
  {
    id: 'clothing_apparel',
    name: 'ملابس وأحذية وأزياء',
    description: 'مناسب لمحلات الملابس والأحذية والأزياء والحقائب (بدون ميزان وأوزان)',
    icon: 'shirt',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: ['ملابس رجالي', 'ملابس حريمي', 'ملابس أطفال', 'أحذية وحقائب', 'إكسسوارات ملابس'],
    quickItems: [
      { Name: 'تيشيرت قطن أساسي', PricePiasters: 15000, Unit: 'piece', CategoryName: 'ملابس رجالي', IsOpenPrice: false },
      { Name: 'شراب قطن فاخر', PricePiasters: 2500, Unit: 'piece', CategoryName: 'إكسسوارات ملابس', IsOpenPrice: false },
      { Name: 'حزام جلد كلاسيك', PricePiasters: 8500, Unit: 'piece', CategoryName: 'إكسسوارات ملابس', IsOpenPrice: false },
      { Name: 'طرحة شيفون سادة', PricePiasters: 6000, Unit: 'piece', CategoryName: 'ملابس حريمي', IsOpenPrice: false },
      { Name: 'كيس ملابس فاخر للمحل', PricePiasters: 500, Unit: 'piece', CategoryName: 'إكسسوارات ملابس', IsOpenPrice: false }
    ],
    productsCount: 40,
    defaultSettings: { receipt_header: 'متاجر رفيق للملابس والأزياء', receipt_footer: 'شكراً لاختياركم متجرنا! الاستبدال خلال 14 يوماً مع وجود كارت الصنف والباركود.' }
  },
  {
    id: 'general_grocery',
    name: 'بقالة ومحل تجاري عام',
    description: 'إعداد عام متوازن يناسب كافة المحلات والأنشطة التجارية المتنوعة',
    icon: 'store',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: ['عام', 'أغذية ومشروبات', 'منظفات', 'حلويات وتسالي', 'دخان وسجائر'],
    quickItems: [
      { Name: 'كيس تسوق', PricePiasters: 100, Unit: 'piece', CategoryName: 'عام', IsOpenPrice: false },
      { Name: 'ولاعة عادية', PricePiasters: 500, Unit: 'piece', CategoryName: 'دخان وسجائر', IsOpenPrice: false },
      { Name: 'علبة كبريت', PricePiasters: 100, Unit: 'piece', CategoryName: 'عام', IsOpenPrice: false },
      { Name: 'مياه صغيرة 500 مل', PricePiasters: 500, Unit: 'piece', CategoryName: 'أغذية ومشروبات', IsOpenPrice: false },
      { Name: 'شيبسي عائلي', PricePiasters: 1500, Unit: 'piece', CategoryName: 'حلويات وتسالي', IsOpenPrice: false },
    ],
    productsCount: 47,
    defaultSettings: { receipt_header: 'أهلاً بكم في متجرنا', receipt_footer: 'شكراً لتعاملكم معنا' }
  }
];
