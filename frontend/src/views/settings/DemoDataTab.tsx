import { useState } from 'react';
import { 
  FlaskConical, 
  Compass, 
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { FactoryResetModal } from '../../components/FactoryResetModal';

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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5 text-xs text-ink dark:text-ink-dark">
      {/* Quick Actions (page title and description live in the settings page header) */}
      <div className="flex flex-wrap items-center justify-end gap-3 p-5 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle">
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenTourModal}
            className="h-10 px-4 bg-paid-soft dark:bg-paid-dark-soft hover:bg-paid-soft/80 dark:hover:bg-paid-dark-soft/80 text-paid dark:text-paid-bright border border-line dark:border-line-dark rounded-lg font-bold text-xs flex items-center gap-2 whitespace-nowrap transition-colors shadow-2xs cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>بدء الجولة السريعة (5 خطوات)</span>
          </button>

          <button
            type="button"
            onClick={onOpenDemoModal}
            className="h-10 px-4 bg-brand dark:bg-brand-dark hover:bg-brand-dark dark:hover:bg-brand text-white rounded-lg font-bold text-xs flex items-center gap-2 whitespace-nowrap transition-colors shadow-xs cursor-pointer"
          >
            <FlaskConical className="w-4 h-4" />
            <span>{demoStatus?.hasDemoData ? 'مسح وإدارة البيانات التجريبية' : 'تنزيل بضاعة تجريبية للتجربة'}</span>
          </button>
        </div>
      </div>

      {/* Status Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle flex flex-col gap-2">
          <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-bold">حالة البيانات التجريبية</span>
          <div className="flex items-start gap-2.5">
            <div className={`w-2.5 h-2.5 mt-1.5 rounded-full shrink-0 ${demoStatus?.hasDemoData ? 'bg-warn animate-pulse' : 'bg-line-hover dark:bg-line-dark'}`} />
            <span className="text-sm font-bold text-ink dark:text-ink-dark leading-relaxed">
              {demoStatus?.hasDemoData ? 'شغالة ومحملة في النظام (للتدريب والتجربة)' : 'مش موجودة (النظام شغال ببياناتك الحقيقية فقط)'}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle flex flex-col gap-2">
          <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-bold">الأصناف التجريبية المحملة</span>
          <span className="t-kpi text-ink dark:text-ink-dark">
            {demoStatus?.demoProductsCount || 0} <span className="text-sm font-semibold text-ink-muted dark:text-ink-muted-dark">صنف تجريبي</span>
          </span>
        </div>

        <div className="p-5 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-subtle flex flex-col gap-2">
          <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-bold">الفواتير والزبائن التجريبية</span>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 t-kpi text-ink dark:text-ink-dark">
            <span className="whitespace-nowrap">
              {demoStatus?.demoSalesCount || 0} <span className="text-sm font-semibold text-ink-muted dark:text-ink-muted-dark">فاتورة تجريبية</span>
            </span>
            <span className="whitespace-nowrap">
              {demoStatus?.demoCustomersCount || 0} <span className="text-sm font-semibold text-ink-muted dark:text-ink-muted-dark">زبون تجريبي</span>
            </span>
          </div>
        </div>
      </div>

      {/* Isolation & Safety Invariant (Task 113-2 & 113-5) */}
      <div className="p-5 bg-paid-soft dark:bg-paid-dark-soft border border-line dark:border-line-dark rounded-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-2xs">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-paid dark:text-paid-bright" />
          </div>
          <div className="text-xs space-y-1.5">
            <span className="font-bold text-brand-dark dark:text-brand-bright text-sm block">
              أمان تام وعزل 100% لبضاعة وفلوس المحل:
            </span>
            <p className="text-ink dark:text-ink-dark leading-relaxed m-0 text-xs">
              كل البيانات والفواتير التجريبية متعلمة بكود خاص يبدأ بـ <code className="font-mono bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-1.5 py-0.5 rounded text-brand-dark dark:text-brand-bright font-bold text-xs">demo_</code>.
              لما تضغط مسح، النظام بيمسح السجلات التجريبية دي بس في غمضة عين، وبضاعة وفواتير وزبائن المحل الحقيقية بتفضل زي ما هي ومحمية 100%.
            </p>
          </div>
        </div>
      </div>

      {/* Complete System & Backup Wipe Card */}
      <div className="p-5 bg-danger-soft/60 dark:bg-danger-dark-soft/50 border border-danger/30 dark:border-danger-bright/30 rounded-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-2xs">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-danger/10 text-danger dark:text-danger-bright flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-danger dark:text-danger-bright" />
          </div>
          <div className="text-xs space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-danger-ink dark:text-danger-bright text-sm block">
                تصفير ومسح كافة البيانات بالكامل (إعادة ضبط المصنع كأول مرة):
              </span>
              <span className="text-micro font-bold text-danger dark:text-danger-bright bg-danger/15 px-2 py-0.5 rounded">
                شامل النسخ الاحتياطية
              </span>
            </div>
            <p className="text-ink dark:text-ink-dark leading-relaxed m-0 text-xs">
              لو عاوز تنضف الدنيا كلها وتمسح كل الأصناف والفواتير والديون وملفات النسخ الاحتياطي السابقة وتبدأ من الصفر تماماً.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsResetModalOpen(true)}
          className="shrink-0 h-10 px-4 bg-danger hover:bg-danger-hover text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer self-start lg:self-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>مسح وتصفير كافة البيانات وبدء المحل من الصفر</span>
        </button>
      </div>

      <FactoryResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
      />
    </div>
  );
};
