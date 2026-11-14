// Actual Chromium lifecycle events + actual Web voice controllers. Microphone,
// VAD and Native are explicit synthetic adapters; no account or model is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const output = process.env.READER_EVIDENCE_DIR;
if (!output) throw new Error('Set READER_EVIDENCE_DIR to an external evidence directory');
await mkdir(output, { recursive: true });

const built = await build({ root, configFile: false, publicDir: false, logLevel: 'error',
  resolve: { alias: { '@': resolve(root, 'src') } },
  plugins: [{ name: 'reader-voice-lifecycle-fixtures', enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'reader-voice-lifecycle-entry') return '\0reader-voice-lifecycle-entry';
      if (source === './vadInput' && importer?.endsWith('/voiceInput.ts')) return '\0reader-voice-vad-fixture';
      if (source === '@/services/httpClient') return '\0reader-voice-http-fixture';
    },
    load(id) {
      if (id === '\0reader-voice-lifecycle-entry') return `
        export {createReaderVoiceInput} from ${JSON.stringify(resolve(root, 'src/features/reader/voiceInput.ts'))};
        export {createReaderVoicePlayback} from ${JSON.stringify(resolve(root, 'src/features/reader/voicePlayback.ts'))};`;
      if (id === '\0reader-voice-vad-fixture') return `
        export async function createReaderVAD(_context, callbacks) {
          let listening = false;
          const controller = {get listening(){return listening;}, start(){listening=true;}, async pause(){listening=false;}, async destroy(){listening=false;}};
          window.__readerVoiceVAD = {callbacks, controller};
          return controller;
        }`;
      if (id === '\0reader-voice-http-fixture' || id.endsWith('/src/services/httpClient.ts')) return `
        export class ServiceError extends Error { constructor(message,status,body,code){super(message);this.status=status;this.body=body;this.code=code;} }
        export async function requestJson(){throw new Error('Unexpected HTTP request in lifecycle fixture');}`;
    },
  }],
  build: { write: false, minify: false, rollupOptions: { input: 'reader-voice-lifecycle-entry', preserveEntrySignatures: 'strict', output: { format: 'es', inlineDynamicImports: true } } },
});
const files = Array.isArray(built) ? built[0].output : built.output;
const code = files.find(file => file.type === 'chunk' && file.isEntry)?.code;
if (!code) throw new Error('Voice lifecycle bundle missing');

const server = createServer((request, response) => {
  if (request.url === '/host.mjs') { response.setHeader('Content-Type', 'text/javascript'); response.end(code); return; }
  response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Reader voice lifecycle</title>');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Lifecycle server did not start');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const { createReaderVoiceInput, createReaderVoicePlayback } = await import('/host.mjs');
    const waitFor = async predicate => { for (let count = 0; count < 200; count++) { if (predicate()) return; await new Promise(resolveWait => setTimeout(resolveWait, 5)); } throw new Error('Lifecycle state timeout'); };
    const counters = { microphoneOpens: 0, trackStops: 0, inputCancels: 0, transcriptReleases: 0, audioStarts: 0, audioStops: 0, playbackCancels: 0 };
    const audioSources = [];
    class FixtureAudioContext {
      currentTime = 0; state = 'running'; destination = {};
      async resume() {} async close() { this.state = 'closed'; }
      createBuffer(_channels, samples) { const data = new Float32Array(samples); return { getChannelData: () => data }; }
      createBufferSource() {
        const source = { buffer: null, onended: null, connect() {}, disconnect() {}, start() { counters.audioStarts++; }, stop() { counters.audioStops++; } };
        audioSources.push(source); return source;
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FixtureAudioContext });
    Object.defineProperty(window, 'AudioWorkletNode', { configurable: true, value: class {} });
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_key, _options, operation) => operation({}) } });
    const microphone = () => {
      const track = { readyState: 'live', stop() { if (this.readyState !== 'ended') counters.trackStops++; this.readyState = 'ended'; }, addEventListener() {} };
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { counters.microphoneOpens++; return microphone(); } } });
    const inputOptions = () => ({ accountId: 'synthetic-account', active() {}, available: () => true, notify() {},
      run: async (signal, operation) => operation({ signal, transcribe: async () => '两个非零向量。',
        cancel: async () => { counters.inputCancels++; }, release: async () => { counters.transcriptReleases++; } }) });

    const listening = createReaderVoiceInput(inputOptions());
    const listeningTask = listening.startInput();
    await waitFor(() => listening.snapshot().input === 'listening');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const trackStoppedSynchronously = counters.trackStops === 1;
    await listeningTask; await waitFor(() => listening.snapshot().input === 'idle');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await new Promise(resolveWait => setTimeout(resolveWait, 0));
    const listeningResult = { trackStoppedSynchronously, state: listening.snapshot().input, microphoneOpens: counters.microphoneOpens, inputCancels: counters.inputCancels };
    await listening.dispose();

    const review = createReaderVoiceInput(inputOptions());
    const reviewTask = review.startInput();
    await waitFor(() => review.snapshot().input === 'listening');
    window.__readerVoiceVAD.callbacks.onSpeechEnd(new Float32Array([0.25, -0.25]));
    await reviewTask;
    const transcriptBeforeHide = review.snapshot().transcript;
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const stopping = review.cancelInput();
    const transcriptClearedSynchronously = review.snapshot().transcript === '';
    await stopping; await waitFor(() => review.snapshot().input === 'idle');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    const reviewResult = { transcriptBeforeHide, transcriptClearedSynchronously, state: review.snapshot().input, transcript: review.snapshot().transcript,
      transcriptReleases: counters.transcriptReleases };
    await review.dispose();

    const narration = { operationId: '71000000-0000-4000-8000-000000000001', stepId: 'explain', narrationIndex: 0, lessonResultHash: 'a'.repeat(64) };
    const playbackInput = { signal: new AbortController().signal, start: async () => ({}),
      poll: async () => ({ state: 'completed', chunks: [{ sequence: 0, pcm16Base64: 'AAA=' }], next: 1, hasMore: false }),
      acknowledge: async () => ({}), cancel: async () => { counters.playbackCancels++; } };
    const playback = createReaderVoicePlayback({ accountId: 'synthetic-account', active() {}, notify() {}, openAudio: async () => new FixtureAudioContext(),
      run: async (signal, operation) => operation({ ...playbackInput, signal }) });
    const playbackTask = playback.play([narration]);
    await waitFor(() => counters.audioStarts === 1);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const sharedStop = playback.cancel();
    const audioStoppedSynchronously = counters.audioStops === 1;
    await playbackTask; await sharedStop; await waitFor(() => playback.snapshot().state === 'idle');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await new Promise(resolveWait => setTimeout(resolveWait, 0));
    const playbackResult = { audioStoppedSynchronously, state: playback.snapshot().state, resumeSource: playback.snapshot().resumeSource,
      audioStarts: counters.audioStarts, audioStops: counters.audioStops, playbackCancels: counters.playbackCancels };
    await playback.dispose();
    return { listening: listeningResult, review: reviewResult, playback: playbackResult };
  });
  assert.deepEqual(result.listening, { trackStoppedSynchronously: true, state: 'idle', microphoneOpens: 1, inputCancels: 1 });
  assert.deepEqual(result.review, { transcriptBeforeHide: '两个非零向量。', transcriptClearedSynchronously: true, state: 'idle', transcript: '', transcriptReleases: 1 });
  assert.equal(result.playback.audioStoppedSynchronously, true);
  assert.equal(result.playback.state, 'idle');
  assert.deepEqual(result.playback.resumeSource, { operationId: '71000000-0000-4000-8000-000000000001', stepId: 'explain', narrationIndex: 0, lessonResultHash: 'a'.repeat(64) });
  assert.equal(result.playback.audioStarts, 1); assert.equal(result.playback.audioStops, 1); assert.equal(result.playback.playbackCancels, 1);

  const lockPages = await Promise.all([context.newPage(), context.newPage()]);
  for (const [index, lockPage] of lockPages.entries()) {
    lockPage.on('pageerror', error => pageErrors.push(`lock-page-${index + 1}: ${error.message}`));
    await lockPage.goto(`http://127.0.0.1:${address.port}/`);
    await lockPage.evaluate(async pageIndex => {
      const { createReaderVoiceInput, createReaderVoicePlayback } = await import('/host.mjs');
      window.__voiceLockCounters = { microphoneOpens: 0, nativePlaybackStarts: 0, audioStarts: 0, audioStops: 0 };
      const counters = window.__voiceLockCounters;
      class LockAudioContext {
        currentTime = 0; state = 'running'; destination = {};
        async resume() {} async close() { this.state = 'closed'; }
        createBuffer(_channels, samples) { const data = new Float32Array(samples); return { getChannelData: () => data }; }
        createBufferSource() { return { buffer: null, onended: null, connect() {}, disconnect() {},
          start() { counters.audioStarts++; }, stop() { counters.audioStops++; } }; }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: LockAudioContext });
      Object.defineProperty(window, 'AudioWorkletNode', { configurable: true, value: class {} });
      const microphone = () => {
        const track = { readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener() {} };
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { counters.microphoneOpens++; return microphone(); } } });
      const input = createReaderVoiceInput({ accountId: 'shared-browser-account', active() {}, available: () => true, notify() {},
        run: async (signal, operation) => operation({ signal, transcribe: async () => `page-${pageIndex}`,
          cancel: async () => {}, release: async () => {} }) });
      const narration = { operationId: '71000000-0000-4000-8000-000000000001', stepId: 'explain', narrationIndex: 0, lessonResultHash: 'a'.repeat(64) };
      const playback = createReaderVoicePlayback({ accountId: 'shared-browser-account', active() {}, notify() {}, openAudio: async () => new LockAudioContext(),
        run: async (signal, operation) => operation({ signal,
          start: async () => { counters.nativePlaybackStarts++; return {}; },
          poll: async () => ({ state: 'completed', chunks: [{ sequence: 0, pcm16Base64: 'AAA=' }], next: 1, hasMore: false }),
          acknowledge: async () => ({}), cancel: async () => {} }) });
      window.__voiceLockFixture = { input, playback, narration, inputTask: undefined, playbackTask: undefined };
    }, index + 1);
  }
  const [ownerPage, contenderPage] = lockPages;
  await ownerPage.evaluate(() => { window.__voiceLockFixture.inputTask = window.__voiceLockFixture.input.startInput(); });
  await ownerPage.waitForFunction(() => window.__voiceLockFixture.input.snapshot().input === 'listening');
  await contenderPage.evaluate(() => { window.__voiceLockFixture.inputTask = window.__voiceLockFixture.input.startInput(); });
  await contenderPage.waitForFunction(() => window.__voiceLockFixture.input.snapshot().input === 'error');
  const blockedMicrophone = await contenderPage.evaluate(() => ({ snapshot: window.__voiceLockFixture.input.snapshot(), counters: window.__voiceLockCounters }));
  assert.match(blockedMicrophone.snapshot.error, /另一个页面/); assert.equal(blockedMicrophone.counters.microphoneOpens, 0);
  await ownerPage.evaluate(async () => { await window.__voiceLockFixture.input.cancelInput(); await window.__voiceLockFixture.inputTask; });
  await contenderPage.evaluate(() => { window.__voiceLockFixture.inputTask = window.__voiceLockFixture.input.startInput(); });
  await contenderPage.waitForFunction(() => window.__voiceLockFixture.input.snapshot().input === 'listening');
  assert.equal(await contenderPage.evaluate(() => window.__voiceLockCounters.microphoneOpens), 1);
  await contenderPage.evaluate(async () => { await window.__voiceLockFixture.input.cancelInput(); await window.__voiceLockFixture.inputTask; });

  await ownerPage.evaluate(() => { window.__voiceLockFixture.playbackTask = window.__voiceLockFixture.playback.play([window.__voiceLockFixture.narration]); });
  await ownerPage.waitForFunction(() => window.__voiceLockCounters.audioStarts === 1);
  await contenderPage.evaluate(() => { window.__voiceLockFixture.playbackTask = window.__voiceLockFixture.playback.play([window.__voiceLockFixture.narration]); });
  await contenderPage.waitForFunction(() => window.__voiceLockFixture.playback.snapshot().state === 'error');
  const blockedPlayback = await contenderPage.evaluate(() => ({ snapshot: window.__voiceLockFixture.playback.snapshot(), counters: window.__voiceLockCounters }));
  assert.match(blockedPlayback.snapshot.error, /另一个页面/); assert.equal(blockedPlayback.counters.nativePlaybackStarts, 0); assert.equal(blockedPlayback.counters.audioStarts, 0);
  await ownerPage.evaluate(async () => { await window.__voiceLockFixture.playback.cancel(); await window.__voiceLockFixture.playbackTask; });
  await contenderPage.evaluate(() => { window.__voiceLockFixture.playbackTask = window.__voiceLockFixture.playback.play([window.__voiceLockFixture.narration]); });
  await contenderPage.waitForFunction(() => window.__voiceLockCounters.audioStarts === 1);
  assert.equal(await contenderPage.evaluate(() => window.__voiceLockCounters.nativePlaybackStarts), 1);
  await contenderPage.evaluate(async () => { await window.__voiceLockFixture.playback.cancel(); await window.__voiceLockFixture.playbackTask; });
  for (const lockPage of lockPages) await lockPage.evaluate(async () => {
    await window.__voiceLockFixture.input.dispose(); await window.__voiceLockFixture.playback.dispose();
  });
  const crossTab = { microphone: { contenderBlockedBeforeDeviceOpen: true, startsAfterRelease: 1 },
    playback: { contenderBlockedBeforeNativeOrAudio: true, startsAfterRelease: 1 } };
  assert.deepEqual(pageErrors, []);
  const receipt = { schema: 'reader-voice-lifecycle-browser/v1', scope: 'Actual Chromium and actual Web voice controllers/Web Locks; synthetic microphone/VAD/Native', ...result, crossTab, pageErrors };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(receipt, null, 2));
  console.log('Reader voice lifecycle browser smoke passed.');
} finally { await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); }
