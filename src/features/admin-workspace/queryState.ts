import type {
  ModerationCaseFilterSource,
  ModerationCaseFilterStatus,
} from "@/services/contracts";
import type { AdminSystemSection } from "@/services/domains/operations";

export type AdminView =
  | "home"
  | "content"
  | "review"
  | "refunds"
  | "risk"
  | "system";
export type AdminContentSection =
  | "blogs"
  | "books"
  | "questions"
  | "answers"
  | "discussions"
  | "dynamics"
  | "users"
  | "tags"
  | "cultivation";

export type AdminWorkspaceQuery = Readonly<{
  view: AdminView;
  section: AdminContentSection;
  source: ModerationCaseFilterSource;
  status: ModerationCaseFilterStatus;
  page: number;
  caseId: number | null;
  systemSection: AdminSystemSection;
}>;

const adminViews = new Set<AdminView>([
  "home",
  "content",
  "review",
  "refunds",
  "risk",
  "system",
]);
const contentSections = new Set<AdminContentSection>([
  "blogs",
  "books",
  "questions",
  "answers",
  "discussions",
  "dynamics",
  "users",
  "tags",
  "cultivation",
]);
const reviewSources = new Set<ModerationCaseFilterSource>([
  "all",
  "machine",
  "report",
  "hybrid",
]);
const reviewStatuses = new Set<ModerationCaseFilterStatus>([
  "active",
  "pending",
  "deferred",
  "closed",
]);
const systemSections = new Set<AdminSystemSection>([
  "overview",
  "events",
  "publishing",
  "consistency",
  "records",
]);

function memberOf<T extends string>(
  values: ReadonlySet<T>,
  value: string | null,
  fallback: T,
): T {
  return value && values.has(value as T) ? (value as T) : fallback;
}

function positiveInteger(value: string | null, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseAdminWorkspaceQuery(
  searchParams: URLSearchParams,
): AdminWorkspaceQuery {
  const caseId = positiveInteger(searchParams.get("case"), 0);
  return {
    view: memberOf(adminViews, searchParams.get("view"), "home"),
    section: memberOf(contentSections, searchParams.get("section"), "blogs"),
    source: memberOf(reviewSources, searchParams.get("source"), "all"),
    status: memberOf(reviewStatuses, searchParams.get("status"), "active"),
    page: positiveInteger(searchParams.get("page"), 1),
    caseId: caseId || null,
    systemSection: memberOf(
      systemSections,
      searchParams.get("system"),
      "overview",
    ),
  };
}

export function adminWorkspaceSearchParams(
  state: AdminWorkspaceQuery,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== "home") params.set("view", state.view);
  if (state.view === "content" && state.section !== "blogs")
    params.set("section", state.section);
  if (state.view === "review") {
    if (state.source !== "all") params.set("source", state.source);
    if (state.status !== "active") params.set("status", state.status);
    if (state.page > 1) params.set("page", String(state.page));
    if (state.caseId) params.set("case", String(state.caseId));
  }
  if (state.view === "system" && state.systemSection !== "overview")
    params.set("system", state.systemSection);
  return params;
}

export function adminSystemSectionSearchParams(
  current: URLSearchParams,
  systemSection: AdminSystemSection,
): URLSearchParams {
  return adminWorkspaceSearchParams({
    ...parseAdminWorkspaceQuery(current),
    view: "system",
    systemSection,
  });
}

export function adminWorkspaceViewSearchParams(
  current: URLSearchParams,
  view: AdminView,
): URLSearchParams {
  const state = parseAdminWorkspaceQuery(current);
  return adminWorkspaceSearchParams({ ...state, view });
}

export function adminContentSectionSearchParams(
  current: URLSearchParams,
  section: AdminContentSection,
): URLSearchParams {
  return adminWorkspaceSearchParams({
    ...parseAdminWorkspaceQuery(current),
    view: "content",
    section,
  });
}

export function adminReviewSearchParams(
  current: URLSearchParams,
  patch: Partial<
    Pick<AdminWorkspaceQuery, "source" | "status" | "page" | "caseId">
  >,
): URLSearchParams {
  const state = parseAdminWorkspaceQuery(current);
  const filterChanged =
    (patch.source !== undefined && patch.source !== state.source) ||
    (patch.status !== undefined && patch.status !== state.status);
  return adminWorkspaceSearchParams({
    ...state,
    ...patch,
    view: "review",
    page:
      filterChanged && patch.page === undefined
        ? 1
        : (patch.page ?? state.page),
  });
}
