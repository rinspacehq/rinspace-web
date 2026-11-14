import { expect, test, vi } from 'vitest';
import { createReaderVoicePlayback } from './voicePlayback';
import type { LearningVoicePlayback } from './learningSession';
import type { NarrationSource, PlaybackScope, VoicePlaybackResult } from './voicePlaybackProtocol';

const source: NarrationSource = { operationId: '71000000-0000-4000-8000-000000000001', stepId: 'explain', narrationIndex: 0, lessonResultHash: 'a'.repeat(64) };
const scope: PlaybackScope = { playbackId: '71000000-0000-4000-8000-000000000002', voiceOperationId: '71000000-0000-4000-8000-000000000003',
  sessionId: '71000000-0000-4000-8000-000000000004', generation: 1, mediaEpoch: 1, lessonResultHash: source.lessonResultHash };

function result(state: VoicePlaybackResult['state'], chunks: VoicePlaybackResult['chunks'], next = chunks.length): VoicePlaybackResult {
  return { session: { sessionId: scope.sessionId, documentId: 'doc', documentVersion: 'pdf-tree-v1:' + 'b'.repeat(64), profileDigest: 'c'.repeat(64), revision: 2,
    generation: 1, mediaEpoch: 1, status: 'ready', controller: { controllerId: '71000000-0000-4000-8000-000000000005', fence: 1, expiresAt: '2099-01-01T00:00:00Z' } },
  playback: { playbackId: scope.playbackId, voiceOperationId: scope.voiceOperationId, generation: 1, mediaEpoch: 1, controllerId: '71000000-0000-4000-8000-000000000005',
    fence: 1, lessonResultHash: scope.lessonResultHash, offeredSamples: 2, receivedSamples: 0, playedSamples: 0, next, contentAllowed: true },
  state, contentAvailable: chunks.length > 0, chunks, next, hasMore: false };
}

function audioFixture() {
  let now = 0;
  const channel = new Float32Array(2);
  const node = { buffer: null as AudioBuffer | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  const context = { get currentTime() { return now; }, destination: {}, createBuffer: vi.fn(() => ({ getChannelData: () => channel })),
    createBufferSource: vi.fn(() => node) } as unknown as AudioContext;
  return { context, channel, node, advance: () => { now = 1; } };
}

test('actual playback clock separates received samples from played samples', async () => {
  const audio = audioFixture(), acknowledgements: [number, number][] = [];
  const input: LearningVoicePlayback = { signal: new AbortController().signal, start: vi.fn(async () => scope),
    poll: vi.fn(async () => result('completed', [{ sequence: 0, pcm16Base64: 'AID/fw==' }])),
    acknowledge: vi.fn(async (_scope, received, played) => { acknowledgements.push([received, played]); return result('completed', [], 1); }), cancel: vi.fn(async () => {}) };
  const player = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), openAudio: vi.fn(async () => audio.context), run: async (_signal, operation) => operation(input) });
  const playing = player.play([source]);
  await vi.waitFor(() => expect(acknowledgements).toContainEqual([2, 0]));
  expect(player.snapshot()).toMatchObject({ state: 'loading', receivedSamples: 2, playedSamples: 0 });
  expect(Array.from(audio.channel)).toEqual([-1, 32767 / 32768]);
  expect(audio.context.createBuffer).toHaveBeenCalledWith(1, 2, 44_100);
  audio.advance(); await playing;
  expect(acknowledgements).toContainEqual([2, 2]);
  expect(input.start).toHaveBeenCalledOnce(); expect(input.poll).toHaveBeenCalledOnce(); expect(input.cancel).toHaveBeenCalledOnce();
  expect(audio.node.start).toHaveBeenCalledOnce(); expect(audio.node.disconnect).toHaveBeenCalled();
  expect(player.snapshot()).toMatchObject({ state: 'idle', receivedSamples: 2, playedSamples: 2 });
  await player.dispose();
});

test('stopping while native generation is unknown releases the original operation', async () => {
  const audio = audioFixture();
  const input: LearningVoicePlayback = { signal: new AbortController().signal, start: vi.fn(async () => scope),
    poll: vi.fn(async () => result('unknown', [])), acknowledge: vi.fn(async () => result('unknown', [])), cancel: vi.fn(async () => {}) };
  const player = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), openAudio: vi.fn(async () => audio.context),
    run: async (signal, operation) => operation({ ...input, signal }) });
  const playing = player.play([source]);
  await vi.waitFor(() => expect(input.poll).toHaveBeenCalledOnce());
  await player.cancel(); await playing;
  expect(input.cancel).toHaveBeenCalledOnce(); expect(audio.context.createBufferSource).not.toHaveBeenCalled();
  expect(player.snapshot().state).toBe('idle');
  await player.dispose();
});

test('lost final acknowledgement is visible and retry does not regenerate speech', async () => {
  const audio = audioFixture(); let acknowledgements = 0;
  const input: LearningVoicePlayback = { signal: new AbortController().signal, start: vi.fn(async () => scope),
    poll: vi.fn(async () => result('completed', [{ sequence: 0, pcm16Base64: 'AAA=' }])),
    acknowledge: vi.fn(async () => { acknowledgements++; if (acknowledgements < 3) throw new TypeError('synthetic lost acknowledgement'); return result('completed', [], 1); }),
    cancel: vi.fn(async () => {}) };
  const player = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), openAudio: vi.fn(async () => audio.context), run: async (_signal, operation) => operation(input) });
  await player.play([source]);
  expect(player.snapshot()).toMatchObject({ state: 'error', cleanupPending: true });
  await Promise.all([player.cancel(), player.cancel()]);
  expect(input.start).toHaveBeenCalledOnce(); expect(input.poll).toHaveBeenCalledOnce(); expect(input.cancel).toHaveBeenCalledTimes(2);
  expect(player.snapshot().state).toBe('idle');
  await player.dispose();
});

test('an interruption resumes at the first unfinished narration instead of replaying the lesson', async () => {
  const audio = audioFixture();
  const second = { ...source, narrationIndex: 1 };
  const starts: NarrationSource[] = [];
  const persisted: (NarrationSource | undefined)[] = [];
  const run = async <T>(signal: AbortSignal, operation: (input: LearningVoicePlayback) => Promise<T>) => operation({ signal,
      start: async current => {
        starts.push({ ...current });
        if (current.narrationIndex === 1) await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        return scope;
      },
      poll: async () => result('completed', [{ sequence: 0, pcm16Base64: 'AAA=' }]),
      acknowledge: async () => result('completed', [], 1),
      cancel: async () => {},
    });
  const saveResume = async (current: NarrationSource | undefined) => { persisted.push(current ? { ...current } : undefined); };
  const player = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), openAudio: vi.fn(async () => audio.context), run, persistResume: saveResume });

  const first = player.play([source, second]);
  await vi.waitFor(() => expect(starts).toHaveLength(2));
  audio.advance();
  await player.cancel(); await first;
  expect(player.snapshot()).toMatchObject({ state: 'idle', resumeSource: second });
  expect(persisted.at(-1)).toEqual(second);
  await player.dispose();

  const reloaded = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), openAudio: vi.fn(async () => audio.context), run,
    resumeSource: persisted.at(-1), persistResume: saveResume });
  await reloaded.cancel(); // startInput performs this same idle safety stop.
  expect(reloaded.snapshot().resumeSource).toEqual(second);
  const resumed = reloaded.play([source, second]);
  await vi.waitFor(() => expect(starts).toHaveLength(3));
  expect(starts[2]).toEqual(second);
  await reloaded.cancel(); await resumed;
  await reloaded.dispose();
});

test('pagehide stops scheduled audio synchronously and BFCache restore stays idle', async () => {
  const audio = audioFixture();
  const starts: NarrationSource[] = [];
  const input: LearningVoicePlayback = { signal: new AbortController().signal,
    start: async current => { starts.push({ ...current }); return scope; },
    poll: async () => result('completed', [{ sequence: 0, pcm16Base64: 'AAA=' }]),
    acknowledge: async () => result('completed', [], 1), cancel: vi.fn(async () => {}) };
  const player = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), openAudio: vi.fn(async () => audio.context),
    run: async (signal, operation) => operation({ ...input, signal }) });
  const playing = player.play([source]);
  await vi.waitFor(() => expect(audio.node.start).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pagehide'));
  expect(audio.node.stop).toHaveBeenCalledOnce();
  const stopping = player.cancel();
  await playing;
  await stopping;
  await vi.waitFor(() => expect(player.snapshot().state).toBe('idle'));
  expect(player.snapshot().resumeSource).toEqual(source);
  const calls = starts.length;
  window.dispatchEvent(new Event('pageshow'));
  await Promise.resolve();
  expect(starts).toHaveLength(calls);
  expect(input.cancel).toHaveBeenCalledOnce();
  await player.dispose();
});

test('a synchronous AudioContext failure does not erase a persisted return point', async () => {
  const persistResume = vi.fn(async () => {});
  const player = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), resumeSource: source, persistResume,
    openAudio: vi.fn(() => { throw new DOMException('synthetic blocked audio', 'NotAllowedError'); }),
    run: async () => { throw new Error('native playback must not start'); } });
  expect(() => player.play([source])).toThrow('synthetic blocked audio');
  expect(player.snapshot()).toMatchObject({ state: 'idle', resumeSource: source });
  expect(persistResume).not.toHaveBeenCalled();
  await player.dispose();
});

test('a competing tab cannot start native playback or erase the persisted return point', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: vi.fn(async (_name: string, _options: unknown, operation: (lock: null) => Promise<unknown>) => operation(null)),
  } });
  try {
    const audio = audioFixture(), persistResume = vi.fn(async () => {});
    let runCalls = 0;
    const run = async <T>(_signal: AbortSignal, _operation: (playback: LearningVoicePlayback) => Promise<T>): Promise<T> => {
      runCalls++;
      throw new Error('competing tab reached native playback');
    };
    const player = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify: vi.fn(), resumeSource: source, persistResume,
      openAudio: vi.fn(async () => audio.context), run });
    await player.play([source]);
    expect(player.snapshot()).toMatchObject({ state: 'error', error: '另一个页面正在朗读。', resumeSource: source });
    expect(runCalls).toBe(0); expect(audio.context.createBufferSource).not.toHaveBeenCalled();
    expect(persistResume).toHaveBeenCalledOnce(); expect(persistResume).toHaveBeenCalledWith(source);
    await player.dispose();
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else Reflect.deleteProperty(navigator, 'locks');
  }
});
