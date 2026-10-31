import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.READER_TEST_ORIGIN || 'http://127.0.0.1:5187';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback only');
const fixture = process.env.READER_FIXTURE_PDF;
const output = process.env.READER_EVIDENCE_DIR;
if (!fixture || !output) throw Error('Set external fixture and evidence paths');
await mkdir(output, { recursive: true });
const bytes = [...await readFile(fixture)];
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ locale: 'zh-CN' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const wait = fn => expect.poll(() => page.evaluate(fn), { timeout: 20000 }).toBe(true);
try {
  await page.goto(origin + '/reader');
  await page.evaluate(async bytes => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('reader-fixture.pdf', { create: true });
    const writable = await handle.createWritable(); await writable.write(new Uint8Array(bytes)); await writable.close();
    window.showOpenFilePicker = async () => [handle];
  }, bytes);
  await page.getByRole('button', { name: '打开 PDF', exact: true }).click();
  const loaded = async () => {
    const el = document.querySelector('embedpdf-container');
    return Boolean(el && (await el.registry).getPlugin('document-manager').provides().getActiveDocument()?.pageCount === 3);
  };
  await wait(loaded);
  const url = page.url();
  await page.reload(); await wait(loaded);
  assert.equal(page.url(), url);
  // A stale writer must not replace the revision written by another window.
  const staleWriteRejected = await page.evaluate(async () => {
    const storage = await import('/src/features/reader/storage.ts');
    const doc = (await storage.listReaderDocuments())[0];
    const revision = doc.progress?.revision ?? 0;
    await storage.saveReaderProgress(doc.id, doc.contentVersion, { pageIndex: 2, pageOffsetRatio: 0.2, zoom: 'fit-page', revision }, revision);
    const stale = await storage.saveReaderProgress(doc.id, doc.contentVersion, { pageIndex: 0, pageOffsetRatio: 0, zoom: 'fit-page', revision }, revision);
    return stale.progress.pageIndex === 2 && stale.progress.revision === revision + 1;
  });
  assert(staleWriteRejected);
  // Changing the same file creates a new document version; it cannot inherit a paid job.
  await page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('reader-fixture.pdf');
    const file = await handle.getFile(); const writable = await handle.createWritable();
    await writable.write(new Blob([file, '\n% changed local file\n'])); await writable.close();
  });
  await page.reload(); await wait(loaded);
  assert.notEqual(page.url(), url);
  await page.goto(origin + '/reader');
  await page.evaluate(async () => { const storage = await import('/src/features/reader/storage.ts'); await storage.clearReaderLocalData(); });
  await expect(page.locator('.reader-book')).toHaveCount(0);
  await page.goto(url);
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('embedpdf-container').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(output + '/storage-result.json', JSON.stringify({ persistentHandleReload: true, staleWriterRejected: true, changedFileNewVersion: true, clearDoesNotRestorePdf: true, errors }, null, 2));
  console.log('Reader persistent handle, revision, changed file and clearing checks passed.');
} finally {
  await page.screenshot({ path: output + '/storage-last.png' });
  await browser.close();
}
