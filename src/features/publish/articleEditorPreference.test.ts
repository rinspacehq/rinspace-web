import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { articleEditorPreferenceKey, readArticleEditorPreference, writeArticleEditorPreference } from './articleEditorPreference';

beforeEach(() => { localStorage.removeItem(articleEditorPreferenceKey); });
afterEach(() => { vi.restoreAllMocks(); });

test('first use defaults to Online', () => { expect(readArticleEditorPreference()).toBe('online'); });

test('remembers Git and a later switch back to Online', () => {
  writeArticleEditorPreference('git');
  expect(readArticleEditorPreference()).toBe('git');
  writeArticleEditorPreference('online');
  expect(readArticleEditorPreference()).toBe('online');
});

test.each(['', 'Git', 'invalid', '{"preference":"git"}'])('invalid stored preference %s defaults to Online', (value) => {
  localStorage.setItem(articleEditorPreferenceKey, value);
  expect(readArticleEditorPreference('git')).toBe('online');
});

test('blocked storage preserves the current in-memory choice without blocking creation', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  expect(readArticleEditorPreference()).toBe('online');
  expect(readArticleEditorPreference('git')).toBe('git');
  expect(() => writeArticleEditorPreference('git')).not.toThrow();
});
