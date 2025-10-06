'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeId =
  | 'neon-dark'
  | 'aurora-dark'
  | 'midnight-dark'
  | 'ember-dark'
  | 'cobalt-dark'
  | 'glacier-light'
  | 'solar-light'
  | 'crystal-light'
  | 'meadow-light';

export type ThemeOption = {
  id: ThemeId;
  label: string;
  description: string;
  isDark: boolean;
  preview: string;
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'neon-dark',
    label: 'Neon Dark',
    description: 'Cyan + violet glow accents',
    isDark: true,
    preview: 'linear-gradient(135deg, #00E5FF 0%, #6BFFB8 50%, #A78BFA 100%)',
  },
  {
    id: 'aurora-dark',
    label: 'Aurora Dark',
    description: 'Emerald gradients with violet highlights',
    isDark: true,
    preview: 'linear-gradient(135deg, #09FBD3 0%, #7CFF9A 50%, #8F7BFF 100%)',
  },
  {
    id: 'midnight-dark',
    label: 'Midnight Dark',
    description: 'Deep indigo with ice-blue accents',
    isDark: true,
    preview: 'linear-gradient(135deg, #0A0F29 0%, #1C2C5B 50%, #5AB7FF 100%)',
  },
  {
    id: 'ember-dark',
    label: 'Ember Dark',
    description: 'Charcoal base with ember highlights',
    isDark: true,
    preview: 'linear-gradient(135deg, #1A0B0B 0%, #331010 45%, #FF5E3A 100%)',
  },
  {
    id: 'cobalt-dark',
    label: 'Cobalt Dark',
    description: 'Electric blues with teal sparks',
    isDark: true,
    preview: 'linear-gradient(135deg, #061B2F 0%, #0B3A53 50%, #00F6FF 100%)',
  },
  {
    id: 'glacier-light',
    label: 'Glacier Light',
    description: 'Cool blues with frosted panels',
    isDark: false,
    preview: 'linear-gradient(135deg, #1D9BF0 0%, #7CD8FF 50%, #6C89FF 100%)',
  },
  {
    id: 'solar-light',
    label: 'Solar Light',
    description: 'Warm amber with ivory surfaces',
    isDark: false,
    preview: 'linear-gradient(135deg, #FF9F1C 0%, #FFD166 50%, #FF6F59 100%)',
  },
  {
    id: 'crystal-light',
    label: 'Crystal Light',
    description: 'Prismatic lilac with silver edges',
    isDark: false,
    preview: 'linear-gradient(135deg, #E8E4FF 0%, #CBC7FF 45%, #A88CFF 100%)',
  },
  {
    id: 'meadow-light',
    label: 'Meadow Light',
    description: 'Soft greens with sunlit highlights',
    isDark: false,
    preview: 'linear-gradient(135deg, #E0F9E5 0%, #B3F7C2 45%, #6BDFA6 100%)',
  },
];

const DEFAULT_THEME: ThemeId = 'neon-dark';

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  options: ThemeOption[];
};

const ThemeCtx = createContext<ThemeContextValue>({ theme: DEFAULT_THEME, setTheme: () => {}, options: THEME_OPTIONS });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  const resolvedTheme = useMemo(() => THEME_OPTIONS.find((item) => item.id === theme) ?? THEME_OPTIONS[0], [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('theme') as ThemeId | null;
    if (stored && THEME_OPTIONS.some((item) => item.id === stored)) {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme.id;
    root.classList.toggle('dark', resolvedTheme.isDark);
    root.classList.toggle('light', !resolvedTheme.isDark);
    root.style.colorScheme = resolvedTheme.isDark ? 'dark' : 'light';

    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', resolvedTheme.id);
    }
  }, [resolvedTheme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ theme: resolvedTheme.id, setTheme, options: THEME_OPTIONS }),
    [resolvedTheme.id, setTheme],
  );

  return <ThemeCtx.Provider value={contextValue}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
