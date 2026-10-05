import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => {
        const media = nativeMatchMedia(query);
        return {
          get matches() { return media.matches; },
          media: media.media,
          onchange: media.onchange,
          addListener: (listener: (event: MediaQueryListEvent) => void) => {
            media.addEventListener('change', listener);
          },
          removeListener: (listener: (event: MediaQueryListEvent) => void) => {
            media.removeEventListener('change', listener);
          },
          dispatchEvent: media.dispatchEvent.bind(media),
        };
      },
    });
  });
});

test('loads the mobile homepage with the legacy MediaQueryList listener API', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

  expect(response?.ok()).toBe(true);
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.getByText('页面暂时无法显示')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('keeps an adjacent public route available with the legacy API', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto('/tags', { waitUntil: 'domcontentloaded' });

  expect(response?.ok()).toBe(true);
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.getByText('页面暂时无法显示')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
