import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import {
  canSaveAll,
  createGuardRegistry,
  createLeaveController,
  describeEntries,
} from '../utils/unsavedChangesGuard';
import { UnsavedChangesContext, type UnsavedChangesContextType } from './unsavedChangesContextDef';

/** Owns the registry of forms with unsaved changes and shows the question asked when the user tries to leave them. */
export const UnsavedChangesProvider = ({ children }: { children: ReactNode }) => {
  const [{ registry, controller }] = useState(() => {
    const guardRegistry = createGuardRegistry();
    return { registry: guardRegistry, controller: createLeaveController(guardRegistry) };
  });
  const pending = useSyncExternalStore(controller.subscribe, controller.getState);

  // The question closes by itself when nothing is left to lose (the page was saved or unmounted meanwhile)
  useEffect(() => controller.start(), [controller]);

  const value = useMemo<UnsavedChangesContextType>(
    () => ({ registry, requestLeave: controller.request }),
    [registry, controller],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      {pending && (
        <UnsavedChangesDialog
          labels={describeEntries(pending.entries)}
          canSave={canSaveAll(pending.entries)}
          saving={pending.saving}
          onSave={() => void controller.save()}
          onDiscard={controller.discard}
          onStay={controller.stay}
        />
      )}
    </UnsavedChangesContext.Provider>
  );
};
