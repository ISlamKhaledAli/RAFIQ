import type { SettingsSubTab } from '../views/SettingsView';

interface SettingsAccess {
  isRoot: boolean;
  isAdmin: boolean;
  hasPermission: (permKey: string) => boolean;
}

/**
 * Settings sub-screens visible to the current user, in menu order. Mirrors the server allowlists
 * (settings.store / settings.printer / settings.backup / settings.features); root-only screens stay root-only.
 */
export function getAllowedSettingsSubTabs({ isRoot, isAdmin, hasPermission }: SettingsAccess): SettingsSubTab[] {
  const can = (perm: string) => isRoot || isAdmin || hasPermission(perm);
  const tabs: SettingsSubTab[] = [];
  if (can('settings.store')) tabs.push('profile');
  // Sale/stock policies are admin-only on the server (allow-lists + pharma:saveControlledMandatoryFields), so the screen is too
  if (isRoot || isAdmin) tabs.push('policies');
  if (isRoot || hasPermission('settings.features')) tabs.push('features');
  if (can('settings.printer')) tabs.push('printer');
  if (isRoot) tabs.push('scanner', 'security');
  if (can('settings.backup')) tabs.push('backup');
  if (isRoot) tabs.push('system', 'demo');
  return tabs;
}
