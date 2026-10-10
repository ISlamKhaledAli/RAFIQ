import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, type UserDto, type LoginResult } from '../bridge/ipc';
import { AuthContext } from './authContextDef';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number>(15);
  const lastActivityRef = useRef<number>(0);

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await invoke<UserDto | null>('auth:getCurrentUser');
      setCurrentUser(user || null);
    } catch {
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    try {
      const res = await invoke<LoginResult>('auth:login', {
        username: username.trim(),
        password: secret,
        pin: secret,
      });

      if (res && res.success && res.user) {
        setCurrentUser(res.user);
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
  }, []);

  const logout = useCallback(async () => {
    try {
      await invoke('auth:logout');
    } catch {
    } finally {
      setCurrentUser(null);
    }
  }, []);

  const hasPermission = useCallback((permKey: string): boolean => {
    if (!permKey) return true;
    if (!currentUser) return false;
    if (currentUser.role === 'root') return true;
    if (currentUser.permissions && currentUser.permissions[permKey] !== undefined) {
      return currentUser.permissions[permKey] === true;
    }
    // Fallback for legacy roles
    if (currentUser.role === 'admin') return true;
    return false;
  }, [currentUser]);

  // Idle timeout auto-lock
  useEffect(() => {
    if (!currentUser || idleTimeoutMinutes <= 0) return;

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
  }, [currentUser, idleTimeoutMinutes, logout]);

  const isRoot = currentUser?.role === 'root';
  const isAdmin = isRoot || currentUser?.role === 'admin';

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
