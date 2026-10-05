import { expect, test } from '@playwright/test';

import { identitySessionMock } from './identity-session-mock';

test('Markdown editor keeps the explicit creation path for an exact same-name tag', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'markdown-author-1' }));
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({
        json: identitySessionMock('markdown-author-1', 'markdown-author'),
      });
      return;
    }
    if (pathname === '/api/question/tags') {
      await route.fulfill({
        json: {
          items: [{
            tag_id: '8',
            slug: 'sheaf',
            name: 'sheaf',
            displayName: 'Sheaf',
            postCount: 3,
            parent_tags: [{ tag_id: '2', slug_name: 'geometry', display_name: 'Geometry' }],
            usage_excerpt: 'Algebraic geometry',
          }],
        },
      });
      return;
    }
    if (pathname === '/api/v2/tags/candidates') {
      await route.fulfill({
        json: {
          items: [{
            id: 8,
            displayName: 'Sheaf',
            normalizedName: 'sheaf',
            usageScope: 'Algebraic geometry',
            parentTagIds: [2],
            lifecycleState: 'active',
            reviewState: 'reviewed',
            repositoryState: 'active',
            repositoryId: 18,
            version: 3,
          }],
        },
      });
      return;
    }
    if (pathname === '/api/notifications') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto('/write/markdown', { waitUntil: 'domcontentloaded' });

  const tagInput = page.getByRole('textbox', { name: '标签', exact: true });
  await expect(tagInput).toBeEnabled({ timeout: 20_000 });
  await tagInput.fill('Sheaf');

  await expect(page.getByText('Sheaf', { exact: true })).toBeVisible();
  const createSameName = page.getByRole('button', { name: '新标签：Sheaf' });
  await expect(createSameName).toBeVisible();
  await createSameName.click();

  const dialog = page.getByRole('dialog', { name: '创建标签' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('名称')).toHaveValue('Sheaf');
  await expect(dialog.getByRole('region', { name: '同名标签' })).toContainText('ID 8');
  await expect(dialog.getByRole('region', { name: '同名标签' })).toContainText('Algebraic geometry');
});
