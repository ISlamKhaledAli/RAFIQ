import { useAuth } from '../context/useAuth';

/**
 * Hook to check if current logged-in user possesses a specific permission.
 * Always returns true for Root users.
 */
export function usePermission(permKey: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permKey);
}

/**
 * Hook returning batch permission checker and role status.
 */
export function usePermissions() {
  const { hasPermission, isRoot, isAdmin, currentUser } = useAuth();
  return {
    hasPermission,
    isRoot,
    isAdmin,
    currentUser,
  };
}
