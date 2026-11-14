import { requestJson } from '@/services/httpClient';
import { LEARNING_ROOT, validateLearningResponse, type LearningCommand, type LearningSession } from './learningProtocol';
import type { ReaderDocument } from './types';
import { MAX_TTS_GENERATED_SAMPLES, type VoiceStart } from './voiceProtocol';

export type NarrationSource = NonNullable<VoiceStart['source']> & { lessonResultHash: string };
export type PlaybackScope = { playbackId: string; voiceOperationId: string; sessionId: string; generation: number; mediaEpoch: number; lessonResultHash: string };
export type VoicePlaybackResult = {
  session: LearningSession;
  playback: Omit<PlaybackScope, 'sessionId'> & { controllerId: string; fence: number; offeredSamples: number; receivedSamples: number; playedSamples: number; next: number; contentAllowed: boolean };
  state: 'unknown' | 'completed' | 'cancelled' | 'limit' | 'failed';
  contentAvailable: boolean; chunks: { sequence: number; pcm16Base64: string }[]; next: number; hasMore: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const natural = (value: number, max: number) => Number.isSafeInteger(value) && value >= 0 && value <= max;
function invalid(): never { throw new Error('朗读数据无效，请重试。'); }

export function validateVoicePlayback(value: VoicePlaybackResult | undefined, document: ReaderDocument, scope: PlaybackScope, after: number, metadataOnly = false): VoicePlaybackResult {
  if (!value || !uuid.test(scope.playbackId) || !uuid.test(scope.voiceOperationId) || !uuid.test(scope.sessionId) || !/^[0-9a-f]{64}$/.test(scope.lessonResultHash)) invalid();
  validateLearningResponse({ session: value.session, eventSequence: 0, replayed: false }, document, scope.sessionId);
  const p = value.playback;
  if (!p || p.playbackId !== scope.playbackId || p.voiceOperationId !== scope.voiceOperationId || p.generation !== scope.generation || p.mediaEpoch !== scope.mediaEpoch || p.lessonResultHash !== scope.lessonResultHash ||
      !uuid.test(p.controllerId) || !natural(p.fence, Number.MAX_SAFE_INTEGER) || p.fence < 1 || typeof p.contentAllowed !== 'boolean' ||
      !natural(p.offeredSamples, MAX_TTS_GENERATED_SAMPLES) || !natural(p.receivedSamples, p.offeredSamples) || !natural(p.playedSamples, p.receivedSamples) || !natural(p.next, 256) ||
      !['unknown', 'completed', 'cancelled', 'limit', 'failed'].includes(value.state) || typeof value.contentAvailable !== 'boolean' || typeof value.hasMore !== 'boolean' ||
      !Array.isArray(value.chunks) || !natural(after, 256) || !metadataOnly && value.next !== after + value.chunks.length || !natural(value.next, 256) || value.next > p.next ||
      value.hasMore && !value.chunks.length || !value.contentAvailable && value.chunks.length || metadataOnly && (value.chunks.length || value.contentAvailable)) invalid();
  if (!metadataOnly && (!p.contentAllowed || value.session.status === 'deleted' || value.session.generation !== scope.generation || value.session.mediaEpoch !== scope.mediaEpoch ||
      value.session.controller.controllerId !== p.controllerId || value.session.controller.fence !== p.fence)) throw new Error('这段朗读已停止。');
  for (const [index, chunk] of value.chunks.entries()) {
    if (!chunk || chunk.sequence !== after + index || typeof chunk.pcm16Base64 !== 'string' || !chunk.pcm16Base64 || chunk.pcm16Base64.length > 3840000 || chunk.pcm16Base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk.pcm16Base64)) invalid();
    const bytes = atob(chunk.pcm16Base64); if (!bytes.length || bytes.length % 2) invalid();
  }
  return value;
}

type PlaybackStart = LearningCommand & { playbackId: string; voiceOperationId: string; generation: number; mediaEpoch: number };
type PlaybackPoll = LearningCommand & { after: number };
type PlaybackAck = { documentVersion: string; receivedSamples: number; playedSamples: number };

export function voicePlaybackApi(document: ReaderDocument, active: () => void) {
  return async (scope: PlaybackScope, action: 'prepare' | 'poll' | 'ack', body: PlaybackStart | PlaybackPoll | PlaybackAck, signal: AbortSignal, after: number): Promise<VoicePlaybackResult> => {
    active(); signal.throwIfAborted();
    if (!uuid.test(scope.playbackId) || !uuid.test(scope.voiceOperationId) || !uuid.test(scope.sessionId) || body.documentVersion !== document.contentVersion ||
      action === 'prepare' && (!('playbackId' in body) || body.playbackId !== scope.playbackId || body.voiceOperationId !== scope.voiceOperationId || body.generation !== scope.generation || body.mediaEpoch !== scope.mediaEpoch) ||
      action === 'poll' && (!('after' in body) || body.after !== after) ||
      action === 'ack' && (!('receivedSamples' in body) || !natural(body.receivedSamples, MAX_TTS_GENERATED_SAMPLES) || !natural(body.playedSamples, body.receivedSamples))) invalid();
    const path = `${LEARNING_ROOT}/sessions/${scope.sessionId}/voice/playbacks${action === 'prepare' ? '' : `/${scope.playbackId}/${action}`}`;
    const result = await requestJson<VoicePlaybackResult>(path, { auth: 'required', method: 'POST', body, signal });
    active(); signal.throwIfAborted();
    return validateVoicePlayback(result, document, scope, after, action !== 'poll');
  };
}
