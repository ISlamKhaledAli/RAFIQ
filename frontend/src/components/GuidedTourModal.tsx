import React, { useState } from 'react';

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
    title: 'شاشة البيع السريع ونقطة البيع (POS)',
    subtitle: 'إدخال الباركود، البحث الفوري، والأزرار السريعة للأصناف الشعبية',
    icon: 'fa-barcode',
    color: 'from-emerald-600 to-teal-700',
    description:
      'تم تصميم شاشة البيع في رفيق لتكون الأسرع على الإطلاق. مؤشر الكتابة يظل دائماً في خانة الباركود تلقائياً بعد كل عملية بيع دون الحاجة لاستخدام الماوس إطلاقاً.',
    keyFeatures: [
      'مسح تلقائي بقارئ الباركود مع دعم قارئات USB و RS232 الموزونة.',
      'بحث فوري بالاسم أو جزء منه حتى بين أكثر من 50,000 صنف في أقل من 10ms.',
      'أزرار سريعة للأصناف السائبة والمخبوزات بدون باركود مع تلوين وتصنيف مرئي.',
    ],
    shortcutTip: 'اضغط F2 في أي وقت للتركيز السريع على حقل الباركود، أو F3 للبحث بالاسم.',
    badgeText: 'الخطوة 1 من 5',
  },
  {
    step: 2,
    title: 'سلة المشتريات وإدارة الكميات والأوزان',
    subtitle: 'تعديل ذكي للكميات والوزن (كجم) مع حماية المخزون',
    icon: 'fa-shopping-basket',
    color: 'from-teal-600 to-cyan-700',
    description:
      'جدول السلة يعرض الأصناف بوضوح مع إمكانية تعديل الكمية مباشرة أو بواسطة اختصارات لوحة المفاتيح، مع حساب دقيق للأوزان بالجرام والمليجرام دون أي أخطاء عشرية.',
    keyFeatures: [
      'حساب مالي آمن 100% بالقروش مع منع الكسور العشرية والتقريب العشوائي.',
      'دعم الأوزان بالكيلوجرام (مثل 0.750 كجم لبن أو جبنة) بضغطة زر.',
      'تنبيه فوري عند بيع صنف أوشك رصيده على النفاد لتنبيه الكاشير.',
    ],
    shortcutTip: 'استخدم أزرار + و - لتعديل الكمية، أو مفتاح Delete لحذف الصنف المحدد.',
    badgeText: 'الخطوة 2 من 5',
  },
  {
    step: 3,
    title: 'الدفع السريع والفاتورة وطباعة الإيصال',
    subtitle: 'دفع نقدي، دفع بالآجل على العميل، وطباعة حرارية فورية',
    icon: 'fa-file-invoice-dollar',
    color: 'from-emerald-700 to-green-800',
    description:
      'نافذة الدفع تتيح إنهاء المعاملة في أقل من ثانيتين؛ مع حساب الباقي تلقائياً، وإمكانية ترحيل الفاتورة لحساب العميل بالآجل، وطباعة إيصال الفاتورة الحراري وفتح درج النقدية فوراً.',
    keyFeatures: [
      'إنهاء البيع السريع بضغطة واحدة على مفتاح Enter / F12 وحساب الباقي للعميل.',
      'دعم كامل للبيع الآجل للعملاء المنتظمين مع فحص الرصيد والحد الائتماني.',
      'دعم الطابعات الحرارية مقاس 80mm و 57mm مع معاينة سريعة وطباعة فورية.',
    ],
    shortcutTip: 'اضغط مفتاح المسافة (Space) لفتح نافذة الدفع، ثم Enter لتأكيد استلام النقدية.',
    badgeText: 'الخطوة 3 من 5',
  },
  {
    step: 4,
    title: 'إدارة المنتجات والتصنيفات والمخزون',
    subtitle: 'إضافة الأصناف، استيراد إكسيل، وكشف النواقص وجرد المخزن',
    icon: 'fa-boxes',
    color: 'from-blue-700 to-indigo-800',
    description:
      'شاشة المنتجات توفر سجلاً متكاملاً لكافة الأصناف والباركودات البديلة، مع تتبع آلي لحركات الوارد والمنصرف والجرد الدوري وحساب أرباح كل صنف.',
    keyFeatures: [
      'إضافة صنف جديد في 10 ثوانٍ مع إنشاء باركود محلي تلقائي إذا لم يتوفر.',
      'استيراد وتصدير الأصناف والأسعار دفعة واحدة عبر ملفات Excel و CSV.',
      'كشف فوري بالنواقص والأصناف التي وصلت إلى حد الطلب الأدنى لإعادة التوريد.',
    ],
    shortcutTip: 'يمكنك إضافة صنف سريعاً أثناء البيع مباشرة دون مغادرة شاشة الكاشير.',
    badgeText: 'الخطوة 4 من 5',
  },
  {
    step: 5,
    title: 'التقارير المالية والأمان والنسخ الاحتياطي',
    subtitle: 'حماية بكلمة سر، ملخص الوردية، وأمان تام ضد انقطاع الكهرباء',
    icon: 'fa-shield-halved',
    color: 'from-slate-700 to-emerald-900',
    description:
      'نظام رفيق مصمم خصيصاً للبيئة الواقعية: قاعدة بيانات SQLite بمعمارية WAL المقاومة لانقطاع التيار المفاجئ، مع تشفير الأرقام السرية PBKDF2 والنسخ الاحتياطي التلقائي.',
    keyFeatures: [
      'رقم سري (PIN) مشفر لحماية شاشات التقارير وتعديل الأسعار واسترجاع البيانات.',
      'تقارير أرباح ووردية تفصيلية وجرد مبيعات يومي وأسبوعي وشهري.',
      'نسخ احتياطي محلي تلقائي عند كل إغلاق للبرنامج، وتنبيه عند فصل فلاشة النسخ.',
    ],
    shortcutTip: 'تأكد من الاحتفاظ بنسخة احتياطية على فلاشة خارجية USB بانتظام لضمان أمان محلك.',
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
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header with gradient and icon */}
        <div className={`bg-gradient-to-r ${currentStep.color} text-white px-6 py-5 relative transition-all duration-300`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner">
                <i className={`fas ${currentStep.icon}`} />
              </div>
              <div>
                <span className="inline-block text-xs font-bold uppercase tracking-wider bg-white/25 px-2.5 py-0.5 rounded-full mb-1">
                  {currentStep.badgeText}
                </span>
                <h2 className="text-xl font-black leading-tight">{currentStep.title}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
              title="إغلاق"
            >
              <i className="fas fa-times text-lg" />
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
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <p className="text-slate-700 leading-relaxed text-base font-normal">
            {currentStep.description}
          </p>

          {/* Key Features List */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-check-circle text-emerald-600" />
              أهم المزايا في هذه الشاشة
            </h4>
            <ul className="space-y-2 text-sm text-slate-800">
              {currentStep.keyFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="leading-snug">{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Shortcut Tip Callout */}
          {currentStep.shortcutTip && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3 text-amber-900 text-sm">
              <div className="w-9 h-9 rounded-lg bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0 text-base">
                <i className="fas fa-keyboard" />
              </div>
              <div className="flex-1">
                <span className="font-bold block text-xs text-amber-800">تلميح الكيبورد السريع للكاشير:</span>
                <p className="text-xs text-amber-950 font-medium leading-relaxed">
                  {currentStep.shortcutTip}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="bg-slate-100/90 border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!hasDemoData && onLoadDemoData && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLoadDemoData();
                }}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg border border-emerald-300 transition-colors flex items-center gap-1.5"
              >
                <i className="fas fa-magic" />
                تحميل بيانات تجريبية للتدريب
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-1"
            >
              تخطي الجولة
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <i className="fas fa-arrow-right" />
                السابق
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 rounded-xl transition-all shadow hover:shadow-md flex items-center gap-1.5"
            >
              <span>{isLast ? 'إنهاء الجولة وبدء العمل' : 'التالي'}</span>
              <i className={`fas ${isLast ? 'fa-check' : 'fa-arrow-left'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
