import type { RinHost, RinSession, RinSnapshot, RinDocumentTools, RinReply } from '@rinspacehq/embedpdf-snippet/dist/reader-api';
import { getCurrentAuthUser } from '@/services/phoneAuth';
import { requestJson, ServiceError } from '@/services/httpClient';
import { requestAuthDialog } from '@/utils/authDialog';
import { readReaderAgent, readReaderConversation, writeReaderAgent, ReaderConversationChangedError, pruneExpiredReaderLearning, readerLearningContentExpired, readerLearningHistoryExpired } from './storage';
import type { ReaderDocument } from './types';
import { readerPresentation } from './presentation';
import { LEARNING_ROOT, validLearningConfig, type LearningConfig, type LearningReadingContext, type LearningLesson, type LearningCheckAction } from './learningProtocol';
import { learningSessionDriver, type LearningState } from './learningSession';
import { readerVoiceSupported } from './voiceInput';
import { createReaderVoiceSession, type ReaderVoiceSessionControls } from './voiceSession';
import { createVoiceTranscriptCommit } from './voiceTranscript';

type Part = { type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown; isError?: boolean };
type Message = { role: 'user' | 'assistant' | 'tool'; content: Part[] };
type Call = { id: string; name: string; input: Record<string, unknown> };
type Turn = { text?: string; toolCalls?: Call[]; finishReason: string; usage?: { inputTokens: number; outputTokens: number } };
type Run = { id: string; status: string; source: string; projectId: string; documentVersion: string;
  usage?: { inputTokens: number; outputTokens: number };
  billing?: { goodnessChargedSg: string; pendingTurns: number } };
type Job = { requestId: string; message: string; runId?: string; step: number; messages: Message[];
  operationKey: string; response?: Turn; readPages: number[]; reply?: RinReply; delivered?: boolean; aborted?: boolean };
type ReaderSnapshot = RinSnapshot & { deletionPending?: boolean; draftAction?: LearningCheckAction; pendingRequest?: { message: string; action?: LearningCheckAction } };
type ReaderSendInput = Parameters<RinHost['send']>[0] & { action?: LearningCheckAction };
type Conversation = { conversationId?: string; createdAt?: string; activityAt?: number; snapshot?: ReaderSnapshot; job?: Job; contentConsent?: boolean; learning?: LearningState; deleting?: boolean };
type ConversationHistory = { id: string; createdAt: string; activityAt?: number; title: string; deleting?: boolean; cloud?: boolean };
type State = Conversation & { history?: ConversationHistory[] };
const ROOT = 'reader/v1/agent';

export async function runReaderTool(call: Call, tools: RinDocumentTools): Promise<unknown> {
  const pages = () => {
    const value = call.input.pages;
    if (!Array.isArray(value) || !value.length || value.length > 8 || value.some(page => !Number.isInteger(page) || page < 1)) throw new Error('页码范围无效。');
    return value as number[];
  };
  switch (call.name) {
    case 'get_document_info': return tools.info();
    case 'get_selection': return tools.selection();
    case 'read_pages': return tools.readPages(pages());
    case 'search_document':
      if (typeof call.input.query !== 'string') throw new Error('搜索内容无效。');
      return tools.search(call.input.query, pages());
    case 'navigate_to_page':
      if (!Number.isInteger(call.input.page)) throw new Error('页码无效。');
      tools.navigate(call.input.page as number); return { page: call.input.page };
    default: throw new Error('不支持该 PDF 工具。');
  }
}

function readableError(error: unknown): Error {
  if (error instanceof ServiceError) {
    const messages: Record<string, string> = {
      POLICY_REJECTED: '琳当前不可用，请稍后重试。', INSUFFICIENT_BALANCE: '善功余额不足。',
      RATE_LIMITED: '已达到当前调用限额，请稍后重试。', SERVICE_UNAVAILABLE: '琳暂时无法连接，请重试。',
      UNAUTHENTICATED: '登录状态已失效，请重新登录。',
      DEPENDENCY_UNAVAILABLE: '琳暂时无法连接，请重试。',
      INVALID_REQUEST: '阅读请求无效，请停止任务后重试。',
      NOT_FOUND: '找不到本次阅读任务，请停止后重新提问。',
      IDEMPOTENCY_CONFLICT: '本次请求与已保存的任务不一致，请停止后重新提问。',
      POLICY_LIMIT: '本次请求受到额度或调用限额限制，请检查余额和琳的使用策略。',
    };
    return new Error(messages[error.code] || error.message);
  }
  return error instanceof Error ? error : new Error('请求失败，请重试。');
}

/** A single document host. Tokens/cookies stay in the main site's auth service. */
export function createReaderAgentHost(document: ReaderDocument) {
  let session: RinSession = { status: 'loading' };
  let state: State = {};
  let epoch = 0;
  let identityEpoch = 0;
  let disposed = false;
  let queue: Promise<void> = Promise.resolve();
  let storageError: unknown;
  let learningMode = false;
  let learningConfig: LearningConfig = { enabled: false };
  let configOwner = '', configCheckedAt = 0;
  let learningDriver: ReturnType<typeof learningSessionDriver> | undefined;
  let voiceController: ReturnType<typeof createReaderVoiceSession> | undefined;
  let changingConversation = false;
  const listeners = new Set<() => void>();
  const legacyKeyFor = (accountId: string) => JSON.stringify([accountId, document.id, document.contentVersion]);
  const learningKeyFor = (accountId: string) => JSON.stringify(['reader-learning/v1', accountId, document.id, document.contentVersion]);
  const keyFor = (accountId: string) => learningMode ? learningKeyFor(accountId) : legacyKeyFor(accountId);
  const notify = () => listeners.forEach(listener => listener());
  const disposeExecution = () => {
    const previous = voiceController, account = session.accountId, conversation = state.conversationId;
    voiceController = undefined;
    if (previous) void previous.dispose().catch(error => {
      // A stale owner's cleanup failure must never become the next account's
      // error or draft. Raw device tracks have already stopped synchronously.
      if (!disposed && session.accountId === account && state.conversationId === conversation) { storageError = error; notify(); }
    });
    learningDriver?.dispose(); learningDriver = undefined;
  };
  const sourceId = crypto.randomUUID();
  let changes: BroadcastChannel | undefined;
  try { if (typeof BroadcastChannel !== 'undefined') changes = new BroadcastChannel('rinspace.reader.conversations'); } catch { /* CAS still prevents stale writes. */ }
  const publishConversation = (key: string) => {
    const detail = { key, sourceId };
    window.dispatchEvent(new CustomEvent('rinspace-reader-conversation-changed', { detail }));
    changes?.postMessage(detail);
  };
  const reconcileConversation = async (detail: unknown) => {
    if (!detail || typeof detail !== 'object' || !('key' in detail) || !('sourceId' in detail) || detail.sourceId === sourceId) return;
    const account = session.accountId, identity = identityEpoch;
    if (!account || detail.key !== keyFor(account) || changingConversation) return;
    const restored = await readReaderAgent<State>(keyFor(account));
    if (disposed || identity !== identityEpoch || account !== session.accountId || changingConversation || !restored || restored.conversationId === state.conversationId) return;
    disposeExecution();
    state = restored; learningMode = Boolean(restored.learning); storageError = undefined;
    notify();
  };
  const changed = (event: Event) => { void reconcileConversation((event as CustomEvent<unknown>).detail).catch(() => {}); };
  window.addEventListener('rinspace-reader-conversation-changed', changed);
  if (changes) changes.onmessage = event => { void reconcileConversation(event.data).catch(() => {}); };
  const withConversationLock = async <T>(account: string, operation: () => Promise<T>): Promise<T> => {
    if (!navigator.locks) throw new Error('当前浏览器不支持安全切换对话。');
    return navigator.locks.request(`rinspace.reader.host:${account}:${document.id}:${document.contentVersion}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('另一个页面正在使用琳。');
      return operation();
    });
  };
  const save = () => {
    if (!session.accountId) return;
    const key = keyFor(session.accountId);
    const value = structuredClone(state);
    queue = queue.then(async () => {
      await writeReaderAgent(key, value, { conversationId: value.conversationId }); storageError = undefined;
      if (session.accountId && keyFor(session.accountId) === key && state.conversationId === value.conversationId) {
        state.history = state.history?.filter(item => !readerLearningHistoryExpired(item));
      }
    }).catch(error => { storageError = error; });
  };
  const flush = async () => {
    await queue;
    if (storageError instanceof ReaderConversationChangedError) throw storageError;
    if (storageError) throw new Error('无法保存本地会话，请释放浏览器存储空间后重试。');
  };
  const refresh = async (event?: Event) => {
    const current = ++epoch;
    const previousSession = session;
    // Identity recovery can temporarily fail while the HttpOnly session is
    // being restored. Hide the previous account immediately and await Native's
    // answer; a failed lookup is not proof of an anonymous identity.
    if (event?.type === 'rinspace-session-changed') {
      identityEpoch++;
      session = { status: 'loading' }; notify();
    }
    try {
      const [user, testMode] = await Promise.all([
        getCurrentAuthUser(),
        requestJson<{ enabled: boolean }>(`${ROOT}/test-mode`, { auth: 'none' }).catch(() => ({ enabled: false })),
      ]);
      const nativeId = user?.id;
      if (user && !nativeId) throw new Error('登录身份尚未恢复。');
      if (changingConversation && event?.type !== 'rinspace-session-changed' && nativeId === previousSession.accountId) return;
      if (nativeId && (configOwner !== nativeId || Date.now() - configCheckedAt > 30000)) {
        learningConfig = await requestJson<LearningConfig>(`${LEARNING_ROOT}/config`, { auth: 'required' }).catch(error => {
          if (error instanceof ServiceError && error.status === 401) throw error;
          return { enabled: false };
        }) || { enabled: false };
        configOwner = nativeId; configCheckedAt = Date.now();
      }
      const legacyAccount = testMode?.enabled ? `reader-test:${nativeId || 'anonymous'}` : nativeId;
      if (nativeId && previousSession.accountId === nativeId && learningMode) await queue;
      let nativeLearningState = nativeId ? await readReaderAgent<State>(learningKeyFor(nativeId)) : undefined;
      if (nativeId && nativeLearningState) {
        await queue;
        if (await pruneExpiredReaderLearning(learningKeyFor(nativeId))) {
          nativeLearningState = await readReaderAgent<State>(learningKeyFor(nativeId));
          publishConversation(learningKeyFor(nativeId));
        }
      }
      const nativeLegacyState = nativeId ? previousSession.accountId === nativeId && !learningMode ? state : await readReaderAgent<State>(legacyKeyFor(nativeId)) : undefined;
      let nativeState = nativeLearningState || nativeLegacyState;
      const legacyState = legacyAccount === previousSession.accountId ? state : legacyAccount === nativeId ? nativeState
        : legacyAccount ? await readReaderAgent<State>(legacyKeyFor(legacyAccount)) : undefined;
      const pending = (candidate?: State) => Boolean(candidate?.job && !candidate.job.aborted && !candidate.job.delivered);
      // Finish the original payer/protocol first. Existing paid-chat history is
      // retained on its original path; it is never silently presented as model
      // memory belonging to a new learning session.
      const nativeLegacy = !nativeLearningState && (pending(nativeLegacyState) || Boolean(nativeLegacyState?.snapshot?.messages.length && !nativeLegacyState.learning));
      const nextLearning = Boolean(nativeId && !nativeLegacy && (nativeLearningState || !pending(legacyState) && validLearningConfig(learningConfig)));
      const accountId = nextLearning || nativeLegacy ? nativeId : legacyAccount;
      const status: RinSession['status'] = nextLearning || nativeLegacy ? 'authenticated' : testMode?.enabled ? 'test' : nativeId ? 'authenticated' : 'anonymous';
      if (disposed || current !== epoch) return;
      if (nextLearning && nativeId && !nativeLearningState) {
        // The first learning record has its own versioned key. A legacy bundle
        // can continue saving old chat state, but cannot overwrite this root or
        // restore its deleted content. No IndexedDB schema upgrade is needed.
        const initial: State = { conversationId: crypto.randomUUID(), createdAt: new Date().toISOString(), activityAt: Date.now(),
          snapshot: { messages: [], draft: '', running: false }, learning: { openingRequestId: crypto.randomUUID() } };
        try {
          await writeReaderAgent(learningKeyFor(nativeId), initial, { conversationId: undefined });
          nativeState = initial;
        } catch (error) {
          if (!(error instanceof ReaderConversationChangedError)) throw error;
          nativeState = await readReaderAgent<State>(learningKeyFor(nativeId));
          if (!nativeState) throw error;
        }
        if (disposed || current !== epoch) return;
      }
      if (accountId === previousSession.accountId && status === previousSession.status && nextLearning === learningMode && nativeState?.conversationId === state.conversationId) {
        if (nativeLearningState) state.history = nativeLearningState.history;
        session = previousSession; notify(); return;
      }
      disposeExecution(); learningMode = nextLearning;
      session = { status: 'loading' }; state = {}; notify();
      const restored = accountId === nativeId ? nativeState : accountId === legacyAccount ? legacyState : undefined;
      if (disposed || current !== epoch) return;
      state = restored || {};
      if (state.snapshot) state.snapshot.running = false;
      storageError = undefined;
      session = accountId ? { status, accountId } : { status };
      notify();
    } catch (error) {
      if (current !== epoch || disposed) return;
      disposeExecution();
      session = { status: 'loading' }; state = {}; storageError = error; notify();
    }
  };
  window.addEventListener('rinspace-session-changed', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  void refresh();
  const retentionTimer = window.setInterval(() => {
    if (!disposed && !changingConversation && learningMode && session.accountId &&
      (readerLearningContentExpired(state) || state.history?.some(item => readerLearningHistoryExpired(item)))) void refresh();
  }, 60000);
  const validateRun = (run: Run) => {
    if (run.source !== 'reader' || run.projectId !== document.id || run.documentVersion !== document.contentVersion) throw new Error('阅读任务与当前 PDF 不匹配。');
    return run;
  };
  const getLearningDriver = (account: string) => {
    if (!state.learning) throw new Error('学习会话尚未准备好。');
    const conversationId = state.conversationId;
    learningDriver ||= learningSessionDriver({ document, accountId: account, state: state.learning,
      assertActive: () => {
        if (disposed || !learningMode || session.accountId !== account || state.conversationId !== conversationId) throw new Error('账号、PDF 或对话已切换。');
      },
      persist: async () => {
        if (state.learning?.session?.status === 'deleted') state.snapshot = { messages: [], draft: '', running: false };
        save(); await flush();
        if (state.learning?.session?.status === 'deleted') notify();
      },
      reload: async () => (await readReaderAgent<State>(keyFor(account)))?.learning,
      // Default-budget changes apply to new sessions. This session's reading
      // limits remain in its server-frozen readingContext.
      available: () => validLearningConfig(learningConfig),
    });
    return learningDriver;
  };

  // Additive host callbacks work with the current immutable viewer; the new
  // viewer consumes them after its separate release/consumer verification.
  const host: Omit<RinHost, 'restore' | 'save' | 'send'> & typeof readerPresentation & {
    restore(id: string): ReaderSnapshot | undefined;
    save(id: string, snapshot: ReaderSnapshot): void;
    send(input: ReaderSendInput): Promise<RinReply>;
    readingContext(id: string): LearningReadingContext | undefined;
    canStartConversation(id: string): boolean;
    newConversation(id: string): Promise<void>;
    history(id: string): ConversationHistory[];
    readHistory(id: string, conversationId: string): Promise<RinSnapshot>;
    canHint(id: string, checkId: string): boolean;
    conversationVersion(id: string): string | undefined;
    canDeleteConversation(id: string, conversationId?: string): boolean;
    deleteConversation(id: string, conversationId?: string): Promise<void>;
    voice(id: string): ReaderVoiceSessionControls | undefined;
  } = {
    ...readerPresentation,
    session: () => session,
    subscribeSession: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    login: async () => { requestAuthDialog(); },
    voice: id => {
      const account = session.accountId;
      if (id !== document.id || !account || !learningMode || !state.learning || session.status !== 'authenticated') return undefined;
      if (voiceController) return voiceController;
      if (!learningConfig.voiceEnabled || !readerVoiceSupported() || changingConversation || state.deleting || readerLearningContentExpired(state)) return undefined;
      const conversation = state.conversationId;
      let releaseTranscript: (() => Promise<void>) | undefined;
      const confirmTranscript = createVoiceTranscriptCommit({
        active: () => {
          if (disposed || !learningMode || session.accountId !== account || state.conversationId !== conversation) throw new Error('账号、PDF 或对话已切换。');
        },
        currentDraft: () => state.snapshot?.draft || '',
        persistDraft: async draft => {
          if (!state.snapshot) throw new Error('阅读会话尚未准备好。');
          state.snapshot = { ...state.snapshot, draft };
          state.activityAt = Date.now();
          save(); await flush();
        },
        releaseTranscript: async () => {
          if (!releaseTranscript) throw new Error('当前没有待确认的语音文字。');
          await releaseTranscript();
        },
      });
      voiceController = createReaderVoiceSession({ accountId: account, notify,
        available: () => learningConfig.voiceEnabled === true && validLearningConfig(learningConfig) && !changingConversation && !state.deleting && state.learning?.session?.status !== 'deleted',
        active: () => {
          if (disposed || !learningMode || session.accountId !== account || state.conversationId !== conversation) throw new Error('账号、PDF 或对话已切换。');
        },
        run: (signal, operation) => getLearningDriver(account).voiceInput(signal, operation),
        runPlayback: (signal, operation) => getLearningDriver(account).voicePlayback(signal, operation),
        resumeSource: state.learning.voiceResume,
        persistResume: async source => {
          if (disposed || !learningMode || session.accountId !== account || state.conversationId !== conversation || !state.learning) throw new Error('账号、PDF 或对话已切换。');
          state.learning.voiceResume = source ? { ...source } : undefined;
          state.activityAt = Date.now(); save(); await flush();
        },
        confirmTranscript: (text, release) => {
          releaseTranscript = release;
          return confirmTranscript(text);
        },
        evidencePages: refs => [...new Set(refs.map(ref => state.learning?.evidencePages?.[ref]).filter((page): page is number => typeof page === 'number' && Number.isSafeInteger(page) && page > 0))],
      });
      return voiceController;
    },
    conversationVersion: id => id === document.id ? `${state.conversationId || ''}:${readerLearningContentExpired(state) ? 'expired' : state.learning?.session?.status === 'deleted' ? 'deleted' : ''}` : undefined,
    readingContext: id => session.accountId && learningMode && id === document.id ? state.learning?.readingContext : undefined,
    canHint: (id, checkId) => id === document.id && learningMode && !state.learning?.exhaustedHints?.includes(checkId),
    canStartConversation: id => Boolean(navigator.locks) && id === document.id && session.status === 'authenticated' && Boolean(session.accountId) &&
      validLearningConfig(learningConfig) && !changingConversation && !state.deleting && !state.learning?.deleteRequest && !state.snapshot?.running &&
      !(state.job && !state.job.aborted && !state.job.delivered) &&
      !(state.learning?.pending && !state.learning.pending.aborted && !state.learning.pending.delivered && !state.learning.pending.failed) && !state.learning?.stopRequest,
    history: id => id === document.id && session.accountId ? structuredClone((state.history || []).filter(item => !readerLearningHistoryExpired(item))) : [],
    readHistory: async (id, conversationId) => {
      const account = session.accountId; const current = identityEpoch, version = state.conversationId;
      if (id !== document.id || !account || !state.history?.some(item => item.id === conversationId)) throw new Error('找不到这段对话。');
      const previous = await readReaderConversation<Conversation>(keyFor(account), conversationId);
      if (disposed || current !== identityEpoch || account !== session.accountId || version !== state.conversationId) throw new Error('账号或对话已切换。');
      if (!previous?.snapshot) throw new Error('找不到这段对话。');
      if (readerLearningContentExpired(previous)) throw new Error('这段学习记录已过期。');
      if (previous.deleting) throw new Error('这段对话正在删除，请确认删除结果。');
      return { ...previous.snapshot, running: false, recoverable: false };
    },
    newConversation: async id => {
      if (!host.canStartConversation(id)) throw new Error('请先恢复或停止当前任务。');
      const account = session.accountId!;
      const current = identityEpoch;
      const assertAccount = () => {
        if (disposed || identityEpoch !== current || session.accountId !== account) throw new Error('账号或 PDF 已切换。');
      };
      changingConversation = true;
      try {
        await withConversationLock(account, async () => {
        await flush(); assertAccount();
        if ((await getCurrentAuthUser())?.id !== account) throw new Error('账号已切换。');
        assertAccount();
        const key = keyFor(account), targetKey = learningKeyFor(account);
        const stored = await readReaderAgent<State>(key);
        assertAccount();
        if (stored?.conversationId !== state.conversationId) throw new Error('另一个页面已切换对话，请刷新。');
        if (stored?.snapshot?.running || stored?.job && !stored.job.aborted && !stored.job.delivered ||
          stored?.learning?.pending && !stored.learning.pending.aborted && !stored.learning.pending.delivered && !stored.learning.pending.failed || stored?.learning?.stopRequest) throw new Error('请先恢复或停止当前任务。');
        if (!learningMode && await readReaderAgent<State>(targetKey)) throw new ReaderConversationChangedError('另一个页面已切换对话，请刷新。');
        const history = [...(state.history || [])];
        let archive: { id: string; value: Conversation } | undefined;
        if (state.learning?.session?.status !== 'deleted' && (state.snapshot?.messages.length || state.snapshot?.draft || state.learning?.session || state.learning?.pending || state.job)) {
          const { history: _, ...previous } = structuredClone(state);
          const previousId = previous.conversationId || crypto.randomUUID();
          archive = { id: previousId, value: { ...previous, conversationId: previousId } };
          history.push({ id: previousId, createdAt: previous.createdAt || new Date().toISOString(), activityAt: previous.activityAt, cloud: Boolean(previous.learning),
            title: previous.snapshot?.messages.find(message => message.role === 'user')?.text.slice(0, 60) || '对话记录' });
        }
        const next: State = { conversationId: crypto.randomUUID(), createdAt: new Date().toISOString(), activityAt: Date.now(), history,
          snapshot: { messages: [], draft: '', running: false }, learning: { openingRequestId: crypto.randomUUID() } };
        await writeReaderAgent(targetKey, next, { conversationId: learningMode ? state.conversationId : undefined }, archive);
        assertAccount();
        disposeExecution();
        state = next; learningMode = true; storageError = undefined;
        notify();
        });
      } finally { changingConversation = false; }
    },
    canDeleteConversation: (id, conversationId) => Boolean(navigator.locks) && learningMode && id === document.id && session.status === 'authenticated' && Boolean(session.accountId) &&
      !changingConversation && !state.snapshot?.running &&
      (conversationId ? Boolean(state.history?.some(item => item.id === conversationId && item.cloud !== false)) :
        Boolean(state.deleting || state.learning?.session || state.learning?.pending || state.snapshot?.messages.length || state.snapshot?.draft) && !(state.job && !state.job.aborted && !state.job.delivered)),
    deleteConversation: async (id, conversationId) => {
      if (!host.canDeleteConversation(id, conversationId)) throw new Error('请先停止当前任务。');
      const account = session.accountId!, identity = identityEpoch, key = keyFor(account);
      const assertAccount = () => {
        if (disposed || identity !== identityEpoch || session.accountId !== account) throw new Error('账号或 PDF 已切换。');
      };
      changingConversation = true;
      try {
        await withConversationLock(account, async () => {
          await flush(); assertAccount();
          if ((await getCurrentAuthUser())?.id !== account) throw new Error('账号已切换。');
          assertAccount();
          const stored = await readReaderAgent<State>(key); assertAccount();
          if (stored?.conversationId !== state.conversationId) throw new Error('另一个页面已切换对话，请刷新。');
          const previous = conversationId ? await readReaderConversation<Conversation>(key, conversationId) : stored || state;
          assertAccount();
          if (!previous) throw new Error('找不到这段对话。');
          // Persist a content-free local tombstone before any remote mutation.
          // Retain only the original remote identity/delete intent for recovery.
          const target: Conversation = { conversationId: previous.conversationId, createdAt: previous.createdAt, deleting: true,
            snapshot: { messages: [], draft: '', running: false },
            ...(previous.learning ? { learning: { openingRequestId: previous.learning.openingRequestId,
              session: previous.learning.session, deleteRequest: previous.learning.deleteRequest } } : {}) };
          const next: State = { ...(conversationId ? structuredClone(state) : target), conversationId: crypto.randomUUID(),
            history: (state.history || []).map(item => conversationId === item.id ? { ...item, title: '待确认删除', deleting: true } : item) };
          await writeReaderAgent(key, next, { conversationId: state.conversationId }, conversationId ? { id: conversationId, value: target } : undefined);
          assertAccount();
          disposeExecution();
          state = next; storageError = undefined;
          publishConversation(key); notify();
          if (target.learning) {
            const driver = learningSessionDriver({ document, accountId: account, state: target.learning, assertActive: assertAccount,
              available: () => false,
              persist: async () => {
                assertAccount();
                if (!conversationId) state.learning = target.learning;
                await writeReaderAgent(key, state, { conversationId: state.conversationId }, conversationId ? { id: conversationId, value: target } : undefined);
                assertAccount();
              } });
            try { await driver.deleteContent(); } finally { driver.dispose(); }
          }
          assertAccount();
          const done: State = { ...(conversationId ? state : { snapshot: { messages: [], draft: '', running: false }, learning: { openingRequestId: crypto.randomUUID() } }),
            conversationId: crypto.randomUUID(), createdAt: new Date().toISOString(), activityAt: Date.now(), history: (state.history || []).filter(item => item.id !== conversationId) };
          await writeReaderAgent(key, done, { conversationId: state.conversationId }, undefined, conversationId);
          assertAccount(); state = done; learningMode = Boolean(done.learning); storageError = undefined;
          publishConversation(key); notify();
        });
      } finally { changingConversation = false; notify(); }
    },
    restore: id => {
      if (!session.accountId || id !== document.id || !state.snapshot) return undefined;
      if (state.deleting) return { messages: [], draft: '', running: false, recoverable: false, deletionPending: true, error: '请确认学习记录的删除结果。' };
      if (readerLearningContentExpired(state) || state.learning?.session?.status === 'deleted') return { messages: [], draft: '', running: false, recoverable: false, error: '这段学习记录已过期或删除。' };
      const pending = learningMode ? state.learning?.pending : state.job;
      const recoverable = Boolean(pending && !pending.aborted && !pending.delivered && (!('failed' in pending) || !pending.failed));
      return { ...state.snapshot, running: false, recoverable,
        pendingRequest: recoverable && pending ? { message: pending.message, ...('action' in pending && pending.action ? { action: pending.action } : {}) } : undefined };
    },
    save: (id, snapshot) => {
      if (id !== document.id) throw new Error('PDF 会话不匹配。');
      if (!session.accountId) return;
      if (changingConversation) throw new Error('正在切换对话。');
      if (state.deleting) throw new Error('请确认学习记录的删除结果。');
      if (readerLearningContentExpired(state) || state.learning?.session?.status === 'deleted') { void refresh(); throw new Error('这段学习记录已过期或删除，请新建对话。'); }
      if (learningMode) state.activityAt = Date.now();
      const previousMessageCount = state.snapshot?.messages.length || 0;
      state.snapshot = { ...snapshot, messages: snapshot.messages.slice(-40) };
      if (state.job?.reply && (!snapshot.draft || snapshot.messages.length > previousMessageCount && snapshot.messages.at(-1)?.role === 'assistant' && snapshot.messages.at(-1)?.text === state.job.reply.text)) state.job.delivered = true;
      const last = snapshot.messages.at(-1) as (RinSnapshot['messages'][number] & { lesson?: LearningLesson }) | undefined;
      if (state.learning?.pending?.reply && last?.role === 'assistant' && last.lesson?.operationId === state.learning.pending.reply.lesson.operationId) {
        state.learning.pending.delivered = true; state.learning.pending.evidence = undefined;
      }
      save();
    },
    send: async ({ documentId, message, tools, signal, action }) => {
      const execute = async () => {
      if (changingConversation) throw new Error('正在切换对话。');
      if (state.deleting) throw new Error('请确认学习记录的删除结果。');
      if (readerLearningContentExpired(state)) { void refresh(); throw new Error('这段学习记录已过期，请重新提问。'); }
      const account = session.accountId;
      const testMode = session.status === 'test';
      const learning = learningMode;
      const conversationId = state.conversationId;
      const active = () => {
        signal.throwIfAborted();
        if (disposed || !account || session.accountId !== account || learningMode !== learning || state.conversationId !== conversationId || (session.status === 'test') !== testMode || documentId !== document.id) throw new Error('账号、PDF 或对话已切换。');
      };
      if (!learning && account && !testMode && await readReaderAgent<State>(learningKeyFor(account))) throw new ReaderConversationChangedError('另一个页面已切换对话，请刷新。');
      const api = async <T>(path: string, body?: unknown): Promise<T> => {
        active();
        if (!testMode && (await getCurrentAuthUser())?.id !== account) throw new Error('账号已切换。');
        active();
        return requestJson<T>(`${ROOT}/${testMode ? 'test/' : ''}${path}`, { auth: testMode ? 'none' : 'required', method: body === undefined ? 'GET' : 'POST', body, signal });
      };
      try {
        active();
        if (voiceController && (['starting', 'listening', 'transcribing', 'review'].includes(voiceController.snapshot().input) || voiceController.snapshot().cleanupPending)) await voiceController.cancelInput();
        await flush(); active();
        if (action && !learning) throw new Error('当前对话不支持练习操作，请新建学习对话。');
        if (!state.contentConsent) {
          if (!window.confirm(testMode || learning
            ? '琳会将你提问涉及的 PDF 文字发送给模型服务。继续？'
            : '琳会将你提问涉及的 PDF 文字发送给模型服务，并按实际用量计费。继续？')) throw new Error('已取消。');
          state.contentConsent = true; save(); await flush(); active();
        }
        if (learning) {
          state.learning ||= { openingRequestId: crypto.randomUUID() };
          save(); await flush(); active();
          return await getLearningDriver(account!).send(message, tools, signal, action);
        }
        let job = state.job;
        if (job && !job.aborted && !job.reply && job.message !== message) throw new Error('上次任务尚未完成，请先重试原问题或停止任务。');
        if (!job || job.aborted || job.delivered) {
          job = { requestId: crypto.randomUUID(), operationKey: crypto.randomUUID(), message, step: 0, readPages: [],
            messages: [{ role: 'user', content: [{ type: 'text', text: message }] }] };
          state.job = job; save(); await flush(); active();
        }
        // Recover a completed answer without another model call; re-read citations locally.
        if (job.reply) {
          for (const page of job.reply.pages || []) await tools.readPages([page]);
          return job.reply;
        }
        const config = testMode
          ? await requestJson<{ enabled: boolean; maxIterations: number }>(`${ROOT}/test-mode`, { auth: 'none', signal })
          : await api<{ enabled: boolean; maxIterations: number }>('config');
        if (!config.enabled) throw new Error('琳当前已停用。');
        if (!testMode && !job.runId) {
          const run = validateRun(await api<Run>('runs', { requestId: job.requestId, documentId: document.id, documentVersion: document.contentVersion }));
          job.runId = run.id; save(); await flush(); active();
        }
        for (; job.step < config.maxIterations;) {
          active();
          const body = { operationKey: job.operationKey, ...(testMode ? { documentId: document.id } : {}),
            documentVersion: document.contentVersion, messages: job.messages };
          if (new TextEncoder().encode(JSON.stringify(body)).length > 250 * 1024) throw new Error('本次阅读内容已达上限，请停止任务后缩小问题范围。');
          // Persist the exact operation and history before dispatch. Retry never invents a new key.
          save(); await flush(); active();
          const response = job.response || await api<Turn>(testMode ? 'turns' : `runs/${job.runId}/turns`, body);
          active(); job.response = response; save(); await flush(); active();
          if (!response.toolCalls?.length) {
            const run = testMode ? undefined : validateRun(await api<Run>(`runs/${job.runId}`));
            const pages = [...new Set(Array.from((response.text || '').matchAll(/\[p:(\d+)\]/g), match => Number(match[1])))].filter(page => job!.readPages.includes(page));
            for (const page of pages) await tools.readPages([page]);
            const cost = run?.billing ? Number(run.billing.goodnessChargedSg) : undefined;
            const reply = { text: response.text || '未获得回答，请缩小问题范围后重试。', pages,
              usage: run?.usage || response.usage, ...(cost !== undefined && Number.isFinite(cost) ? { costSG: cost } : {}) };
            job.reply = reply; save(); await flush(); active(); return reply;
          }
          const results: Part[] = [];
          for (const call of response.toolCalls) {
            active();
            try {
              const output = await runReaderTool(call, tools); active();
              if (Array.isArray(output)) for (const item of output) if (item && typeof item === 'object' && Number.isInteger(item.page)) job.readPages.push(item.page);
              results.push({ type: 'tool-result', toolCallId: call.id, toolName: call.name, output });
            } catch (error) {
              active(); results.push({ type: 'tool-result', toolCallId: call.id, toolName: call.name, output: { error: readableError(error).message }, isError: true });
            }
          }
          const parts: Part[] = response.text ? [{ type: 'text', text: response.text }] : [];
          parts.push(...response.toolCalls.map(call => ({ type: 'tool-call' as const, toolCallId: call.id, toolName: call.name, input: call.input })));
          job.messages.push({ role: 'assistant', content: parts }, { role: 'tool', content: results });
          job.response = undefined; job.operationKey = crypto.randomUUID(); job.step++; save(); await flush();
        }
        throw new Error('本次任务已达轮次上限，请停止后提出更具体的问题。');
      } catch (error) { throw readableError(error); }
      };
      return navigator.locks ? withConversationLock(session.accountId || 'anonymous', execute) : execute();
    },
    stop: async id => {
      const account = session.accountId;
      const testMode = session.status === 'test';
      if (learningMode && account && id === document.id && state.learning) {
        if ((await getCurrentAuthUser())?.id !== account) return;
        await voiceController?.cancelInput();
        await getLearningDriver(account).stop(); return;
      }
      const job = state.job;
      if (id !== document.id || !job || !account || !testMode && (await getCurrentAuthUser())?.id !== account) return;
      if (!testMode && job.runId) {
        const run = validateRun(await requestJson<Run>(`${ROOT}/runs/${job.runId}/abort`, { auth: 'required', method: 'POST' }));
        if (session.accountId !== account || disposed) return;
        if (!['ABORTED', 'COMPLETED', 'FAILED_FINAL'].includes(run.status)) throw new Error('停止请求已提交，请稍后重试确认。');
      }
      job.aborted = true; save(); await flush();
    },
  };
  return { host, dispose() {
    disposed = true; epoch++;
    disposeExecution();
    changes?.close();
    window.clearInterval(retentionTimer);
    window.removeEventListener('rinspace-reader-conversation-changed', changed);
    window.removeEventListener('rinspace-session-changed', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
    listeners.clear();
  } };
}
