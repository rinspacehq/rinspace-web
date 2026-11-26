// Browser-resource fakes cover recording, cancellation and ownership.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createReaderVoiceInput, speechPCM } from './voiceInput';
import { connectMicrophoneFrames, loadMicrophoneWorklet } from './microphoneFrames';
import type { LearningVoiceInput } from './learningSession';

vi.mock('./microphoneFrames', () => ({ connectMicrophoneFrames: vi.fn(), loadMicrophoneWorklet: vi.fn() }));
const originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
const controllers: ReturnType<typeof createReaderVoiceInput>[] = [];
const contexts: FakeAudioContext[] = [];
let captureFrame: (frame: Float32Array) => void;
let detach = vi.fn(async () => {});
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
  detach = vi.fn(async () => {});
  vi.mocked(loadMicrophoneWorklet).mockResolvedValue();
  vi.mocked(connectMicrophoneFrames).mockImplementation((_context, _stream, onFrame) => {
    captureFrame = onFrame;
    return detach;
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
  const beginTranscription = vi.fn();
  const voice = createReaderVoiceInput({ accountId: 'synthetic-voice-owner', active() {}, available:()=>true, notify: vi.fn(),
    run: async (signal, operation) => { beginTranscription(); return operation({ ...input, signal }); } });
  controllers.push(voice);
  return { voice, input, beginTranscription };
}

test('transcription stays in temporary review and closes the microphone before confirmation', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input, beginTranscription } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  captureFrame(new Float32Array([0, 0.5, -0.5]));
  captureFrame(new Float32Array(16000 * 3));
  captureFrame(new Float32Array([0, 0.5, -0.5]));
  expect(voice.snapshot().input).toBe('listening');
  expect(track.stop).not.toHaveBeenCalled();
  expect(beginTranscription).not.toHaveBeenCalled();
  await voice.finishInput();
  await running;
  expect(voice.snapshot()).toMatchObject({ input: 'review', transcript: '两个非零向量。' });
  expect(track.stop).toHaveBeenCalledOnce();
  expect(beginTranscription).toHaveBeenCalledOnce();
  expect(input.transcribe).toHaveBeenCalledOnce(); expect(input.release).not.toHaveBeenCalled();
  await voice.dismissTranscript();
  expect(input.release).toHaveBeenCalledOnce(); expect(input.cancel).not.toHaveBeenCalled();
  expect(voice.snapshot()).toEqual({ input: 'idle', transcript: '' });
});

test('at the duration limit, recording closes once and the review explains why', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(), running = voice.startInput();
  const lengths: number[] = [];
  vi.mocked(input.transcribe).mockImplementation(async (_id, audio) => {
    lengths.push(audio.length);
    return '两个非零向量。';
  });
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  const frame = new Float32Array(512).fill(0.5);
  for (let i = 0; i < 938; i++) captureFrame(frame);
  await voice.finishInput();
  await running;
  expect(track.stop).toHaveBeenCalledOnce();
  expect(input.transcribe).toHaveBeenCalledOnce();
  expect(lengths).toEqual([30 * 16000 * 2]);
  expect(voice.snapshot()).toMatchObject({ input: 'review', limitReached: true });
});

test('cancelling a pending permission prompt releases ownership and stops a late microphone', async () => {
  const { stream, track } = streamFixture(); let resolve!: (stream: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise<MediaStream>(done => { resolve = done; }));
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
  await voice.cancelInput(); await running;
  expect(voice.snapshot().input).toBe('idle');
  resolve(stream); await Promise.resolve(); await Promise.resolve();
  expect(track.stop).toHaveBeenCalledOnce(); expect(input.transcribe).not.toHaveBeenCalled(); expect(connectMicrophoneFrames).not.toHaveBeenCalled();
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
  expect(input.cancel).not.toHaveBeenCalled(); expect(input.transcribe).not.toHaveBeenCalled();
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
  expect(input.cancel).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('pageshow'));
  await Promise.resolve();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
});

test('pagehide clears an unconfirmed transcript through its original consume intent', async () => {
  const { stream } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(); const running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  captureFrame(new Float32Array([0.5, 0.5])); await voice.finishInput(); await running;
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
  captureFrame(new Float32Array([0.5, 0.5])); await voice.finishInput();
  await vi.waitFor(() => expect(input.transcribe).toHaveBeenCalledOnce());
  const stopping = voice.cancelInput(); expect(track.stop).toHaveBeenCalledOnce();
  resolve('LATE_PRIVATE_TRANSCRIPT'); await stopping; await running;
  expect(voice.snapshot()).toEqual({ input: 'idle', transcript: '' });
  expect(input.cancel).toHaveBeenCalledOnce(); expect(input.release).not.toHaveBeenCalled();
});

test('audio resources close even when transcript consumption is unavailable', async () => {
  const { stream } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(), running = voice.startInput();
  await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  captureFrame(new Float32Array([0.5, 0.5])); await voice.finishInput(); await running;
  vi.mocked(input.release).mockRejectedValueOnce(new Error('synthetic lost consumption ack'));
  await expect(voice.dispose()).rejects.toThrow('synthetic lost consumption ack');
  expect(detach).toHaveBeenCalledOnce(); expect(contexts[0].close).toHaveBeenCalledOnce();
});

test('an uncertain transcription failure still cancels the original native operation', async () => {
  const { stream, track } = streamFixture(); vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
  const { voice, input } = harness(); vi.mocked(input.transcribe).mockRejectedValueOnce(new Error('synthetic unknown acknowledgement'));
  const running = voice.startInput(); await vi.waitFor(() => expect(voice.snapshot().input).toBe('listening'));
  captureFrame(new Float32Array([0.5, 0.5])); await voice.finishInput(); await running;
  expect(voice.snapshot().input).toBe('error');
  expect(track.stop).toHaveBeenCalledOnce(); expect(input.cancel).toHaveBeenCalledOnce(); expect(input.release).not.toHaveBeenCalled();
});

test('PCM keeps sample signs and rejects an overlong or invalid utterance', () => {
  const bytes = speechPCM(new Float32Array([-1, 0, 1])); const view = new DataView(bytes.buffer);
  expect([0, 2, 4].map(offset => view.getInt16(offset, true))).toEqual([-32768, 0, 32767]);
  expect(() => speechPCM(new Float32Array(480001))).toThrow('分成较短');
  expect(() => speechPCM(new Float32Array([NaN]))).toThrow('音频无效');
});
