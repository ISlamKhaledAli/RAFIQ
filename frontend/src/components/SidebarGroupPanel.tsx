import type { ReactNode } from 'react';
import { useExitTransition } from '../hooks/useExitTransition';

interface SidebarGroupPanelProps {
  open: boolean;
  children: ReactNode;
}

/**
 * Child items of an expandable sidebar group. With motion on, index.css glides the height and fades the items in
 * (.motion-nav-group) and, thanks to useExitTransition, back out on close while the row stays inert; motion off
 * (or reduced motion) mounts and unmounts instantly and keeps the short animate-in pop of the inner block.
 */
export default function SidebarGroupPanel({ open, children }: SidebarGroupPanelProps) {
  const { mounted, exiting } = useExitTransition(open);
  if (!mounted) return null;
  return (
    <div className="motion-nav-group motion-exit-collapse" data-exiting={exiting || undefined} inert={exiting || undefined}>
      <div>
        <div className="mr-2.5 pr-2 my-1 flex flex-col gap-1 border-r-2 border-brand-dark/25 dark:border-paid-bright/40 animate-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      </div>
    </div>
  );
}
