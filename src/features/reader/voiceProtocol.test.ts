import { expect, test } from 'vitest';
import { validateVoiceResult, voicePCMBase64, type VoiceResult, type VoiceScope } from './voiceProtocol';
import type { ReaderDocument } from './types';

const document: ReaderDocument = { id: '10000000-0000-4000-8000-000000000001', contentVersion: 'pdf-tree-v1:' + 'a'.repeat(64), title: 'Synthetic voice fixture.pdf', size: 10, lastModified: 0 };
const scope: VoiceScope = { operationId: '20000000-0000-4000-8000-000000000001', sessionId: '30000000-0000-4000-8000-000000000001', generation: 1, mediaEpoch: 1, kind: 'stt' };
function fixture(): VoiceResult {
  return { operationId: scope.operationId, generation: 1, mediaEpoch: 1, kind: 'stt', state: 'completed', contentAvailable: true, chunks: [], next: 0, hasMore: false,
    transcript: '两个非零向量不一定线性无关。', usage: { inputSamples: 16000, generatedSamples: 0, bufferedSamples: 0, sampleRate: 16000, cpuMilliseconds: 500, wallMilliseconds: 600 },
    session: { sessionId: scope.sessionId, documentId: document.id, documentVersion: document.contentVersion, profileDigest: 'b'.repeat(64), revision: 1, generation: 1, mediaEpoch: 1, status: 'ready',
      controller: { controllerId: '40000000-0000-4000-8000-000000000001', fence: 1, expiresAt: '2026-11-13T13:30:00Z' } } };
}

test('accepts scoped final transcription without treating generation as playback', () => {
  const result = validateVoiceResult(fixture(), document, scope, 0);
  expect(result.transcript).toContain('非零');
  expect(result.usage?.generatedSamples).toBe(0);
  const pending = fixture(); pending.state = 'unknown'; pending.transcript = null; pending.usage = null;
  expect(validateVoiceResult(pending, document, scope, 0).state).toBe('unknown');
});

test('rejects different documents, operations and obsolete media before using transcription', () => {
  const changes: ((value: VoiceResult) => void)[] = [
    value => { value.operationId = document.id; }, value => { value.session.documentVersion += 'a'; },
    value => { value.session.sessionId = scope.operationId; }, value => { value.mediaEpoch = 2; },
    value => { value.generation = 2; }, value => { value.session.mediaEpoch = 2; },
    value => { value.session.generation = 2; }, value => { value.session.status = 'deleted'; },
    value => { value.contentAvailable = false; }, value => { value.transcript = '\u0000bad'; },
  ];
  for (const change of changes) { const value = fixture(); change(value); expect(() => validateVoiceResult(value, document, scope, 0)).toThrow(); }
});

test('rejects missing compute measurements, extra audio and invalid sample counts', () => {
  const changes: ((value: VoiceResult) => void)[] = [
    value => { Reflect.deleteProperty(value.usage!, 'cpuMilliseconds'); },
    value => { Reflect.set(value, 'usage', undefined); }, value => { Reflect.set(value.usage!, 'wallMilliseconds', null); },
    value => { value.usage!.inputSamples = 480001; }, value => { value.usage!.generatedSamples = 1; },
    value => { value.chunks = [{ sequence: 0, pcm16Base64: 'AAAA' }]; value.next = 1; },
    value => { value.hasMore = true; }, value => { value.next = 1; },
  ];
  for (const change of changes) { const value = fixture(); change(value); expect(() => validateVoiceResult(value, document, scope, 0)).toThrow('语音数据无效'); }
});

test('encodes all thirty seconds without truncating or overflowing argument lists', () => {
  const pcm = new Uint8Array(960000).fill(7);
  const encoded = voicePCMBase64(pcm);
  expect(atob(encoded).length).toBe(pcm.length);
  expect(atob(encoded).charCodeAt(pcm.length - 1)).toBe(7);
  expect(() => voicePCMBase64(new Uint8Array(960002))).toThrow('分成较短');
  expect(() => voicePCMBase64(new Uint8Array(3))).toThrow('分成较短');
});
