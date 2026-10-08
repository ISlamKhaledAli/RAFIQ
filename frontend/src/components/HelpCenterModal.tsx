import { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  X,
  Search,
  ShoppingCart,
  Package,
  Truck,
  Users,
  BarChart3,
  ShieldCheck,
  Headphones,
  FileQuestion,
  PhoneCall,
  Copy,
  Check,
  Keyboard,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Cpu,
  KeyRound,
  Download,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Sparkles,
  Info
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { SystemInfo } from '../App';
import type { LicenseInfoData } from './LicenseModal';

export type HelpSectionId = 
  | 'pos' 
  | 'products' 
  | 'purchases' 
  | 'customers' 
  | 'sales' 
  | 'backup_security' 
  | 'faq' 
  | 'support';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: HelpSectionId | string;
}

interface HelpGuideStep {
  title: string;
  description: string;
  shortcut?: string;
  badge?: string;
}

interface HelpArticle {
  id: string;
  sectionId: HelpSectionId;
  title: string;
  summary: string;
  keywords: string[];
  steps: HelpGuideStep[];
  goldenRule?: string;
  troubleshooting?: string;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  tag: string;
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'pos_guide',
    sectionId: 'pos',
    title: 'دليل الكاشير والبيع السريع',
    summary: 'خطوات إتمام الفاتورة بالباركود أو البحث، تعديل الكميات والأسعار، وتعليق وسداد الفواتير.',
    keywords: ['بيع', 'كاشير', 'باركود', 'فاتورة', 'دفع', 'سلة', 'f9', 'f2', 'f4', 'f10', 'ميزان', 'مرتجع'],
    goldenRule: 'الكاشير السريع يعتمد 100% على لوحة المفاتيح: اضغط F2 للبحث السريع، F4 للكمية، ثم F9 للدفع وإنهاء الفاتورة في ثانيتين.',
    steps: [
      {
        badge: '1',
        title: 'مسح الأصناف بالباركود',
        description: 'مرر قارئ الباركود على أي منتج، وسيُضاف فوراً للسلة. إذا مررت نفس الصنف مجدداً تزيد كميته تلقائياً.',
        shortcut: 'قارئ الباركود أو Enter'
      },
      {
        badge: '2',
        title: 'البحث السريع عن صنف بدون باركود',
        description: 'اضغط F2 للبحث الفوري باسم الصنف (مثل: شاي، جبنة، أرز). اضغط الأسهم لأعلى/لأسفل ثم Enter لإضافته.',
        shortcut: 'F2'
      },
      {
        badge: '3',
        title: 'تعديل الكمية أو الوزن بالجرام',
        description: 'حدد الصنف في السلة واضغط F4 لتغيير الكمية. للأصناف الوزنية (جبن/لحوم) اكتب الوزن بالجرام مثل 250 أو 0.25 كجم.',
        shortcut: 'F4'
      },
      {
        badge: '4',
        title: 'ربط الفاتورة بعميل (للآجل أو النقاط)',
        description: 'اضغط F3 للبحث عن العميل برقم هاتفه أو اسمه لربط الفاتورة وحساب دينه أو منحه خصماً خاصاً.',
        shortcut: 'F3'
      },
      {
        badge: '5',
        title: 'إتمام الدفع والطباعة (كاش / فيزا / آجل)',
        description: 'اضغط F9 لفتح شاشة الدفع السريع. أدخل المبلغ المدفوع ليحسب البرنامج الباقي فوراً، ثم اضغط Enter لطباعة الإيصال وفتح الدرج.',
        shortcut: 'F9'
      },
      {
        badge: '6',
        title: 'تعليق واسترجاع الفواتير (Park Sale)',
        description: 'إذا نسى الزبون محفظته أو ذهب لإحضار سلعة، اضغط F10 لتعليق الفاتورة وخدمة الزبون التالي، ثم استرجعها بنقرة واحدة.',
        shortcut: 'F10'
      }
    ],
    troubleshooting: 'لو كان قارئ الباركود يكتب حروفا إنجليزية عشوائية، تأكد من ضبط لغة الويندوز أو تفعيل ميزة التصحيح الذاتي في إعدادات الماسح.'
  },
  {
    id: 'products_guide',
    sectionId: 'products',
    title: 'إدارة المنتجات والمخزون والباركود',
    summary: 'كيفية إضافة الأصناف، ضبط أسعار التكلفة والبيع، توليد باركود داخلي، ومتابعة النواقص.',
    keywords: ['منتج', 'مخزون', 'باركود', 'تكلفة', 'سعر', 'نواقص', 'تنبيه', 'أوزان', 'صلاحية', 'تعديل'],
    goldenRule: 'اضبط دائماً حد الطلب الأدنى (Min Stock) لكل صنف ليصلك تنبيه ملون قبل نفاد البضاعة من الرف.',
    steps: [
      {
        badge: '1',
        title: 'إضافة منتج جديد',
        description: 'من تبويب المنتجات اضغط "إضافة صنف جديد"، امسح الباركود، اكتب الاسم، سعر البيع وسعر التكلفة، وحدد الوحدة (قطعة / كجم).',
        shortcut: 'Ctrl + N'
      },
      {
        badge: '2',
        title: 'توليد باركود داخلي للأصناف غير المكودة',
        description: 'للخضروات، المخبوزات أو البهارات التي لا تحمل باركوداً، اضغط "توليد باركود داخلي" ليُنشئ النظام باركوداً فريداً يبدأ بـ 200.',
        shortcut: 'توليد باركود'
      },
      {
        badge: '3',
        title: 'جرد وتعديل رصيد المخزون',
        description: 'من شاشة "حركات وجرد المخزون"، يمكنك عمل تسوية مخزنية (جرد فعلي) مع ذكر سبب التسوية لحماية الدقة المالية.',
        shortcut: 'تسوية مخزون'
      },
      {
        badge: '4',
        title: 'متابعة تواريخ الصلاحية والدفعات',
        description: 'سجل تاريخ انتهاء الصلاحية لكل دفعة توريد لتستقبل تنبيهات مبكرة قبل انتهاء الصلاحية بـ 30 و 15 يوماً.',
        shortcut: 'تواريخ الصلاحية'
      }
    ],
    troubleshooting: 'يمنع النظام تخزين مبالغ بكسور غير صحيحة، فجميع العمليات المالية تُحسب بالقروش (Piasters) لضمان عدم ضياع قرش واحد.'
  },
  {
    id: 'purchases_guide',
    sectionId: 'purchases',
    title: 'فواتير المشتريات والموردين',
    summary: 'تسجيل بضائع التوريد، تحديث تكلفة الشراء، إدارة ديون الموردين وسداد الدفعات.',
    keywords: ['مشتريات', 'موردين', 'فاتورة شراء', 'توريد', 'دفعات', 'ديون الموردين', 'تكلفة'],
    goldenRule: 'عند تسجيل فاتورة شراء جديدة، يُحدّث النظام سعر التكلفة ورصيد المخزون فوراً ويُثبت حركة الوارد في المعاملات الذرية.',
    steps: [
      {
        badge: '1',
        title: 'اختيار المورد',
        description: 'حدد المورد من القائمة أو أضف مورداً جديداً برقم هاتفه وعنوانه واسم شركته.',
        shortcut: 'دليل الموردين'
      },
      {
        badge: '2',
        title: 'إدخال أصناف الفاتورة وأسعار التكلفة',
        description: 'امسح باركود البضاعة الواصلة، أدخل الكمية الواردة وسعر شراء القطعة ليُحسب الإجمالي تلقائياً.',
        shortcut: 'إضافة أصناف'
      },
      {
        badge: '3',
        title: 'تحديد طريقة السداد (نقداً أو آجل)',
        description: 'إذا دفعت للمورد جزءاً من الفاتورة، أدخل المدفوع نقداً وسيُرحّل الباقي تلقائياً إلى حساب المورد كرصيد مستحق له.',
        shortcut: 'حفظ الفاتورة'
      },
      {
        badge: '4',
        title: 'سداد دفعة نقدية لمورد',
        description: 'من صفحة "دليل الموردين"، افتح حساب المورد واضغط "تسجيل دفعة سداد" لخصمها من حسابه وإثباتها في الخزينة.',
        shortcut: 'سداد دفعة'
      }
    ]
  },
  {
    id: 'customers_guide',
    sectionId: 'customers',
    title: 'العملاء وحسابات الديون (الشكك)',
    summary: 'إدارة حسابات الزبائن، بيع الآجل بحد ائتماني، تحصيل الديون، وطباعة كشف الحساب.',
    keywords: ['عملاء', 'شكك', 'ديون', 'آجل', 'سداد', 'كشف حساب', 'سقف الائتمان', 'عميل'],
    goldenRule: 'حدد سقف ائتماني (Credit Limit) لكل عميل آجل؛ سينبهك النظام فوراً إذا حاول الزبون شراء بضاعة تتجاوز الحد المسموح به.',
    steps: [
      {
        badge: '1',
        title: 'إضافة ملف عميل جديد',
        description: 'أدخل اسم العميل ورقم هاتفه وسقف الائتمان المالي المسموح به بالجنيه.',
        shortcut: 'عميل جديد'
      },
      {
        badge: '2',
        title: 'البيع بالآجل للعميل',
        description: 'في شاشة البيع اضغط F3 واختر العميل، ثم في شاشة الدفع (F9) اختر "آجل" وسيُضاف مبلغ الفاتورة إلى رصيد دينه.',
        shortcut: 'F3 + F9'
      },
      {
        badge: '3',
        title: 'تحصيل ديون العميل (سداد جزئي أو كلي)',
        description: 'من صفحة العملاء اضغط "سداد دين"، أدخل المبلغ المسدد نقداً وسيطبع البرنامج إيصال استلام نقدية للعميل.',
        shortcut: 'سداد دين'
      },
      {
        badge: '4',
        title: 'تصدير كشف حساب العميل إكسل أو PDF',
        description: 'يمكنك مراجعة جميع فواتير العميل وتواريخ سداده وتصديرها كملف Excel أو طباعتها بنقرة واحدة.',
        shortcut: 'كشف حساب'
      }
    ]
  },
  {
    id: 'sales_guide',
    sectionId: 'sales',
    title: 'المبيعات والإغلاق اليومي',
    summary: 'مراجعة فواتير الكاشير، تقارير الأرباح والمبيعات، ومطابقة النقدية الفعلية مع الدرج.',
    keywords: ['مبيعات', 'تقارير', 'إغلاق يومي', 'وردية', 'أرباح', 'خزينة', 'درج', 'قفل اليومية'],
    goldenRule: 'نفّذ الإغلاق اليومي عند نهاية كل وردية، وأدخل النقدية الفعلية الموجودة في الدرج ليكتشف النظام أي عجز أو زيادة بدقة.',
    steps: [
      {
        badge: '1',
        title: 'مراجعة فواتير اليوم',
        description: 'من تبويب "فواتير المبيعات" يمكنك استعراض جميع الفواتير الصادرة، طريقة دفعها، واسم الكاشير الذي أصدرها.',
        shortcut: 'سجل المبيعات'
      },
      {
        badge: '2',
        title: 'إجراء الإغلاق اليومي',
        description: 'اضغط "إغلاق اليومية والوردية"، عدّ الفلوس الفعلية في الدرج واكتبها، ليقارنها النظام مع إجمالي المبيعات المسجلة.',
        shortcut: 'إغلاق اليومية'
      },
      {
        badge: '3',
        title: 'طباعة تقرير الوردية الحراري',
        description: 'يطبع البرنامج إيصالاً مدمجاً للدرج يوضح: إجمالي الكاش، مبيعات الفيزا، مبيعات الآجل، المرتجعات، وصافي الربح التقديري.',
        shortcut: 'طباعة الإغلاق'
      }
    ]
  },
  {
    id: 'backup_security_guide',
    sectionId: 'backup_security',
    title: 'النسخ الاحتياطي والأمان وحماية البيانات',
    summary: 'حماية بيانات المحل من انقطاع الكهرباء وتلف الهارد، النسخ على فلاشة خارجية، وصلاحيات الكاشير.',
    keywords: ['نسخ احتياطي', 'فلاشة', 'قاعدة بيانات', 'أمان', 'كهرباء', 'حماية', 'ترخيص', 'صلاحيات'],
    goldenRule: 'احرص على أخذ نسخة احتياطية يومياً على فلاشة USB خارجية لحماية محلك حتى لو تعرض جهاز الكمبيوتر لأي حادث.',
    steps: [
      {
        badge: '1',
        title: 'إنشاء نسخة احتياطية فورية',
        description: 'من الإعدادات > تبويب النسخ الاحتياطي، اضغط "نسخ احتياطي فوري". يقوم النظام بضغط قاعدة البيانات مع التاريخ والوقت.',
        shortcut: 'نسخ احتياطي'
      },
      {
        badge: '2',
        title: 'تحديد مجلد الفلاشة USB',
        description: 'يمكنك اختيار مجلد الفلاشة من الإعدادات ليقوم النظام بنسخ البيانات إليها بضغطة زر واحدة قبل إغلاق البرنامج.',
        shortcut: 'تحديد المسار'
      },
      {
        badge: '3',
        title: 'تصدير شامل لكل الجداول إلى Excel',
        description: 'من تبويب فحص النظام اضغط "تصدير كل بيانات المحل (Excel)" للحصول على كافة الجداول غير مشفرة لضمان ملكية بياناتك 100%.',
        shortcut: 'تصدير شامل'
      },
      {
        badge: '4',
        title: 'قفل البرنامج بكلمة سر الكاشير',
        description: 'يمكنك قفل الشاشة مؤقتاً عند مغادرة الكاشير لمنع أي تلاعب، مع حجب شاشات التقارير والأرباح عن حسابات الكاشير.',
        shortcut: 'قفل الشاشة'
      }
    ]
  }
];

const FAQS: FaqItem[] = [
  {
    id: 'faq_power_outage',
    category: 'الأمان والبيانات',
    tag: 'انقطاع الكهرباء',
    question: 'ماذا يحدث لو انقطعت الكهرباء فجأة أثناء تسجيل فاتورة أو إتمام عملية بيع؟',
    answer: 'نظام رفيق مبني بحماية متطورة مع حفظ فوري وتلقائي للمعاملات. الفاتورة التي تم الضغط على إنهائها تُحفظ بالكامل في أجزاء من الثانية. وإذا انقطعت الكهرباء فجأة، يُلغى الجزء غير المكتمل تلقائياً وتبقى جميع بياناتك وحساباتك سليمة وآمنة 100% دون أي فقدان أو تلف.'
  },
  {
    id: 'faq_offline_guarantee',
    category: 'الشبكة والإنترنت',
    tag: 'بدون إنترنت',
    question: 'هل يمكن تشغيل البرنامج والبيع بدون إنترنت نهائياً؟',
    answer: 'نعم بنسبة 100%! رفيق هو نظام أوفلاين بالكامل (Offline-First). جميع وظائف البيع، طباعة الإيصالات، المخزون، والتقارير تعمل دون الحاجة لأي اتصال بالإنترنت. الإنترنت مطلوب فقط لثوانٍ معدودة عند تفعيل الترخيص لأول مرة أو فحص التحديثات الجديدة اختيارياً.'
  },
  {
    id: 'faq_barcode_trouble',
    category: 'العتاد والأجهزة',
    tag: 'قارئ الباركود',
    question: 'قارئ الباركود لا يستجيب أو يكتب حروفاً عربية ملخبطة، كيف أصلحه؟',
    answer: 'هذه المشكلة تحدث لأن لغة إدخال الويندوز تكون مضبوطة على اللغة العربية بدلاً من الإنجليزية. رفيق يحتوي على ميزة التصحيح الذاتي للأرقام العربية، ولكن لضمان أفضل سرعة اضغط (Alt + Shift) في الويندوز لتكون لغة الكيبورد الإنجليزية (EN)، وتأكد من أن كابل الـ USB متصل بإحكام.'
  },
  {
    id: 'faq_thermal_printer',
    category: 'العتاد والأجهزة',
    tag: 'طابعة الفواتير',
    question: 'طابعة الإيصالات الحرارية لا تقطع الورق أو تطبع نصوصاً غير واضحة؟',
    answer: 'ادخل إلى شاشة "الإعدادات" ثم تبويب "الطابعة الحرارية"، وتأكد من اختيار المقاس الصحيح لرول الورق (80mm أو 57mm). استخدم زر "طباعة صفحة تجريبية" للتأكد من استجابة الطابعة وفتح درج النقدية. إذا كانت الطباعة باهتة نظّف رأس الطابعة الحراري بقطنة كحولية برفق.'
  },
  {
    id: 'faq_weight_products',
    category: 'البيع والمنتجات',
    tag: 'الأصناف الوزنية',
    question: 'كيف أتعامل مع الأصناف المباعة بالوزن مثل الجبن، اللحوم، أو الخضار؟',
    answer: 'عند إضافة الصنف حدد الوحدة "كيلوجرام". في شاشة البيع، بعد إضافة الصنف اضغط F4 لتعديل الكمية وأدخل الوزن بالجرام مباشرة (مثلاً: ربع كيلو يُكتب 250 أو 0.25). كما يدعم النظام قراءة باركود موازين الباركود الإلكترونية تلقائياً واستخراج السعر والوزن فوراً.'
  },
  {
    id: 'faq_data_ownership',
    category: 'الأمان والبيانات',
    tag: 'ملكية البيانات',
    question: 'هل بيانات محلي مشفرة أو محبوسة داخل البرنامج، وماذا لو أردت الانتقال؟',
    answer: 'بياناتك ملكك بالكامل بنسبة 100%! وفرنا ميزة "تصدير كل بيانات المحل بضغطة واحدة" في تبويب الإعدادات > فحص النظام، وتُخرج لك 8 ملفات Excel نقية ومفصلة تشمل المنتجات، العملاء، الديون، الموردين، والمبيعات مع بيان رسمي لملكية البيانات بدون أي قيود أو احتكار.'
  },
  {
    id: 'faq_license_renewal',
    category: 'الترخيص والدعم',
    tag: 'تجديد الترخيص',
    question: 'كيف أجدد الترخيص أو أنقل البرنامج إلى جهاز كمبيوتر جديد؟',
    answer: 'تواصل مع الدعم الفني على رقم 01097782965 أو عبر واتساب، وقم بنسخ "بصمة الجهاز" من شاشة الترخيص أو من تبويب "طلب الدعم" داخل مركز المساعدة. سيُرسل لك فريق الدعم كود التفعيل المحدث فوراً ويتم تفعيله بنقرة زر واحدة.'
  }
];

export const HelpCenterModal = ({
  isOpen,
  onClose,
  initialSection = 'pos'
}: HelpCenterModalProps) => {
  const [activeSection, setActiveSection] = useState<HelpSectionId>('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  // Support Bundle and System Info State
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfoData | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [supportSavedPath, setSupportSavedPath] = useState<string | null>(null);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Sync initialSection on open
  useEffect(() => {
    if (isOpen && initialSection) {
      const validSections: HelpSectionId[] = [
        'pos', 'products', 'purchases', 'customers', 'sales', 'backup_security', 'faq', 'support'
      ];
      if (validSections.includes(initialSection as HelpSectionId)) {
        setActiveSection(initialSection as HelpSectionId);
      } else if (initialSection === 'settings') {
        setActiveSection('backup_security');
      } else if (initialSection === 'dashboard') {
        setActiveSection('sales');
      } else {
        setActiveSection('pos');
      }
    }
  }, [isOpen, initialSection]);

  // Load diagnostics and license info on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchInfo = async () => {
      try {
        const sys: SystemInfo = await invoke('system:getInfo');
        if (isMounted && sys) setSysInfo(sys);
      } catch {
        // fallback
      }
      try {
        const lic: LicenseInfoData = await invoke('license:getInfo');
        if (isMounted && lic) setLicenseInfo(lic);
      } catch {
        // fallback
      }
    };

    void fetchInfo();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Filtered Articles based on search query
  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return HELP_ARTICLES;

    return HELP_ARTICLES.filter((art) => {
      const matchTitle = art.title.toLowerCase().includes(q);
      const matchSummary = art.summary.toLowerCase().includes(q);
      const matchKeywords = art.keywords.some((kw) => kw.toLowerCase().includes(q));
      const matchSteps = art.steps.some(
        (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
      return matchTitle || matchSummary || matchKeywords || matchSteps;
    });
  }, [searchQuery]);

  // Filtered FAQs based on search query
  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return FAQS;

    return FAQS.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.tag.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const activeArticle = useMemo(() => {
    return HELP_ARTICLES.find((a) => a.sectionId === activeSection);
  }, [activeSection]);

  const handleCreateSupportBundle = async () => {
    setSupportLoading(true);
    setSupportMessage(null);
    setSupportSavedPath(null);

    try {
      const res: any = await invoke('support:createBundle');
      if (res && res.success) {
        setSupportMessage(res.message || 'تم إنشاء حزمة الدعم بنجاح.');
        setSupportSavedPath(res.filePath || null);
      } else {
        setSupportMessage(res?.message || 'تعذر استخراج حزمة الدعم الفني');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSupportMessage(`خطأ في استخراج الحزمة: ${msg}`);
    } finally {
      setSupportLoading(false);
    }
  };

  const handleCopyFingerprint = async () => {
    const fp = licenseInfo?.deviceFingerprint || 'RAFIQ-POS-HOST';
    try {
      await navigator.clipboard.writeText(fp);
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText('01097782965');
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div 
        className="w-full max-w-5xl h-[88vh] max-h-[820px] bg-white rounded-2xl shadow-2xl border border-[#dce1dc] flex flex-col overflow-hidden font-sans text-[#0f172a]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#00372d] text-white flex items-center justify-between shrink-0 select-none shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#006d41] flex items-center justify-center text-white shadow-inner">
              <HelpCircle className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">مركز المساعدة والدعم الفني</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  يعمل بدون إنترنت (Offline)
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/80 m-0">
                شروحات مصورة، إجابات على الأسئلة الشائعة، وطلب الدعم الفني المباشر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('support')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSection === 'support'
                  ? 'bg-amber-400 text-[#00372d] shadow-sm'
                  : 'bg-white/10 hover:bg-white/20 text-emerald-100'
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>طلب الدعم المباشر</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="إغلاق (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar & Fast Navigation Bar */}
        <div className="p-3 bg-[#f8fafc] border-b border-[#dce1dc] flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#52605d] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في مركز المساعدة (مثال: باركود، وزن، مرتجع، آجل، طابعة، نسخة احتياطية)..."
              className="w-full h-10 pr-9 pl-9 rounded-xl bg-white border border-[#dce1dc] focus:border-[#006d41] focus:ring-2 focus:ring-[#006d41]/20 text-xs text-[#0f172a] placeholder-[#52605d]/60 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Body: 2 Columns (Sidebar Tabs + Content Area) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Navigation Sidebar */}
          <div className="w-64 bg-[#f8fafc] border-l border-[#dce1dc] p-2 flex flex-col gap-1 overflow-y-auto shrink-0 select-none">
            <span className="text-[11px] font-bold text-[#52605d] px-2 py-1">
              شروحات شاشات البرنامج
            </span>

            <button
              type="button"
              onClick={() => setActiveSection('pos')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'pos'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="w-4 h-4" />
                <span>نقطة البيع والكاشير</span>
              </div>
              <span className={`text-[10px] font-mono px-1 rounded ${activeSection === 'pos' ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                F1
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('products')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'products'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4" />
                <span>الأصناف والمخزون</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('purchases')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'purchases'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4" />
                <span>المشتريات والموردين</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('customers')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'customers'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>العملاء والديون والآجل</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('sales')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'sales'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4" />
                <span>المبيعات والإغلاق اليومي</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('backup_security')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'backup_security'
                  ? 'bg-[#00372d] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4" />
                <span>النسخ الاحتياطي والأمان</span>
              </div>
            </button>

            <div className="h-px bg-[#dce1dc] my-2" />

            <span className="text-[11px] font-bold text-[#52605d] px-2 py-1">
              المساعدة التفاعلية
            </span>

            <button
              type="button"
              onClick={() => setActiveSection('faq')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeSection === 'faq'
                  ? 'bg-[#006d41] text-white shadow-xs'
                  : 'text-[#52605d] hover:bg-[#edf2ee] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileQuestion className="w-4 h-4" />
                <span>الأسئلة الشائعة (FAQ)</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                {FAQS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('support')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer mt-auto border ${
                activeSection === 'support'
                  ? 'bg-[#00372d] text-amber-300 border-[#00372d] shadow-xs'
                  : 'bg-emerald-50 text-[#006d41] border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Headphones className="w-4 h-4" />
                <span>طلب الدعم والمواصفات</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          </div>

          {/* Content Viewport */}
          <div className="flex-1 p-5 overflow-y-auto bg-white min-h-0">
            {/* Search Results Override View */}
            {searchQuery.trim().length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#dce1dc]">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-[#006d41]" />
                    <span className="text-sm font-bold text-[#0f172a]">
                      نتائج البحث عن: "{searchQuery}"
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    وجد {filteredArticles.length} شرح و {filteredFaqs.length} سؤال شائع
                  </span>
                </div>

                {filteredArticles.length === 0 && filteredFaqs.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 gap-2">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                    <p className="font-bold text-sm">لم يتم العثور على شروحات مطابقة لهذا البحث</p>
                    <p className="text-xs text-slate-400">
                      جرب البحث بكلمات أخرى مثل "كاشير"، "باركود"، "ديون"، أو تواصل مع الدعم المباشر.
                    </p>
                  </div>
                ) : null}

                {/* Matching Guides */}
                {filteredArticles.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold text-[#52605d] uppercase tracking-wider">
                      شروحات الشاشات والخطوات
                    </h3>
                    {filteredArticles.map((art) => (
                      <div
                        key={art.id}
                        className="p-4 rounded-xl border border-[#dce1dc] hover:border-[#006d41]/50 bg-[#f8fafc] transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-[#00372d]">{art.title}</h4>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSection(art.sectionId);
                              setSearchQuery('');
                            }}
                            className="text-xs font-bold text-[#006d41] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>عرض الدليل الكامل</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 m-0">{art.summary}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Matching FAQs */}
                {filteredFaqs.length > 0 && (
                  <div className="flex flex-col gap-3 mt-2">
                    <h3 className="text-xs font-bold text-[#52605d] uppercase tracking-wider">
                      الأسئلة الشائعة المطابقة
                    </h3>
                    {filteredFaqs.map((faq) => (
                      <div
                        key={faq.id}
                        className="p-4 rounded-xl border border-[#dce1dc] bg-[#f8fafc] flex flex-col gap-2"
                      >
                        <span className="text-[10px] font-bold text-[#006d41] bg-emerald-50 px-2 py-0.5 rounded-md w-fit border border-emerald-200">
                          {faq.category} • {faq.tag}
                        </span>
                        <h4 className="font-bold text-xs text-[#0f172a] m-0">{faq.question}</h4>
                        <p className="text-xs text-slate-600 m-0 leading-relaxed">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Standard Category View (when not searching) */}
            {searchQuery.trim().length === 0 && (
              <>
                {/* 1. ARTICLES VIEW */}
                {activeSection !== 'faq' && activeSection !== 'support' && activeArticle && (
                  <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                    {/* Title banner */}
                    <div className="flex flex-col gap-1.5 pb-4 border-b border-[#dce1dc]">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[#00372d] m-0">
                          {activeArticle.title}
                        </h3>
                        <span className="text-xs font-bold text-[#006d41] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>شرح عملي خطوة بخطوة</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed m-0">
                        {activeArticle.summary}
                      </p>
                    </div>

                    {/* Golden Rule Tip Card */}
                    {activeArticle.goldenRule && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-3 shadow-2xs">
                        <Flame className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs leading-relaxed">
                          <span className="font-bold block text-amber-800 mb-0.5">
                            نصيحة ذهبية لسرعة العمل:
                          </span>
                          <span>{activeArticle.goldenRule}</span>
                        </div>
                      </div>
                    )}

                    {/* Step by Step Visual Guide Cards */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#52605d]">
                        <Keyboard className="w-4 h-4 text-[#00372d]" />
                        <span>الخطوات العملية واختصارات السرعة:</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeArticle.steps.map((st, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-xl border border-[#dce1dc] hover:border-[#006d41]/60 bg-[#f8fafc] flex flex-col gap-2 transition-all shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-[#00372d] text-white text-xs font-bold flex items-center justify-center shrink-0">
                                  {st.badge}
                                </span>
                                <h4 className="font-bold text-xs text-[#0f172a] m-0">
                                  {st.title}
                                </h4>
                              </div>

                              {st.shortcut && (
                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-[#dce1dc] text-[#00372d] shadow-2xs">
                                  {st.shortcut}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-600 leading-relaxed m-0 font-sans">
                              {st.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Troubleshooting Footnote */}
                    {activeArticle.troubleshooting && (
                      <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          <span className="font-bold">حل المشاكل الشائعة: </span>
                          <span>{activeArticle.troubleshooting}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. FAQ ACCORDION VIEW */}
                {activeSection === 'faq' && (
                  <div className="flex flex-col gap-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-3 border-b border-[#dce1dc]">
                      <div>
                        <h3 className="text-base font-bold text-[#00372d] m-0">
                          الأسئلة الشائعة وحلول المشاكل الواقعية
                        </h3>
                        <p className="text-xs text-slate-500 m-0">
                          إجابات واضحة ومباشرة لتساؤلات أصحاب المتاجر ومحلات التجزئة بدون إنترنت
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {FAQS.length} إجابة معتمدة
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {FAQS.map((faq) => {
                        const isExpanded = expandedFaqId === faq.id;
                        return (
                          <div
                            key={faq.id}
                            className={`rounded-xl border transition-all overflow-hidden ${
                              isExpanded
                                ? 'border-[#006d41] bg-white shadow-xs'
                                : 'border-[#dce1dc] bg-[#f8fafc] hover:border-slate-400'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                              className="w-full p-3.5 text-right flex items-center justify-between gap-3 cursor-pointer select-none"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100/70 text-[#006d41] border border-emerald-200 shrink-0">
                                  {faq.tag}
                                </span>
                                <span className="font-bold text-xs text-[#0f172a] leading-tight">
                                  {faq.question}
                                </span>
                              </div>

                              <span className="text-slate-400 shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#006d41]" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 text-xs text-slate-700 leading-relaxed border-t border-[#dce1dc]/60 bg-white">
                                <p className="m-0 font-sans">{faq.answer}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. SUPPORT & DIAGNOSTICS VIEW (Task 147-3) */}
                {activeSection === 'support' && (
                  <div className="flex flex-col gap-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-3 border-b border-[#dce1dc]">
                      <div>
                        <h3 className="text-base font-bold text-[#00372d] m-0">
                          طلب الدعم الفني المباشر وبيانات الجهاز
                        </h3>
                        <p className="text-xs text-slate-500 m-0">
                          بيانات جهازك والترخيص ورقم الاتصال المباشر مع مهندسي رفيق POS
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>دعم فني معتمد</span>
                      </div>
                    </div>

                    {/* Direct Contact Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Phone Call Card */}
                      <div className="p-4 rounded-xl bg-[#00372d] text-white flex flex-col justify-between gap-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <PhoneCall className="w-4 h-4 text-amber-300" />
                            <span className="text-xs font-bold text-white">الهاتف وخدمة العملاء المباشرة</span>
                          </div>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/20 font-bold">
                            متاح طوال الأسبوع
                          </span>
                        </div>

                        <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-white/10">
                          <a
                            href="tel:01097782965"
                            className="font-mono text-base font-black tracking-wider text-amber-300 hover:underline select-all"
                            dir="ltr"
                            title="انقر للاتصال المباشر"
                          >
                            01097782965
                          </a>

                          <button
                            type="button"
                            onClick={() => void handleCopyPhone()}
                            className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedPhone ? 'تم النسخ' : 'نسخ الرقم'}</span>
                          </button>
                        </div>

                        <p className="text-[11px] text-emerald-100/70 m-0">
                          يمكنك أيضاً مراسلتنا عبر الواتساب على نفس الرقم لإرسال حزمة الدعم أو الاستفسار.
                        </p>
                      </div>

                      {/* Hardware Fingerprint & Machine Identity */}
                      <div className="p-4 rounded-xl border border-[#dce1dc] bg-[#f8fafc] flex flex-col justify-between gap-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
                            <KeyRound className="w-4 h-4 text-[#006d41]" />
                            <span>بصمة هذا الجهاز (Machine ID)</span>
                          </div>
                          <span className="text-[10px] text-slate-500">مطلوبة لتفعيل الترخيص</span>
                        </div>

                        <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-[#dce1dc]">
                          <span className="font-mono text-xs font-bold text-[#00372d] tracking-wider truncate select-all" dir="ltr">
                            {licenseInfo?.deviceFingerprint || 'RAFIQ-POS-HOST'}
                          </span>

                          <button
                            type="button"
                            onClick={() => void handleCopyFingerprint()}
                            className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[#0f172a] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                          >
                            {copiedFingerprint ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedFingerprint ? 'تم النسخ' : 'نسخ'}</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span>اسم المحل: <strong>{licenseInfo?.shopName || 'متجر رفيق'}</strong></span>
                          <span>الترخيص: <strong className="text-[#006d41]">{licenseInfo?.statusLabel || 'مفعّل'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* System Diagnostic Spec Grid */}
                    <div className="p-3.5 rounded-xl border border-[#dce1dc] bg-[#f8fafc] flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
                        <Cpu className="w-4 h-4 text-[#00372d]" />
                        <span>مواصفات وإصدار النظام الحالي:</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">إصدار البرنامج</span>
                          <span className="font-mono font-bold text-[#00372d]">{sysInfo?.version || 'v1.0.0'}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">نظام التشغيل</span>
                          <span className="font-bold text-[#0f172a] truncate block">{sysInfo?.osVersion || 'Windows'}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">قاعدة البيانات</span>
                          <span className="font-bold text-[#006d41]">{sysInfo?.dbStatus ? 'نشطة ومؤمنة' : 'متصلة'}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-[#dce1dc]">
                          <span className="text-[10px] text-slate-500 block">نوع الترخيص</span>
                          <span className="font-bold text-[#0f172a]">{licenseInfo?.licenseType || 'دائم'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Support Bundle Generation Action Card (Task 147-3 & Feature #111) */}
                    <div className="p-4 rounded-xl border border-[#006d41]/30 bg-emerald-50/50 flex flex-col gap-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#006d41]" />
                          <span className="font-bold text-xs text-[#00372d]">
                            توليد حزمة معلومات الدعم الفني وسجل الأخطاء (Support Bundle)
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-md">
                          محمية وخالية من بيانات الزبائن والأسعار
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed m-0 font-sans">
                        انقر على الزر لتوليد ملف مضغوط آمن على سطح المكتب يحتوي حصراً على مواصفات الجهاز الفنية وسجل العمليات لمساعدة المهندسين على حل المشكلة فوراً.
                      </p>

                      {supportMessage && (
                        <div className="p-3 rounded-lg bg-white border border-emerald-300 text-xs text-slate-800 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-800">{supportMessage}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSupportMessage(null);
                                setSupportSavedPath(null);
                              }}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {supportSavedPath && (
                            <span className="font-mono text-[11px] text-slate-500 bg-slate-100 p-1.5 rounded break-all" dir="ltr">
                              {supportSavedPath}
                            </span>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleCreateSupportBundle()}
                        disabled={supportLoading}
                        className="h-10 bg-[#006d41] hover:bg-[#005a36] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          {supportLoading
                            ? 'جاري جمع سجلات النظام وضغط الحزمة...'
                            : 'توليد حزمة الدعم الفني على سطح المكتب الآن'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#f8fafc] border-t border-[#dce1dc] flex items-center justify-between text-xs text-slate-500 select-none shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">
              نظام رفيق POS — نظام إدارة نقاط البيع والمتاجر ومحلات التجزئة
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px]">مساعدة F1</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-[#0f172a] font-bold text-xs transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

