import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { learningSessionDriver, type LearningState } from './learningSession';
import type { LearningOperation, LearningResponse, LearningSession } from './learningProtocol';
import { requestJson, ServiceError } from '@/services/httpClient';
import type { ReaderDocument } from './types';

vi.mock('@/services/httpClient', async () => ({ ...(await vi.importActual('@/services/httpClient')), requestJson: vi.fn() }));
const document: ReaderDocument = { id: '10000000-0000-4000-8000-000000000001', contentVersion: 'pdf-tree-v1:' + 'a'.repeat(64), title: 'fixture.pdf', size: 10, lastModified: 0 };
const sessionId = '20000000-0000-4000-8000-000000000001';
const parentId = '40000000-0000-4000-8000-000000000001';
const childId = '40000000-0000-4000-8000-000000000002';
const textEvidence = (page: number, text = 'Original synthetic evidence') => ({
  id: `e-read-${page}`, documentVersion: document.contentVersion, page, text,
  digest: createHash('sha256').update(text).digest('hex'), startUTF16: 0, endUTF16: text.length,
  kind: 'text' as const, complete: true as const,
});
const oldLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  const held = new Set<string>();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (name: string, _options: unknown, callback: (lock: unknown) => Promise<unknown>) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  } });
});
afterEach(() => { if (oldLocks) Object.defineProperty(navigator, 'locks', oldLocks); else Reflect.deleteProperty(navigator, 'locks'); });

function harness() {
  let cache: LearningState | undefined;
  let evidenceAckLost = true;
  let available = true;
  let stopAckLost = false;
  let stopConflict = false;
  const stopKeys: string[] = [];
  const stopped = new Set<string>();
  const questionKeys: string[] = [], evidenceKeys: string[] = [];
  const modelCalls = new Set<string>();
  const view: LearningSession = { sessionId, documentId: document.id, documentVersion: document.contentVersion, profileDigest: 'b'.repeat(64),
    revision: 1, generation: 1, mediaEpoch: 1, status: 'ready', controller: { controllerId: '', fence: 0, expiresAt: '0001-01-01T00:00:00Z' } };
  const response = (operation?: LearningOperation): LearningResponse => structuredClone({ session: view, eventSequence: view.revision, replayed: false,
    readingContext: { documentVersion: document.contentVersion, profileDigest: view.profileDigest, maxPages: 24, maxChars: 80000 }, ...(operation ? { operation } : {}) });
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    expect(options?.auth).toBe('required');
    expect(path.startsWith('reader/v1/learning/')).toBe(true);
    const body = options?.body as Record<string, unknown>;
    if (path.endsWith('/commands')) {
      if (body.kind === 'stop') {
        stopKeys.push(JSON.stringify(body));
        if (stopConflict) { stopConflict = false; view.revision++; throw new ServiceError('Concurrent answer finished', 409, {}, 'VERSION_CONFLICT'); }
        if (!stopped.has(body.commandId as string)) {
          stopped.add(body.commandId as string); view.status = 'paused'; view.revision++; view.generation++; view.mediaEpoch++; delete view.activeOperation;
        }
        if (stopAckLost) { stopAckLost = false; throw new Error('lost stop acknowledgement'); }
        return response() as never;
      }
      view.controller = { controllerId: body.controllerId as string, fence: 1, expiresAt: new Date(Date.now() + 30000).toISOString() };
      return response() as never;
    }
    if (path.endsWith('/questions')) {
      expect(body).not.toHaveProperty('messages'); expect(body).not.toHaveProperty('tools'); expect(body).not.toHaveProperty('payer');
      questionKeys.push(body.commandId as string);
      view.status = 'working'; view.revision = 2; view.activeOperation = parentId;
      return response({ operationId: parentId, questionId: parentId, iteration: 1, state: 'prepared' }) as never;
    }
    if (path.endsWith('/evidence')) {
      evidenceKeys.push(body.commandId as string);
      expect(body.operationId).toBe(parentId);
      view.status = 'working'; view.revision = 3; view.activeOperation = childId;
      if (evidenceAckLost) { evidenceAckLost = false; throw new Error('lost evidence acknowledgement'); }
      return response({ operationId: childId, questionId: parentId, parentOperationId: parentId, iteration: 2, state: 'prepared' }) as never;
    }
    if (path.endsWith('/advance')) {
      modelCalls.add(body.operationId as string);
      if (body.operationId === parentId) return response({ operationId: parentId, questionId: parentId, iteration: 1, state: 'unknown',
        commands: [{ id: 'read-1', name: 'read_evidence', arguments: { pages: [1, 2] } }] }) as never;
      const html = '<section id="explain">Original synthetic explanation.</section>';
      view.status = 'ready'; view.revision = 4; delete view.activeOperation;
      return response({ operationId: childId, questionId: parentId, parentOperationId: parentId, iteration: 2, state: 'completed', lesson: {
        operationId: childId, revision: 3, html, htmlDigest: createHash('sha256').update(html).digest('hex'), resultHash: 'c'.repeat(64),
        view: { schema: 'reader-lesson-view/v1', next: 'done', steps: [{ id: 'explain', kind: 'explanation', narration: [], evidenceRefs: ['e-read-1'] }] },
      } }) as never;
    }
    return response() as never;
  });
  const tools = {
    info: () => ({ documentId: document.id, title: document.title, pageCount: 3, currentPage: 1 }),
    readPages: vi.fn(async (pages: number[]) => pages.map(page => ({ page, text: 'Original synthetic text' }))),
    selection: vi.fn(async (): Promise<{ page: number; text: string }[]> => []), search: vi.fn(async () => []), navigate: vi.fn(),
    readEvidence: vi.fn(async (pages: number[]) => ({ complete: true, pages: pages.map(page => textEvidence(page)) })),
  };
  const state: LearningState = { openingRequestId: '50000000-0000-4000-8000-000000000001' };
  const options = (value: LearningState) => ({ document, accountId: 'synthetic-learner', state: value, assertActive: () => {},
    persist: vi.fn(async () => { cache = structuredClone(value); }), reload: async () => structuredClone(cache), available: () => available });
  return { state, tools, options, questionKeys, evidenceKeys, modelCalls, stopKeys, cache: () => structuredClone(cache!), disable: () => { available = false; },
    failStop: () => { stopAckLost = true; }, conflictStop: () => { stopConflict = true; } };
}

test('voice retransmission keeps the original intent and never persists microphone data or dispatches a model', async () => {
  const setup = harness(), original = vi.mocked(requestJson).getMockImplementation()!;
  const bodies: string[] = [];
  const id = '70000000-0000-4000-8000-000000000001';
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (!path.includes('/voice/operations')) return original(path, options);
    const body = options?.body as Record<string, unknown>;
    if (path.endsWith('/voice/operations')) {
      bodies.push(JSON.stringify(body));
      if (bodies.length === 1) throw new TypeError('synthetic lost start acknowledgement');
      return { session: structuredClone(setup.state.session!), operationId: id, kind: 'stt', generation: 1, mediaEpoch: 1, state: 'unknown',
        contentAvailable: true, chunks: [], next: 0, hasMore: false, transcript: null, usage: null } as never;
    }
    expect(body).not.toHaveProperty('pcm16Base64');
    return { session: structuredClone(setup.state.session!), operationId: id, kind: 'stt', generation: 1, mediaEpoch: 1, state: 'completed',
      contentAvailable: true, chunks: [], next: 0, hasMore: false, transcript: '补上非零条件。',
      usage: { inputSamples: 2, generatedSamples: 0, bufferedSamples: 0, sampleRate: 16000, cpuMilliseconds: 500, wallMilliseconds: 600 } } as never;
  });
  const driver = learningSessionDriver(setup.options(setup.state));
  const transcript = await driver.voiceInput(new AbortController().signal, input => input.transcribe(id, new Uint8Array([0, 0, 1, 0])));
  expect(transcript).toBe('补上非零条件。'); expect(bodies).toHaveLength(2); expect(bodies[0]).toBe(bodies[1]);
  expect(setup.modelCalls.size).toBe(0); expect(setup.questionKeys).toHaveLength(0);
  const saved = JSON.stringify(setup.cache());
  expect(saved).not.toContain('pcm16Base64'); expect(saved).not.toContain(transcript);
  expect(setup.state.readingContext?.maxChars).toBe(80000);
});

test('a busy native voice slot backs off for one second and retries the exact intent', async () => {
  vi.useFakeTimers();
  try {
    const setup = harness(), original = vi.mocked(requestJson).getMockImplementation()!;
    const bodies: string[] = [];
    const id = '70000000-0000-4000-8000-000000000006';
    vi.mocked(requestJson).mockImplementation(async (path, options) => {
      if (!path.includes('/voice/operations')) return original(path, options);
      bodies.push(JSON.stringify(options?.body));
      if (bodies.length === 1) throw new ServiceError('busy', 429, { code: 'VOICE_BUSY' }, 'VOICE_BUSY');
      return { session: structuredClone(setup.state.session!), operationId: id, kind: 'stt', generation: 1, mediaEpoch: 1, state: 'completed',
        contentAvailable: true, chunks: [], next: 0, hasMore: false, transcript: '核对后的数学转录。',
        usage: { inputSamples: 2, generatedSamples: 0, bufferedSamples: 0, sampleRate: 16000, cpuMilliseconds: 1, wallMilliseconds: 2 } } as never;
    });
    const driver = learningSessionDriver(setup.options(setup.state));
    const pending = driver.voiceInput(new AbortController().signal, input => input.transcribe(id, new Uint8Array([0, 0])));
    await vi.advanceTimersByTimeAsync(0);
    expect(bodies).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(bodies).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('核对后的数学转录。');
    expect(bodies).toHaveLength(2); expect(bodies[0]).toBe(bodies[1]);
  } finally {
    vi.useRealTimers();
  }
});

test('a thirty minute media hold renews the same session instead of extending one native request', async () => {
  vi.useFakeTimers();
  try {
    const setup = harness(), driver = learningSessionDriver(setup.options(setup.state));
    let completed = false;
    const pending = driver.voicePlayback(new AbortController().signal, async playback => {
      expect(playback.signal.aborted).toBe(false);
      await new Promise<void>(resolve => setTimeout(resolve, 30 * 60 * 1000));
      return 'same-media-session';
    }).then(value => { completed = true; return value; });
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 - 1);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('same-media-session');
    const leaseCalls = vi.mocked(requestJson).mock.calls.filter(([path, options]) =>
      path.endsWith('/commands') && (options?.body as { kind?: string })?.kind === 'lease');
    expect(leaseCalls.length).toBeGreaterThanOrEqual(180);
    expect(setup.state.session).toMatchObject({ sessionId, generation: 1, mediaEpoch: 1 });
    expect(vi.mocked(requestJson).mock.calls.some(([path]) => path.includes('/voice/'))).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('a voice policy limit fails immediately instead of entering the busy-slot retry loop', async () => {
  const setup = harness(), original = vi.mocked(requestJson).getMockImplementation()!;
  let starts = 0;
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (!path.includes('/voice/operations')) return original(path, options);
    starts++;
    throw new ServiceError('limit', 429, { code: 'POLICY_LIMIT' }, 'POLICY_LIMIT');
  });
  const driver = learningSessionDriver(setup.options(setup.state));
  await expect(driver.voiceInput(new AbortController().signal, input =>
    input.transcribe('70000000-0000-4000-8000-000000000007', new Uint8Array([0, 0])))).rejects.toMatchObject({ code: 'POLICY_LIMIT' });
  expect(starts).toBe(1);
});

test('a malformed voice reply fails closed instead of retrying the same bad response', async () => {
  const setup = harness(), original = vi.mocked(requestJson).getMockImplementation()!;
  let starts = 0;
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (!path.includes('/voice/operations')) return original(path, options);
    starts++;
    return { session: structuredClone(setup.state.session!), operationId: '70000000-0000-4000-8000-000000000001', kind: 'stt', generation: 2, mediaEpoch: 1,
      state: 'unknown', contentAvailable: true, chunks: [], next: 0, hasMore: false, transcript: null, usage: null } as never;
  });
  const driver = learningSessionDriver(setup.options(setup.state));
  await expect(driver.voiceInput(new AbortController().signal, input => input.transcribe('70000000-0000-4000-8000-000000000001', new Uint8Array([0, 0])))).rejects.toThrow('语音数据无效');
  expect(starts).toBe(1);
});

test('the same host shares its controller and retains the browser lock until borrowed text work finishes', async () => {
  const setup = harness(), driver = learningSessionDriver(setup.options(setup.state));
  let releaseVoice!: () => void, releaseEvidence!: () => void;
  let voiceReady!: () => void, evidenceReady!: () => void;
  const ready = new Promise<void>(resolve => { voiceReady = resolve; });
  const reading = new Promise<void>(resolve => { evidenceReady = resolve; });
  const voiceHold = new Promise<void>(resolve => { releaseVoice = resolve; });
  const evidenceHold = new Promise<void>(resolve => { releaseEvidence = resolve; });
  setup.tools.readEvidence.mockImplementationOnce(async pages => {
    evidenceReady(); await evidenceHold;
    return { complete: true, pages: pages.map(page => textEvidence(page)) };
  });
  let resolved = false;
  const microphone = driver.voiceInput(new AbortController().signal, async () => { voiceReady(); await voiceHold; return 'done'; }).then(value => { resolved = true; return value; });
  await ready;
  const text = driver.send('Explain the condition.', setup.tools, new AbortController().signal);
  const failure = expect(text).rejects.toThrow('lost evidence acknowledgement');
  await reading; releaseVoice(); await Promise.resolve(); await Promise.resolve();
  expect(resolved).toBe(false);
  const other = learningSessionDriver(setup.options(setup.state));
  await expect(other.voiceInput(new AbortController().signal, async () => undefined)).rejects.toThrow('另一个页面');
  releaseEvidence(); await failure; expect(await microphone).toBe('done');
  await expect(other.voiceInput(new AbortController().signal, async () => 'available')).resolves.toBe('available');
});

test('refresh after an accepted evidence response is lost resumes the original command and question', async () => {
  const setup = harness();
  const first = learningSessionDriver(setup.options(setup.state));
  await expect(first.send('Explain the condition.', setup.tools, new AbortController().signal)).rejects.toThrow('lost evidence acknowledgement');
  expect(first.recoverable()).toBe(true); first.dispose();
  const recovered = setup.cache();
  const second = learningSessionDriver(setup.options(recovered));
  const reply = await second.send('Explain the condition.', setup.tools, new AbortController().signal);
  expect(reply.lesson.operationId).toBe(childId); expect(reply.pages).toEqual([1]);
  expect(setup.questionKeys).toHaveLength(1); expect(setup.evidenceKeys).toHaveLength(2);
  expect(setup.evidenceKeys[0]).toBe(setup.evidenceKeys[1]);
  expect([...setup.modelCalls]).toEqual([parentId, childId]);
  expect(setup.tools.readEvidence).toHaveBeenCalledTimes(1);
  const requestCount = vi.mocked(requestJson).mock.calls.filter(([path]) => path.endsWith('/advance')).length;
  await second.send('Explain the condition.', setup.tools, new AbortController().signal);
  expect(vi.mocked(requestJson).mock.calls.filter(([path]) => path.endsWith('/advance'))).toHaveLength(requestCount);
  second.dispose();
});

test('local persistence failure and an old viewer stop before any model request', async () => {
  const setup = harness();
  const options = setup.options(setup.state);
  options.persist.mockRejectedValue(new DOMException('Quota exceeded', 'QuotaExceededError'));
  const driver = learningSessionDriver(options);
  await expect(driver.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('Quota exceeded');
  expect(requestJson).not.toHaveBeenCalled();
  await expect(driver.send('Explain.', { ...setup.tools, readEvidence: undefined }, new AbortController().signal)).rejects.toThrow('阅读器需要更新');
  expect(requestJson).not.toHaveBeenCalled(); driver.dispose();
});

test('a changed account cannot continue reading local tools or dispatch another operation', async () => {
  const setup = harness();
  let current = true;
  setup.tools.readEvidence.mockImplementation(async pages => {
    current = false;
    return { complete: true, pages: pages.map(page => textEvidence(page, 'Original text')) };
  });
  const driver = learningSessionDriver({ ...setup.options(setup.state), assertActive: () => { if (!current) throw new Error('Account changed'); } });
  await expect(driver.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('Account changed');
  expect(setup.evidenceKeys).toHaveLength(0); expect([...setup.modelCalls]).toEqual([parentId]); driver.dispose();
});

test('another tab cannot share a live controller even when its tab-local identity was copied', async () => {
  const setup = harness();
  let finish!: () => void;
  const originalRead = setup.tools.readEvidence.getMockImplementation()!;
  setup.tools.readEvidence.mockImplementation(async pages => {
    await new Promise<void>(resolve => { finish = resolve; });
    return originalRead(pages);
  });
  const first = learningSessionDriver(setup.options(setup.state));
  const pending = first.send('Explain.', setup.tools, new AbortController().signal).catch(error => error as Error);
  await vi.waitFor(() => expect(setup.tools.readEvidence).toHaveBeenCalledOnce());
  const before = vi.mocked(requestJson).mock.calls.length;
  const second = learningSessionDriver(setup.options(setup.cache()));
  await expect(second.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('另一个页面');
  expect(requestJson).toHaveBeenCalledTimes(before);
  finish(); expect(await pending).toBeInstanceOf(Error);
  expect([...setup.modelCalls]).toEqual([parentId]); first.dispose(); second.dispose();
});

test('a lost stop response blocks further teaching and retries the original frozen stop command', async () => {
  const setup = harness();
  const driver = learningSessionDriver(setup.options(setup.state));
  await expect(driver.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('lost evidence acknowledgement');
  setup.failStop();
  await expect(driver.stop()).rejects.toThrow('lost stop acknowledgement');
  const before = vi.mocked(requestJson).mock.calls.length;
  await expect(driver.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('停止请求');
  expect(requestJson).toHaveBeenCalledTimes(before);
  await driver.stop();
  expect(setup.stopKeys).toHaveLength(2); expect(setup.stopKeys[0]).toBe(setup.stopKeys[1]);
  expect(driver.recoverable()).toBe(false); expect([...setup.modelCalls]).toEqual([parentId]); driver.dispose();
});

test('a confirmed stop revision conflict refreshes state while duplicate clicks share one stop', async () => {
  const setup = harness();
  const driver = learningSessionDriver(setup.options(setup.state));
  await expect(driver.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('lost evidence acknowledgement');
  setup.conflictStop();
  await Promise.all([driver.stop(), driver.stop()]);
  expect(setup.stopKeys).toHaveLength(2);
  const [rejected, accepted] = setup.stopKeys.map(value => JSON.parse(value));
  expect(accepted.commandId).not.toBe(rejected.commandId);
  expect(accepted.expectedRevision).toBe(rejected.expectedRevision + 1);
  expect(driver.recoverable()).toBe(false);
  expect([...setup.modelCalls]).toEqual([parentId]); driver.dispose();
});

test('selected mathematical text is frozen with its page and digest and is not reread during recovery', async () => {
  const setup = harness();
  const text = '若 α ∈ V，证明 λ α ∈ V。𝛼';
  setup.tools.selection.mockResolvedValue([{ page: 2, text }]);
  const first = learningSessionDriver(setup.options(setup.state));
  await expect(first.send('Explain the selection.', setup.tools, new AbortController().signal)).rejects.toThrow('lost evidence acknowledgement');
  const source = setup.cache().pending!.source;
  const digest = createHash('sha256').update(text).digest('hex');
  expect(source.evidence).toEqual([{ id: `selection-2-${digest}`, documentVersion: document.contentVersion, page: 2, text, digest, complete: true }]);
  first.dispose(); setup.tools.selection.mockResolvedValue([{ page: 3, text: 'A different later selection' }]);
  const recovered = learningSessionDriver(setup.options(setup.cache()));
  await recovered.send('Explain the selection.', setup.tools, new AbortController().signal);
  expect(setup.tools.selection).toHaveBeenCalledOnce();
  expect(setup.questionKeys).toHaveLength(1); recovered.dispose();
});

test('oversized or cross-page-invalid selection is rejected before registering a question', async () => {
  const setup = harness();
  const driver = learningSessionDriver(setup.options(setup.state));
  setup.tools.selection.mockResolvedValue([{ page: 2, text: 'α'.repeat(80001) }]);
  await expect(driver.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('缩小选区');
  setup.tools.selection.mockResolvedValue([{ page: 4, text: 'Out of bounds' }]);
  await expect(driver.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('缩小选区');
  expect(setup.questionKeys).toHaveLength(0); expect(setup.modelCalls.size).toBe(0); driver.dispose();
});

test('a user-confirmed PDF region is frozen with its page geometry and pixel digest', async () => {
  const setup = harness(), driver = learningSessionDriver(setup.options(setup.state));
  const text = '图中公式为 x²+y²=1。';
  const digest = createHash('sha256').update(text).digest('hex');
  const imageDigest = 'd'.repeat(64);
  const region = { x: 125000, y: 250000, width: 500000, height: 125000 };
  const id = 'region-' + createHash('sha256').update([document.contentVersion, 2, region.x, region.y, region.width, region.height, imageDigest, digest].join('\0')).digest('hex');
  const tools = { ...setup.tools, regions: () => [{ id, documentVersion: document.contentVersion, page: 2, text, digest, complete: true as const,
    kind: 'region-transcription' as const, region, imageDigest, confirmation: 'user' as const }] };
  await expect(driver.send('解释这个区域。', tools, new AbortController().signal)).rejects.toThrow('lost evidence acknowledgement');
  expect(setup.cache().pending!.source.evidence).toEqual([{ id, documentVersion: document.contentVersion, page: 2, text, digest, complete: true,
    kind: 'region-transcription', region, imageDigest, confirmation: 'user' }]);
  expect(setup.cache().evidencePages?.[id]).toBe(2);
  driver.dispose();
});

test('an unconfirmed or out-of-bounds region never registers a model question', async () => {
  const setup = harness(), driver = learningSessionDriver(setup.options(setup.state));
  const invalid = { id: 'region-' + 'e'.repeat(64), documentVersion: document.contentVersion, page: 2, text: 'guess', digest: 'f'.repeat(64), complete: true as const,
    kind: 'region-transcription' as const, region: { x: 900000, y: 0, width: 200000, height: 1 }, imageDigest: 'd'.repeat(64), confirmation: 'user' as const };
  await expect(driver.send('Explain.', { ...setup.tools, regions: () => [invalid] }, new AbortController().signal)).rejects.toThrow('选中的原文超过');
  expect(setup.questionKeys).toHaveLength(0);
  driver.dispose();
});

test('a recovered exercise keeps the original action and never changes it under the same command', async () => {
  const setup = harness();
  const first = learningSessionDriver(setup.options(setup.state));
  const action = { kind: 'attempt' as const, checkId: 'check-one' };
  await expect(first.send('My mathematical argument.', setup.tools, new AbortController().signal, action)).rejects.toThrow('lost evidence acknowledgement');
  expect(setup.cache().pending?.action).toEqual(action);
  action.checkId = 'mutated-outside-the-controller';
  expect(setup.cache().pending?.action?.checkId).toBe('check-one');
  first.dispose();
  const second = learningSessionDriver(setup.options(setup.cache()));
  await expect(second.send('My mathematical argument.', setup.tools, new AbortController().signal, { kind: 'reveal', checkId: 'check-one' })).rejects.toThrow('恢复或停止');
  expect(setup.questionKeys).toHaveLength(1);
  await expect(second.send('My mathematical argument.', setup.tools, new AbortController().signal, { kind: 'attempt', checkId: 'check-one' })).resolves.toMatchObject({ lesson: { operationId: childId } });
  const accepted = vi.mocked(requestJson).mock.calls.find(([path]) => path.endsWith('/questions'))![1]!.body;
  expect(accepted).toMatchObject({ action: { kind: 'attempt', checkId: 'check-one' } });
  expect(accepted).not.toHaveProperty('rubric'); second.dispose();
});

test('an explicit exhausted-hint rejection does not leave an unrecoverable pending task', async () => {
  const setup = harness();
  const original = vi.mocked(requestJson).getMockImplementation()!;
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (path.endsWith('/questions')) throw new ServiceError('No saved hint', 422, {}, 'CHECK_HINT_UNAVAILABLE');
    return original(path, options);
  });
  const driver = learningSessionDriver(setup.options(setup.state));
  await expect(driver.send('Give me a hint.', setup.tools, new AbortController().signal, { kind: 'hint', checkId: 'check-one' })).rejects.toThrow('没有更多已保存的提示');
  expect(driver.recoverable()).toBe(false);
  expect(setup.cache().pending?.failed).toBe(true);
  expect(setup.cache().exhaustedHints).toEqual(['check-one']);
  expect([...setup.modelCalls]).toEqual([]);
  await expect(driver.send('Bad action.', setup.tools, new AbortController().signal, { kind: 'hint', checkId: 'invalid id' })).rejects.toThrow('练习操作无效');
  // The invalid action must not strand the controller's single-flight flag.
  vi.mocked(requestJson).mockImplementation(original);
  await expect(driver.send('A different normal question.', setup.tools, new AbortController().signal)).rejects.toThrow('lost evidence acknowledgement');
  driver.dispose();
});

test('a lost deletion acknowledgement keeps its original intent across refresh and blocks further dispatch', async () => {
  const setup = harness();
  const original = vi.mocked(requestJson).getMockImplementation()!;
  const first = learningSessionDriver(setup.options(setup.state));
  await expect(first.send('Explain.', setup.tools, new AbortController().signal)).rejects.toThrow('lost evidence acknowledgement');
  const bodies: unknown[] = [];
  let deleted: LearningResponse | undefined;
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (!path.endsWith('/content')) return original(path, options);
    expect(options?.method).toBe('DELETE'); expect(options?.auth).toBe('required');
    expect(setup.cache().deleteRequest).toEqual(options?.body);
    expect(options?.body).not.toHaveProperty('controllerId'); expect(options?.body).not.toHaveProperty('payer');
    bodies.push(structuredClone(options?.body));
    if (!deleted) {
      deleted = await original(`reader/v1/learning/sessions/${sessionId}`, { auth: 'required' }) as LearningResponse;
      deleted.session.status = 'deleted'; deleted.session.revision++; deleted.session.generation++; deleted.session.mediaEpoch++;
      delete deleted.session.activeOperation; delete deleted.readingContext;
      throw new Error('lost deletion acknowledgement');
    }
    return structuredClone(deleted) as never;
  });
  await expect(first.deleteContent()).rejects.toThrow('lost deletion acknowledgement');
  expect(first.recoverable()).toBe(false); first.dispose();
  const recovered = setup.cache();
  const second = learningSessionDriver(setup.options(recovered));
  const before = vi.mocked(requestJson).mock.calls.length;
  await expect(second.send('New question.', setup.tools, new AbortController().signal)).rejects.toThrow('先确认学习记录的删除结果');
  await expect(second.stop()).rejects.toThrow('先确认学习记录的删除结果');
  expect(requestJson).toHaveBeenCalledTimes(before);
  await second.deleteContent();
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]);
  expect(setup.cache()).toMatchObject({ session: { status: 'deleted' } });
  expect(setup.cache().deleteRequest).toBeUndefined(); expect(setup.cache().pending).toBeUndefined();
  expect(setup.cache().readingContext).toBeUndefined(); expect(setup.cache().evidencePages).toBeUndefined();
  expect(setup.questionKeys).toHaveLength(1); expect([...setup.modelCalls]).toEqual([parentId]); second.dispose();
});

test('only an explicit revision rejection may replace a persisted deletion command', async () => {
  const setup = harness();
  const original = vi.mocked(requestJson).getMockImplementation()!;
  const current = await original(`reader/v1/learning/sessions/${sessionId}`, { auth: 'required' }) as LearningResponse;
  setup.state.session = structuredClone(current.session);
  const bodies: { commandId: string; expectedRevision: number }[] = [];
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (path.endsWith('/content')) {
      const body = options?.body as { commandId: string; expectedRevision: number };
      expect(setup.cache().deleteRequest).toEqual(body); bodies.push(structuredClone(body));
      if (bodies.length === 1) { current.session.revision++; throw new ServiceError('Concurrent result', 409, {}, 'VERSION_CONFLICT'); }
      current.session.status = 'deleted'; current.session.revision++; current.session.generation++; current.session.mediaEpoch++;
      delete current.readingContext; return structuredClone(current) as never;
    }
    expect(options?.method).toBe('GET'); return structuredClone(current) as never;
  });
  const driver = learningSessionDriver(setup.options(setup.state));
  await driver.deleteContent();
  expect(bodies).toHaveLength(2); expect(bodies[0].commandId).not.toBe(bodies[1].commandId);
  expect(bodies[1].expectedRevision).toBe(bodies[0].expectedRevision + 1);
  expect(setup.cache().session?.status).toBe('deleted'); expect(setup.cache().deleteRequest).toBeUndefined();
  expect(setup.modelCalls.size).toBe(0); driver.dispose();
});

test('deletion never opens an empty remote session and never dispatches before saving its intent', async () => {
  const setup = harness();
  const options = setup.options(setup.state);
  const driver = learningSessionDriver(options);
  const original = vi.mocked(requestJson).getMockImplementation()!;
  vi.mocked(requestJson).mockImplementation(async (path, request) => {
    if (path.endsWith('/recover')) throw new ServiceError('No previous opening', 404, {}, 'NOT_FOUND');
    return original(path, request);
  });
  await driver.deleteContent();
  expect(vi.mocked(requestJson).mock.calls).toHaveLength(1);
  expect(vi.mocked(requestJson).mock.calls[0]).toMatchObject(['reader/v1/learning/sessions/recover', { method: 'POST', body: { requestId: setup.state.openingRequestId } }]);
  const current = await original(`reader/v1/learning/sessions/${sessionId}`, { auth: 'required' }) as LearningResponse;
  setup.state.session = current.session;
  options.persist.mockRejectedValue(new DOMException('Storage full', 'QuotaExceededError'));
  await expect(driver.deleteContent()).rejects.toThrow('Storage full');
  expect(vi.mocked(requestJson).mock.calls.every(([path]) => !path.endsWith('/content'))).toBe(true);
  expect(setup.modelCalls.size).toBe(0); driver.dispose();
});

test('deletion recovers a committed opening whose response was lost without opening a replacement session', async () => {
  const setup = harness(), original = vi.mocked(requestJson).getMockImplementation()!;
  const requests: string[] = [];
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    requests.push(path);
    if (path.endsWith('/sessions/recover')) {
      expect(options?.body).toMatchObject({ requestId: setup.state.openingRequestId, documentId: document.id, documentVersion: document.contentVersion });
      return original(`reader/v1/learning/sessions/${sessionId}`, { auth: 'required' });
    }
    if (path.endsWith('/content')) {
      const result = await original(`reader/v1/learning/sessions/${sessionId}`, { auth: 'required' }) as LearningResponse;
      result.session.status = 'deleted'; result.session.revision++; result.session.generation++; result.session.mediaEpoch++;
      delete result.readingContext; return result as never;
    }
    return original(path, options);
  });
  const driver = learningSessionDriver(setup.options(setup.state));
  await driver.deleteContent();
  expect(requests[0]).toBe('reader/v1/learning/sessions/recover');
  expect(requests.filter(path => path.endsWith('/content'))).toHaveLength(1);
  expect(requests.some(path => path.endsWith('/sessions') || path.endsWith('/questions') || path.endsWith('/commands'))).toBe(false);
  expect(setup.cache().session?.status).toBe('deleted'); expect(setup.modelCalls.size).toBe(0); driver.dispose();
});
