// Pure header rules (no runtime imports) so they can be unit-tested under node strip-types.
// The server stays authoritative; these rules only decide what the top bar shows per role.
import { getRoleKind, type RoleKind, type RoleSubject } from './roleLabels.ts';
import type { SystemNotificationItem } from './useSystemNotifications.ts';

export interface HeaderAccessInput {
  user: RoleSubject | null | undefined;
  canOpenShiftPanel: boolean;
  canManageUsers: boolean;
  canViewProducts: boolean;
  /** hasPermission('system.updates'): owner/root always, a manager only when granted. */
  canUpdateApp: boolean;
}

export interface HeaderVisibility {
  kind: RoleKind;
  /** Update check/badge: updates:check needs system.updates, an owner-grade key (owner/root always, manager by grant). */
  showUpdates: boolean;
  showShift: boolean;
  showEmployees: boolean;
  showReadiness: boolean;
}

export function getHeaderVisibility(input: HeaderAccessInput): HeaderVisibility {
  const kind = getRoleKind(input.user);
  const isAdminTier = kind === 'root' || kind === 'owner' || kind === 'manager';
  return {
    kind,
    showUpdates: isAdminTier && input.canUpdateApp,
    showShift: input.canOpenShiftPanel,
    showEmployees: isAdminTier || input.canManageUsers,
    showReadiness: kind === 'root',
  };
}

/** Header avatar tint by role (tokens only). */
export function getRoleAvatarClasses(kind: RoleKind): string {
  switch (kind) {
    case 'root':
      return 'bg-danger-soft text-danger border border-danger/30 dark:bg-danger-dark-soft dark:text-danger-bright dark:border-danger-bright/30';
    case 'owner':
      return 'bg-warn-soft text-warn border border-warn/30 dark:bg-warn-dark-soft dark:text-warn-bright dark:border-warn-bright/30';
    case 'manager':
      return 'bg-brand-soft text-brand border border-brand/30 dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/30';
    default:
      return 'bg-surface-2 text-ink border border-line dark:bg-surface-dark-3 dark:text-ink-dark dark:border-line-dark';
  }
}

export interface NotificationAudience {
  kind: RoleKind;
  canViewProducts: boolean;
  /** hasPermission('system.updates') */
  canUpdateApp: boolean;
  /** hasPermission('settings.license') */
  canManageLicense: boolean;
}

const WITHOUT_ACTION = (item: SystemNotificationItem): SystemNotificationItem => {
  const copy = { ...item };
  delete copy.actionLabel;
  delete copy.onAction;
  return copy;
};

/**
 * Role-appropriate notifications: a cashier only sees what affects selling (clock, read-only,
 * expiry, stock) and never an action button they cannot use; owner/manager see everything.
 * License renewal actions need settings.license and the update alert needs system.updates (owner-grade keys).
 */
export function filterNotificationsForAudience(
  items: SystemNotificationItem[],
  audience: NotificationAudience,
): SystemNotificationItem[] {
  const { kind } = audience;
  const isAdminTier = kind === 'owner' || kind === 'root' || kind === 'manager';
  const mayManageLicense = isAdminTier && audience.canManageLicense;
  const out: SystemNotificationItem[] = [];

  for (const item of items) {
    switch (item.id) {
      case 'clock_tampering':
        out.push(item);
        break;
      case 'license_readonly':
      case 'license_expiry_warning':
        out.push(mayManageLicense ? item : WITHOUT_ACTION(item));
        break;
      case 'license_trial':
        if (isAdminTier) out.push(mayManageLicense ? item : WITHOUT_ACTION(item));
        break;
      case 'app_update_available':
        if (isAdminTier && audience.canUpdateApp) out.push(item);
        break;
      case 'backup_overdue':
      case 'demo_data_active':
        if (isAdminTier) out.push(item);
        break;
      case 'low_stock':
        if (audience.canViewProducts) out.push(item);
        break;
      default:
        out.push(isAdminTier ? item : WITHOUT_ACTION(item));
    }
  }
  return out;
}
