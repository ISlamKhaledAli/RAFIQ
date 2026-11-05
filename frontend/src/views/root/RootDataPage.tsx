import { useCallback, useEffect, useState } from 'react';
import { Compass, FileSpreadsheet, FlaskConical, ShieldCheck, Trash2 } from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { DemoDataModal } from '../../components/DemoDataModal';
import { FactoryResetModal } from '../../components/FactoryResetModal';
import { FullStoreExportModal } from '../../components/FullStoreExportModal';
import { GuidedTourModal } from '../../components/GuidedTourModal';
import { DANGER_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, SettingsCard } from '../settings/settingsParts';

interface DemoStatus {
  hasDemoData?: boolean;
  demoProductsCount?: number;
  demoSalesCount?: number;
  demoCustomersCount?: number;
}

interface CountTileProps {
  label: string;
  value: number;
  unit: string;
}

const CountTile = ({ label, value, unit }: CountTileProps) => (
  <div className="flex flex-col gap-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
    <span className="text-sm font-semibold text-ink-muted dark:text-ink-muted-dark">{label}</span>
    <span className="t-kpi text-ink dark:text-ink-dark">
      {value} <span className="text-sm font-semibold text-ink-muted dark:text-ink-muted-dark">{unit}</span>
    </span>
  </div>
);

/** Root page: demo data and cashier training, full data export and the factory reset (one home for each). */
export const RootDataPage = () => {
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);

  const loadDemoStatus = useCallback(async () => {
    try {
      setDemoStatus(await invoke<DemoStatus>('demo:getStatus'));
    } catch (err) {
      console.error('Failed to load demo status:', err);
    }
  }, []);

  useEffect(() => {
    void loadDemoStatus();
  }, [loadDemoStatus]);

  const hasDemo = demoStatus?.hasDemoData === true;

  return (
    <div className="flex flex-col gap-5 text-sm text-ink dark:text-ink-dark pb-8">
      <SettingsCard
        icon={FlaskConical}
        title="البيانات التجريبية وتدريب الكاشير"
        description="تجربة البرنامج وتدريب الكاشير على بيانات وهمية جاهزة، ومسحها بضغطة زر دون لمس الحسابات الحقيقية."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setIsTourOpen(true)} className={SECONDARY_BUTTON_CLASS}>
              <Compass className="w-4 h-4 text-brand dark:text-brand-bright" />
              <span>بدء الجولة السريعة (5 خطوات)</span>
            </button>
            <button type="button" onClick={() => setIsDemoOpen(true)} className={PRIMARY_BUTTON_CLASS}>
              <FlaskConical className="w-4 h-4" />
              <span>{hasDemo ? 'مسح وإدارة البيانات التجريبية' : 'تحميل بضاعة تجريبية'}</span>
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
            <span className="text-sm font-semibold text-ink-muted dark:text-ink-muted-dark">حالة البيانات التجريبية</span>
            <span className="flex items-start gap-3 font-bold leading-relaxed">
              <span
                aria-hidden="true"
                className={`w-2.5 h-2.5 mt-2 rounded-full shrink-0 ${hasDemo ? 'bg-warn dark:bg-warn-bright animate-pulse' : 'bg-ink-muted/50 dark:bg-ink-muted-dark/60'}`}
              />
              {hasDemo ? 'محمّلة في النظام حالياً (للتدريب والتجربة)' : 'غير موجودة: النظام يعمل ببيانات المحل الحقيقية فقط'}
            </span>
          </div>
          <CountTile label="الأصناف التجريبية" value={demoStatus?.demoProductsCount ?? 0} unit="صنف" />
          <CountTile label="الفواتير التجريبية" value={demoStatus?.demoSalesCount ?? 0} unit="فاتورة" />
          <CountTile label="الزبائن التجريبيون" value={demoStatus?.demoCustomersCount ?? 0} unit="زبون" />
        </div>

        <p className="flex items-start gap-3 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-bright/30 rounded-xl p-4 leading-relaxed m-0">
          <ShieldCheck className="w-5 h-5 shrink-0 text-paid dark:text-paid-bright" />
          <span>
            كل البيانات التجريبية مميّزة بكود يبدأ بـ{' '}
            <code className="font-mono bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-1.5 py-0.5 rounded text-brand-dark dark:text-brand-bright font-bold">demo_</code>
            ، وعند المسح تُحذف هذه السجلات فقط وتبقى بضاعة وفواتير وزبائن المحل الحقيقية كما هي.
          </span>
        </p>
      </SettingsCard>

      <SettingsCard
        icon={FileSpreadsheet}
        title="تصدير كل بيانات المحل"
        description="الأصناف والمخزن والزبائن والموردون والفواتير والورديات في ملفات Excel مفصلة على جهازك، بدون تشفير."
        action={
          <button type="button" onClick={() => setIsExportOpen(true)} className={PRIMARY_BUTTON_CLASS}>
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير بيانات المحل (Excel)</span>
          </button>
        }
      >
        <p className="text-sm text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0">
          بيانات المحل ملك صاحبها: التصدير نسخة للقراءة والمراجعة ولا يغيّر شيئاً داخل البرنامج.
        </p>
      </SettingsCard>

      <section className="bg-danger-soft/60 dark:bg-danger-dark-soft/50 rounded-2xl border border-danger/30 dark:border-danger-bright/30 shadow-xs p-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex items-start gap-3 flex-1 min-w-64">
          <div className="w-10 h-10 rounded-xl bg-surface dark:bg-surface-dark border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="t-card-title text-danger-ink dark:text-danger-bright m-0">تصفير كل البيانات وإعادة ضبط المصنع</h3>
            <p className="text-sm text-ink dark:text-ink-dark m-0 leading-relaxed">
              يمسح المبيعات والأصناف وحركات المخزن والديون، مع خيار مسح النسخ الاحتياطية، ويعيد البرنامج كأنه جديد. لا يمكن التراجع.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setIsResetOpen(true)} className={DANGER_BUTTON_CLASS}>
          <Trash2 className="w-4 h-4" />
          <span>مسح كل البيانات وبدء المحل من الصفر</span>
        </button>
      </section>

      <DemoDataModal
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        onStartTour={() => setIsTourOpen(true)}
        onDataChanged={() => void loadDemoStatus()}
      />
      <GuidedTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onLoadDemoData={() => setIsDemoOpen(true)}
        hasDemoData={hasDemo}
      />
      <FullStoreExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <FactoryResetModal isOpen={isResetOpen} onClose={() => setIsResetOpen(false)} />
    </div>
  );
};
