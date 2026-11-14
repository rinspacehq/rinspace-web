// Browser-resource fakes exercise cancellation/ownership. Real WASM/VAD and
// microphone fixtures are validated separately in the Chromium integration.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createReaderVoiceInput, speechPCM } from './voiceInput';
import { createReaderVAD, type ReaderVADCallbacks } from './vadInput';
import type { LearningVoiceInput } from './learningSession';

vi.mock('./vadInput', () => ({ createReaderVAD: vi.fn() }));
const originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
const controllers: ReturnType<typeof createReaderVoiceInput>[] = [];
const contexts: FakeAudioContext[] = [];
let callbacks: ReaderVADCallbacks;
let destroyed = vi.fn(async () => {});
let resumePending: Promise<void> | undefined;

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  resume = vi.fn(async () => { await resumePending; this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { contexts.push(this); }
}

function streamFixture() {
  let ended: EventListenerOrEventListenerObject | undefined;
  const track = { readyState: 'live', stop: vi.fn(() => { track.readyState = 'ended'; }),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => { if (type === 'ended') ended = listener; }) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return { track, stream, end: () => {
    track.readyState = 'ended';
    if (typeof ended === 'function') ended(new Event('ended')); else ended?.handleEvent(new Event('ended'));
  } };
}

beforeEach(() => {
  vi.clearAllMocks(); contexts.length = 0; resumePending = undefined;
  vi.stubGlobal('AudioContext', FakeAudioContext); vi.stubGlobal('AudioWorkletNode', class {});
  const held = new Set<string>();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (name: string, _options: unknown, operation: (lock: object | null) => Promise<void>) => {
    if (held.has(name)) return operation(null);
    held.add(name); try { return await operation({ name }); } finally { held.delete(name); }
  } } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  destroyed = vi.fn(async () => {});
  vi.mocked(createReaderVAD).mockImplementation(async (_context, cb) => {
    callbacks = cb; let listening = false;
    return { get listening() { return listening; }, start() { listening = true; }, async pause() { listening = false; }, destroy: destroyed };
  });
});
afterEach(async () => {
  for (const voice of controllers.splice(0)) await voice.dispose();
  vi.unstubAllGlobals();
  if (originalMedia) Object.defineProperty(navigator, 'mediaDevices', originalMedia); else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks); else Reflect.deleteProperty(navigator, 'locks');
});

function harness() {
  const input: LearningVoiceInput = { signal: new AbortController().signal, transcribe: vi.fn(async () => '两个非零向量。'), cancel: vi.fn(async () => {}), release: vi.fn(async () => {}) };
  const voice = createReaderVoiceInput({ accountId: 'synthetic-voice-owner', active() {}, available:()=>true, notify: vi.fn(),
    run: async (signal, operation) => operation({ ...input, signal }) });
  controllers.push(voice);
  return { voice, input };
}

test('transcription stays in temporary review and closes the microphone before confirmation', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  const samples = new Float32Array([0, 0.5, -0.5]); callbacks.onSpeechEnd(samples);
  await running;
  expect(voice.snapshot()).toMatchObject({ input: 'review', transcript: '两个非零向量。' });
  expect(track.stop).toHaveBeenCalledOnce(); expect(Array.from(samples)).toEqual([0, 0, 0]);
  expect(input.transcribe).toHaveBeenCalledOnce(); expect(input.release).not.toHaveBeenCalled();
  await voice.dismissTranscript();
  expect(input.release).toHaveBeenCalledOnce(); expect(input.cancel).not.toHaveBeenCalled();
  expect(voice.snapshot()).toEqual({ input: 'idle', transcript: '' });
});

test('duplicate final audio is zeroed and never starts a second transcription', async () => {
  const { stream } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  const accepted = new Float32Array([0.25, -0.25]);
  const duplicate = new Float32Array([0.75, -0.75]);
  callbacks.onSpeechEnd(accepted);
  callbacks.onSpeechEnd(duplicate);
  await running;
  expect(input.transcribe).toHaveBeenCalledOnce();
  expect(Array.from(accepted)).toEqual([0, 0]);
  expect(Array.from(duplicate)).toEqual([0, 0]);
  expect(voice.snapshot()).toMatchObject({ input: 'review', transcript: '两个非零向量。' });
});

test('cancelling a pending permission prompt releases ownership and stops a late microphone', async () => {
  const { stream, track } = streamFixture(); let resolve!: (stream: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise<MediaStream>(done => { resolve = done; }));
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
  await voice.cancelInput(); await running;
  expect(voice.snapshot().input).toBe('idle');
  resolve(stream); await Promise.resolve(); await Promise.resolve();
  expect(track.stop).toHaveBeenCalledOnce(); expect(input.transcribe).not.toHaveBeenCalled(); expect(createReaderVAD).not.toHaveBeenCalled();
});

test('permission denial neither transcribes nor automatically reacquires the microphone', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  const { voice, input } = harness(); await voice.startInput();
  expect(voice.snapshot()).toMatchObject({ input: 'error', error: '麦克风权限未开启。' });
  expect(input.transcribe).not.toHaveBeenCalled(); expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
});

test('a disconnected microphone stops the original operation and never reopens a device', async () => {
  const { stream, end } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  end(); await running;
  expect(voice.snapshot()).toMatchObject({ input: 'error', error: '麦克风已断开，请重新开启。' });
  expect(input.cancel).toHaveBeenCalledOnce(); expect(input.transcribe).not.toHaveBeenCalled();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
});

test('cancellation does not wait for a browser that suspends AudioContext resume', async () => {
  resumePending = new Promise<void>(() => {});
  const { voice, input } = harness(), running = voice.startInput();
  expect(voice.snapshot().input).toBe('starting');
  await voice.cancelInput(); await running;
  expect(voice.snapshot().input).toBe('idle');
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(input.transcribe).not.toHaveBeenCalled();
  await voice.dispose();
  expect(contexts[0].close).toHaveBeenCalledOnce();
});

test('stopping before speech does not leave a microphone or an unresolved recording', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  await voice.finishInput(); await running;
  expect(voice.snapshot()).toMatchObject({ input: 'error', error: '没有听清，请重试。' });
  expect(track.stop).toHaveBeenCalledOnce(); expect(input.transcribe).not.toHaveBeenCalled();
});

test('another host cannot open a second microphone for the same account', async () => {
  const { stream } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const first = harness(), second = harness(); const running = first.voice.startInput();
  await vi.waitFor(() => expect(first.voice.snapshot().input).toBe('listening'));
  await second.voice.startInput();
  expect(second.voice.snapshot()).toMatchObject({ input: 'error', error: '另一个页面正在使用麦克风。' });
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
  await first.voice.cancelInput(); await running;
});

test('pagehide synchronously stops capture and BFCache restore never reopens the microphone', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(); const running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  window.dispatchEvent(new Event('pagehide'));
  expect(track.stop).toHaveBeenCalledOnce();
  await running;
  await vi.waitFor(() => expect(voice.snapshot()).toEqual({ input: 'idle', transcript: '' }));
  expect(input.cancel).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('pageshow'));
  await Promise.resolve();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
});

test('pagehide clears an unconfirmed transcript through its original consume intent', async () => {
  const { stream } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(); const running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  callbacks.onSpeechEnd(new Float32Array([0.5, 0.5])); await running;
  expect(voice.snapshot()).toMatchObject({ input: 'review', transcript: '两个非零向量。' });
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pagehide'));
  expect(voice.snapshot()).toMatchObject({ input: 'stopping', transcript: '' });
  const stopping = voice.cancelInput();
  await vi.waitFor(() => expect(input.release).toHaveBeenCalledOnce());
  await stopping;
  await vi.waitFor(() => expect(voice.snapshot()).toEqual({ input: 'idle', transcript: '' }));
  window.dispatchEvent(new Event('pageshow'));
  expect(voice.snapshot()).toEqual({ input: 'idle', transcript: '' });
});

test('late transcription after cancellation cannot reopen review or restore raw samples', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(); let resolve!: (text: string) => void;
  vi.mocked(input.transcribe).mockReturnValue(new Promise<string>(done => { resolve = done; }));
  const running = voice.startInput(); await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  const samples = new Float32Array([0.5, 0.5]); callbacks.onSpeechEnd(samples);
  await vi.waitFor(() => expect(input.transcribe).toHaveBeenCalledOnce());
  const stopping = voice.cancelInput(); expect(track.stop).toHaveBeenCalledOnce();
  resolve('LATE_PRIVATE_TRANSCRIPT'); await stopping; await running;
  expect(voice.snapshot()).toEqual({ input: 'idle', transcript: '' });
  expect(Array.from(samples)).toEqual([0, 0]); expect(input.cancel).toHaveBeenCalledOnce(); expect(input.release).not.toHaveBeenCalled();
});

test('device/model resources close even when transcript consumption is unavailable', async () => {
  const { stream } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  callbacks.onSpeechEnd(new Float32Array([0.5, 0.5])); await running;
  vi.mocked(input.release).mockRejectedValueOnce(new Error('synthetic lost consumption ack'));
  await expect(voice.dispose()).rejects.toThrow('synthetic lost consumption ack');
  expect(destroyed).toHaveBeenCalledOnce(); expect(contexts[0].close).toHaveBeenCalledOnce();
});

test('an uncertain transcription failure still cancels the original native operation', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(); vi.mocked(input.transcribe).mockRejectedValueOnce(new Error('synthetic unknown acknowledgement'));
  const running = voice.startInput(); await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  callbacks.onSpeechEnd(new Float32Array([0.5, 0.5])); await running;
  expect(voice.snapshot().input).toBe('error');
  expect(track.stop).toHaveBeenCalledOnce(); expect(input.cancel).toHaveBeenCalledOnce(); expect(input.release).not.toHaveBeenCalled();
});

test('PCM keeps sample signs and rejects an overlong or invalid utterance', () => {
  const bytes = speechPCM(new Float32Array([-1, 0, 1])); const view = new DataView(bytes.buffer);
  expect([0, 2, 4].map(offset => view.getInt16(offset, true))).toEqual([-32768, 0, 32767]);
  expect(() => speechPCM(new Float32Array(480001))).toThrow('分成较短');
  expect(() => speechPCM(new Float32Array([NaN]))).toThrow('音频无效');
});
