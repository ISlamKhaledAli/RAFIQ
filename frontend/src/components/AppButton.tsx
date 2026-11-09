import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentType, ReactNode, Ref } from 'react';
import { Loader2 } from 'lucide-react';
import { buttonClass, buttonIconClass } from '../utils/buttonStyles.ts';
import type { ButtonSize, ButtonVariant } from '../utils/buttonStyles.ts';

type IconComponent = ComponentType<{ className?: string }>;

interface AppButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading/trailing icon (a lucide component). Replaced by a spinner while `loading`. */
  icon?: IconComponent;
  /** `start` renders the icon first in DOM order, i.e. on the reading-start side (right in RTL). */
  iconPosition?: 'start' | 'end';
  /** Disables the button, sets aria-busy and shows a spinner without changing the button width. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Layout-only extras (margins, shrink-0). Never colours, heights or radii. */
  className?: string;
}

// Without children the button is icon-only: an icon and an accessible name are mandatory.
type ContentProps =
  | { children: ReactNode; 'aria-label'?: string }
  | { children?: undefined; icon: IconComponent; 'aria-label': string };

type NativeButtonProps = { as?: 'button'; href?: never } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>;
type NativeAnchorProps = { as: 'a' } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className'>;

export type AppButtonProps = AppButtonOwnProps & ContentProps & (NativeButtonProps | NativeAnchorProps);

export const AppButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, AppButtonProps>(function AppButton(props, ref) {
  const {
    as: element = 'button',
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconPosition = 'start',
    loading = false,
    fullWidth = false,
    className,
    children,
    ...native
  } = props;

  const iconOnly = children === undefined && Icon !== undefined;
  const iconClass = buttonIconClass(size, iconOnly);
  const ariaLabel = native['aria-label'];
  const classes = [
    iconOnly ? buttonClass({ variant, size, fullWidth, loading, iconOnly: true, ariaLabel: ariaLabel ?? '' }) : buttonClass({ variant, size, fullWidth, loading }),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const iconNode = loading && Icon ? <Loader2 className={`${iconClass} animate-spin`} aria-hidden="true" /> : Icon ? <Icon className={iconClass} /> : null;
  // Without an icon, the label stays in the layout (invisible) so the width does not jump while loading.
  const overlaySpinner = loading && !Icon;
  const label = overlaySpinner ? <span className="invisible">{children}</span> : children;
  const content = (
    <>
      {iconPosition === 'start' && iconNode}
      {label}
      {iconPosition === 'end' && iconNode}
      {overlaySpinner && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className={`${iconClass} animate-spin`} />
        </span>
      )}
    </>
  );
  const title = native.title ?? (iconOnly ? ariaLabel : undefined);

  if (element === 'a') {
    const { href, onClick, tabIndex, ...anchor } = native as AnchorHTMLAttributes<HTMLAnchorElement>;
    const inert = loading || anchor['aria-disabled'] === true || anchor['aria-disabled'] === 'true';
    return (
      <a
        {...anchor}
        ref={ref as Ref<HTMLAnchorElement>}
        href={inert ? undefined : href}
        onClick={inert ? undefined : onClick}
        tabIndex={inert ? -1 : tabIndex}
        title={title}
        className={classes}
        aria-busy={loading || undefined}
        aria-disabled={inert || undefined}
      >
        {content}
      </a>
    );
  }

  const { type, disabled, ...button } = native as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      {...button}
      ref={ref as Ref<HTMLButtonElement>}
      type={type ?? 'button'}
      title={title}
      disabled={disabled || loading}
      className={classes}
      aria-busy={loading || undefined}
    >
      {content}
    </button>
  );
});
