import { requestAdminJson } from '../httpClient';

export type LearningAdminConfig = {
  schema: 'reader-learning-admin/v1'; enabled: boolean; version: number;
  budget: { inputTokens: number; outputTokens: number }; ready: boolean;
  updatedBy: string; updatedAt: string;
};
export type LearningAccountAccess = {
  actor_uid: string; version: number; enabled: boolean; valid_until: string | null;
  updated_by: string; reason: string; updated_at: string;
};
export type LearningAccessPage = { items: LearningAccountAccess[]; nextAfter: string | null };
const root = 'wallet/reader-learning';
const integer = (v: unknown, min = 1) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const text = (v: unknown, max: number, empty = false): v is string =>
  typeof v === 'string' && (empty || v.length > 0) && v.trim() === v && new TextEncoder().encode(v).length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
function invalid(): never { throw new TypeError('Invalid learning administration response'); }
function parseConfig(value: LearningAdminConfig): LearningAdminConfig {
  if (!value || value.schema !== 'reader-learning-admin/v1' || typeof value.enabled !== 'boolean' ||
    !integer(value.version) || typeof value.ready !== 'boolean' || !value.budget ||
    !integer(value.budget.inputTokens) || value.budget.inputTokens > 1048576 ||
    !integer(value.budget.outputTokens) || value.budget.outputTokens > 65536 ||
    !text(value.updatedBy, 256, true) || !date(value.updatedAt)) invalid();
  return value;
}
function parseAccess(value: LearningAccountAccess): LearningAccountAccess {
  if (!value || !text(value.actor_uid, 256) || !integer(value.version) || typeof value.enabled !== 'boolean' ||
    value.valid_until !== null && !date(value.valid_until) || value.enabled && !value.valid_until ||
    !text(value.updated_by, 256) || typeof value.reason !== 'string' || !value.reason.trim() ||
    Array.from(value.reason).length > 1000 || !date(value.updated_at)) invalid();
  return value;
}
export async function loadLearningAdminConfig(signal?: AbortSignal): Promise<LearningAdminConfig> {
  return parseConfig(await requestAdminJson(root + '/config', { auth: 'required', signal }));
}
export async function saveLearningAdminConfig(input: {
  expectedVersion: number; enabled: boolean; budget: LearningAdminConfig['budget']; reason: string;
}): Promise<LearningAdminConfig> {
  return parseConfig(await requestAdminJson(root + '/config', { auth: 'required', method: 'PUT', body: input }));
}
export async function loadLearningAccess(after?: string, signal?: AbortSignal): Promise<LearningAccessPage> {
  const page = await requestAdminJson<LearningAccessPage>(root + '/accounts', { auth: 'required', query: { after }, signal });
  if (!page || !Array.isArray(page.items) || page.items.length > 20 || page.nextAfter !== null && !text(page.nextAfter, 256)) invalid();
  const items = page.items.map(parseAccess);
  if (new Set(items.map(item => item.actor_uid)).size !== items.length ||
    // PostgreSQL owns cursor ordering. Browser UTF-16 string comparison does
    // not necessarily match the database collation for Native account IDs.
    page.nextAfter !== null && page.nextAfter === after ||
    items.length > 0 && page.nextAfter !== null && page.nextAfter !== items.at(-1)!.actor_uid) invalid();
  return { items, nextAfter: page.nextAfter };
}
export async function saveLearningAccess(uid: string, input: {
  expectedVersion: number; enabled: boolean; expiresAt?: string; reason: string;
}): Promise<LearningAccountAccess> {
  if (!text(uid, 256)) invalid();
  const result = parseAccess(await requestAdminJson(root + '/accounts/' + encodeURIComponent(uid), { auth: 'required', method: 'PUT', body: input }));
  if (result.actor_uid !== uid || result.version !== input.expectedVersion + 1 || result.enabled !== input.enabled) invalid();
  return result;
}
