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
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Header & Quick Actions */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-surface border border-line">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#006d41] border border-emerald-200 flex items-center justify-center text-lg">
            <FlaskConical className="w-5 h-5 text-[#006d41]" />
          </div>
          <div>
            <h3 className="font-bold text-[14px] text-ink m-0">البيانات التجريبية وجولة النظام</h3>
            <p className="text-[11px] text-ink-muted m-0">
              تجربة البرنامج وتدريب الكاشير ببيانات نموذجية واضحة العلامة تُمسح بضغطة زر دون المساس ببيانات المحل الحقيقية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTourModal}
            className="h-[34px] px-3.5 bg-emerald-50 hover:bg-emerald-100 text-[#006d41] border border-emerald-300 rounded font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Compass className="w-4 h-4" />
            <span>بدء الجولة التعريفية (5 خطوات)</span>
          </button>

          <button
            type="button"
            onClick={onOpenDemoModal}
            className="h-[34px] px-4 bg-brand hover:bg-brand-hover text-white rounded font-bold text-xs flex items-center gap-2 transition-colors shadow-xs"
          >
            <FlaskConical className="w-4 h-4" />
            <span>{demoStatus?.hasDemoData ? 'إدارة ومسح البيانات التجريبية' : 'تحميل بيانات تجريبية'}</span>
          </button>
        </div>
      </div>

      {/* Status Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">حالة البيانات التجريبية:</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${demoStatus?.hasDemoData ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className="text-xs font-bold text-ink">
              {demoStatus?.hasDemoData ? 'نشطة في النظام (للتدريب)' : 'غير محملة'}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">الأصناف التجريبية المحملة:</span>
          <span className="text-xs font-bold text-ink">
            {demoStatus?.demoProductsCount || 0} منتج تجريبي
          </span>
        </div>

        <div className="p-3.5 rounded bg-surface-2 border border-line flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted font-bold">الفواتير والعملاء التجريبيين:</span>
          <span className="text-xs font-bold text-ink">
            {demoStatus?.demoSalesCount || 0} فواتير | {demoStatus?.demoCustomersCount || 0} عملاء
          </span>
        </div>
      </div>

      {/* Isolation & Safety Invariant (Task 113-2 & 113-5) */}
      <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5 text-[#006d41]" />
        </div>
        <div className="text-xs space-y-1.5 flex-1">
          <span className="font-black text-[#00372d] text-[13px] block">
            ضمان الأمان والعزل الكامل (Data Isolation Invariant):
          </span>
          <p className="text-slate-900 font-semibold leading-relaxed m-0 text-[12px]">
            جميع الكيانات التجريبية تُميّز بمعرف خاص يبدأ بـ <code className="font-mono bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded text-[#00372d] font-black text-[12px]">demo_</code>.
            عند طلب مسح البيانات التجريبية، ينفذ النظام مسحاً ذرياً محصوراً في تلك السجلات فقط، وتبقى كافة فواتير وأصناف المحل الحقيقية سليمة ومحفوظة بنسبة 100%.
          </p>
        </div>
      </div>
    </div>
  );
};
