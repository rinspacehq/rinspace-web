import { expect, test, vi } from 'vitest';
import { createVoiceTranscriptCommit } from './voiceTranscript';

test('persists the corrected transcript before releasing native content', async () => {
  const events: string[] = [];
  const commit = createVoiceTranscriptCommit({
    currentDraft: () => 'Earlier question.',
    persistDraft: async draft => { events.push(`persist:${draft}`); },
    releaseTranscript: async () => { events.push('release'); },
    active: vi.fn(),
  });

  await expect(commit('  两个非零向量。  ')).resolves.toBe('Earlier question.\n两个非零向量。');
  expect(events).toEqual(['persist:Earlier question.\n两个非零向量。', 'release']);
});

test('a lost native release acknowledgement still returns the durable draft once', async () => {
  const persistDraft = vi.fn(async () => {});
  const releaseTranscript = vi.fn(async () => { throw new Error('lost acknowledgement'); });
  const commit = createVoiceTranscriptCommit({ currentDraft: () => 'Existing', persistDraft, releaseTranscript, active: vi.fn() });

  await expect(commit('线性映射')).resolves.toBe('Existing\n线性映射');
  expect(persistDraft).toHaveBeenCalledTimes(1);
  expect(releaseTranscript).toHaveBeenCalledOnce();
});

test('a failed local save retries the frozen draft before any native release', async () => {
  const persistDraft = vi.fn()
    .mockRejectedValueOnce(new Error('storage full'))
    .mockResolvedValueOnce(undefined);
  const releaseTranscript = vi.fn(async () => {});
  const commit = createVoiceTranscriptCommit({ currentDraft: () => '', persistDraft, releaseTranscript, active: vi.fn() });

  await expect(commit('核空间')).rejects.toThrow('storage full');
  expect(releaseTranscript).not.toHaveBeenCalled();
  await expect(commit('核空间')).resolves.toBe('核空间');
  expect(persistDraft).toHaveBeenNthCalledWith(1, '核空间');
  expect(persistDraft).toHaveBeenNthCalledWith(2, '核空间');
  expect(releaseTranscript).toHaveBeenCalledOnce();
});

test('does not replace a transcript once its commit has started', async () => {
  const persistDraft = vi.fn(async () => { throw new Error('retry'); });
  const commit = createVoiceTranscriptCommit({
    currentDraft: () => '',
    persistDraft,
    releaseTranscript: vi.fn(async () => {}),
    active: vi.fn(),
  });
  await expect(commit('像空间')).rejects.toThrow('retry');
  await expect(commit('核空间')).rejects.toThrow('请先完成确认');
});
