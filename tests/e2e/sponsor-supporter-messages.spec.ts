import { expect, test } from '@playwright/test';

const paidAt = '2026-09-21T08:30:00.000Z';

test('sponsor sidebar shows a supporter message on its second line without blank placeholders', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');

    if (pathname === '/api/sponsor/supporters') {
      await route.fulfill({
        json: {
          items: [
            {
              orderNo: 'SPONSOR-WITH-MESSAGE',
              uid: 'supporter-1',
              userId: 'ningning',
              nickname: '宁宁',
              avatarUrl: '',
              rank: 2,
              amountFen: 2000,
              amount: '20 元',
              amountText: '20 元',
              message: '愿 Rinspace 越来越好',
              paidAt,
            },
            {
              orderNo: 'SPONSOR-WITHOUT-MESSAGE',
              uid: 'supporter-2',
              userId: 'elysium',
              nickname: 'Elysium',
              avatarUrl: '',
              rank: 0,
              amountFen: 1000,
              amount: '10 元',
              amountText: '10 元',
              message: '   ',
              paidAt,
            },
          ],
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });

  await page.goto('/sponsor', { waitUntil: 'domcontentloaded' });

  const sidebar = page.locator('.sponsor-side .sponsor-supporter-list');
  await expect(sidebar).toBeVisible({ timeout: 20_000 });

  const rows = sidebar.locator('.sponsor-supporter-row');
  await expect(rows).toHaveCount(2);

  const firstRow = rows.nth(0);
  const firstIdentity = firstRow.locator('.avatar-name');
  const message = firstRow.locator('.sponsor-supporter-message');
  await expect(message).toHaveText('愿 Rinspace 越来越好');
  await expect(message).toHaveCSS('-webkit-line-clamp', '1');

  const identityBox = await firstIdentity.boundingBox();
  const messageBox = await message.boundingBox();
  expect(identityBox).not.toBeNull();
  expect(messageBox).not.toBeNull();
  expect(messageBox!.y).toBeGreaterThanOrEqual(identityBox!.y + identityBox!.height);

  await expect(rows.nth(1).locator('.sponsor-supporter-message')).toHaveCount(0);
});
