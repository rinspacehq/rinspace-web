import { beforeEach, expect, test, vi } from 'vitest';
import { createReaderAgentHost, runReaderTool } from './agentHost';
import { getCurrentAuthUser } from '@/services/phoneAuth';
import { writeReaderAgent, ReaderConversationChangedError } from './storage';
import { requestJson, ServiceError } from '@/services/httpClient';
import type { RinDocumentTools } from '@rinspacehq/embedpdf-snippet/dist/reader-api';
import type { ReaderDocument } from './types';
import type { ReaderVoiceSessionControls } from './voiceSession';

const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock('./storage', async () => ({
  ...(await vi.importActual('./storage')),
  readReaderAgent: vi.fn(async (key: string) => structuredClone(records.get(key))),
  readReaderConversation: vi.fn(async (key: string, id: string) => structuredClone(records.get(JSON.stringify(['reader-conversation', key, id])))),
  pruneExpiredReaderLearning: vi.fn(async () => false), // Real IndexedDB expiry is exercised by the joint browser suite.
  writeReaderAgent: vi.fn(async (key: string, value: unknown, expected?: { conversationId?: string }, archive?: { id: string; value: unknown }, removeArchive?: string) => {
    if (expected && (records.get(key) as { conversationId?: string } | undefined)?.conversationId !== expected.conversationId) throw new ReaderConversationChangedError('另一个页面已切换对话，请刷新。');
    if (archive) records.set(JSON.stringify(['reader-conversation', key, archive.id]), structuredClone(archive.value));
    if (removeArchive) records.delete(JSON.stringify(['reader-conversation', key, removeArchive]));
    records.set(key, structuredClone(value));
  }),
}));
vi.mock('@/services/phoneAuth', () => ({ getCurrentAuthUser: vi.fn() }));
vi.mock('@/services/httpClient', async () => ({ ...(await vi.importActual('@/services/httpClient')), requestJson: vi.fn() }));
vi.mock('@/utils/authDialog', () => ({ requestAuthDialog: vi.fn() }));
const document: ReaderDocument = { id: '10000000-0000-4000-8000-000000000001', contentVersion: 'pdf-tree-v1:' + 'a'.repeat(64), title: 'fixture.pdf', size: 10, lastModified: 0 };
const learningRecordKey = () => JSON.stringify(['reader-learning/v1', 'reader-a', document.id, document.contentVersion]);
const tools: RinDocumentTools = {
  info: () => ({ documentId: document.id, title: document.title, pageCount: 3, currentPage: 1 }),
  readPages: vi.fn(async (pages: number[]) => pages.map(page => ({ page, text: 'Heading text' }))),
  selection: vi.fn(async () => []), search: vi.fn(async () => []), navigate: vi.fn(),
};
beforeEach(() => {
  records.clear(); vi.clearAllMocks();
  vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: 'reader-a' } as Awaited<ReturnType<typeof getCurrentAuthUser>>);
  vi.mocked(requestJson).mockImplementation(async path => path.endsWith('/test-mode') ? { enabled: false } as never : undefined as never);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

test('only exposes bounded PDF tools', async () => {
  await expect(runReaderTool({ id: 'x', name: 'write_file', input: {} }, tools)).rejects.toThrow('不支持');
  await expect(runReaderTool({ id: 'x', name: 'read_pages', input: { pages: Array.from({ length: 9 }, (_, i) => i + 1) } }, tools)).rejects.toThrow('页码');
  expect(tools.readPages).not.toHaveBeenCalled();
});

test('refresh and retry reuse the saved operation after an unknown response', async () => {
  const operations: string[] = [];
  let creationCount = 0;
  let fail = true;
  const run = { id: '20000000-0000-4000-8000-000000000001', source: 'reader', projectId: document.id, documentVersion: document.contentVersion, status: 'ACTIVE', billing: { goodnessChargedSg: '0', pendingTurns: 0 } };
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (path.endsWith('/config')) return { enabled: true, maxIterations: 8 } as never;
    if (path.endsWith('/runs')) { creationCount++; return run as never; }
    if (path.endsWith('/turns')) {
      operations.push((options?.body as { operationKey: string }).operationKey);
      if (fail) { fail = false; throw new Error('connection lost'); }
      return { text: 'Answer', finishReason: 'stop' } as never;
    }
    return run as never;
  });
  const first = createReaderAgentHost(document);
  await vi.waitFor(() => expect(first.host.session().status).toBe('authenticated'));
  first.host.save(document.id, { messages: [], draft: 'Explain', running: true });
  await expect(first.host.send({ documentId: document.id, message: 'Explain', tools, signal: new AbortController().signal })).rejects.toThrow('connection lost');
  first.dispose();
  const second = createReaderAgentHost(document);
  await vi.waitFor(() => expect(second.host.session().status).toBe('authenticated'));
  expect(vi.mocked(requestJson).mock.calls.filter(([path]) => path !== 'reader/v1/learning/config')).toHaveLength(5); // Original protocol: two mode reads, config, run, turn.
  expect(second.host.restore(document.id)).toMatchObject({ draft: 'Explain', recoverable: true });
  await expect(second.host.send({ documentId: document.id, message: 'Explain', tools, signal: new AbortController().signal })).resolves.toMatchObject({ text: 'Answer', costSG: 0 });
  expect(creationCount).toBe(1); expect(operations).toHaveLength(2); expect(operations[0]).toBe(operations[1]);
  second.dispose();
});

test('changing accounts does not reveal the previous account draft', async () => {
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().accountId).toBe('reader-a'));
  instance.host.save(document.id, { messages: [], draft: 'Private draft', running: false });
  vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: 'reader-b' } as Awaited<ReturnType<typeof getCurrentAuthUser>>);
  window.dispatchEvent(new Event('rinspace-session-changed'));
  await vi.waitFor(() => expect(instance.host.session().accountId).toBe('reader-b'));
  expect(instance.host.restore(document.id)).toBeUndefined();
  expect(vi.mocked(requestJson).mock.calls.every(([path]) => path.endsWith('/test-mode') || path === 'reader/v1/learning/config')).toBe(true);
  instance.dispose();
});

test('local persistence failure prevents a paid request', async () => {
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().status).toBe('authenticated'));
  vi.mocked(writeReaderAgent).mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
  instance.host.save(document.id, { messages: [], draft: 'Explain', running: true });
  await expect(instance.host.send({ documentId: document.id, message: 'Explain', tools, signal: new AbortController().signal })).rejects.toThrow('无法保存');
  expect(vi.mocked(requestJson).mock.calls.every(([path]) => path.endsWith('/test-mode') || path === 'reader/v1/learning/config')).toBe(true); instance.dispose();
});

test('server policy failures produce actionable copy without dispatching a run', async () => {
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().status).toBe('authenticated'));
  vi.mocked(requestJson).mockRejectedValueOnce(new ServiceError('{"code":"POLICY_LIMIT"}', 429, { code: 'POLICY_LIMIT' }, 'POLICY_LIMIT'));
  await expect(instance.host.send({ documentId: document.id, message: 'Explain', tools, signal: new AbortController().signal })).rejects.toThrow('额度或调用限额');
  expect(vi.mocked(requestJson).mock.calls.filter(([path]) => path !== 'reader/v1/learning/config')).toHaveLength(2); instance.dispose();
});

test('anonymous Reader test mode completes a PDF question without wallet calls', async () => {
  vi.mocked(getCurrentAuthUser).mockResolvedValue(null);
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (path.endsWith('/test-mode')) return { enabled: true, maxIterations: 8 } as never;
    if (path.endsWith('/test/turns')) {
      expect(options?.auth).toBe('none');
      expect((options?.body as { documentId: string }).documentId).toBe(document.id);
      return { text: '**Answer** [p:1]', finishReason: 'stop', usage: { inputTokens: 20, outputTokens: 5 } } as never;
    }
    throw new Error(`unexpected paid route: ${path}`);
  });
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().status).toBe('test'));
  const reply = await instance.host.send({ documentId: document.id, message: 'Explain page 1', tools, signal: new AbortController().signal });
  expect(reply).toMatchObject({ text: '**Answer** [p:1]', usage: { inputTokens: 20, outputTokens: 5 } });
  expect(reply.costSG).toBeUndefined();
  expect(vi.mocked(requestJson).mock.calls.some(([path]) => path.includes('/runs'))).toBe(false);
  instance.dispose();
});

test('same-account focus refresh preserves an anonymous test conversation', async () => {
  vi.mocked(getCurrentAuthUser).mockResolvedValue(null);
  vi.mocked(requestJson).mockImplementation(async path => {
    if (path.endsWith('/test-mode')) return { enabled: true, maxIterations: 8 } as never;
    if (path.endsWith('/test/turns')) return { text: 'Answer', finishReason: 'stop' } as never;
    throw new Error(`unexpected route: ${path}`);
  });
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().status).toBe('test'));
  instance.host.save(document.id, { messages: [], draft: 'Explain', running: true });
  const statuses: string[] = [];
  const unsubscribe = instance.host.subscribeSession(() => { statuses.push(instance.host.session().status); });
  window.dispatchEvent(new Event('focus'));
  await vi.waitFor(() => expect(vi.mocked(requestJson).mock.calls.filter(([path]) => path.endsWith('/test-mode'))).toHaveLength(2));
  expect(statuses).not.toContain('loading');
  expect(instance.host.restore(document.id)).toMatchObject({ draft: 'Explain', running: false });
  unsubscribe(); instance.dispose();
});

test('Native recovery failures never create an anonymous test identity', async () => {
  vi.mocked(getCurrentAuthUser).mockRejectedValue(new Error('temporary identity recovery failure'));
  vi.mocked(requestJson).mockResolvedValue({ enabled: true, maxIterations: 8 } as never);
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(getCurrentAuthUser).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(instance.host.session()).toEqual({ status: 'loading' });
  await expect(instance.host.send({ documentId: document.id, message: 'Private question', tools, signal: new AbortController().signal })).rejects.toThrow('账号');
  expect(records.size).toBe(0);
  expect(vi.mocked(requestJson).mock.calls.every(([path]) => path.endsWith('/test-mode'))).toBe(true);
  vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: 'reader-a' } as Awaited<ReturnType<typeof getCurrentAuthUser>>);
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(instance.host.session()).toMatchObject({ status: 'test', accountId: 'reader-test:reader-a' }));
  instance.dispose();
});

test('account transition hides drafts while Native identity is still resolving', async () => {
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().accountId).toBe('reader-a'));
  instance.host.save(document.id, { messages: [], draft: 'Private account A draft', running: false });
  let resolveUser!: (value: Awaited<ReturnType<typeof getCurrentAuthUser>>) => void;
  vi.mocked(getCurrentAuthUser).mockImplementation(() => new Promise(resolve => { resolveUser = resolve; }));
  window.dispatchEvent(new Event('rinspace-session-changed'));
  expect(instance.host.session().status).toBe('loading');
  expect(instance.host.restore(document.id)).toBeUndefined();
  resolveUser({ id: 'reader-b' } as Awaited<ReturnType<typeof getCurrentAuthUser>>);
  await vi.waitFor(() => expect(instance.host.session().accountId).toBe('reader-b'));
  expect(instance.host.restore(document.id)).toBeUndefined();
  instance.dispose();
});

test('authorized learning uses the existing Native host and recovers its answer after configuration closes', async () => {
  const sessionId = '20000000-0000-4000-8000-000000000010';
  const operationId = '40000000-0000-4000-8000-000000000010';
  let enabled = true, revision = 1, controllerId = '', running = false;
  const frame = (operation?: unknown) => ({ eventSequence: revision, replayed: false,
    session: { sessionId, documentId: document.id, documentVersion: document.contentVersion, profileDigest: 'b'.repeat(64), revision, generation: 1, mediaEpoch: 1,
      status: running ? 'working' : 'ready', ...(running ? { activeOperation: operationId } : {}), controller: { controllerId, fence: controllerId ? 1 : 0, expiresAt: '2099-01-01T00:00:00Z' } },
    readingContext: { documentVersion: document.contentVersion, profileDigest: 'b'.repeat(64), maxPages: 24, maxChars: 80000 }, ...(operation ? { operation } : {}) });
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (path.endsWith('/test-mode')) return { enabled: true, maxIterations: 8 } as never;
    if (path === 'reader/v1/learning/config') return { enabled, protocol: 'reader-learning/v1', profileDigest: 'b'.repeat(64), maxPages: 24, maxChars: 80000, maxIterations: 32 } as never;
    expect(path.startsWith('reader/v1/learning/')).toBe(true); expect(options?.auth).toBe('required');
    if (path.endsWith('/commands')) { controllerId = (options?.body as { controllerId: string }).controllerId; return frame() as never; }
    if (path.endsWith('/questions')) {
      running = true; revision = 2;
      return frame({ operationId, questionId: operationId, iteration: 1, state: 'prepared' }) as never;
    }
    if (path.endsWith('/advance')) {
      running = false; revision = 3;
      return frame({ operationId, questionId: operationId, iteration: 1, state: 'completed', lesson: { operationId, revision: 2,
        html: '<section id="explain">Synthetic rendered teaching.</section>', htmlDigest: 'c'.repeat(64), resultHash: 'd'.repeat(64),
        view: { schema: 'reader-lesson-view/v1', steps: [{ id: 'explain', kind: 'explanation', evidenceRefs: [], narration: [] }], next: 'done' } } }) as never;
    }
    return frame() as never;
  });
  const learningTools = { ...tools, readEvidence: vi.fn(async () => ({ pages: [], complete: true })) };
  const first = createReaderAgentHost(document);
  await vi.waitFor(() => expect(first.host.session()).toEqual({ status: 'authenticated', accountId: 'reader-a' }));
  first.host.save(document.id, { messages: [], draft: 'Explain', running: true });
  await expect(first.host.send({ documentId: document.id, message: 'Explain', tools: learningTools, signal: new AbortController().signal })).resolves.toMatchObject({ text: '', lesson: { operationId } });
  expect(first.host.readingContext(document.id)).toMatchObject({ maxPages: 24, maxChars: 80000 });
  first.dispose(); enabled = false;
  const second = createReaderAgentHost(document);
  await vi.waitFor(() => expect(second.host.session()).toEqual({ status: 'authenticated', accountId: 'reader-a' }));
  expect(second.host.restore(document.id)).toMatchObject({ draft: 'Explain', recoverable: true });
  await expect(second.host.send({ documentId: document.id, message: 'Explain', tools: learningTools, signal: new AbortController().signal })).resolves.toMatchObject({ lesson: { operationId } });
  expect(vi.mocked(requestJson).mock.calls.filter(([path]) => path.endsWith('/advance'))).toHaveLength(1);
  expect(vi.mocked(requestJson).mock.calls.filter(([path]) => path.endsWith('/questions'))).toHaveLength(1);
  expect(vi.mocked(requestJson).mock.calls.some(([path]) => path.includes('/agent/test/turns') || path.includes('/agent/runs'))).toBe(false);
  const lesson = (records.values().next().value as { learning: { pending: { reply: { lesson: unknown } } } }).learning.pending.reply.lesson;
  second.host.save(document.id, { messages: [{ role: 'assistant', text: '', lesson } as never], draft: 'A new draft typed during generation', running: false });
  expect(second.host.restore(document.id)).toMatchObject({ draft: 'A new draft typed during generation', recoverable: false });
  second.dispose();
});

async function withConversationLocks(run: () => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'locks');
  const active = new Set<string>();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (key: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
      if (active.has(key)) return callback(null);
      active.add(key);
      try { return await callback({ name: key }); } finally { active.delete(key); }
    },
  } });
  try { await run(); } finally {
    if (original) Object.defineProperty(navigator, 'locks', original);
    else Reflect.deleteProperty(navigator, 'locks');
  }
}

function enableLearning() {
  vi.mocked(requestJson).mockImplementation(async path => path === 'reader/v1/learning/config'
    ? { enabled: true, protocol: 'reader-learning/v1', profileDigest: 'c'.repeat(64), maxPages: 24, maxChars: 80000, maxIterations: 32 } as never
    : { enabled: false } as never);
}

async function withVoiceSupport(run: () => Promise<void>) {
  const audio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const worklet = Object.getOwnPropertyDescriptor(globalThis, 'AudioWorkletNode');
  const media = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class {} });
  Object.defineProperty(globalThis, 'AudioWorkletNode', { configurable: true, value: class {} });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  try { await run(); } finally {
    if (audio) Object.defineProperty(globalThis, 'AudioContext', audio); else Reflect.deleteProperty(globalThis, 'AudioContext');
    if (worklet) Object.defineProperty(globalThis, 'AudioWorkletNode', worklet); else Reflect.deleteProperty(globalThis, 'AudioWorkletNode');
    if (media) Object.defineProperty(navigator, 'mediaDevices', media); else Reflect.deleteProperty(navigator, 'mediaDevices');
  }
}

test('a narration return point survives a host rebuild and an idle pre-input stop', async () => {
  await withConversationLocks(() => withVoiceSupport(async () => {
    vi.mocked(requestJson).mockImplementation(async path => path === 'reader/v1/learning/config'
      ? { enabled: true, protocol: 'reader-learning/v1', profileDigest: 'c'.repeat(64), maxPages: 24, maxChars: 80000, maxIterations: 32, voiceEnabled: true } as never
      : { enabled: false } as never);
    const resumeSource = { operationId: '29000000-0000-4000-8000-000000000001', stepId: 'proof', narrationIndex: 1, lessonResultHash: 'd'.repeat(64) };
    records.set(learningRecordKey(), { conversationId: 'voice-resume-conversation', activityAt: Date.now(),
      snapshot: { messages: [], draft: '', running: false },
      learning: { openingRequestId: '29000000-0000-4000-8000-000000000002', voiceResume: resumeSource } });

    const first = createReaderAgentHost(document);
    await vi.waitFor(() => expect(first.host.session().accountId).toBe('reader-a'));
    const voice = first.host.voice?.(document.id) as ReaderVoiceSessionControls | undefined;
    expect(voice?.snapshot().playback?.resumeSource).toEqual(resumeSource);
    await voice?.stopPlayback?.();
    expect(records.get(learningRecordKey())).toMatchObject({ learning: { voiceResume: resumeSource } });
    first.dispose();

    const restored = createReaderAgentHost(document);
    try {
      await vi.waitFor(() => expect(restored.host.session().accountId).toBe('reader-a'));
      const restoredVoice = restored.host.voice?.(document.id) as ReaderVoiceSessionControls | undefined;
      expect(restoredVoice?.snapshot().playback?.resumeSource).toEqual(resumeSource);
    } finally { restored.dispose(); }
  }));
});

test('explicit new conversation preserves old paid history and draft without dispatching a model', async () => {
  await withConversationLocks(async () => {
    enableLearning();
    const key = JSON.stringify(['reader-a', document.id, document.contentVersion]);
    records.set(key, { snapshot: { messages: [{ role: 'user', text: 'Old paid question' }, { role: 'assistant', text: 'Old paid answer' }], draft: 'Old unsent draft', running: false }, contentConsent: true });
    const owner = createReaderAgentHost(document);
    await vi.waitFor(() => expect(owner.host.session().accountId).toBe('reader-a'));
    expect(owner.host.canStartConversation(document.id)).toBe(true);
    await owner.host.newConversation(document.id);
    expect(owner.host.restore(document.id)).toMatchObject({ messages: [], draft: '', running: false });
    expect(owner.host.history(document.id)).toMatchObject([{ title: 'Old paid question' }]);
    expect(await owner.host.readHistory(document.id, owner.host.history(document.id)[0].id)).toMatchObject({ messages: [{ text: 'Old paid question' }, { text: 'Old paid answer' }], draft: 'Old unsent draft' });
    const stored = records.get(learningRecordKey()) as { conversationId: string; learning: { openingRequestId: string }; contentConsent?: boolean };
    expect(stored.conversationId).toBeTruthy(); expect(stored.learning.openingRequestId).toBeTruthy();
    expect(stored.contentConsent).toBeUndefined();
    owner.dispose();
    const restored = createReaderAgentHost(document);
    await vi.waitFor(() => expect(restored.host.session().accountId).toBe('reader-a'));
    expect((await restored.host.readHistory(document.id, restored.host.history(document.id)[0].id)).draft).toBe('Old unsent draft');
    expect((records.get(learningRecordKey()) as { history: unknown[] }).history[0]).not.toHaveProperty('snapshot');
    expect(vi.mocked(requestJson).mock.calls.every(([path]) => path.endsWith('/config') || path.endsWith('/test-mode'))).toBe(true);
    restored.dispose();
  });
});

test('does not archive an unresolved operation and leaves the old conversation intact if storage fails', async () => {
  await withConversationLocks(async () => {
    enableLearning();
    const key = JSON.stringify(['reader-a', document.id, document.contentVersion]);
    const previous = { snapshot: { messages: [{ role: 'user', text: 'Retained question' }], draft: 'Retained draft', running: false },
      job: { requestId: 'original', message: 'Retained question', operationKey: 'original-key', step: 0, readPages: [], messages: [] } };
    records.set(key, previous);
    const owner = createReaderAgentHost(document);
    await vi.waitFor(() => expect(owner.host.session().accountId).toBe('reader-a'));
    expect(owner.host.canStartConversation(document.id)).toBe(false);
    await expect(owner.host.newConversation(document.id)).rejects.toThrow('恢复或停止');
    expect(records.get(key)).toEqual(previous);
    owner.dispose();
    records.set(key, { snapshot: previous.snapshot });
    const second = createReaderAgentHost(document);
    await vi.waitFor(() => expect(second.host.session().accountId).toBe('reader-a'));
    vi.mocked(writeReaderAgent).mockRejectedValueOnce(new Error('Synthetic storage failure'));
    await expect(second.host.newConversation(document.id)).rejects.toThrow('Synthetic storage failure');
    expect(second.host.restore(document.id)?.draft).toBe('Retained draft');
    expect(second.host.history(document.id)).toEqual([]);
    second.dispose();
  });
});

test('an old tab cannot overwrite or dispatch from a conversation archived by another tab', async () => {
  await withConversationLocks(async () => {
    enableLearning();
    const key = JSON.stringify(['reader-a', document.id, document.contentVersion]);
    records.set(key, { snapshot: { messages: [{ role: 'user', text: 'Old conversation' }], draft: '', running: false } });
    const first = createReaderAgentHost(document), second = createReaderAgentHost(document);
    await vi.waitFor(() => expect(first.host.session().accountId).toBe('reader-a'));
    await vi.waitFor(() => expect(second.host.session().accountId).toBe('reader-a'));
    await first.host.newConversation(document.id);
    const current = structuredClone(records.get(learningRecordKey()));
    second.host.save(document.id, { messages: [], draft: 'Stale tab draft', running: false });
    await expect(second.host.send({ documentId: document.id, message: 'Stale tab draft', tools, signal: new AbortController().signal })).rejects.toThrow('另一个页面已切换对话');
    expect(records.get(learningRecordKey())).toEqual(current);
    expect(vi.mocked(requestJson).mock.calls.every(([path]) => path.endsWith('/config') || path.endsWith('/test-mode'))).toBe(true);
    first.dispose(); second.dispose();
  });
});

function deletionSession() {
  return { session: { sessionId: '20000000-0000-4000-8000-000000000001', documentId: document.id,
    documentVersion: document.contentVersion, profileDigest: 'c'.repeat(64), revision: 3, generation: 1, mediaEpoch: 1,
    status: 'ready', controller: { controllerId: '', fence: 0, expiresAt: '0001-01-01T00:00:00Z' } }, eventSequence: 3, replayed: false };
}

test('deleting a learning conversation scrubs locally before HTTP and recovers the same remote intent after refresh', async () => {
  await withConversationLocks(async () => {
    enableLearning();
    const original = vi.mocked(requestJson).getMockImplementation()!;
    const key = learningRecordKey();
    const remote = deletionSession(), commands: unknown[] = [];
    const initial = { conversationId: 'original-conversation', snapshot: { messages: [{ role: 'user', text: 'Private original question' }], draft: 'Private unsent draft', running: false },
      learning: { openingRequestId: '50000000-0000-4000-8000-000000000001', session: remote.session, evidencePages: { privateEvidence: 2 } } };
    records.set(key, structuredClone(initial));
    vi.mocked(requestJson).mockImplementation(async (path, options) => {
      if (path.endsWith('/content')) {
        const local = records.get(key);
        expect(JSON.stringify(local)).not.toContain('Private original question'); expect(JSON.stringify(local)).not.toContain('Private unsent draft');
        expect(local).toMatchObject({ deleting: true, learning: { deleteRequest: options?.body } });
        commands.push(structuredClone(options?.body));
        remote.session.status = 'deleted'; remote.session.revision = 4; remote.session.generation = 2; remote.session.mediaEpoch = 2;
        if (commands.length === 1) throw new Error('deletion acknowledgement lost');
        return structuredClone(remote) as never;
      }
      if (path.endsWith(remote.session.sessionId)) return structuredClone(remote) as never;
      return original(path, options);
    });
    const first = createReaderAgentHost(document), other = createReaderAgentHost(document);
    await vi.waitFor(() => expect(first.host.session().accountId).toBe('reader-a'));
    await vi.waitFor(() => expect(other.host.session().accountId).toBe('reader-a'));
    await expect(first.host.deleteConversation(document.id)).rejects.toThrow('acknowledgement lost');
    expect(first.host.restore(document.id)).toMatchObject({ messages: [], draft: '', deletionPending: true });
    await vi.waitFor(() => expect(other.host.restore(document.id)).toMatchObject({ messages: [], deletionPending: true }));
    await expect(other.host.send({ documentId: document.id, message: 'Must not create', tools, signal: new AbortController().signal })).rejects.toThrow('确认学习记录的删除结果');
    expect(first.host.canStartConversation(document.id)).toBe(false);
    first.dispose();
    const restored = createReaderAgentHost(document);
    try {
      await vi.waitFor(() => expect(restored.host.session().accountId).toBe('reader-a'));
      expect(restored.host.restore(document.id)?.deletionPending).toBe(true);
      await restored.host.deleteConversation(document.id);
      expect(commands).toHaveLength(2); expect(commands[0]).toEqual(commands[1]);
      expect(restored.host.restore(document.id)).toMatchObject({ messages: [], draft: '', recoverable: false });
      await vi.waitFor(() => expect(other.host.restore(document.id)?.deletionPending).not.toBe(true));
      const final = records.get(key) as { conversationId: string; learning: { session?: unknown } };
      expect(final.conversationId).not.toBe(initial.conversationId); expect(final.learning.session).toBeUndefined();
      expect(vi.mocked(requestJson).mock.calls.every(([path]) => !path.endsWith('/questions') && !path.endsWith('/advance'))).toBe(true);
    } finally { restored.dispose(); other.dispose(); }
  });
});

test('deleting archived cloud content preserves the current conversation and atomically removes its local archive', async () => {
  await withConversationLocks(async () => {
    enableLearning();
    const original = vi.mocked(requestJson).getMockImplementation()!;
    const key = learningRecordKey(), archiveKey = JSON.stringify(['reader-conversation', key, 'old-record']);
    const remote = deletionSession();
    records.set(key, { conversationId: 'current', snapshot: { messages: [{ role: 'user', text: 'Keep current question' }], draft: 'Keep draft', running: false },
      learning: { openingRequestId: '50000000-0000-4000-8000-000000000002' }, history: [{ id: 'old-record', title: 'Private old title', cloud: true }] });
    records.set(archiveKey, { conversationId: 'old-record', snapshot: { messages: [{ role: 'user', text: 'Private old body' }], draft: 'Old draft', running: false },
      learning: { openingRequestId: '50000000-0000-4000-8000-000000000001', session: remote.session } });
    let calls = 0;
    vi.mocked(requestJson).mockImplementation(async (path, options) => {
      if (path.endsWith('/content')) {
        calls++; expect(JSON.stringify(records.get(archiveKey))).not.toContain('Private old body');
        expect(records.get(key)).toMatchObject({ history: [{ title: '待确认删除', deleting: true }] });
        remote.session.status = 'deleted'; remote.session.revision++; remote.session.generation++; remote.session.mediaEpoch++;
        return structuredClone(remote) as never;
      }
      if (path.endsWith(remote.session.sessionId)) return structuredClone(remote) as never;
      return original(path, options);
    });
    const owner = createReaderAgentHost(document);
    try {
      await vi.waitFor(() => expect(owner.host.session().accountId).toBe('reader-a'));
      await owner.host.deleteConversation(document.id, 'old-record');
      expect(owner.host.restore(document.id)).toMatchObject({ messages: [{ text: 'Keep current question' }], draft: 'Keep draft' });
      expect(owner.host.history(document.id)).toEqual([]); expect(records.has(archiveKey)).toBe(false); expect(calls).toBe(1);
      await expect(owner.host.readHistory(document.id, 'old-record')).rejects.toThrow('找不到');
    } finally { owner.dispose(); }
  });
});

test('an account change during deletion cannot apply its old reply or leave the new identity loading', async () => {
  await withConversationLocks(async () => {
    enableLearning(); const original = vi.mocked(requestJson).getMockImplementation()!;
    const key = learningRecordKey();
    const remote = deletionSession(); let finish: (() => void) | undefined;
    records.set(key, { conversationId: 'old-private', snapshot: { messages: [{ role: 'user', text: 'Old private body' }], draft: '', running: false },
      learning: { openingRequestId: '50000000-0000-4000-8000-000000000001', session: remote.session } });
    vi.mocked(requestJson).mockImplementation(async (path, options) => {
      if (path.endsWith('/content')) {
        await new Promise<void>(resolve => { finish = resolve; });
        remote.session.status = 'deleted'; remote.session.revision++; remote.session.generation++; remote.session.mediaEpoch++;
        return structuredClone(remote) as never;
      }
      if (path.endsWith(remote.session.sessionId)) return structuredClone(remote) as never;
      return original(path, options);
    });
    const owner = createReaderAgentHost(document);
    try {
      await vi.waitFor(() => expect(owner.host.session().accountId).toBe('reader-a'));
      const pending = owner.host.deleteConversation(document.id).then(() => undefined, error => error as Error);
      await vi.waitFor(() => expect(finish).toBeDefined());
      vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: 'reader-b' } as Awaited<ReturnType<typeof getCurrentAuthUser>>);
      window.dispatchEvent(new Event('rinspace-session-changed'));
      await vi.waitFor(() => expect(owner.host.session()).toMatchObject({ accountId: 'reader-b', status: 'authenticated' }));
      finish!();
      expect((await pending)?.message).toContain('账号或 PDF 已切换');
      expect(owner.host.restore(document.id)).toMatchObject({ messages: [], draft: '', recoverable: false }); expect(owner.host.history(document.id)).toEqual([]);
      expect(records.get(key)).toMatchObject({ deleting: true, learning: { deleteRequest: { commandId: expect.any(String) } } });
      expect(JSON.stringify(records.get(key))).not.toContain('Old private body');
      expect(records.has(JSON.stringify(['reader-b', document.id, document.contentVersion]))).toBe(false);
    } finally { finish?.(); owner.dispose(); }
  });
});

test('a legacy bundle writing its original key cannot restore a deleted learning conversation', async () => {
  await withConversationLocks(async () => {
    enableLearning(); const original = vi.mocked(requestJson).getMockImplementation()!;
    vi.mocked(requestJson).mockImplementation(async (path, options) => {
      if (path.endsWith('/sessions/recover')) throw new ServiceError('No original server session', 404, {}, 'NOT_FOUND');
      return original(path, options);
    });
    const owner = createReaderAgentHost(document);
    await vi.waitFor(() => expect(owner.host.session().accountId).toBe('reader-a'));
    owner.host.save(document.id, { messages: [], draft: 'Private new learning draft', running: false });
    await owner.host.deleteConversation(document.id);
    const tombstone = structuredClone(records.get(learningRecordKey()));
    // This is the old release's unconditional write, not the new CAS helper.
    const legacyKey = JSON.stringify(['reader-a', document.id, document.contentVersion]);
    records.set(legacyKey, { snapshot: { messages: [{ role: 'assistant', text: 'Old legacy cached answer' }], draft: 'Legacy draft', running: false } });
    owner.dispose();
    const restored = createReaderAgentHost(document);
    try {
      await vi.waitFor(() => expect(restored.host.session().accountId).toBe('reader-a'));
      expect(restored.host.restore(document.id)).toMatchObject({ messages: [], draft: '', recoverable: false });
      expect(records.get(learningRecordKey())).toEqual(tombstone);
      expect((records.get(legacyKey) as { snapshot: { draft: string } }).snapshot.draft).toBe('Legacy draft');
      expect(vi.mocked(requestJson).mock.calls.every(([path]) => !path.endsWith('/questions') && !path.endsWith('/sessions'))).toBe(true);
    } finally { restored.dispose(); }
  });
});
