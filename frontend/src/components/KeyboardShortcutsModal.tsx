import React, { useState, useEffect, useMemo } from 'react';
import {
  Keyboard,
  X,
  Search,
  ShoppingCart,
  DollarSign,
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
    if (isPharmacy) return { label: 'صيدلية وأدوية', icon: <Pill className="w-3.5 h-3.5 text-paid dark:text-paid-bright" /> };
    if (isClothing) return { label: 'محلات الملابس والأحذية', icon: <Shirt className="w-3.5 h-3.5 text-brand dark:text-brand-bright" /> };
    if (isWeighing) return { label: 'أصناف وميزان إلكتروني', icon: <Scale className="w-3.5 h-3.5 text-warn dark:text-warn-bright" /> };
    return { label: 'أنشطة التجزئة العامة', icon: <Sparkles className="w-3.5 h-3.5 text-brand dark:text-brand-bright" /> };
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

  // Every key below is wired in the code: usePosShortcuts.ts (cashier screen), App.tsx (global), UndoToast.tsx, ReceiptModal.tsx
  const allShortcuts: ShortcutGroup[] = useMemo(() => {
    const groups: ShortcutGroup[] = [
      {
        id: 'search_barcode',
        title: 'البحث والمسح وقارئ الباركود',
        icon: <Search className="w-4 h-4 text-brand dark:text-brand-bright" />,
        shortcuts: [
          {
            key: 'F2',
            label: 'الذهاب لخانة البحث / الباركود',
            desc: 'يرجع المؤشر لخانة البحث ويحدد ما فيها، لتمسح باركود جديد أو تكتب اسم الصنف.',
            category: 'pos',
          },
          {
            key: 'Enter',
            label: 'إضافة الصنف للسلة',
            desc: 'يضيف الصنف المكتوب أو الممسوح، أو الصنف المحدد في نتائج البحث.',
            category: 'pos',
          },
          {
            key: '↑ / ↓',
            label: 'التنقل بين نتائج البحث',
            desc: 'تحرّك بالأسهم بين الأصناف الظاهرة تحت الخانة ثم اضغط Enter لإضافة الصنف المحدد.',
            category: 'pos',
          },
          {
            key: 'Esc',
            label: 'إغلاق القائمة أو النافذة المفتوحة',
            desc: 'يقفل نتائج البحث أو أي نافذة مفتوحة ويرجع لشاشة البيع.',
            category: 'pos',
          },
          isPharmacy
            ? {
                key: 'F8',
                label: 'البدائل والمثائل الدوائية',
                desc: 'يقترح بدائل الدواء الناقص بنفس المادة الفعالة مع السعر والمخزون. لإعدادات قارئ الباركود اضغط Ctrl + F8.',
                category: 'pos' as const,
                badge: 'صيدلية',
              }
            : {
                key: 'F8',
                label: 'إعدادات واختبار قارئ الباركود',
                desc: 'يفتح نافذة ضبط قارئ الباركود واختبار سرعة القراءة (تحتاج صلاحية إعدادات الباركود).',
                category: 'pos' as const,
              },
        ],
      },
      {
        id: 'cart_items',
        title: 'السلة والكميات',
        icon: <ShoppingCart className="w-4 h-4 text-brand dark:text-brand-bright" />,
        shortcuts: [
          {
            key: 'F3',
            label: 'تعديل كمية أو وزن آخر صنف',
            desc: 'يفتح نافذة الكمية لآخر صنف في السلة (للأصناف بالوزن تفتح نافذة الوزن).',
            category: 'pos',
          },
          {
            key: '/',
            label: 'تغيير وحدة البيع لآخر صنف',
            desc: 'يبدّل آخر صنف بين قطعة / علبة / كرتونة. يعمل والخانة فاضية، وكذلك بزر / في لوحة الأرقام.',
            category: 'pos',
          },
          {
            key: 'F7',
            label: 'تفريغ السلة وبدء فاتورة جديدة',
            desc: 'يمسح كل أصناف الفاتورة بعد رسالة تأكيد. لا يفعل شيئاً إذا كانت السلة فاضية.',
            category: 'pos',
          },
          {
            key: 'Ctrl + Z',
            label: 'التراجع عن حذف صنف',
            desc: 'يرجّع الصنف المحذوف قبل ما يختفي شريط "تراجع" أسفل الشاشة.',
            category: 'pos',
          },
          {
            key: 'Ctrl + Q',
            label: 'تسجيل نواقص سريع',
            desc: 'يفتح نافذة تسجيل صنف ناقص بسرعة. يعمل أيضاً بالمفتاحين Alt + N.',
            category: 'pos',
            badge: 'النواقص',
          },
        ],
      },
      {
        id: 'payment_checkout',
        title: 'الدفع والفاتورة',
        icon: <DollarSign className="w-4 h-4 text-paid dark:text-paid-bright" />,
        shortcuts: [
          {
            key: 'F9',
            label: 'شاشة الدفع النقدي',
            desc: 'يفتح الدفع النقدي وحساب الباقي. والسلة فاضية يعرض آخر فاتورة لإعادة طباعتها (تحتاج صلاحية إعادة الطباعة).',
            category: 'payment',
          },
          {
            key: 'F12',
            label: 'بيع كاش فوري وطباعة الإيصال',
            desc: 'يقفل الفاتورة كاش مباشرة ويطبع الإيصال بدون فتح أي نافذة.',
            category: 'payment',
            badge: 'الأسرع',
          },
          {
            key: 'F10',
            label: 'دفع فوري بإنستاباي',
            desc: 'والسلة فيها أصناف: يفتح الدفع بإنستاباي مباشرة. والسلة فاضية: يبدّل بين البيع النقدي والآجل.',
            category: 'payment',
          },
          {
            key: 'F4',
            label: 'خصم على الفاتورة',
            desc: 'يفتح نافذة الخصم بالجنيه أو بالنسبة المئوية (تحتاج صلاحية الخصم).',
            category: 'payment',
          },
          {
            key: 'F6',
            label: 'تعليق الفاتورة أو استرجاع معلقة',
            desc: 'والسلة فيها أصناف: يعلّقها لخدمة عميل آخر. والسلة فاضية: يفتح قائمة الفواتير المعلقة.',
            category: 'payment',
          },
          {
            key: 'F11',
            label: 'مرتجع مبيعات',
            desc: 'يفتح نافذة المرتجع (بفاتورة أو بدونها) ويحسب المبلغ المسترد.',
            category: 'payment',
          },
          {
            key: 'F9 / Esc',
            label: 'داخل معاينة الإيصال',
            desc: 'F9 يطبع الإيصال، وEsc يقفل المعاينة.',
            category: 'payment',
          },
        ],
      },
    ];

    // Store-specific notes (only keys/buttons that really exist)
    const storeShortcuts: ShortcutItem[] = [];

    if (isPharmacy) {
      storeShortcuts.push({
        key: 'زر',
        label: 'التأمين الطبي وعلاج شهري',
        desc: 'زر "تأمين" يطبق نسب التحمل ويربط الفاتورة بالشركة، وزر "علاج شهري" يصرف روشتة المريض المزمن. بالماوس فقط، بدون مفتاح.',
        category: 'store_specific',
        badge: 'صيدلية',
      });
    }

    if (isClothing) {
      storeShortcuts.push({
        key: 'زر',
        label: 'مصفوفة المقاسات والألوان',
        desc: 'عند اختيار صنف له مقاسات وألوان تفتح نافذة اختيار المقاس واللون المتاح في المخزن. بالماوس فقط، بدون مفتاح.',
        category: 'store_specific',
        badge: 'ملابس وأحذية',
      });
    }

    if (isWeighing) {
      storeShortcuts.push({
        key: 'مسح',
        label: 'باركود الميزان الإلكتروني',
        desc: 'امسح باركود الميزان وسيُضاف الصنف بالوزن والسعر المقروئين منه مباشرة.',
        category: 'store_specific',
        badge: 'ميزان',
      });
    }

    if (storeShortcuts.length > 0) {
      groups.push({
        id: 'store_specific',
        title: `خاص بنشاطك (${storeBadge.label})`,
        icon: <Zap className="w-4 h-4 text-warn dark:text-warn-bright" />,
        shortcuts: storeShortcuts,
      });
    }

    // Navigation shortcuts: only the screens this shop actually has
    const navShortcuts: ShortcutItem[] = [
      { key: 'F1', label: 'الرجوع لشاشة البيع', desc: 'من أي شاشة أخرى يرجعك للكاشير. وفي شاشة البيع يفتح هذا الدليل.', category: 'navigation' },
      { key: 'Alt + 1', label: 'الكاشير وشاشة البيع', desc: 'الرجوع الفوري لشاشة البيع من أي مكان.', category: 'navigation' },
      { key: 'Alt + 2', label: 'سجل وفواتير البيع', desc: 'استعراض الفواتير السابقة وإعادة طباعتها وعمل مرتجع.', category: 'navigation' },
      { key: 'Alt + 3', label: 'العملاء وحسابات الشكك', desc: 'كشوف حسابات العملاء وسندات سداد الآجل.', category: 'navigation' },
      { key: 'Alt + 4', label: 'الأصناف والمخزن', desc: 'الأصناف والأسعار وحركات وجرد المخزن.', category: 'navigation' },
      { key: 'Alt + 5', label: 'فواتير الشراء والموردين', desc: 'فواتير الاستلام والموردين والنواقص.', category: 'navigation' },
    ];
    if (isEnabled('feature_pos_digital_payments') || isEnabled('feature_digital_wallets')) {
      navShortcuts.push({ key: 'Alt + 6', label: 'المحافظ وإنستاباي', desc: 'حسابات المحافظ والتحويلات وإنستاباي.', category: 'navigation' });
    }
    if (isEnabled('feature_epay_services')) {
      navShortcuts.push({ key: 'Alt + 7', label: 'خدمات وماكينات الدفع', desc: 'ماكينات فوري والخدمات المدفوعة.', category: 'navigation' });
    }
    if (isEnabled('feature_insurance')) {
      navShortcuts.push({ key: 'Alt + 8', label: 'التأمين الطبي والتعاقدات', desc: 'الأعضاء والمطالبات والتعاقدات.', category: 'navigation' });
    }
    navShortcuts.push(
      { key: 'Alt + 9', label: 'المتابعة والتقارير', desc: 'لوحة اليوم والوردية وتحليلات الإيرادات والمخزن والعملاء.', category: 'navigation' },
      { key: 'F5', label: 'تحديث البيانات', desc: 'يحدّث كل البيانات على الشاشة بدون إعادة تشغيل. يعمل أيضاً بـ Ctrl + R.', category: 'navigation' },
      { key: 'F11', label: 'ملء الشاشة (خارج شاشة البيع)', desc: 'في شاشة البيع F11 هو المرتجع، وملء الشاشة من الزر في الشريط العلوي.', category: 'navigation' },
    );
    groups.push({
      id: 'navigation',
      title: 'التنقل بين الشاشات',
      icon: <Compass className="w-4 h-4 text-brand dark:text-brand-bright" />,
      shortcuts: navShortcuts,
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
                <h3 className="t-modal-title text-ink dark:text-ink-dark m-0 truncate">
                  دليل اختصارات الكيبورد السريعة للكاشير
                </h3>
                <span className="text-micro font-mono font-bold px-2 py-0.5 rounded-full bg-brand-soft text-brand border border-brand/20 dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/30 hidden sm:inline-block">
                  F1
                </span>
              </div>
              <div className="flex items-center gap-2 text-micro text-ink-muted dark:text-ink-dark-muted truncate">
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
            className="w-8 h-8 rounded-lg border border-line dark:border-line-dark flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:border-danger/30 transition-colors cursor-pointer shrink-0"
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
                className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark absolute left-2.5 top-1/2 -translate-y-1/2"
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
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
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
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
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
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
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
                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              التنقل
            </button>
          </div>
        </div>

        {/* Content Body: Grid of Shortcut Groups */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
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
                              <span className="text-micro font-bold px-1.5 py-0.2 rounded bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-brand-bright border border-brand/20 dark:border-brand-bright/20">
                                {sc.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-tight mt-0.5">
                            {sc.desc}
                          </p>
                        </div>

                        {/* Visual KBD Key Styling */}
                        <kbd className="shrink-0 px-2 py-1 font-mono text-micro font-extrabold bg-surface dark:bg-surface-dark border border-line-hover dark:border-line-dark text-brand dark:text-brand-bright rounded-lg shadow-xs select-all text-center min-w-[38px]">
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
            <span>بيع سريع من الكيبورد: F2 للبحث، Enter للإضافة، ثم F12 للدفع كاش وطباعة الإيصال</span>
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
              <HelpCircle className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
              <span>دليل الكاشير والدعم</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
