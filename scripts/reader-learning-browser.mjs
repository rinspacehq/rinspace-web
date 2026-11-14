// Actual Web host/IndexedDB + actual EmbedPDF/PDFium + private HTTP/SQL fixture.
// Native SDK and provider responses are explicit synthetic fixtures, not a
// production account, teacher review, real model or microphone acceptance.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const root = resolve(import.meta.dirname, '..');
const base = process.env.READER_LEARNING_BROWSER_BASE;
const output = process.env.READER_EVIDENCE_DIR;
const bundlePath = process.env.READER_LEARNING_BROWSER_BUNDLE;
const expectedVoiceRuntime = process.env.READER_EXPECTED_VOICE_RUNTIME || '';
if (!base || !output || !bundlePath || !/^https:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Use an isolated TLS loopback fixture and external output/bundle paths');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'startup.json'), JSON.stringify({ stage: 'building-host' }));
const bundle = await build({ root, configFile: false, publicDir: false, logLevel: 'error',
  define: { __RINSPACE_PUBLIC_ENV__: JSON.stringify({ publicBasePath: '', basePath: '', cloudbaseEnvId: '', cloudbaseRegion: '', cloudbaseAccessKey: '', adminPhoneSha256: '', giteaBasePath: '/gitea', typstCreateEnabled: false }) },
  resolve: { alias: { '@': resolve(root, 'src'), app: resolve(root, 'src/app') } },
  plugins: [{ name: 'explicit-synthetic-native-sdk', enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/phoneAuth') || source === './phoneAuth') return '\0reader-native-fixture';
      if (source.endsWith('/authDialog')) return '\0reader-dialog-fixture';
      if (source === 'reader-fixture-entry') return '\0reader-fixture-entry';
    },
    load(id) {
      if (id === '\0reader-native-fixture') return `export async function getCurrentAuthUser(){return {id:window.learningFixture.actor};}
        export async function getAuthAccessToken(){return '';}
        export function hasAuthSession(){return true;}
        export function authHeaders(){return {'X-Rinspace-CSRF':window.learningFixture.csrf};}`;
      if (id === '\0reader-dialog-fixture') return `export function requestAuthDialog(){throw Error('Unexpected login dialog in synthetic authenticated fixture');}`;
      if (id === '\0reader-fixture-entry') return `export {createReaderAgentHost} from ${JSON.stringify(resolve(root, 'src/features/reader/agentHost.ts'))};
        export {fingerprintPdf} from ${JSON.stringify(resolve(root, 'src/features/reader/fingerprint.ts'))};`;
    },
  }],
  build: { write: false, minify: false, rollupOptions: { input: 'reader-fixture-entry', preserveEntrySignatures: 'strict', output: { format: 'es', inlineDynamicImports: true } } },
});
const files = Array.isArray(bundle) ? bundle[0].output : bundle.output;
const code = files.find(file => file.type === 'chunk' && file.isEntry)?.code;
if (!code) throw new Error('Web host bundle missing');
await writeFile(bundlePath, code);
await writeFile(resolve(output, 'startup.json'), JSON.stringify({ stage: 'launching-browser' }));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
// Deny external network below the browser protocol. Fetch interception can
// pause fonts in a native PiP target before Playwright finishes attaching it.
const deniedProxyRequests = [];
const denyProxy = createServer((request, response) => { deniedProxyRequests.push(request.url); response.writeHead(403); response.end(); });
denyProxy.on('connect', (request, socket) => {
  deniedProxyRequests.push(request.url);
  // Chromium may reset a deliberately rejected CONNECT before Node flushes
  // the response. That is the isolation policy succeeding, not a test error.
  socket.on('error', () => {});
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
});
await new Promise(resolve => denyProxy.listen(0, '127.0.0.1', resolve));
const proxyAddress = denyProxy.address();
if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('Isolated deny proxy did not start');
const browser = await chromium.launch({ headless: false, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  proxy: { server: `http://127.0.0.1:${proxyAddress.port}`, bypass: `<-loopback>,127.0.0.1:${new URL(base).port}` },
  args: ['--disable-dev-shm-usage', '--window-size=1440,900', ...(process.env.READER_TEST_VOICE_WAV ?
    ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${process.env.READER_TEST_VOICE_WAV}`] : [])] });
// Prove that the bypass excludes other loopback ports, using an owned server.
let tripwireHits = 0;
const tripwire = createServer((_, response) => { tripwireHits++; response.writeHead(200); response.end('Must not be reached'); });
await new Promise(resolve => tripwire.listen(0, '127.0.0.1', resolve));
const tripwireAddress = tripwire.address();
if (!tripwireAddress || typeof tripwireAddress === 'string') throw new Error('Network guard tripwire did not start');
const tripwireURL = `http://127.0.0.1:${tripwireAddress.port}/network-guard-self-test`;
const guardContext = await browser.newContext();
try {
  const guardPage = await guardContext.newPage();
  try { await guardPage.goto(tripwireURL, { timeout: 5000 }); }
  catch (error) { if (!String(error).includes('ERR_HTTP_RESPONSE_CODE_FAILURE')) throw error; }
  assert.equal(tripwireHits, 0); assert.ok(deniedProxyRequests.includes(tripwireURL));
} finally { await guardContext.close(); await new Promise(resolve => tripwire.close(resolve)); }
const context = await browser.newContext({ viewport: null, ignoreHTTPSErrors: true });
const errors = [], network = [], failedResponses = [], failedResponseReads = [], consoleErrors = [];
context.on('request', request => {
  const url = request.url();
  if (!url.startsWith(base + '/') && !/^(blob:|data:)/.test(url)) network.push(url);
});
const page = await context.newPage();
const audioContexts = [], audioContextsDestroyed = [], audioSources = [];
await page.addInitScript(() => {
  window.__readerAudioPlayback = { starts: 0, stops: 0 };
  if (typeof AudioBufferSourceNode === 'undefined') return;
  const originalStart = AudioBufferSourceNode.prototype.start;
  const originalStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function(...args) {
    window.__readerAudioPlayback.starts++;
    return originalStart.apply(this, args);
  };
  AudioBufferSourceNode.prototype.stop = function(...args) {
    window.__readerAudioPlayback.stops++;
    return originalStop.apply(this, args);
  };
});
if (process.env.READER_TEST_VOICE_WAV) {
  const audio = await context.newCDPSession(page);
  audio.on('WebAudio.contextCreated', event => audioContexts.push(event.context.contextId));
  audio.on('WebAudio.contextWillBeDestroyed', event => audioContextsDestroyed.push(event.contextId));
  audio.on('WebAudio.audioNodeCreated', event => { if (event.node.nodeType === 'MediaStreamAudioSource') audioSources.push(event.node.nodeId); });
  await audio.send('WebAudio.enable');
}
page.on('response', response => {
  if (response.status() < 400) return;
  const failure = { url: response.url(), status: response.status(), request: response.request().postData() };
  failedResponses.push(failure);
  failedResponseReads.push(response.text().then(body => { failure.body = body; }).catch(() => {}));
});
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
async function nativeFocus(target) { const cdp = await context.newCDPSession(target); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await cdp.detach(); }
async function returnFromPiP(target) {
  const [closed, clicked] = await Promise.allSettled([
    target.waitForEvent('close', { timeout: 5000 }),
    target.getByRole('button', { name: '返回侧栏', exact: true }).click(),
  ]);
  if (closed.status === 'rejected') throw closed.reason;
  if (clicked.status === 'rejected' && !String(clicked.reason).includes('Target page, context or browser has been closed')) throw clicked.reason;
  await page.getByRole('button', { name: '画中画', exact: true }).waitFor({ state: 'visible' });
}
async function nativeScreenshot(target, path) {
  const cdp = await context.newCDPSession(target);
  try {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path, Buffer.from(result.data, 'base64'));
  } finally { await cdp.detach(); }
}
async function openReader(target = page) {
  await target.goto(base + '/'); await nativeFocus(target);
  await target.evaluate(async () => {
    window.learningFixture = await (await fetch('/fixture/bootstrap')).json();
    const { createReaderAgentHost, fingerprintPdf } = await import('/host.mjs');
    const { initReader } = await import('/viewer/embedpdf.js');
    const bytes = await (await fetch('/fixture.pdf')).arrayBuffer();
    const file = new Blob([bytes], { type: 'application/pdf' });
    const document = { id: '10000000-0000-4000-8000-000000000001', title: 'Original synthetic linear algebra.pdf', size: bytes.byteLength, lastModified: 0,
      contentVersion: await fingerprintPdf(file) };
    const owner = createReaderAgentHost(document);
    const send = owner.host.send;
    owner.host.send = async (...args) => { try { return await send(...args); } catch (error) { window.learningFixture.sendError = error.stack; throw error; } };
    window.learningFixture.owner = owner; window.learningFixture.document = document;
    window.learningFixture.reader = await initReader({ target: window.document.getElementById('viewer'), wasmUrl: new URL('/viewer/pdfium.wasm', location.href).href,
      documentId: document.id, title: document.title, buffer: bytes, host: owner.host, onOpenFile() {}, onClose() {}, onViewChange() {}, onReady() { window.learningFixture.ready = true; } });
  });
  await target.waitForFunction(() => window.learningFixture?.ready && window.learningFixture.owner.host.session().status === 'authenticated');
  await target.getByRole('button', { name: '琳', exact: true }).click();
}
const result = { schema: 'reader-learning-joint-browser/v2', scope: 'Actual Chromium, Web host, IndexedDB, EmbedPDF/PDFium and private SQL/HTTP; synthetic Native SDK/model and fixed producer HTML', checks: {} };
async function stage(value) { result.stage = value; await writeFile(resolve(output, 'progress.json'), JSON.stringify(result, null, 2) + '\n'); }
async function waitForFixture(predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await page.evaluate(async () => (await fetch('/fixture/status')).json());
    if (predicate(value)) return value;
    await page.waitForTimeout(100);
  }
  throw new Error(`Fixture status timed out: ${JSON.stringify(value)}`);
}
try {
  await stage('opening-reader');
  await openReader();
  await stage('sending-question');
  const input = page.locator('textarea');
  await input.fill('Explain the original page and keep the same session.');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.waitForFunction(async () => (await (await fetch('/fixture/status')).json()).posts === 2);
  await stage('opening-native-pip');
  await input.fill('Next question drafted while the answer is being prepared.');
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: '画中画', exact: true }).click();
  const pip = await popup; await nativeFocus(pip);
  await page.evaluate(() => fetch('/fixture/release', { method: 'POST' }));
  await stage('waiting-for-rendered-answer');
  await pip.getByRole('heading', { name: 'First', exact: true }).waitFor();
  assert.equal(await pip.locator('mjx-container').count(), 2);
  assert.equal(await pip.locator('mjx-assistive-mml math').count(), 2);
  assert.equal(await pip.locator('textarea').inputValue(), 'Next question drafted while the answer is being prepared.');
  result.checks.realPDFReadAndTypstHTMLInPiP = true;
  result.checks.draftPreservedDuringGeneration = true;
  await returnFromPiP(pip);
  await page.getByRole('heading', { name: 'First', exact: true }).waitFor();
  await page.reload();
  await stage('restoring-from-indexeddb');
  await openReader();
  await page.getByRole('heading', { name: 'First', exact: true }).waitFor();
  assert.equal(await page.locator('textarea').inputValue(), 'Next question drafted while the answer is being prepared.');
  const status = await page.evaluate(async () => (await fetch('/fixture/status')).json());
  assert.equal(status.posts, 2);
  assert.equal(status.personalOperations, 0);
  assert.equal(status.settled, 2);
  result.checks.actualOfficialContextCounter = status.counterVersion.startsWith('deepseek-v41-1017/recipe-0.2.0/');
  result.checks.actualDynamicRendererQueue = status.dynamicRenderer === true;
  if (status.voice) {
    assert.match(expectedVoiceRuntime, /^reader-voice-runtime\/v1:[0-9a-f]{64}$/);
    assert.match(status.voiceRuntime, /^reader-voice-runtime\/v1:[0-9a-f]{64}$/);
    assert.equal(status.voiceRuntime, expectedVoiceRuntime);
    assert.ok(Array.isArray(status.voiceReceiptStoreIds) && status.voiceReceiptStoreIds.length >= 1 &&
      status.voiceReceiptStoreIds.every(value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)));
    result.voiceRuntime = { runtime: status.voiceRuntime, receiptStoreIds: [...status.voiceReceiptStoreIds] };
    result.checks.voiceRuntimeAndReceiptStoreBoundInReceipt = true;
  } else assert.equal(expectedVoiceRuntime, '');
  if (status.dynamicRenderer) result.scope = 'Actual Chromium, Web/IndexedDB, EmbedPDF/PDFium, private SQL/HTTP and source-built public Renderer API/PostgreSQL queue/isolated Typst/MathJax; synthetic Native SDK and model. Not immutable release or production OCI acceptance.';
  result.checks.refreshWithoutModelReplay = true; result.checks.existingLedgerSettledExactlyTwice = true;
  result.checks.realFingerprintedVersion = await page.evaluate(() => window.learningFixture.document.contentVersion);
  result.checks.nativeWindowReturned = true;
  await page.screenshot({ path: resolve(output, 'joint-reader.png') });
  if (status.voice) {
    await stage('native-tts-playback-pip-return-stop-and-cache-replay');
    const beforePlayback = await page.evaluate(async () => (await fetch('/fixture/status')).json());
    assert.equal(beforePlayback.voiceOperations, 0); assert.equal(beforePlayback.voicePlaybacks, 0);
    const playbackPopup = context.waitForEvent('page');
    await page.getByRole('button', { name: '画中画', exact: true }).click();
    const listening = await playbackPopup; await nativeFocus(listening);
    await listening.getByRole('button', { name: '朗读', exact: true }).click();
    await listening.getByRole('button', { name: '停止朗读', exact: true }).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => window.__readerAudioPlayback?.starts > 0, undefined, { timeout: 30000 });
    // Cache replay is valid only after the original generation has a durable
    // terminal receipt. Stopping an unknown generation must cancel it instead.
    result.playbackCompletedBeforeStop = await waitForFixture(value => value.voiceCompleted === 1);
    await listening.waitForTimeout(150);
    await listening.screenshot({ path: resolve(output, 'voice-playback-pip.png') });
    await returnFromPiP(listening);
    assert.equal(await page.locator('textarea').inputValue(), 'Next question drafted while the answer is being prepared.');
    await page.getByRole('button', { name: '停止朗读', exact: true }).click();
    const resumePlayback = page.getByRole('button', { name: /^(继续)?朗读$/ });
    await resumePlayback.waitFor();
    const firstPlayback = await waitForFixture(value => value.voiceOperations === 1 && value.voiceCompleted === 1 && value.voicePlaybacks === 1 && value.voiceReceivedSamples > 0 && value.voicePlayedSamples > 0);
    result.playbackStopped = firstPlayback;
    const startsBeforeReplay = await page.evaluate(() => window.__readerAudioPlayback.starts);
    await resumePlayback.click();
    await page.waitForFunction(starts => window.__readerAudioPlayback?.starts > starts, startsBeforeReplay, { timeout: 30000 });
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: '停止朗读', exact: true }).click();
    await resumePlayback.waitFor();
    const replayed = await waitForFixture(value => value.voiceOperations === 1 && value.voiceCompleted === 1 && value.voicePlaybacks === 2 && value.voiceReceivedSamples > 0 && value.voicePlayedSamples > 0);
    const browserAudio = await page.evaluate(() => window.__readerAudioPlayback);
    assert.equal(replayed.posts, 2); assert.equal(replayed.settled, 2); assert.equal(replayed.personalOperations, 0);
    assert.ok(browserAudio.starts >= 2); assert.ok(browserAudio.stops >= 2);
    result.playback = { first: { receivedSamples: firstPlayback.voiceReceivedSamples, playedSamples: firstPlayback.voicePlayedSamples },
      replay: { receivedSamples: replayed.voiceReceivedSamples, playedSamples: replayed.voicePlayedSamples }, browserAudio };
    result.checks.realTTSPlaysInPiPReturnsToSidebarStopsAndReplaysCachedGeneration = true;
  }
  await stage('archiving-original-conversation');
  await page.evaluate(async () => {
    const { createReaderAgentHost } = await import('/host.mjs');
    window.learningFixture.staleOwner = createReaderAgentHost(window.learningFixture.document);
  });
  await page.waitForFunction(() => window.learningFixture.staleOwner.host.session().status === 'authenticated');
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await page.waitForFunction(() => window.learningFixture.owner.host.history(window.learningFixture.document.id).length === 1);
  assert.equal(await page.locator('textarea').inputValue(), '');
  await page.getByText('以往对话', { exact: true }).click();
  await page.getByText('Explain the original page and keep the same session.', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'First', exact: true }).waitFor();
  result.checks.newConversationKeepsOriginalContentAndDraft = await page.evaluate(async () => {
    const { owner, document } = window.learningFixture;
    const history = owner.host.history(document.id);
    const snapshot = await owner.host.readHistory(document.id, history[0].id);
    return snapshot.messages.length === 2 && snapshot.draft === 'Next question drafted while the answer is being prepared.' &&
      owner.host.restore(document.id).messages.length === 0;
  });
  assert.equal(result.checks.newConversationKeepsOriginalContentAndDraft, true);
  result.checks.staleTabCannotOverwriteIndexedDB = await page.evaluate(async () => {
    const { staleOwner, document } = window.learningFixture;
    staleOwner.host.save(document.id, { ...staleOwner.host.restore(document.id), draft: 'Stale tab overwrite' });
    try { await staleOwner.host.send({ documentId: document.id, message: 'Stale tab overwrite', tools: {}, signal: new AbortController().signal }); return false; }
    catch (error) { return error.message.includes('另一个页面已切换对话'); }
    finally { staleOwner.dispose(); }
  });
  assert.equal(result.checks.staleTabCannotOverwriteIndexedDB, true);
  await page.screenshot({ path: resolve(output, 'conversation-history.png') });
  await openReader();
  await page.getByText('以往对话', { exact: true }).waitFor();
  assert.equal(await page.locator('textarea').inputValue(), '');
  assert.equal((await page.evaluate(async () => (await fetch('/fixture/status')).json())).posts, 2);
  result.checks.archiveAndEmptyConversationSurviveRefresh = true;
  if (status.dynamicRenderer) {
    await stage('exercise-through-real-renderer');
    await page.locator('textarea').fill('给我一道向量练习。');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByRole('heading', { name: '一道练习', exact: true }).waitFor();
    await page.getByRole('button', { name: '提示', exact: true }).waitFor();
    await stage('confirming-original-pdf-region');
    await page.getByRole('button', { name: '引用原文区域', exact: true }).click();
    // beginRegionCapture is intentionally scheduled on the next animation
    // frame so PiP can close first. Cross two frames before the drag instead
    // of relying on the localized, transient hint-layer text.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const pageImages = page.locator('#document-content img:visible');
    const imageCount = await pageImages.count();
    let regionBox, regionImage = -1, regionArea = 0;
    for (let index = 0; index < imageCount; index++) {
      const box = await pageImages.nth(index).boundingBox();
      if (box && box.width * box.height > regionArea) { regionArea = box.width * box.height; regionBox = box; regionImage = index; }
    }
    assert.ok(regionImage >= 0 && regionBox && regionBox.width > 200 && regionBox.height > 200, 'actual PDF page image was not available for region capture');
    await page.mouse.move(regionBox.x + regionBox.width * 0.03, regionBox.y + regionBox.height * 0.01);
    await page.mouse.down();
    await page.mouse.move(regionBox.x + regionBox.width * 0.75, regionBox.y + regionBox.height * 0.16, { steps: 8 });
    await page.mouse.up();
    const regionText = page.locator('#rin-region-transcription');
    await regionText.waitFor({ state: 'visible', timeout: 10000 });
    await regionText.fill('用户核对：这个区域包含标题 Reader test page 1。');
    await page.screenshot({ path: resolve(output, 'region-confirmation.png') });
    await page.getByRole('button', { name: '加入琳', exact: true }).click();
    await page.getByText('第 1 页区域', { exact: true }).waitFor();
    await page.reload();
    await openReader();
    await page.getByRole('heading', { name: '一道练习', exact: true }).waitFor();
    await page.getByText('第 1 页区域', { exact: true }).waitFor();
    result.checks.actualPDFRegionCapturePreviewAndRefresh = true;
    await page.locator('textarea').fill('下一问先留在这里。');
    await page.getByRole('button', { name: '提示', exact: true }).click();
    await page.getByText('先检查两个向量是否成比例。', { exact: true }).waitFor();
    const afterHint = await page.evaluate(async () => (await fetch('/fixture/status')).json());
    assert.equal(afterHint.posts, 3); assert.equal(afterHint.settled, 3);
    assert.equal(await page.locator('textarea').inputValue(), '下一问先留在这里。');
    result.checks.savedHintRendersWithoutModelOrLosingDraft = true;
    await page.getByRole('button', { name: '作答', exact: true }).click();
    if (status.voice) {
      await stage('native-microphone-permission-and-pip');
      await context.grantPermissions([], { origin: base });
      await page.getByRole('button', { name: '语音', exact: true }).click();
      await page.getByText('麦克风权限未开启。', { exact: true }).waitFor();
      const afterDeniedMicrophone = await page.evaluate(async () => (await fetch('/fixture/status')).json());
      assert.equal(afterDeniedMicrophone.voiceOperations, 1); assert.equal(afterDeniedMicrophone.voicePlaybacks, 2);
      result.checks.deniedMicrophoneDoesNotDispatchSpeechOrModel = true;
      await context.grantPermissions(['microphone'], { origin: base });
      await page.getByRole('textbox', { name: '发给琳的消息', exact: true }).fill('我的作答：');
      const opened = context.waitForEvent('page');
      await page.getByRole('button', { name: '画中画', exact: true }).click();
      const speaking = await opened; await nativeFocus(speaking);
      await speaking.getByRole('button', { name: '语音', exact: true }).click();
      await speaking.getByRole('button', { name: '结束语音', exact: true }).waitFor({ timeout: 20000 });
      await returnFromPiP(speaking);
      await page.getByRole('heading', { name: '确认文字', exact: true }).waitFor({ timeout: 30000 });
      const transcript = await page.getByRole('textbox', { name: '语音文字', exact: true }).inputValue();
      assert.ok(transcript.trim());
      assert.equal(await page.getByRole('textbox', { name: '发给琳的消息', exact: true }).inputValue(), '我的作答：');
      const duringReview = await page.evaluate(async () => (await fetch('/fixture/status')).json());
      assert.equal(duringReview.posts, 3); assert.equal(duringReview.settled, 3); assert.equal(duringReview.voiceOperations, 2); assert.equal(duringReview.voiceCompleted, 2);
      await page.screenshot({ path: resolve(output, 'voice-transcript-review.png') });
      await page.getByRole('textbox', { name: '语音文字', exact: true }).fill('它们线性相关，因为第二个向量是第一个的两倍。');
      await page.getByRole('button', { name: '加入消息', exact: true }).click();
      await page.getByRole('heading', { name: '确认文字', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('textbox', { name: '发给琳的消息', exact: true }).inputValue(), '我的作答：\n它们线性相关，因为第二个向量是第一个的两倍。');
      const liveAudioContexts = audioContexts.filter(id => !audioContextsDestroyed.includes(id));
      result.voice = { transcript, audioContexts: audioContexts.length, destroyedAudioContexts: audioContextsDestroyed.length,
        liveAudioContexts: new Set(liveAudioContexts).size, audioSources: audioSources.length,
        input: 'original-synthetic-narration-wav-through-real-Chromium-microphone-and-WASM-Silero', realHuman: false };
      assert.equal(new Set(liveAudioContexts).size, 1); assert.equal(audioSources.length, 1);
      result.checks.realVADAndSTTReturnFromPiPKeepDraftAndRequireConfirmation = true;
    } else await page.locator('textarea').fill('它们线性相关，因为第二个向量是第一个的两倍。');
    await page.getByRole('button', { name: '提交作答', exact: true }).click();
    await page.getByRole('heading', { name: '反馈', exact: true }).waitFor();
    await page.getByText('琳的判断：正确', { exact: true }).waitFor();
    await page.getByText('已使用帮助', { exact: true }).waitFor();
    const afterAttempt = await page.evaluate(async () => (await fetch('/fixture/status')).json());
    assert.equal(afterAttempt.posts, 4); assert.equal(afterAttempt.settled, 4); assert.equal(afterAttempt.personalOperations, 0);
    assert.equal(afterAttempt.regionEvidence, true);
    await page.getByText('第 1 页区域', { exact: true }).waitFor({ state: 'hidden' });
    assert.ok(await page.locator('mjx-assistive-mml math').count() >= 3);
    result.checks.assistedAttemptUsesOriginalModelAndLedger = true;
    result.checks.confirmedRegionBoundToOriginalAnswer = true;
    await page.screenshot({ path: resolve(output, 'practice-and-feedback.png') });
    await openReader();
    await page.getByText('琳的判断：正确', { exact: true }).waitFor();
    await page.getByText('已使用帮助', { exact: true }).waitFor();
    assert.equal((await page.evaluate(async () => (await fetch('/fixture/status')).json())).posts, 4);
    result.checks.exerciseAndFeedbackSurviveRefreshWithoutReplay = true;
    await page.setViewportSize({ width: 390, height: 844 });
    // Native viewer changes sidebar visibility at its mobile breakpoint.
    // Reopen through its own toolbar before assessing the narrow lesson UI.
    await page.locator('textarea').waitFor({ state: 'visible', timeout: 2000 }).catch(async () => {
      await page.getByRole('button', { name: '琳', exact: true }).click();
    });
    await page.getByText('琳的判断：正确', { exact: true }).waitFor();
    // Trial click re-resolves the locator if the native responsive panel is
    // adopted while resizing; it scrolls without submitting a challenge.
    await page.getByRole('button', { name: '质疑反馈', exact: true }).click({ trial: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.screenshot({ path: resolve(output, 'practice-narrow.png') });
    await stage('deleting-current-and-archived-conversations');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('textarea').waitFor({ state: 'visible', timeout: 2000 }).catch(async () => {
      await page.getByRole('button', { name: '琳', exact: true }).click();
    });
    // A separate browser tab exercises BroadcastChannel, not same-window events.
    const peer = await context.newPage();
    peer.on('response', response => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() }); });
    peer.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await openReader(peer);
    await peer.getByRole('heading', { name: '反馈', exact: true }).waitFor();
    await page.bringToFront();
    const deletingPopup = context.waitForEvent('page');
    await page.getByRole('button', { name: '画中画', exact: true }).click();
    const deletingPiP = await deletingPopup; await nativeFocus(deletingPiP);
    await deletingPiP.getByRole('button', { name: '删除对话', exact: true }).click();
    await deletingPiP.getByRole('heading', { name: '删除这段对话？', exact: true }).waitFor();
    await deletingPiP.getByRole('heading', { name: '删除这段对话？', exact: true }).evaluate(async element => {
      const panel = element.parentElement.parentElement, view = element.ownerDocument.defaultView;
      const started = performance.now();
      while (view.getComputedStyle(panel).opacity !== '1') {
        if (performance.now() - started > 3000) throw new Error('Native deletion dialog did not finish its entry animation');
        await new Promise(resolve => view.setTimeout(resolve, 25));
      }
    });
    await deletingPiP.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise((_, reject) => setTimeout(() => reject(Error(JSON.stringify({
        reason: 'PiP mathematical fonts did not finish loading', baseURI: document.baseURI, fonts: Array.from(document.fonts, face => ({ family: face.family, status: face.status })),
        fontRules: Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type === 5).map(rule => rule.cssText); } catch { return []; } }),
      }))), 5000))]);
    });
    // Native dialog listeners follow the adopted root into the PiP document.
    await deletingPiP.keyboard.press('Escape');
    await deletingPiP.getByRole('heading', { name: '删除这段对话？', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await deletingPiP.getByRole('heading', { name: '反馈', exact: true }).count(), 1);
    result.checks.deleteConfirmationCanBeCancelledInNativePiP = true;
    await deletingPiP.screenshot({ path: resolve(output, 'mathematics-in-pip.png'), timeout: 5000 });
    await deletingPiP.getByRole('button', { name: '删除对话', exact: true }).click();
    await deletingPiP.getByRole('heading', { name: '删除这段对话？', exact: true }).waitFor();
    await deletingPiP.getByRole('heading', { name: '删除这段对话？', exact: true }).evaluate(async element => {
      const panel = element.parentElement.parentElement, view = element.ownerDocument.defaultView;
      const started = performance.now();
      while (view.getComputedStyle(panel).opacity !== '1') {
        if (performance.now() - started > 3000) throw new Error('Native deletion dialog did not finish its entry animation');
        await new Promise(resolve => view.setTimeout(resolve, 25));
      }
    });
    // Record actual font states and wait for the normal screenshot paint path.
    result.deleteDialogFonts = await deletingPiP.evaluate(() => ({ status: document.fonts.status,
      faces: Array.from(document.fonts, face => ({ family: face.family, status: face.status })) }));
    result.deleteDialogGeometry = await deletingPiP.getByRole('heading', { name: '删除这段对话？', exact: true }).evaluate(element => {
      const nodes = []; let current = element;
      while (current) {
        const view = current.ownerDocument.defaultView, style = view.getComputedStyle(current), rect = current.getBoundingClientRect();
        nodes.push({ tag: current.tagName, class: current.className, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, display: style.display,
          opacity: style.opacity, position: style.position, transform: style.transform, containerName: style.containerName });
        current = current.parentElement;
      }
      return { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio, baseURI: document.baseURI, visibility: document.visibilityState, nodes };
    });
    await deletingPiP.screenshot({ path: resolve(output, 'delete-confirmation-pip.png'), timeout: 5000 });
    await deletingPiP.getByRole('button', { name: '删除', exact: true }).click();
    await deletingPiP.getByRole('heading', { name: '反馈', exact: true }).waitFor({ state: 'hidden' });
    await peer.getByRole('heading', { name: '反馈', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await peer.locator('textarea').inputValue(), '');
    await returnFromPiP(deletingPiP);
    const afterDelete = await page.evaluate(async () => (await fetch('/fixture/status')).json());
    assert.equal(afterDelete.deletedSessions, 1); assert.equal(afterDelete.retainedDeletedContent, 0);
    assert.equal(afterDelete.posts, 4); assert.equal(afterDelete.settled, 4);
    result.checks.currentCloudDeletionClearsPeerWithoutModelOrLedgerReplay = true;
    await peer.close();
    await page.getByText('以往对话', { exact: true }).click();
    await page.getByText('Explain the original page and keep the same session.', { exact: true }).first().click();
    await page.getByRole('heading', { name: 'First', exact: true }).waitFor();
    await page.getByRole('button', { name: '删除对话', exact: true }).click();
    await page.getByRole('heading', { name: '删除这段对话？', exact: true }).waitFor();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByText('以往对话', { exact: true }).waitFor({ state: 'hidden' });
    const afterArchiveDelete = await page.evaluate(async () => (await fetch('/fixture/status')).json());
    assert.equal(afterArchiveDelete.deletedSessions, 2); assert.equal(afterArchiveDelete.retainedDeletedContent, 0);
    assert.equal(afterArchiveDelete.posts, 4); assert.equal(afterArchiveDelete.settled, 4); assert.equal(afterArchiveDelete.personalOperations, 0);
    const deletedArchiveRemains = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('rinspace-local-reader', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try { const values = await new Promise((resolve, reject) => { const request = db.transaction('agent').objectStore('agent').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        return JSON.stringify(values).includes('Explain the original page and keep the same session.');
      } finally { db.close(); }
    });
    assert.equal(deletedArchiveRemains, false);
    await openReader();
    assert.equal(await page.getByRole('heading', { name: '反馈', exact: true }).count(), 0);
    assert.equal(await page.getByText('以往对话', { exact: true }).count(), 0);
    assert.equal(await page.locator('textarea').inputValue(), '');
    result.checks.archivedCloudAndLocalContentStayDeletedAfterRefresh = true;
    await page.screenshot({ path: resolve(output, 'after-deleting-conversations.png') });
    await stage('expiring-local-learning-content');
    const retainedDocument = await page.evaluate(async () => {
      const fixture = window.learningFixture;
      const key = JSON.stringify(['reader-learning/v1', fixture.actor, fixture.document.id, fixture.document.contentVersion]);
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('rinspace-local-reader', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        const previous = await new Promise((resolve, reject) => { const request = db.transaction('agent').objectStore('agent').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        if (!previous?.learning || previous.deleting) throw Error('Expected fresh learning root before local expiry probe');
        const activityAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
        const history = [
          { id: 'expired-learning-archive', title: 'expired-learning-title', createdAt: new Date(activityAt).toISOString(), activityAt, cloud: true },
          { id: 'preserved-legacy-archive', title: 'legacy-retained-title', createdAt: new Date(activityAt).toISOString(), activityAt, cloud: false },
        ];
        const expired = { ...previous, activityAt, snapshot: { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'expired-learning-body' }] }], draft: 'expired-learning-draft' }, history };
        const record = { ...fixture.document, progress: { pageIndex: 2, zoom: 1.25 } };
        const tx = db.transaction(['agent', 'documents'], 'readwrite');
        const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
        const store = tx.objectStore('agent');
        store.put(expired, key);
        store.put({ ...expired, history: undefined }, JSON.stringify(['reader-conversation', key, history[0].id]));
        store.put({ conversationId: history[1].id, snapshot: { messages: [], draft: 'legacy-retained-body' } }, JSON.stringify(['reader-conversation', key, history[1].id]));
        tx.objectStore('documents').put(record);
        await done;
        return record;
      } finally { db.close(); }
    });
    await openReader();
    const expiry = await page.evaluate(async () => {
      const fixture = window.learningFixture;
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('rinspace-local-reader', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        const values = await new Promise((resolve, reject) => { const request = db.transaction('agent').objectStore('agent').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const document = await new Promise((resolve, reject) => { const request = db.transaction('documents').objectStore('documents').get(fixture.document.id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        return { values: JSON.stringify(values), document, snapshot: await fixture.owner.host.restore(fixture.document.id), history: fixture.owner.host.history(fixture.document.id) };
      } finally { db.close(); }
    });
    assert.equal(expiry.values.includes('expired-learning-'), false);
    assert.equal(expiry.values.includes('legacy-retained-body'), true);
    assert.deepEqual(expiry.document, retainedDocument);
    assert.equal(expiry.snapshot.draft, ''); assert.equal(expiry.snapshot.messages.length, 0);
    assert.deepEqual(expiry.history.map(item => item.id), ['preserved-legacy-archive']);
    const afterExpiry = await page.evaluate(async () => (await fetch('/fixture/status')).json());
    assert.equal(afterExpiry.posts, 4); assert.equal(afterExpiry.settled, 4); assert.equal(afterExpiry.personalOperations, 0);
    result.checks.localExpiryPhysicallyClearsLearningAndPreservesLegacyPdfAndProgress = true;
  }
  assert.deepEqual(errors, []); assert.deepEqual(network, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(failedResponses, []);
  result.passed = true;
} catch (error) {
  await Promise.allSettled(failedResponseReads);
  result.passed = false; result.error = error.stack; process.exitCode = 1;
  result.current = await page.evaluate(() => ({ ready: window.learningFixture?.ready, session: window.learningFixture?.owner?.host.session(), sendError: window.learningFixture?.sendError })).catch(() => null);
  result.windows = [];
  for (const target of context.pages()) {
    result.windows.push({ url: target.url(), alerts: await target.getByRole('alert').allTextContents(), text: await target.locator('body').innerText().catch(() => '') });
    await nativeScreenshot(target, resolve(output, `failure-window-${result.windows.length}.png`)).catch(() => {});
  }
  await nativeScreenshot(page, resolve(output, 'failure.png')).catch(() => {});
}
finally {
  result.browser = browser.version(); result.pageErrors = errors; result.unexpectedNetwork = network; result.failedResponses = failedResponses; result.consoleErrors = consoleErrors;
  result.networkIsolation = { mode: 'deny-proxy-exact-fixture-port-bypass', otherLoopbackPortBlocked: tripwireHits === 0, deniedRequests: deniedProxyRequests };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2)); await browser.close(); await new Promise(resolve => denyProxy.close(resolve));
}
