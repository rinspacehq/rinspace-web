import { requestJson } from '@/services/httpClient';
import { LEARNING_ROOT, validateLearningResponse, type LearningCommand, type LearningSession } from './learningProtocol';
import type { ReaderDocument } from './types';

export type VoiceScope = { operationId: string; sessionId: string; generation: number; mediaEpoch: number; kind: 'stt' | 'tts' };
export type VoiceUsage = { inputSamples: number; generatedSamples: number; bufferedSamples: number; sampleRate: number; cpuMilliseconds: number; wallMilliseconds: number };
export type VoiceResult = Omit<VoiceScope, 'sessionId'> & {
  session: LearningSession; state: 'unknown' | 'completed' | 'cancelled' | 'limit' | 'failed'; contentAvailable: boolean;
  chunks: { sequence: number; pcm16Base64: string }[]; next: number; hasMore: boolean; transcript: string | null; usage: VoiceUsage | null;
};
export type VoiceStart = LearningCommand & { operationId: string; generation: number; mediaEpoch: number; kind: 'stt' | 'tts';
  pcm16Base64?: string; source?: { operationId: string; stepId: string; narrationIndex: number } };

export const VOICE_OUTPUT_SAMPLE_RATE = 44_100;
export const MAX_TTS_GENERATED_SAMPLES = 120 * VOICE_OUTPUT_SAMPLE_RATE;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const nonnegative = (value: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
function invalid(): never { throw new Error('语音数据无效，请重试。'); }

export function validateVoiceResult(value: VoiceResult | undefined, document: ReaderDocument, scope: VoiceScope, after: number, stopped = false): VoiceResult {
  if (!value || !uuid.test(scope.operationId) || !uuid.test(scope.sessionId) || value.operationId !== scope.operationId || value.kind !== scope.kind ||
      value.generation !== scope.generation || value.mediaEpoch !== scope.mediaEpoch || typeof value.contentAvailable !== 'boolean' ||
      !['unknown', 'completed', 'cancelled', 'limit', 'failed'].includes(value.state) || !Array.isArray(value.chunks) ||
      !nonnegative(after, 256) || value.next !== after + value.chunks.length || !nonnegative(value.next, 256) ||
      typeof value.hasMore !== 'boolean' || value.hasMore && !value.chunks.length ||
      !value.contentAvailable && (value.chunks.length > 0 || value.transcript !== null) ||
      (value.state === 'unknown') !== (value.usage === null) ||
      value.usage !== null && (typeof value.usage !== 'object' || !value.usage || Array.isArray(value.usage))) invalid();
  validateLearningResponse({ session: value.session, eventSequence: 0, replayed: false }, document, scope.sessionId);
  if (value.session.status === 'deleted' || value.session.generation !== scope.generation || value.session.mediaEpoch !== scope.mediaEpoch) {
    if (!stopped || value.contentAvailable || value.transcript !== null || value.chunks.length) throw new Error('这段语音已停止。');
  }
  if (value.transcript !== null && (scope.kind !== 'stt' || value.state !== 'completed' || typeof value.transcript !== 'string' ||
    new TextEncoder().encode(value.transcript).length > 32768 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.transcript))) invalid();
  for (const [index, chunk] of value.chunks.entries()) {
    if (!chunk || scope.kind !== 'tts' || chunk.sequence !== after + index || typeof chunk.pcm16Base64 !== 'string' ||
      !chunk.pcm16Base64 || chunk.pcm16Base64.length > 3840000 || chunk.pcm16Base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk.pcm16Base64)) invalid();
    const bytes = atob(chunk.pcm16Base64);
    if (!bytes.length || bytes.length % 2 !== 0) invalid();
  }
  const usage = value.usage;
  if (usage) {
    if (Object.keys(usage).length !== 6 || !nonnegative(usage.inputSamples, 480000) || !nonnegative(usage.generatedSamples, MAX_TTS_GENERATED_SAMPLES) ||
      !nonnegative(usage.bufferedSamples, usage.generatedSamples) || !nonnegative(usage.cpuMilliseconds) || !nonnegative(usage.wallMilliseconds) ||
      scope.kind === 'stt' && (usage.sampleRate !== 16000 || usage.generatedSamples !== 0) ||
      scope.kind === 'tts' && (usage.sampleRate !== VOICE_OUTPUT_SAMPLE_RATE || usage.inputSamples !== 0)) invalid();
  }
  return value;
}

/** Encode only an in-flight bounded utterance; never put this in Reader state. */
export function voicePCMBase64(pcm: Uint8Array): string {
  if (!pcm.length || pcm.length > 960000 || pcm.length % 2) throw new Error('请将语音分成较短的句子。');
  let binary = '';
  for (let offset = 0; offset < pcm.length; offset += 32768) binary += String.fromCharCode(...pcm.subarray(offset, offset + 32768));
  return btoa(binary);
}

export function voiceApi(document: ReaderDocument, active: () => void) {
  return async (scope: VoiceScope, body: VoiceStart | LearningCommand & { after: number }, signal: AbortSignal, after?: number, stopped = false) => {
    active(); signal.throwIfAborted();
    if (!uuid.test(scope.operationId) || !uuid.test(scope.sessionId)) invalid();
    if (body.documentVersion !== document.contentVersion || !uuid.test(body.controllerId) || !nonnegative(body.fence) || body.fence < 1 || !nonnegative(body.expectedRevision) || body.expectedRevision < 1 ||
      after === undefined && (!('operationId' in body) || body.operationId !== scope.operationId || body.generation !== scope.generation || body.mediaEpoch !== scope.mediaEpoch || body.kind !== scope.kind)) invalid();
    const path = `${LEARNING_ROOT}/sessions/${scope.sessionId}/voice/operations${after === undefined ? '' : `/${scope.operationId}/poll`}`;
    const result = await requestJson<VoiceResult>(path, { auth: 'required', method: 'POST', body, signal });
    active(); signal.throwIfAborted();
    return validateVoiceResult(result, document, scope, after || 0, stopped);
  };
}

export async function consumeVoiceTranscript(document: ReaderDocument, scope: VoiceScope, active: () => void): Promise<VoiceResult> {
  active();
  if (scope.kind !== 'stt' || !uuid.test(scope.sessionId) || !uuid.test(scope.operationId)) invalid();
  const result = await requestJson<VoiceResult>(`${LEARNING_ROOT}/sessions/${scope.sessionId}/voice/operations/${scope.operationId}/consume`, {
    auth: 'required', method: 'POST', body: { documentVersion: document.contentVersion }, signal: AbortSignal.timeout(5000),
  });
  active();
  const checked = validateVoiceResult(result, document, scope, 0, true);
  if (checked.contentAvailable || checked.transcript !== null || checked.chunks.length) invalid();
  return checked;
}
