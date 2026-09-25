import { invoke } from '../bridge/ipc';

export interface PinStatus {
  isPinSet: boolean;
  isEnabled: boolean;
  isLocked: boolean;
  remainingLockoutSeconds: number;
  failedAttempts: number;
  protectedActions: Record<string, boolean>;
}

// In-memory cache for authenticated actions in current session
const authorizedActionsSession = new Set<string>();

/**
 * Fetch current PIN status from backend
 */
export async function getPinStatus(): Promise<PinStatus> {
  try {
    const res = await invoke<PinStatus>('security:getStatus');
    return (
      res || {
        isPinSet: false,
        isEnabled: false,
        isLocked: false,
        remainingLockoutSeconds: 0,
        failedAttempts: 0,
        protectedActions: {},
      }
    );
  } catch (err) {
    console.error('Failed to get PIN status:', err);
    return {
      isPinSet: false,
      isEnabled: false,
      isLocked: false,
      remainingLockoutSeconds: 0,
      failedAttempts: 0,
      protectedActions: {},
    };
  }
}

/**
 * Check whether a given action is protected and requires PIN entry
 */
export async function isActionProtected(actionKey: string): Promise<boolean> {
  // If already authenticated in current session, do not prompt again immediately
  if (authorizedActionsSession.has(actionKey)) {
    return false;
  }

  const status = await getPinStatus();
  if (!status.isPinSet || !status.isEnabled) {
    return false;
  }

  return Boolean(status.protectedActions[actionKey]);
}

/**
 * Mark action as authorized for the current session
 */
export function authorizeActionSession(actionKey: string): void {
  authorizedActionsSession.add(actionKey);
}

/**
 * Clear session authorizations (e.g. on logout or app lock)
 */
export function clearSessionAuthorizations(): void {
  authorizedActionsSession.clear();
}
