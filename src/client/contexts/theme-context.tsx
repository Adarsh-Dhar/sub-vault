
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('app-theme') as Theme | null;
    if (stored) {
      setThemeState(stored);
    }
    setMounted(true);
  }, []);

  // Update effective theme based on current theme and system preference
  useEffect(() => {
    if (!mounted) return;

    let currentTheme = theme;

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      currentTheme = prefersDark ? 'dark' : 'light';
    }

    setEffectiveTheme(currentTheme as 'light' | 'dark');

    // Update document class for Tailwind dark mode
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  const toggleTheme = () => {
    setTheme(effectiveTheme === 'light' ? 'dark' : 'light');
  };

  // Prevent hydration mismatch by only rendering after mount
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Return a default context during SSR to prevent errors during build
    return {
      theme: 'light' as const,
      effectiveTheme: 'light' as const,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}
