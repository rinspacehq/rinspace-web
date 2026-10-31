import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.READER_TEST_ORIGIN || 'http://127.0.0.1:5187';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback only');
const { READER_PASSWORD_PDF: locked, READER_CORRUPT_PDF: corrupt, READER_EVIDENCE_DIR: output } = process.env;
if (!locked || !corrupt || !output) throw Error('Set external encrypted/corrupt fixture and evidence paths');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ locale: 'zh-CN' });
await page.addInitScript(() => Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }));
const errors = []; page.on('pageerror', error => errors.push(error.message));
const wait = fn => expect.poll(() => page.evaluate(fn), { timeout: 20000 }).toBe(true);
const choose = async path => {
  await page.goto(origin + '/reader');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '打开 PDF', exact: true }).click()]);
  await chooser.setFiles(path);
};
try {
  await choose(locked);
  const password = page.locator('input[type=password]'); await password.waitFor();
  await password.fill('wrong'); await password.press('Enter');
  await wait(async () => {
    const registry = await document.querySelector('embedpdf-container').registry;
    const manager = registry.getPlugin('document-manager').provides();
    const state = manager.getDocumentState(manager.getActiveDocumentId());
    return Boolean(state?.passwordProvided && state?.errorCode);
  });
  await password.fill('reader-local-test'); await password.press('Enter');
  await wait(async () => {
    const registry = await document.querySelector('embedpdf-container').registry;
    return registry.getPlugin('document-manager').provides().getActiveDocument()?.pageCount === 3;
  });
  const secretsNotPersisted = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const q = indexedDB.open('rinspace-local-reader'); q.onsuccess = () => resolve(q.result); });
    const all = await Promise.all([...db.objectStoreNames].map(name => new Promise(resolve => { const q = db.transaction(name).objectStore(name).getAll(); q.onsuccess = () => resolve(q.result); })));
    db.close(); return !JSON.stringify(all).includes('reader-local-test');
  });
  assert(secretsNotPersisted);
  await choose(corrupt);
  await wait(async () => {
    const el = document.querySelector('embedpdf-container'); if (!el) return false;
    const manager = (await el.registry).getPlugin('document-manager').provides();
    const state = manager.getDocumentState(manager.getActiveDocumentId());
    return Boolean(state?.errorCode);
  });
  await page.screenshot({ path: output + '/corrupt.png' });
  await page.getByRole('button', { name: /关闭文档|关闭文件|关闭|Close document/, exact: true }).last().click();
  await page.waitForURL(origin + '/reader');
  await choose(locked);
  await password.waitFor();
  await page.getByRole('button', { name: /取消|Cancel/, exact: true }).click();
  await page.waitForURL(origin + '/reader');
  assert.deepEqual(errors, []);
  await writeFile(output + '/errors-result.json', JSON.stringify({ passwordRetry: true, passwordNotPersisted: true, corruptNativeError: true, errors }, null, 2));
  console.log('Reader encrypted PDF retry and corrupt-file checks passed.');
} finally { await browser.close(); }
