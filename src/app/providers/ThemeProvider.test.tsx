import { AnimateButton } from 'components/ui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from './ThemeProvider';

function ThemeFixture() { const theme = useTheme(); return <AnimateButton unstyled onClick={() => theme.setPreference(theme.preference === 'dark' ? 'light' : 'dark')}>{theme.preference}:{theme.resolved}</AnimateButton>; }

describe('ThemeProvider', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('persists a versioned preference and applies it to the root', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<ThemeProvider><ThemeFixture /></ThemeProvider>);
    await user.click(screen.getByRole('button'));
    expect(window.localStorage.getItem('rinspace-theme-v2')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('reacts to system preference changes in system mode', () => {
    window.localStorage.setItem('rinspace-theme-v2', 'system');
    act(() => render(<ThemeProvider><ThemeFixture /></ThemeProvider>));
    expect(screen.getByRole('button').textContent).toContain('system:light');
  });

  it('migrates the legacy inner preference without overriding a shared selection', () => {
    localStorage.setItem('rinspace-inner-color-scheme', 'dark');
    const first = render(<ThemeProvider><ThemeFixture /></ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('rinspace-theme-v2')).toBe('dark');
    first.unmount();
    localStorage.setItem('rinspace-theme-v2', 'system');
    render(<ThemeProvider><ThemeFixture /></ThemeProvider>);
    expect(screen.getByRole('button').textContent).toContain('system:light');
  });

  it('refreshes on other tabs, focus and back-forward cache restore', () => {
    render(<ThemeProvider><ThemeFixture /></ThemeProvider>);
    for (const event of [new StorageEvent('storage', { key: 'rinspace-theme-v2' }), new Event('focus'), new Event('pageshow')]) {
      localStorage.setItem('rinspace-theme-v2', 'dark');
      act(() => window.dispatchEvent(event));
      expect(document.documentElement.dataset.theme).toBe('dark');
      localStorage.setItem('rinspace-theme-v2', 'light');
      act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'rinspace-theme-v2' })));
      expect(document.documentElement.dataset.theme).toBe('light');
    }
  });

  it('tracks OS changes only while following system', async () => {
    let dark = false;
    const events = new EventTarget();
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      media: query, get matches() { return dark; }, onchange: null,
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: events.dispatchEvent.bind(events),
    }));
    render(<ThemeProvider><ThemeFixture /></ThemeProvider>);
    dark = true;
    act(() => events.dispatchEvent(new Event('change')));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button'));
    dark = false;
    act(() => events.dispatchEvent(new Event('change')));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('can change theme even when browser storage writes are blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    render(<ThemeProvider><ThemeFixture /></ThemeProvider>);
    await userEvent.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => window.dispatchEvent(new Event('focus')));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
