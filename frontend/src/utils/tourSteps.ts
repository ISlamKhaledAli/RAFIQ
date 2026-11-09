// Guided tour content. Pure data plus the visibility rules, so it can be tested under node strip-types.
// Every screen name below is the exact label shown in the app (App.tsx navigation, settings tabs, shortcuts guide) and
// every visibility rule mirrors the permission/feature checks App.tsx uses for the same screen, so the tour never
// points a user at a menu he cannot see.
import { getAllowedSettingsSubTabs } from './settingsAccess.ts';
import { getHeaderVisibility } from './headerVisibility.ts';
import type { RoleSubject } from './roleLabels.ts';

export type TourIconName =
  | 'Compass'
  | 'ShoppingCart'
  | 'Banknote'
  | 'FileText'
  | 'Users'
  | 'Package'
  | 'Truck'
  | 'Wallet'
  | 'Clock'
  | 'BarChart3'
  | 'ShieldCheck'
  | 'Settings'
  | 'HardDrive'
  | 'Pill'
  | 'UtensilsCrossed';

export interface TourAccess {
  user: RoleSubject | null | undefined;
  isRoot: boolean;
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  isEnabled: (feature: string) => boolean;
}

export interface TourShortcut {
  keys: string;
  label: string;
}

export interface TourSentence {
  text: string;
  when?: (access: TourAccess) => boolean;
}

export interface TourStepDefinition {
  id: string;
  title: string;
  icon: TourIconName;
  /** The exact name of the screen or menu where the feature lives. */
  where: string;
  sentences: TourSentence[];
  shortcut?: TourShortcut;
  when?: (access: TourAccess) => boolean;
}

export interface TourStep {
  id: string;
  title: string;
  icon: TourIconName;
  where: string;
  sentences: string[];
  shortcut?: TourShortcut;
}

const can = (access: TourAccess, ...permissions: string[]): boolean =>
  access.isRoot || permissions.some((permission) => access.hasPermission(permission));

const canPos = (a: TourAccess) => can(a, 'pos.access', 'pos');
const canCustomers = (a: TourAccess) => can(a, 'customers.view', 'customers');
const canProducts = (a: TourAccess) => can(a, 'products.view', 'products');
const canPurchases = (a: TourAccess) => can(a, 'purchases.view');
const canSales = (a: TourAccess) => can(a, 'invoices.view');
const canDashboard = (a: TourAccess) => can(a, 'reports.sales', 'reports');
const canWallets = (a: TourAccess) =>
  can(a, 'wallets.access', 'wallets') && (a.isEnabled('feature_pos_digital_payments') || a.isEnabled('feature_digital_wallets'));
const canEpay = (a: TourAccess) => can(a, 'epay.access', 'epay') && a.isEnabled('feature_epay_services');
const canInsurance = (a: TourAccess) =>
  (a.isAdmin || can(a, 'insurance.manage_contracts', 'insurance.claims.manage')) && a.isEnabled('feature_insurance');
const canOpenShift = (a: TourAccess) => a.hasPermission('shifts.view') || a.hasPermission('shifts.open');
const settingsTabs = (a: TourAccess) => getAllowedSettingsSubTabs({ isRoot: a.isRoot, isAdmin: a.isAdmin, hasPermission: a.hasPermission });
const canManageStaff = (a: TourAccess) =>
  getHeaderVisibility({ user: a.user, canOpenShiftPanel: false, canManageUsers: a.hasPermission('users.view'), canViewProducts: false, canUpdateApp: false }).showEmployees;

export const TOUR_STEP_DEFINITIONS: readonly TourStepDefinition[] = [
  {
    id: 'start',
    title: 'ابدأ من هنا: القوائم والمساعدة',
    icon: 'Compass',
    where: 'القائمة الجانبية والشريط العلوي',
    sentences: [
      { text: 'القائمة الجانبية تعرض الشاشات التي تسمح بها صلاحيات حسابك فقط، وللتنقل السريع اضغط Alt مع رقم الشاشة.' },
      { text: 'زر القمر في الشريط العلوي يبدّل بين الوضع النهاري والليلي، وحجم الخط يتغير من قائمة اسمك.' },
      { text: 'لأي سؤال افتح «مركز المساعدة والدعم» من أسفل القائمة الجانبية.' },
    ],
    shortcut: { keys: 'F1', label: 'الرجوع لشاشة البيع من أي شاشة' },
  },
  {
    id: 'pos-sell',
    title: 'البيع من شاشة الكاشير',
    icon: 'ShoppingCart',
    where: 'الكاشير وشاشة البيع',
    when: canPos,
    sentences: [
      { text: 'امسح الباركود أو اكتب جزءاً من اسم الصنف ثم اضغط Enter ليدخل السلة.' },
      { text: 'F3 يفتح كمية أو وزن آخر صنف، وCtrl + Z يرجّع صنفاً حذفته بالخطأ.' },
      { text: 'امسح ملصق الميزان ليدخل الصنف بوزنه وسعره تلقائياً.', when: (a) => a.isEnabled('feature_scale_weight') },
      { text: 'للملابس والأحذية تظهر نافذة اختيار المقاس واللون المتاح في المخزن.', when: (a) => a.isEnabled('feature_matrix_variants') },
    ],
    shortcut: { keys: 'F2', label: 'العودة لخانة البحث والباركود' },
  },
  {
    id: 'pos-pay',
    title: 'الدفع والباقي والمرتجع',
    icon: 'Banknote',
    where: 'الكاشير وشاشة البيع',
    when: canPos,
    sentences: [
      { text: 'F9 يفتح الدفع النقدي ويحسب الباقي للزبون، وF12 يقفل الفاتورة كاش مباشرة ويطبع الإيصال.' },
      { text: 'لو دفع الزبون جزءاً فقط، اختر زبوناً مسجلاً وسجّل الباقي على حسابه آجلاً، ولا يتجاوز حده الائتماني إلا بتأكيد مدير.' },
      { text: 'F6 يعلّق الفاتورة لخدمة زبون آخر ثم يسترجعها.' },
      { text: 'F11 يفتح المرتجع ويحسب المبلغ المسترد.', when: (a) => a.isAdmin || a.hasPermission('returns.create') },
    ],
    shortcut: { keys: 'F12', label: 'بيع كاش فوري وطباعة الإيصال' },
  },
  {
    id: 'sales',
    title: 'سجل وفواتير البيع',
    icon: 'FileText',
    where: 'سجل وفواتير البيع',
    when: canSales,
    sentences: [
      { text: 'تستعرض فيها فواتير الأيام السابقة وتعيد طباعة نسخة أي فاتورة.' },
      { text: 'الفاتورة لا تُمسح من البرنامج، والتصحيح يكون بمرتجع كلي أو جزئي يظهر في سجلها.' },
    ],
  },
  {
    id: 'customers',
    title: 'العملاء وحسابات الشكك',
    icon: 'Users',
    where: 'العملاء وحسابات الشكك',
    when: canCustomers,
    sentences: [
      { text: 'سجّل عملاءك بأرقام هواتفهم وحدد لكل عميل حداً ائتمانياً للبيع الآجل.' },
      { text: 'زر «سداد» يسجل دفعة من دين العميل، و«كشف حساب العميل» يعرض حركاته ويطبعه.' },
    ],
  },
  {
    id: 'products',
    title: 'الأصناف والمخزن',
    icon: 'Package',
    where: 'الأصناف والمخزن',
    when: canProducts,
    sentences: [
      { text: 'في «كتالوج الأصناف والأسعار» سجّل سعر البيع وتكلفة الشراء بالجنيه المصري، أو استورد أصنافك دفعة واحدة من ملف إكسل.' },
      { text: 'حركات المخزن تُسجّل تلقائياً مع كل بيع وشراء، وتسوّي الجرد من «حركات وجرد المخزن».' },
      { text: 'راجع «تواريخ الصلاحية والدفعات» لمعرفة ما قرب انتهاؤه.', when: (a) => a.isEnabled('feature_expiry_dates') },
    ],
  },
  {
    id: 'purchases',
    title: 'فواتير الشراء والموردين',
    icon: 'Truck',
    where: 'فواتير الشراء والموردين',
    when: canPurchases,
    sentences: [
      { text: 'سجّل البضاعة المستلمة من «فاتورة شراء واستلام بضاعة» فيزيد المخزن وتتحدث تكلفة الصنف.', when: (a) => a.hasPermission('purchases.create') },
      { text: 'سدّد للمورد دفعة كاملة أو جزئية وتابع ما عليك له من «دليل وحسابات الموردين».', when: (a) => a.hasPermission('suppliers.manage') },
      { text: 'سجّل الأصناف الناقصة في «دفتر النواقص والطلبيات»، أو بسرعة من شاشة البيع بـ Ctrl + Q.', when: (a) => a.hasPermission('shortage.view') },
      { text: 'تتابع في «سجل فواتير الشراء والمردودات» فواتير الشراء وحالة سدادها.' },
    ],
  },
  {
    id: 'wallets-epay',
    title: 'المحافظ وخدمات الدفع',
    icon: 'Wallet',
    where: 'المحافظ وإنستاباي، وخدمات وماكينات الدفع',
    when: (a) => canWallets(a) || canEpay(a),
    sentences: [
      { text: 'في «المحافظ وإنستاباي» تتابع أرصدة المحافظ وحساباتها وسجل عملياتها.', when: canWallets },
      { text: 'في «خدمات وماكينات الدفع» تنفذ الخدمات المدفوعة وتتابع أرصدة الماكينات وأرباحها.', when: canEpay },
    ],
  },
  {
    id: 'shift-closing',
    title: 'الوردية والمصروفات وتقفيل اليومية',
    icon: 'Clock',
    where: 'الشريط العلوي، والمتابعة والتقارير',
    when: (a) => canOpenShift(a) || a.hasPermission('expenses.create') || (canDashboard(a) && a.hasPermission('reports.daily_closing')),
    sentences: [
      { text: 'ابدأ يومك بزر «فتح وردية» في الشريط العلوي، واكتب النقدية الموجودة في الدرج، وأغلق الوردية بعد مطابقتها.', when: canOpenShift },
      { text: 'سجّل أي مصروف بزر «تسجيل مصروف» بدل أن تأخذه من الدرج بلا قيد.', when: (a) => a.hasPermission('expenses.create') },
      { text: 'في آخر اليوم اضغط «تقفيل اليومية» من «لوحة اليوم والوردية» لمطابقة كاش الدرج واعتماد اليومية.', when: (a) => canDashboard(a) && a.hasPermission('reports.daily_closing') },
    ],
  },
  {
    id: 'reports',
    title: 'المتابعة والتقارير',
    icon: 'BarChart3',
    where: 'المتابعة والتقارير',
    when: canDashboard,
    sentences: [
      { text: 'تضم أربع صفحات: «لوحة اليوم والوردية» و«حساب الإيرادات والأرباح» و«حركة المخزن والتوالف» و«تحليلات العملاء والديون».' },
      { text: 'ابدأ بلوحة اليوم لتعرف مبيعات يومك، وارجع لبقية الصفحات لمتابعة الأرباح والمخزن وديون العملاء.' },
    ],
  },
  {
    id: 'staff',
    title: 'الموظفون والصلاحيات',
    icon: 'ShieldCheck',
    where: 'المزيد، ثم الموظفون والصلاحيات',
    when: canManageStaff,
    sentences: [
      { text: 'أضف حساباً لكل موظف وحدد صلاحياته بدقة، فلا يرى الكاشير إلا ما سمحت له به.' },
      { text: 'ترتيب الحسابات: المطور ثم المالك ثم المدير ثم الكاشير، ولا يدير الحساب إلا من هو أعلى منه.' },
      { text: 'لا تشارك حسابك مع غيرك، فالعمليات الحساسة تُسجّل باسم من نفّذها.' },
    ],
  },
  {
    id: 'settings',
    title: 'إعدادات المحل والطابعة',
    icon: 'Settings',
    where: 'إعدادات المحل والسيستم',
    when: (a) => settingsTabs(a).length > 0,
    sentences: [
      { text: 'اكتب اسم المحل وبياناته التي تظهر على الإيصال من «بيانات المحل والفاتورة».', when: (a) => settingsTabs(a).includes('profile') },
      { text: 'تحدد «سياسات البيع والمخزون» قواعد مثل «السماح بالبيع بالسالب».', when: (a) => settingsTabs(a).includes('policies') },
      { text: 'من «إعدادات الطابعة والورق» اختر طابعة الإيصالات ومقاس الورق، وجرّب فتح الدرج، وراجع «الأجهزة والطابعات المعتمدة».', when: (a) => settingsTabs(a).includes('printer') },
    ],
  },
  {
    id: 'backup',
    title: 'النسخ الاحتياطي ونقل البرنامج',
    icon: 'HardDrive',
    where: 'إعدادات المحل والسيستم، ثم النسخ الاحتياطي',
    when: (a) => settingsTabs(a).includes('backup'),
    sentences: [
      { text: 'اختر مكان الحفظ (يفضل فلاشة USB) وفعّل النسخ عند قفل البرنامج والنسخ اليومي التلقائي.' },
      { text: 'لو انفصلت الفلاشة يحفظ البرنامج في مجلد آمن داخل الجهاز حتى لا يتوقف البيع.' },
      { text: 'لنقل المحل إلى جهاز جديد استخدم «نقل لجهاز جديد»، وخذ نسخة قبل أي تغيير كبير.' },
    ],
  },
  {
    id: 'pharmacy',
    title: 'الصيدلية والتأمين الطبي',
    icon: 'Pill',
    where: 'الكاشير وشاشة البيع',
    when: (a) => a.isEnabled('feature_pharmacy') && (canPos(a) || canInsurance(a)),
    sentences: [
      { text: 'F8 في شاشة البيع يعرض بدائل الدواء الناقص بنفس المادة الفعالة مع السعر والمخزون.', when: canPos },
      { text: 'تجد شركات التأمين وعقودها ومطالباتها في «التأمين الطبي والتعاقدات».', when: canInsurance },
    ],
  },
  {
    id: 'cafe',
    title: 'الكافيه والمطعم',
    icon: 'UtensilsCrossed',
    where: 'الكاشير وشاشة البيع',
    when: (a) => a.isEnabled('feature_cafe_restaurant') && canPos(a),
    sentences: [
      { text: 'اختر نوع الطلب من أعلى شاشة البيع: «صالة (طاولات)» أو «تيك أواي (سفري)» أو «دليفري (توصيل)».' },
      { text: 'في الصالة اختر الطاولة من «خريطة الصالة وإدارة الطاولات» قبل إضافة الأصناف.', when: (a) => a.isEnabled('feature_table_management') },
      { text: 'تُطبع تذكرة التحضير للمطبخ والبار بدون أسعار.', when: (a) => a.isEnabled('feature_kitchen_printer') },
    ],
  },
];

/** The steps this user should see: modules appear only when enabled, and every sentence only when its screen is reachable. */
export function getVisibleTourSteps(access: TourAccess): TourStep[] {
  const steps: TourStep[] = [];
  for (const definition of TOUR_STEP_DEFINITIONS) {
    if (definition.when && !definition.when(access)) continue;
    const sentences = definition.sentences.filter((s) => !s.when || s.when(access)).map((s) => s.text);
    if (sentences.length === 0) continue;
    steps.push({
      id: definition.id,
      title: definition.title,
      icon: definition.icon,
      where: definition.where,
      sentences,
      shortcut: definition.shortcut,
    });
  }
  return steps;
}

