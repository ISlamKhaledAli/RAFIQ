// Content of the cashier hardware guide («دليل أجهزة الكاشير المعتمدة والمجربة»).
// Pure data so it can be audited under node strip-types. Entries with status 'untested' are generic requirement cards:
// they describe what Rafiq POS supports for a device type without naming a model that has not been tried.
// Screen names are the exact labels of the app (sidebar, settings tabs and buttons).

export type HardwareCategory = 'printer' | 'label' | 'scanner' | 'drawer' | 'scale' | 'power';
export type HardwareStatus = 'recommended' | 'certified' | 'untested';
export type HardwareConnection = 'USB' | 'LAN' | 'RJ11' | 'Bluetooth' | 'Windows' | 'Label' | 'Power';

export interface HardwareSpec {
  label: string;
  value: string;
  /** Latin technical values (driver names, codes) are rendered left-to-right. */
  ltr?: boolean;
}

export interface HardwareDevice {
  id: string;
  category: HardwareCategory;
  brand: string;
  model: string;
  type: string;
  status: HardwareStatus;
  connections: HardwareConnection[];
  /** Present for tried models only; generic requirement cards do not claim a Windows result. */
  windows?: { win7: boolean; win10_11: boolean };
  specs: HardwareSpec[];
  setupSteps: string[];
  notes: string;
}

export interface HardwareCategoryGuide {
  label: string;
  supports: string;
  connects: string;
  settings: string;
}

export const HARDWARE_CATEGORIES: readonly HardwareCategory[] = ['printer', 'label', 'scanner', 'drawer', 'scale', 'power'];

export const CONNECTION_LABELS: Record<HardwareConnection, string> = {
  USB: 'USB',
  LAN: 'LAN',
  RJ11: 'RJ11',
  Bluetooth: 'Bluetooth',
  Windows: 'تعريف ويندوز',
  Label: 'ملصق باركود',
  Power: 'كهرباء',
};

export const CONNECTION_HINTS: Record<HardwareConnection, string> = {
  USB: 'يوصل بكابل USB',
  LAN: 'يوصل بالشبكة المحلية',
  RJ11: 'يوصل بكابل RJ11 أو RJ12 بمنفذ الدرج في ظهر الطابعة',
  Bluetooth: 'اتصال لاسلكي Bluetooth',
  Windows: 'يعمل بعد تثبيت تعريفه في ويندوز واختياره من قائمة الطابعات',
  Label: 'لا يتصل برفيق مباشرة، وإنما يُقرأ ملصقه بقارئ الباركود',
  Power: 'مصدر كهرباء احتياطي للأجهزة',
};

export const STATUS_LABELS: Record<HardwareStatus, string> = {
  certified: 'معتمد',
  recommended: 'موصى به',
  untested: 'غير مجرّب بعد',
};

export const CATEGORY_GUIDE: Record<HardwareCategory, HardwareCategoryGuide> = {
  printer: {
    label: 'طابعات الفواتير',
    supports:
      'يطبع رفيق الإيصال بالعربية على طابعة حرارية مقاس 80 مم أو 57 مم بأوامر ESC/POS، ويرسل أمر القص وفتح الدرج، ويطبع تذاكر المطبخ والبار للكافيهات.',
    connects: 'عبر USB أو الشبكة (LAN)، وتظهر الطابعة في رفيق بعد تثبيت تعريفها في ويندوز.',
    settings: 'إعدادات المحل والسيستم، ثم إعدادات الطابعة والورق',
  },
  label: {
    label: 'استيكرات الباركود',
    supports:
      'يطبع رفيق استيكرات الباركود والأسعار بباركود Code 128 على بكرات 38×25 و40×30 و50×25 و50×30 و50×40 مم، أو على ورق A4 استيكرات (24 أو 40 استيكر في الورقة).',
    connects: 'أي طابعة مثبّتة في ويندوز تصلح، ويمكن استخدام طابعة الإيصالات نفسها.',
    settings: 'إعدادات الطابعة والورق، قسم طابعة استيكرات الباركود والأسعار',
  },
  scanner: {
    label: 'قارئات الباركود',
    supports:
      'يتعامل رفيق مع أي قارئ يعمل كلوحة مفاتيح: يحدد القارئ من سرعة وصول الحروف، ويدعم لاحقة Enter أو Tab أو بدون، وبادئة اختيارية، ويقرأ الباركود صحيحاً حتى مع الكيبورد العربي.',
    connects: 'عبر USB أو Bluetooth أو دونجل لاسلكي، دون تثبيت تعريف.',
    settings: 'شاشة البيع، ثم F8 (وفي الصيدلية Ctrl + F8)، أو لوحة المطور ثم الماسح والحماية',
  },
  drawer: {
    label: 'أدراج النقدية',
    supports:
      'يفتح رفيق الدرج بنبضة ESC/POS ترسلها الطابعة، مع اختيار قوة النبضة من 10 إلى 100 مللي ثانية (الافتراضية 30)، واختيار المنفذ: منفذ 1 (Pin 2) أو منفذ 2 (Pin 5) أو كليهما.',
    connects: 'بكابل RJ11 أو RJ12 من الدرج إلى منفذ الدرج في ظهر طابعة الإيصالات.',
    settings: 'إعدادات الطابعة والورق، قسم خيارات وأتمتة الكاشير والدرج',
  },
  scale: {
    label: 'موازين الباركود',
    supports:
      'يقرأ رفيق ملصق الميزان المكوّن من 13 رقماً: بادئة 20 أو 21 أو 22 أو 99، ثم رقم الصنف (5 أرقام)، ثم الوزن بالجرام (5 أرقام)، ثم رقم التحقق. يحسب رفيق السعر من سعر الكيلو المسجل في الصنف.',
    connects: 'لا يوجد وصلة بين الميزان والكمبيوتر، فالملصق المطبوع يُمسح بقارئ الباركود.',
    settings: 'لوحة المطور ثم الميزات والأنشطة لتفعيل «ميزان الباركود والأصناف الموزونة»، وباركود الصنف من الأصناف والمخزن',
  },
  power: {
    label: 'الكهرباء والطاقة',
    supports:
      'رفيق يحفظ كل عملية بيع فور تنفيذها في قاعدة بيانات محلية بوضع WAL، فلا تتلف البيانات عند انقطاع الكهرباء المفاجئ، ويعمل بدون إنترنت.',
    connects: 'وحدة طاقة احتياطية (UPS) تغذي الكمبيوتر والطابعة والدرج.',
    settings: 'لا توجد إعدادات في رفيق، فالأمر متعلق بتجهيز المحل',
  },
};

const WINDOWS_ALL = { win7: true, win10_11: true } as const;

export const CERTIFIED_DEVICES: readonly HardwareDevice[] = [
  {
    id: 'xp_n160ii',
    category: 'printer',
    brand: 'Xprinter',
    model: 'XP-N160II / XP-Q200 / XP-C300H',
    type: 'طابعة إيصالات حرارية 80 مم',
    status: 'recommended',
    connections: ['USB', 'LAN'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'مقاس الورق', value: '80 مم (منطقة الطباعة 72 مم)' },
      { label: 'القاطع', value: 'قاطع آلي' },
      { label: 'التعريف', value: 'Xprinter 80 Series Driver', ltr: true },
    ],
    setupSteps: [
      'وصّل الطابعة بكابل USB (أو بالشبكة) وشغّلها.',
      'ثبّت تعريف Xprinter الرسمي لويندوز، وهو متوفر من ويندوز 7 حتى 11.',
      'من «إعدادات الطابعة والورق» اختر الطابعة ثم مقاس البكرة 80 مم.',
      'فعّل «طباعة وصل فورية أول ما البيع يخلص» و«فتح درج النقدية والفلوس تلقائياً مع البيع».',
      'اضغط «تجربة طباعة وصل» وتأكد أن الإيصال يخرج بالعربية واضحاً.',
    ],
    notes: 'طابعة اقتصادية يسهل توفير رولات الورق وقطع الغيار لها، وتصلح لأغلب المحلات.',
  },
  {
    id: 'bixolon_srp330',
    category: 'printer',
    brand: 'Bixolon (Samsung)',
    model: 'SRP-330II / SRP-350III',
    type: 'طابعة إيصالات حرارية للتشغيل الشاق 80 مم',
    status: 'certified',
    connections: ['USB'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'مقاس الورق', value: '80 مم' },
      { label: 'القاطع', value: 'قاطع آلي للتشغيل الشاق' },
      { label: 'التعريف', value: 'Bixolon SRP-330II Driver', ltr: true },
      { label: 'منفذ الدرج', value: 'منفذ 1 (Pin 2)' },
    ],
    setupSteps: [
      'ثبّت تعريف Bixolon Windows Driver v7.',
      'من خصائص الطابعة في ويندوز اختر مقاس الورق 80 × 297 مم.',
      'اختر الطابعة في «إعدادات الطابعة والورق» وجرّب الطباعة والدرج.',
    ],
    notes: 'طابعة للمحلات كبيرة الحركة التي تطبع طوال اليوم.',
  },
  {
    id: 'epson_tmt20',
    category: 'printer',
    brand: 'Epson',
    model: 'TM-T20III / TM-T88VI',
    type: 'طابعة إيصالات حرارية 80 مم',
    status: 'certified',
    connections: ['USB'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'مقاس الورق', value: '80 مم' },
      { label: 'القاطع', value: 'قاطع آلي' },
      { label: 'التعريف', value: 'EPSON TM-T20III Receipt', ltr: true },
    ],
    setupSteps: [
      'ثبّت برنامج Epson Advanced Printer Driver.',
      'اختر الطابعة في «إعدادات الطابعة والورق» ومقاس البكرة 80 مم.',
      'لا حاجة لضبط خط أو ترميز عربي، فرفيق يرسل الإيصال كصورة فتظهر العربية سليمة.',
    ],
    notes: 'طابعة إيصالات معروفة عالمياً ومناسبة للتشغيل الطويل.',
  },
  {
    id: 'mini_pos_58',
    category: 'printer',
    brand: 'Generic / Milestone',
    model: 'POS-58 Series / Milestone 58mm',
    type: 'طابعة كاشير مدمجة 57 مم أو 58 مم',
    status: 'certified',
    connections: ['USB'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'مقاس الورق', value: '57 مم (بكرة 58 مم)' },
      { label: 'القاطع', value: 'تمزيق يدوي' },
      { label: 'التعريف', value: 'POS-58 Driver', ltr: true },
    ],
    setupSteps: [
      'ثبّت تعريف POS-58 Series Driver.',
      'من «إعدادات الطابعة والورق» اختر الطابعة ثم «57 مم (حراري صغير)» بدلاً من 80 مم.',
      'اضغط «تجربة طباعة وصل» للتأكد من عرض الإيصال على الورق الصغير.',
    ],
    notes: 'مناسبة للأكشاك والمساحات الصغيرة، وتوفر في استهلاك الورق.',
  },
  {
    id: 'generic_receipt_printer',
    category: 'printer',
    brand: 'متطلبات عامة',
    model: 'أي طابعة حرارية تدعم ESC/POS',
    type: 'طابعة إيصالات حرارية 80 مم أو 57 مم',
    status: 'untested',
    connections: ['USB', 'LAN'],
    specs: [
      { label: 'مقاس الورق', value: '80 مم أو 57 مم' },
      { label: 'لغة الطباعة', value: 'ESC/POS', ltr: true },
    ],
    setupSteps: [
      'ثبّت تعريف الطابعة في ويندوز ثم اضغط «تحديث وبحث الطابعات» في رفيق.',
      'اختر الطابعة ومقاس البكرة من «إعدادات الطابعة والورق».',
      'اضغط «تجربة طباعة وصل» قبل الاعتماد عليها في البيع.',
    ],
    notes:
      'أي طابعة غير مذكورة في القائمة لم تُجرّب مع رفيق بعد. رفيق يرسل الإيصال كصورة نقطية بأوامر ESC/POS، فتظهر العربية سليمة، لكن النتيجة تتأكد بتجربة الطباعة على جهازك.',
  },
  {
    id: 'generic_kitchen_printer',
    category: 'printer',
    brand: 'متطلبات عامة',
    model: 'طابعة المطبخ والبار',
    type: 'طابعة حرارية 80 مم لتذاكر التحضير',
    status: 'untested',
    connections: ['USB', 'LAN'],
    specs: [
      { label: 'مقاس الورق', value: '80 مم' },
      { label: 'لغة الطباعة', value: 'ESC/POS', ltr: true },
    ],
    setupSteps: [
      'ثبّت الطابعة في ويندوز بنفس طريقة طابعة الإيصالات.',
      'يفعّل المطور ميزة «طابعة المطبخ والبار» من لوحة المطور ثم الميزات والأنشطة (تتطلب تفعيل الكافيه والمطعم).',
      'من «توجيه طابعات المطبخ والبار» اختر «طابعة المطبخ الساخن» و«طابعة البار والمشروبات».',
      'فعّل «طباعة تذكرة المطبخ تلقائياً مع الفاتورة» لتخرج التذكرة بدون أسعار.',
    ],
    notes: 'لم تُجرّب موديلات بعينها للمطبخ بعد، وأي طابعة حرارية تعمل كطابعة إيصالات يمكن استخدامها.',
  },
  {
    id: 'generic_label_printer',
    category: 'label',
    brand: 'متطلبات عامة',
    model: 'طابعة استيكرات الباركود والأسعار',
    type: 'طابعة حرارية للملصقات (بكرة استيكر) أو أي طابعة مثبّتة في ويندوز',
    status: 'untested',
    connections: ['Windows'],
    specs: [
      { label: 'مقاسات البكرة', value: '38×25 و40×30 و50×25 و50×30 و50×40 مم' },
      { label: 'ورق A4', value: '24 أو 40 استيكر في الورقة' },
      { label: 'الباركود', value: 'Code 128', ltr: true },
    ],
    setupSteps: [
      'ثبّت تعريف طابعة الاستيكرات في ويندوز واضبط حجم الورق في خصائصها.',
      'من «طابعة استيكرات الباركود والأسعار» اختر الطابعة ثم المقاس الافتراضي لبكرتك.',
      'اضغط «طباعة استيكر تجريبي» وتأكد أن الباركود يُقرأ بقارئك.',
    ],
    notes:
      'لم تُجرّب موديلات بعينها لطباعة الاستيكرات بعد. إن لم تحدد طابعة، تستخدم رفيق طابعة الإيصالات أو طابعة ويندوز الافتراضية.',
  },
  {
    id: 'datalogic_qd2400',
    category: 'scanner',
    brand: 'Datalogic',
    model: 'QuickScan QD2100 / QD2400 2D',
    type: 'قارئ باركود سلكي للباركود الخطي و QR',
    status: 'recommended',
    connections: ['USB'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'أنواع الباركود', value: 'Code 128, EAN-13, QR, DataMatrix', ltr: true },
      { label: 'وضع التشغيل', value: 'محاكاة لوحة المفاتيح (USB HID) مع لاحقة Enter' },
      { label: 'القراءة', value: 'زر زناد، وكشف تلقائي على الحامل' },
    ],
    setupSteps: [
      'وصّل كابل USB بأي منفذ في الكمبيوتر، ويعمل مباشرة دون تثبيت تعريف.',
      'تأكد أن القارئ يصدر نغمة عند المسح.',
      'اضغط F8 في شاشة البيع وامسح صنفاً للتأكد أن اللاحقة المضبوطة هي Enter.',
      'إن لم يرسل القارئ Enter، فعّل لاحقة Enter من باركودات البرمجة في دليل الجهاز.',
    ],
    notes: 'قارئ موصى به لسرعته، ويقرأ الباركود الصغير على العبوات.',
  },
  {
    id: 'honeywell_1250g',
    category: 'scanner',
    brand: 'Honeywell',
    model: 'Voyager 1250g / 1400g / 1450g 2D',
    type: 'قارئ باركود يدوي سلكي',
    status: 'certified',
    connections: ['USB'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'وضع التشغيل', value: 'محاكاة لوحة المفاتيح (USB) مع لاحقة Enter' },
      { label: 'القراءة', value: 'مسح تلقائي على الحامل' },
    ],
    setupSteps: [
      'وصّل كابل USB.',
      'ضع القارئ على الحامل لتفعيل المسح المستمر دون لمس الزناد.',
      'تأكد أن القارئ يرسل Enter بعد كل باركود، وإلا اضبطه من باركودات كتالوج Honeywell.',
    ],
    notes: 'مناسب للباركود الباهت أو المطبوع بجودة منخفضة.',
  },
  {
    id: 'zebra_ds9208',
    category: 'scanner',
    brand: 'Zebra (Symbol)',
    model: 'DS9208 / DS9308 Desktop Omnidirectional',
    type: 'قارئ مكتبي متعدد الاتجاهات للكاشير',
    status: 'recommended',
    connections: ['USB'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'وضع التشغيل', value: 'محاكاة لوحة المفاتيح (USB HID) مع لاحقة Enter' },
      { label: 'القراءة', value: 'مسح مستمر من أي اتجاه دون زناد' },
    ],
    setupSteps: [
      'ثبّت القارئ على طاولة الكاشير ووصّل كابل USB.',
      'لا يحتاج توجيهاً محدداً، فيكفي تمرير الصنف أمامه ليقرأ الباركود من أي زاوية.',
    ],
    notes: 'مناسب للمحلات المزدحمة لأنه لا يحتاج رفع القارئ باليد في كل بيعة.',
  },
  {
    id: 'symbol_ls2208',
    category: 'scanner',
    brand: 'Zebra (Symbol Motorola)',
    model: 'LS2208 / DS2208 Handheld 1D & 2D',
    type: 'قارئ باركود يدوي كلاسيكي',
    status: 'certified',
    connections: ['USB'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'أنواع الباركود', value: 'Code 128, EAN-13, EAN-8, UPC-A, GS1-128', ltr: true },
      { label: 'وضع التشغيل', value: 'محاكاة لوحة المفاتيح (USB HID) مع لاحقة Enter' },
    ],
    setupSteps: [
      'وصّل كابل USB؛ يتعرف عليه ويندوز فوراً كلوحة مفاتيح.',
      'إن لم يرسل Enter تلقائياً، امسح من كتالوج Zebra باركود «Scan Options» ثم «Data Suffix» ثم «Enter».',
      'إن كان على وضع المنفذ التسلسلي الافتراضي، امسح باركود «HID KEYBOARD EMULATION» لتحويله للوضع القياسي.',
    ],
    notes: 'قارئ يدوي معروف بتحمله للتشغيل اليومي.',
  },
  {
    id: 'netum_wireless_2d',
    category: 'scanner',
    brand: 'Netum / Symcode',
    model: 'NT-1228BL / C750 Wireless 2.4G & Bluetooth',
    type: 'قارئ باركود لاسلكي محمول مع دونجل USB',
    status: 'recommended',
    connections: ['USB', 'Bluetooth'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'أنواع الباركود', value: '1D, QR, DataMatrix', ltr: true },
      { label: 'وضع التشغيل', value: 'محاكاة لوحة المفاتيح اللاسلكية (2.4G) مع لاحقة Enter' },
      { label: 'التخزين', value: 'يخزن الباركود أثناء الجرد ويفرغه دفعة واحدة' },
    ],
    setupSteps: [
      'وصّل الدونجل الصغير بمنفذ USB في الكمبيوتر.',
      'شغّل القارئ ليتصل بالدونجل تلقائياً على تردد 2.4GHz.',
      'للبيع المباشر استخدم وضع الإرسال الفوري، ولجرد المخزن استخدم وضع التخزين ثم فرّغه دفعة واحدة.',
    ],
    notes: 'مناسب للجرد والتنقل داخل المحل دون أسلاك.',
  },
  {
    id: 'generic_barcode_scanner',
    category: 'scanner',
    brand: 'متطلبات عامة',
    model: 'أي قارئ باركود بوضع لوحة المفاتيح',
    type: 'قارئ باركود سلكي أو لاسلكي',
    status: 'untested',
    connections: ['USB', 'Bluetooth'],
    specs: [
      { label: 'وضع التشغيل', value: 'محاكاة لوحة المفاتيح (HID)' },
      { label: 'اللاحقة', value: 'Enter أو Tab أو بدون', ltr: true },
      { label: 'أقصى زمن بين الحروف', value: '45 أو 65 أو 80 أو 100 مللي ثانية (الموصى به 65)' },
    ],
    setupSteps: [
      'وصّل القارئ بالكمبيوتر، فيعمل مباشرة دون تعريف.',
      'اضغط F8 في شاشة البيع (وفي الصيدلية Ctrl + F8) لفتح «فحص وضبط قارئ الباركود».',
      'امسح أي صنف، وتأكد من تطابق اللاحقة وسرعة القراءة، واضبط البادئة إن كان قارئك يرسل بادئة.',
    ],
    notes: 'أي قارئ غير مذكور لم يُجرّب بعد. اختبره بنافذة فحص القارئ قبل الاعتماد عليه.',
  },
  {
    id: 'cash_drawer_standard',
    category: 'drawer',
    brand: 'Maken / POS-D',
    model: 'MK-410 / E-410',
    type: 'درج نقدية إلكتروني حديدي (5 خانات للأوراق و8 للفكة)',
    status: 'certified',
    connections: ['RJ11'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'الملف المغناطيسي', value: '12 أو 24 فولت' },
      { label: 'منفذ الدرج', value: 'منفذ 1 (Pin 2)' },
      { label: 'النبضة الافتراضية', value: '30 مللي ثانية' },
    ],
    setupSteps: [
      'وصّل كابل RJ11 المزود مع الدرج بمنفذ الدرج في ظهر طابعة الإيصالات.',
      'من «إعدادات الطابعة والورق» فعّل «فتح درج النقدية والفلوس تلقائياً مع البيع».',
      'اضغط «تجربة النبضة الحالية»؛ إن لم يفتح الدرج جرّب نبضة أقوى أو غيّر منفذ توصيل الكابل إلى منفذ 2 (Pin 5).',
    ],
    notes: 'هيكل حديدي بمفتاح أمان بثلاثة أوضاع: قفل، وفتح إلكتروني، وفتح يدوي للطوارئ.',
  },
  {
    id: 'generic_cash_drawer',
    category: 'drawer',
    brand: 'متطلبات عامة',
    model: 'أي درج نقدية يعمل بنبضة من الطابعة',
    type: 'درج نقدية إلكتروني بمنفذ RJ11 أو RJ12',
    status: 'untested',
    connections: ['RJ11'],
    specs: [
      { label: 'قوة النبضة', value: 'من 10 إلى 100 مللي ثانية (الافتراضية 30)' },
      { label: 'المنفذ', value: 'منفذ 1 (Pin 2) أو منفذ 2 (Pin 5) أو كليهما' },
    ],
    setupSteps: [
      'تأكد أن جهد الدرج يطابق جهد مخرج الدرج في طابعتك.',
      'وصّل الدرج بمنفذ الدرج في ظهر الطابعة، وفعّل فتحه تلقائياً من «إعدادات الطابعة والورق».',
      'جرّب «تجربة النبضة الحالية»، وارفع قوة النبضة أو بدّل المنفذ إن لم يفتح.',
    ],
    notes: 'أي درج غير مذكور لم يُجرّب بعد. الدرج لا يتصل بالكمبيوتر، بل بالطابعة التي ترسل له النبضة.',
  },
  {
    id: 'aclas_scale',
    category: 'scale',
    brand: 'Aclas / Rongta / CAS',
    model: 'Aclas LS2X / Rongta RLS1000 / CAS CL5200',
    type: 'ميزان باركود إلكتروني يطبع ملصق الوزن',
    status: 'certified',
    connections: ['Label'],
    windows: WINDOWS_ALL,
    specs: [
      { label: 'صيغة الملصق', value: 'EAN-13: PP-IIIII-WWWWW-C', ltr: true },
      { label: 'البادئة', value: '20 أو 21 أو 22 أو 99', ltr: true },
      { label: 'المحتوى', value: 'رقم الصنف ثم الوزن بالجرام، وليس السعر' },
    ],
    setupSteps: [
      'اضبط الميزان على طباعة ملصق من 13 رقماً يبدأ بـ 20 أو 21 أو 22 أو 99.',
      'اجعل بعد البادئة رقم الصنف (5 أرقام) ثم الوزن بالجرام (5 أرقام) ثم رقم التحقق، ولا تجعله يحمل السعر.',
      'يفعّل المطور «ميزان الباركود والأصناف الموزونة» من لوحة المطور ثم الميزات والأنشطة.',
      'سجّل الصنف في رفيق وضع في باركوده رقم الصنف نفسه المبرمج في الميزان (مثل 45 أو 00045 أو 2100045) واختر وحدته بالكيلو.',
      'امسح الملصق في شاشة البيع: يدخل الصنف بوزنه ويُحسب السعر من سعر الكيلو المسجل في رفيق.',
    ],
    notes: 'يتوافق مع طريقة قراءة ملصقات الموازين المدمجة في رفيق دون برامج وسيطة.',
  },
  {
    id: 'generic_barcode_scale',
    category: 'scale',
    brand: 'متطلبات عامة',
    model: 'أي ميزان يطبع ملصق باركود بالوزن',
    type: 'ميزان باركود إلكتروني',
    status: 'untested',
    connections: ['Label'],
    specs: [
      { label: 'صيغة الملصق', value: '13 رقماً: PP-IIIII-WWWWW-C', ltr: true },
      { label: 'البادئة', value: '20 أو 21 أو 22 أو 99', ltr: true },
    ],
    setupSteps: [
      'اضبط الميزان على ملصق وزن بالصيغة المذكورة، بحيث يحمل الوزن بالجرام لا السعر.',
      'اضبط رقم الصنف في الميزان ليطابق باركود الصنف في رفيق.',
      'امسح ملصقاً تجريبياً في شاشة البيع وتأكد من الوزن والسعر.',
    ],
    notes: 'أي ميزان غير مذكور لم يُجرّب بعد. المهم أن يطبع الملصق بالصيغة نفسها.',
  },
  {
    id: 'generic_ups',
    category: 'power',
    brand: 'متطلبات عامة',
    model: 'وحدة طاقة احتياطية UPS',
    type: 'مصدر كهرباء احتياطي للكمبيوتر والطابعة والدرج',
    status: 'untested',
    connections: ['Power'],
    specs: [
      { label: 'ما يغذيه', value: 'الكمبيوتر والشاشة وطابعة الإيصالات' },
      { label: 'حماية البيانات', value: 'قاعدة بيانات محلية بوضع WAL', ltr: true },
    ],
    setupSteps: [
      'وصّل الكمبيوتر والشاشة وطابعة الإيصالات بمخارج الوحدة الاحتياطية.',
      'اختر سعة تكفي الأجهزة المتصلة لوقت كاف لإنهاء الفاتورة الجارية وإغلاق الجهاز بأمان.',
    ],
    notes:
      'توصية عامة لم تُجرّب مع موديل بعينه. رفيق يحمي بياناته عند انقطاع الكهرباء المفاجئ، لكن الوحدة الاحتياطية تحفظ الفاتورة الجارية وتجنبك إعادة التشغيل.',
  },
];

/** Category and free-text filter of the guide: model, brand, type and notes are searched. */
export function filterCertifiedDevices(
  devices: readonly HardwareDevice[],
  category: 'all' | HardwareCategory,
  query: string,
): HardwareDevice[] {
  const q = query.trim().toLowerCase();
  return devices.filter((d) => {
    const matchesCat = category === 'all' || d.category === category;
    if (!q) return matchesCat;
    const matchesSearch =
      d.model.toLowerCase().includes(q) ||
      d.brand.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.notes.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });
}
