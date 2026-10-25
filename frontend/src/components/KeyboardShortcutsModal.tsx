import React, { useState, useEffect, useMemo } from 'react';
import {
  Keyboard,
  X,
  Search,
  ShoppingCart,
  DollarSign,
  ArrowLeft,
  HelpCircle,
  Sparkles,
  Pill,
  Scale,
  Shirt,
  Compass,
  Zap,
} from 'lucide-react';
import { useFeatures } from '../context/useFeatures';
import { openHelpCenter } from '../utils/helpService';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  label: string;
  desc: string;
  category: 'pos' | 'payment' | 'store_specific' | 'navigation';
  badge?: string;
}

interface ShortcutGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  shortcuts: ShortcutItem[];
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { isEnabled } = useFeatures();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'pos' | 'payment' | 'store_specific' | 'navigation'>('all');

  const [storeType, setStoreType] = useState<string>(() => {
    try {
      return localStorage.getItem('rafiq_store_type') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (!isOpen) return;
    try {
      const savedType = localStorage.getItem('rafiq_store_type');
      if (savedType) setStoreType(savedType);
    } catch {
      // ignore
    }
  }, [isOpen]);

  const isPharmacy = storeType === 'pharmacy' || isEnabled('feature_pharmacy');
  const isClothing = !isPharmacy && (storeType === 'clothing_apparel' || isEnabled('feature_matrix_variants'));
  const isWeighing = storeType === 'produce_butchery' || isEnabled('feature_scale_weight');

  const storeBadge = useMemo(() => {
    if (isPharmacy) return { label: 'صيدلية وأدوية', icon: <Pill className="w-3.5 h-3.5 text-paid" /> };
    if (isClothing) return { label: 'محلات الملابس والأحذية', icon: <Shirt className="w-3.5 h-3.5 text-purple-600" /> };
    if (isWeighing) return { label: 'أصناف وميزان إلكتروني', icon: <Scale className="w-3.5 h-3.5 text-warn" /> };
    return { label: 'أنشطة التجزئة العامة', icon: <Sparkles className="w-3.5 h-3.5 text-brand" /> };
  }, [isPharmacy, isClothing, isWeighing]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // All Defined Shortcuts with contextual inclusion
  const allShortcuts: ShortcutGroup[] = useMemo(() => {
    const groups: ShortcutGroup[] = [
      {
        id: 'search_barcode',
        title: 'البحث والمسح وقارئ الباركود',
        icon: <Search className="w-4 h-4 text-brand dark:text-brand-bright" />,
        shortcuts: [
          {
            key: 'F2',
            label: 'الوقوف الفوري في خانة البحث / الباركود',
            desc: 'يرجع المؤشر لخانة البحث مباشرة لمسح باركود جديد أو كتابة اسم الصنف بدون ماوس',
            category: 'pos',
          },
          {
            key: 'Enter',
            label: 'إضافة الصنف للسلة / تأكيد الاختيار',
            desc: 'إضافة الصنف الممسوح بالباركود أو المختار من نتائج البحث إلى الفاتورة فوراً',
            category: 'pos',
          },
          {
            key: 'F8',
            label: 'ضبط واختبار قارئ الباركود والسرعة',
            desc: 'فتح نافذة اختبار قارئ الباركود، سرعة القراءة، ومطابقة الحروف الإنجليزية والعربية',
            category: 'pos',
          },
          {
            key: 'Esc',
            label: 'إلغاء / إغلاق النوافذ المفتوحة',
            desc: 'قفل أي نافذة منبثقة أو قائمة مفتوحة والعودة الفورية لحقل البيع والباركود',
            category: 'pos',
          },
        ],
      },
      {
        id: 'cart_items',
        title: 'إدارة السلة والكميات والأصناف',
        icon: <ShoppingCart className="w-4 h-4 text-brand dark:text-brand-bright" />,
        shortcuts: [
          {
            key: 'F3',
            label: 'تعديل كمية أو وزن الصنف الأخير',
            desc: 'فتح نافذة تغيير كمية الصنف الأخير بسرعة دون الحاجة للنقر عليه بالماوس',
            category: 'pos',
          },
          {
            key: '+ / -',
            label: 'زيادة أو إنقاص الكمية بوحدة واحدة',
            desc: 'الضغط على زر + يزيد كمية آخر صنف، وزر - يقلل كميته بنقرة كيبورد واحدة',
            category: 'pos',
          },
          {
            key: 'Del',
            label: 'مسح وحذف آخر صنف من الفاتورة',
            desc: 'إزالة الصنف الأخير من السلة فوراً في حالة مسح باركود بالخطأ',
            category: 'pos',
          },
          {
            key: 'Ctrl + Q',
            label: 'تسجيل نواقص سريع في الدفتر',
            desc: 'فتح نافذة تسجيل صنف ناقص أو طلب مريض مباشرة مع ربطه بالكتالوج ودرجة الأولوية',
            category: 'pos',
            badge: 'النواقص',
          },
          {
            key: 'Ctrl + F',
            label: 'إظهار شبكة الأصناف السريعة',
            desc: 'عرض شبكة الأزرار السريعة شائعة البيع بدون باركود (العيش، المشروبات، السجائر)',
            category: 'pos',
          },
        ],
      },
      {
        id: 'payment_checkout',
        title: 'المالية والدفع وتقفيل الفاتورة',
        icon: <DollarSign className="w-4 h-4 text-paid dark:text-paid-bright" />,
        shortcuts: [
          {
            key: 'F9',
            label: 'الدفع الكاش وحساب باقي الزبون',
            desc: 'فتح شاشة السداد النقدي وحساب المبلغ المدفوع وباقي العميل بدقة متناهية',
            category: 'payment',
          },
          {
            key: 'F12',
            label: 'سداد كاش فوري وطباعة الإيصال',
            desc: 'تقفيل الفاتورة كاش فوراً وطباعة الوصل بدون فتح أي نوافذ أو لمس الماوس',
            category: 'payment',
            badge: 'الأسرع',
          },
          {
            key: 'F10',
            label: 'سداد فوري بالفيزا / البطاقة البنكية',
            desc: 'تسجيل عملية البيع كدفع إلكتروني بالفيزا وطباعة إيصال الاستلام مباشرة',
            category: 'payment',
          },
          {
            key: 'Space',
            label: 'شاشة الدفع المتعدد (كاش / فيزا / آجل)',
            desc: 'المسطرة تفتح شاشة خيارات السداد الشاملة لاختيار السداد بالآجل أو تقسيم المبلغ',
            category: 'payment',
          },
          {
            key: 'F4',
            label: 'خصم نقدي على إجمالي الفاتورة',
            desc: 'فتح نافذة عمل خصم مالي بالجنيه أو كنسبة مئوية على إجمالي الفاتورة',
            category: 'payment',
          },
          {
            key: 'F6',
            label: 'تعليق الفاتورة واسترجاعها',
            desc: 'تعليق حساب الزبون الحالي لخدمة زبون آخر، واسترجاع الفاتورة المعلقة بنقرة زر',
            category: 'payment',
          },
          {
            key: 'F7',
            label: 'إلغاء الفاتورة والبدء من جديد',
            desc: 'تصفير السلة بالكامل وبدء فاتورة بيع جديدة بعد التأكيد لمنع أخطاء التصفير',
            category: 'payment',
          },
          {
            key: 'F11',
            label: 'مرتجع مبيعات (بفاتورة أو بدونها)',
            desc: 'تسجيل بضاعة مرتجعة من العميل وحساب المبلغ المسترد وخصمه من الدرج',
            category: 'payment',
          },
        ],
      },
    ];

    // Store-Specific Shortcuts
    const storeShortcuts: ShortcutItem[] = [];

    if (isPharmacy) {
      storeShortcuts.push({
        key: 'زر البدائل / Alt+B',
        label: 'محرك البدائل والمثائل الدوائية',
        desc: 'اقتراح البدائل والمثائل المتطابقة في المادة الفعالة والتركيز للأدوية الناقصة مع الأسعار والمخزون',
        category: 'store_specific',
        badge: 'صيدلية',
      });
      storeShortcuts.push({
        key: 'Ctrl + Q',
        label: 'كشكول النواقص وطلبات المرضى',
        desc: 'تسجيل الأدوية الناقصة فور طلب العميل وتحديد أولوية الطلب واسم المريض لتحويلها لطلبيات شراء',
        category: 'store_specific',
        badge: 'صيدلية',
      });
      storeShortcuts.push({
        key: 'زر تأمين / Alt+I',
        label: 'التأمين الطبي وروشتات التعاقدات',
        desc: 'تطبيق نسب التحمل وخصم الأدوية المغطاة تأمينياً وربط الفاتورة بشركة التأمين الطبية',
        category: 'store_specific',
        badge: 'صيدلية',
      });
      storeShortcuts.push({
        key: 'زر علاج شهري',
        label: 'صرف أدوية الأمراض المزمنة للمرضى',
        desc: 'استدعاء وتنزيل الروشتة الشهرية للمريض المسجل بنقرة زر واحدة دون إعادة مسح كل دواء',
        category: 'store_specific',
        badge: 'صيدلية',
      });
      storeShortcuts.push({
        key: 'F8 / كود التشغيلة',
        label: 'تواريخ الصلاحية وتشغيلات الأدوية',
        desc: 'تطبيق سياسة FEFO (صرف الأقدم صلاحية أولاً) وحوكمة تشغيلات الباتشات على الرف',
        category: 'store_specific',
        badge: 'صيدلية',
      });
    }

    if (isClothing) {
      storeShortcuts.push({
        key: 'مقاسات وألوان / Alt+M',
        label: 'مصفوفة المقاسات والألوان للملابس والأحذية',
        desc: 'اختيار المقاس واللون المتاح في المخزن لكل موديل وتوليد باركود فرعي لكل قياس',
        category: 'store_specific',
        badge: 'ملابس وأحذية',
      });
    }

    if (isWeighing) {
      storeShortcuts.push({
        key: 'مسح باركود الميزان',
        label: 'قراءة باركود الميزان الإلكتروني التلقائي',
        desc: 'قراءة باركود الجبن واللحوم والخضار وتفكيك الوزن بالجرام والسعر وإضافته للسلة فوراً',
        category: 'store_specific',
        badge: 'ميزان',
      });
    }

    if (isEnabled('feature_digital_wallets') || isEnabled('feature_epay_services')) {
      storeShortcuts.push({
        key: 'Alt + 2 / Alt + 3',
        label: 'ماكينات فوري والمحافظ الإلكترونية',
        desc: 'الوصول السريع لماكينات الدفع والتحويلات النقدية وإنستاباي من داخل شاشات العمل',
        category: 'store_specific',
        badge: 'خدمات',
      });
    }

    if (storeShortcuts.length > 0) {
      groups.push({
        id: 'store_specific',
        title: `ميزات واختصارات خاصة بنشاطك (${storeBadge.label})`,
        icon: <Zap className="w-4 h-4 text-warn dark:text-warn-bright" />,
        shortcuts: storeShortcuts,
      });
    }

    // Navigation Shortcuts
    groups.push({
      id: 'navigation',
      title: 'التنقل السريع بين أقسام النظام (Alt + 1..9)',
      icon: <Compass className="w-4 h-4 text-brand dark:text-brand-bright" />,
      shortcuts: [
        { key: 'Alt + 1', label: 'شاشة الكاشير والمبيعات (POS)', desc: 'الرجوع الفوري لشاشة البيع الرئيسية من أي مكان', category: 'navigation' },
        { key: 'Alt + 2', label: 'ماكينات الدفع الإلكتروني وفوري', desc: 'فتح شاشة ماكينات فوري والخدمات', category: 'navigation' },
        { key: 'Alt + 3', label: 'المحافظ الإلكترونية وإنستاباي', desc: 'فتح شاشة حسابات المحافظ والسحب والإيداع', category: 'navigation' },
        { key: 'Alt + 4', label: 'لوحة اليوم والوردية الجارية', desc: 'استعراض مبيعات اليوم وتقرير الدرج النقدي', category: 'navigation' },
        { key: 'Alt + 5', label: 'العملاء وحسابات الشكك', desc: 'فتح كشوف حسابات العملاء وسندات السداد الآجل', category: 'navigation' },
        { key: 'Alt + 6', label: 'الأصناف والمخزن والأسعار', desc: 'فتح قائمة المنتجات وجرد المخزون وتعديل الأسعار', category: 'navigation' },
        { key: 'Alt + 7', label: 'فواتير الشراء ودليل الموردين', desc: 'فتح شاشات المشتريات وفواتير الاستلام ودليل الشركات', category: 'navigation' },
        { key: 'Alt + 8', label: 'سجل وفواتير المبيعات السابقة', desc: 'استعراض وطباعة الفواتير السابقة وعمل المرتجعات', category: 'navigation' },
        { key: 'Alt + 9', label: 'سجل المراقبة والأمان (Audit Log)', desc: 'استعراض الحركات الحساسة وتتبع نشاط المستخدمين', category: 'navigation' },
        { key: 'F5', label: 'تحديث شامل لكافة البيانات والعمليات', desc: 'تحديث فوري لقواعد البيانات والمزامنة دون إعادة تشغيل', category: 'navigation' },
        { key: 'F11', label: 'وضع ملء الشاشة الكامل (Kiosk Mode)', desc: 'تكبير البرنامج بكامل مساحة الشاشة وإخفاء شريط ويندوز', category: 'navigation' },
      ],
    });

    return groups;
  }, [isPharmacy, isClothing, isWeighing, isEnabled, storeBadge.label]);

  // Filtered Shortcuts based on search and category tab
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allShortcuts
      .map((group) => {
        const matchesCategory = activeCategory === 'all' || group.shortcuts.some((s) => s.category === activeCategory);
        if (!matchesCategory) return null;

        const filteredShortcuts = group.shortcuts.filter((s) => {
          if (activeCategory !== 'all' && s.category !== activeCategory) return false;
          if (!q) return true;
          return (
            s.key.toLowerCase().includes(q) ||
            s.label.toLowerCase().includes(q) ||
            s.desc.toLowerCase().includes(q)
          );
        });

        if (filteredShortcuts.length === 0) return null;

        return {
          ...group,
          shortcuts: filteredShortcuts,
        };
      })
      .filter((g): g is ShortcutGroup => g !== null);
  }, [allShortcuts, searchQuery, activeCategory]);

  const totalShortcutsCount = useMemo(() => {
    return allShortcuts.reduce((sum, g) => sum + g.shortcuts.length, 0);
  }, [allShortcuts]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/50 dark:bg-black/75 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-[56px] bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 sm:px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs shrink-0">
              <Keyboard className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-ink dark:text-ink-dark m-0 truncate">
                  دليل اختصارات الكيبورد السريعة للكاشير
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-brand-soft text-brand border border-brand/20 dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/30 hidden sm:inline-block">
                  F1
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-ink-muted dark:text-ink-dark-muted truncate">
                <span>سرعة فائقة بدون لمس الماوس</span>
                <span className="text-line-hover">•</span>
                <span className="flex items-center gap-1 font-bold text-paid dark:text-paid-bright">
                  {storeBadge.icon}
                  {storeBadge.label}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-line dark:border-line-dark flex items-center justify-center text-ink-muted hover:text-danger hover:border-danger/30 transition-colors cursor-pointer shrink-0"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Search & Category Tabs */}
        <div className="bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {/* Quick Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن مفتاح أو عملية (مثلاً: F9, خصم, كاش...)"
              className="w-full h-8 pl-3 pr-8 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright placeholder:text-ink-muted/70 transition-all"
            />
            <Search className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-4 h-4 text-ink-muted hover:text-ink absolute left-2.5 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'all'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              الكل ({totalShortcutsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('pos')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'pos'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              الكاشير والبيع
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('payment')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'payment'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              السداد والمالية
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('store_specific')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                activeCategory === 'store_specific'
                  ? 'bg-paid text-white shadow-2xs'
                  : 'text-paid dark:text-paid-bright hover:bg-paid-soft dark:hover:bg-paid-dark-soft/40'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>خاص بنشاطك</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('navigation')}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'navigation'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              التنقل
            </button>
          </div>
        </div>

        {/* Content Body: Grid of Shortcut Groups */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto max-h-[65vh] flex flex-col gap-4">
          {filteredGroups.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-ink-muted">
              <Search className="w-8 h-8 text-line-hover" />
              <p className="text-sm font-bold text-ink dark:text-ink-dark">لم يتم العثور على اختصارات تطابق بحثك</p>
              <p className="text-xs">جرب البحث بكلمات أخرى أو اختر تبويب "الكل" لعرض كافة المفاتيح</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  className="bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark rounded-xl p-3.5 flex flex-col gap-2.5 shadow-2xs transition-all hover:border-line-hover"
                >
                  {/* Group Header */}
                  <div className="flex items-center gap-2 pb-2 border-b border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark">
                    <div className="w-6 h-6 rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-center shrink-0">
                      {group.icon}
                    </div>
                    <span>{group.title}</span>
                  </div>

                  {/* Shortcuts List */}
                  <div className="flex flex-col gap-2">
                    {group.shortcuts.map((sc, sIdx) => (
                      <div
                        key={sIdx}
                        className="flex items-start justify-between gap-2.5 py-1.5 border-b border-line/50 dark:border-line-dark/50 last:border-b-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-ink dark:text-ink-dark">
                              {sc.label}
                            </span>
                            {sc.badge && (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20">
                                {sc.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted leading-tight mt-0.5">
                            {sc.desc}
                          </p>
                        </div>

                        {/* Visual KBD Key Styling */}
                        <kbd className="shrink-0 px-2 py-1 font-mono text-[11px] font-extrabold bg-surface dark:bg-surface-dark border border-line-hover dark:border-line-dark text-brand dark:text-brand-bright rounded-lg shadow-xs select-all text-center min-w-[38px]">
                          {sc.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-[48px] bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-4 sm:px-5 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-ink-muted dark:text-ink-dark-muted hidden sm:flex">
            <span className="w-2 h-2 rounded-full bg-paid animate-pulse" />
            <span>تقدر تبيع وتقفل الفاتورة 100% من الكيبورد بدون ما تلمس الماوس نهائياً</span>
          </div>

          <div className="flex items-center gap-2 mr-auto sm:mr-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                openHelpCenter('pos');
              }}
              className="h-8 px-3 rounded-lg bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 border border-line dark:border-line-dark text-ink dark:text-ink-dark text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <HelpCircle className="w-3.5 h-3.5 text-brand" />
              <span>دليل الكاشير والدعم</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              <span>تمام، فهمت (Esc)</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
