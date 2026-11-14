import { requestJson } from '@/services/httpClient';
import type { ReaderDocument } from './types';

export type LearningReadingContext = { documentVersion: string; profileDigest: string; maxPages: number; maxChars: number };
export type LearningCheckAction = { kind: 'attempt' | 'challenge' | 'hint' | 'reveal' | 'skip'; checkId: string };
export type LearningConfig = { enabled: boolean; protocol?: 'reader-learning/v1'; profileDigest?: string; maxPages?: number; maxChars?: number; maxIterations?: number; voiceEnabled?: boolean };
export type LearningSession = {
  sessionId: string; documentId: string; documentVersion: string; profileDigest: string;
  revision: number; generation: number; mediaEpoch: number;
  status: 'ready' | 'working' | 'awaiting_answer' | 'paused' | 'deleted'; activeOperation?: string;
  controller: { controllerId: string; fence: number; expiresAt: string };
};
export type LearningLesson = {
  operationId: string; revision: number; html: string; htmlDigest: string; resultHash: string;
  view: { schema: 'reader-lesson-view/v1'; next: 'continue' | 'wait' | 'done'; assessment?: { checkId: string; verdict: 'correct' | 'partially-correct' | 'incorrect' | 'uncertain'; basis: 'model'; assisted: boolean }; steps: {
    id: string; kind: 'explanation' | 'example' | 'derivation' | 'question' | 'feedback';
    parentStepId?: string; evidenceRefs: string[]; narration: string[]; checkId?: string;
  }[] };
};
export type LearningDocumentCommand = { id: string; name: 'read_evidence'; arguments: { pages: number[]; continuation?: string } };
export type LearningOperation = {
  operationId: string; questionId: string; parentOperationId?: string; iteration: number;
  state: 'prepared' | 'unknown' | 'continued' | 'rendering' | 'completed' | 'failed' | 'obsolete' | 'deleted';
  commands?: LearningDocumentCommand[]; lesson?: LearningLesson; problem?: string;
};
export type LearningResponse = { session: LearningSession; eventSequence: number; replayed: boolean; readingContext?: LearningReadingContext; operation?: LearningOperation };
export type LearningCommand = { documentVersion: string; controllerId: string; fence: number; expectedRevision: number };
export type LearningSource = { documentVersion: string; documentTitle: string; pageCount: number; currentPage: number;
  evidence?: { id: string; documentVersion: string; page: number; text: string; digest: string; complete: true;
    kind?: 'text' | 'region-transcription'; region?: { x: number; y: number; width: number; height: number };
    imageDigest?: string; confirmation?: 'user' }[] };

export const LEARNING_ROOT = 'reader/v1/learning';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const positive = (value: number, limit = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 1 && value <= limit;

/** Additive wire types keep the existing immutable Viewer package untouched.
 * The Viewer still validates final HTML/digests and owns rendering its panel. */
export function validLearningConfig(value: LearningConfig | undefined): value is LearningConfig & Required<Pick<LearningConfig, 'protocol' | 'profileDigest' | 'maxPages' | 'maxChars' | 'maxIterations'>> {
  return value?.enabled === true && value.protocol === 'reader-learning/v1' && digest.test(value.profileDigest || '') &&
    positive(value.maxPages || 0, 24) && positive(value.maxChars || 0, 80000) && positive(value.maxIterations || 0, 32) &&
    (value.voiceEnabled === undefined || typeof value.voiceEnabled === 'boolean');
}

function invalidResponse(): never { throw new Error('学习会话数据无效，请刷新后重试。'); }

export function validateLearningResponse(value: LearningResponse, document: ReaderDocument, expectedSession?: string): LearningResponse {
  const s = value?.session;
  if (!s || !Number.isSafeInteger(value.eventSequence) || value.eventSequence < 0 || typeof value.replayed !== 'boolean' ||
    !uuid.test(s.sessionId) || expectedSession && s.sessionId !== expectedSession || s.documentId !== document.id || s.documentVersion !== document.contentVersion ||
    !digest.test(s.profileDigest) || !positive(s.revision) || !positive(s.generation) || !positive(s.mediaEpoch) ||
    !['ready', 'working', 'awaiting_answer', 'paused', 'deleted'].includes(s.status) ||
    !s.controller || !Number.isSafeInteger(s.controller.fence) || s.controller.fence < 0 ||
    s.controller.controllerId && (!uuid.test(s.controller.controllerId) || !Number.isFinite(Date.parse(s.controller.expiresAt))) ||
    (s.status === 'working') !== Boolean(s.activeOperation) || s.activeOperation && !uuid.test(s.activeOperation)) invalidResponse();
  const reading = value.readingContext;
  if (reading && (reading.documentVersion !== document.contentVersion || reading.profileDigest !== s.profileDigest ||
    !positive(reading.maxPages, 24) || !positive(reading.maxChars, 80000) || s.status === 'deleted')) invalidResponse();
  const op = value.operation;
  if (!op) return value;
  if (!uuid.test(op.operationId) || !uuid.test(op.questionId) || !positive(op.iteration, 32) ||
    !['prepared', 'unknown', 'continued', 'rendering', 'completed', 'failed', 'obsolete', 'deleted'].includes(op.state) ||
    op.parentOperationId && !uuid.test(op.parentOperationId) || (op.state === 'deleted') !== (s.status === 'deleted') ||
    op.problem !== undefined && (op.state !== 'failed' || !['MODEL_REQUEST_EXPIRED', 'MODEL_OUTPUT_INVALID', 'MODEL_REQUEST_FAILED'].includes(op.problem))) invalidResponse();
  if (op.commands) {
    if (op.state !== 'unknown' || !s.activeOperation || s.activeOperation !== op.operationId || !Array.isArray(op.commands) || op.commands.length > 32 || !reading) invalidResponse();
    const calls = new Set<string>();
    for (const command of op.commands) {
      if (!command) invalidResponse();
      const args = command.arguments;
      if (command.name !== 'read_evidence' || !/^[A-Za-z0-9_.-]{1,128}$/.test(command.id) || calls.has(command.id) || !args ||
        !Array.isArray(args.pages) || !args.pages.length || args.pages.length > reading!.maxPages || new Set(args.pages).size !== args.pages.length ||
        args.pages.some(page => !positive(page, 2147483647)) || args.continuation !== undefined && (typeof args.continuation !== 'string' || !args.continuation.length || args.continuation.length > 4096)) invalidResponse();
      calls.add(command.id);
    }
  }
  if (op.lesson) {
    const lesson = op.lesson;
    if (op.state !== 'completed' || lesson.operationId !== op.operationId || !positive(lesson.revision) || lesson.revision >= s.revision ||
      typeof lesson.html !== 'string' || !lesson.html || new TextEncoder().encode(lesson.html).length > 8 * 1024 * 1024 ||
      !digest.test(lesson.htmlDigest) || !digest.test(lesson.resultHash) || lesson.view?.schema !== 'reader-lesson-view/v1' ||
      !Array.isArray(lesson.view.steps) || !lesson.view.steps.length || lesson.view.steps.length > 128 || !['continue', 'wait', 'done'].includes(lesson.view.next)) invalidResponse();
    const stepIds = new Set<string>();
    const checkIds = new Set<string>();
    let hasQuestion = false;
    for (const step of lesson.view.steps) {
      if (!step || !/^[a-z][a-z0-9-]{0,63}$/.test(step.id) || stepIds.has(step.id) ||
        !['explanation', 'example', 'derivation', 'question', 'feedback'].includes(step.kind) ||
        step.parentStepId !== undefined && (!/^[a-z][a-z0-9-]{0,63}$/.test(step.parentStepId) || step.parentStepId === step.id) ||
        !Array.isArray(step.evidenceRefs) || step.evidenceRefs.length > 128 || new Set(step.evidenceRefs).size !== step.evidenceRefs.length ||
        step.evidenceRefs.some(ref => typeof ref !== 'string' || !ref.length || ref.length > 128 || ref.includes('\0')) ||
        !Array.isArray(step.narration) || step.narration.length > 16 ||
        step.narration.some(part => typeof part !== 'string' || !part.trim() || Array.from(part).length > 160 || part.includes('\0')) ||
        step.checkId !== undefined && (!/^[a-z][a-z0-9-]{0,63}$/.test(step.checkId) || step.kind !== 'question' || checkIds.has(step.checkId))) invalidResponse();
      stepIds.add(step.id);
      if (step.checkId) checkIds.add(step.checkId);
      hasQuestion ||= step.kind === 'question';
    }
    if (lesson.view.next === 'wait' && !hasQuestion) invalidResponse();
    const assessment = lesson.view.assessment;
    if (assessment && (!/^[a-z][a-z0-9-]{0,63}$/.test(assessment.checkId) || !['correct','partially-correct','incorrect','uncertain'].includes(assessment.verdict) || assessment.basis !== 'model' || typeof assessment.assisted !== 'boolean')) invalidResponse();
  } else if (op.state === 'completed') invalidResponse();
  return value;
}

export function learningCommand(session: LearningSession, controllerId: string): LearningCommand {
  if (session.controller.controllerId !== controllerId || !positive(session.controller.fence)) throw new Error('另一个页面正在使用琳。');
  return { documentVersion: session.documentVersion, controllerId, fence: session.controller.fence, expectedRevision: session.revision };
}

export function learningApi(document: ReaderDocument, assertActive: () => void) {
  return async (path: string, body?: unknown, signal?: AbortSignal, method?: 'DELETE'): Promise<LearningResponse> => {
    assertActive(); signal?.throwIfAborted();
    const response = await requestJson<LearningResponse>(`${LEARNING_ROOT}/${path}`, { auth: 'required', method: method || (body === undefined ? 'GET' : 'POST'), body, signal });
    assertActive(); signal?.throwIfAborted();
    const expectedSession = path.startsWith('sessions/') && !path.startsWith('sessions/recover') ? path.split('/')[1] : undefined;
    return validateLearningResponse(response, document, expectedSession);
  };
}
