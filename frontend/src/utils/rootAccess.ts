// Pure rules for the root-only developer console (no runtime imports) so they can be unit-tested under node strip-types.
// The server stays authoritative; these rules only decide which pages the sidebar and the console show.

export type RootSubTab = 'status' | 'receipt' | 'features' | 'devices' | 'data' | 'audit';

/** Console pages in menu order. */
export const ROOT_SUB_TAB_IDS: readonly RootSubTab[] = ['status', 'receipt', 'features', 'devices', 'data', 'audit'];

export interface RootAccess {
  isRoot: boolean;
  /** hasPermission('audit_log.view'): root by default, never delegated */
  canViewAudit: boolean;
}

/** Pages the current user may open: none for anyone but root. */
export function getAllowedRootSubTabs({ isRoot, canViewAudit }: RootAccess): RootSubTab[] {
  if (!isRoot) return [];
  return ROOT_SUB_TAB_IDS.filter((id) => id !== 'audit' || canViewAudit);
}

export function canAccessRootConsole(access: RootAccess): boolean {
  return getAllowedRootSubTabs(access).length > 0;
}

/** The requested page when allowed, otherwise the first allowed one (null when the console is closed to this user). */
export function resolveRootSubTab(requested: RootSubTab, allowed: readonly RootSubTab[]): RootSubTab | null {
  if (allowed.includes(requested)) return requested;
  return allowed.length > 0 ? allowed[0] : null;
}
