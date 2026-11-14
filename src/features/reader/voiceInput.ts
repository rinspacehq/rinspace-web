import { ServiceError } from '@/services/httpClient';
import type { LearningVoiceInput } from './learningSession';
import { createReaderVAD, type ReaderVAD } from './vadInput';

export type ReaderVoiceState = { input: 'idle' | 'starting' | 'listening' | 'transcribing' | 'review' | 'stopping' | 'error'; transcript: string; error?: string; limitReached?: boolean; cleanupPending?: boolean };
export type ReaderVoiceControls = {
  available(): boolean;
  snapshot(): ReaderVoiceState;
  startInput(): Promise<void>;
  finishInput(): Promise<void>;
  cancelInput(): Promise<void>;
  dismissTranscript(): Promise<void>;
};
type Options = {
  accountId: string;
  active(): void;
  available(): boolean;
  notify(): void;
  run<T>(signal: AbortSignal, operation: (input: LearningVoiceInput) => Promise<T>): Promise<T>;
};

export function readerVoiceSupported(): boolean {
  return typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof navigator.locks?.request === 'function';
}

function acquireMicrophone(signal: AbortSignal): Promise<MediaStream> {
  const pending = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    pending.then(stream => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); reject(signal.reason); } else resolve(stream);
    }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

function waitForAudioResume(pending: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    pending.then(() => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason); else resolve();
    }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

function voiceError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return '麦克风权限未开启。';
    if (error.name === 'NotFoundError') return '未找到麦克风。';
    if (error.name === 'NotReadableError') return '麦克风当前无法使用。';
  }
  if (error instanceof ServiceError) {
    if (error.code === 'UNAUTHENTICATED') return '登录状态已失效，请重新登录。';
    if (['CONTROLLER_BUSY', 'CONTROLLER_FENCED'].includes(error.code || '')) return '另一个页面正在使用琳。';
    return '语音暂时不可用，请重试。';
  }
  return error instanceof Error && /^[\u3400-\u9fff]/.test(error.message) ? error.message : '语音暂时不可用，请重试。';
}

export function speechPCM(samples: Float32Array): Uint8Array {
  if (!samples.length || samples.length > 480000) throw new Error('请将语音分成较短的句子。');
  const pcm = new Uint8Array(samples.length * 2), view = new DataView(pcm.buffer);
  for (let index = 0; index < samples.length; index++) {
    if (!Number.isFinite(samples[index])) { pcm.fill(0); throw new Error('麦克风音频无效。'); }
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return pcm;
}

/** One owner in the Web host, shared by the adopted Viewer/PiP root. */
export function createReaderVoiceInput(options: Options): ReaderVoiceControls & { dispose(): Promise<void>; openAudio(signal: AbortSignal): Promise<AudioContext> } {
  let state: ReaderVoiceState = { input: 'idle', transcript: '' };
  let vad: ReaderVAD | undefined, context: AudioContext | undefined, stream: MediaStream | undefined;
  let task: Promise<void> | undefined, controller: AbortController | undefined;
  let cancelling: Promise<void> | undefined;
  let disposed = false, serial = 0, finishing = false;
  let retryCleanup: (() => Promise<void>) | undefined;
  let releaseTranscript: (() => Promise<void>) | undefined;
  let rejectCapture: ((error: unknown) => void) | undefined;
  const set = (next: ReaderVoiceState) => { state = next; if (!disposed) options.notify(); };
  const stopTracks = () => { stream?.getTracks().forEach(track => track.stop()); stream = undefined; };
  const current = (id: number) => {
    options.active();
    if (disposed || id !== serial) throw new Error('语音会话已关闭。');
  };
  const openAudio = (signal: AbortSignal) => {
    options.active(); signal.throwIfAborted();
    if (disposed) throw new Error('语音会话已关闭。');
    context ||= new AudioContext({ latencyHint: 'interactive' });
    const owned = context;
    return waitForAudioResume(owned.resume(), signal).then(() => owned);
  };
  const cancelInput = () => {
    if (cancelling) return cancelling;
    const pending = (async () => {
      if (state.input === 'idle' && !task && !retryCleanup) return;
      const reviewing = state.input === 'review';
      set({ input: 'stopping', transcript: '' });
      if (!reviewing) controller?.abort(new DOMException('Cancelled by the user', 'AbortError'));
      stopTracks();
      await task;
      if (releaseTranscript) {
        try { await releaseTranscript(); releaseTranscript = undefined; }
        catch (error) { set({ input: 'error', transcript: '', error: '结果待确认，请重试。' }); throw error; }
      }
      if (retryCleanup) { const retry = retryCleanup; await retry(); retryCleanup = undefined; }
      if (!disposed) set({ input: 'idle', transcript: '' });
    })();
    cancelling = pending.finally(() => { cancelling = undefined; });
    return cancelling;
  };
  const finishInput = async () => {
    if (state.input !== 'listening' || finishing || !vad) return;
    finishing = true;
    stopTracks();
    try { await vad.pause(); if (state.input === 'listening') rejectCapture?.(new Error('没有听清，请重试。')); }
    catch (error) { rejectCapture?.(error); }
  };
  const startInput = async () => {
    options.active();
    if (!options.available()) throw new Error('语音当前不可用。');
    if (disposed || cancelling || task || !['idle', 'error'].includes(state.input) || retryCleanup) throw new Error('请先确认或取消当前语音。');
    if (!readerVoiceSupported()) throw new Error('当前浏览器不支持语音输入。');
    const id = ++serial;
    const aborter = new AbortController(); controller = aborter; finishing = false;
    // Create/resume under the user's gesture; loading models does not create
    // another AudioContext or acquire a microphone behind the user's back.
    const resumed = openAudio(aborter.signal);
    set({ input: 'starting', transcript: '' });
    task = (async () => {
      try {
        const audioContext = await resumed;
        await navigator.locks.request(`rinspace.reader.microphone:${options.accountId}`, { ifAvailable: true }, async lock => {
          if (!lock) throw new Error('另一个页面正在使用麦克风。');
          await options.run(aborter.signal, async input => {
            let settle!: (value: { samples: Float32Array } | { error: unknown }) => void;
            const audio = new Promise<{ samples: Float32Array } | { error: unknown }>(resolve => { settle = resolve; });
            let accepted = false, speaking = false, frames = 0, reviewing = false;
            let captured: Float32Array | undefined;
            const fail = (error: unknown) => { accepted = true; settle({ error }); stopTracks(); };
            rejectCapture = fail;
            const aborted = () => fail(input.signal.reason);
            input.signal.addEventListener('abort', aborted, { once: true });
            try {
              current(id); input.signal.throwIfAborted();
              stream = await acquireMicrophone(input.signal);
              current(id); input.signal.throwIfAborted();
              for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => fail(new Error('麦克风已断开，请重新开启。')), { once: true });
              const onSpeechEnd = (samples: Float32Array) => {
                if (accepted || input.signal.aborted || disposed || id !== serial) { samples.fill(0); return; }
                accepted = true; speaking = false; captured = samples; stopTracks();
                settle({ samples });
                set({ input: 'transcribing', transcript: '', limitReached: state.limitReached });
              };
              if (vad) await vad.destroy();
              vad = await createReaderVAD(audioContext, {
                onSpeechStart: () => { speaking = true; frames = 0; },
                onVADMisfire: () => { speaking = false; frames = 0; if (finishing) fail(new Error('没有听清，请重试。')); },
                onFrameProcessed: frame => {
                  if (!speaking || accepted || input.signal.aborted) return;
                  frames += frame.length;
                  if (frames >= 28 * 16000 && !finishing) {
                    set({ ...state, limitReached: true });
                    void finishInput().catch(fail);
                  }
                }, onSpeechEnd, onError: fail,
              }, input.signal);
              current(id); input.signal.throwIfAborted();
              if (!stream?.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('麦克风已关闭，请重新开启。');
              vad.start(stream); current(id); input.signal.throwIfAborted();
              set({ input: 'listening', transcript: '' });
              const result = await audio;
              if ('error' in result) throw result.error;
              let pcm: Uint8Array | undefined;
              try {
                await vad.pause(); current(id); input.signal.throwIfAborted();
                pcm = speechPCM(result.samples);
                const transcript = await input.transcribe(crypto.randomUUID(), pcm);
                current(id); input.signal.throwIfAborted();
                if (!transcript.trim()) throw new Error('没有听清，请重试。');
                releaseTranscript = input.release;
                reviewing = true;
                set({ input: 'review', transcript, limitReached: state.limitReached });
              } finally { pcm?.fill(0); result.samples.fill(0); }
            } finally {
              input.signal.removeEventListener('abort', aborted);
              rejectCapture = undefined; captured?.fill(0); stopTracks();
              try { if (vad?.listening) await vad.pause(); }
              finally {
                if (input.signal.aborted || !reviewing) {
                  try { await input.cancel(); retryCleanup = undefined; }
                  catch (error) { retryCleanup = input.cancel; if (!disposed) set({ input: 'error', transcript: '', error: '停止结果待确认，请重试。' }); }
                }
              }
            }
          });
        });
      } catch (error) {
        stopTracks();
        if (!disposed && id === serial && !aborter.signal.aborted) set({ input: 'error', transcript: '', error: voiceError(error) });
      } finally { task = undefined; controller = undefined; }
    })();
    return task;
  };
  // cancelInput stops tracks before its first await, then finishes the original
  // native cleanup. A page restored from BFCache returns idle and never
  // reacquires a microphone without another user gesture.
  const pagehide = () => { void cancelInput().catch(() => {}); };
  window.addEventListener('pagehide', pagehide);
  return {
    available: () => !disposed && options.available(), openAudio,
    snapshot: () => ({ ...state, ...(retryCleanup || releaseTranscript && state.input === 'error' ? { cleanupPending: true } : {}) }), startInput, finishInput, cancelInput,
    async dismissTranscript() { if (state.input === 'review') await cancelInput(); },
    async dispose() {
      disposed = true; serial++; window.removeEventListener('pagehide', pagehide);
      controller?.abort(new DOMException('Reader closed', 'AbortError')); stopTracks();
      await task;
      try { if (releaseTranscript) { await releaseTranscript(); releaseTranscript = undefined; } }
      finally {
        try { if (vad) { await vad.destroy(); vad = undefined; } }
        finally {
          const owned = context; context = undefined;
          if (owned && owned.state !== 'closed') await owned.close();
          state = { input: 'idle', transcript: '' };
        }
      }
    },
  };
}
