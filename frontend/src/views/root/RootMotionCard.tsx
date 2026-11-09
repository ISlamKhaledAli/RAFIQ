import { useState, type ComponentType } from 'react';
import { Activity, Blend, Feather, Gauge, Maximize2, MoveVertical, Play, Zap } from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { AppButton } from '../../components/AppButton';
import { useMotionPanel } from '../../hooks/useMotionPanel';
import {
  MOTION_LEVEL_SETTING_KEY,
  MOTION_SETTING_KEY,
  MOTION_STYLE_SETTING_KEY,
  parseMotionLevel,
  parseMotionStyle,
  setMotionEnabled,
  setMotionLevel,
  setMotionStyle,
  type MotionLevel,
  type MotionStyle,
} from '../../utils/motion';
import { SettingsCard, ToggleRow } from '../settings/settingsParts';

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const LEVEL_OPTIONS: ChoiceOption<MotionLevel>[] = [
  { value: 'soft', label: 'خفيفة', description: 'حركة قصيرة وهادئة، الأخف على الأجهزة الضعيفة.', icon: Feather },
  { value: 'medium', label: 'متوسطة', description: 'التوازن الافتراضي بين الوضوح والسرعة.', icon: Activity },
  { value: 'strong', label: 'قوية', description: 'حركة أطول وأوضح، تناسب الأجهزة القوية فقط.', icon: Zap },
];

const STYLE_OPTIONS: ChoiceOption<MotionStyle>[] = [
  { value: 'slide', label: 'انزلاق', description: 'تظهر العناصر وهي تنزلق إلى مكانها.', icon: MoveVertical },
  { value: 'fade', label: 'تلاشي', description: 'تظهر العناصر بتلاشي هادئ دون تحريك مكانها.', icon: Blend },
  { value: 'zoom', label: 'تكبير', description: 'تظهر العناصر وهي تكبر من حجم أصغر قليلاً.', icon: Maximize2 },
];

const ACTIVE_CHOICE =
  'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40 shadow-xs';
const IDLE_CHOICE =
  'text-ink-muted dark:text-ink-muted-dark hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark';

interface ChoiceGroupProps<T extends string> {
  title: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled: boolean;
}

function ChoiceGroup<T extends string>({ title, options, value, onChange, disabled }: ChoiceGroupProps<T>) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="flex flex-col gap-2">
      <span className="t-label text-ink dark:text-ink-dark">{title}</span>
      <div
        role="radiogroup"
        aria-label={title}
        className="flex items-stretch gap-1 p-1 w-fit max-w-full rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`h-8 px-3 rounded-md text-xs font-bold whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive ? ACTIVE_CHOICE : IDLE_CHOICE
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">{selected.description}</span>
    </div>
  );
}

function isMotionOn(): boolean {
  return document.documentElement.dataset.motion === 'on';
}

// Windows "show animations" off (or macOS reduce motion) makes the browser report this; every animation then stays off by design
function osReducesMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Root-only switch, strength and look of the interface animations. Every change saves at once and applies live
 * (no restart); the host rejects the write for anyone but root, so hiding this card is not the only protection.
 */
export const RootMotionCard = () => {
  const [enabled, setEnabled] = useState(isMotionOn);
  const [level, setLevel] = useState<MotionLevel>(() => parseMotionLevel(document.documentElement.dataset.motionLevel));
  const [style, setStyle] = useState<MotionStyle>(() => parseMotionStyle(document.documentElement.dataset.motionStyle));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewRun, setPreviewRun] = useState(0);
  const preview = useMotionPanel(String(previewRun));
  const replay = () => setPreviewRun((n) => n + 1);

  // The value is already applied live; a failed save puts the previous one back and shows the host message
  const persist = async (key: string, value: string, revert: () => void) => {
    setSaving(true);
    setError('');
    try {
      await invoke('settings:save', { [key]: value });
    } catch (err) {
      revert();
      setError(err instanceof Error && err.message ? err.message : 'تعذر حفظ الإعداد، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  const handleEnabled = (next: boolean) => {
    setEnabled(next);
    setMotionEnabled(document.documentElement, localStorage, next);
    void persist(MOTION_SETTING_KEY, next ? '1' : '0', () => {
      setEnabled(!next);
      setMotionEnabled(document.documentElement, localStorage, !next);
    });
  };

  const handleLevel = (next: MotionLevel) => {
    if (next === level) return;
    const prev = level;
    setLevel(next);
    setMotionLevel(document.documentElement, localStorage, next);
    replay();
    void persist(MOTION_LEVEL_SETTING_KEY, next, () => {
      setLevel(prev);
      setMotionLevel(document.documentElement, localStorage, prev);
    });
  };

  const handleStyle = (next: MotionStyle) => {
    if (next === style) return;
    const prev = style;
    setStyle(next);
    setMotionStyle(document.documentElement, localStorage, next);
    replay();
    void persist(MOTION_STYLE_SETTING_KEY, next, () => {
      setStyle(prev);
      setMotionStyle(document.documentElement, localStorage, prev);
    });
  };

  return (
    <SettingsCard
      icon={Gauge}
      title="الحركات والانتقالات (تأثيرات الواجهة)"
      description="انتقال ناعم عند التبديل بين التبويبات والشاشات، وظهور هادئ للنوافذ والتنبيهات. تسري فوراً على كل المستخدمين بدون إعادة تشغيل."
    >
      <div className="flex flex-col">
        <ToggleRow
          title="تفعيل الحركات والانتقالات"
          description="مغلقة افتراضياً. فعّلها فقط على الأجهزة القوية؛ قد تبطئ الأجهزة القديمة. تتوقف تلقائياً إذا كان ويندوز مضبوطاً على تقليل الحركة."
          checked={enabled}
          onChange={handleEnabled}
          disabled={saving}
        />
        {enabled && osReducesMotion() && (
          <div className="mb-3 text-xs font-semibold text-warn dark:text-warn-bright" role="status">
            هذا الجهاز مضبوط على تقليل الحركة (إعداد ويندوز: عرض الحركات)، لذلك لن تظهر أي حركة هنا حتى مع تفعيل الخيار. فعّل عرض الحركات في إعدادات ويندوز لتراها.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-4">
          <ChoiceGroup title="قوة الحركة" options={LEVEL_OPTIONS} value={level} onChange={handleLevel} disabled={!enabled || saving} />
          <ChoiceGroup title="شكل الحركة" options={STYLE_OPTIONS} value={style} onChange={handleStyle} disabled={!enabled || saving} />
        </div>
        {error && (
          <div className="mb-3 text-xs font-semibold text-danger dark:text-danger-bright" role="alert">
            {error}
          </div>
        )}
        <div className="flex flex-wrap items-stretch gap-4">
          <div className="flex items-start">
            <AppButton variant="secondary" size="md" icon={Play} disabled={!enabled} onClick={replay}>
              تجربة
            </AppButton>
          </div>
          <div {...preview} className="flex-1 min-w-56">
            <div className="h-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-3 text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
              <span className="block font-bold text-ink dark:text-ink-dark mb-1">
                {previewRun % 2 === 0 ? 'التبويب الأول' : 'التبويب الثاني'}
              </span>
              {enabled ? 'هكذا ينتقل المحتوى عند التبديل بين التبويبات والشاشات.' : 'فعّل الحركات ثم اضغط تجربة لمشاهدة الانتقال.'}
            </div>
          </div>
          <div
            key={previewRun}
            className="relative flex-1 min-w-56 min-h-24 flex items-center justify-center overflow-hidden rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-3"
          >
            <div className="motion-modal-backdrop absolute inset-0 bg-black/10 dark:bg-black/40" aria-hidden="true" />
            <div className="motion-modal-panel relative w-full max-w-60 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-md p-3 text-xs">
              <span className="block font-bold text-ink dark:text-ink-dark mb-1">نافذة تجريبية</span>
              <span className="text-ink-muted dark:text-ink-muted-dark">هكذا تظهر النوافذ والتنبيهات.</span>
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
};
