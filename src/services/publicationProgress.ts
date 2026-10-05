import { publicEnv } from "@/app/config/env";
import { authHeaders, getAuthAccessToken } from "./phoneAuth";

export type PublicationState =
  | "awaiting_event"
  | "validating"
  | "queued"
  | "running"
  | "activating"
  | "published"
  | "failed"
  | "superseded"
  | "reconciliation_required";

export type PublicationDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  source?: string;
  occurredAt?: string;
};

export type PublicationQueue = {
  jobsAheadEstimate?: number;
  queuedProjects: number;
  activeProjects: number;
  estimate: {
    estimatedStartAt: string;
    estimatedStartRange: { earliest: string; latest: string };
    confidence: "low" | "medium" | "high";
    sampleCount: number;
    estimatorVersion: string;
    scope: "instance" | "cluster";
    calculatedAt: string;
  } | null;
  scope: "instance" | "cluster";
  calculatedAt: string;
};

export type PublicationRun = {
  stage: string;
  elapsedSeconds: number;
  progress: { completedStages: number; totalStages: number };
};

type PublicationBase = {
  schemaVersion: "rin-publication-progress/v1";
  view: "public" | "author";
  projectId: string;
  displayingPreviousVersion: boolean;
  updatedAt: string;
  sourceCommitShort?: string;
  author?: {
    diagnostics: PublicationDiagnostic[];
    sourceCommit?: string;
    diagnosticsPath?: string;
  };
};

export type PublicationProgress =
  | (PublicationBase & { state: "queued"; queue: PublicationQueue })
  | (PublicationBase & { state: "running"; run: PublicationRun })
  | (PublicationBase & {
      state: "failed";
      failure: { code: string; message: string };
    })
  | (PublicationBase & {
      state:
        | "awaiting_event"
        | "validating"
        | "activating"
        | "published"
        | "superseded"
        | "reconciliation_required";
    });

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: JsonRecord,
  required: string[],
  optional: string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    Number.isFinite(Date.parse(value))
  );
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseDiagnostic(value: unknown): PublicationDiagnostic | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["code", "severity", "message"], ["source", "occurredAt"])
  )
    return null;
  if (
    typeof value.code !== "string" ||
    !["info", "warning", "error"].includes(String(value.severity)) ||
    typeof value.message !== "string" ||
    (value.source !== undefined && typeof value.source !== "string") ||
    (value.occurredAt !== undefined && !timestamp(value.occurredAt))
  )
    return null;
  return {
    code: value.code,
    severity: value.severity as PublicationDiagnostic["severity"],
    message: value.message,
    ...(typeof value.source === "string" ? { source: value.source } : {}),
    ...(typeof value.occurredAt === "string"
      ? { occurredAt: value.occurredAt }
      : {}),
  };
}

function parseQueue(value: unknown): PublicationQueue | null {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      ["queuedProjects", "activeProjects", "estimate", "scope", "calculatedAt"],
      ["jobsAheadEstimate"],
    )
  )
    return null;
  if (
    !nonnegativeInteger(value.queuedProjects) ||
    !nonnegativeInteger(value.activeProjects) ||
    !["instance", "cluster"].includes(String(value.scope)) ||
    !timestamp(value.calculatedAt)
  )
    return null;
  if (
    value.jobsAheadEstimate !== undefined &&
    !nonnegativeInteger(value.jobsAheadEstimate)
  )
    return null;
  let estimate: PublicationQueue["estimate"] = null;
  if (value.estimate !== null) {
    if (
      !isRecord(value.estimate) ||
      !exactKeys(value.estimate, [
        "estimatedStartAt",
        "estimatedStartRange",
        "confidence",
        "sampleCount",
        "estimatorVersion",
        "scope",
        "calculatedAt",
      ])
    )
      return null;
    const range = value.estimate.estimatedStartRange;
    if (
      !isRecord(range) ||
      !exactKeys(range, ["earliest", "latest"]) ||
      !timestamp(range.earliest) ||
      !timestamp(range.latest) ||
      !timestamp(value.estimate.estimatedStartAt) ||
      !["low", "medium", "high"].includes(String(value.estimate.confidence)) ||
      !nonnegativeInteger(value.estimate.sampleCount) ||
      typeof value.estimate.estimatorVersion !== "string" ||
      !["instance", "cluster"].includes(String(value.estimate.scope)) ||
      !timestamp(value.estimate.calculatedAt)
    )
      return null;
    estimate = {
      estimatedStartAt: value.estimate.estimatedStartAt,
      estimatedStartRange: { earliest: range.earliest, latest: range.latest },
      confidence: value.estimate.confidence as "low" | "medium" | "high",
      sampleCount: value.estimate.sampleCount,
      estimatorVersion: value.estimate.estimatorVersion,
      scope: value.estimate.scope as "instance" | "cluster",
      calculatedAt: value.estimate.calculatedAt,
    };
  }
  return {
    ...(typeof value.jobsAheadEstimate === "number"
      ? { jobsAheadEstimate: value.jobsAheadEstimate }
      : {}),
    queuedProjects: value.queuedProjects,
    activeProjects: value.activeProjects,
    estimate,
    scope: value.scope as "instance" | "cluster",
    calculatedAt: value.calculatedAt,
  };
}

function parseRun(value: unknown): PublicationRun | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["stage", "elapsedSeconds", "progress"]) ||
    typeof value.stage !== "string" ||
    !nonnegativeInteger(value.elapsedSeconds) ||
    !isRecord(value.progress) ||
    !exactKeys(value.progress, ["completedStages", "totalStages"]) ||
    !nonnegativeInteger(value.progress.completedStages) ||
    !nonnegativeInteger(value.progress.totalStages) ||
    value.progress.totalStages < 1
  )
    return null;
  return {
    stage: value.stage,
    elapsedSeconds: value.elapsedSeconds,
    progress: {
      completedStages: value.progress.completedStages,
      totalStages: value.progress.totalStages,
    },
  };
}

export function parsePublicationProgress(
  value: unknown,
): PublicationProgress | null {
  const required = [
    "schemaVersion",
    "view",
    "projectId",
    "state",
    "displayingPreviousVersion",
    "updatedAt",
  ];
  const optional = ["sourceCommitShort", "queue", "run", "failure", "author"];
  if (!isRecord(value) || !exactKeys(value, required, optional)) return null;
  const states: PublicationState[] = [
    "awaiting_event",
    "validating",
    "queued",
    "running",
    "activating",
    "published",
    "failed",
    "superseded",
    "reconciliation_required",
  ];
  if (
    value.schemaVersion !== "rin-publication-progress/v1" ||
    !["public", "author"].includes(String(value.view)) ||
    typeof value.projectId !== "string" ||
    !/^(article|book|tag-wiki|pdf):[1-9][0-9]*$/.test(value.projectId) ||
    !states.includes(value.state as PublicationState) ||
    typeof value.displayingPreviousVersion !== "boolean" ||
    !timestamp(value.updatedAt) ||
    (value.sourceCommitShort !== undefined &&
      (typeof value.sourceCommitShort !== "string" ||
        !/^[a-f0-9]{7,12}$/.test(value.sourceCommitShort)))
  )
    return null;
  let author: PublicationBase["author"];
  if (value.author !== undefined) {
    if (
      value.view !== "author" ||
      !isRecord(value.author) ||
      !exactKeys(
        value.author,
        ["diagnostics"],
        ["sourceCommit", "diagnosticsPath"],
      ) ||
      !Array.isArray(value.author.diagnostics)
    )
      return null;
    const diagnostics = value.author.diagnostics.map(parseDiagnostic);
    if (
      diagnostics.some((item) => item === null) ||
      (value.author.sourceCommit !== undefined &&
        (typeof value.author.sourceCommit !== "string" ||
          !/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(value.author.sourceCommit))) ||
      (value.author.diagnosticsPath !== undefined &&
        typeof value.author.diagnosticsPath !== "string")
    )
      return null;
    author = {
      diagnostics: diagnostics.filter(
        (item): item is PublicationDiagnostic => item !== null,
      ),
      ...(typeof value.author.sourceCommit === "string"
        ? { sourceCommit: value.author.sourceCommit }
        : {}),
      ...(typeof value.author.diagnosticsPath === "string"
        ? { diagnosticsPath: value.author.diagnosticsPath }
        : {}),
    };
  }
  const base: PublicationBase = {
    schemaVersion: "rin-publication-progress/v1",
    view: value.view as "public" | "author",
    projectId: value.projectId,
    displayingPreviousVersion: value.displayingPreviousVersion,
    updatedAt: value.updatedAt,
    ...(typeof value.sourceCommitShort === "string"
      ? { sourceCommitShort: value.sourceCommitShort }
      : {}),
    ...(author ? { author } : {}),
  };
  if (value.state === "queued") {
    const queue = parseQueue(value.queue);
    return queue ? { ...base, state: "queued", queue } : null;
  }
  if (value.state === "running") {
    const run = parseRun(value.run);
    return run ? { ...base, state: "running", run } : null;
  }
  if (value.state === "failed") {
    if (
      !isRecord(value.failure) ||
      !exactKeys(value.failure, ["code", "message"]) ||
      typeof value.failure.code !== "string" ||
      typeof value.failure.message !== "string"
    )
      return null;
    return {
      ...base,
      state: "failed",
      failure: { code: value.failure.code, message: value.failure.message },
    };
  }
  return {
    ...base,
    state: value.state as Exclude<
      PublicationState,
      "queued" | "running" | "failed"
    >,
  };
}

export async function fetchPublicationProgress(
  contentRef: string,
  signal?: AbortSignal,
): Promise<PublicationProgress | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  try {
    const accessToken = await getAuthAccessToken();
    Object.assign(headers, authHeaders(accessToken));
  } catch {
    // An invalid optional session is treated as an anonymous public read.
  }
  const response = await fetch(
    `${publicEnv.publicBasePath || ""}/api/content/${encodeURIComponent(contentRef)}/publication-progress`,
    { method: "GET", headers, signal },
  );
  if (response.status === 204) return null;
  if (!response.ok)
    throw new Error(`publication progress request failed (${response.status})`);
  const payload: unknown = await response.json();
  const parsed = parsePublicationProgress(payload);
  if (!parsed) throw new Error("publication progress response is invalid");
  return parsed;
}

export function publicationNeedsPolling(progress: PublicationProgress | null) {
  return (
    progress !== null &&
    [
      "awaiting_event",
      "validating",
      "queued",
      "running",
      "activating",
    ].includes(progress.state)
  );
}

type TimerHandle = ReturnType<typeof setTimeout>;
export type PublicationScheduler = {
  set(callback: () => void, delay: number): TimerHandle;
  clear(handle: TimerHandle): void;
};
export type VisibilitySource = {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export class PublicationProgressPoller {
  private generation = 0;
  private timer: TimerHandle | null = null;
  private abort: AbortController | null = null;
  private running = false;
  private readonly visibilityListener = () => this.onVisibilityChange();

  constructor(
    private contentRef: string,
    private readonly onProgress: (progress: PublicationProgress | null) => void,
    private readonly onTransientError: (error: Error) => void = () => undefined,
    private readonly fetcher = fetchPublicationProgress,
    private readonly scheduler: PublicationScheduler = {
      set: (callback, delay) => setTimeout(callback, delay),
      clear: (handle) => clearTimeout(handle),
    },
    private readonly visibility: VisibilitySource = document,
    private readonly intervalMs = 5000,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.visibility.addEventListener(
      "visibilitychange",
      this.visibilityListener,
    );
    if (!this.visibility.hidden) void this.poll();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
    this.clearTimer();
    this.visibility.removeEventListener(
      "visibilitychange",
      this.visibilityListener,
    );
  }

  replace(contentRef: string) {
    if (contentRef === this.contentRef) return;
    this.contentRef = contentRef;
    this.generation += 1;
    this.abort?.abort();
    this.clearTimer();
    if (this.running && !this.visibility.hidden) void this.poll();
  }

  private async poll() {
    const generation = ++this.generation;
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    try {
      const progress = await this.fetcher(this.contentRef, controller.signal);
      if (
        !this.running ||
        generation !== this.generation ||
        controller.signal.aborted
      )
        return;
      this.onProgress(progress);
      if (!this.visibility.hidden) this.schedule();
    } catch (error: unknown) {
      if (
        !this.running ||
        generation !== this.generation ||
        controller.signal.aborted
      )
        return;
      this.onTransientError(
        error instanceof Error
          ? error
          : new Error("publication progress request failed"),
      );
      if (!this.visibility.hidden) this.schedule();
    }
  }

  private schedule() {
    this.clearTimer();
    this.timer = this.scheduler.set(() => {
      this.timer = null;
      void this.poll();
    }, this.intervalMs);
  }

  private clearTimer() {
    if (this.timer !== null) this.scheduler.clear(this.timer);
    this.timer = null;
  }

  private onVisibilityChange() {
    if (!this.running) return;
    if (this.visibility.hidden) {
      this.abort?.abort();
      this.clearTimer();
      return;
    }
    void this.poll();
  }
}
