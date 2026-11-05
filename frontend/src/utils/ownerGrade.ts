// Owner-grade privileges: on by default for the owner/root, off for a manager until the owner grants each one.
// Mirrors SecurityService.DELEGABLE_OWNER_PERMISSIONS; the server stays authoritative.

export const OWNER_GRADE_KEYS = ['system.updates', 'settings.restore', 'settings.license'] as const;

export type OwnerGradeKey = (typeof OWNER_GRADE_KEYS)[number];

/** Short chip text shown on a manager row for each granted key. */
export const OWNER_GRADE_CHIP_LABELS: Record<OwnerGradeKey, string> = {
  'system.updates': 'تحديث البرنامج',
  'settings.restore': 'استعادة النسخ',
  'settings.license': 'الترخيص',
};

export function isOwnerGradeKey(key: string): key is OwnerGradeKey {
  return (OWNER_GRADE_KEYS as readonly string[]).includes(key);
}

/** Owner-grade keys currently granted in a permission map, in catalogue order. */
export function getGrantedOwnerGradeKeys(permissions: Record<string, boolean> | null | undefined): OwnerGradeKey[] {
  if (!permissions) return [];
  return OWNER_GRADE_KEYS.filter((key) => permissions[key] === true);
}

/** users:updatePermissions payload for a manager: every owner-grade key explicit, nothing else. */
export function buildOwnerGradePayload(selected: Record<string, boolean>): Record<OwnerGradeKey, boolean> {
  return {
    'system.updates': selected['system.updates'] === true,
    'settings.restore': selected['settings.restore'] === true,
    'settings.license': selected['settings.license'] === true,
  };
}
