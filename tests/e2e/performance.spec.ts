import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

const build = path.resolve(process.cwd(), 'build');
const evidence = path.resolve(process.cwd(), 'test-results', 'performance');
const translationNamespaces = ['discovery', 'reader', 'creation', 'creator', 'identity', 'admin', 'settings', 'legal'];
const gzipBytes = (url: string) => {
  const pathname = new URL(url).pathname.replace(/^\/rinspace\//, '/').replace(/^\//, '');
  const file = path.join(build, pathname);
  return fs.existsSync(file) && fs.statSync(file).isFile() ? gzipSync(fs.readFileSync(file)).byteLength : 0;
};

const translationResourceChunkNames = () => new Set(
  fs.readdirSync(path.join(build, 'static/js'))
    .filter((name) => translationNamespaces.some((namespace) => name.startsWith(`${namespace}.`)))
    .filter((name) => {
      const source = fs.readFileSync(path.join(build, 'static/js', name), 'utf8');
      return !/\bfrom"\.\//.test(source) && /export\{[^}]*default/.test(source);
    }),
);

test('public initial route meets JS/CSS budgets and excludes private workspaces', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  const assets = new Set<string>();
  page.on('response', (response) => {
    if (/\.(?:js|css)(?:\?|$)/.test(response.url())) assets.add(response.url());
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const scripts = [...assets].filter((url) => /\.js(?:\?|$)/.test(url));
  const styles = [...assets].filter((url) => /\.css(?:\?|$)/.test(url));
  const coreFontStyles = styles.filter((url) => /rinspace-core-fonts\.css(?:\?|$)/.test(url));
  const applicationStyles = styles.filter((url) => !/rinspace-core-fonts\.css(?:\?|$)/.test(url));
  const jsBytes = scripts.reduce((sum, url) => sum + gzipBytes(url), 0);
  const coreFontCssBytes = coreFontStyles.reduce((sum, url) => sum + gzipBytes(url), 0);
  const applicationCssBytes = applicationStyles.reduce((sum, url) => sum + gzipBytes(url), 0);
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'bundle-budget.json'), `${JSON.stringify({
    profile: 'public home production artifact',
    js: { gzipBytes: jsBytes, budgetBytes: 350 * 1024, assets: scripts.map((url) => ({ file: path.basename(new URL(url).pathname), gzipBytes: gzipBytes(url) })) },
    css: {
      gzipBytes: applicationCssBytes,
      budgetBytes: 80 * 1024,
      assets: applicationStyles.map((url) => ({ file: path.basename(new URL(url).pathname), gzipBytes: gzipBytes(url) })),
    },
    coreFonts: {
      gzipBytes: coreFontCssBytes,
      budgetBytes: 70 * 1024,
      assets: coreFontStyles.map((url) => ({ file: path.basename(new URL(url).pathname), gzipBytes: gzipBytes(url) })),
    },
  }, null, 2)}\n`);
  expect(jsBytes, scripts.map((url) => `${path.basename(new URL(url).pathname)}=${Math.round(gzipBytes(url) / 1024)}KiB`).join(', ')).toBeLessThanOrEqual(350 * 1024);
  expect(applicationCssBytes, `${applicationStyles.length} initial application CSS assets`).toBeLessThanOrEqual(80 * 1024);
  expect(coreFontCssBytes, `${coreFontStyles.length} initial core font CSS assets`).toBeLessThanOrEqual(70 * 1024);
  expect(scripts.some((url) => /CodeMirror|Milkdown|Quiver|Admin|animate-ui-catalog/i.test(url))).toBe(false);
  const publicEntryHeavyChunks = scripts
    .map((url) => path.basename(new URL(url).pathname))
    .filter((name) => /SiteTopbar|PublishCreateDialog|pdfToc|katex/i.test(name));
  expect(publicEntryHeavyChunks, 'the anonymous public entry must not pull the signed-in topbar, publish dialogs, PDF or maths renderers').toEqual([]);
  const translationChunks = translationResourceChunkNames();
  const requestedTranslationChunks = scripts
    .map((url) => path.basename(new URL(url).pathname))
    .filter((name) => translationChunks.has(name));
  expect(requestedTranslationChunks).toHaveLength(1);
  expect(requestedTranslationChunks[0]).toMatch(/^discovery\./);
});

test('emitted ordinary and editor-only chunks meet lazy budgets', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  const scripts = fs.readdirSync(path.join(build, 'static/js')).filter((name) => name.endsWith('.js'));
  const sizes = scripts.map((name) => ({ name, gzip: gzipSync(fs.readFileSync(path.join(build, 'static/js', name))).byteLength }));
  const editor = sizes.filter(({ name }) => /CodeMirrorEditor|RinMilkdownEditor|useQuiverEditor|milkdown\/quiver/i.test(name));
  expect(editor.reduce((sum, item) => sum + item.gzip, 0), editor.map((item) => item.name).join(', ')).toBeLessThanOrEqual(650 * 1024);
  expect(sizes.filter((item) => item.gzip > 250 * 1024 && !editor.includes(item))).toEqual([]);
});

test('production-like public navigation meets Web Vital targets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  test.setTimeout(120_000);
  const samples: Array<{ lcp: number; cls: number; inp: number }> = [];
  for (let index = 0; index < 5; index += 1) {
    await page.addInitScript(() => {
      const metrics = { lcp: 0, cls: 0, inp: 0 };
      Object.defineProperty(window, '__rinWebVitals', { value: metrics, configurable: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = Math.max(metrics.lcp, entry.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) metrics.cls += entry.value || 0;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) metrics.inp = Math.max(metrics.inp, entry.duration);
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      } catch { /* Event Timing is optional in older Chromium builds. */ }
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('search').getByRole('textbox').click();
    await page.keyboard.type('拓扑');
    await page.waitForTimeout(500);
    samples.push(await page.evaluate(() => (window as Window & { __rinWebVitals: { lcp: number; cls: number; inp: number } }).__rinWebVitals));
  }
  const p75 = (key: keyof (typeof samples)[number]) => {
    const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
    return values[Math.ceil(values.length * .75) - 1] || 0;
  };
  const report = { profile: 'local production artifact / desktop Chromium / five runs', samples, p75: { lcp: p75('lcp'), inp: p75('inp'), cls: p75('cls') }, targets: { lcp: 2500, inp: 200, cls: .1 } };
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'web-vitals.json'), `${JSON.stringify(report, null, 2)}\n`);
  expect(p75('lcp'), JSON.stringify(samples)).toBeLessThanOrEqual(2500);
  expect(p75('inp'), JSON.stringify(samples)).toBeLessThanOrEqual(200);
  expect(p75('cls'), JSON.stringify(samples)).toBeLessThanOrEqual(.1);
});
