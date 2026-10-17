import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadDarkLegacyStyles } from 'app/config/familyStyles';
import { subscribeToMediaQuery } from '@/utils/mediaQuery';
import { readThemePreference, writeThemePreference, subscribeThemePreference, type ThemePreference } from '@/utils/themePreference';

export type { ThemePreference } from '@/utils/themePreference';
const ThemeContext = createContext<{ preference: ThemePreference; resolved: 'light' | 'dark'; setPreference(value: ThemePreference): void } | null>(null);

function systemTheme() { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function applyTheme(preference: ThemePreference) {
  const resolved = preference === 'system' ? systemTheme() : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b1218' : '#f8fafc');
  if (resolved === 'dark') void loadDarkLegacyStyles();
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>(readThemePreference);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => applyTheme(preference));
  const setPreference = useCallback((value: ThemePreference) => { writeThemePreference(value); updatePreference(value); }, []);
  useEffect(() => subscribeThemePreference(() => updatePreference(readThemePreference())), []);
  useEffect(() => {
    setResolved(applyTheme(preference));
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (preference === 'system') setResolved(applyTheme('system')); };
    return subscribeToMediaQuery(media, onChange);
  }, [preference]);
  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used inside ThemeProvider.'); return value; }
