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
  assert.match(text, /RINSPACE_FRONTEND_DISTRIBUTION_APPROVED/);
  assert.match(text, /RINSPACE_FRONTEND_REVIEWED_SOURCE/);
  assert.match(text, /context_sha256/);
  assert.match(text, /overwrite: false/);
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
