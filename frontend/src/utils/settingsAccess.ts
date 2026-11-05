import type { SettingsSubTab } from '../views/SettingsView';

interface SettingsAccess {
  isRoot: boolean;
  isAdmin: boolean;
  hasPermission: (permKey: string) => boolean;
}

/**
 * Settings sub-screens visible to the current user, in menu order. Mirrors the server allowlists
 * (settings.store / settings.printer / settings.backup). Everything reserved for root (features, scanner, PIN,
 * diagnostics, demo data, receipt signature) lives in the root console, see utils/rootAccess.ts.
 */
export function getAllowedSettingsSubTabs({ isRoot, isAdmin, hasPermission }: SettingsAccess): SettingsSubTab[] {
  const can = (perm: string) => isRoot || isAdmin || hasPermission(perm);
  const tabs: SettingsSubTab[] = [];
  if (can('settings.store')) tabs.push('profile');
  // Sale/stock policies are admin-only on the server (allow-lists + pharma:saveControlledMandatoryFields), so the screen is too
  if (isRoot || isAdmin) tabs.push('policies');
  if (can('settings.printer')) tabs.push('printer');
  if (can('settings.backup')) tabs.push('backup');
  return tabs;
}

/** The requested screen when allowed; a stale or foreign request (e.g. a root-only tab id kept in state) lands on the first allowed one. */
export function resolveSettingsSubTab(requested: string, allowed: readonly SettingsSubTab[]): SettingsSubTab {
  return (allowed as readonly string[]).includes(requested) ? (requested as SettingsSubTab) : (allowed[0] ?? 'profile');
}
