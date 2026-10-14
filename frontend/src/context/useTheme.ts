import { useContext } from 'react';
import { ThemeContext } from './themeContextBase';
import type { ThemeContextType } from './themeContextBase';

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
