import { Sun, Moon, Monitor, Palette, CheckCircle2 } from 'lucide-react';
import { useTheme } from '../../context/useTheme';
import { SettingsCard } from './settingsParts';

type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeOptionMeta {
  id: ThemeOption;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBox: string;
}

const THEME_OPTIONS: ThemeOptionMeta[] = [
  {
    id: 'light',
    label: 'نهاري',
    hint: 'خلفية فاتحة عالية الإشراق',
    icon: Sun,
    iconBox: 'bg-warn-soft dark:bg-warn-dark-soft border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright',
  },
  {
    id: 'dark',
    label: 'ليلي',
    hint: 'مريح للعين في الإضاءة المنخفضة',
    icon: Moon,
    iconBox: 'bg-brand-soft dark:bg-brand-dark-soft border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright',
  },
  {
    id: 'system',
    label: 'تلقائي',
    hint: 'يتبع إعداد الويندوز',
    icon: Monitor,
    iconBox: 'bg-surface-2 dark:bg-surface-dark-3 border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark',
  },
];

/** App appearance (light / dark / follow Windows): a per-device preference, not a store or receipt setting. */
export const ThemeModeCard = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <SettingsCard
      icon={Palette}
      title="مظهر البرنامج"
      description="تفضيل خاص بهذا الجهاز فقط، ولا يغيّر شكل الوصل ولا إعدادات باقي الأجهزة."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="مظهر البرنامج">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = theme === option.id;
          const hint = option.id === 'system' ? `${option.hint} (حالياً ${resolvedTheme === 'dark' ? 'ليلي' : 'نهاري'})` : option.hint;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(option.id)}
              className={`flex items-start gap-3 p-4 rounded-xl border transition-colors text-right cursor-pointer ${
                active
                  ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid dark:border-paid-bright ring-1 ring-paid/30 dark:ring-paid-bright/30'
                  : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${option.iconBox}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="t-label text-ink dark:text-ink-dark">{option.label}</span>
                  {active && <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />}
                </div>
                <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">{hint}</span>
              </div>
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
};
