import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfigFromFile, resolveConfig } from 'vite';

const uiRoot = path.resolve(import.meta.dirname, '../..');
const read = (name) => fs.readFileSync(path.join(uiRoot, name), 'utf8');

test('product config resolves with only the real application entry and unchanged output layout', async () => {
  const previousDirectory = process.cwd();
  const emptyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-entrypoint-check-'));
  try {
    // The config's explicit loadEnv call sees no environment files, even when
    // this test is run from the private integration repository.
    process.chdir(emptyDirectory);
    const config = await resolveConfig({
      root: uiRoot,
      configFile: path.join(uiRoot, 'vite.config.ts'),
      envFile: false,
      mode: 'entrypoint-check',
    }, 'build');
    assert.deepEqual(config.build.rollupOptions.input, { index: path.join(uiRoot, 'index.html') });
    assert.equal(config.build.outDir, 'build');
    assert.equal(config.build.emptyOutDir, true);
    assert.equal(config.build.cssMinify, 'lightningcss');
    assert.equal(config.build.rollupOptions.output.entryFileNames, 'static/js/[name].[hash].js');
    assert.equal(config.build.rollupOptions.output.chunkFileNames, 'static/js/[name].[hash].chunk.js');
  } finally {
    process.chdir(previousDirectory);
    fs.rmSync(emptyDirectory, { recursive: true, force: true });
  }
});

async function resolveProductionConfig(environmentId, publishableKey) {
  const previousDirectory = process.cwd();
  const emptyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-production-config-check-'));
  const values = new Map([
    ['REACT_APP_CLOUDBASE_ENV_ID', environmentId],
    ['REACT_APP_CLOUDBASE_ACCESS_KEY', publishableKey],
  ]);
  const previousValues = new Map([...values.keys()].map((key) => [key, process.env[key]]));
  try {
    process.chdir(emptyDirectory);
    for (const [key, value] of values) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // Resolve only, using synthetic public configuration; never build a site.
    return await resolveConfig({
      root: uiRoot,
      configFile: path.join(uiRoot, 'vite.config.ts'),
      envFile: false,
      envDir: false,
      mode: 'production',
      logLevel: 'silent',
    }, 'build');
  } finally {
    process.chdir(previousDirectory);
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(emptyDirectory, { recursive: true, force: true });
  }
}

for (const { name, environmentId, publishableKey, missing } of [
  { name: 'missing environment ID', environmentId: undefined, publishableKey: 'public-fixture-key', missing: 'REACT_APP_CLOUDBASE_ENV_ID' },
  { name: 'blank environment ID', environmentId: '  ', publishableKey: 'public-fixture-key', missing: 'REACT_APP_CLOUDBASE_ENV_ID' },
  { name: 'missing publishable key', environmentId: 'public-fixture-env-id', publishableKey: undefined, missing: 'REACT_APP_CLOUDBASE_ACCESS_KEY' },
  { name: 'blank publishable key', environmentId: 'public-fixture-env-id', publishableKey: '  ', missing: 'REACT_APP_CLOUDBASE_ACCESS_KEY' },
]) {
  test('production config preserves its existing guard: ' + name, async () => {
    await assert.rejects(
      () => resolveProductionConfig(environmentId, publishableKey),
      new RegExp(missing + ' is required for the production UI build\\.'),
    );
  });
}

test('production config accepts synthetic public settings without changing the product entry', async () => {
  const config = await resolveProductionConfig('public-fixture-env-id', 'public-fixture-key');
  const publicConfig = JSON.parse(config.define.__RINSPACE_PUBLIC_ENV__);
  assert.equal(publicConfig.cloudbaseEnvId, 'public-fixture-env-id');
  assert.equal(publicConfig.cloudbaseAccessKey, 'public-fixture-key');
  assert.deepEqual(config.build.rollupOptions.input, { index: path.join(uiRoot, 'index.html') });
});

test('every public package script has its frontend-local implementation', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const [name, command] of Object.entries(pkg.scripts)) {
    for (const [, filename] of command.matchAll(/\b(scripts\/[\w./-]+\.(?:mjs|cjs|ts))/g)) {
      assert.ok(fs.statSync(path.join(uiRoot, filename)).isFile(), `${name}: missing ${filename}`);
    }
  }
  for (const name of [
    'test:real-site-stability', 'test:real-site-session-bootstrap', 'test:real-site-stability:contract',
    'baseline:redesign', 'baseline:redesign:v2', 'capture:north-star', 'capture:production:v2',
  ]) assert.equal(pkg.scripts[name], undefined, `${name} belongs to the private repository`);
  assert.equal(pkg.scripts['check:animate-ui'], 'node scripts/check-animate-ui-application.mjs');
  assert.equal(pkg.license, 'AGPL-3.0-only');
});

test('application component gate has no raw catalog or private-parent input', () => {
  assert.doesNotMatch(read('scripts/check-animate-ui-application.mjs'), /vendor\/|manifest\.json|production-map\.json|\.\.\/specs/);
});

test('browser projects start with empty anonymous state instead of a captured session', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'entrypoint-check' }, path.join(uiRoot, 'playwright.config.ts'));
  assert.ok(loaded);
  assert.deepEqual(loaded.config.use.storageState, { cookies: [], origins: [] });
  assert.deepEqual(loaded.config.projects.map((project) => project.name), [
    'desktop-light', 'desktop-dark', 'desktop-reduced', 'mobile-light', 'mobile-dark', 'mobile-reduced',
  ]);
  assert.doesNotMatch(read('playwright.config.ts'), /\.auth\/|anonymous\.json/);
});

test('performance reports stay inside the frontend without relaxing the original budgets', () => {
  const source = read('tests/e2e/performance.spec.ts');
  assert.match(source, /const evidence = path\.resolve\(process\.cwd\(\), 'test-results', 'performance'\)/);
  assert.doesNotMatch(source, /\.\.\/specs/);
  for (const budget of ['350 * 1024', '80 * 1024', '70 * 1024', '650 * 1024', '2500', '200', '.1']) {
    assert.ok(source.includes(`toBeLessThanOrEqual(${budget})`), `original budget missing: ${budget}`);
  }
  assert.match(source, /item\.gzip > 250 \* 1024/);
  assert.match(source, /for \(let index = 0; index < 5; index \+= 1\)/);
});

test('local generated output and captured sessions are ignored without private-root Git rules', () => {
  const ignores = new Set(read('.gitignore').split('\n'));
  for (const name of ['node_modules/', 'build/', 'test-results/', 'playwright-report/', 'playwright/.auth/', '.env.local', '.env.production', 'public/assets/rin-uploads/']) {
    assert.ok(ignores.has(name), `missing ignore rule: ${name}`);
  }
});
