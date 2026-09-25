import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Store, 
  ShoppingCart, 
  Milk, 
  Gift, 
  Printer, 
  HardDrive, 
  CheckCircle2, 
  ArrowLeft, 
  ArrowRight, 
  Loader2, 
  ShieldCheck, 
  X,
  Smartphone,
  Apple,
  BookOpen,
  Flame,
  Shirt,
  Check,
  Receipt
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';

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

export interface FirstRunWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
  isFirstRun?: boolean;
}

const INITIAL_STORE_TEMPLATES: StoreTemplateDto[] = [
  {
    id: 'supermarket',
    name: 'سوبرماركت ومواد غذائية',
    description: 'مناسب لمحلات السوبرماركت ومحلات البقالة الكبيرة التي تستخدم الباركود والميزان والآجل',
    icon: 'shopping-cart',
    featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: true },
    categories: ['معلبات وبقوليات', 'ألبان وأجبان', 'منظفات وعناية منزلية', 'بسكويت وحلويات', 'مشروبات وعصائر', 'مخبوزات', 'خضار وفاكهة'],
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
    productsCount: 35,
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
    productsCount: 28,
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
    productsCount: 24,
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
    productsCount: 30,
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
    productsCount: 27,
    defaultSettings: { receipt_header: 'مكتبة رفيق للقرطاسية والهدايا', receipt_footer: 'نتمنى لطلابنا الأعزاء دوام التوفيق والنجاح!' }
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
    productsCount: 30,
    defaultSettings: { receipt_header: 'عطارة ومحامص رفيق الفاخرة', receipt_footer: 'أجود أنواع البن والتوابل الطازجة.. بالهناء والشفاء' }
  },
  {
    id: 'clothing_apparel',
    name: 'ملابس وأحذية وأزياء',
    description: 'مناسب لمحلات الملابس والأحذية والأزياء والحقائب (بدون ميزان وأوزان)',
    icon: 'shirt',
    featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
    categories: ['رجالي', 'حريمي', 'أطفال', 'أحذية ومصنوعات جلدية', 'إكسسوارات وطرح'],
    quickItems: [
      { Name: 'تيشيرت قطن سادة', PricePiasters: 15000, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
      { Name: 'قميص كاجوال', PricePiasters: 25000, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
      { Name: 'بنطلون جينز', PricePiasters: 30000, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
      { Name: 'طرحة شيفون فاخرة', PricePiasters: 6500, Unit: 'piece', CategoryName: 'إكسسوارات وطرح', IsOpenPrice: false },
      { Name: 'شراب قطن 3 قطع', PricePiasters: 4500, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
      { Name: 'كيس ملابس فاخر للمحل', PricePiasters: 500, Unit: 'piece', CategoryName: 'إكسسوارات وطرح', IsOpenPrice: false }
    ],
    productsCount: 25,
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
    productsCount: 25,
    defaultSettings: { receipt_header: 'أهلاً بكم في متجرنا', receipt_footer: 'شكراً لتعاملكم معنا' }
  }
];

export const FirstRunWizardModal: React.FC<FirstRunWizardModalProps> = ({
  isOpen,
  onClose,
  onCompleted,
  isFirstRun = false,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<StoreTemplateDto[]>(INITIAL_STORE_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('supermarket');

  // Step 2: Store Profile
  const [storeName, setStoreName] = useState('متجر رفيق');
  const [phone, setPhone] = useState('01012345678');
  const [address, setAddress] = useState('الشارع الرئيسي - وسط البلد');
  const [receiptHeader, setReceiptHeader] = useState('أهلاً بكم في متجرنا');
  const [receiptFooter, setReceiptFooter] = useState('شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً');

  // Step 3: Hardware & Backup
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [backupFolder, setBackupFolder] = useState<string>('D:\\RafiqBackups');
  const [seedInitialProducts, setSeedInitialProducts] = useState<boolean>(true);

  // Result state
  const [appliedStats, setAppliedStats] = useState<{ categoriesCount: number; quickItemsCount: number; productsCount: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [tplList, printerList] = await Promise.all([
          invoke<StoreTemplateDto[]>('templates:getAll'),
          invoke<{ name: string; isDefault: boolean }[]>('printer:list'),
        ]);

        if (active) {
          if (Array.isArray(tplList) && tplList.length > 0) {
            const cleanList = tplList.filter((t) => t.id !== 'accessories_gifts');
            if (cleanList.length > 0) {
              setTemplates(cleanList);
              setSelectedTemplateId((prev) => cleanList.some((t) => t.id === prev) ? prev : cleanList[0].id);
            }
          }
          if (Array.isArray(printerList)) {
            setPrinters(printerList);
            const def = printerList.find((p) => p.isDefault);
            setSelectedPrinter(def ? def.name : (printerList.length > 0 ? printerList[0].name : ''));
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load initial wizard data:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  // Update receipt defaults when template changes
  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      if (tpl.defaultSettings?.receipt_header) {
        setReceiptHeader(tpl.defaultSettings.receipt_header);
      }
      if (tpl.defaultSettings?.receipt_footer) {
        setReceiptFooter(tpl.defaultSettings.receipt_footer);
      }
      if (storeName === 'سوبرماركت رفيق' || storeName === 'متجر رفيق للهواتف والإلكترونيات' || storeName.includes('رفيق')) {
        if (id === 'phones_electronics') setStoreName('متجر رفيق للهواتف والإلكترونيات');
        else if (id === 'dairy_bakery') setStoreName('ألبان ومخبوزات رفيق');
        else if (id === 'produce_butchery') setStoreName('أسواق رفيق للخضار والفاكهة');
        else if (id === 'stationery_gifts') setStoreName('مكتبة رفيق للقرطاسية والهدايا');
        else if (id === 'spices_roastery') setStoreName('عطارة ومحامص رفيق');
        else if (id === 'clothing_apparel') setStoreName('متاجر رفيق للأزياء');
        else setStoreName('متجر رفيق');
      }
    }
  };

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await invoke('templates:apply', {
        templateId: selectedTemplateId,
        storeName: storeName.trim(),
        storePhone: phone.trim(),
        storeAddress: address.trim(),
        receiptHeader: receiptHeader.trim(),
        receiptFooter: receiptFooter.trim(),
        defaultPrinter: selectedPrinter,
        backupFolder: backupFolder.trim(),
        seedInitialProducts: seedInitialProducts,
      });

      if (res && res.success) {
        setAppliedStats({
          categoriesCount: res.categoriesCount || 0,
          quickItemsCount: res.quickItemsCount || 0,
          productsCount: res.productsCount != null ? res.productsCount : (seedInitialProducts ? (selectedTemplate.productsCount || 30) : 0),
        });
        setTimeout(() => {
          onCompleted();
        }, 1400);
      } else {
        setError(res?.message || 'فشل تطبيق القالب');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const getTemplateIcon = (iconName: string) => {
    switch (iconName) {
      case 'shopping-cart':
        return <ShoppingCart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'smartphone':
      case 'phone':
        return <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'milk':
        return <Milk className="w-5 h-5 text-sky-600 dark:text-sky-400" />;
      case 'apple':
      case 'produce':
        return <Apple className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />;
      case 'book':
      case 'stationery':
        return <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case 'flame':
      case 'spices':
        return <Flame className="w-5 h-5 text-orange-600 dark:text-orange-400" />;
      case 'shirt':
      case 'clothing':
        return <Shirt className="w-5 h-5 text-violet-600 dark:text-violet-400" />;
      case 'gift':
        return <Gift className="w-5 h-5 text-pink-600 dark:text-pink-400" />;
      default:
        return <Store className="w-5 h-5 text-teal-600 dark:text-teal-400" />;
    }
  };

  if (!isOpen) return null;

  // STEP RENDERER HELPER
  const renderStepBody = () => {
    if (appliedStats) {
      return (
        <div className="p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-3xl text-center space-y-4 max-w-2xl mx-auto my-8 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 mx-auto flex items-center justify-center shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="font-black text-2xl text-emerald-950 dark:text-emerald-200">
            تم تهيئة وتجهيز النظام بنجاح!
          </h3>
          <p className="text-sm text-emerald-800 dark:text-emerald-300 font-semibold leading-relaxed">
            تم إنشاء <span className="font-extrabold text-emerald-950 dark:text-white">{appliedStats.categoriesCount}</span> تصنيفات رئيسية، و <span className="font-extrabold text-emerald-950 dark:text-white">{appliedStats.productsCount}</span> صنف فعلي بباركود حقيقي جاهز للبيع فوراً، و <span className="font-extrabold text-emerald-950 dark:text-white">{appliedStats.quickItemsCount}</span> أزرار كاشير سريعة. جاري نقلك فوراً لشاشة نقطة البيع...
          </p>
          <div className="pt-2 flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري تحميل بيانات المتجر الجديد...</span>
            </div>
          </div>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between text-xs text-emerald-950 dark:text-emerald-200">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-bold leading-relaxed">
                اختر القالب الأقرب لطبيعة محلك؛ سيقوم رفيق بضبط الميزات (مثل الميزان أو الصلاحية)، وإنشاء الفئات، وتجهيز كتالوج أصناف فعلية بأسعار وباركودات قابلة للمسح فوراً:
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl.id)}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                    isSelected
                      ? 'border-[#006d41] bg-emerald-50/70 dark:bg-emerald-950/40 ring-4 ring-emerald-500/10 shadow-md scale-[1.01]'
                      : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700/80 flex items-center justify-center shrink-0 shadow-xs">
                      {getTemplateIcon(tpl.icon)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                          {tpl.name}
                        </span>
                        {isSelected && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-[#006d41] text-white shrink-0 flex items-center gap-1 shadow-xs">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>تم الاختيار</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {tpl.description}
                      </p>
                    </div>
                  </div>

                  {/* Summary Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-black flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>{tpl.productsCount || 30} صنف جاهز للبيع</span>
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 font-bold">
                      {tpl.categories.length} أقسام
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 font-bold">
                      {tpl.quickItems.length} أزرار سريعة
                    </span>
                    {tpl.featureFlags?.feature_scale_weight && (
                      <span className="px-2 py-1 rounded-lg bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 font-bold">
                        دعم الميزان
                      </span>
                    )}
                    {tpl.featureFlags?.feature_expiry_dates && (
                      <span className="px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 font-bold">
                        تاريخ الصلاحية
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Inputs Column */}
          <div className="lg:col-span-7 space-y-4 bg-white dark:bg-slate-800/60 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
              <Store className="w-4 h-4 text-emerald-600" />
              <span>معلومات المنشأة وعناوين الإيصال</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  اسم المحل / المنشأة *
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#006d41] focus:outline-none"
                  placeholder="سوبرماركت رفيق"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  رقم الهاتف / خدمة العملاء *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#006d41] focus:outline-none"
                  placeholder="01012345678"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                العنوان بالتفصيل
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#006d41] focus:outline-none"
                placeholder="الشارع الرئيسي - بجوار المسجد الكبير"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  رسالة الترحيب أعلى الفاتورة (رأس الإيصال)
                </label>
                <input
                  type="text"
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#006d41] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  شروط الاستبدال أسفل الفاتورة (تذييل الإيصال)
                </label>
                <input
                  type="text"
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#006d41] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Live Receipt Paper Preview */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-800/60 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-2">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>معاينة حية لإيصال الكاشير الحراري (80 مم)</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                تحديث فوري
              </span>
            </div>

            {/* Paper Container */}
            <div className="bg-[#fffef9] text-slate-900 p-5 rounded-2xl border border-slate-300 shadow-md font-mono text-[11px] leading-relaxed mx-auto max-w-xs space-y-2 select-none">
              <div className="text-center space-y-0.5 border-b border-dashed border-slate-400 pb-2">
                <p className="font-extrabold text-sm">{storeName || 'اسم المحل'}</p>
                <p className="text-[10px] text-slate-600">{phone || '010XXXXXXXX'}</p>
                {address && <p className="text-[9px] text-slate-500">{address}</p>}
                <p className="text-[10px] font-bold text-emerald-900 pt-0.5">{receiptHeader}</p>
              </div>

              <div className="flex justify-between text-[10px] text-slate-500 border-b border-dashed border-slate-400 pb-1">
                <span>فاتورة: #000101</span>
                <span>{new Date().toLocaleDateString('ar-EG')}</span>
              </div>

              {/* Sample Table */}
              <div className="space-y-1 py-1 border-b border-dashed border-slate-400">
                <div className="flex justify-between font-bold text-[10px]">
                  <span>صنف عينة 1</span>
                  <span>42.00 ج.م</span>
                </div>
                <div className="flex justify-between font-bold text-[10px]">
                  <span>صنف عينة 2</span>
                  <span>15.00 ج.م</span>
                </div>
              </div>

              <div className="flex justify-between font-black text-xs pt-1">
                <span>الإجمالي:</span>
                <span>57.00 ج.م</span>
              </div>

              <div className="text-center pt-2 border-t border-dashed border-slate-400 text-[10px] text-slate-600 leading-tight">
                <p>{receiptFooter}</p>
                <p className="text-[8px] text-slate-400 pt-1">برنامج رفيق لنقاط البيع - Rafiq POS</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="space-y-5 max-w-3xl mx-auto py-2">
          {/* Printer */}
          <div className="p-6 bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  طابعة الفواتير الافتراضية (Thermal Receipt Printer)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  حدد الطابعة المتصلة بجهاز الكاشير للطباعة السريعة فور الضغط على زر الدفع
                </p>
              </div>
            </div>

            <CustomSelect
              value={selectedPrinter}
              onChange={(val) => setSelectedPrinter(val)}
              placeholder="-- بدون طابعة افتراضية (معاينة فقط) --"
              options={[
                { value: '', label: '-- بدون طابعة افتراضية (معاينة فقط) --' },
                ...printers.map((p) => ({
                  value: p.name,
                  label: p.name,
                  badge: p.isDefault ? 'الافتراضية في ويندوز' : undefined
                }))
              ]}
            />
          </div>

          {/* Backup */}
          <div className="p-6 bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  مسار النسخ الاحتياطي التلقائي للبيانات (Backup Folder)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  يُفضل اختيار مسار على قرص غير قرص النظام (مثل القرص D أو فلاشة USB) لحماية قاعدة بياناتك من مشاكل الويندوز
                </p>
              </div>
            </div>

            <input
              type="text"
              value={backupFolder}
              onChange={(e) => setBackupFolder(e.target.value)}
              className="w-full px-4 py-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#006d41] focus:outline-none"
              placeholder="D:\RafiqBackups"
            />
          </div>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="space-y-5 max-w-3xl mx-auto py-2">
          {/* Review Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
            <div className="p-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-1 shadow-xs">
              <span className="text-slate-400 font-bold block text-[11px]">النشاط التجاري المختار:</span>
              <span className="font-extrabold text-sm text-[#006d41] dark:text-emerald-400 block truncate">
                {selectedTemplate?.name}
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-1 shadow-xs">
              <span className="text-slate-400 font-bold block text-[11px]">اسم المنشأة:</span>
              <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 block truncate">
                {storeName}
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-1 shadow-xs">
              <span className="text-slate-400 font-bold block text-[11px]">طابعة الفواتير:</span>
              <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 block truncate">
                {selectedPrinter || 'معاينة فقط'}
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-1 shadow-xs">
              <span className="text-slate-400 font-bold block text-[11px]">الأقسام والتصنيفات:</span>
              <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                {selectedTemplate?.categories?.length || 0} أقسام رئيسية
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-1 shadow-xs">
              <span className="text-slate-400 font-bold block text-[11px]">أزرار الكاشير السريعة:</span>
              <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                {selectedTemplate?.quickItems?.length || 0} أزرار سريعة
              </span>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-300 dark:border-emerald-800 space-y-1 shadow-xs">
              <span className="text-emerald-700 dark:text-emerald-300 font-bold block text-[11px]">الكتالوج الفعلي الجاهز:</span>
              <span className="font-black text-sm text-emerald-900 dark:text-emerald-100">
                {selectedTemplate?.productsCount || 30} صنف حقيقي بباركود
              </span>
            </div>
          </div>

          {/* Real Catalog Toggle */}
          <label className="p-4 bg-emerald-50/80 dark:bg-emerald-950/20 border-2 border-emerald-300 dark:border-emerald-700 rounded-3xl flex items-center justify-between cursor-pointer hover:bg-emerald-100/60 transition-colors shadow-xs">
            <div className="flex items-center gap-3.5">
              <input
                type="checkbox"
                checked={seedInitialProducts}
                onChange={(e) => setSeedInitialProducts(e.target.checked)}
                className="w-5 h-5 text-[#006d41] rounded border-slate-300 focus:ring-[#006d41]"
              />
              <div>
                <span className="font-black text-sm text-emerald-950 dark:text-emerald-100 block">
                  تحميل كتالوج الأصناف الفعلية الجاهزة لنشاطك (مُوصى به بشدة)
                </span>
                <span className="text-xs text-emerald-800 dark:text-emerald-300 block mt-1 leading-relaxed">
                  يوفّر عليك إدخال البيانات يدوياً؛ سيتم إنشاء {selectedTemplate?.productsCount || 30} صنف أساسي بأسمائها الواقعية وتكلفتها وسعر بيعها وباركوداتها الجاهزة للبيع فوراً مع إمكانية تعديلها أو حذفها في أي وقت.
                </span>
              </div>
            </div>
          </label>

          {/* Reassurance */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>يمكنك في أي وقت لاحق من لوحة الإعدادات تعديل الأسعار، إضافة أصناف جديدة، أو ربط ماسح الباركود والميزان.</span>
          </div>
        </div>
      );
    }

    return null;
  };

  // FULL SCREEN WORKSPACE VIEW (FOR FIRST RUN ONBOARDING)
  if (isFirstRun) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col md:flex-row bg-[#f8fafc] text-slate-800 dark:bg-slate-950 dark:text-slate-100 select-none overflow-hidden font-sans" dir="rtl">
        {/* RIGHT SIDEBAR: Branded Hero & Interactive Stepper */}
        <aside className="w-full md:w-80 lg:w-96 bg-gradient-to-b from-[#00372d] via-[#00261f] to-[#001712] text-white flex flex-col justify-between p-6 shrink-0 relative overflow-hidden border-l border-emerald-800/40 shadow-2xl">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            {/* Logo & Brand Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500/30 to-emerald-400/10 border border-emerald-400/30 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-wide text-white">رفيق</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 uppercase tracking-wider">
                    Rafiq POS
                  </span>
                </div>
                <p className="text-xs text-emerald-200/70 mt-0.5">نظام نقاط البيع وإدارة السوبرماركت</p>
              </div>
            </div>

            {/* Welcome Text */}
            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl p-4">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-300 uppercase tracking-wider mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                التهيئة الأولى للنظام
              </span>
              <h2 className="text-base font-extrabold text-white leading-snug">تخصيص النظام وتجهيز المحل</h2>
              <p className="text-xs text-emerald-100/70 mt-1 leading-relaxed">
                4 خطوات سهلة وسريعة لضبط الفئات والميزات وحقن كتالوج أصناف فعلي كامل جاهز للبيع فوراً.
              </p>
            </div>

            {/* Stepper Timeline */}
            <div className="space-y-4 pt-2">
              {[
                { num: 1, title: 'نوع النشاط والكتالوج', desc: 'تحديد القالب وحقن الأصناف الفعلية', badge: '30+ صنف' },
                { num: 2, title: 'بيانات المحل والفاتورة', desc: 'الاسم، الهاتف، وترويسة الإيصال' },
                { num: 3, title: 'الأجهزة وحفظ البيانات', desc: 'طابعة الكاشير ومسار النسخ الاحتياطي' },
                { num: 4, title: 'المراجعة وتأكيد البدء', desc: 'اعتماد التجهيزات والانتقال للكاشير' },
              ].map((s) => {
                const isActive = step === s.num;
                const isPassed = step > s.num;
                return (
                  <div key={s.num} className="flex items-start gap-3 relative group">
                    {/* Connecting Line */}
                    {s.num < 4 && (
                      <div className={`absolute right-4 top-8 w-0.5 h-7 transition-colors ${
                        isPassed ? 'bg-emerald-500' : 'bg-emerald-900/60'
                      }`} />
                    )}

                    {/* Step Circle */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                      isPassed
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                        : isActive
                        ? 'bg-white text-[#00372d] ring-4 ring-emerald-400/30 font-black shadow-lg scale-105'
                        : 'bg-emerald-950/70 text-emerald-400/60 border border-emerald-800/40'
                    }`}>
                      {isPassed ? <Check className="w-4 h-4 stroke-[3]" /> : s.num}
                    </div>

                    {/* Step Text */}
                    <div className="pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black transition-colors ${
                          isActive ? 'text-white' : isPassed ? 'text-emerald-200' : 'text-emerald-100/50'
                        }`}>
                          {s.title}
                        </span>
                        {s.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                            {s.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-emerald-100/50 mt-0.5 leading-tight">
                        {s.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom System Assurances */}
          <div className="relative z-10 pt-4 border-t border-emerald-800/50 space-y-2 text-[11px] text-emerald-100/70">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>يعمل أوفلاين 100% بدون أي إنترنت</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>حماية مالية فائقة بمعاملات ذرية SQLite WAL</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>جميع الإعدادات والأسعار قابلة للتعديل لاحقاً</span>
            </div>
          </div>
        </aside>

        {/* LEFT MAIN CANVAS: Content, Form, and Navigation */}
        <main className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-slate-900 overflow-hidden">
          {/* Step Header */}
          <header className="px-8 py-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between shadow-xs">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  الخطوة {step} من 4
                </span>
                <h1 className="text-xl font-black text-slate-900 dark:text-white">
                  {step === 1 && 'اختر نوع نشاط محلك التجاري'}
                  {step === 2 && 'بيانات المتجر وهوية الفاتورة'}
                  {step === 3 && 'طابعة الفواتير والنسخ الاحتياطي'}
                  {step === 4 && 'مراجعة التجهيزات والبدء الفعلي'}
                </h1>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {step === 1 && 'سيقوم رفيق بضبط الميزات، وتوليد الفئات، وتجهيز كتالوج أصناف فعلية بأسعار وباركودات جاهزة للبيع فوراً'}
                {step === 2 && 'المعلومات التي ستظهر في أعلى وأسفل إيصال الكاشير المطبوع للعملاء'}
                {step === 3 && 'ضبط طابعة الإيصالات الحرارية ومسار النسخ الاحتياطي التلقائي'}
                {step === 4 && 'تأكيد الخيارات واعتماد التجهيز لفتح شاشة الكاشير وبدء البيع فوراً'}
              </p>
            </div>

            <div className="text-left text-xs font-bold text-slate-500 dark:text-slate-400 hidden sm:block">
              {step === 1 && `${templates.length} قوالب متخصصة`}
              {step === 2 && 'معاينة حية للإيصال'}
              {step === 3 && `${printers.length} طابعة مكتشفة`}
              {step === 4 && 'جاهز للاعتماد والتشغيل'}
            </div>
          </header>

          {/* Content Body (Scrollable, fills space comfortably) */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {error && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <span className="font-bold">تنبيه:</span>
                <span>{error}</span>
              </div>
            )}

            {renderStepBody()}
          </div>

          {/* Fixed Bottom Action Bar */}
          {!appliedStats && (
            <footer className="h-20 px-8 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>النشاط المحدد:</span>
                <span className="font-black text-slate-900 dark:text-white">
                  {selectedTemplate?.name}
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full font-extrabold border border-emerald-200 dark:border-emerald-800">
                  {selectedTemplate?.productsCount || 30} صنف جاهز للبيع
                </span>
              </div>

              <div className="flex items-center gap-3">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((prev) => (prev - 1) as any)}
                    disabled={loading}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>السابق</span>
                  </button>
                )}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 2 && !storeName.trim()) {
                        setError('اسم المحل مطلوب للمتابعة.');
                        return;
                      }
                      setError(null);
                      setStep((prev) => (prev + 1) as any);
                    }}
                    className="px-6 py-2.5 bg-[#00372d] hover:bg-[#004e40] text-white font-extrabold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
                  >
                    <span>
                      {step === 1 && 'المتابعة لبيانات الفاتورة'}
                      {step === 2 && 'المتابعة لإعدادات الأجهزة'}
                      {step === 3 && 'المتابعة للمراجعة والبدء'}
                    </span>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleApply()}
                    disabled={loading}
                    className="px-7 py-3 bg-[#006d41] hover:bg-[#005835] text-white font-black rounded-xl text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>تجهيز النظام وبدء نقطة البيع فوراً</span>
                  </button>
                )}
              </div>
            </footer>
          )}
        </main>
      </div>
    );
  }

  // MODAL DIALOG VIEW (WHEN OPENED FROM SETTINGS)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in text-slate-800 dark:text-slate-100">
      <div 
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-[#00372d] text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/30 flex items-center justify-center border border-emerald-500/30">
              <Sparkles className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg leading-tight">معالج التجهيز السريع للنظام</h2>
              <p className="text-xs text-emerald-100/70">
                تهيئة وتجهيز النظام حسب نشاط محلك
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
          <div className={`flex items-center gap-2 ${step === 1 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-[#006d41] text-white' : (step > 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600')}`}>
              {step > 1 ? '✓' : '1'}
            </span>
            <span>نوع المحل</span>
          </div>
          <div className="h-[2px] w-6 bg-slate-200 dark:bg-slate-700" />
          <div className={`flex items-center gap-2 ${step === 2 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-[#006d41] text-white' : (step > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600')}`}>
              {step > 2 ? '✓' : '2'}
            </span>
            <span>بيانات الفاتورة</span>
          </div>
          <div className="h-[2px] w-6 bg-slate-200 dark:bg-slate-700" />
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-[#006d41] text-white' : (step > 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600')}`}>
              {step > 3 ? '✓' : '3'}
            </span>
            <span>الأجهزة والحفظ</span>
          </div>
          <div className="h-[2px] w-6 bg-slate-200 dark:bg-slate-700" />
          <div className={`flex items-center gap-2 ${step === 4 ? 'text-[#006d41] font-extrabold' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 4 ? 'bg-[#006d41] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'}`}>
              4
            </span>
            <span>التأكيد والبدء</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-sm space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <span className="font-bold">تنبيه:</span>
              <span>{error}</span>
            </div>
          )}

          {renderStepBody()}
        </div>

        {/* Footer Navigation Buttons */}
        {!appliedStats && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                disabled={loading}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 2 && !storeName.trim()) {
                    setError('اسم المحل مطلوب للمتابعة.');
                    return;
                  }
                  setError(null);
                  setStep((prev) => (prev + 1) as any);
                }}
                className="px-5 py-2.5 bg-[#00372d] hover:bg-[#004e40] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>التالي</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={loading}
                className="px-6 py-2.5 bg-[#006d41] hover:bg-[#005835] text-white font-extrabold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>تجهيز النظام والبدء الآن</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
