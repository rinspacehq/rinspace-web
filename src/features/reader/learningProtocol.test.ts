import { expect, test } from 'vitest';
import { learningCommand, validLearningConfig, validateLearningResponse, type LearningResponse } from './learningProtocol';
import type { ReaderDocument } from './types';

const document: ReaderDocument = { id: '10000000-0000-4000-8000-000000000001', contentVersion: 'pdf-tree-v1:' + 'a'.repeat(64), title: 'Original synthetic.pdf', size: 10, lastModified: 0 };
const sessionId = '20000000-0000-4000-8000-000000000001';
const operationId = '40000000-0000-4000-8000-000000000001';
const controllerId = '60000000-0000-4000-8000-000000000001';
function fixture(): LearningResponse {
  return { eventSequence: 2, replayed: false, session: {
    sessionId, documentId: document.id, documentVersion: document.contentVersion, profileDigest: 'b'.repeat(64), revision: 2, generation: 1, mediaEpoch: 1,
    status: 'working', activeOperation: operationId, controller: { controllerId, fence: 1, expiresAt: '2026-11-12T12:30:00Z' },
  }, readingContext: { documentVersion: document.contentVersion, profileDigest: 'b'.repeat(64), maxPages: 24, maxChars: 80000 },
  operation: { operationId, questionId: operationId, iteration: 1, state: 'unknown', commands: [{ id: 'read-1', name: 'read_evidence', arguments: { pages: [1, 2] } }] } };
}

test('only enables the explicit learning protocol with bounded frozen capabilities', () => {
  expect(validLearningConfig({ enabled: true })).toBe(false);
  expect(validLearningConfig({ enabled: true, protocol: 'reader-learning/v1', profileDigest: 'b'.repeat(64), maxPages: 24, maxChars: 80000, maxIterations: 32 })).toBe(true);
  expect(validLearningConfig({ enabled: true, protocol: 'reader-learning/v1', profileDigest: 'b'.repeat(64), maxPages: 25, maxChars: 80000, maxIterations: 32 })).toBe(false);
});

test('rejects changed document, session, profile or an unscoped browser tool before execution', () => {
  expect(validateLearningResponse(fixture(), document, sessionId).operation?.commands?.[0].name).toBe('read_evidence');
  const changes: ((response: LearningResponse) => void)[] = [
    response => { response.eventSequence = -1; },
    response => { response.replayed = 'yes' as unknown as boolean; },
    response => { response.session.documentVersion += 'a'; },
    response => { response.session.sessionId = operationId; },
    response => { response.readingContext!.profileDigest = 'c'.repeat(64); },
    response => { response.operation!.commands![0].name = 'present_lesson' as 'read_evidence'; },
    response => { response.operation!.commands![0].arguments.pages = Array.from({ length: 25 }, (_, index) => index + 1); },
    response => { response.operation!.commands![0].arguments.pages = [1, 1]; },
    response => { response.operation!.commands![0].arguments.continuation = 'x'.repeat(4097); },
    response => { response.operation!.problem = 'MODEL_OUTPUT_INVALID'; },
  ];
  for (const change of changes) {
    const value = fixture(); change(value);
    expect(() => validateLearningResponse(value, document, sessionId)).toThrow('学习会话数据无效');
  }
});

test('a completed model call cannot masquerade as a published rendered lesson', () => {
  const response = fixture();
  response.operation!.state = 'completed';
  response.operation!.commands = undefined;
  expect(() => validateLearningResponse(response, document, sessionId)).toThrow('学习会话数据无效');
  expect(() => learningCommand(fixture().session, '60000000-0000-4000-8000-000000000002')).toThrow('另一个页面');
  const failed = fixture();
  failed.session.status = 'ready'; failed.session.activeOperation = undefined;
  failed.operation!.state = 'failed'; failed.operation!.commands = undefined; failed.operation!.problem = 'MODEL_OUTPUT_INVALID';
  expect(validateLearningResponse(failed, document, sessionId).operation?.problem).toBe('MODEL_OUTPUT_INVALID');
  failed.operation!.problem = 'ARBITRARY_DETAIL';
  expect(() => validateLearningResponse(failed, document, sessionId)).toThrow('学习会话数据无效');
});

test('accepts the required partially-correct assessment and rejects unknown verdicts', () => {
  const response = fixture();
  response.session.status = 'ready';
  response.session.activeOperation = undefined;
  response.session.revision = 3;
  response.operation = {
    operationId, questionId: operationId, iteration: 1, state: 'completed',
    lesson: {
      operationId, revision: 2, html: '<div id="fragment-feedback">Keep the valid step.</div>',
      htmlDigest: 'c'.repeat(64), resultHash: 'd'.repeat(64),
      view: {
        schema: 'reader-lesson-view/v1', next: 'done',
        assessment: { checkId: 'check-one', verdict: 'partially-correct', basis: 'model', assisted: false },
        steps: [{ id: 'feedback', kind: 'feedback', evidenceRefs: [], narration: [] }],
      },
    },
  };
  expect(validateLearningResponse(response, document, sessionId).operation?.lesson?.view.assessment?.verdict).toBe('partially-correct');
  response.operation.lesson!.view.assessment!.verdict = 'mastered' as 'partially-correct';
  expect(() => validateLearningResponse(response, document, sessionId)).toThrow('学习会话数据无效');
});

test('rejects malformed lesson steps before the Viewer consumes them', () => {
  const completed = (): LearningResponse => {
    const response = fixture();
    response.session.status = 'ready'; response.session.activeOperation = undefined; response.session.revision = 3;
    response.operation = { operationId, questionId: operationId, iteration: 1, state: 'completed', lesson: {
      operationId, revision: 2, html: '<div id="fragment-explain">Explain.</div>', htmlDigest: 'c'.repeat(64), resultHash: 'd'.repeat(64),
      view: { schema: 'reader-lesson-view/v1', next: 'done', steps: [{ id: 'explain', kind: 'explanation', evidenceRefs: [], narration: [] }] },
    } };
    return response;
  };
  const changes: ((response: LearningResponse) => void)[] = [
    response => { response.operation!.lesson!.view.steps.push({ ...response.operation!.lesson!.view.steps[0] }); },
    response => { response.operation!.lesson!.view.steps[0].kind = 'mastery' as 'explanation'; },
    response => { response.operation!.lesson!.view.steps[0].parentStepId = 'explain'; },
    response => { response.operation!.lesson!.view.steps[0].checkId = 'check-one'; },
    response => { response.operation!.lesson!.view.steps[0].evidenceRefs = ['same', 'same']; },
    response => { response.operation!.lesson!.view.steps[0].narration = ['']; },
    response => { response.operation!.lesson!.view.next = 'wait'; },
  ];
  expect(validateLearningResponse(completed(), document, sessionId).operation?.lesson?.view.steps[0].id).toBe('explain');
  for (const change of changes) {
    const response = completed(); change(response);
    expect(() => validateLearningResponse(response, document, sessionId)).toThrow('学习会话数据无效');
  }
});
