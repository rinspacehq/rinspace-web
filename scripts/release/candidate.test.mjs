import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { createCandidate, dependencyInventory, publicConfiguration, regularFiles, releaseContext, sha256, sharedInputs } from './candidate.mjs';

export function fixture() {
  const input = {
    repository: 'rinspacehq/rinspace-web', eventName: 'workflow_dispatch', ref: 'refs/heads/main',
    sourceCommit: 'a'.repeat(40), workflowCommit: 'a'.repeat(40), remoteMain: 'a'.repeat(40),
    version: 'v1.2.3', enabled: 'true', isolatedRunner: 'true', distributionApproved: 'true',
    reviewedSource: 'a'.repeat(40), reviewedVersion: 'v1.2.3',
    compatibility: { api: 'synthetic-api/1', identity: 'synthetic-identity/1', shared: 'synthetic-shared/1' },
    publicConfig: { REACT_APP_CLOUDBASE_ENV_ID: 'synthetic-environment', REACT_APP_CLOUDBASE_ACCESS_KEY: 'synthetic-publishable-fixture-not-a-credential' },
  };
  const context = releaseContext(input);
  const dependencyLock = Buffer.from('Synthetic dependency lock, not an installed dependency graph');
  return {
    input, context, dependencyLock,
    site: new Map([['index.html', Buffer.from('<html>synthetic test only</html>')], ['static/js/app.js', Buffer.from('/* synthetic fixture: never execute */')]]),
    shared: new Map([['contract.json', Buffer.from('{"synthetic":true}')]]),
    license: Buffer.from('Synthetic license placeholder; not legal acceptance'),
    notices: Buffer.from('Synthetic notices placeholder; not redistribution approval'),
    licenses: { UNKNOWN: [{ name: 'synthetic-package', versions: ['1.0.0'], paths: ['/hidden/private/cache'], author: 'fixture@example.invalid' }] },
    epoch: 1, runId: '123',
    checks: { schemaVersion: 1, sourceCommit: context.sourceCommit, dependencyLockSha256: sha256(dependencyLock), publicConfigSha256: sha256(`${JSON.stringify(context.publicConfig, null, 2)}\n`), checks: Object.fromEntries(['source-independence', 'typecheck', 'unit', 'vite-artifact', 'i18n-bundles'].map((key) => [key, 'passed'])) },
  };
}

test('release context is exact, reviewed, manual and canonical', () => {
  const value = fixture();
  assert.equal(value.context.sourceCommit, 'a'.repeat(40));
  for (const [field, changed] of [
    ['repository', 'lunifans/rinspace-web'], ['eventName', 'pull_request'], ['ref', 'refs/tags/v1.2.3'],
    ['sourceCommit', 'main'], ['workflowCommit', 'b'.repeat(40)], ['remoteMain', 'b'.repeat(40)],
    ['enabled', ''], ['isolatedRunner', 'false'], ['distributionApproved', 'false'],
    ['reviewedSource', 'b'.repeat(40)], ['reviewedVersion', 'v1.2.4'], ['version', 'latest'],
  ]) assert.throws(() => releaseContext({ ...value.input, [field]: changed }), undefined, field);
});

test('compatibility cannot be floating, missing or silently extended', () => {
  for (const compatibility of [null, {}, { api: '*', identity: 'identity/1', shared: 'shared/1' }, { api: 'main', identity: 'identity/1', shared: 'shared/1' }, { ...fixture().input.compatibility, production: 'true' }]) assert.throws(() => releaseContext({ ...fixture().input, compatibility }));
});

test('public configuration uses an allowlist, explicit publishable inputs and official root paths', () => {
  const value = fixture();
  assert.equal(value.context.publicConfig.VITE_ASSET_BASE, '/');
  assert.equal(value.context.publicConfig.PUBLIC_URL, '');
  for (const publicConfig of [null, {}, { ...value.input.publicConfig, DATABASE_URL: 'not allowed' }, { ...value.input.publicConfig, REACT_APP_RIN_ADMIN_PHONE_SHA256: 'not public build input' }, { ...value.input.publicConfig, REACT_APP_CLOUDBASE_ACCESS_KEY: ' ' }, { ...value.input.publicConfig, REACT_APP_CLOUDBASE_ENV_ID: 'bad\nvalue' }]) assert.throws(() => publicConfiguration(publicConfig));
});

test('candidate bytes are deterministic and inventory preserves source bytes', () => {
  const value = fixture();
  const first = createCandidate(value);
  const second = createCandidate(value);
  assert.deepEqual(first.artifactBytes, second.artifactBytes);
  const manifest = JSON.parse(first.manifestBytes);
  for (const [name, bytes] of value.site) assert.deepEqual(manifest.files.find((entry) => entry.path === `site/${name}`), { path: `site/${name}`, size: bytes.length, sha256: sha256(bytes) });
  assert.ok(!manifest.files.some((entry) => entry.path === 'manifest.json'));
  const evidence = JSON.parse(first.publicEvidenceBytes);
  assert.equal(evidence.artifactSha256, sha256(first.artifactBytes));
  assert.equal(evidence.manifestSha256, sha256(first.manifestBytes));
  assert.equal(evidence.productionAuthorized, false);
});

test('GNU tar reads the strict archive and its long-path prefix without directory records', () => {
  const value = fixture();
  const name = `${'long/'.repeat(23)}fixture.txt`;
  value.shared.set(name, Buffer.from('synthetic long path'));
  const result = createCandidate(value);
  const listing = execFileSync('tar', ['-tzf', '-'], { input: result.artifactBytes, encoding: 'utf8' }).trim().split('\n');
  assert.ok(listing.includes(`shared/${name}`));
  assert.ok(listing.every((entry) => !entry.endsWith('/')));
  assert.equal(execFileSync('tar', ['-xzOf', '-', 'site/static/js/app.js'], { input: result.artifactBytes }).toString(), value.site.get('static/js/app.js').toString());
  assert.equal(gunzipSync(result.artifactBytes).length % 512, 0);
});

test('a candidate cannot invent missing checks or bind different checked inputs', () => {
  const value = fixture();
  for (const changed of [{ sourceCommit: 'b'.repeat(40) }, { dependencyLockSha256: 'b'.repeat(64) }, { publicConfigSha256: 'b'.repeat(64) }, { checks: { ...value.checks.checks, unit: 'skipped' } }, { checks: { ...value.checks.checks, 'vite-artifact': 'pending' } }]) assert.throws(() => createCandidate({ ...value, checks: { ...value.checks, ...changed } }));
});

test('candidate rejects traversal, non-ASCII/hidden paths, case collisions and directory collisions', () => {
  for (const name of ['../escape', 'a/../escape', '/absolute', '.env', 'a\\b', 'a/%2e', 'a/中文', 'a b', `${'x'.repeat(101)}.txt`]) {
    const value = fixture();
    value.shared.set(name, Buffer.from('synthetic'));
    assert.throws(() => createCandidate(value), undefined, name);
  }
  for (const names of [['INDEX.html'], ['static', 'static/js/app.js']]) {
    const value = fixture();
    for (const name of names) value.site.set(name, Buffer.from('collision'));
    assert.throws(() => createCandidate(value));
  }
});

test('candidate needs nonempty required inputs, bounded metadata and source time', () => {
  for (const changed of [{ site: new Map() }, { shared: new Map() }, { license: Buffer.alloc(0) }, { notices: Buffer.alloc(0) }, { epoch: -1 }, { epoch: 1.5 }, { runId: 'not-exact' }]) assert.throws(() => createCandidate({ ...fixture(), ...changed }));
});

test('dependency inventory records UNKNOWN honestly and strips paths/author emails', () => {
  const result = dependencyInventory(fixture().licenses);
  assert.deepEqual(result[0].licenses, [{ license: { name: 'UNKNOWN' } }]);
  assert.ok(!JSON.stringify(result).includes('/hidden/private'));
  assert.ok(!JSON.stringify(result).includes('fixture@example.invalid'));
  assert.equal(dependencyInventory({ MIT: [{ name: 'fixture', versions: ['1.0.0', '2.0.0'] }] }).length, 2);
  for (const value of [{}, { MIT: {} }, { MIT: [{ name: 'bad/path', versions: ['1.0.0'] }] }, { MIT: [{ name: 'fixture', version: '1.0.0' }] }, { MIT: [{ name: 'fixture', versions: ['latest'] }] }]) assert.throws(() => dependencyInventory(value));
});

test('regular file collector rejects links and never follows an external tree', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-file-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'fixture.txt'), 'fixture');
  assert.equal(regularFiles(directory).get('fixture.txt').toString(), 'fixture');
  fs.symlinkSync('/etc/hosts', path.join(directory, 'linked.txt'));
  assert.throws(() => regularFiles(directory), /regular/);
});

test('actual shared sources include a complete relative closure but no private adapter/catalog', async () => {
  const entries = await sharedInputs(path.resolve(import.meta.dirname, '../..'));
  const contract = JSON.parse(entries.get('contract.json'));
  assert.ok(entries.has('src/components/shared/RinspaceTopbarFrame.tsx'));
  assert.ok(entries.has('src/components/shared/RinspaceTweetComposer.tsx'));
  assert.ok(entries.has('src/components/ui/cn.ts'));
  assert.ok(entries.has('src/components/animate-ui/use-is-in-view.ts'));
  assert.ok(entries.has('legal/COMMERCIAL-LICENSING.md'));
  assert.equal(contract.runtimeBindings.AnimateMore[1], 'More');
  assert.equal(contract.dependencies.react, '19.2.8');
  assert.ok(![...entries.keys()].some((name) => name.includes('vendor/') || name === 'src/components/ui/index.tsx' || name === 'src/rinspace_topbar_runtime.ts'));
});

test('candidate CLI help is safe and unknown/partial arguments do not produce output', () => {
  const cli = path.join(import.meta.dirname, 'candidate.mjs');
  assert.equal(spawnSync(process.execPath, [cli, '--help']).status, 0);
  assert.notEqual(spawnSync(process.execPath, [cli, '--output', '/not-created', '--activate']).status, 0);
});
