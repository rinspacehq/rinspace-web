import fs from 'node:fs';

import { expect, test } from '@playwright/test';

type CoreKind = 'article' | 'book' | 'tweet' | 'tag';
type ReleaseProbe = { kind: CoreKind; path: string };
type ReleaseProbes = { schemaVersion: string; current: ReleaseProbe[] };

const probesFile = process.env.RINSPACE_RELEASE_PROBES || '';
const releaseOrigin = (process.env.RINSPACE_E2E_ORIGIN || '').replace(/\/$/, '');
const probes = probesFile ? JSON.parse(fs.readFileSync(probesFile, 'utf8')) as ReleaseProbes : undefined;

function normalized(value: string | null) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function semanticText(value: string | null) {
  return normalized(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

test('live raw and hydrated documents preserve four-entity identity and public version', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'desktop-light', 'One deterministic Chromium project covers the live equivalence contract.');
  test.skip(!releaseOrigin || !probesFile, 'RINSPACE_E2E_ORIGIN and RINSPACE_RELEASE_PROBES are required.');
  expect(probes?.schemaVersion).toBe('rinspace-seo-release-probes/v1');
  expect(new Set(probes?.current.map((probe) => probe.kind))).toEqual(new Set<CoreKind>(['article', 'book', 'tweet', 'tag']));

  for (const probe of probes?.current || []) {
    const rawContext = await browser.newContext({ javaScriptEnabled: false, locale: 'zh-CN' });
    const rawPage = await rawContext.newPage();
    await rawPage.goto(`${releaseOrigin}${probe.path}`, { waitUntil: 'domcontentloaded' });
    const rawMain = rawPage.locator(`main[data-rin-public-document="${probe.kind}"]`).first();
    await expect(rawMain).toBeVisible();
    const raw = {
      id: await rawMain.getAttribute('data-rin-object-id'),
      version: await rawMain.getAttribute('data-rin-public-version'),
      primary: semanticText(await rawMain.locator('[data-rin-primary-text]').first().innerText()),
    };
    await expect(rawPage.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(new URL((await rawPage.locator('link[rel="canonical"]').getAttribute('href')) || '').pathname).toBe(probe.path);
    await rawContext.close();

    const interactiveContext = await browser.newContext({ javaScriptEnabled: true, locale: 'zh-CN' });
    const interactivePage = await interactiveContext.newPage();
    await interactivePage.goto(`${releaseOrigin}${probe.path}`, { waitUntil: 'domcontentloaded' });
    const interactive = interactivePage.locator(`[data-rin-public-document="${probe.kind}"][data-rin-object-id="${raw.id}"]`).last();
    await expect(interactive).toBeVisible({ timeout: 20_000 });
    await expect(interactive).toHaveAttribute('data-rin-public-version', raw.version || '');
    await expect(interactivePage.locator('link[rel="canonical"]')).toHaveCount(1);
    expect(new URL((await interactivePage.locator('link[rel="canonical"]').getAttribute('href')) || '').pathname).toBe(probe.path);

    const interactivePrimary = probe.kind === 'tweet'
      ? semanticText(await interactive.locator('.status__content__text').first().innerText())
      : semanticText(await interactive.locator('[data-rin-primary-text]').first().innerText());
    expect(interactivePrimary).toContain(raw.primary);
    if (probe.kind !== 'tweet') await expect(interactivePage.locator('main')).toHaveCount(1);
    await interactiveContext.close();
  }
});
