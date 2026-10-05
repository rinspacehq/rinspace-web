import { expect, test } from '@playwright/test';

import baseline from '../../contracts/routes-baseline.json';
const retiredPaths = new Set(['/review', '/space']);
const activeRoutes = baseline.routes.filter((route) => !retiredPaths.has(route.path));
const values: Record<string, string> = { postId: '254', titleSlug: 'fixture-title', slug: 'fixture', orderNo: 'fixture', tagId: '1', tagSlug: 'fixture', tagName: 'fixture', tagTitle: 'fixture', sectionId: '1', authorId: '1', username: 'fixture', questionId: '1' };
function concretePath(pattern: string) { if (pattern === '*') return '/__rinspace_not_found__'; return pattern.replace(/:([A-Za-z]+)/g, (_, key: string) => values[key] || 'fixture'); }

test('all 85 active declarations resolve in baseline order for anonymous users', async ({ page }) => {
  test.setTimeout(240_000);
  expect(baseline.routes).toHaveLength(87);
  expect(activeRoutes).toHaveLength(85);
  for (const route of activeRoutes) {
    const target = concretePath(route.path);
    const probe = await page.request.get(target);
    expect(probe.status(), `route ${route.order} ${route.path}`).toBe(200);
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      // Canonicalization effects can replace an in-flight document navigation. The independent
      // HTTP probe above owns status validation; only tolerate Chromium's explicit abort signal.
      const canonicalNavigationAbort = error instanceof Error
        && (error.message.includes('ERR_ABORTED')
          || error.message.includes('interrupted by another navigation'));
      if (!canonicalNavigationAbort) throw error;
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
    await expect(page.locator('#root > *').first(), `route ${route.order} ${route.path}`).toBeAttached();
    await expect(page.locator('body')).not.toContainText('No routes matched location');
  }
});
