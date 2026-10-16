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
    <div className="flex flex-col gap-5 text-xs text-ink dark:text-ink-dark">
      {/* Header & Quick Actions */}
      <div className="flex items-center justify-between p-5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-brand/10 dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
            <FlaskConical className="w-5 h-5 text-brand dark:text-brand-bright" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">البيانات التجريبية وتدريب الكاشير</h3>
            <p className="text-[11px] text-ink-muted dark:text-ink-muted-dark m-0">
              جرب النظام ودرب الكاشير براحتك ببيانات وأصناف تجريبية واضحة، تقدر تمسحها كلها بضغطة زر واحدة من غير ما تلمس أي صنف أو مليم حقيقي في المحل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTourModal}
            className="h-10 px-3.5 bg-paid-soft dark:bg-paid-dark-soft hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80 text-paid dark:text-paid-bright border border-line dark:border-line-dark rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>بدء الجولة السريعة (5 خطوات)</span>
          </button>

          <button
            type="button"
            onClick={onOpenDemoModal}
            className="h-10 px-4 bg-brand dark:bg-brand-dark hover:bg-brand-dark dark:hover:bg-brand text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <FlaskConical className="w-4 h-4" />
            <span>{demoStatus?.hasDemoData ? 'مسح وإدارة البيانات التجريبية' : 'تنزيل بضاعة تجريبية للتجربة'}</span>
          </button>
        </div>
      </div>

      {/* Status Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark font-bold">حالة البيانات التجريبية:</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${demoStatus?.hasDemoData ? 'bg-warn animate-pulse' : 'bg-line-hover dark:bg-line-dark'}`} />
            <span className="text-xs font-bold text-ink dark:text-ink-dark">
              {demoStatus?.hasDemoData ? 'شغالة ومحملة في النظام (للتدريب والتجربة)' : 'مش موجودة (النظام شغال ببياناتك الحقيقية فقط)'}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark font-bold">الأصناف التجريبية المحملة:</span>
          <span className="text-xs font-bold text-ink dark:text-ink-dark">
            {demoStatus?.demoProductsCount || 0} صنف تجريبي
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark font-bold">الفواتير والزبائن التجريبية:</span>
          <span className="text-xs font-bold text-ink dark:text-ink-dark">
            {demoStatus?.demoSalesCount || 0} فاتورة تجريبية | {demoStatus?.demoCustomersCount || 0} زبون تجريبي
          </span>
        </div>
      </div>

      {/* Isolation & Safety Invariant (Task 113-2 & 113-5) */}
      <div className="p-4 bg-paid-soft dark:bg-paid-dark-soft border border-line dark:border-line-dark rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5 text-paid dark:text-paid-bright" />
          </div>
          <div className="text-xs space-y-1">
            <span className="font-bold text-brand-dark dark:text-brand-bright text-xs block">
              أمان تام وعزل 100% لبضاعة وفلوس المحل:
            </span>
            <p className="text-ink dark:text-ink-dark leading-relaxed m-0 text-xs">
              كل البيانات والفواتير التجريبية متعلمة بكود خاص يبدأ بـ <code className="font-mono bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-1.5 py-0.5 rounded text-brand-dark dark:text-brand-bright font-bold text-xs">demo_</code>.
              لما تضغط مسح، النظام بيمسح السجلات التجريبية دي بس في غمضة عين، وبضاعة وفواتير وزبائن المحل الحقيقية بتفضل زي ما هي ومحمية 100%.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDemoModal}
          className="shrink-0 h-9 px-3.5 bg-paid dark:bg-paid-dark hover:bg-paid/90 dark:hover:bg-paid text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>{demoStatus?.hasDemoData ? 'مسح كل البيانات التجريبية دلوقتي' : 'تنزيل أو إدارة البيانات التجريبية'}</span>
        </button>
      </div>
    </div>
  );
};
