// Permission editor catalogue. Pure data (no React) so it can be unit-tested; every key must exist in
// desktop/Services/SecurityService.cs ALL_PERMISSIONS. Keys reserved for the owner/root (settings.features,
// audit_log.view, users.delegate, pharma.controlled.view_full) are intentionally NOT listed. The three owner-grade
// keys live in the `owner_grade` group, which only the manager editor shows and the cashier editor never does.

export type PermissionIconId =
  | 'cart'
  | 'pricing'
  | 'shifts'
  | 'invoices'
  | 'customers'
  | 'products'
  | 'stock'
  | 'purchases'
  | 'expenses'
  | 'epay'
  | 'wallets'
  | 'reports'
  | 'settings'
  | 'users'
  | 'pharma'
  | 'insurance'
  | 'patients'
  | 'cafe'
  | 'ownerGrade';

export type PermissionFeatureFlag =
  | 'feature_pharmacy'
  | 'feature_insurance'
  | 'feature_patient_profiles'
  | 'feature_epay_services'
  | 'feature_digital_wallets'
  | 'feature_cafe_restaurant';

export interface PermissionItem {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroupDef {
  id: string;
  name: string;
  icon: PermissionIconId;
  /** When set, the group is shown only while this store feature is enabled. */
  feature?: PermissionFeatureFlag;
  /** Owner-grade group: edited only on a manager account, never in the cashier matrix. */
  ownerGrade?: boolean;
  items: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroupDef[] = [
  {
    id: 'pos',
    name: 'نقطة البيع',
    icon: 'cart',
    items: [
      { key: 'pos.access', label: 'دخول شاشة البيع', description: 'السماح بفتح شاشة البيع وإجراء عمليات الكاشير' },
      { key: 'pos.sell', label: 'إتمام عمليات البيع', description: 'حفظ الفاتورة وقبض القيمة وطباعة الإيصال' },
      { key: 'pos.hold_invoice', label: 'تعليق واسترجاع الفواتير', description: 'تعليق الطلبات في الوردية واستئنافها لاحقاً' },
      { key: 'pos.reprint', label: 'إعادة طباعة الفاتورة', description: 'إعادة طباعة إيصالات العمليات السابقة' },
      { key: 'pos.quick_add', label: 'إضافة صنف سريع', description: 'إضافة بند مباشر بدون كود مسبق' },
      { key: 'pos.void_line', label: 'حذف سطر من الفاتورة', description: 'حذف منتج تم إدخاله في الفاتورة الحالية' },
      { key: 'pos.change_unit', label: 'تبديل وحدة البيع بالكاشير', description: 'السماح بالتبديل السريع بين العلبة والشريط والقرص أثناء البيع (مفتاح /)' },
      { key: 'pos.select_batch', label: 'اختيار تشغيلة/دفعة الصنف يدوياً', description: 'السماح للكاشير باختيار تشغيلة معينة بدلاً من صرف الأقرب للصلاحية تلقائياً' },
    ],
  },
  {
    id: 'pricing',
    name: 'الخصومات والأسعار',
    icon: 'pricing',
    items: [
      { key: 'pos.discount_line', label: 'خصم على صنف', description: 'إمكانية إعطاء خصم على صنف معين' },
      { key: 'pos.discount_invoice', label: 'خصم على الفاتورة', description: 'إمكانية إعطاء خصم إجمالي على الفاتورة' },
      { key: 'pos.discount_unlimited', label: 'تجاوز حد الخصم', description: 'إمكانية إعطاء خصومات تفوق النسبة المحددة للمحل' },
      { key: 'pos.price_override', label: 'تعديل السعر يدوياً', description: 'تغيير سعر بيع الصنف مباشرة أثناء البيع' },
    ],
  },
  {
    id: 'shifts',
    name: 'الورديات والدرج',
    icon: 'shifts',
    items: [
      { key: 'shifts.view', label: 'الاطلاع على الوردية وسجل الدرج', description: 'السماح بالاطلاع على تفاصيل الوردية الحالية والسابقة وحركات النقدية' },
      { key: 'shifts.open', label: 'فتح وردية جديدة واستلام الدرج', description: 'السماح بفتح وردية عمل جديدة وإدخال العهدة الافتتاحية' },
      { key: 'shifts.close', label: 'إغلاق وتشميع الوردية وتسليم النقدية', description: 'السماح بإغلاق الوردية وإدخال النقد الفعلي بالدرج واحتساب العجز والزيادة' },
      { key: 'shifts.cash_in', label: 'تغذية نقدية للدرج', description: 'إضافة مبالغ نقدية كفكة أو عهدة إضافية للدرج' },
      { key: 'shifts.cash_out', label: 'سحب نقدي من الدرج', description: 'سحب مبالغ نقدية من الدرج لتوريدها للخزينة الرئيسية' },
    ],
  },
  {
    id: 'invoices',
    name: 'الفواتير والمرتجعات',
    icon: 'invoices',
    items: [
      { key: 'invoices.view', label: 'عرض سجل الفواتير', description: 'استعراض فواتير المبيعات السابقة' },
      { key: 'invoices.cancel', label: 'إلغاء الفواتير', description: 'إلغاء فاتورة مسجلة ورد البضاعة للمخزن' },
      { key: 'returns.create', label: 'عمل مرتجع بفاتورة', description: 'استرجاع بضاعة استناداً لرقم فاتورة أصلية' },
      { key: 'returns.without_invoice', label: 'مرتجع بدون فاتورة', description: 'استرجاع بضاعة نقدية بدون توفر الفاتورة الأصلية' },
    ],
  },
  {
    id: 'customers',
    name: 'العملاء والآجل',
    icon: 'customers',
    items: [
      { key: 'customers.view', label: 'عرض العملاء', description: 'استعراض بيانات العملاء وأرقام هواتفهم' },
      { key: 'customers.create', label: 'إضافة عميل جديد', description: 'تسجيل عميل جديد وفتح ملف حساب' },
      { key: 'customers.edit', label: 'تعديل بيانات العميل', description: 'تعديل الهاتف وسقف المديونية والاسم' },
      { key: 'customers.ledger', label: 'كشف حساب العميل', description: 'استعراض سجل المعاملات والديون السابقة' },
      { key: 'customers.payment', label: 'سداد دفعة / قبض دين', description: 'تسجيل تحصيل مالي من العميل وتوريده للخزينة' },
      { key: 'customers.payment_cancel', label: 'إلغاء سند قبض', description: 'إلغاء دفعة مسجلة للعميل' },
      { key: 'customers.credit_sale', label: 'البيع الآجل', description: 'إمكانية إتمام فواتير بيع بالآجل على الحساب' },
      { key: 'customers.credit_limit', label: 'تحديد وتعديل الحد الائتماني', description: 'صلاحية تغيير الحد الأقصى للمديونية المسموحة للعميل' },
      { key: 'customers.opening_balance', label: 'إدخال الرصيد الافتتاحي للعميل', description: 'صلاحية تحديد رصيد سابق للعميل عند فتح الحساب' },
      { key: 'customers.credit_limit_override', label: 'تجاوز الحد الائتماني', description: 'السماح بإتمام فواتير آجل تتجاوز سقف الدين المحدد' },
    ],
  },
  {
    id: 'products',
    name: 'الأصناف',
    icon: 'products',
    items: [
      { key: 'products.view', label: 'عرض الأصناف', description: 'استعراض قائمة المنتجات وأسعار البيع' },
      { key: 'products.create', label: 'إضافة صنف جديد', description: 'إدخال منتج جديد وتعيين باركود وسعر' },
      { key: 'products.edit', label: 'تعديل بيانات الأصناف', description: 'تعديل الاسم والباركود والوحدات' },
      { key: 'products.packaging.edit', label: 'تعديل منظومة التعبئة والتجزئة', description: 'السماح بتعريف وإدارة مستويات العبوات والبيع المفكوك' },
      { key: 'products.unit_rebase', label: 'إعادة التأسيس الذري للوحدات', description: 'السماح بتحويل الوحدة الأساسية للصنف ومضاعفة الرصيد والتشغيلات' },
      { key: 'products.edit_price', label: 'تعديل سعر البيع', description: 'تعديل سعر البيع القطاعي والجملة' },
      { key: 'products.edit_cost', label: 'الاطلاع وتعديل التكلفة', description: 'رؤية سعر الشراء الحقيقي وتعديله' },
      { key: 'products.archive', label: 'أرشفة / حذف صنف', description: 'تعطيل أو حذف صنف من المنظومة' },
      { key: 'products.clear_all', label: 'تصفير وأرشفة كافة الأصناف', description: 'صلاحية حساسة لأرشفة كافة أصناف المحل دفعة واحدة' },
      { key: 'products.import', label: 'استيراد من إكسل', description: 'رفع ملفات إكسل لإضافة وتحديث المنتجات' },
      { key: 'products.export', label: 'تصدير المخزون', description: 'تصدير بيانات الأصناف والمخزون لملفات خارجية' },
      { key: 'categories.manage', label: 'إدارة التصنيفات', description: 'إضافة وتعديل أقسام المنتجات' },
    ],
  },
  {
    id: 'stock',
    name: 'المخزون',
    icon: 'stock',
    items: [
      { key: 'stock.view', label: 'عرض كميات المخزون', description: 'الاطلاع على الجرد والأرصدة الحالية' },
      { key: 'stock.adjust', label: 'تسوية الجرد والمخزن', description: 'تعديل الكميات يدوياً بعد الجرد الفعلي' },
      { key: 'stock.movement_log', label: 'سجل حركة المخزون', description: 'متابعة كارت الصنف وتقرير حركاته' },
      { key: 'inventory.locations.manage', label: 'إدارة مواقع التخزين والرفوف والأدراج', description: 'إضافة وتعديل وحذف أماكن التخزين وطباعة باركود الرفوف وتوليد مسودات الجرد' },
    ],
  },
  {
    id: 'purchases',
    name: 'المشتريات والموردين والنواقص',
    icon: 'purchases',
    items: [
      { key: 'purchases.view', label: 'عرض المشتريات', description: 'استعراض فواتير التوريد من الموردين' },
      { key: 'purchases.create', label: 'تسجيل فاتورة شراء', description: 'إضافة وارد بضاعة وتحديث التكلفة والأرصدة' },
      { key: 'suppliers.manage', label: 'إدارة الموردين', description: 'إضافة الموردين ومتابعة كشوف حساباتهم وسدادهم' },
      { key: 'shortage.view', label: 'الاطلاع على دفتر النواقص', description: 'السماح باستعراض النواقص ومقترحات الطلبيات وتقارير المبيعات المفقودة' },
      { key: 'shortage.manage', label: 'تسجيل وإدارة النواقص', description: 'السماح بتسجيل نواقص جديدة يدوياً وتعديل حالتها وحذفها' },
      { key: 'shortage.convert_to_purchase', label: 'تحويل النواقص لطلبيات شراء', description: 'السماح بتجميع النواقص وتحويلها لأوامر شراء مقترحة ومسودات فواتير توريد' },
    ],
  },
  {
    id: 'expenses',
    name: 'المصروفات',
    icon: 'expenses',
    items: [
      { key: 'expenses.view', label: 'عرض المصروفات', description: 'استعراض قيود الصرف وسجلات الخزينة' },
      { key: 'expenses.create', label: 'تسجيل مصروف جديد', description: 'سحب مبالغ من الدرج أو الخزينة وتسجيل البند والسبب' },
      { key: 'expenses.edit', label: 'تعديل بنود المصروفات', description: 'تعديل مبالغ وتفاصيل قيود الصرف المسجلة' },
      { key: 'expenses.delete', label: 'حذف قيود المصروفات', description: 'حذف قيود الصرف المالي وتوثيق السبب في سجل التدقيق' },
    ],
  },
  {
    id: 'epay',
    name: 'خدمات وماكينات الدفع الإلكتروني',
    icon: 'epay',
    feature: 'feature_epay_services',
    items: [
      { key: 'epay.access', label: 'دخول خدمات وماكينات الدفع', description: 'السماح بفتح قسم الدفع والخدمات الإلكترونية' },
      { key: 'epay.transact', label: 'تنفيذ عمليات الدفع وشحن الرصيد', description: 'تسجيل ودفع فواتير، كروت شحن، تحويل محافظ' },
      { key: 'epay.fund', label: 'تغذية وشحن رصيد الماكينات', description: 'إضافة وشحن رصيد لماكينات الدفع من الدرج أو البنك' },
      { key: 'epay.terminals_manage', label: 'إدارة وضبط ماكينات الدفع', description: 'إضافة وتعديل بيانات الماكينات وحساباتها والعمولات الافتراضية' },
      { key: 'epay.history', label: 'سجل العمليات والإيصالات', description: 'الاطلاع على أرشيف عمليات الدفع والإيصالات المطبوعة' },
      { key: 'epay.analytics', label: 'الاطلاع على أرباح وتحليلات الماكينات', description: 'عرض تقارير صافي الربح وعمولات الشركات المستقلة' },
      { key: 'epay.cancel', label: 'إلغاء واسترجاع عمليات الدفع', description: 'إلغاء عملية دفع إلكتروني مسجلة واسترجاع رصيد الماكينة تلقائياً' },
      { key: 'epay.balance_adjust', label: 'تسوية رصيد الماكينة يدوياً', description: 'تعديل رصيد الماكينة مع إلزام ذكر السبب وتوثيقه في السجل' },
    ],
  },
  {
    id: 'wallets',
    name: 'المحافظ الإلكترونية وإنستاباي',
    icon: 'wallets',
    feature: 'feature_digital_wallets',
    items: [
      { key: 'wallets.access', label: 'دخول شاشة المحافظ وإنستاباي', description: 'السماح بفتح قسم المحافظ وإنستاباي وإجراء العمليات' },
      { key: 'wallets.transact', label: 'تنفيذ عمليات السحب والإيداع', description: 'تسجيل عمليات سحب كاش وإيداع مع تحديد الربح والمبلغ' },
      { key: 'wallets.fund', label: 'تغذية وشحن أرصدة المحافظ', description: 'إيداع وشحن رصيد جديد للمحافظ وإنستاباي من الدرج أو البنك' },
      { key: 'wallets.accounts_manage', label: 'إدارة وتعديل المحافظ والحسابات', description: 'إضافة وتعديل بيانات المحافظ وأرقام الهواتف والحدود الشهرية' },
      { key: 'wallets.history', label: 'سجل حركات وعمليات المحافظ', description: 'الاطلاع على سجل المعاملات والإيصالات لكل محفظة' },
      { key: 'wallets.analytics', label: 'أرباح وتحليلات المحافظ وإنستاباي', description: 'الاطلاع على إجمالي الأرصدة وصافي أرباح العمليات المباشرة' },
      { key: 'wallets.balance_adjust', label: 'تسوية رصيد المحفظة يدوياً', description: 'تعديل رصيد المحفظة مع إلزام ذكر السبب وتوثيقه في السجل' },
      { key: 'wallets.cancel', label: 'إلغاء عملية محفظة', description: 'إلغاء معاملة محفظة أو إنستاباي وتصحيح الرصيد' },
    ],
  },
  {
    id: 'reports',
    name: 'التقارير',
    icon: 'reports',
    items: [
      { key: 'reports.sales', label: 'تقارير المبيعات', description: 'استعراض تقارير فواتير المبيعات وحركة الأصناف' },
      { key: 'reports.profit', label: 'تقارير الأرباح والخسائر', description: 'الاطلاع على هامش وصافي الربح المالي' },
      { key: 'reports.inventory', label: 'تقييم المخزون المالي', description: 'قيمة البضاعة بسعر التكلفة والبيع' },
      { key: 'reports.customers', label: 'تقرير مديونيات العملاء', description: 'إجمالي الديون المعلقة وأعمار الديون' },
      { key: 'reports.cashier', label: 'تقرير أداء الكاشير', description: 'مبيعات وإيرادات كل موظف على حدة' },
      { key: 'reports.daily_closing', label: 'إقفال الوردية واليومية', description: 'إجراء تقفيل الصندوق واليومية' },
    ],
  },
  {
    id: 'settings',
    name: 'الإعدادات',
    icon: 'settings',
    items: [
      { key: 'settings.store', label: 'بيانات المحل والفاتورة', description: 'تعديل اسم المحل والهاتف وترويسة الإيصال' },
      { key: 'settings.printer', label: 'إعدادات الطابعات', description: 'ضبط طابعة الإيصالات وهوامش الطباعة' },
      { key: 'settings.barcode', label: 'إعدادات الباركود والميزان', description: 'ضبط الباركود وقارئ الميزان الإلكتروني' },
      { key: 'settings.backup', label: 'النسخ الاحتياطي', description: 'تصدير نسخة احتياطية من قاعدة البيانات' },
    ],
  },
  {
    id: 'users',
    name: 'المستخدمون',
    icon: 'users',
    items: [
      { key: 'users.view', label: 'استعراض شجرة الموظفين', description: 'رؤية الهيكل الإداري والحسابات التابعة' },
      { key: 'users.create', label: 'إضافة حسابات الموظفين', description: 'إضافة حسابات جديدة تحت إشراف الحساب' },
      { key: 'users.edit', label: 'تعديل بيانات الحسابات', description: 'تعديل أسماء وأدوار الحسابات التابعة' },
      { key: 'users.reset_pin', label: 'تغيير الرقم السري', description: 'إعادة ضبط أرقام الدخول للحسابات التابعة' },
      { key: 'users.deactivate', label: 'تفعيل وتعطيل الحسابات', description: 'إيقاف الحسابات التابعة وتفعيلها' },
    ],
  },
  {
    id: 'pharma',
    name: 'المنظومة الدوائية والبدائل',
    icon: 'pharma',
    feature: 'feature_pharmacy',
    items: [
      { key: 'pharma.drug_info.edit', label: 'تعديل البيانات الدوائية والمواد الفعالة', description: 'السماح بتعديل الاسم العلمي والأشكال الدوائية والجرعات والمواد الفعالة للصنف' },
      { key: 'pharma.alternatives.view', label: 'استعراض البدائل والمثائل الدوائية', description: 'السماح بفتح محرك البدائل في شاشة البيع واقتراح المثائل والبدائل للعميل (F8)' },
      { key: 'pharma.controlled.dispense', label: 'صرف أدوية الجدول والرقابة', description: 'السماح بصرف أدوية الجدول والمهدئات وتوثيق بيانات المريض والطبيب والروشتة' },
      { key: 'pharma.controlled.approve', label: 'اعتماد وموافقة صرف الجدول (صيدلي مشرف)', description: 'صلاحية الصيدلي المشرف لاعتماد صرف أدوية الجدول وإدخال الرقم السري' },
      { key: 'pharma.controlled.register_view', label: 'استعراض دفتر التفتيش الصيدلي', description: 'الاطلاع على دفتر أدوية الجدول والرقابة والرصيد التراكمي وطباعته A4' },
      { key: 'prescriptions.manage', label: 'إدارة وأرشفة الروشتات الطبية', description: 'أرشفة الروشتات وإرفاق الصور الطبية والبحث في السجل الطبي للمرضى' },
      { key: 'pharma.expiry_returns.manage', label: 'إدارة مرتجعات الصلاحية ومحاضر الإعدام', description: 'السماح بفحص نوافذ إرجاع الأدوية للموردين وتحويلها لمرتجع واعتماد محاضر إعدام البضاعة المنتهية' },
      { key: 'pharma.drug_reference.import', label: 'استيراد وتحديث دليل الأدوية المرجعي', description: 'السماح باستيراد ومطابقة ملفات إكسل الدليل المرجعي الخارجي وتحديث الأسعار الرسمية' },
      { key: 'pharma.stocktaking.manage', label: 'الجرد الصيدلي المتقدم والتسويات', description: 'السماح بجرد الصيدلية حسب الرف والتشغيلة وإدخال الكميات المركبة واعتماد فروق الجرد' },
      { key: 'pharma.dosage_labels.print', label: 'طباعة ملصقات الجرعات الطبية', description: 'السماح بطباعة ملصقات تعليمات الجرعة والاستخدام الحرارية لعبوات المرضى' },
      { key: 'pharma.ddi.manage', label: 'إدارة واستيراد جدول التفاعلات الدوائية', description: 'السماح بإضافة وتعديل وحذف التفاعلات الدوائية واستيرادها من الإكسل' },
      { key: 'pharma.ddi.override', label: 'تجاوز تحذيرات التفاعلات الدوائية الحرجة', description: 'صلاحية الصيدلي المشرف لتجاوز منع الصرف للتفاعلات الخطيرة وإدخال الرقم السري' },
      { key: 'reports.pharma.view', label: 'تقارير الصيدلية وخريطة الصلاحيات', description: 'الاطلاع على خريطة الصلاحيات الشهرية بالأدوية الراكدة وأرباح الشركات والمواد الفعالة' },
    ],
  },
  {
    id: 'insurance',
    name: 'التأمين الطبي والتعاقدات ومطالبات الشركات',
    icon: 'insurance',
    feature: 'feature_insurance',
    items: [
      { key: 'insurance.manage_contracts', label: 'إدارة شركات وعقود التأمين', description: 'إضافة وتعديل وحذف شركات التأمين الطبي وبنود العقود ونسب التحمل وقوائم المستثنيات' },
      { key: 'insurance.sell', label: 'صرف روشتات التأمين للكاشير', description: 'السماح بصرف فواتير روشتات التأمين واحتساب نسبة تحمل المريض وحصة الشركة' },
      { key: 'insurance.claims.manage', label: 'إدارة ومطالبات التأمين الشهرية', description: 'تجميع الفواتير المعلقة في مطالبات شهرية رسمية وتصديرها إكسل للشركات' },
      { key: 'insurance.claims.settle', label: 'تسوية مطالبات التأمين والرفوضات', description: 'تسوية مبالغ المطالبات المعتمدة وتسجيل الرفوضات وترحيلها التلقائي للمصروفات' },
    ],
  },
  {
    id: 'patients',
    name: 'ملفات المرضى والأمراض المزمنة وتنبيهات الاستحقاق',
    icon: 'patients',
    feature: 'feature_patient_profiles',
    items: [
      { key: 'patients.view', label: 'استعراض الملف الطبي وتنبيهات الاستحقاق', description: 'الاطلاع على الملف الطبي للمريض والحساسية وتنبيهات مواعيد صرف العلاج الشهري' },
      { key: 'patients.edit', label: 'تعديل الملف الطبي وتسجيل الأدوية المزمنة', description: 'تعديل بيانات الحساسية والأمراض المزمنة وإضافة وحذف الأدوية الدورية للمريض' },
    ],
  },
  {
    id: 'cafe_restaurant',
    name: 'الكافيهات والمطاعم والدليفري والتصنيع',
    icon: 'cafe',
    feature: 'feature_cafe_restaurant',
    items: [
      { key: 'tables.view', label: 'استعراض خريطة الصالة والطاولات', description: 'فتح خريطة الصالة ومتابعة حالة الطاولات والطلبات المفتوحة' },
      { key: 'tables.manage_orders', label: 'فتح الطاولات وإدارة طلبات الصالة', description: 'فتح طاولة جديدة، إضافة الأصناف، وطباعة شيك المراجعة للضيوف' },
      { key: 'tables.transfer_merge', label: 'نقل ودمج الطاولات', description: 'نقل طلب طاولة لطاولة أخرى أو دمج حساب طاولتين معاً' },
      { key: 'tables.split_bill', label: 'تقسيم فاتورة الطاولة بالأصناف', description: 'فصل أصناف محددة من الطاولة لسدادها بشكل مستقل لكل ضيف' },
      { key: 'tables.configure_floor', label: 'تعديل تصميم الصالة والطاولات', description: 'إضافة وتعديل وحذف الطاولات والأقسام وسعة المقاعد' },
      { key: 'kot.print', label: 'إرسال وطباعة بون المطبخ والبار', description: 'إرسال الطلبات الجديدة أو المعدلة لطابعة المطبخ والبار' },
      { key: 'kot.configure', label: 'إعداد وتوجيه طابعات المطبخ والبار', description: 'تخصيص طابعات المطبخ والبار وربط الأقسام بها' },
      { key: 'modifiers.manage', label: 'إدارة مجموعات الإضافات والتخصيصات', description: 'إنشاء وتعديل مجموعات الإضافات (السكر، الحليب، الصوصات) وربطها بالأصناف' },
      { key: 'delivery.orders.manage', label: 'إدارة طلبات الدليفري وإسناد الطيارين', description: 'تسجيل طلبات التوصيل وإسنادها للطيارين وتحديث حالة التوصيل' },
      { key: 'delivery.riders.settle', label: 'تصفية عهدة الطيارين وتحصيل النقدية', description: 'استلام النقدية المحصلة من الطيارين وتقفيل حساباتهم في الدرج' },
      { key: 'delivery.zones_riders.configure', label: 'إدارة مناطق التوصيل وبيانات الطيارين', description: 'إضافة وتعديل مناطق التوصيل ورسومها وتسجيل بيانات الطيارين وعمولاتهم' },
      { key: 'recipes.manage', label: 'إدارة الرسبي ومكونات التصنيع', description: 'تعريف وتعديل مكونات التصنيع والهدر وطريقة خصم الخامات' },
      { key: 'recipes.produce', label: 'تسجيل أوامر الإنتاج والتصنيع المجمع', description: 'تنفيذ دورة إنتاج مجمعة لخصم الخامات وإضافة المنتج التام للمخزون' },
    ],
  },
  {
    id: 'owner_grade',
    name: 'صلاحيات خاصة بالمالك',
    icon: 'ownerGrade',
    ownerGrade: true,
    items: [
      { key: 'system.updates', label: 'تحديث البرنامج', description: 'فحص التحديثات وتنزيل ملف التثبيت' },
      { key: 'settings.restore', label: 'استعادة النسخ الاحتياطية ونقل البيانات', description: 'استرجاع نسخة احتياطية أو حزمة نقل فوق بيانات المحل الحالية' },
      { key: 'settings.license', label: 'إدارة ترخيص التشغيل', description: 'تفعيل الترخيص ونقله إلى جهاز آخر' },
    ],
  },
];

/** Groups of the cashier permission matrix (the owner-grade group is never part of it). */
export const CASHIER_PERMISSION_GROUPS: PermissionGroupDef[] = PERMISSION_GROUPS.filter((group) => !group.ownerGrade);

/** The manager editor shows only this group: managers hold every other administrative power by default. */
export const OWNER_GRADE_GROUP: PermissionGroupDef = PERMISSION_GROUPS.filter((group) => group.ownerGrade)[0];
