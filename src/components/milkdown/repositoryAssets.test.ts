import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import {
  MilkdownRepositoryAssetHost,
  repositoryAssetUrl,
} from './repositoryAssets';

let objectUrlSequence = 0;
let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

beforeEach(() => {
  objectUrlSequence = 0;
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => `blob:rin-test-${++objectUrlSequence}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  if (originalCreateObjectURL) {
    URL.createObjectURL = originalCreateObjectURL;
  } else {
    delete (URL as Partial<typeof URL>).createObjectURL;
  }
  if (originalRevokeObjectURL) {
    URL.revokeObjectURL = originalRevokeObjectURL;
  } else {
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  }
});

function testImageFile(bytes: number[]) {
  const content = new Uint8Array(bytes).buffer;
  return {
    size: content.byteLength,
    type: 'image/png',
    arrayBuffer: () => Promise.resolve(content),
  } as File;
}

test('builds exact-commit repository URLs for Markdown articles and books', () => {
  const active = 'a'.repeat(40);
  const pending = 'b'.repeat(40);
  expect(repositoryAssetUrl({
    id: '42',
    type: 'blog',
    repositorySource: { commit: active, entrypoint: 'content.md', url: '/repos/a/42/raw/commit/' + active + '/content.md' },
  }, 'assets/images/example.png')).toBe(`/repos/a/42/raw/commit/${active}/assets/images/example.png#rin-repository-path=assets%2Fimages%2Fexample.png`);

  expect(repositoryAssetUrl({
    id: '73',
    type: 'book',
    pendingCommit: pending,
    repositorySource: { commit: active, entrypoint: 'main.md', url: '/repos/b/73/raw/commit/' + active + '/main.md' },
  }, 'assets/quiver/example.svg')).toBe(`/repos/b/73/raw/commit/${pending}/assets/quiver/example.svg#rin-repository-path=assets%2Fquiver%2Fexample.svg`);
});

test('keeps existing preview mappings when the same image is staged again', async () => {
  const host = new MilkdownRepositoryAssetHost('repository-assets-test-duplicate');
  await host.ready();

  const image = testImageFile([1, 2, 3, 4]);
  const first = await host.stageImage(image);
  const second = await host.stageImage(image);

  expect(second.previewUrl).toBe(first.previewUrl);
  expect(host.serializeMarkdown(`![one](${first.previewUrl}) ![two](${second.previewUrl})`))
    .toBe(`![one](${first.repositoryPath}) ![two](${second.repositoryPath})`);

  host.dispose();
});

test('clears committed repository files while retaining pending Quiver drafts', async () => {
  const host = new MilkdownRepositoryAssetHost('repository-assets-test-clear');
  await host.ready();

  const image = testImageFile([5, 6, 7, 8]);
  const staged = await host.stageImage(image);
  await host.stagePendingQuiver('\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}', 'assets/quiver/qv_example.svg');

  expect(await host.collectRepositoryFiles()).toHaveLength(2);
  await host.clearPersistedRepositoryFiles();

  const remaining = await host.collectRepositoryFiles();
  expect(remaining.map((file) => file.path)).toEqual(['assets/quiver/qv_example.pending.tikzcd']);
  expect(host.hasPendingQuiver()).toBe(true);
  expect(host.serializeMarkdown(`![kept](${staged.previewUrl})`)).toBe(`![kept](${staged.repositoryPath})`);

  host.dispose();
});

test('ignores orphaned pending Quiver drafts when publishing Markdown', async () => {
  const host = new MilkdownRepositoryAssetHost('repository-assets-test-orphan-pending');
  await host.ready();

  await host.stagePendingQuiver(
    '\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}',
    'assets/quiver/orphaned.svg',
  );

  expect(host.hasPendingQuiver()).toBe(true);
  expect(host.hasPendingQuiver('# Article\n\nNo diagram is referenced.')).toBe(false);
  expect(await host.collectRepositoryFiles('# Article\n\nNo diagram is referenced.')).toEqual([]);

  const referenced = '# Article\n\n![Quiver diagram](assets/quiver/orphaned.svg)';
  expect(host.hasPendingQuiver(referenced)).toBe(true);
  expect((await host.collectRepositoryFiles(referenced)).map((file) => file.path))
    .toEqual(['assets/quiver/orphaned.pending.tikzcd']);

  host.dispose();
});
