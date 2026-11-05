import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { RequiredMark } from '../../components/RequiredMark';
import { normalizeReceiptText, RECEIPT_TEXT_MAX_CHARS } from '../../utils/receiptLayout';

type IconType = ComponentType<{ className?: string }>;

/** Shared look of every text field on the store settings screens (44px high). */
export const FIELD_INPUT_CLASS =
  'w-full h-11 bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg px-3 text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/70 dark:placeholder:text-ink-muted-dark/70 focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors';

/** Shared 44px buttons of the settings and root screens. */
export const PRIMARY_BUTTON_CLASS =
  'h-11 px-5 bg-brand dark:bg-paid-bright hover:bg-brand-dark dark:hover:bg-paid-bright-hover disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted dark:disabled:text-ink-muted-dark disabled:cursor-not-allowed text-white dark:text-surface-dark rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer';
export const SECONDARY_BUTTON_CLASS =
  'h-11 px-4 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 disabled:opacity-60 disabled:cursor-not-allowed text-ink dark:text-ink-dark rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer';
export const DANGER_BUTTON_CLASS =
  'h-11 px-5 bg-danger hover:bg-danger-hover disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer';

interface ReceiptTextFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows: number;
  placeholder: string;
  hint?: string;
  error: string;
}

/** Multi-line receipt text: Enter starts a new line and the line breaks are printed as typed. */
export const ReceiptTextField = ({ label, value, onChange, rows, placeholder, hint, error }: ReceiptTextFieldProps) => (
  <label className="flex flex-col gap-2">
    <span className="t-label text-ink dark:text-ink-dark">{label}</span>
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={error !== ''}
      className={`w-full bg-surface dark:bg-surface-dark-2 border rounded-lg px-3 py-2.5 text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/70 dark:placeholder:text-ink-muted-dark/70 focus:outline-none focus:ring-1 transition-colors resize-none leading-relaxed ${
        error
          ? 'border-danger dark:border-danger-bright focus:border-danger dark:focus:border-danger-bright focus:ring-danger dark:focus:ring-danger-bright'
          : 'border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright focus:ring-brand dark:focus:ring-brand-bright'
      }`}
    />
    <span className="flex flex-wrap items-center justify-between gap-x-3 text-xs leading-relaxed">
      {error ? (
        <span className="text-danger dark:text-danger-bright font-semibold">{error}</span>
      ) : (
        <span className="text-ink-muted dark:text-ink-muted-dark">{hint ?? ''}</span>
      )}
      <span dir="ltr" className="text-ink-muted dark:text-ink-muted-dark tabular-nums">
        {normalizeReceiptText(value).length} / {RECEIPT_TEXT_MAX_CHARS}
      </span>
    </span>
  </label>
);

interface SettingsCardProps {
  icon: IconType;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'brand' | 'warn';
  children: ReactNode;
}

/** A titled section on the canvas: icon, short title and description, optional action, then the content. */
export const SettingsCard = ({ icon: Icon, title, description, action, tone = 'brand', children }: SettingsCardProps) => (
  <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-xs p-5 flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex items-start gap-3 flex-1 min-w-64">
        <div
          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            tone === 'warn'
              ? 'bg-warn-soft dark:bg-warn-dark-soft border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
              : 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid-bright/20 text-paid dark:text-paid-bright'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="t-card-title text-ink dark:text-ink-dark m-0">{title}</h3>
          {description && (
            <p className="text-xs text-ink-muted dark:text-ink-muted-dark m-0 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}

/** Label above the field; the label wraps the control so clicking it focuses the input. */
export const Field = ({ label, required = false, hint, className = '', children }: FieldProps) => (
  <label className={`flex flex-col gap-2 ${className}`}>
    <span className="t-label text-ink dark:text-ink-dark">
      {label}
      {required && <RequiredMark />}
    </span>
    {children}
    {hint && <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">{hint}</span>}
  </label>
);

interface ToggleRowProps {
  icon?: IconType;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Shown only while the setting is in its risky state */
  warning?: string | null;
  switchTitle?: string;
  disabled?: boolean;
  /** Replaces the switch with a fixed badge for a rule the system always enforces */
  lockedLabel?: string;
}

/** One setting: title, one-line consequence, optional risk warning, and the switch. Rows are separated by dividers. */
export const ToggleRow = ({ icon: Icon, title, description, checked, onChange, warning, switchTitle, disabled = false, lockedLabel }: ToggleRowProps) => (
  <div className="flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0">
    <div className="flex items-start gap-3 min-w-0">
      {Icon && (
        <div className="w-9 h-9 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="t-label text-ink dark:text-ink-dark">{title}</span>
        <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">{description}</span>
        {warning && (
          <span className="flex items-start gap-2 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 rounded-lg px-3 py-2 text-xs font-semibold text-ink dark:text-warn-bright leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-warn dark:text-warn-bright" />
            <span>{warning}</span>
          </span>
        )}
      </div>
    </div>
    <div className="shrink-0 pt-1">
      {lockedLabel ? (
        <span className="inline-flex items-center gap-1.5 bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid-bright/30 text-paid dark:text-paid-bright rounded-lg px-2.5 py-1 text-micro font-bold whitespace-nowrap">
          <Lock className="w-3 h-3" />
          {lockedLabel}
        </span>
      ) : (
        <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} title={switchTitle ?? title} />
      )}
    </div>
  </div>
);
