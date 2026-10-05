import { publicEnv } from "@/app/config/env";
import {
  authHeaders as sessionAuthHeaders,
  forceRefreshAuthSession,
  getAuthAccessToken,
  getAuthDeviceId,
  getStoredSession,
} from "./phoneAuth";

export type CanonicalTag = {
  id: number;
  displayName: string;
  normalizedName: string;
  usageScope: string;
  parentTagIds: number[];
  version: number;
};
export type TagCreationOperation = {
  operationId: string;
  state:
    | "pending"
    | "activating"
    | "active"
    | "failed"
    | "reconciliation_required";
  tag: CanonicalTag;
};
export type TagCreationOperationStatus = {
  operationId: string;
  tagId: number;
  state: TagCreationOperation["state"];
  currentStep: string;
  publicErrorCode?: string;
  retryable: boolean;
  version: number;
};
export type KnowledgeView = "backlinks" | "outgoing" | "unresolved" | "anchors";
export type KnowledgeConnection = {
  kind: KnowledgeView;
  projectId?: string;
  sourceKind?: string;
  sourceId?: number;
  sourceCommit?: string;
  sourceAnchorId?: string;
  targetTagId?: number;
  targetAnchorId?: string;
  relation?: string;
  label?: string;
  path?: string;
  line?: number;
  anchorId?: string;
  anchorState?: string;
  redirectAnchorId?: string;
};
export type KnowledgePage = {
  view: KnowledgeView;
  items: KnowledgeConnection[];
  nextCursor?: string;
};
export type CanonicalTagReference = {
  id: number;
  displayName: string;
  normalizedName: string;
};
export type CanonicalTagConnections = {
  tag: CanonicalTag;
  parentTagIds: number[];
  childTagIds: number[];
  parentTags: CanonicalTagReference[];
  childTags: CanonicalTagReference[];
  knowledge?: KnowledgePage;
  knowledgeUnavailable: boolean;
};
export type KnowledgeCitation = {
  projectId: string;
  tagId: number;
  anchorId?: string;
  anchorState?: string;
  redirectAnchorId?: string;
  activeCommit: string;
  requestedCommit?: string;
  current: string;
  revision: string;
};
export type TagDirectoryView = "all" | "unclassified" | "review" | "repository";
export type TagDirectoryItem = {
  id: number;
  displayName: string;
  usageScope: string;
  parentTagIds: number[];
  lifecycleState: "active" | "deprecated" | "merged";
  reviewState: "unreviewed" | "reviewed" | "contested";
  repositoryState: "legacy" | "pending" | "failed" | "active";
  repositoryId: number;
  repositoryError?: string;
  version: number;
};
export type TagDirectoryPage = {
  view: TagDirectoryView;
  parentTagId: number;
  items: TagDirectoryItem[];
  nextCursor?: string;
};
export type PublicationCandidate = {
  projectId: string;
  repositoryId: number;
  commit: string;
  sourceRef: string;
  state: string;
  activationEligible: boolean;
  preview: boolean;
  publicErrorCode?: string;
  diagnostics: Array<{
    code: string;
    severity: string;
    message: string;
    source?: string;
    path?: string;
    line?: number;
  }>;
  updatedAt: string;
};
export type TagImpactPreview = {
  tagId: number;
  version: number;
  directChildren: number;
  descendants: number;
  associations: number;
  aliases: number;
  pendingParentReviews: number;
  dependencies: number;
  dependants: number;
  references: number;
  backlinks: number;
  redirects: number;
};
export type CanonicalTagAlias = {
  id: number;
  tagId: number;
  tagVersion: number;
  displayName: string;
  normalizedName: string;
  reviewState: string;
};
export type TagParentSuggestion = {
  id: string;
  tagId: number;
  proposedParentTagIds: number[];
  baseVersion: number;
  reason: string;
  state: string;
  proposedByUid: string;
  reviewedByUid?: string;
  reviewReason?: string;
  createdAt: string;
};
export type TagGovernanceEvent = {
  id: number;
  eventType: string;
  baseVersion: number;
  newVersion: number;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
};
export type TagStatement = {
  id: string;
  subjectTagId: number;
  subjectTagDisplayName?: string;
  predicateTagId: number;
  objectTagId: number;
  objectTagDisplayName?: string;
  contextTagId?: number;
  contextTagDisplayName?: string;
  supersedesStatementId?: string;
  evidence: Record<string, string>;
  reviewState: string;
  rank: number;
  reason: string;
  version: number;
  createdAt: string;
};

// Mastodon owns the origin-level /api/v2 namespace. The Tag governance API is
// served by the current private bridge under /rinspace, even while the legacy
// outer frontend itself is mounted at the origin root.
const privateBasePath =
  publicEnv.publicBasePath && publicEnv.publicBasePath !== "/"
    ? publicEnv.publicBasePath.replace(/\/$/, "")
    : "/rinspace";
const base = `${privateBasePath}/api/v2`;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function numberArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((id) => typeof id === "number")
    ? value
    : null;
}

function parseTag(value: unknown): CanonicalTag | null {
  if (!record(value)) return null;
  const parentTagIds = numberArray(value.parentTagIds);
  if (
    typeof value.id !== "number" ||
    typeof value.displayName !== "string" ||
    typeof value.normalizedName !== "string" ||
    typeof value.usageScope !== "string" ||
    !parentTagIds ||
    typeof value.version !== "number"
  )
    return null;
  return {
    id: value.id,
    displayName: value.displayName,
    normalizedName: value.normalizedName,
    usageScope: value.usageScope,
    parentTagIds,
    version: value.version,
  };
}

function parseTagReference(value: unknown): CanonicalTagReference | null {
  if (!record(value) || typeof value.id !== "number" || typeof value.displayName !== "string" || typeof value.normalizedName !== "string") return null;
  return { id: value.id, displayName: value.displayName, normalizedName: value.normalizedName };
}

function parseTagReferences(value: unknown): CanonicalTagReference[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseTagReference);
  if (items.some((item) => item === null)) return null;
  return items.filter((item): item is CanonicalTagReference => item !== null);
}

async function authenticatedFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  let token = await getAuthAccessToken();
  if (!token && !getStoredSession()) throw new Error("请先登录后创建标签。");
  const perform = () =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        ...sessionAuthHeaders(token),
        "x-device-id": getAuthDeviceId(),
      },
    });
  let response = await perform();
  if (response.status === 401) {
    const fresh = await forceRefreshAuthSession();
    if (fresh && (fresh.managed || fresh.access_token !== token)) {
      token = fresh.access_token;
      response = await perform();
    }
  }
  return response;
}

async function optionalAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthAccessToken().catch(() => null);
  return token
    ? {
        ...sessionAuthHeaders(token),
        "x-device-id": getAuthDeviceId(),
      }
    : {};
}

async function publicRead(path: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    headers: { Accept: "application/json", ...(await optionalAuthHeaders()) },
  });
}

async function errorMessage(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (record(payload) && typeof payload.error === "string")
    return `${payload.error}（${response.status}）`;
  return record(payload) && typeof payload.message === "string"
    ? payload.message
    : `请求失败（${response.status}）`;
}

function parseStatus(payload: unknown): TagCreationOperationStatus | null {
  if (
    !record(payload) ||
    typeof payload.operationId !== "string" ||
    typeof payload.tagId !== "number" ||
    typeof payload.state !== "string" ||
    typeof payload.currentStep !== "string" ||
    typeof payload.retryable !== "boolean" ||
    typeof payload.version !== "number"
  )
    return null;
  return {
    operationId: payload.operationId,
    tagId: payload.tagId,
    state: payload.state as TagCreationOperation["state"],
    currentStep: payload.currentStep,
    publicErrorCode: stringValue(payload.publicErrorCode),
    retryable: payload.retryable,
    version: payload.version,
  };
}

function parseKnowledgePage(value: unknown): KnowledgePage | null {
  if (
    !record(value) ||
    !["backlinks", "outgoing", "unresolved", "anchors"].includes(
      String(value.view),
    ) ||
    !Array.isArray(value.items)
  )
    return null;
  const view = value.view as KnowledgeView;
  const items: KnowledgeConnection[] = [];
  for (const entry of value.items) {
    if (!record(entry) || entry.kind !== view) return null;
    const item: KnowledgeConnection = { kind: view };
    for (const key of [
      "projectId",
      "sourceKind",
      "sourceCommit",
      "sourceAnchorId",
      "targetAnchorId",
      "relation",
      "label",
      "path",
      "anchorId",
      "anchorState",
      "redirectAnchorId",
    ] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "string")
        return null;
      const text = stringValue(entry[key]);
      if (text) item[key] = text;
    }
    for (const key of ["sourceId", "targetTagId", "line"] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "number")
        return null;
      if (typeof entry[key] === "number") item[key] = entry[key];
    }
    items.push(item);
  }
  if (value.nextCursor !== undefined && typeof value.nextCursor !== "string")
    return null;
  return { view, items, nextCursor: stringValue(value.nextCursor) };
}

function parseCitation(value: unknown): KnowledgeCitation | null {
  if (
    !record(value) ||
    typeof value.projectId !== "string" ||
    typeof value.tagId !== "number" ||
    typeof value.activeCommit !== "string" ||
    typeof value.current !== "string" ||
    typeof value.revision !== "string"
  )
    return null;
  return {
    projectId: value.projectId,
    tagId: value.tagId,
    activeCommit: value.activeCommit,
    current: value.current,
    revision: value.revision,
    anchorId: stringValue(value.anchorId),
    anchorState: stringValue(value.anchorState),
    redirectAnchorId: stringValue(value.redirectAnchorId),
    requestedCommit: stringValue(value.requestedCommit),
  };
}

function parseDirectoryItem(value: unknown): TagDirectoryItem | null {
  if (!record(value)) return null;
  const parents = numberArray(value.parentTagIds);
  if (
    typeof value.id !== "number" ||
    typeof value.displayName !== "string" ||
    typeof value.usageScope !== "string" ||
    !parents ||
    !["active", "deprecated", "merged"].includes(
      String(value.lifecycleState),
    ) ||
    !["unreviewed", "reviewed", "contested"].includes(
      String(value.reviewState),
    ) ||
    !["legacy", "pending", "failed", "active"].includes(
      String(value.repositoryState),
    ) ||
    typeof value.repositoryId !== "number" ||
    typeof value.version !== "number"
  )
    return null;
  if (
    value.repositoryError !== undefined &&
    typeof value.repositoryError !== "string"
  )
    return null;
  return {
    id: value.id,
    displayName: value.displayName,
    usageScope: value.usageScope,
    parentTagIds: parents,
    lifecycleState: value.lifecycleState as TagDirectoryItem["lifecycleState"],
    reviewState: value.reviewState as TagDirectoryItem["reviewState"],
    repositoryState:
      value.repositoryState as TagDirectoryItem["repositoryState"],
    repositoryId: value.repositoryId,
    repositoryError: stringValue(value.repositoryError),
    version: value.version,
  };
}

export async function createCanonicalTag(input: {
  displayName: string;
  usageScope: string;
  parentTagIds: number[];
  idempotencyKey: string;
}): Promise<TagCreationOperation> {
  const response = await authenticatedFetch("/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const payload: unknown = await response.json();
  const tag = record(payload) ? parseTag(payload.tag) : null;
  if (
    !record(payload) ||
    typeof payload.operationId !== "string" ||
    typeof payload.state !== "string" ||
    !tag
  )
    throw new Error("标签创建返回格式异常。");
  return {
    operationId: payload.operationId,
    state: payload.state as TagCreationOperation["state"],
    tag,
  };
}

export async function compareCanonicalTags(
  name: string,
): Promise<CanonicalTag[]> {
  const response = await publicRead(
    `/tags/candidates?name=${encodeURIComponent(name)}`,
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const payload: unknown = await response.json();
  if (!record(payload) || !Array.isArray(payload.items))
    throw new Error("同名标签比较返回格式异常。");
  const items = payload.items.map(parseTag);
  if (items.some((item) => item === null))
    throw new Error("同名标签比较返回格式异常。");
  return items.filter((item): item is CanonicalTag => item !== null);
}

export async function loadCanonicalTagConnections(
  id: number,
  view: KnowledgeView,
  cursor = "",
  limit = 40,
): Promise<CanonicalTagConnections> {
  const query = new URLSearchParams({ view, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  const response = await publicRead(`/tags/${id}/connections?${query}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const payload: unknown = await response.json();
  if (!record(payload)) throw new Error("标签连接返回格式异常。");
  const tag = parseTag(payload.tag);
  const parentTagIds = numberArray(payload.parentTagIds);
  const childTagIds = numberArray(payload.childTagIds);
  const parentTags = payload.parentTags === undefined ? [] : parseTagReferences(payload.parentTags);
  const childTags = payload.childTags === undefined ? [] : parseTagReferences(payload.childTags);
  const knowledge =
    payload.knowledge === undefined
      ? undefined
      : parseKnowledgePage(payload.knowledge);
  if (
    !tag ||
    !parentTagIds ||
    !childTagIds ||
    !parentTags ||
    !childTags ||
    (payload.knowledge !== undefined && !knowledge) ||
    (payload.knowledgeUnavailable !== undefined &&
      typeof payload.knowledgeUnavailable !== "boolean")
  )
    throw new Error("标签连接返回格式异常。");
  return {
    tag,
    parentTagIds,
    childTagIds,
    parentTags,
    childTags,
    knowledge: knowledge || undefined,
    knowledgeUnavailable: payload.knowledgeUnavailable === true,
  };
}

export async function loadCanonicalTagCitation(
  id: number,
  anchorId = "",
  commit = "",
): Promise<KnowledgeCitation> {
  const query = new URLSearchParams();
  if (anchorId) query.set("anchorId", anchorId);
  if (commit) query.set("commit", commit);
  const response = await publicRead(
    `/tags/${id}/citation${query.size ? `?${query}` : ""}`,
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const citation = parseCitation(await response.json());
  if (!citation) throw new Error("标签引用返回格式异常。");
  return citation;
}

export async function loadTagPublicationCandidate(
  id: number,
  commit: string,
): Promise<PublicationCandidate> {
  const response = await publicRead(
    `/tags/${id}/candidates/${encodeURIComponent(commit)}`,
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const value: unknown = await response.json();
  if (
    !record(value) ||
    value.projectId !== `tag-wiki:${id}` ||
    typeof value.repositoryId !== "number" ||
    value.commit !== commit ||
    typeof value.sourceRef !== "string" ||
    typeof value.state !== "string" ||
    typeof value.activationEligible !== "boolean" ||
    typeof value.preview !== "boolean" ||
    value.preview === value.activationEligible ||
    !Array.isArray(value.diagnostics) ||
    typeof value.updatedAt !== "string"
  )
    throw new Error("候选修订诊断返回格式异常。");
  const diagnostics: PublicationCandidate["diagnostics"] = [];
  for (const entry of value.diagnostics) {
    if (
      !record(entry) ||
      typeof entry.code !== "string" ||
      typeof entry.severity !== "string" ||
      typeof entry.message !== "string" ||
      (entry.source !== undefined && typeof entry.source !== "string") ||
      (entry.path !== undefined && typeof entry.path !== "string") ||
      (entry.line !== undefined && typeof entry.line !== "number")
    )
      throw new Error("候选修订诊断返回格式异常。");
    diagnostics.push({
      code: entry.code,
      severity: entry.severity,
      message: entry.message,
      source: stringValue(entry.source),
      path: stringValue(entry.path),
      line: typeof entry.line === "number" ? entry.line : undefined,
    });
  }
  return {
    projectId: value.projectId,
    repositoryId: value.repositoryId,
    commit: value.commit,
    sourceRef: value.sourceRef,
    state: value.state,
    activationEligible: value.activationEligible,
    preview: value.preview,
    publicErrorCode: stringValue(value.publicErrorCode),
    diagnostics,
    updatedAt: value.updatedAt,
  };
}

export async function loadTagDirectory(
  view: TagDirectoryView,
  parentTagId = 0,
  cursor = "",
  limit = 36,
): Promise<TagDirectoryPage> {
  const query = new URLSearchParams({ view, limit: String(limit) });
  if (parentTagId > 0) query.set("parentId", String(parentTagId));
  if (cursor) query.set("cursor", cursor);
  const response = await publicRead(`/tags/directory?${query}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const payload: unknown = await response.json();
  if (
    !record(payload) ||
    payload.view !== view ||
    typeof payload.parentTagId !== "number" ||
    !Array.isArray(payload.items) ||
    (payload.nextCursor !== undefined && typeof payload.nextCursor !== "string")
  )
    throw new Error("标签目录返回格式异常。");
  const items = payload.items.map(parseDirectoryItem);
  if (items.some((item) => item === null))
    throw new Error("标签目录返回格式异常。");
  return {
    view,
    parentTagId: payload.parentTagId,
    items: items.filter((item): item is TagDirectoryItem => item !== null),
    nextCursor: stringValue(payload.nextCursor),
  };
}

export async function loadTagCreationOperation(
  id: string,
): Promise<TagCreationOperationStatus> {
  const response = await authenticatedFetch(
    `/tag-operations/${encodeURIComponent(id)}`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const parsed = parseStatus(await response.json());
  if (!parsed) throw new Error("标签创建进度返回格式异常。");
  return parsed;
}

export async function retryTagCreationOperation(
  id: string,
): Promise<TagCreationOperationStatus> {
  const response = await authenticatedFetch(
    `/tag-operations/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const parsed = parseStatus(await response.json());
  if (!parsed) throw new Error("标签创建重试返回格式异常。");
  return parsed;
}

export async function loadTagImpact(id: number): Promise<TagImpactPreview> {
  const response = await publicRead(`/tags/${id}/impact`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const value: unknown = await response.json();
  const keys = [
    "tagId",
    "version",
    "directChildren",
    "descendants",
    "associations",
    "aliases",
    "pendingParentReviews",
    "dependencies",
    "dependants",
    "references",
    "backlinks",
    "redirects",
  ] as const;
  if (
    !record(value) ||
    keys.some((key) => typeof value[key] !== "number") ||
    value.tagId !== id
  )
    throw new Error("标签影响预览返回格式异常。");
  return Object.fromEntries(
    keys.map((key) => [key, value[key]]),
  ) as TagImpactPreview;
}

export async function loadTagAliases(id: number): Promise<CanonicalTagAlias[]> {
  const response = await publicRead(`/tags/${id}/aliases`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const value: unknown = await response.json();
  if (!record(value) || !Array.isArray(value.items))
    throw new Error("标签别名返回格式异常。");
  return value.items.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "number" ||
      item.tagId !== id ||
      typeof item.tagVersion !== "number" ||
      typeof item.displayName !== "string" ||
      typeof item.normalizedName !== "string" ||
      typeof item.reviewState !== "string"
    )
      throw new Error("标签别名返回格式异常。");
    return {
      id: item.id,
      tagId: item.tagId,
      tagVersion: item.tagVersion,
      displayName: item.displayName,
      normalizedName: item.normalizedName,
      reviewState: item.reviewState,
    };
  });
}

export async function loadTagGovernanceHistory(
  id: number,
): Promise<TagGovernanceEvent[]> {
  const response = await publicRead(`/tags/${id}/history`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const value: unknown = await response.json();
  if (!record(value) || !Array.isArray(value.items))
    throw new Error("标签治理历史返回格式异常。");
  return value.items.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "number" ||
      typeof item.eventType !== "string" ||
      typeof item.baseVersion !== "number" ||
      typeof item.newVersion !== "number" ||
      typeof item.reason !== "string" ||
      !record(item.before) ||
      !record(item.after) ||
      typeof item.createdAt !== "string"
    )
      throw new Error("标签治理历史返回格式异常。");
    return item as TagGovernanceEvent;
  });
}

async function governanceMutation(
  path: string,
  method: string,
  input: unknown,
): Promise<unknown> {
  const response = await authenticatedFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function suggestTagParents(
  id: number,
  input: {
    parentTagIds: number[];
    baseVersion: number;
    reason: string;
    requestId: string;
  },
): Promise<TagParentSuggestion> {
  const value = await governanceMutation(
    `/tags/${id}/parent-suggestions`,
    "POST",
    input,
  );
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    value.tagId !== id ||
    !numberArray(value.proposedParentTagIds) ||
    typeof value.baseVersion !== "number" ||
    typeof value.reason !== "string" ||
    typeof value.state !== "string" ||
    typeof value.proposedByUid !== "string" ||
    typeof value.createdAt !== "string"
  )
    throw new Error("父级建议返回格式异常。");
  return value as unknown as TagParentSuggestion;
}

export async function renameCanonicalTag(
  id: number,
  input: {
    displayName: string;
    baseVersion: number;
    reason: string;
    requestId: string;
  },
): Promise<CanonicalTag> {
  const value = await governanceMutation(
    `/tags/${id}/identity`,
    "PATCH",
    input,
  );
  const tag = record(value) ? parseTag(value.tag) : null;
  if (!tag || tag.id !== id) throw new Error("标签重命名返回格式异常。");
  return tag;
}

export async function addCanonicalTagAlias(
  id: number,
  input: {
    displayName: string;
    baseVersion: number;
    reason: string;
    requestId: string;
  },
): Promise<CanonicalTagAlias> {
  const value = await governanceMutation(`/tags/${id}/aliases`, "POST", input);
  if (
    !record(value) ||
    typeof value.id !== "number" ||
    value.tagId !== id ||
    typeof value.tagVersion !== "number" ||
    typeof value.displayName !== "string" ||
    typeof value.normalizedName !== "string" ||
    typeof value.reviewState !== "string"
  )
    throw new Error("标签别名返回格式异常。");
  return value as CanonicalTagAlias;
}

export async function loadTagStatements(
  id: number,
  direction: "requires" | "required-by",
): Promise<TagStatement[]> {
  const response = await publicRead(`/tags/${id}/${direction}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const value: unknown = await response.json();
  if (!record(value) || !Array.isArray(value.items))
    throw new Error("先修关系返回格式异常。");
  return value.items.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      typeof item.subjectTagId !== "number" ||
      (item.subjectTagDisplayName !== undefined && typeof item.subjectTagDisplayName !== "string") ||
      typeof item.predicateTagId !== "number" ||
      typeof item.objectTagId !== "number" ||
      (item.objectTagDisplayName !== undefined && typeof item.objectTagDisplayName !== "string") ||
      (item.contextTagId !== undefined &&
        typeof item.contextTagId !== "number") ||
      (item.contextTagDisplayName !== undefined && typeof item.contextTagDisplayName !== "string") ||
      !record(item.evidence) ||
      Object.values(item.evidence).some((entry) => typeof entry !== "string") ||
      typeof item.reviewState !== "string" ||
      typeof item.rank !== "number" ||
      typeof item.reason !== "string" ||
      typeof item.version !== "number" ||
      typeof item.createdAt !== "string"
    )
      throw new Error("先修关系返回格式异常。");
    return item as unknown as TagStatement;
  });
}

export async function proposeTagRequires(
  id: number,
  input: {
    objectTagId: number;
    contextTagId?: number;
    supersedesStatementId?: string;
    evidence?: Record<string, string>;
    reason: string;
  },
): Promise<TagStatement> {
  const value = await governanceMutation(`/tags/${id}/requires`, "POST", input);
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    value.subjectTagId !== id ||
    typeof value.predicateTagId !== "number" ||
    typeof value.objectTagId !== "number" ||
    (value.contextTagId !== undefined &&
      typeof value.contextTagId !== "number") ||
    (value.supersedesStatementId !== undefined &&
      typeof value.supersedesStatementId !== "string") ||
    !record(value.evidence) ||
    Object.values(value.evidence).some((entry) => typeof entry !== "string") ||
    value.reviewState !== "proposed" ||
    typeof value.rank !== "number" ||
    typeof value.reason !== "string" ||
    typeof value.version !== "number" ||
    typeof value.createdAt !== "string"
  )
    throw new Error("先修关系提案返回格式异常。");
  return value as unknown as TagStatement;
}
