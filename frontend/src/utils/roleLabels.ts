// Pure role helpers (no runtime imports) so they can be unit-tested under node strip-types.
// Hierarchy: root (3) > owner (2) > manager (1) > cashier (0). The server stays authoritative.

export interface RoleSubject {
  role?: string | null;
  isOwner?: boolean | null;
  username?: string | null;
}

export type RoleKind = 'root' | 'owner' | 'manager' | 'cashier';

export const ROLE_LABEL_ROOT = 'المطور (Root)';
export const ROLE_LABEL_OWNER = 'المالك';
export const ROLE_LABEL_MANAGER = 'مدير';
export const ROLE_LABEL_CASHIER = 'كاشير';

export function getRoleKind(user: RoleSubject | null | undefined): RoleKind {
  if (user && (user.role === 'root' || user.username === 'root')) return 'root';
  if (user && user.isOwner === true) return 'owner';
  if (user && user.role === 'admin') return 'manager';
  return 'cashier';
}

export function getRoleLabel(user: RoleSubject | null | undefined): string {
  switch (getRoleKind(user)) {
    case 'root':
      return ROLE_LABEL_ROOT;
    case 'owner':
      return ROLE_LABEL_OWNER;
    case 'manager':
      return ROLE_LABEL_MANAGER;
    default:
      return ROLE_LABEL_CASHIER;
  }
}

const TIER_BY_KIND: Record<RoleKind, number> = { root: 3, owner: 2, manager: 1, cashier: 0 };

export function getTier(user: RoleSubject | null | undefined): number {
  return TIER_BY_KIND[getRoleKind(user)];
}

/** A caller manages a target only when strictly above it in the hierarchy. */
export function canManageUser(me: RoleSubject | null | undefined, target: RoleSubject | null | undefined): boolean {
  if (!me || !target) return false;
  return getTier(me) > getTier(target);
}

/** Owner or root: the only sessions allowed to run owner-level operations. */
export function isOwnerOrRoot(user: RoleSubject | null | undefined): boolean {
  const kind = getRoleKind(user);
  return kind === 'owner' || kind === 'root';
}

/** Tailwind token classes for the role badge (tokens only). */
export function getRoleBadgeClasses(user: RoleSubject | null | undefined): string {
  switch (getRoleKind(user)) {
    case 'root':
      return 'bg-brand text-white';
    case 'owner':
      return 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/30 dark:border-brand-bright/30';
    case 'manager':
      return 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border';
    default:
      return 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-muted-dark border border-line dark:border-line-dark';
  }
}

/** Tailwind token text classes for the employee name in the header (role shown by colour only). */
export function getRoleNameClasses(kind: RoleKind): string {
  switch (kind) {
    case 'root':
      return 'text-danger dark:text-danger-bright';
    case 'owner':
      return 'text-warn dark:text-warn-bright';
    case 'manager':
      return 'text-brand dark:text-brand-bright';
    default:
      return 'text-ink dark:text-ink-dark';
  }
}
