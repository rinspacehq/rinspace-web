import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDco } from './check-dco.mjs';

const commit = (message) => ({ sha: 'a'.repeat(40), commit: { author: { name: 'Fixture Author', email: 'author@example.invalid' }, message } });
const signoff = 'Signed-off-by: Fixture Author <author@example.invalid>';

test('DCO accepts real trailers, case-normalized emails and all co-authors', () => {
  assert.equal(checkDco([commit(`Change\n\n${signoff}\n`)]), 1);
  assert.equal(checkDco([commit('Change\n\nsigned-off-by: Fixture Author <AUTHOR@example.invalid>\n')]), 1);
  assert.equal(checkDco([commit(`Change\n\n${signoff}\nCo-authored-by: Other Author <other@example.invalid>\nSigned-off-by: Other Author <other@example.invalid>\n`)]), 1);
});

test('DCO rejects absent sign-offs, wrong author and body-only mentions', () => {
  for (const message of ['Change', 'Change\n\nSigned-off-by: Other <other@example.invalid>', `Change\n\n${signoff}\n\nThis is ordinary body text, not a trailer block.`]) assert.throws(() => checkDco([commit(message)]), /lacks/);
});

test('every co-author signs and later commits cannot borrow a sign-off', () => {
  assert.throws(() => checkDco([commit(`Change\n\n${signoff}\nCo-authored-by: Other <other@example.invalid>\n`)]), /co-author/);
  assert.throws(() => checkDco([commit(`Change\n\n${signoff}\n`), { ...commit('Unsigned'), sha: 'b'.repeat(40) }]), /lacks/);
});

test('DCO fails closed on incomplete/oversized/malformed metadata', () => {
  for (const value of [[], null, Array(251).fill(commit(signoff)), [{ ...commit(signoff), sha: 'main' }], [commit('Change\n\nSigned-off-by: Broken identity\n')]]) assert.throws(() => checkDco(value));
});
