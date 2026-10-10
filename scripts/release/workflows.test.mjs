import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = (name) => fs.readFileSync(path.resolve(import.meta.dirname, `../../.github/workflows/${name}.yml`), 'utf8');

test('PR checks use only disposable hosted runners and no formal build/private secrets', () => {
  const text = workflow('ci');
  assert.match(text, /pull_request:/);
  assert.match(text, /runs-on: ubuntu-22\.04/);
  assert.match(text, /--frozen-lockfile --ignore-scripts --ignore-pnpmfile/);
  assert.doesNotMatch(text, /secrets\.|contents: write|--build|pull_request_target|runs-on:.*self-hosted/);
  assert.doesNotMatch(text, /sysctl|sudo\s+(?:node|bwrap)|--admin|--privileged/);
  for (const name of ['Source and boundaries', 'Unit tests', 'Tooling tests']) assert.match(text, new RegExp(`name: ${name}`));
  assert.match(text, /fail-fast: false/);
  assert.match(text, /max-parallel: 2/);
  assert.match(text, /name: frontend/);
  assert.match(text, /--suite \$\{\{ matrix\.suite \}\}/);
});

test('DCO metadata workflow never checks out or executes PR head code', () => {
  const text = workflow('dco');
  assert.match(text, /pull_request_target:/);
  assert.match(text, /name: Verify DCO sign-offs for every commit author and coauthor/);
  assert.match(text, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(text, /commits\.length !== pr\.commits/);
  assert.doesNotMatch(text, /ref:.*head|pnpm install|npm install|contents: write|secrets\./);
});

test('fixed candidate is manual, read-only, separately approved and isolated', () => {
  const text = workflow('frontend-candidate');
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /environment: frontend-candidate/);
  assert.match(text, /rinspace-release-build, rinspace-public-frontend-isolated/);
  assert.match(text, /runs-on: \[rinspace-release-build, rinspace-public-frontend-isolated\]/);
  assert.doesNotMatch(text, /runs-on:.*self-hosted/);
  assert.match(text, /RINSPACE_FRONTEND_DISTRIBUTION_APPROVED/);
  assert.match(text, /RINSPACE_FRONTEND_REVIEWED_SOURCE/);
  assert.match(text, /context_sha256/);
  assert.match(text, /--output "\/stage\/\$GITHUB_RUN_ID"/);
  assert.match(text, /test "\$\(node --version\)" = v22\.22\.3/);
  assert.match(text, /test "\$\(pnpm --version\)" = 9\.7\.0/);
  assert.doesNotMatch(text, /actions\/setup-node/);
  assert.doesNotMatch(text, /actions\/upload-artifact|frontend-candidate-output/);
  assert.doesNotMatch(text, /^  (push|pull_request|pull_request_target|workflow_run):/m);
  assert.doesNotMatch(text, /contents: write|id-token: write|secrets\.|gh release|docker |git push/);
});

test('all third-party actions are pinned to complete official commit SHAs', () => {
  for (const name of ['ci', 'dco', 'frontend-candidate']) {
    const text = workflow(name);
    const uses = [...text.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
    assert.ok(uses.length > 0);
    assert.ok(uses.every((value) => /^(?:actions\/(?:checkout|setup-node|github-script|upload-artifact)|pnpm\/action-setup)@[a-f0-9]{40}$/.test(value)));
    assert.match(text, /persist-credentials: false/);
  }
});

test('isolation mounts the pinned Node outside read-only system directories', () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, 'run-isolated-checks.mjs'), 'utf8');
  assert.match(text, /'--dir', '\/tools', '--ro-bind', fs\.realpathSync\(process\.execPath\), '\/tools\/node'/);
  assert.match(text, /'PATH', '\/tools:\/usr\/bin:\/bin'/);
  assert.match(text, /\.\.\.sandbox, '\/tools\/node', \.\.\.command/);
  assert.doesNotMatch(text, /'--ro-bind', fs\.realpathSync\(process\.execPath\), '\/usr\/bin\/node'/);
  const nested = fs.readFileSync(path.join(import.meta.dirname, '../check-source-independence.mjs'), 'utf8');
  assert.match(nested, /"--dir",\s*"\/tools",\s*"--ro-bind",\s*fs\.realpathSync\(process\.execPath\),\s*"\/tools\/node"/);
  assert.match(nested, /"\/tools:\/usr\/bin:\/bin"/);
  assert.match(nested, /\.\.\.args, "\/tools\/node", \.\.\.command/);
  assert.doesNotMatch(nested, /\.\.\.args, "\/usr\/bin\/node"/);
});

test('both isolation layers provide only an empty ephemeral home, never a host profile', () => {
  const outer = fs.readFileSync(path.join(import.meta.dirname, 'run-isolated-checks.mjs'), 'utf8');
  const inner = fs.readFileSync(path.join(import.meta.dirname, '../check-source-independence.mjs'), 'utf8');
  assert.match(outer, /'--tmpfs', '\/tmp'/);
  assert.match(outer, /'--dir', '\/tmp\/rinspace-check-home', '--setenv', 'HOME', '\/tmp\/rinspace-check-home'/);
  assert.match(inner, /"--tmpfs",\s*"\/tmp",\s*"--dir",\s*"\/tmp\/rinspace-check-home"/);
  assert.match(inner, /"--setenv",\s*"HOME",\s*"\/tmp\/rinspace-check-home"/);
  const browser = fs.readFileSync(path.join(import.meta.dirname, '../check-markdown-math-isolated.mjs'), 'utf8');
  const inputs = fs.readFileSync(path.join(import.meta.dirname, '../lib/markdown-math-inputs.test.cjs'), 'utf8');
  assert.match(browser, /HOME: "\/tmp\/rinspace-check-home"/);
  assert.match(inputs, /HOME: temporaryHome/);
  assert.match(inputs, /fs\.rmSync\(temporaryHome, \{ recursive: true, force: true \}\)/);
  for (const text of [outer, inner]) {
    assert.doesNotMatch(text, /--(?:ro-)?bind[^\n]*(?:os\.homedir\(|process\.env\.HOME|\/etc\/passwd|\/root)/);
  }
});
