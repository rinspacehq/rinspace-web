import { expect, test } from 'vitest';
import { canLoadPublicBookFeatures, isPrivatePublication } from './contentPublicFeatures';

test('private and draft books do not request public-only social projections', () => {
  for (const repositoryStatus of ['private', 'draft']) {
    expect(canLoadPublicBookFeatures({ type: 'book', repositoryStatus })).toBe(false);
    expect(isPrivatePublication({ repositoryStatus })).toBe(true);
  }
  expect(canLoadPublicBookFeatures(null)).toBe(false);
});

test('private repository source does not hide a published public book', () => {
  expect(canLoadPublicBookFeatures({ type: 'book', repositoryStatus: 'published', sourceVisibility: 'private' })).toBe(true);
  expect(canLoadPublicBookFeatures({ type: 'book' })).toBe(true);
  expect(canLoadPublicBookFeatures({ type: 'blog', repositoryStatus: 'published' })).toBe(false);
});
