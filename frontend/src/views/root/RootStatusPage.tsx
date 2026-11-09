import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import {
  Activity,
  CheckCircle2,
  ClipboardCopy,
  ClipboardList,
  Cpu,
  Database,
  Fingerprint,
  Gauge,
  HardDrive,
  KeyRound,
  Layers,
  Package,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  X,
  Zap,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { SearchBenchmarkModal } from '../../components/SearchBenchmarkModal';
import { ReadinessCheckModal } from '../../components/ReadinessCheckModal';
import { buildDiagnosticsSummary, type StatusRow, type StatusTone } from '../../utils/diagnosticsSummary';
import { AppButton } from '../../components/AppButton';
import { SettingsCard } from '../settings/settingsParts';
import { useSystemSummary } from './useSystemSummary';
import type { SystemInfo } from '../../App';

interface RootStatusPageProps {
  sysInfo?: SystemInfo | null;
  /** Lets the readiness checklist jump to the screen a failed check belongs to */
  onNavigateToTab: (tab: string) => void;
}

const ROW_ICONS: Record<StatusRow['id'], ComponentType<{ className?: string }>> = {
  version: Tag,
  os: Cpu,
  engine: Layers,
  database: Database,
  license: KeyRound,
  backup: HardDrive,
  printer: Printer,
  features: SlidersHorizontal,
  disk: Gauge,
  audit: ShieldCheck,
  device: Fingerprint,
};

const TONE_DOT: Record<StatusTone, string> = {
  ok: 'bg-paid dark:bg-paid-bright',
  warn: 'bg-warn dark:bg-warn-bright',
  muted: 'bg-ink-muted/50 dark:bg-ink-muted-dark/60',
};

const HEALTH_BANNER: Record<string, string> = {
  HEALTHY: 'bg-paid-soft dark:bg-paid-dark-soft border-paid/30 dark:border-paid-bright/30 text-paid dark:text-paid-bright',
  ATTENTION_NEEDED: 'bg-warn-soft dark:bg-warn-dark-soft border-warn/30 dark:border-warn-bright/30 text-ink dark:text-warn-bright',
  CRITICAL: 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright',
};

interface CheckButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

const CheckButton = ({ icon: Icon, label, onClick, disabled = false }: CheckButtonProps) => (
  <AppButton variant="secondary" size="lg" icon={Icon} onClick={onClick} disabled={disabled} className="!justify-start">
    <span className="truncate">{label}</span>
  </AppButton>
);

type CopyState = 'idle' | 'copied' | 'failed';

/** Root landing page: live system summary, the quick checks and the diagnostics bundle / copyable summary. */
export const RootStatusPage = ({ sysInfo, onNavigateToTab }: RootStatusPageProps) => {
  const { health, loading: healthLoading, error: healthError, reload: loadHealth, rows } = useSystemSummary(sysInfo);

  const [busy, setBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleMessage, setBundleMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 3500);
    return () => clearTimeout(timer);
  }, [copyState]);

  const createBundle = async () => {
    setBundleLoading(true);
    setBundleMessage(null);
    try {
      const res = await invoke<{ success: boolean; message: string }>('support:createBundle');
      setBundleMessage(res?.message || (res?.success ? 'تم تجهيز ملف التشخيص' : 'تعذر تجهيز ملف التشخيص'));
    } catch (err: unknown) {
      setBundleMessage(`تعذر تجهيز الملف: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBundleLoading(false);
    }
  };

  // The copied text is built from the same rows the tiles above show
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildDiagnosticsSummary(rows, new Date().toLocaleString('ar-EG-u-nu-latn')));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const runCheck = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setCheckResult(await action());
    } catch (err: unknown) {
      setCheckResult(`تعذر إتمام الفحص: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const runPrinterTest = () =>
    runCheck(async () => {
      const res = await invoke<{ message: string }>('printer:test');
      return res?.message || 'تم إرسال اختبار الطابعة';
    });

  const runSqliteTest = () =>
    runCheck(async () => {
      const res = await invoke<{ message: string }>('db:testTransaction', { count: 10 });
      return `نجاح المعاملة: ${res?.message ?? ''}`;
    });

  const runPingTest = () =>
    runCheck(async () => {
      const start = performance.now();
      await invoke('system:ping', { timestamp: Date.now() });
      return `سرعة الاستجابة الداخلية: تم الرد في ${Math.round(performance.now() - start)} مللي ثانية`;
    });

  const visibleAlerts = (health?.alerts ?? []).filter((alert) => alert.level !== 'info');
  const bannerClass = HEALTH_BANNER[health?.overallStatus ?? ''] ?? HEALTH_BANNER.HEALTHY;

  return (
    <div className="flex flex-col gap-5 text-sm text-ink dark:text-ink-dark pb-8">
      <SettingsCard
        icon={Activity}
        title="ملخص حالة النظام"
        description="لقطة حية من هذا الجهاز: الإصدار والترخيص والنسخ الاحتياطي والطابعة والميزات."
        action={
          <AppButton variant="secondary" size="lg" icon={RefreshCw} loading={healthLoading} onClick={() => void loadHealth()}>
            تحديث
          </AppButton>
        }
      >
        {healthError && (
          <div className="flex items-start gap-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright rounded-xl p-4 font-semibold">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>تعذر قراءة حالة النظام: {healthError}</span>
          </div>
        )}

        {health && !healthError && (
          <div className={`flex items-start gap-3 border rounded-xl p-4 font-semibold leading-relaxed ${bannerClass}`}>
            {health.overallStatus === 'HEALTHY' ? <ShieldCheck className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
            <span>{health.oneSentenceSummary}</span>
          </div>
        )}

        {visibleAlerts.length > 0 && (
          <ul className="flex flex-col gap-3 list-none m-0 p-0">
            {visibleAlerts.map((alert) => (
              <li key={alert.id} className="flex flex-col gap-1 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
                <span className="t-label text-ink dark:text-ink-dark">{alert.title}</span>
                <span className="text-sm text-ink-muted dark:text-ink-muted-dark leading-relaxed">{alert.message}</span>
              </li>
            ))}
          </ul>
        )}

        <dl className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 m-0">
          {rows.map((row) => {
            const Icon = ROW_ICONS[row.id];
            const isCode = row.id === 'device';
            return (
              <div key={row.id} className="flex items-start gap-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <dt className="flex items-center gap-2 text-xs font-semibold text-ink-muted dark:text-ink-muted-dark">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[row.tone]}`} aria-hidden="true" />
                    {row.label}
                  </dt>
                  <dd
                    dir={isCode ? 'ltr' : undefined}
                    className={`m-0 text-sm font-bold text-ink dark:text-ink-dark leading-relaxed break-words ${isCode ? 'font-mono text-right break-all' : ''}`}
                  >
                    {row.value}
                  </dd>
                </div>
              </div>
            );
          })}
        </dl>
      </SettingsCard>

      <SettingsCard
        icon={Zap}
        title="فحوصات سريعة"
        description="اختبارات آمنة لا تغيّر بيانات المحل. تظهر النتيجة أسفل الأزرار."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <CheckButton icon={Printer} label="اختبار طابعة الفواتير" onClick={() => void runPrinterTest()} disabled={busy} />
          <CheckButton icon={Database} label="فحص حفظ المعاملات في قاعدة البيانات" onClick={() => void runSqliteTest()} disabled={busy} />
          <CheckButton icon={Zap} label="قياس سرعة استجابة البرنامج" onClick={() => void runPingTest()} disabled={busy} />
          <CheckButton icon={Gauge} label="اختبار ضغط وسرعة البحث" onClick={() => setIsBenchmarkOpen(true)} disabled={busy} />
          <CheckButton icon={ClipboardList} label="فحص جاهزية التشغيل والعتاد" onClick={() => setIsReadinessOpen(true)} disabled={busy} />
        </div>

        {busy && (
          <span role="status" className="text-sm text-ink-muted dark:text-ink-muted-dark">جاري تنفيذ الفحص...</span>
        )}
        {checkResult && !busy && (
          <div role="status" className="flex items-start justify-between gap-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4 leading-relaxed">
            <span className="min-w-0 break-words">{checkResult}</span>
            <AppButton variant="subtle" icon={X} aria-label="إغلاق النتيجة" onClick={() => setCheckResult(null)} />
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        icon={Package}
        title="ملف التشخيص"
        description="ملف مضغوط على سطح المكتب فيه تقرير الجهاز وسجل الأخطاء، ولا يحتوي على بيانات الزبائن أو الأسعار. الملخص المنسوخ هو نفس القيم الظاهرة أعلاه، بدون مفتاح الترخيص."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <span role="status" aria-live="polite" className="text-sm font-semibold">
              {copyState === 'copied' && (
                <span className="flex items-center gap-2 text-paid dark:text-paid-bright">
                  <CheckCircle2 className="w-4 h-4" />
                  تم نسخ الملخص
                </span>
              )}
              {copyState === 'failed' && (
                <span className="flex items-center gap-2 text-danger dark:text-danger-bright">
                  <ShieldAlert className="w-4 h-4" />
                  تعذر النسخ، حاول مرة أخرى
                </span>
              )}
            </span>
            <AppButton variant="secondary" size="lg" icon={ClipboardCopy} onClick={() => void copySummary()}>
              نسخ ملخص التشخيص
            </AppButton>
            <AppButton variant="primary" size="lg" icon={Package} loading={bundleLoading} onClick={() => void createBundle()}>
              {bundleLoading ? 'جاري تجهيز الملف...' : 'تجهيز ملف التشخيص'}
            </AppButton>
          </div>
        }
      >
        {bundleMessage && (
          <div role="status" className="flex items-start justify-between gap-3 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-bright/30 text-ink dark:text-ink-dark rounded-xl p-4 leading-relaxed whitespace-pre-line">
            <span className="min-w-0 break-words">{bundleMessage}</span>
            <AppButton variant="subtle" icon={X} aria-label="إغلاق الرسالة" onClick={() => setBundleMessage(null)} />
          </div>
        )}
      </SettingsCard>

      <SearchBenchmarkModal isOpen={isBenchmarkOpen} onClose={() => setIsBenchmarkOpen(false)} />
      <ReadinessCheckModal
        isOpen={isReadinessOpen}
        onClose={() => setIsReadinessOpen(false)}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
};
