import type { RinDocumentTools, RinReply } from '@rinspacehq/embedpdf-snippet/dist/reader-api';
import { ServiceError } from '@/services/httpClient';
import type { ReaderDocument } from './types';
import { learningApi, learningCommand, type LearningResponse, type LearningSession, type LearningReadingContext, type LearningSource, type LearningLesson, type LearningOperation, type LearningCheckAction } from './learningProtocol';
import { consumeVoiceTranscript, voiceApi, voicePCMBase64, type VoiceResult, type VoiceScope, type VoiceStart } from './voiceProtocol';
import { voicePlaybackApi, type NarrationSource, type PlaybackScope, type VoicePlaybackResult } from './voicePlaybackProtocol';

export type LearningEvidenceBatch = { pages: { id: string; page: number; text: string; kind: 'text' | 'text-unavailable' }[]; complete: boolean; continuation?: string };
type LearningRegion = { id: string; documentVersion: string; page: number; text: string; digest: string; complete: true; kind: 'region-transcription';
  region: { x: number; y: number; width: number; height: number }; imageDigest: string; confirmation: 'user' };
type LearningTools = RinDocumentTools & { readEvidence?(pages: number[], continuation?: string): Promise<LearningEvidenceBatch>; regions?(): LearningRegion[] };
export type LearningReply = RinReply & { lesson: LearningLesson };
type EvidenceSubmission = { commandId: string; operationId: string; results: { id: string; output: LearningEvidenceBatch }[] };
type PendingQuestion = { commandId: string; message: string; action?: LearningCheckAction; source: LearningSource; advanceCommandId: string; operationId?: string; questionId?: string;
  evidence?: EvidenceSubmission; pages: number[]; reply?: LearningReply; delivered?: boolean; aborted?: boolean; failed?: boolean };
export type LearningState = { openingRequestId: string; session?: LearningSession; readingContext?: LearningReadingContext; pending?: PendingQuestion; stopRequest?: Record<string, unknown>;
	mediaRequest?: Record<string, unknown>;
	voiceConsumption?: VoiceScope;
  voiceNarrations?: { source: NarrationSource; scope: VoiceScope; request: VoiceStart }[];
  voicePlaybackAcks?: { scope: PlaybackScope; received: number; played: number }[];
  voiceResume?: NarrationSource;
  deleteRequest?: { commandId: string; documentVersion: string; expectedRevision: number };
  evidencePages?: Record<string, number>; exhaustedHints?: string[] };

type Options = { document: ReaderDocument; accountId: string; state: LearningState; assertActive(): void; persist(): Promise<void>; available(): boolean;
  reload?(): Promise<LearningState | undefined> };
const failureMessages: Record<string, string> = { MODEL_REQUEST_EXPIRED: '上次请求未发送成功，请重新提问。', MODEL_OUTPUT_INVALID: '这次回答未通过校验，请重试。', MODEL_REQUEST_FAILED: '模型请求失败，请重试。' };

export type LearningVoiceInput = { signal: AbortSignal; transcribe(id: string, pcm: Uint8Array): Promise<string>; cancel(): Promise<void>; release(): Promise<void> };
export type LearningVoicePlayback = { signal: AbortSignal; start(source: NarrationSource, regenerate: boolean): Promise<PlaybackScope>;
  poll(scope: PlaybackScope, after: number): Promise<VoicePlaybackResult>; acknowledge(scope: PlaybackScope, received: number, played: number): Promise<VoicePlaybackResult>; cancel(): Promise<void> };

function wait(signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function retryableVoiceTransport(error: unknown) {
  return error instanceof ServiceError
    ? [502, 503, 504].includes(error.status) || error.status === 429 && error.code === 'VOICE_BUSY'
    : error instanceof TypeError;
}

function voiceRetryDelay(error: unknown) {
  // A busy native slot is expected admission pressure, not a broken network.
  // Poll it slowly so a second session cannot create request churn while the
  // two-core worker finishes the already accepted operation.
  return error instanceof ServiceError && error.status === 429 && error.code === 'VOICE_BUSY' ? 1000 : 300;
}

/** The existing document host selects this protocol for its one send loop.
 * The driver contains no prompt, model transcript, pricing or second AI agent. */
export function learningSessionDriver(options: Options) {
  const { document, state } = options;
  let disposed = false, busy = false;
  let stopping: Promise<void> | undefined;
  let interruptingMedia: Promise<void> | undefined;
  let voiceBusy = false;
  let heldScope: { borrowers: number; wake?: () => void } | undefined;
  // Without Web Locks use an instance-only ID: copying a tab must never copy a
  // live controller's identity. Modern supported browsers use a tab-local ID
  // under an exclusive Web Lock so refresh can renew its existing lease.
  let controllerId: string = crypto.randomUUID();
  const active = () => { if (disposed) throw new Error('阅读会话已关闭。'); options.assertActive(); };
  const api = learningApi(document, active);
  const voice = voiceApi(document, active);
  const playbackApi = voicePlaybackApi(document, active);
  const persist = async () => { active(); await options.persist(); active(); };
  const take = async (response: LearningResponse) => {
    active();
    const current = state.session;
    if (current && (response.session.revision < current.revision || response.session.controller.fence < current.controller.fence)) return;
    if (current && response.session.revision === current.revision && response.session.controller.fence === current.controller.fence &&
      Date.parse(response.session.controller.expiresAt) < Date.parse(current.controller.expiresAt)) response.session.controller = current.controller;
    state.session = response.session; state.readingContext = response.readingContext;
    if (response.session.status === 'deleted') {
      state.pending = undefined; state.readingContext = undefined; state.evidencePages = undefined;
      state.stopRequest = undefined; state.exhaustedHints = undefined;
      state.mediaRequest = undefined; state.voiceConsumption = undefined;
      state.voiceNarrations = undefined; state.voiceResume = undefined;
    }
    await persist();
  };
  const ensureSession = async (signal?: AbortSignal, allowDeleted = false) => {
    await take(state.session
      ? await api(`sessions/${state.session.sessionId}`, undefined, signal)
      : await api('sessions', { requestId: state.openingRequestId, documentId: document.id, documentVersion: document.contentVersion }, signal));
    if (state.session!.status === 'deleted' && !allowDeleted) throw new Error('这段学习记录已删除。');
  };
  const lease = async (signal?: AbortSignal) => {
    await take(await api(`sessions/${state.session!.sessionId}/commands`, { commandId: crypto.randomUUID(), kind: 'lease',
      documentVersion: document.contentVersion, controllerId, expectedRevision: state.session!.revision }, signal));
    learningCommand(state.session!, controllerId);
  };
  const command = () => learningCommand(state.session!, controllerId);
  const underLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    // The host's microphone and text loop may share THEIR existing controller;
    // a different driver/tab must still acquire the actual browser Web Lock.
    if (heldScope) {
      const scope = heldScope; scope.borrowers++;
      try { return await operation(); } finally { scope.borrowers--; scope.wake?.(); }
    }
    const lockName = `rinspace.reader.learning:${options.accountId}:${document.id}:${document.contentVersion}`;
    if (!navigator.locks) return operation();
    return navigator.locks.request(lockName, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('另一个页面正在使用琳。');
      try {
        const key = `${lockName}:controller`;
        controllerId = sessionStorage.getItem(key) || controllerId;
        sessionStorage.setItem(key, controllerId);
      } catch { /* An instance-only ID remains safe in restricted storage. */ }
      const scope: { borrowers: number; wake?: () => void } = { borrowers: 0 };
      heldScope = scope;
      try { return await operation(); }
      finally {
        while (scope.borrowers) await new Promise<void>(resolve => { scope.wake = resolve; });
        if (heldScope === scope) heldScope = undefined;
      }
    });
  };

  const takeVoice = (result: VoiceResult) => take({ session: result.session, eventSequence: 0, replayed: false,
    readingContext: result.session.status === 'deleted' ? undefined : state.readingContext });

  const releaseTranscript = async () => {
    if (!state.voiceConsumption) return;
    await takeVoice(await consumeVoiceTranscript(document, state.voiceConsumption, active));
    state.voiceConsumption = undefined; await persist();
  };
  const flushPlaybackAcks = async () => {
    for (const pending of [...(state.voicePlaybackAcks || [])]) {
      const result = await playbackApi(pending.scope, 'ack', { documentVersion: document.contentVersion!, receivedSamples: pending.received, playedSamples: pending.played }, AbortSignal.timeout(5000), 0);
      await take({ session: result.session, eventSequence: 0, replayed: false, readingContext: state.readingContext });
      state.voicePlaybackAcks = state.voicePlaybackAcks?.filter(item => item.scope.playbackId !== pending.scope.playbackId || item.received > pending.received || item.played > pending.played);
      await persist();
    }
  };

  const performMediaInterrupt = async () => {
    active();
    if (!state.session) return;
    await ensureSession(undefined, true);
    if (state.session.status === 'deleted') return;
    if (!state.mediaRequest) {
      await lease();
      state.mediaRequest = { ...command(), commandId: crypto.randomUUID(), kind: 'playback' };
      await persist();
    }
    for (let attempt = 0; ; attempt++) {
      try { await take(await api(`sessions/${state.session.sessionId}/commands`, state.mediaRequest)); break; }
      catch (error) {
        if (!(error instanceof ServiceError) || error.code !== 'VERSION_CONFLICT' || attempt >= 2) throw error;
        await ensureSession(undefined, true); if ((state.session as LearningSession).status === 'deleted') break;
        await lease(); state.mediaRequest = { ...command(), commandId: crypto.randomUUID(), kind: 'playback' }; await persist();
      }
    }
    state.mediaRequest = undefined; await persist();
  };
  const interruptMedia = () => interruptingMedia ||= performMediaInterrupt().finally(() => { interruptingMedia = undefined; });

  const stop = async () => {
    active();
    if (state.deleteRequest) throw new Error('请先确认学习记录的删除结果。');
    if (!state.session) return;
    await ensureSession(undefined, true);
    if (state.session.status === 'deleted') return;
    if (!state.stopRequest) {
      await lease();
      state.stopRequest = { ...command(), commandId: crypto.randomUUID(), kind: 'stop' };
      await persist();
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await take(await api(`sessions/${state.session.sessionId}/commands`, state.stopRequest));
        break;
      } catch (error) {
        // An explicit revision conflict proves this command did not commit.
        // Only then may it be replaced. Lost acknowledgements keep the frozen
        // original command, including its lease fence, for replay.
        if (!(error instanceof ServiceError) || error.code !== 'VERSION_CONFLICT' || attempt >= 2) throw error;
        await ensureSession(undefined, true);
        if ((state.session as LearningSession).status === 'deleted') return;
        await lease();
        state.stopRequest = { ...command(), commandId: crypto.randomUUID(), kind: 'stop' };
        await persist();
      }
    }
    if (state.pending) { state.pending.aborted = true; state.pending.evidence = undefined; }
    state.stopRequest = undefined; await persist();
  };

  return {
    readingContext: () => state.readingContext,
    recoverable: () => !state.deleteRequest && Boolean(state.pending && !state.pending.aborted && !state.pending.delivered && !state.pending.failed),
    delivered() { if (state.pending?.reply) { state.pending.delivered = true; state.pending.evidence = undefined; } },
    async voicePlayback<T>(signal: AbortSignal, operation: (playback: LearningVoicePlayback) => Promise<T>): Promise<T> {
      active(); signal.throwIfAborted();
      if (voiceBusy || !navigator.locks || state.deleteRequest) throw new Error('琳当前无法朗读。');
      voiceBusy = true;
      const revoked = new AbortController(), combined = AbortSignal.any([signal, revoked.signal]);
      try {
        return await underLock(async () => {
          await ensureSession(combined); await lease(combined);
          await flushPlaybackAcks();
          if (state.mediaRequest) await interruptMedia();
          const generation = state.session!.generation, epoch = state.session!.mediaEpoch;
          const guard = () => {
            active(); combined.throwIfAborted();
            if (state.session?.generation !== generation || state.session.mediaEpoch !== epoch || state.session.status === 'deleted') throw new Error('这段朗读已停止。');
          };
          let renewing = false;
          const timer = setInterval(() => {
            if (renewing || combined.aborted || disposed) return;
            renewing = true;
            void ensureSession(combined).then(() => { guard(); return lease(combined); }).catch(error => revoked.abort(error)).finally(() => { renewing = false; });
          }, 10000);
          const takePlayback = (result: VoicePlaybackResult) => take({ session: result.session, eventSequence: 0, replayed: false, readingContext: state.readingContext });
          try {
            return await operation({ signal: combined,
              start: async (source, regenerate) => {
                guard();
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(source.operationId) || !/^[a-z][a-z0-9-]{0,63}$/.test(source.stepId) || !Number.isInteger(source.narrationIndex) || source.narrationIndex < 0 || source.narrationIndex > 15 || !/^[0-9a-f]{64}$/.test(source.lessonResultHash)) throw new Error('朗读来源无效。');
                const same = (item: NonNullable<LearningState['voiceNarrations']>[number]) => item.scope.generation === generation && item.source.operationId === source.operationId && item.source.stepId === source.stepId && item.source.narrationIndex === source.narrationIndex && item.source.lessonResultHash === source.lessonResultHash;
                let saved = state.voiceNarrations?.find(same);
                if (!saved || regenerate) {
                  if (!options.available()) throw new Error('琳当前无法生成新语音。');
                  const id = crypto.randomUUID();
                  saved = { source: { ...source }, scope: { operationId: id, sessionId: state.session!.sessionId, generation, mediaEpoch: epoch, kind: 'tts' },
                    request: { ...command(), operationId: id, generation, mediaEpoch: epoch, kind: 'tts', source: { operationId: source.operationId, stepId: source.stepId, narrationIndex: source.narrationIndex } } };
                  state.voiceNarrations = [...(state.voiceNarrations || []).filter(item => !same(item)), saved]; await persist();
                }
                // Resolve the original accepted generation without creating a
                // replacement on lost acknowledgement. Old completed epochs
                // go straight to a new player and reuse their original cache.
                if (saved.scope.mediaEpoch === epoch) {
                  const deadline = Date.now() + 95000;
                  for (;;) {
                    guard();
                    try { await takeVoice(await voice(saved.scope, saved.request, combined)); break; }
                    catch (error) {
                      if (Date.now() >= deadline || !retryableVoiceTransport(error)) throw error;
                      await wait(combined, voiceRetryDelay(error));
                    }
                  }
                }
                guard();
                const scope: PlaybackScope = { playbackId: crypto.randomUUID(), voiceOperationId: saved.scope.operationId, sessionId: state.session!.sessionId, generation, mediaEpoch: epoch, lessonResultHash: source.lessonResultHash };
                const body = { ...command(), playbackId: scope.playbackId, voiceOperationId: scope.voiceOperationId, generation, mediaEpoch: epoch };
                const deadline = Date.now() + 15000;
                for (;;) {
                  guard();
                  try { await takePlayback(await playbackApi(scope, 'prepare', body, combined, 0)); break; }
                  catch (error) {
                    if (Date.now() >= deadline || !(error instanceof ServiceError ? [502, 503, 504].includes(error.status) : error instanceof TypeError)) throw error;
                    await wait(combined, 300);
                  }
                }
                return scope;
              },
              poll: async (scope, after) => {
                guard();
                const result = await playbackApi(scope, 'poll', { ...command(), after }, combined, after);
                await takePlayback(result); guard(); return result;
              },
              acknowledge: async (scope, received, played) => {
                active();
                const prior = state.voicePlaybackAcks?.find(item => item.scope.playbackId === scope.playbackId);
                state.voicePlaybackAcks = [...(state.voicePlaybackAcks || []).filter(item => item.scope.playbackId !== scope.playbackId), { scope, received: Math.max(prior?.received || 0, received), played: Math.max(prior?.played || 0, played) }];
                await persist();
                const result = await playbackApi(scope, 'ack', { documentVersion: document.contentVersion!, receivedSamples: received, playedSamples: played }, AbortSignal.timeout(5000), 0);
                await takePlayback(result);
                state.voicePlaybackAcks = state.voicePlaybackAcks?.filter(item => item.scope.playbackId !== scope.playbackId || item.received > received || item.played > played);
                await persist(); return result;
              },
              cancel: async () => { if (!disposed) await interruptMedia(); },
            });
          } finally { clearInterval(timer); }
        });
      } finally { voiceBusy = false; }
    },
    async voiceInput<T>(signal: AbortSignal, operation: (input: LearningVoiceInput) => Promise<T>): Promise<T> {
      active(); signal.throwIfAborted();
      if (voiceBusy || !navigator.locks || state.deleteRequest || !options.available()) throw new Error('琳当前无法使用语音。');
      voiceBusy = true;
      const revoked = new AbortController(), combined = AbortSignal.any([signal, revoked.signal]);
      try {
        return await underLock(async () => {
          await ensureSession(combined); await lease(combined);
          if (state.voiceConsumption) await releaseTranscript();
          await flushPlaybackAcks();
          if (state.mediaRequest) await interruptMedia();
          const generation = state.session!.generation, epoch = state.session!.mediaEpoch;
          let submitted: VoiceScope | undefined;
          let renewing = false;
          const guard = () => {
            active(); combined.throwIfAborted();
            if (state.session?.generation !== generation || state.session.mediaEpoch !== epoch || state.session.status === 'deleted') throw new Error('这段语音已停止。');
          };
          const timer = setInterval(() => {
            if (renewing || combined.aborted || disposed) return;
            renewing = true;
            void ensureSession(combined).then(() => { guard(); return lease(combined); }).catch(error => revoked.abort(error)).finally(() => { renewing = false; });
          }, 10000);
          const transcribe = async (id: string, pcm: Uint8Array): Promise<string> => {
            guard();
            await ensureSession(combined); await lease(combined); guard();
            const scope: VoiceScope = { operationId: id, sessionId: state.session!.sessionId, generation, mediaEpoch: epoch, kind: 'stt' };
            const body: VoiceStart = { ...command(), operationId: id, generation, mediaEpoch: epoch, kind: 'stt', pcm16Base64: voicePCMBase64(pcm) };
            const deadline = Date.now() + 95000;
            submitted = scope;
            let result: VoiceResult | undefined;
            // An uncertain acknowledgement retains the exact original body/ID.
            // No PCM/base64/transcript is copied into LearningState or storage.
            while (!result) {
              guard(); if (Date.now() > deadline) throw new Error('语音连接超时，请重试。');
              try { result = await voice(scope, body, combined); }
              catch (error) {
                if (!retryableVoiceTransport(error)) throw error;
                await wait(combined, voiceRetryDelay(error));
              }
            }
            await takeVoice(result);
            while (result.state === 'unknown') {
              guard(); if (Date.now() > deadline) throw new Error('语音识别超时，请重试。');
              await wait(combined, 150);
              try { result = await voice(scope, { ...command(), after: 0 }, combined, 0); }
              catch (error) {
                if (error instanceof ServiceError && error.code === 'VERSION_CONFLICT') { await ensureSession(combined); await lease(combined); continue; }
                if (error instanceof ServiceError && [502, 503, 504].includes(error.status) || error instanceof TypeError) continue;
                throw error;
              }
              await takeVoice(result);
            }
            guard();
            if (result.state !== 'completed' || !result.contentAvailable || result.transcript === null) throw new Error('这次语音未能完成，请重试。');
            return result.transcript;
          };
          try {
            return await operation({ signal: combined, transcribe, release: async () => {
              if (!submitted) return;
              state.voiceConsumption = submitted; await persist();
              await releaseTranscript();
            }, cancel: async () => {
              if (!submitted || disposed) return;
              await interruptMedia();
              const timeout = AbortSignal.timeout(5000);
              const result = await voice(submitted, { ...command(), after: 0 }, timeout, 0, true);
              await takeVoice(result);
            } });
          } finally { clearInterval(timer); }
        });
      } finally { voiceBusy = false; }
    },
    async send(message: string, tools: LearningTools, signal: AbortSignal, action?: LearningCheckAction): Promise<LearningReply> {
      if (busy) throw new Error('当前问题还在处理中。');
      if (!tools.readEvidence) throw new Error('阅读器需要更新，请刷新后重试。');
      action = action ? { ...action } : undefined;
      const sameAction = (value?: LearningCheckAction) => value?.kind === action?.kind && value?.checkId === action?.checkId;
      if (action && (!['attempt','challenge','hint','reveal','skip'].includes(action.kind) || !/^[a-z][a-z0-9-]{0,63}$/.test(action.checkId))) throw new Error('练习操作无效。');
      busy = true;
      const resuming = Boolean(state.pending && !state.pending.aborted && !state.pending.failed && !state.pending.delivered && state.pending.message === message && sameAction(state.pending.action));
      try {
        return await underLock(async () => {
          active(); signal.throwIfAborted();
          if (options.reload) {
            const restored = await options.reload(); active(); signal.throwIfAborted();
            if (restored) {
              for (const key of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[key];
              Object.assign(state, restored);
            }
          }
          await persist();
          if (state.deleteRequest) throw new Error('请先确认学习记录的删除结果。');
          if (state.stopRequest) throw new Error('请先确认上次停止请求。');
          await ensureSession(signal); await lease(signal);
          let leaseError: unknown;
          let renewing = false;
          const timer = setInterval(() => {
            if (renewing || signal.aborted || disposed) return;
            renewing = true;
            void lease(signal).catch(error => {
              if (error instanceof ServiceError && ['CONTROLLER_FENCED', 'CONTROLLER_BUSY', 'CONTENT_DELETED', 'UNAUTHENTICATED'].includes(error.code)) leaseError = error;
            }).finally(() => { renewing = false; });
          }, 10000);
          const guard = () => { active(); signal.throwIfAborted(); if (state.stopRequest || state.pending?.aborted) throw new Error('本次任务已停止。'); if (leaseError) throw leaseError; };
          try {
            let pending = state.pending;
            if (pending && !pending.aborted && !pending.failed && !pending.delivered && (pending.message !== message || !sameAction(pending.action))) throw new Error('请先恢复或停止上次任务。');
            if (pending?.reply && !pending.aborted && !pending.failed && (resuming || !pending.delivered) && pending.message === message && sameAction(pending.action)) {
              for (const page of pending.reply.pages || []) { guard(); await tools.readPages([page]); guard(); }
              return pending.reply;
            }
            if (!pending || pending.aborted || pending.failed || pending.delivered) {
              if (!options.available()) throw new Error('琳当前不可用。');
              if (state.session!.activeOperation) throw new Error('已有未完成的学习任务，请先恢复。');
              const info = tools.info();
              if (info.documentId !== document.id || !Number.isSafeInteger(info.pageCount) || info.pageCount < 1 || !Number.isSafeInteger(info.currentPage) || info.currentPage < 1 || info.currentPage > info.pageCount) throw new Error('当前 PDF 尚未就绪。');
              const selected = (await tools.selection()).filter(page => page.text !== '');
              const regions = tools.regions?.() || [];
              guard();
              const reading = state.readingContext;
              const pages = [...selected.map(page => page.page), ...regions.map(region => region.page)];
              if (!reading || new Set(pages).size > reading.maxPages || new Set(selected.map(page => page.page)).size !== selected.length ||
                selected.some(page => !Number.isSafeInteger(page.page) || page.page < 1 || page.page > info.pageCount) ||
                selected.reduce((count, page) => count + [...page.text].length, 0) + regions.reduce((count, region) => count + [...region.text].length, 0) > reading.maxChars ||
                regions.some(region => region.documentVersion !== document.contentVersion || region.kind !== 'region-transcription' || region.confirmation !== 'user' || !region.complete ||
                  !/^region-[0-9a-f]{64}$/.test(region.id) || !/^[0-9a-f]{64}$/.test(region.digest) || !/^[0-9a-f]{64}$/.test(region.imageDigest) || !region.text ||
                  !Number.isSafeInteger(region.page) || region.page < 1 || region.page > info.pageCount ||
                  ![region.region.x, region.region.y, region.region.width, region.region.height].every(Number.isSafeInteger) || region.region.x < 0 || region.region.y < 0 ||
                  region.region.width < 1 || region.region.height < 1 || region.region.x + region.region.width > 1000000 || region.region.y + region.region.height > 1000000)) {
                throw new Error('选中的原文超过本次读取范围，请缩小选区。');
              }
              const evidence: NonNullable<LearningSource['evidence']> = [];
              for (const selection of selected) {
                const bytes = new TextEncoder().encode(selection.text);
                const hash = await crypto.subtle.digest('SHA-256', bytes);
                guard();
                const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
                const id = `selection-${selection.page}-${digest}`;
                evidence.push({ ...selection, id, documentVersion: document.contentVersion, digest, complete: true });
              }
              evidence.push(...regions.map(region => ({ ...region, region: { ...region.region } })));
              pending = { commandId: crypto.randomUUID(), message, ...(action ? { action: { ...action } } : {}), advanceCommandId: crypto.randomUUID(), pages: [],
                source: { documentVersion: document.contentVersion, documentTitle: info.title, pageCount: info.pageCount, currentPage: info.currentPage,
                  ...(evidence.length ? { evidence } : {}) } };
              state.evidencePages ||= {};
              for (const selection of evidence) state.evidencePages[selection.id] = selection.page;
              state.pending = pending; await persist();
            }
            if (!pending.operationId) {
              let response: LearningResponse;
              try {
                response = await api(`sessions/${state.session!.sessionId}/questions`, { ...command(), commandId: pending.commandId, question: pending.message, source: pending.source, ...(pending.action ? { action: pending.action } : {}) }, signal);
              } catch (error) {
                // An explicit rejection at preparation created no operation.
                // Preserve uncertain network failures for original-key replay.
                if (error instanceof ServiceError && [400,403,413,422].includes(error.status)) { pending.failed = true; await persist(); }
                if (error instanceof ServiceError && error.code === 'CHECK_HINT_UNAVAILABLE') {
                  if (pending.action) state.exhaustedHints = [...new Set([...(state.exhaustedHints || []), pending.action.checkId])];
                  await persist(); throw new Error('这道题没有更多已保存的提示。');
                }
                throw error;
              }
              guard(); await take(response);
              if (!response.operation) throw new Error('学习请求未完成登记。');
              pending.operationId = response.operation.operationId; pending.questionId = response.operation.questionId; await persist();
            }
            for (;;) {
              guard();
              let response: LearningResponse;
              if (pending.evidence) {
                response = await api(`sessions/${state.session!.sessionId}/evidence`, { ...command(), ...pending.evidence }, signal);
                guard(); await take(response);
                if (!response.operation) throw new Error('原文读取结果未完成登记。');
                pending.operationId = response.operation.operationId; pending.evidence = undefined; pending.advanceCommandId = crypto.randomUUID(); await persist();
              }
              response = await api(`sessions/${state.session!.sessionId}/advance`, { ...command(), commandId: pending.advanceCommandId, operationId: pending.operationId }, signal);
              guard(); await take(response);
              const op: LearningOperation | undefined = response.operation;
              if (!op) throw new Error('学习任务状态无效。');
              if (pending.questionId && op.questionId !== pending.questionId) throw new Error('恢复的任务与原问题不匹配。');
              if (op.operationId !== pending.operationId) { pending.operationId = op.operationId; pending.advanceCommandId = crypto.randomUUID(); await persist(); }
              if (op.state === 'deleted' || op.state === 'obsolete') throw new Error('本次任务已停止。');
              if (op.state === 'failed') { pending.failed = true; await persist(); throw new Error(failureMessages[op.problem || ''] || '本次学习请求失败，请重试。'); }
              if (op.lesson) {
                const pages = op.lesson.view.steps.flatMap(step => step.evidenceRefs.map(id => state.evidencePages?.[id])).filter((page): page is number => typeof page === 'number');
                const reply: LearningReply = { text: '', lesson: op.lesson, pages: [...new Set(pages)] };
                pending.reply = reply; await persist(); return reply;
              }
              if (op.commands?.length) {
                const results: EvidenceSubmission['results'] = [];
                for (const call of op.commands) {
                  guard();
                  const output = await tools.readEvidence!(call.arguments.pages, call.arguments.continuation);
                  guard();
                  if (new TextEncoder().encode(JSON.stringify(output)).length > 1024 * 1024) throw new Error('本次原文读取超过会话限制。');
                  state.evidencePages ||= {};
                  for (const page of output.pages) if (page.kind === 'text') { pending.pages.push(page.page); state.evidencePages[page.id] = page.page; }
                  results.push({ id: call.id, output });
                }
                pending.evidence = { commandId: crypto.randomUUID(), operationId: op.operationId, results }; await persist();
                continue;
              }
              await wait(signal, 1000);
            }
          } finally { clearInterval(timer); }
        });
      } finally { busy = false; }
    },
    async stop() {
      if (!stopping) stopping = (busy ? stop() : underLock(stop)).finally(() => { stopping = undefined; });
      return stopping;
    },
    /** Deletes the existing server session only. The host owns confirmation,
     * local transcript removal and the explicit transition to a new conversation. */
    async deleteContent() {
      if (busy || stopping) throw new Error('请先停止当前任务。');
      busy = true;
      try {
        await underLock(async () => {
          active();
          if (options.reload) {
            const restored = await options.reload(); active();
            if (restored) {
              for (const key of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[key];
              Object.assign(state, restored);
            }
          }
          if (!state.session) {
            // Creation may have committed before its acknowledgement was lost.
            // Recover the original opening key; never create a session to delete.
            try {
              await take(await api('sessions/recover', { requestId: state.openingRequestId, documentId: document.id, documentVersion: document.contentVersion }));
            } catch (error) {
              if (error instanceof ServiceError && error.status === 404 && error.code === 'NOT_FOUND') return;
              throw error;
            }
          }
          if (!state.session) throw new Error('学习会话的删除状态尚未确认。');
          if (!state.deleteRequest) {
            await ensureSession(undefined, true);
            if (state.session.status === 'deleted') return;
            state.deleteRequest = { commandId: crypto.randomUUID(), documentVersion: document.contentVersion, expectedRevision: state.session.revision };
            await persist();
          }
          for (let attempt = 0; ; attempt++) {
            try {
              const response = await api(`sessions/${state.session.sessionId}/content`, state.deleteRequest, undefined, 'DELETE');
              if (response.session.status !== 'deleted') throw new Error('学习记录的删除状态尚未确认。');
              await take(response);
              break;
            } catch (error) {
              // A network failure is uncertain: keep the exact persisted body.
              // Only an explicit non-commit conflict allows a fresh command ID.
              if (!(error instanceof ServiceError) || error.code !== 'VERSION_CONFLICT' || attempt >= 2) throw error;
              await ensureSession(undefined, true);
              if ((state.session as LearningSession).status === 'deleted') break;
              state.deleteRequest = { commandId: crypto.randomUUID(), documentVersion: document.contentVersion, expectedRevision: state.session.revision };
              await persist();
            }
          }
          state.deleteRequest = undefined;
          await persist();
        });
      } finally { busy = false; }
    },
    dispose() { disposed = true; },
  };
}
