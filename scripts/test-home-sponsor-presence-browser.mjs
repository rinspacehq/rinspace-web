#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.RINSPACE_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const chromiumPath = process.env.CHROMIUM_BIN;
const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%232b577a"/%3E%3C/svg%3E';
let supporterRequests = 0;

const supporter = (orderNo, userId, nickname, avatarUrl = '') => ({
  orderNo,
  uid: `${userId}-uid`,
  userId,
  nickname,
  avatarUrl,
  rank: 0,
  amountFen: 100,
  amount: '1 元',
  amountText: '1 元',
  message: '',
  paidAt: '2026-09-21T08:00:00Z',
});

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/sponsor/supporters')) {
      supporterRequests += 1;
      return route.fulfill({ json: {
        items: [
          supporter('sponsor-1', 'alice', 'Alice', avatar),
          supporter('sponsor-2', 'alice', 'Alice', avatar),
          supporter('sponsor-3', 'bob', '小波'),
        ],
      } });
    }
    if (url.pathname.endsWith('/api/identity/v1/session')) {
      return route.fulfill({ status: 401, json: { status: 'anonymous' } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const group = page.locator('.rin-user-presence-avatar-group');
  await group.waitFor();
  assert.match(await group.getAttribute('aria-label'), /^(赞助人|Supporters)$/);
  assert.equal(supporterRequests, 1);
  assert.equal(await group.getByRole('link').count(), 2);
  assert.equal(await group.getByRole('link', { name: 'Alice' }).getAttribute('href'), '/@alice');
  assert.equal(await group.getByRole('link', { name: '小波' }).getAttribute('href'), '/@bob');
  assert.match(await group.locator('img').getAttribute('src'), /^data:image\/svg\+xml/);

  const headingBox = await page.locator('.sponsor-rail-heading-link').boundingBox();
  const groupBox = await group.boundingBox();
  assert.ok(headingBox && groupBox && groupBox.y >= headingBox.y + headingBox.height);

  await group.getByRole('link', { name: 'Alice' }).hover();
  const tooltip = page.getByRole('tooltip');
  await tooltip.waitFor();
  assert.equal((await tooltip.textContent())?.trim(), 'Alice');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  assert.notEqual(
    await group.locator('.rin-user-presence-avatar').first().evaluate((element) => getComputedStyle(element).borderColor),
    'rgba(0, 0, 0, 0)',
  );

  await group.getByRole('link', { name: '小波' }).click();
  await page.waitForURL('**/@bob');
  console.log('Home sponsor presence browser acceptance passed.');
} finally {
  await browser.close();
}
