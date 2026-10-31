import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const origin = process.env.READER_TEST_ORIGIN || 'http://127.0.0.1:5187';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('This fixture test only runs on loopback');
const output = process.env.READER_EVIDENCE_DIR;
const fixture = process.env.READER_FIXTURE_PDF;
if (!output || !fixture) throw new Error('Set READER_EVIDENCE_DIR and READER_FIXTURE_PDF to external paths');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN' });
await context.addInitScript(() => { Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }); });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const wait = predicate => expect.poll(() => page.evaluate(predicate), { timeout: 20000, intervals: [100, 200, 500] }).toBe(true);
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
const open = async button => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]);
  await chooser.setFiles(fixture);
};
try {
  await page.goto(`${origin}/reader`);
  await page.getByRole('tab', { name: '最近阅读', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'library-empty.png') });
  await open(page.getByRole('button', { name: '打开 PDF', exact: true }));
  await page.waitForURL(/\/reader\/pdf\/local\/[\da-f-]+$/);
  const documentUrl = page.url();
  await wait(async () => {
    const viewer = document.querySelector('embedpdf-container');
    if (!viewer) return false;
    const registry = await viewer.registry;
    return registry.getPlugin('document-manager').provides().getActiveDocument()?.pageCount === 3;
  });
  assert.equal(await page.locator('.rin-app-shell > .topbar').isVisible(), false);
  await page.getByRole('button', { name: '琳', exact: true }).click();
  await page.getByRole('textbox', { name: '发给琳的消息' }).fill('Explain this PDF');
  await page.getByRole('button', { name: '收起琳' }).click();
  await page.getByRole('textbox', { name: '发给琳的消息' }).waitFor({ state: 'hidden' });
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 10000);
  await wait(async () => {
    const registry = await document.querySelector('embedpdf-container').registry;
    const id = registry.getPlugin('document-manager').provides().getActiveDocumentId();
    const scroll = registry.getPlugin('scroll').provides().forDocument(id);
    return scroll.getCurrentPage() === 3 && scroll.getMetrics().visiblePages.includes(3) && !scroll.getPageChangeState().isChanging;
  });
  await wait(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('rinspace-local-reader'); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    const entries = await new Promise(resolve => { const request = db.transaction('documents').objectStore('documents').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return entries[0]?.progress?.pageIndex === 2;
  });
  await page.screenshot({ path: resolve(output, 'pdf-desktop.png') });
  await page.reload();
  await open(page.getByRole('button', { name: '重新选择 PDF', exact: true }));
  await wait(async () => {
    const viewer = document.querySelector('embedpdf-container');
    if (!viewer) return false;
    const registry = await viewer.registry;
    const id = registry.getPlugin('document-manager').provides().getActiveDocumentId();
    return id && registry.getPlugin('scroll').provides().forDocument(id).getCurrentPage() === 3;
  });
  assert.equal(page.url(), documentUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400); // Native viewport/auto-zoom debounce is 150 ms.
  assert.equal(await page.evaluate(async () => (await document.querySelector('embedpdf-container').registry).getPlugin('scroll').provides().getCurrentPage()), 3);
  await page.getByRole('button', { name: '琳', exact: true }).click();
  await page.getByRole('button', { name: '收起琳' }).click();
  await page.getByRole('textbox', { name: '发给琳的消息' }).waitFor({ state: 'hidden' });
  await page.screenshot({ path: resolve(output, 'pdf-mobile.png') });
  await page.goto(`${origin}/reader`);
  await page.getByRole('button', { name: '文档操作', exact: true }).last().click();
  await page.getByRole('menuitem', { name: '加入书架' }).click();
  await page.getByRole('tab', { name: '书架', exact: true }).click();
  await page.locator('.reader-book').waitFor();
  assert.equal(await page.locator('.reader-book').count(), 1);
  await page.getByText('3 / 3 页', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'shelf-mobile.png') });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ localOpen: true, opaqueRoute: true, noSiteNavInPdf: true,
    thirdPageRestoredAfterReselect: true, sameDocumentDeduplicated: true, nativeMobileRinCloses: true, shelf: true, errors }, null, 2));
  console.log('Reader library/local PDF browser checks passed (no paid model call).');
} finally {
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(await page.evaluate(async () => {
    const viewer = document.querySelector('embedpdf-container');
    if (!viewer) return null;
    const registry = await viewer.registry;
    const id = registry.getPlugin('document-manager').provides().getActiveDocumentId();
    const scroll = registry.getPlugin('scroll').provides().forDocument(id);
    return { scroll: scroll.getMetrics(), pageChange: scroll.getPageChangeState(), viewport: registry.getPlugin('viewport').provides().getMetrics() };
  }), null, 2));
  await writeFile(resolve(output, 'dom.json'), JSON.stringify(await page.evaluate(() => ({
    url: location.href, text: document.body.innerText.slice(0, 3000),
    viewers: [...document.querySelectorAll('embedpdf-container')].map(element => ({
      connected: element.isConnected, box: element.getBoundingClientRect().toJSON(), shadow: element.shadowRoot?.innerHTML.slice(-5000),
    })),
    main: document.querySelector('main')?.outerHTML.slice(0, 3000),
  })), null, 2));
  await page.screenshot({ path: resolve(output, 'last-state.png') }).catch(() => {});
  await writeFile(resolve(output, 'errors.json'), JSON.stringify(errors));
  await browser.close();
}
