import type { RinHost, RinSession, RinSnapshot, RinDocumentTools, RinReply } from '@rinspacehq/embedpdf-snippet/dist/reader-api';
import { getCurrentAuthUser } from '@/services/phoneAuth';
import { requestJson, ServiceError } from '@/services/httpClient';
import { requestAuthDialog } from '@/utils/authDialog';
import { readReaderAgent, writeReaderAgent } from './storage';
import type { ReaderDocument } from './types';

type Part = { type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown; isError?: boolean };
type Message = { role: 'user' | 'assistant' | 'tool'; content: Part[] };
type Call = { id: string; name: string; input: Record<string, unknown> };
type Turn = { text?: string; toolCalls?: Call[]; finishReason: string };
type Run = { id: string; status: string; source: string; projectId: string; documentVersion: string;
  usage?: { inputTokens: number; outputTokens: number };
  billing?: { goodnessChargedSg: string; pendingTurns: number } };
type Job = { requestId: string; message: string; runId?: string; step: number; messages: Message[];
  operationKey: string; response?: Turn; readPages: number[]; reply?: RinReply; delivered?: boolean; aborted?: boolean };
type State = { snapshot?: RinSnapshot; job?: Job; contentConsent?: boolean };
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
  let disposed = false;
  let queue: Promise<void> = Promise.resolve();
  let storageError: unknown;
  const listeners = new Set<() => void>();
  const keyFor = (accountId: string) => JSON.stringify([accountId, document.id, document.contentVersion]);
  const notify = () => listeners.forEach(listener => listener());
  const save = () => {
    if (!session.accountId) return;
    const key = keyFor(session.accountId);
    const value = structuredClone(state);
    queue = queue.then(async () => { await writeReaderAgent(key, value); storageError = undefined; }).catch(error => { storageError = error; });
  };
  const flush = async () => {
    await queue;
    if (storageError) throw new Error('无法保存本地会话，请释放浏览器存储空间后重试。');
  };
  const refresh = async () => {
    const current = ++epoch;
    try {
      const user = await getCurrentAuthUser();
      if (disposed || current !== epoch || user?.id === session.accountId && session.status !== 'loading') return;
      session = { status: 'loading' }; state = {}; notify();
      const restored = user?.id ? await readReaderAgent<State>(keyFor(user.id)) : undefined;
      if (disposed || current !== epoch) return;
      state = restored || {};
      storageError = undefined;
      session = user ? { status: 'authenticated', accountId: user.id } : { status: 'anonymous' };
      notify();
    } catch (error) {
      if (current !== epoch || disposed) return;
      session = { status: 'anonymous' }; state = {}; storageError = error; notify();
    }
  };
  window.addEventListener('rinspace-session-changed', refresh);
  void refresh();
  const validateRun = (run: Run) => {
    if (run.source !== 'reader' || run.projectId !== document.id || run.documentVersion !== document.contentVersion) throw new Error('阅读任务与当前 PDF 不匹配。');
    return run;
  };

  const host: RinHost = {
    session: () => session,
    subscribeSession: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    login: async () => { requestAuthDialog(); },
    restore: id => id === document.id && state.snapshot ? { ...state.snapshot, running: false,
      recoverable: Boolean(state.job && !state.job.aborted && !state.job.delivered) } : undefined,
    save: (id, snapshot) => {
      if (id !== document.id) throw new Error('PDF 会话不匹配。');
      state.snapshot = { ...snapshot, messages: snapshot.messages.slice(-40) };
      if (state.job?.reply && !snapshot.draft) state.job.delivered = true;
      save();
    },
    send: async ({ documentId, message, tools, signal }) => {
      const account = session.accountId;
      const active = () => {
        signal.throwIfAborted();
        if (disposed || !account || session.accountId !== account || documentId !== document.id) throw new Error('账号或 PDF 已切换。');
      };
      const api = async <T>(path: string, body?: unknown): Promise<T> => {
        active();
        if ((await getCurrentAuthUser())?.id !== account) throw new Error('账号已切换。');
        active();
        return requestJson<T>(`${ROOT}/${path}`, { auth: 'required', method: body === undefined ? 'GET' : 'POST', body, signal });
      };
      try {
        active(); await flush(); active();
        if (!state.contentConsent) {
          if (!window.confirm('琳会将你提问涉及的 PDF 文字发送给模型服务，并按实际用量计费。继续？')) throw new Error('已取消。');
          state.contentConsent = true; save(); await flush(); active();
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
        const config = await api<{ enabled: boolean; maxIterations: number }>('config');
        if (!config.enabled) throw new Error('琳当前已停用。');
        if (!job.runId) {
          const run = validateRun(await api<Run>('runs', { requestId: job.requestId, documentId: document.id, documentVersion: document.contentVersion }));
          job.runId = run.id; save(); await flush(); active();
        }
        for (; job.step < config.maxIterations;) {
          active();
          const body = { operationKey: job.operationKey, documentVersion: document.contentVersion, messages: job.messages };
          if (new TextEncoder().encode(JSON.stringify(body)).length > 250 * 1024) throw new Error('本次阅读内容已达上限，请停止任务后缩小问题范围。');
          // Persist the exact operation and history before dispatch. Retry never invents a new key.
          save(); await flush(); active();
          const response = job.response || await api<Turn>(`runs/${job.runId}/turns`, body);
          active(); job.response = response; save(); await flush(); active();
          if (!response.toolCalls?.length) {
            const run = validateRun(await api<Run>(`runs/${job.runId}`));
            const pages = [...new Set(Array.from((response.text || '').matchAll(/\[p:(\d+)\]/g), match => Number(match[1])))].filter(page => job!.readPages.includes(page));
            for (const page of pages) await tools.readPages([page]);
            const cost = Number(run.billing?.goodnessChargedSg);
            const reply = { text: response.text || '未获得回答，请缩小问题范围后重试。', pages, usage: run.usage, ...(Number.isFinite(cost) ? { costSG: cost } : {}) };
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
    },
    stop: async id => {
      const account = session.accountId;
      const job = state.job;
      if (id !== document.id || !job || !account || (await getCurrentAuthUser())?.id !== account) return;
      if (job.runId) {
        const run = validateRun(await requestJson<Run>(`${ROOT}/runs/${job.runId}/abort`, { auth: 'required', method: 'POST' }));
        if (session.accountId !== account || disposed) return;
        if (!['ABORTED', 'COMPLETED', 'FAILED_FINAL'].includes(run.status)) throw new Error('停止请求已提交，请稍后重试确认。');
      }
      job.aborted = true; save(); await flush();
    },
  };
  return { host, dispose() { disposed = true; epoch++; window.removeEventListener('rinspace-session-changed', refresh); listeners.clear(); } };
}
