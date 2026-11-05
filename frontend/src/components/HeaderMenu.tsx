import { useCallback, useEffect, useId, useRef, useState, type FC, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface HeaderMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Keyboard shortcut shown on the row (e.g. F5). */
  hint?: string;
  tone?: 'default' | 'danger';
  separatorBefore?: boolean;
}

interface HeaderMenuProps {
  ariaLabel: string;
  title: string;
  triggerClassName: string;
  triggerContent: ReactNode;
  items: HeaderMenuItem[];
  /** Static block above the items (e.g. the signed-in user card). */
  panelHeader?: ReactNode;
  panelAlign?: 'left' | 'right';
}

// Small accessible dropdown for the top bar: Esc / outside click closes, arrows move between rows.
export const HeaderMenu: FC<HeaderMenuProps> = ({
  ariaLabel,
  title,
  triggerClassName,
  triggerContent,
  items,
  panelHeader,
  panelAlign = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
  }, [open]);

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? []);
    if (rows.length === 0) return;
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (index + 1) % rows.length : (index - 1 + rows.length) % rows.length;
    rows[next].focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={triggerClassName}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        {triggerContent}
      </button>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={onPanelKeyDown}
          className={`absolute top-full mt-1.5 z-50 w-60 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-xl overflow-hidden text-right ${
            panelAlign === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {panelHeader}
          <div className="p-1.5 flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const isDanger = item.tone === 'danger';
              return (
                <div key={item.id} className="flex flex-col">
                  {item.separatorBefore && <div className="my-1 h-px bg-line dark:bg-line-dark" role="separator" />}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                    className={`w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-sm font-semibold transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand dark:focus-visible:ring-brand-bright ${
                      isDanger
                        ? 'text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft'
                        : 'text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isDanger ? 'text-danger dark:text-danger-bright' : 'text-brand dark:text-brand-bright'}`} />
                    <span className="flex-1 text-right truncate">{item.label}</span>
                    {item.hint && (
                      <kbd className="px-1.5 rounded text-micro font-mono font-bold bg-surface-2 dark:bg-surface-dark-3 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted">
                        {item.hint}
                      </kbd>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
