import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Keyboard,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  ShoppingCart,
  Boxes,
  Users,
  FileText,
  BarChart3,
} from 'lucide-react';

interface GuidedTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadDemoData?: () => void;
  hasDemoData?: boolean;
}

interface TourStep {
  step: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  description: string;
  keyFeatures: string[];
  shortcutTip?: string;
  badgeText: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    title: 'شاشة البيع السريع ونقطة البيع (الكاشير)',
    subtitle: 'قراءة الباركود، بحث فوري، وأزرار سريعة للأصناف اللي ملهاش باركود',
    icon: 'fa-barcode',
    color: 'from-brand-dark to-brand',
    description:
      'شاشة البيع في رفيق معموله عشان تكون أسرع حاجة للكاشير. مؤشر الماوس بيفضل واقف تلقائياً في خانة الباركود بعد كل بيعة، عشان تشتغل بالكيبورد وقارئ الباركود علطول من غير ما تلمس الماوس.',
    keyFeatures: [
      'قراءة فورية بالباركود ودعم كامل لموازين الباركود الموزونة.',
      'بحث فوري بالاسم أو جزء منه حتى وسط 50,000 صنف في أقل من رمشة عين (10ms).',
      'أزرار سريعة للأصناف السايبة والعيش مع ألوان وتصنيف واضح بالصور.',
    ],
    shortcutTip: 'اضغط F2 في أي وقت للوقوف على خانة الباركود، أو F3 للبحث بالاسم.',
    badgeText: 'الخطوة 1 من 5',
  },
  {
    step: 2,
    title: 'سلة الفاتورة والكميات والأوزان',
    subtitle: 'تعديل سريع للكمية والوزن بالجرام مع حماية المخزن',
    icon: 'fa-shopping-basket',
    color: 'from-brand to-paid',
    description:
      'جدول الفاتورة بيعرض أصنافك بوضوح، وتقدر تعدل الكمية أو الوزن فوراً بأزرار الكيبورد، مع حساب دقيق للأوزان بالجرام من غير أي كسور ملخبطة.',
    keyFeatures: [
      'أمان مالي 100% وحسابات بالقروش بدون أي كسور عشرية عشوائية.',
      'دعم بيع الوزن بالكيلو والجرام (زي 0.750 كجم جبنة أو لحوم) بضغطة واحدة.',
      'تنبيه فوري لما بضاعة الصنف تقرب تخلص عشان تاخد بالك.',
    ],
    shortcutTip: 'استخدم زراير + و - لتعديل الكمية، أو زرار Delete لحذف الصنف من السلة.',
    badgeText: 'الخطوة 2 من 5',
  },
  {
    step: 3,
    title: 'الدفع السريع والفاتورة وطباعة الوصل',
    subtitle: 'دفع كاش، شكك على الحساب، وطباعة وصل حراري فوري',
    icon: 'fa-file-invoice-dollar',
    color: 'from-paid to-brand-dark',
    description:
      'شاشة الدفع بتخلص البيعة في ثانيتين؛ بتحسب الباقي للزبون تلقائياً، وتقدر تسجل الفاتورة على حساب الزبون بالشكك، وتطبع وصل الكاشير وتفتح الدرج في نفس اللحظة.',
    keyFeatures: [
      'تقفيل البيع السريع بضغطة زر واحدة على Enter أو F12 وحساب الباقي للزبون.',
      'دعم كامل للبيع الآجل (الشكك) للزبائن مع متابعة الرصيد والحد الأقصى.',
      'دعم طابعات الفواتير 80 مم و 57 مم مع طباعة سريعة ومباشرة بدون إنترنت.',
    ],
    shortcutTip: 'اضغط مسافة (Space) لفتح نافذة الدفع، وبعدها Enter لتأكيد استلام الكاش.',
    badgeText: 'الخطوة 3 من 5',
  },
  {
    step: 4,
    title: 'إدارة البضاعة والتصنيفات والمخزن',
    subtitle: 'إضافة أصناف، استيراد إكسيل، وكشف النواقص وجرد بضاعة المحل',
    icon: 'fa-boxes',
    color: 'from-brand to-brand-dark',
    description:
      'شاشة المنتجات بتديك سجل كامل لكل أصناف المحل والباركودات البديلة، مع متابعة تلقائية لحركات بضاعة المخزن وأرباح كل صنف.',
    keyFeatures: [
      'إضافة صنف جديد في 10 ثواني وتوليد باركود تلقائي لو الصنف ملوش باركود.',
      'استيراد وتصدير الأصناف والأسعار دفعة واحدة من شيتات Excel.',
      'كشف فوري بالنواقص والأصناف اللي قربت تخلص عشان تلحق تطلبها من الشركات.',
    ],
    shortcutTip: 'تقدر تضيف صنف جديد علطول وأنت واقف في شاشة البيع من غير ما تخرج منها.',
    badgeText: 'الخطوة 4 من 5',
  },
  {
    step: 5,
    title: 'التقارير والأرباح وأمان المحل',
    subtitle: 'قفل بالرقم السري، تقرير الوردية، وأمان تام ضد انقطاع الكهرباء',
    icon: 'fa-shield-halved',
    color: 'from-brand-dark to-paid',
    description:
      'نظام رفيق مصمم خصيصاً للمحلات والمتاجر: حفظ محلي فوري وآمن حتى لو الكهرباء قطعت فجأة، مع حماية العمليات بالرقم السري ونسخ احتياطي تلقائي.',
    keyFeatures: [
      'رقم سري (PIN) لحماية شاشات التقارير وتعديل الأسعار واسترجاع البيانات.',
      'تقارير أرباح ووردية مفصلة وجرد مبيعات يومي وأسبوعي وشهري.',
      'نسخ احتياطي محلي تلقائي عند قفل البرنامج، مع تنبيه لو الفلاشة اتشالت.',
    ],
    shortcutTip: 'احفظ نسخة احتياطية على فلاشة خارجية بانتظام عشان تضمن أمان محلك وفلوسك.',
    badgeText: 'الخطوة 5 من 5',
  },
];

export const GuidedTourModal: React.FC<GuidedTourModalProps> = ({
  isOpen,
  onClose,
  onLoadDemoData,
  hasDemoData = false,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[currentStepIndex];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (!isLast) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header with gradient and icon */}
        <div className={`bg-gradient-to-r ${currentStep.color} text-white px-6 py-5 relative transition-all duration-300`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner">
                {currentStep.step === 1 && <ShoppingCart className="w-6 h-6 text-white" />}
                {currentStep.step === 2 && <Boxes className="w-6 h-6 text-white" />}
                {currentStep.step === 3 && <Users className="w-6 h-6 text-white" />}
                {currentStep.step === 4 && <FileText className="w-6 h-6 text-white" />}
                {currentStep.step >= 5 && <BarChart3 className="w-6 h-6 text-white" />}
              </div>
              <div>
                <span className="inline-block text-xs font-bold bg-white/25 px-2.5 py-0.5 rounded-full mb-1">
                  {currentStep.badgeText}
                </span>
                <h2 className="text-xl font-black leading-tight">{currentStep.title}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-white/90 mt-2 font-medium">{currentStep.subtitle}</p>

          {/* Stepper Dots */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.step}
                onClick={() => setCurrentStepIndex(idx)}
                className={`h-2 transition-all rounded-full ${
                  idx === currentStepIndex
                    ? 'w-8 bg-white shadow'
                    : idx < currentStepIndex
                    ? 'w-3 bg-white/70'
                    : 'w-2 bg-white/30'
                }`}
                title={`الخطوة ${s.step}: ${s.title}`}
              />
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-canvas">
          <p className="text-ink leading-relaxed text-base font-normal">
            {currentStep.description}
          </p>

          {/* Key Features List */}
          <div className="bg-surface border border-line rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-black text-ink-muted flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-paid" />
              أهم المزايا في هذه الشاشة
            </h4>
            <ul className="space-y-2 text-sm text-ink">
              {currentStep.keyFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-paid-soft text-paid flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="leading-snug">{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Shortcut Tip Callout */}
          {currentStep.shortcutTip && (
            <div className="bg-warn-soft border border-warn-border rounded-xl p-3.5 flex items-center gap-3 text-ink text-sm">
              <div className="w-9 h-9 rounded-lg bg-surface text-warn flex items-center justify-center shrink-0 border border-line">
                <Keyboard className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <span className="font-bold block text-xs text-warn">تلميح الكيبورد السريع للكاشير:</span>
                <p className="text-xs text-ink font-medium leading-relaxed">
                  {currentStep.shortcutTip}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="bg-surface-2 border-t border-line px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!hasDemoData && onLoadDemoData && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLoadDemoData();
                }}
                className="text-xs text-brand hover:text-brand-dark font-bold bg-brand/10 hover:bg-brand/20 px-3 py-2 rounded-lg border border-brand/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                تحميل بيانات تجريبية للتدريب
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-ink-muted hover:text-ink font-semibold px-2 py-1 cursor-pointer"
            >
              تخطي الجولة
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 text-sm font-bold text-ink bg-surface border border-line rounded-xl hover:bg-surface-2 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                السابق
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 text-sm font-bold text-white bg-paid hover:bg-paid/90 active:scale-95 rounded-xl transition-all shadow hover:shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <span>{isLast ? 'إنهاء الجولة وبدء الشغل' : 'التالي'}</span>
              {isLast ? <Check className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
