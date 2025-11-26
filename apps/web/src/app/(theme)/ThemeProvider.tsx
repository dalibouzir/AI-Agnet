'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemePaletteId = 'light-a' | 'light-b' | 'light-c' | 'dark-a' | 'dark-b' | 'dark-c';

export type ThemePalette = {
  id: ThemePaletteId;
  mode: ThemeMode;
  label: string;
  description: string;
  swatches: [string, string, string];
};

type ThemePreferences = {
  mode: ThemeMode;
  palette: ThemePaletteId;
  lightPalette: ThemePaletteId;
  darkPalette: ThemePaletteId;
};

type ThemeContextValue = {
  mode: ThemeMode;
  palette: ThemePaletteId;
  palettes: ThemePalette[];
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePaletteId) => void;
};

const THEME_PALETTES: ThemePalette[] = [
  {
    id: 'light-a',
    mode: 'light',
    label: 'Light · Blue / Red',
    description: 'Blue primary with red accent over white surfaces.',
    swatches: ['#0D6EFD', '#E63946', '#FFFFFF'],
  },
  {
    id: 'light-b',
    mode: 'light',
    label: 'Light · Indigo / Coral',
    description: 'Indigo primary, coral accent, mist neutral.',
    swatches: ['#4F46E5', '#FF6B6B', '#F7F7FB'],
  },
  {
    id: 'light-c',
    mode: 'light',
    label: 'Light · Teal / Vermilion',
    description: 'Teal primary with vermilion accent on porcelain base.',
    swatches: ['#0EA5A4', '#E64A19', '#FAFAFC'],
  },
  {
    id: 'dark-a',
    mode: 'dark',
    label: 'Dark · Cyan / Soft Red',
    description: 'Cyan primary and soft red accent over deep navy.',
    swatches: ['#00BFFF', '#FF4D4D', '#0A0F1C'],
  },
  {
    id: 'dark-b',
    mode: 'dark',
    label: 'Dark · Violet / Rose',
    description: 'Violet primary with rose accent on charcoal.',
    swatches: ['#7C3AED', '#FB7185', '#0B1220'],
  },
  {
    id: 'dark-c',
    mode: 'dark',
    label: 'Dark · Electric / Magenta',
    description: 'Electric blue primary with magenta accent on obsidian.',
    swatches: ['#3B82F6', '#F472B6', '#0C1324'],
  },
];

const DEFAULT_LIGHT: ThemePaletteId = 'light-a';
const DEFAULT_DARK: ThemePaletteId = 'dark-a';

const ThemeCtx = createContext<ThemeContextValue>({
  mode: 'dark',
  palette: DEFAULT_DARK,
  palettes: THEME_PALETTES,
  setMode: () => {},
  setPalette: () => {},
});

const STORAGE_KEY = 'theme-preferences';

const getInitialPreferences = (): ThemePreferences => {
  if (typeof window === 'undefined') {
    return { mode: 'dark', palette: DEFAULT_DARK, lightPalette: DEFAULT_LIGHT, darkPalette: DEFAULT_DARK };
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ThemePreferences>;
      const hasPalette = typeof parsed.palette === 'string' && THEME_PALETTES.some((item) => item.id === parsed.palette);
      const hasMode = parsed.mode === 'light' || parsed.mode === 'dark';
      const lightPalette =
        typeof parsed.lightPalette === 'string' && THEME_PALETTES.some((item) => item.id === parsed.lightPalette)
          ? (parsed.lightPalette as ThemePaletteId)
          : DEFAULT_LIGHT;
      const darkPalette =
        typeof parsed.darkPalette === 'string' && THEME_PALETTES.some((item) => item.id === parsed.darkPalette)
          ? (parsed.darkPalette as ThemePaletteId)
          : DEFAULT_DARK;

      if (hasPalette && hasMode) {
        return {
          mode: parsed.mode as ThemeMode,
          palette: parsed.palette as ThemePaletteId,
          lightPalette,
          darkPalette,
        };
      }
    }
  } catch (error) {
    console.warn('Failed to parse saved theme preferences.', error);
  }

  const prefersDark =
    typeof window !== 'undefined'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;

  return {
    mode: prefersDark ? 'dark' : 'light',
    palette: prefersDark ? DEFAULT_DARK : DEFAULT_LIGHT,
    lightPalette: DEFAULT_LIGHT,
    darkPalette: DEFAULT_DARK,
  };
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<ThemePreferences>(() => getInitialPreferences());

  const setMode = useCallback((mode: ThemeMode) => {
    setPreferences((current) => {
      if (current.mode === mode) return current;
      const palette = mode === 'light' ? current.lightPalette : current.darkPalette;
      return { ...current, mode, palette };
    });
  }, []);

  const setPalette = useCallback((palette: ThemePaletteId) => {
    const paletteDefinition = THEME_PALETTES.find((item) => item.id === palette);
    if (!paletteDefinition) return;
    setPreferences((current) => {
      const nextMode = paletteDefinition.mode;
      return {
        mode: nextMode,
        palette,
        lightPalette: nextMode === 'light' ? palette : current.lightPalette,
        darkPalette: nextMode === 'dark' ? palette : current.darkPalette,
      };
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.mode;
    root.dataset.palette = preferences.palette;
    root.style.colorScheme = preferences.mode;
  }, [preferences.mode, preferences.palette]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode: preferences.mode,
      palette: preferences.palette,
      palettes: THEME_PALETTES,
      setMode,
      setPalette,
    }),
    [preferences.mode, preferences.palette, setMode, setPalette],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
