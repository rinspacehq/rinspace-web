export type ThemePreference = 'system' | 'light' | 'dark';
export const themeStorageKey = 'rinspace-theme-v2';
let sessionPreference: ThemePreference | undefined;

export function readThemePreference(): ThemePreference {
  if (sessionPreference) return sessionPreference;
  try {
    const stored = localStorage.getItem(themeStorageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    const legacy = localStorage.getItem('rinspace-inner-color-scheme');
    if (legacy === 'light' || legacy === 'dark') {
      writeThemePreference(legacy);
      return legacy;
    }
  } catch { /* Restricted storage still permits a session-only theme. */ }
  return 'system';
}

export function writeThemePreference(value: ThemePreference) {
  try {
    localStorage.setItem(themeStorageKey, value);
    sessionPreference = undefined;
  } catch { sessionPreference = value; }
}

export function subscribeThemePreference(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== themeStorageKey) return;
    sessionPreference = undefined;
    listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', listener);
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', listener);
    window.removeEventListener('focus', listener);
  };
}
