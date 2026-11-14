import { expect, test } from 'vitest';
import { validateVoicePlayback, type PlaybackScope, type VoicePlaybackResult } from './voicePlaybackProtocol';
import type { ReaderDocument } from './types';

const document = { id: '71000000-0000-4000-8000-000000000001', title: 'Synthetic.pdf', size: 1, lastModified: 0, contentVersion: 'pdf-tree-v1:' + 'a'.repeat(64) } as ReaderDocument;
const scope: PlaybackScope = { playbackId: '71000000-0000-4000-8000-000000000002', voiceOperationId: '71000000-0000-4000-8000-000000000003',
  sessionId: '71000000-0000-4000-8000-000000000004', generation: 2, mediaEpoch: 3, lessonResultHash: 'b'.repeat(64) };
const valid = (): VoicePlaybackResult => ({ session: { sessionId: scope.sessionId, documentId: document.id, documentVersion: document.contentVersion!, profileDigest: 'c'.repeat(64), revision: 4,
  generation: 2, mediaEpoch: 3, status: 'ready', controller: { controllerId: '71000000-0000-4000-8000-000000000005', fence: 6, expiresAt: '2099-01-01T00:00:00Z' } },
  playback: { playbackId: scope.playbackId, voiceOperationId: scope.voiceOperationId, generation: 2, mediaEpoch: 3, controllerId: '71000000-0000-4000-8000-000000000005', fence: 6,
    lessonResultHash: scope.lessonResultHash, offeredSamples: 2, receivedSamples: 0, playedSamples: 0, next: 1, contentAllowed: true },
  state: 'completed', contentAvailable: true, chunks: [{ sequence: 0, pcm16Base64: 'AAA=' }], next: 1, hasMore: false });

test('playback validation binds session, renderer result, epoch and sample counters', () => {
  expect(validateVoicePlayback(valid(), document, scope, 0).chunks).toHaveLength(1);
  for (const mutate of [
    (value: VoicePlaybackResult) => { value.playback.lessonResultHash = 'd'.repeat(64); },
    (value: VoicePlaybackResult) => { value.session.mediaEpoch++; },
    (value: VoicePlaybackResult) => { value.playback.playedSamples = 1; },
    (value: VoicePlaybackResult) => { value.chunks[0].sequence = 1; },
    (value: VoicePlaybackResult) => { value.chunks[0].pcm16Base64 = 'YQ=='; },
  ]) {
    const value = valid(); mutate(value); expect(() => validateVoicePlayback(value, document, scope, 0)).toThrow();
  }
});

test('metadata acknowledgements carry no audio and may confirm a stopped player', () => {
  const value = valid(); value.session.mediaEpoch++; value.playback.contentAllowed = false; value.contentAvailable = false; value.chunks = [];
  value.next = 0;
  value.playback.receivedSamples = 2; value.playback.playedSamples = 1;
  expect(validateVoicePlayback(value, document, scope, 0, true).playback.playedSamples).toBe(1);
  expect(() => validateVoicePlayback(value, document, scope, 0)).toThrow('已停止');
});
