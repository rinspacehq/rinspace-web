import { beforeEach, expect, test, vi } from 'vitest';

const environment = vi.hoisted(() => ({ localRealClient: false }));
vi.mock('@/app/config/env', () => ({ publicEnv: environment }));

import { onlineEditorProjectPath } from './onlineEditor';

beforeEach(() => { environment.localRealClient = false; });

test.each(['a', 'b'] as const)('opens the exact %s project through the existing managed startup', (owner) => {
  const url = new URL(onlineEditorProjectPath(owner, 622), 'https://rinspace.com');
  expect(url.pathname).toBe('/editor/');
  expect(Object.fromEntries(url.searchParams)).toEqual({ mode: 'managed', owner, repository: '622' });
  expect(url.hash).toBe('');
});

test('local real clients use the official editor, not a missing local editor route', () => {
  environment.localRealClient = true;
  expect(onlineEditorProjectPath('b', 621)).toBe('https://rinspace.com/editor/?mode=managed&owner=b&repository=621');
});

test('repository text cannot inject another query, origin or fragment', () => {
  const repository = '622&owner=outside#token';
  const url = new URL(onlineEditorProjectPath('a', repository), 'https://rinspace.com');
  expect(url.origin).toBe('https://rinspace.com');
  expect(url.searchParams.getAll('owner')).toEqual(['a']);
  expect(url.searchParams.get('repository')).toBe(repository);
  expect(url.hash).toBe('');
});
