import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Printer,
  Play,
  Pause,
  RotateCcw,
  CheckSquare,
  Square,
  AlertTriangle,
  ShoppingCart,
  Receipt,
  HardDrive,
  HelpCircle,
  X,
  FileText,
  Video,
  Award,
  Sparkles
} from 'lucide-react';

interface QuickStartGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'sheet' | 'videos' | 'checklist';
}

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  done: boolean;
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  {
    id: 'c1',
    category: 'العتاد والتجهيز',
    title: 'فحص قارئ الباركود',
    description: 'مسح 3 منتجات والتأكد من إضافة الصنف للسلة تلقائياً بدون الضغط على الفأرة.',
    done: false,
  },
  {
    id: 'c2',
    category: 'العتاد والتجهيز',
    title: 'فحص الطابعة الحرارية ودرج النقدية',
    description: 'طباعة تجريبية 80mm أو 57mm والتأكد من فتح الدرج مع كل عملية بيع.',
    done: false,
  },
  {
    id: 'c3',
    category: 'البيع السريع',
    title: 'تدريب الكاشير على اختصارات الكيبورد (F1 - F12)',
    description: 'F2 للبحث، F4 للكمية، F6 للسعر، F9 للدفع السريع، F10 تعليق الفاتورة.',
    done: false,
  },
  {
    id: 'c4',
    category: 'البيع السريع',
    title: 'إجراء أول عملية بيع نقدي كاملة',
    description: 'تمرير المنتجات، إدخال المبلغ المستلم، استخراج الباقي، وطباعة الإيصال.',
    done: false,
  },
  {
    id: 'c5',
    category: 'الآجل والعملاء',
    title: 'تسجيل بيعة آجل لعميل وفحص الرصيد',
    description: 'اختيار العميل بالهاتف أو الاسم، إضافة البيعة على الحساب، ومراجعة كشف الحساب.',
    done: false,
  },
  {
    id: 'c6',
    category: 'الإقفال والوردية',
    title: 'تدريب على قفل اليومية (Z-Report)',
    description: 'فتح نافذة الإقفال، عد النقدية في الدرج، مقارنة الفعلي بالمتوقع، وطباعة التقرير.',
    done: false,
  },
  {
    id: 'c7',
    category: 'حماية البيانات',
    title: 'توصيل فلاشة USB وأخذ أول نسخة احتياطية',
    description: 'اختيار الفلاشة، الضغط على «خذ نسخة الآن»، والتأكد من ظهور البصمة الخضراء.',
    done: false,
  },
  {
    id: 'c8',
    category: 'حماية البيانات',
    title: 'تجربة حزمة نقل المحل (.rafiqpkg)',
    description: 'شرح كيفية استخراج ملف المحل بالكامل لنقله إلى أي كمبيوتر آخر دون مبرمج.',
    done: false,
  },
  {
    id: 'c9',
    category: 'الطوارئ والدعم',
    title: 'شرح خطة الطوارئ عند انقطاع الكهرباء',
    description: 'توضيح حفظ البيانات المستمر في وضع SQLite WAL وأن النظام لا يفقد أي فاتورة.',
    done: false,
  },
  {
    id: 'c10',
    category: 'التسليم',
    title: 'تسليم دليل الورقة الواحدة المطبوع A4',
    description: 'طباعة الدليل الورقي وتعليقه بجوار شاشة الكاشير لمراجعته السريعة.',
    done: false,
  },
];

export const QuickStartGuideModal: React.FC<QuickStartGuideModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'sheet',
}) => {
  const [activeTab, setActiveTab] = useState<'sheet' | 'videos' | 'checklist'>(initialTab);

  // Video Player Simulation State
  const [selectedVideo, setSelectedVideo] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [playbackStep, setPlaybackStep] = useState<number>(0);

  // Checklist State
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    try {
      const saved = localStorage.getItem('rafiq_training_checklist_v1');
      if (saved) return JSON.parse(saved);
    } catch { }
    return INITIAL_CHECKLIST;
  });

  useEffect(() => {
    try {
      localStorage.setItem('rafiq_training_checklist_v1', JSON.stringify(checklist));
    } catch { }
  }, [checklist]);

  // Handle Video Simulation Timer
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setPlaybackProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 100;
          }
          const next = prev + 5;
          setPlaybackStep(Math.floor((next / 100) * 4));
          return next;
        });
      }, 500);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handleSelectVideo = (idx: number) => {
    setSelectedVideo(idx);
    setIsPlaying(false);
    setPlaybackProgress(0);
    setPlaybackStep(0);
  };

  const handleToggleCheck = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const completedCount = checklist.filter((i) => i.done).length;
  const progressPercent = Math.round((completedCount / checklist.length) * 100);

  const VIDEOS = [
    {
      id: 1,
      title: 'فيديو 1: أول عملية بيع واستخدام الكيبورد والطباعة',
      duration: '1:45 دقيقة',
      description: 'تعلم كيف تبيع منتجاً بالباركود، تعدل الكمية، وتطبع الإيصال في 3 ثوانٍ.',
      steps: [
        '1. مرر قارئ الباركود على المنتج أو اضغط F2 للبحث بالاسم.',
        '2. اضغط F4 لتعديل الكمية إذا اشترى العميل أكثر من قطعة.',
        '3. اضغط F9 لفتح شاشة الدفع السريع وأدخل المبلغ المستلم من العميل.',
        '4. اضغط Enter لتأكيد البيع وطباعة الفاتورة وفتح درج النقدية فوراً.',
      ],
    },
    {
      id: 2,
      title: 'فيديو 2: إقفال اليومية ومطابقة درج النقدية بالمليم',
      duration: '2:10 دقيقة',
      description: 'شرح خطوات قفل الوردية، عد النقدية في الدرج، وفحص الفارق مع طباعة Z-Report.',
      steps: [
        '1. اضغط F11 أو توجه إلى قائمة التقارير واختر «قفل اليومية».',
        '2. راجع إجمالي المبيعات والمرتجعات ومبيعات الآجل المحسوبة آلياً.',
        '3. قم بعد النقود الفعلية داخل الدرج وأدخلها في خانة «النقد المعدود».',
        '4. اضغط «حفظ الإقفال وطباعة التقرير»، ويتم تجميد السجل لحمايته من أي تلاعب.',
      ],
    },
    {
      id: 3,
      title: 'فيديو 3: النسخ الاحتياطي واسترجاع البيانات عند الطوارئ',
      duration: '2:00 دقيقة',
      description: 'كيف تحمي متجرك بفلاشة USB، وكيف تنقل المحل لجهاز جديد بدون أي مبرمج.',
      steps: [
        '1. ضع فلاشة USB في الكمبيوتر وتوجه إلى الإعدادات ثم «النسخ الاحتياطي».',
        '2. اختر الفلاشة بضغطة زر واحدة واضغط «خذ نسخة الآن».',
        '3. تأكد من ظهور علامة الصح الخضراء الدالة على سلامة ملف الـ SQLite.',
        '4. لاسترجاع البيانات على كمبيوتر جديد، استخدم زر «نقل لجهاز جديد» بضغطة واحدة.',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-surface rounded-2xl border border-line shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden text-right"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand/20 flex items-center justify-center text-brand">
              <BookOpen className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink m-0">
                دليل التشغيل السريع والتدريب — رفيق POS
              </h2>
              <p className="text-[11.5px] text-ink-muted m-0 mt-0.5">
                فيتشر #140 — دليل ورقة واحدة A4، فيديوهات تدريبية قصيرة، وقائمة تدريب أول زيارة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'sheet' && (
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
                title="طباعة الدليل A4 لتعليقه بجوار الكاشير"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة الدليل (A4)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-line bg-surface print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('sheet')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'sheet'
                ? 'border-brand text-brand bg-brand-soft/20 rounded-t-lg'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>1. دليل الورقة الواحدة (A4 للطباعة)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'videos'
                ? 'border-brand text-brand bg-brand-soft/20 rounded-t-lg'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>2. فيديوهات التدريب القصيرة (3 مقاطع)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'checklist'
                ? 'border-brand text-brand bg-brand-soft/20 rounded-t-lg'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>3. قائمة تدريب أول زيارة ({completedCount}/{checklist.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: ONE-PAGE PRINTABLE CHEAT SHEET (TASK 140-1) */}
          {activeTab === 'sheet' && (
            <div className="space-y-6 animate-in fade-in" id="printable-cheat-sheet">
              {/* Printable Header */}
              <div className="p-4 rounded-2xl bg-brand text-white flex items-center justify-between shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-300" />
                    <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider">
                      دليل التشغيل اليومي السريع — رفيق لنقاط البيع
                    </span>
                  </div>
                  <h3 className="text-base font-bold mt-1 mb-0">ورقة إرشادية للكاشير وصاحب المحل</h3>
                  <p className="text-[11.5px] text-white/80 m-0 mt-0.5">
                    علق هذه الورقة بجوار شاشة الكاشير لمراجعة الخطوات الأساسية وحل أي مشكلة فوراً.
                  </p>
                </div>
                <div className="text-left font-mono text-xs opacity-90 hidden sm:block">
                  <span className="block font-bold">Rafiq POS v1.0</span>
                  <span className="text-[10px] text-emerald-200">Offline-First Engine</span>
                </div>
              </div>

              {/* 4 Quadrants Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. First Sale */}
                <div className="p-4 rounded-xl border-2 border-line bg-surface space-y-3">
                  <div className="flex items-center gap-2 text-brand font-bold text-xs border-b border-line pb-2">
                    <ShoppingCart className="w-4 h-4 text-brand" />
                    <span>القسم 1: كيفية إجراء عملية البيع السريع</span>
                  </div>
                  <ul className="text-xs text-ink space-y-2 list-none p-0 m-0 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                      <span><strong>إدخال الصنف:</strong> مرر الباركود بالقارئ مباشرة، أو اضغط <kbd className="px-1.5 py-0.5 bg-surface-2 border border-line rounded font-mono text-[10px]">F2</kbd> للبحث السريع بالاسم.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                      <span><strong>تعديل الكمية:</strong> اضغط <kbd className="px-1.5 py-0.5 bg-surface-2 border border-line rounded font-mono text-[10px]">F4</kbd> ثم اكتب العدد المطلوب واضغط Enter.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                      <span><strong>إنهاء الفاتورة:</strong> اضغط <kbd className="px-1.5 py-0.5 bg-surface-2 border border-line rounded font-mono text-[10px]">F9</kbd> للدفع النقدي، أو <kbd className="px-1.5 py-0.5 bg-surface-2 border border-line rounded font-mono text-[10px]">F10</kbd> لتعليق الفاتورة لعميل آخر.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                      <span><strong>الطباعة والدرج:</strong> اضغط <kbd className="px-1.5 py-0.5 bg-surface-2 border border-line rounded font-mono text-[10px]">Enter</kbd> لتأكيد السداد، فتُطبع الفاتورة ويفتح الدرج تلقائياً.</span>
                    </li>
                  </ul>
                </div>

                {/* 2. Daily Closing */}
                <div className="p-4 rounded-xl border-2 border-line bg-surface space-y-3">
                  <div className="flex items-center gap-2 text-paid font-bold text-xs border-b border-line pb-2">
                    <Receipt className="w-4 h-4 text-paid" />
                    <span>القسم 2: إقفال اليومية (Z-Report)</span>
                  </div>
                  <ul className="text-xs text-ink space-y-2 list-none p-0 m-0 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-paid-soft text-paid font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                      <span><strong>فتح الشاشة:</strong> اضغط <kbd className="px-1.5 py-0.5 bg-surface-2 border border-line rounded font-mono text-[10px]">F11</kbd> أو ادخل على التقارير واضغط «قفل اليومية».</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-paid-soft text-paid font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                      <span><strong>جرد الدرج:</strong> قم بعد كل النقود الورقية والفضية الموجودة فعلياً بالدرج في نهاية الوردية.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-paid-soft text-paid font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                      <span><strong>تسجيل النقدية:</strong> اكتب المبلغ في خانة «النقد المعدود»، وسيوضح البرنامج فوراً إن كان هناك عجز أو زيادة.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-paid-soft text-paid font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                      <span><strong>الحفظ والطباعة:</strong> اضغط «حفظ الإقفال»، واطبع شريط الإقفال اليومي لتسليمه لصاحب المحل.</span>
                    </li>
                  </ul>
                </div>

                {/* 3. Backup */}
                <div className="p-4 rounded-xl border-2 border-line bg-surface space-y-3">
                  <div className="flex items-center gap-2 text-brand font-bold text-xs border-b border-line pb-2">
                    <HardDrive className="w-4 h-4 text-brand" />
                    <span>القسم 3: النسخ الاحتياطي وحماية المتجر</span>
                  </div>
                  <ul className="text-xs text-ink space-y-2 list-none p-0 m-0 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                      <span><strong>فلاشة USB دائماً:</strong> حافظ على وجود فلاشة USB متصلة بجهاز الكاشير بشكل دائم.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                      <span><strong>نسخ تلقائي:</strong> يقوم رفيق بحفظ نسخة تلقائية عند إغلاق البرنامج وعند إقفال الوردية.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                      <span><strong>فحص السلامة:</strong> النسخة السليمة يظهر بجوارها علامة صح خضراء تؤكد سلامة قاعدة البيانات.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                      <span><strong>تغيير الجهاز:</strong> استخدم أداة «نقل لجهاز جديد» لنقل المحل كاملاً بضغطة زر واحدة.</span>
                    </li>
                  </ul>
                </div>

                {/* 4. Troubleshooting */}
                <div className="p-4 rounded-xl border-2 border-line bg-surface space-y-3">
                  <div className="flex items-center gap-2 text-danger font-bold text-xs border-b border-line pb-2">
                    <HelpCircle className="w-4 h-4 text-danger" />
                    <span>القسم 4: ماذا أفعل لو حدثت مشكلة؟ (طوارئ الكاشير)</span>
                  </div>
                  <ul className="text-xs text-ink space-y-2 list-none p-0 m-0 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                      <span><strong>انقطاع الكهرباء الفجائي:</strong> لا تقلق، تقنية SQLite WAL تحفظ الفاتورة لحظياً، فقط أعد تشغيل الجهاز وستجد كل شيء كما هو.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                      <span><strong>الطابعة لا تطبع:</strong> تأكد من توصيل كابل USB وتشغيل زر الباور، ثم ادخل الإعدادات واضغط «طباعة تجريبية».</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                      <span><strong>تاريخ الجهاز خاطئ:</strong> سيظهر لك تنبيه أحمر يمنع الإقفال بتاريخ خاطئ؛ اضبط ساعة وتاريخ الويندوز ثم أعد تشغيل رفيق.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                      <span><strong>قارئ الباركود لا يستجيب:</strong> تأكد من لغة لوحة المفاتيح الإنجليزية (EN)، وتأكد من سماع صوت التصفير عند المسح.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Keyboard Shortcuts Summary Footer */}
              <div className="p-3 rounded-xl bg-surface-2 border border-line flex flex-wrap items-center justify-between text-xs gap-2">
                <span className="font-bold text-brand">اختصارات لوحة المفاتيح الأساسية:</span>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded">F1</kbd> المساعدة</span>
                  <span><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded">F2</kbd> البحث</span>
                  <span><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded">F4</kbd> الكمية</span>
                  <span><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded">F9</kbd> الدفع النقدي</span>
                  <span><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded">F10</kbd> تعليق</span>
                  <span><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded">F11</kbd> قفل اليومية</span>
                  <span><kbd className="px-1.5 py-0.5 bg-surface border border-line rounded">ESC</kbd> إلغاء/رجوع</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SHORT TRAINING VIDEOS (TASK 140-2) */}
          {activeTab === 'videos' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {VIDEOS.map((v, idx) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => handleSelectVideo(idx)}
                    className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer ${
                      selectedVideo === idx
                        ? 'border-brand bg-brand-soft/30 shadow-2xs'
                        : 'border-line bg-surface hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold text-brand mb-1">
                      <span>فيديو {idx + 1}</span>
                      <span className="font-mono text-ink-muted">{v.duration}</span>
                    </div>
                    <h4 className="text-xs font-bold text-ink m-0 leading-snug">{v.title}</h4>
                    <p className="text-[11px] text-ink-muted m-0 mt-1 line-clamp-2">{v.description}</p>
                  </button>
                ))}
              </div>

              {/* Video Player Display Screen */}
              <div className="rounded-2xl border-2 border-line bg-black text-white overflow-hidden shadow-lg">
                {/* Player Canvas Simulator */}
                <div className="relative aspect-video bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center p-8 text-center">
                  {/* Step Visualizer */}
                  <div className="space-y-4 max-w-lg">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/80 text-white text-xs font-bold">
                      <span>الخطوة {playbackStep + 1} من 4</span>
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-emerald-300">
                      {VIDEOS[selectedVideo].steps[playbackStep] || VIDEOS[selectedVideo].steps[0]}
                    </h3>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {VIDEOS[selectedVideo].description}
                    </p>
                  </div>

                  {/* Play / Pause Overlay Button */}
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-brand/90 hover:bg-brand text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
                  </button>

                  {/* Step indicators */}
                  <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-[11px] text-gray-400">
                    <span>{VIDEOS[selectedVideo].title}</span>
                    <span className="font-mono">{playbackProgress}%</span>
                  </div>
                </div>

                {/* Progress Bar & Controls */}
                <div className="bg-gray-950 p-3 flex items-center gap-3 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackProgress(0);
                      setPlaybackStep(0);
                    }}
                    className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="إعادة التشغيل من البداية"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  {/* Track */}
                  <div className="flex-1 bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-brand h-full transition-all duration-300"
                      style={{ width: `${playbackProgress}%` }}
                    />
                  </div>

                  <span className="text-[11px] font-mono text-gray-400">
                    {VIDEOS[selectedVideo].duration}
                  </span>
                </div>
              </div>

              {/* Step By Step Guide Below Video */}
              <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-2">
                <span className="text-xs font-bold text-ink block">خطوات الشرح بالتفصيل:</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {VIDEOS[selectedVideo].steps.map((st, i) => (
                    <div
                      key={i}
                      className={`p-2.5 rounded-lg border transition-colors ${
                        playbackStep === i
                          ? 'bg-brand-soft border-brand text-brand font-bold'
                          : 'bg-surface border-line text-ink'
                      }`}
                    >
                      {st}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FIRST VISIT CHECKLIST (TASK 140-3) */}
          {activeTab === 'checklist' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Progress Summary Card */}
              <div className="p-4 rounded-2xl bg-surface-2 border border-line flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-brand" />
                    <h3 className="text-sm font-bold text-ink m-0">
                      قائمة تدريب أول زيارة للمحل وتسليم البرنامج
                    </h3>
                  </div>
                  <p className="text-xs text-ink-muted m-0">
                    هذه القائمة مخصصة للمطور أو فني التركيب لتدريب الكاشير وصاحب المحل على كل الوظائف قبل بدء العمل الفعلي.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-left font-mono">
                    <span className="text-xs font-bold text-brand block">{progressPercent}% مكتمل</span>
                    <span className="text-[10px] text-ink-muted">{completedCount} من {checklist.length} مهمة</span>
                  </div>
                  <div className="w-12 h-12 rounded-full border-4 border-line flex items-center justify-center font-bold text-xs text-brand relative">
                    <span className="relative z-10">{progressPercent}%</span>
                  </div>
                </div>
              </div>

              {/* Checklist Items */}
              <div className="divide-y divide-line border border-line rounded-xl bg-surface overflow-hidden shadow-2xs">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleToggleCheck(item.id)}
                    className={`p-4 flex items-start gap-3.5 transition-colors cursor-pointer select-none ${
                      item.done ? 'bg-paid-soft/30 hover:bg-paid-soft/50' : 'hover:bg-surface-2'
                    }`}
                  >
                    <button
                      type="button"
                      className="mt-0.5 text-brand focus:outline-none shrink-0"
                    >
                      {item.done ? (
                        <CheckSquare className="w-5 h-5 text-paid" />
                      ) : (
                        <Square className="w-5 h-5 text-ink-muted" />
                      )}
                    </button>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold ${
                            item.done ? 'text-paid line-through' : 'text-ink'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-ink-muted border border-line/60">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-ink-muted leading-relaxed m-0">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Completion Message */}
              {progressPercent === 100 && (
                <div className="p-4 rounded-xl bg-paid-soft border border-paid/40 text-paid flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <Award className="w-5 h-5 text-paid shrink-0" />
                    <div>
                      <span className="font-bold text-xs block">تهانينا! اكتمل تدريب أول زيارة بنسبة 100%</span>
                      <span className="text-[11px] text-paid/80">المحل جاهز تماماً للتشغيل والبيع الحقيقي.</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-paid text-white font-bold text-xs hover:bg-[#005734] transition-colors cursor-pointer shadow-sm"
                  >
                    إغلاق وبدء البيع
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line bg-surface-2 flex items-center justify-between text-xs text-ink-muted print:hidden">
          <span>نظام رفيق POS — دليل معتمد للتشغيل الأوفلاين</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-line hover:bg-surface text-ink transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
