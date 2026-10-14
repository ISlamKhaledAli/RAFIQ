import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { ThemeContext } from './themeContextBase';
import type { ThemeMode, ThemeContextType } from './themeContextBase';

export type { ThemeMode, ThemeContextType };

const THEME_STORAGE_KEY = 'rafiq_theme_mode';

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return getSystemPrefersDark();
}

function applyThemeToDom(isDark: boolean, mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    root.style.backgroundColor = '#0C110F';
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
    root.style.backgroundColor = '#F3F5F2';
  }

  // Dispatch custom event for non-react modules or bridge
  try {
    window.dispatchEvent(new CustomEvent('rafiq_theme_changed', { detail: { theme: mode, isDark } }));
  } catch {
    // Ignore in legacy environments
  }
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'light';
  });

  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemPrefersDark());

  // Listen to OS system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };

    if (mql.addEventListener) {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    } else if ((mql as any).addListener) {
      (mql as any).addListener(handleChange);
      return () => (mql as any).removeListener(handleChange);
    }
  }, []);

  const isDark = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return systemDark;
  }, [theme, systemDark]);

  useEffect(() => {
    applyThemeToDom(isDark, theme);
  }, [isDark, theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const currentResolved = resolveIsDark(prev);
      const next: ThemeMode = currentResolved ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    isDark,
    setTheme,
    toggleTheme,
  }), [theme, isDark, setTheme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
