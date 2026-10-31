import { beforeEach, expect, test, vi } from 'vitest';
import { createReaderAgentHost, runReaderTool } from './agentHost';
import { getCurrentAuthUser } from '@/services/phoneAuth';
import { writeReaderAgent } from './storage';
import { requestJson, ServiceError } from '@/services/httpClient';
import type { RinDocumentTools } from '@rinspacehq/embedpdf-snippet/dist/reader-api';
import type { ReaderDocument } from './types';

const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock('./storage', () => ({
  readReaderAgent: vi.fn(async (key: string) => structuredClone(records.get(key))),
  writeReaderAgent: vi.fn(async (key: string, value: unknown) => { records.set(key, structuredClone(value)); }),
}));
vi.mock('@/services/phoneAuth', () => ({ getCurrentAuthUser: vi.fn() }));
vi.mock('@/services/httpClient', async () => ({ ...(await vi.importActual('@/services/httpClient')), requestJson: vi.fn() }));
vi.mock('@/utils/authDialog', () => ({ requestAuthDialog: vi.fn() }));
const document: ReaderDocument = { id: '10000000-0000-4000-8000-000000000001', contentVersion: 'pdf-tree-v1:' + 'a'.repeat(64), title: 'fixture.pdf', size: 10, lastModified: 0 };
const tools: RinDocumentTools = {
  info: () => ({ documentId: document.id, title: document.title, pageCount: 3, currentPage: 1 }),
  readPages: vi.fn(async (pages: number[]) => pages.map(page => ({ page, text: 'Heading text' }))),
  selection: vi.fn(async () => []), search: vi.fn(async () => []), navigate: vi.fn(),
};
beforeEach(() => {
  records.clear(); vi.clearAllMocks();
  vi.mocked(getCurrentAuthUser).mockResolvedValue({ id: 'reader-a' } as Awaited<ReturnType<typeof getCurrentAuthUser>>);
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
  expect(requestJson).toHaveBeenCalledTimes(3); // Restoring never calls the model.
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
  expect(requestJson).not.toHaveBeenCalled();
  instance.dispose();
});

test('local persistence failure prevents a paid request', async () => {
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().status).toBe('authenticated'));
  vi.mocked(writeReaderAgent).mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
  instance.host.save(document.id, { messages: [], draft: 'Explain', running: true });
  await expect(instance.host.send({ documentId: document.id, message: 'Explain', tools, signal: new AbortController().signal })).rejects.toThrow('无法保存');
  expect(requestJson).not.toHaveBeenCalled(); instance.dispose();
});

test('server policy failures produce actionable copy without dispatching a run', async () => {
  const instance = createReaderAgentHost(document);
  await vi.waitFor(() => expect(instance.host.session().status).toBe('authenticated'));
  vi.mocked(requestJson).mockRejectedValueOnce(new ServiceError('{"code":"POLICY_LIMIT"}', 429, { code: 'POLICY_LIMIT' }, 'POLICY_LIMIT'));
  await expect(instance.host.send({ documentId: document.id, message: 'Explain', tools, signal: new AbortController().signal })).rejects.toThrow('额度或调用限额');
  expect(requestJson).toHaveBeenCalledTimes(1); instance.dispose();
});
