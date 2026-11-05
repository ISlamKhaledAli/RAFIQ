import { Power } from 'lucide-react';

interface ExitAppButtonProps {
  /** Asks for confirmation, then closes the program (the same handler as the sidebar exit button) */
  onExit: () => void;
  /** Smaller variant for use inside a card header */
  compact?: boolean;
  className?: string;
}

/** Close-the-program button for the screens shown before a user session exists (login, forced PIN change, loading, lock). */
export const ExitAppButton = ({ onExit, compact = false, className = '' }: ExitAppButtonProps) => (
  <button
    type="button"
    onClick={onExit}
    title="إغلاق البرنامج والخروج بأمان"
    className={`${
      compact ? 'h-9 px-3 text-xs' : 'h-11 px-4 text-sm'
    } shrink-0 rounded-lg inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap text-danger dark:text-danger-bright bg-surface dark:bg-surface-dark border border-danger/40 dark:border-danger-bright/40 hover:bg-danger-soft dark:hover:bg-danger-dark-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger dark:focus-visible:ring-danger-bright transition-colors cursor-pointer ${className}`}
  >
    <Power className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    <span>إغلاق البرنامج</span>
  </button>
);
