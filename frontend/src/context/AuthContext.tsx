import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, type UserDto, type LoginResult } from '../bridge/ipc';
import { AuthContext } from './authContextDef';
import { reconcileUser } from '../utils/userSnapshot';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserDto | null>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('rafiq_user_session');
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number>(15);
  const lastActivityRef = useRef<number>(0);

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const userRef = useRef<UserDto | null>(currentUser);

  // Single write path: skips identical snapshots so no-op refreshes never re-render consumers.
  const commitUser = useCallback((next: UserDto | null) => {
    const reconciled = reconcileUser(userRef.current, next);
    if (reconciled === userRef.current) return;
    userRef.current = reconciled;
    setCurrentUser(reconciled);
    try {
      if (typeof window !== 'undefined') {
        if (reconciled) {
          localStorage.setItem('rafiq_user_session', JSON.stringify(reconciled));
        } else {
          localStorage.removeItem('rafiq_user_session');
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await invoke<UserDto | null>('auth:getCurrentUser');
      commitUser(user || null);
    } catch {
      // In case of transient IPC error, keep cached user to avoid unexpected kick-out
    } finally {
      setIsLoading(false);
    }
  }, [commitUser]);

  useEffect(() => {
    refreshUser();
    invoke<any>('security:getStatus')
      .then((status: any) => {
        if (status?.idleTimeoutMinutes && status.idleTimeoutMinutes > 0) {
          setIdleTimeoutMinutes(status.idleTimeoutMinutes);
        }
      })
      .catch(() => {});
  }, [refreshUser]);

  const login = useCallback(async (username: string, secret: string): Promise<LoginResult> => {
    // 1. Immediately wipe previous session data from memory & local storage to prevent session leakage
    commitUser(null);

    try {
      const res = await invoke<LoginResult>('auth:login', {
        username: username.trim(),
        usernameOrId: username.trim(),
        password: secret,
        pin: secret,
      });

      if (res && res.success && res.user) {
        commitUser(res.user);
        lastActivityRef.current = Date.now();
        return res;
      }
      return res || { success: false, message: 'بيانات الدخول غير صحيحة' };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'فشل تسجيل الدخول. يرجى التحقق من البيانات.',
      };
    }
  }, [commitUser]);

  const logout = useCallback(async () => {
    try {
      await invoke('auth:logout');
    } catch {
    } finally {
      commitUser(null);
    }
  }, [commitUser]);

  const hasPermission = useCallback((permKey: string): boolean => {
    if (!permKey) return true;
    if (!currentUser) return false;
    if (currentUser.role === 'root' || currentUser.username === 'root') {
      return true;
    }
    if (currentUser.permissions && currentUser.permissions[permKey] !== undefined) {
      return currentUser.permissions[permKey] === true;
    }
    // Admin role defaults to true for operational permissions unless explicitly revoked
    if (currentUser.role === 'admin' || currentUser.username === 'admin') {
      return true;
    }
    return false;
  }, [currentUser]);

  const hasSession = currentUser !== null;

  // Idle timeout auto-lock
  useEffect(() => {
    if (!hasSession || idleTimeoutMinutes <= 0) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', updateActivity, { passive: true });
    window.addEventListener('keydown', updateActivity, { passive: true });
    window.addEventListener('click', updateActivity, { passive: true });
    window.addEventListener('touchstart', updateActivity, { passive: true });

    const intervalId = setInterval(() => {
      const elapsedMinutes = (Date.now() - lastActivityRef.current) / (1000 * 60);
      if (elapsedMinutes >= idleTimeoutMinutes) {
        logout();
      }
    }, 15000);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      clearInterval(intervalId);
    };
  }, [hasSession, idleTimeoutMinutes, logout]);

  const isRoot = currentUser?.role === 'root';
  const isAdmin = isRoot || currentUser?.role === 'admin';
  const isOwner = currentUser?.isOwner === true;
  const isOwnerOrRoot = isRoot || isOwner;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        login,
        logout,
        hasPermission,
        refreshUser,
        isRoot,
        isAdmin,
        isOwner,
        isOwnerOrRoot,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

