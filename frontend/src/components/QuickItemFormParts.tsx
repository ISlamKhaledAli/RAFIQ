import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { RequiredMark } from './RequiredMark';

/** Shared building blocks for the quick-button add modal and the quick-button manager. */

export const QUICK_FIELD =
  'w-full h-10 px-3 text-sm bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-ink dark:text-ink-dark placeholder:text-ink-muted/60 dark:placeholder:text-ink-dark-muted/60 focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-2 focus:ring-brand/20 transition-colors';

/** Roomier 44px field for the quick-add modal (the manager keeps the compact 40px one). */
export const QUICK_FIELD_LG =
  'w-full h-11 px-3.5 text-sm bg-surface dark:bg-surface-dark-3 border border-line dark:border-line-dark rounded-lg text-ink dark:text-ink-dark placeholder:text-ink-muted/60 dark:placeholder:text-ink-dark-muted/60 focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-2 focus:ring-brand/20 transition-colors';

export const QUICK_BTN =
  'h-10 px-4 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const QUICK_BTN_SECONDARY =
  'bg-surface dark:bg-surface-dark-3 text-ink dark:text-ink-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2';
export const QUICK_BTN_LG =
  'h-11 px-5 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const QUICK_BTN_PRIMARY = 'bg-brand hover:bg-brand-hover text-white shadow-xs';
export const QUICK_BTN_ICON =
  'w-10 h-10 shrink-0 rounded-lg inline-flex items-center justify-center border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const QUICK_BTN_ICON_LG =
  'w-11 h-11 shrink-0 rounded-lg inline-flex items-center justify-center border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const FieldLabel = ({ children, required = false }: { children: ReactNode; required?: boolean }) => (
  <span className="block text-sm font-bold text-ink dark:text-ink-dark mb-1.5">
    {children}
    {required && <> <RequiredMark /></>}
  </span>
);

export const FormSection = ({ title, hint, card = false, children }: { title: string; hint?: string; card?: boolean; children: ReactNode }) => (
  <section
    className={`flex flex-col ${
      card ? 'gap-4 p-5 rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2' : 'gap-3'
    }`}
  >
    <div className="flex items-baseline justify-between gap-2">
      <h4 className={`${card ? 't-card-title' : 't-label'} text-ink dark:text-ink-dark m-0`}>{title}</h4>
      {hint && <span className="text-xs text-ink-muted dark:text-ink-dark-muted">{hint}</span>}
    </div>
    {children}
  </section>
);

/** Collapsed-by-default block for the optional fields; the summary keeps current choices visible. */
export const ExtrasSection = ({ summary, children }: { summary: string; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="shrink-0 rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full h-12 px-4 flex items-center justify-between gap-3 text-ink dark:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold shrink-0">خيارات إضافية</span>
          <span className="text-xs font-medium text-ink-muted dark:text-ink-dark-muted truncate">{summary}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-ink-muted dark:text-ink-dark-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="p-4 border-t border-line dark:border-line-dark flex flex-col gap-4">{children}</div>
      )}
    </section>
  );
};

interface PriceInputProps {
  value: string;
  onChange: (value: string) => void;
  step: string;
  min: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  large?: boolean;
}

export const PriceInput = ({ value, onChange, step, min, placeholder = '0.00', disabled = false, required = false, large = false }: PriceInputProps) => (
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted dark:text-ink-dark-muted pointer-events-none">
      ج.م
    </span>
    <input
      type="number"
      step={step}
      min={min}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${large ? QUICK_FIELD_LG : QUICK_FIELD} pl-12 font-mono font-bold tabular-nums text-left disabled:opacity-50 disabled:cursor-not-allowed`}
    />
  </div>
);

type NoticeTone = 'danger' | 'warn' | 'ok' | 'brand' | 'neutral';

const NOTICE_TONE: Record<NoticeTone, string> = {
  danger: 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30',
  warn: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/30',
  ok: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-paid-dark-border',
  brand: 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30',
  neutral: 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark',
};

export const InlineNotice = ({ tone, icon, children }: { tone: NoticeTone; icon?: ReactNode; children: ReactNode }) => (
  <div className={`rounded-lg border px-3 py-2 text-xs font-semibold leading-relaxed flex items-start gap-2 ${NOTICE_TONE[tone]}`}>
    {icon}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export const SmallChip = ({ tone, children }: { tone: NoticeTone; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-xs font-bold whitespace-nowrap ${NOTICE_TONE[tone]}`}>
    {children}
  </span>
);
