import { ServiceError } from '@/services/httpClient';
import type { LearningVoicePlayback } from './learningSession';
import type { NarrationSource, PlaybackScope, VoicePlaybackResult } from './voicePlaybackProtocol';
import { VOICE_OUTPUT_SAMPLE_RATE } from './voiceProtocol';

export type ReaderPlaybackState = { state: 'idle' | 'loading' | 'playing' | 'stopping' | 'error'; source?: NarrationSource; resumeSource?: NarrationSource; receivedSamples: number; playedSamples: number; follow: boolean; error?: string; expired?: boolean; cleanupPending?: boolean };
type Options = { accountId: string; active(): void; notify(): void; openAudio(signal: AbortSignal): Promise<AudioContext>;
  resumeSource?: NarrationSource; persistResume?(source: NarrationSource | undefined): Promise<void>;
  run<T>(signal: AbortSignal, operation: (playback: LearningVoicePlayback) => Promise<T>): Promise<T> };
type Segment = { source: NarrationSource; scope: PlaybackScope; received: number; acknowledged: number; played: number; complete: boolean; chunks: { start: number; samples: number; buffer?: AudioBuffer; node?: AudioBufferSourceNode; ended: boolean }[] };

const sameSource = (left: NarrationSource, right: NarrationSource) => left.operationId === right.operationId && left.stepId === right.stepId &&
  left.narrationIndex === right.narrationIndex && left.lessonResultHash === right.lessonResultHash;

function delay(signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Native speech generation is original-key durable. Audio buffers live only
 * here, in the existing Web host, and use its single AudioContext across PiP. */
export function createReaderVoicePlayback(options: Options) {
  let state: ReaderPlaybackState = { state: 'idle', receivedSamples: 0, playedSamples: 0, follow: true,
    resumeSource: options.resumeSource ? { ...options.resumeSource } : undefined };
  let context: AudioContext | undefined, endTime = 0, disposed = false;
  let task: Promise<void> | undefined, aborter: AbortController | undefined;
  let cancelling: Promise<void> | undefined;
  let retryCleanup: (() => Promise<void>) | undefined;
  const segments: Segment[] = [];
  let activeSources: NarrationSource[] = [];
  const withPlaybackLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (!navigator.locks?.request) return await operation();
    return await navigator.locks.request(`rinspace.reader.playback:${options.accountId}`, { ifAvailable: true }, lock => {
      if (!lock) throw new Error('另一个页面正在朗读。');
      return operation();
    });
  };
  const notify = () => { if (!disposed) options.notify(); };
  const progress = () => {
    const now = context?.currentTime || 0;
    for (const segment of segments) if (segment.chunks.length) segment.played = Math.min(segment.received, segment.chunks.reduce((total, chunk) => total + Math.min(chunk.samples, Math.max(0, Math.floor((now - chunk.start) * VOICE_OUTPUT_SAMPLE_RATE))), 0));
    state.receivedSamples = segments.reduce((total, segment) => total + segment.received, 0);
    state.playedSamples = segments.reduce((total, segment) => total + segment.played, 0);
    const audible = segments.find(segment => segment.chunks.some(chunk => now >= chunk.start && now < chunk.start + chunk.samples / VOICE_OUTPUT_SAMPLE_RATE));
    if (audible) { state.source = audible.source; state.state = 'playing'; }
  };
  const captureResume = () => {
    // An idle player can still hold a persisted return point. Voice input calls
    // cancel() defensively before recording; that must not erase the branch's
    // place in the original narration.
    if (!activeSources.length) return;
    progress();
    const source = activeSources.find(candidate => {
      const segment = segments.find(item => sameSource(item.source, candidate));
      return !segment || !segment.complete || segment.played < segment.received;
    });
    state.resumeSource = source ? { ...source } : undefined;
  };
  const stopLocal = () => {
    progress();
    for (const segment of segments) for (const chunk of segment.chunks) {
      if (chunk.node) { chunk.node.onended = null; chunk.node.stop(); chunk.node.disconnect(); chunk.node.buffer = null; chunk.node = undefined; chunk.ended = true; }
      chunk.buffer?.getChannelData(0).fill(0); chunk.buffer = undefined;
    }
    // Freeze the measured cursor before releasing scheduled sources. Advancing
    // the AudioContext later must not turn stopped buffers into played audio.
    for (const segment of segments) segment.chunks.length = 0;
  };
  const cancel = () => {
    if (cancelling) return cancelling;
    const pending = (async () => {
      captureResume();
      const persisted = options.persistResume?.(state.resumeSource ? { ...state.resumeSource } : undefined);
      stopLocal(); aborter?.abort(new DOMException('Playback stopped', 'AbortError'));
      if (task) { state.state = 'stopping'; notify(); await task; }
      if (retryCleanup) { const retry = retryCleanup; await retry(); retryCleanup = undefined; }
      await persisted;
      if (!disposed) { state = { ...state, state: 'idle', error: undefined, cleanupPending: undefined }; notify(); }
    })();
    cancelling = pending.finally(() => { cancelling = undefined; });
    return cancelling;
  };
  const play = (sources: NarrationSource[], regenerate = false): Promise<void> => {
    options.active();
    if (disposed || cancelling || task || retryCleanup || !sources.length || sources.length > 128 * 16) throw new Error('请先停止当前朗读。');
    const resumeIndex = state.resumeSource ? sources.findIndex(source => sameSource(source, state.resumeSource!)) : -1;
    const queued = (resumeIndex >= 0 ? sources.slice(resumeIndex) : sources).map(source => ({ ...source }));
    const controller = new AbortController();
    // This call happens synchronously inside the original user gesture.
    const resumed = options.openAudio(controller.signal);
    aborter = controller;
    activeSources = queued;
    state = { state: 'loading', receivedSamples: 0, playedSamples: 0, follow: state.follow, source: { ...queued[0] } }; notify();
    segments.length = 0;
    task = (async () => {
      try {
        const audio = await resumed; context = audio; endTime = audio.currentTime;
        await withPlaybackLock(async () => {
          await options.persistResume?.(undefined);
          await options.run(controller.signal, async input => {
          let lastAck = 0;
          const update = () => { options.active(); progress(); notify(); };
          const acknowledge = async (force = false) => {
            if (!force && Date.now() - lastAck < 1000) return;
            lastAck = Date.now();
            for (const segment of segments) {
              if (!force && segment.acknowledged === segment.received && segment.played === segment.received) continue;
              await input.acknowledge(segment.scope, segment.received, segment.played);
              segment.acknowledged = segment.received;
            }
          };
          const abort = () => { stopLocal(); notify(); };
          input.signal.addEventListener('abort', abort, { once: true });
          try {
            for (const source of queued) {
              // Prefetch the next natural-language paragraph while the current
              // one plays, with a bounded scheduling horizon.
              while (endTime - audio.currentTime > 30) { update(); await acknowledge(); await delay(input.signal, 100); }
              input.signal.throwIfAborted(); options.active();
              const scope = await input.start(source, regenerate);
              const segment: Segment = { source: { ...source }, scope, received: 0, acknowledged: 0, played: 0, complete: false, chunks: [] }; segments.push(segment);
              let cursor = 0; const deadline = Date.now() + 95000;
              for (;;) {
                input.signal.throwIfAborted(); options.active();
                let result: VoicePlaybackResult;
                try { result = await input.poll(scope, cursor); }
                catch (error) {
                  if (Date.now() >= deadline || !(error instanceof ServiceError ? [502, 503, 504].includes(error.status) : error instanceof TypeError)) throw error;
                  await delay(input.signal, 200); continue;
                }
                for (const chunk of result.chunks) {
                  const binary = atob(chunk.pcm16Base64), samples = binary.length / 2;
                  const buffer = audio.createBuffer(1, samples, VOICE_OUTPUT_SAMPLE_RATE), channel = buffer.getChannelData(0);
                  for (let index = 0; index < samples; index++) {
                    const value = binary.charCodeAt(2 * index) | binary.charCodeAt(2 * index + 1) << 8;
                    channel[index] = (value >= 32768 ? value - 65536 : value) / 32768;
                  }
                  const node = audio.createBufferSource(); node.buffer = buffer; node.connect(audio.destination);
                  const scheduled: Segment['chunks'][number] = { start: Math.max(endTime, audio.currentTime + 0.02), samples, buffer, node, ended: false };
                  segment.chunks.push(scheduled); segment.received += samples;
                  node.onended = () => { scheduled.ended = true; node.disconnect(); node.buffer = null; buffer.getChannelData(0).fill(0); scheduled.node = undefined; scheduled.buffer = undefined; };
                  node.start(scheduled.start); endTime = scheduled.start + samples / VOICE_OUTPUT_SAMPLE_RATE;
                }
                cursor = result.next; update(); await acknowledge();
                if (result.state === 'completed' && !result.hasMore) { segment.complete = true; break; }
                if (result.state !== 'unknown' && result.state !== 'completed') throw new Error('这次朗读未能完成。');
                if (Date.now() >= deadline) throw new Error('语音结果待确认，请稍后重试。');
                await delay(input.signal, result.hasMore ? 0 : 150);
              }
              if (!segment.received) throw new Error('这段内容没有可用音频。');
            }
            while (audio.currentTime < endTime) { update(); await acknowledge(); await delay(input.signal, 50); }
            update(); await acknowledge(true);
          } finally {
            input.signal.removeEventListener('abort', abort);
            stopLocal();
            // A final lost ack/stop can be retried without re-synthesis.
            const cleanup = async () => { try { await acknowledge(true); } finally { await input.cancel(); } };
            try { await cleanup(); retryCleanup = undefined; }
            catch (error) { retryCleanup = cleanup; if (!disposed) state = { ...state, state: 'error', error: '停止结果待确认，请重试。', cleanupPending: true }; }
          }
          });
        });
        if (!retryCleanup) { state.state = 'idle'; activeSources = []; }
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          captureResume();
          await options.persistResume?.(state.resumeSource ? { ...state.resumeSource } : undefined);
          const expired = error instanceof ServiceError && error.code === 'VOICE_CONTENT_EXPIRED';
          state = { ...state, state: 'error', error: expired ? '音频已过期。' : error instanceof Error && /^[\u3400-\u9fff]/.test(error.message) ? error.message : '朗读暂时不可用，请重试。', expired };
        }
      } finally { stopLocal(); task = undefined; aborter = undefined; notify(); }
    })();
    return task;
  };
  // cancel() stops scheduled sources before its first await, persists the
  // paragraph return point and completes the original native cleanup. BFCache
  // restore remains idle until another explicit play gesture.
  const pagehide = () => { void cancel().catch(() => {}); };
  window.addEventListener('pagehide', pagehide);
  return {
    play, cancel,
    snapshot: () => ({ ...state, source: state.source ? { ...state.source } : undefined, resumeSource: state.resumeSource ? { ...state.resumeSource } : undefined }),
    setFollow(follow: boolean) { state.follow = follow; notify(); },
    async dispose() { disposed = true; window.removeEventListener('pagehide', pagehide); stopLocal(); aborter?.abort(new DOMException('Reader closed', 'AbortError')); await task; segments.length = 0; },
  };
}
