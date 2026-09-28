import { 
  FlaskConical, 
  Compass, 
  ShieldCheck 
} from 'lucide-react';

interface DemoDataTabProps {
  demoStatus: any;
  onOpenTourModal: () => void;
  onOpenDemoModal: () => void;
}

export const DemoDataTab = ({
  demoStatus,
  onOpenTourModal,
  onOpenDemoModal,
}: DemoDataTabProps) => {
  return (
    <div className="flex flex-col gap-5 text-xs text-[#14181a]">
      {/* Header & Quick Actions */}
      <div className="flex items-center justify-between p-5 rounded-lg bg-white border border-[#dce1dc] shadow-subtle">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
            <FlaskConical className="w-5 h-5 text-[#0b4f42]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#14181a] m-0">البيانات التجريبية وجولة النظام</h3>
            <p className="text-[11px] text-[#5b6664] m-0">
              تجربة البرنامج وتدريب الكاشير ببيانات نموذجية واضحة العلامة تُمسح بضغطة زر دون المساس ببيانات المحل الحقيقية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTourModal}
            className="h-10 px-3.5 bg-[#eaf5ee] hover:bg-[#d5ecd9] text-[#006d41] border border-[#c4e3d0] rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>بدء الجولة التعريفية (5 خطوات)</span>
          </button>

          <button
            type="button"
            onClick={onOpenDemoModal}
            className="h-10 px-4 bg-[#0b4f42] hover:bg-[#0f6a57] text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <FlaskConical className="w-4 h-4" />
            <span>{demoStatus?.hasDemoData ? 'إدارة ومسح البيانات التجريبية' : 'تحميل بيانات تجريبية'}</span>
          </button>
        </div>
      </div>

      {/* Status Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-lg bg-white border border-[#dce1dc] shadow-subtle flex flex-col gap-1.5">
          <span className="text-[11px] text-[#5b6664] font-bold">حالة البيانات التجريبية:</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${demoStatus?.hasDemoData ? 'bg-[#b3720e] animate-pulse' : 'bg-slate-400'}`} />
            <span className="text-xs font-bold text-[#14181a]">
              {demoStatus?.hasDemoData ? 'نشطة في النظام (للتدريب)' : 'غير محملة'}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-white border border-[#dce1dc] shadow-subtle flex flex-col gap-1.5">
          <span className="text-[11px] text-[#5b6664] font-bold">الأصناف التجريبية المحملة:</span>
          <span className="text-xs font-bold text-[#14181a]">
            {demoStatus?.demoProductsCount || 0} منتج تجريبي
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-white border border-[#dce1dc] shadow-subtle flex flex-col gap-1.5">
          <span className="text-[11px] text-[#5b6664] font-bold">الفواتير والعملاء التجريبيين:</span>
          <span className="text-xs font-bold text-[#14181a]">
            {demoStatus?.demoSalesCount || 0} فواتير | {demoStatus?.demoCustomersCount || 0} عملاء
          </span>
        </div>
      </div>

      {/* Isolation & Safety Invariant (Task 113-2 & 113-5) */}
      <div className="p-4 bg-[#eaf5ee] border border-[#c4e3d0] rounded-lg flex items-start gap-3 shadow-2xs">
        <div className="w-8 h-8 rounded-lg bg-white border border-[#c4e3d0] flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5 text-[#006d41]" />
        </div>
        <div className="text-xs space-y-1.5 flex-1">
          <span className="font-bold text-[#00372d] text-xs block">
            ضمان الأمان والعزل الكامل (Data Isolation Invariant):
          </span>
          <p className="text-[#14181a] leading-relaxed m-0 text-xs">
            جميع الكيانات التجريبية تُميّز بمعرف خاص يبدأ بـ <code className="font-mono bg-white border border-[#c4e3d0] px-1.5 py-0.5 rounded text-[#00372d] font-bold text-xs">demo_</code>.
            عند طلب مسح البيانات التجريبية، ينفذ النظام مسحاً ذرياً محصوراً في تلك السجلات فقط، وتبقى كافة فواتير وأصناف المحل الحقيقية سليمة ومحفوظة بنسبة 100%.
          </p>
        </div>
      </div>
    </div>
  );
};
