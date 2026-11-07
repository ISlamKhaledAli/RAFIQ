import { createContext } from 'react';
import type { GuardRegistry, LeaveOptions } from '../utils/unsavedChangesGuard';

export interface UnsavedChangesContextType {
  registry: GuardRegistry;
  /** Runs `proceed` now when nothing would be lost, otherwise asks the user first. Ignored while a question is already open. */
  requestLeave: (proceed: () => void, options?: LeaveOptions) => void;
}

export const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined);
