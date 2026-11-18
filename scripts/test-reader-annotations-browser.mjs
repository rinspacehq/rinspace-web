import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.READER_TEST_ORIGIN || 'http://127.0.0.1:5187';
const fixture = process.env.READER_FIXTURE_PDF;
const output = process.env.READER_EVIDENCE_DIR;
if (!fixture || !output) throw new Error('Set external PDF fixture and evidence paths');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'reader-annotations-browser-'));
const errors = [];
let documentUrl;

async function inBrowser(run) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, locale: 'zh-CN', viewport: { width: 1440, height: 900 },
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--disable-dev-shm-usage', '--renderer-process-limit=2'],
  });
  try {
    const page = context.pages()[0];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }));
    await page.goto(origin + '/reader');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: '打开 PDF', exact: true }).click(),
    ]);
    await chooser.setFiles(fixture);
    await page.waitForURL('**/reader/pdf/local/*');
    if (documentUrl) assert.equal(page.url(), documentUrl);
    documentUrl = page.url();
    await page.getByRole('button', { name: '下一页', exact: true }).waitFor();
    return await run(page);
  } finally {
    await context.close();
  }
}

async function readEdits(page, count) {
  const scope = await page.evaluateHandle(async () => {
    const registry = await document.querySelector('embedpdf-container').registry;
    const id = registry.getPlugin('document-manager').provides().getActiveDocumentId();
    return registry.getPlugin('annotation').provides().forDocument(id);
  });
  const edits = await page.waitForFunction(({ scope, count }) => {
    const objects = scope.getAnnotations({ pageIndex: 0 }).map(entry => entry.object);
    return objects.length === count && !scope.getState().hasPendingChanges && objects;
  }, { scope, count });
  return edits.jsonValue();
}

const [first, second] = await inBrowser(async page => {
  await page.getByRole('button', { name: '批注', exact: true }).last().click();
  await page.getByRole('button', { name: '自由绘制', exact: true }).click();
  await page.waitForTimeout(500);
  for (const y of [350, 475]) {
    await page.mouse.move(550, y);
    await page.mouse.down();
    await page.mouse.move(600, y + 25, { steps: 10 });
    await page.mouse.move(680, y - 20, { steps: 10 });
    await page.mouse.up();
    await page.getByText('批注已保存到此设备', { exact: true }).waitFor();
  }
  const objects = await readEdits(page, 2);
  assert(objects.every(object => object.inkList?.length === 1));
  await page.screenshot({ path: join(output, 'before-close.png') });
  return objects;
});

await inBrowser(async page => {
  const objects = await readEdits(page, 2);
  assert.deepEqual(objects.map(object => object.id).sort(), [first.id, second.id].sort());
  await page.screenshot({ path: join(output, 'after-reopen.png') });
  await page.evaluate(async ({ firstId, secondId }) => {
    const registry = await document.querySelector('embedpdf-container').registry;
    const documentId = registry.getPlugin('document-manager').provides().getActiveDocumentId();
    const scope = registry.getPlugin('annotation').provides().forDocument(documentId);
    scope.updateAnnotation(0, firstId, { strokeWidth: 7 });
    scope.deleteAnnotation(0, secondId);
  }, { firstId: first.id, secondId: second.id });
  const [changed] = await readEdits(page, 1);
  assert.equal(changed.strokeWidth, 7);
  await page.getByText('批注已保存到此设备', { exact: true }).waitFor();
});

await inBrowser(async page => {
  const [restored] = await readEdits(page, 1);
  assert.equal(restored.id, first.id);
  assert.equal(restored.strokeWidth, 7);
  await page.screenshot({ path: join(output, 'after-update-and-delete.png') });
});

assert.deepEqual(errors, []);
await writeFile(join(output, 'result.json'), JSON.stringify({
  completeBrowserRestart: true, additionsRestored: true, editRestored: true, deletionRestored: true, errors,
}, null, 2));
