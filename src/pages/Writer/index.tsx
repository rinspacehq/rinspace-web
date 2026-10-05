import { Icon, AnimateButton, useToast } from "components/ui";
import { publicEnv } from "@/app/config/env";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Button, Form, Spinner } from "@/components/ui/compat";
import { Helmet } from "react-helmet-async";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import ImageCropDialog from "@/components/ImageCropDialog";
import LoadingState from "@/components/LoadingState";
import { MathInline } from "@/components/MathText";
import SiteTopbar from "@/components/SiteTopbarShell";
import PublishCreateDialog from "@/features/publish/PublishCreateDialog";
import { typstCreationEnabled } from "@/features/publish/typstFeature";
import TagPicker, {
  joinTagValues,
  splitTagValues,
} from "@/components/TagPicker";
import { formatDate } from "@/i18n/format";
import { i18n } from "@/i18n";
import { localizedErrorMessage } from "@/i18n/errors";
import { resolveLocale } from "@/i18n/resolveLocale";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import {
  createContent,
  isContentModerationSubmission,
  loadContentDetail,
  updateContent,
} from "@/services/domains/article";
import { attachBookChapterLink } from "@/services/domains/book";
import { moveWorkItem } from "@/services/domains/identity";
import { uploadAnswerFile } from "@/services/domains/publication";
import type {
  BookMetadata,
  CreateContentInput,
  PostDetail,
} from "@/services/contracts";
import { type RinspaceUser } from "@/services/phoneAuth";
import { getCurrentUser, uploadCoverFile } from "@/services/profile";
import {
  defaultProject,
  diagnosticsFromPayload,
  fileFromRinArchiveInfo,
  fileFromLatexTemplate,
  initialRinView,
  loadRinSdk,
  replaceRinAssetHtml as replaceSharedRinAssetHtml,
  rinspaceCitationResolver,
  sourceFromRinBundle,
  titleFromRinPayload,
  uploadRinArchiveFromBundle,
  uploadRinAssetsFromBundle,
  type RinArchiveInfo as SharedRinArchiveInfo,
  type RinUploadedAsset as SharedRinUploadedAsset,
} from "@/utils/rinWriter";
import { buildRinReaderPayload } from "@/utils/rinReader";
import { bookWorkspacePath, contentPath } from "@/utils/routes";
import {
  authHeaders as sessionAuthHeaders,
  getAuthAccessToken,
  getAuthDeviceId,
  hasAuthSession,
} from "@/services/phoneAuth";

type RinRenderer = "katex" | "mathjax";
type RinView = "split" | "source" | "preview";
type RinEventName = "change" | "error" | "preview" | "ready" | "save";
type RinWriterMode = "article" | "book";

type RinProjectFile = {
  path: string;
  kind: string;
  body: string;
};

type RinProject = {
  title?: string;
  slug?: string;
  status?: string;
  mode?: RinWriterMode;
  syncKey?: string;
  renderer?: RinRenderer;
  mainFile?: string;
  activePath?: string;
  folders?: string[];
  files?: RinProjectFile[];
  view?: RinView;
  citationResolver?: RinCitationResolverConfig;
};

type RinCitationResolverConfig = {
  kind: "rinspace";
  searchUrl: string;
  resolveUrl: string;
  keySyntax: string[];
  targetTypes: Array<"tag" | "blog" | "book">;
};

type RinArchive = {
  filename: string;
  mime: string;
  data: ArrayBuffer;
  bytes?: number;
};

type RinHtmlFile = {
  filename: string;
  mime: string;
  text: string;
};

type RinAssetFile = {
  path: string;
  filename?: string;
  mime?: string;
  encoding?: string;
  body?: string;
  bytes?: number;
  referenced?: boolean;
  htmlSource?: string;
};

type RinAssetManifest = {
  version?: string;
  files?: RinAssetFile[];
  references?: unknown[];
  missing?: unknown[];
  unused?: unknown[];
  graphicsPaths?: string[];
  graphicsExtensions?: string[];
};

type RinBundle = {
  archive: RinArchive;
  html: string;
  htmlFile: RinHtmlFile;
  standaloneHtml?: string;
  project?: RinProject;
  source?: string;
  texSource?: string;
  tex_source?: string;
  resolvedSource?: string;
  analysisSource?: string;
  abstract?: string;
  diagnostics?: string[];
  assetManifest?: RinAssetManifest;
  assetFiles?: RinAssetFile[];
  assets?: RinAssetFile[];
};

type RinArchiveUpload = SharedRinArchiveInfo;
type RinArchiveInfo = SharedRinArchiveInfo;

type RinUploadedAsset = SharedRinUploadedAsset;

type PendingCoverCrop = {
  imageUrl: string;
  fileName: string;
};

type WriterNotice = {
  key: string;
  values?: Record<string, string | number>;
  timestamp?: number;
  source?: "remote" | "local";
  tone?: "default" | "destructive";
};

type RinAutosaveDraft = {
  version: 1;
  key: string;
  mode: RinWriterMode;
  editSlug: string;
  title: string;
  tags: string;
  coverUrl: string;
  project: RinProject;
  savedAt: number;
};

type RinEditorInstance = {
  ready: Promise<RinEditorInstance>;
  importArchive: (
    file: File | Blob,
    options?: {
      mode?: "merge" | "replace";
      activePath?: string;
      activeLine?: number;
    },
  ) => Promise<unknown>;
  save: () => Promise<RinBundle>;
  exportBundle: () => Promise<RinBundle>;
  getPublishPayload?: () => Promise<RinBundle>;
  getTitle: () => Promise<string>;
  setTitle: (title: string) => Promise<unknown>;
  getActiveFile?: () => Promise<RinProjectFile | null>;
  getFiles?: () => Promise<RinProjectFile[]>;
  getMainFile?: () => Promise<string>;
  setMainFile?: (
    path: string,
    options?: { activate?: boolean },
  ) => Promise<unknown>;
  getFile?: (path: string) => Promise<RinProjectFile | null>;
  setProject?: (project: RinProject) => Promise<unknown>;
  setFile?: (
    path: string,
    body: string,
    options?: { activate?: boolean; main?: boolean; kind?: string },
  ) => Promise<unknown>;
  createFile?: (
    path: string,
    body?: string,
    options?: { activate?: boolean; main?: boolean; kind?: string },
  ) => Promise<unknown>;
  createFolder?: (
    path: string,
    options?: { allowExisting?: boolean },
  ) => Promise<unknown>;
  renameFile?: (
    from: string,
    to: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  deleteFile?: (
    path: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  renameFolder?: (
    from: string,
    to: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  deleteFolder?: (
    path: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  setActiveFile?: (
    path: string,
    options?: { line?: number },
  ) => Promise<unknown>;
  setView: (view: RinView) => Promise<unknown>;
  insertText: (text: string) => Promise<unknown>;
  destroy: () => void;
  on: (
    name: RinEventName,
    handler: (payload: unknown) => void,
  ) => RinEditorInstance;
  off: (
    name: RinEventName,
    handler: (payload: unknown) => void,
  ) => RinEditorInstance;
};

const rinAutosaveDbName = "rinspace-rin-writer-autosave";
const rinAutosaveStoreName = "drafts";
const rinRemoteAutosaveEndpoint = `${publicEnv.publicBasePath || ""}/api/rin-writer/draft`;
const rinRemoteAutosaveSourceKey = "rinspace-rin-writer-autosave-source";

type RemoteRinAutosaveDraft = {
  draft: RinAutosaveDraft;
  revision: number;
  sourceId: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRinProjectFile(value: unknown): value is RinProjectFile {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.kind === "string" &&
    typeof value.body === "string"
  );
}

function isRinProject(value: unknown): value is RinProject {
  if (!isRecord(value)) return false;
  if (value.files !== undefined) {
    if (!Array.isArray(value.files) || !value.files.every(isRinProjectFile)) {
      return false;
    }
  }
  return true;
}

function isRinAutosaveDraft(
  value: unknown,
  key?: string,
): value is RinAutosaveDraft {
  if (!isRecord(value)) return false;
  if (value.version !== 1 || typeof value.key !== "string") return false;
  if (key && value.key !== key) return false;
  return (
    typeof value.mode === "string" &&
    typeof value.editSlug === "string" &&
    typeof value.title === "string" &&
    typeof value.tags === "string" &&
    typeof value.coverUrl === "string" &&
    typeof value.savedAt === "number" &&
    isRinProject(value.project)
  );
}

function parseJsonPayload(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function responseMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (isRecord(payload) && typeof payload.message === "string")
    return payload.message;
  return fallback;
}

function getRemoteAutosaveSourceId() {
  try {
    const existing = window.sessionStorage.getItem(rinRemoteAutosaveSourceKey);
    if (existing) return existing;
    const random = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const sourceId = `writer-${random}`;
    window.sessionStorage.setItem(rinRemoteAutosaveSourceKey, sourceId);
    return sourceId;
  } catch {
    return `writer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function parseRemoteAutosaveDraft(
  value: unknown,
  key: string,
): RemoteRinAutosaveDraft | null {
  if (!isRecord(value) || !isRinAutosaveDraft(value.draft, key)) return null;
  return {
    draft: value.draft,
    revision: typeof value.revision === "number" ? value.revision : 0,
    sourceId: typeof value.sourceId === "string" ? value.sourceId : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

async function readRemoteAutosaveDraft(
  key: string,
): Promise<RemoteRinAutosaveDraft | null> {
  const token = await getAuthAccessToken();
  if (!token && !hasAuthSession()) return null;
  const response = await fetch(
    `${rinRemoteAutosaveEndpoint}?key=${encodeURIComponent(key)}`,
    {
      headers: {
        ...sessionAuthHeaders(token),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  if (response.status === 204 || response.status === 404) return null;
  const payload = parseJsonPayload(await response.text());
  if (!response.ok) {
    throw new Error(responseMessage(payload, "Remote draft read failed."));
  }
  const parsed = parseRemoteAutosaveDraft(payload, key);
  if (!parsed) throw new Error("Unexpected remote draft response.");
  return parsed;
}

async function writeRemoteAutosaveDraft(
  draft: RinAutosaveDraft,
  sourceId: string,
): Promise<RemoteRinAutosaveDraft | null> {
  const token = await getAuthAccessToken();
  if (!token && !hasAuthSession()) return null;
  const response = await fetch(
    `${rinRemoteAutosaveEndpoint}?key=${encodeURIComponent(draft.key)}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(token),
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-device-id": getAuthDeviceId(),
      },
      body: JSON.stringify({ draft, sourceId }),
    },
  );
  const payload = parseJsonPayload(await response.text());
  if (!response.ok) {
    throw new Error(responseMessage(payload, "Remote draft sync failed."));
  }
  const parsed = parseRemoteAutosaveDraft(payload, draft.key);
  if (!parsed) throw new Error("Unexpected remote draft response.");
  return parsed;
}

async function deleteRemoteAutosaveDraft(key: string): Promise<void> {
  const token = await getAuthAccessToken();
  if (!token && !hasAuthSession()) return;
  const response = await fetch(
    `${rinRemoteAutosaveEndpoint}?key=${encodeURIComponent(key)}`,
    {
      method: "DELETE",
      headers: {
        ...sessionAuthHeaders(token),
        Accept: "application/json",
        "x-device-id": getAuthDeviceId(),
      },
    },
  );
  if (response.status === 204 || response.status === 404) return;
  const payload = parseJsonPayload(await response.text());
  if (!response.ok) {
    throw new Error(responseMessage(payload, "Remote draft deletion failed."));
  }
}

function localAutosaveKey(key: string) {
  return `rinspace:rin-writer-autosave:${encodeURIComponent(key)}`;
}

function formatAutosaveTime(locale: "zh-CN" | "en", timestamp: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return "";
  return formatDate(locale, timestamp, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function userAutosaveId(user: RinspaceUser | null) {
  return user?.id || user?.phone || "anonymous";
}

function makeAutosaveKey(
  user: RinspaceUser | null,
  mode: RinWriterMode,
  editSlug: string,
  chapterContext: { bookId: string; chapterKey: string } | null,
  chapterScope: { id: string; title: string } | null,
) {
  const contentRef = chapterScope
    ? `chapter-scope:${editSlug || "new"}:${chapterScope.id || chapterScope.title}`
    : chapterContext
      ? `chapter-blog:${chapterContext.bookId}:${chapterContext.chapterKey}`
      : editSlug || "new";
  return [userAutosaveId(user), mode, contentRef].join(":");
}

function foldersFromFiles(files: RinProjectFile[]) {
  const folders = new Set<string>();
  files.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  });
  return Array.from(folders).sort();
}

function openAutosaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(rinAutosaveDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(rinAutosaveStoreName)) {
        db.createObjectStore(rinAutosaveStoreName, { keyPath: "key" });
      }
    };
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function readAutosaveDraftFromDb(
  key: string,
): Promise<RinAutosaveDraft | null> {
  return openAutosaveDb().then(
    (db) =>
      new Promise<RinAutosaveDraft | null>((resolve, reject) => {
        const transaction = db.transaction(rinAutosaveStoreName, "readonly");
        const store = transaction.objectStore(rinAutosaveStoreName);
        const request = store.get(key) as IDBRequest<
          RinAutosaveDraft | undefined
        >;
        request.onerror = () =>
          reject(request.error || new Error("IndexedDB read failed"));
        request.onsuccess = () => resolve(request.result || null);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(
            transaction.error || new Error("IndexedDB transaction failed"),
          );
        };
      }),
  );
}

function writeAutosaveDraftToDb(draft: RinAutosaveDraft): Promise<void> {
  return openAutosaveDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(rinAutosaveStoreName, "readwrite");
        transaction.objectStore(rinAutosaveStoreName).put(draft);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("IndexedDB write failed"));
        };
      }),
  );
}

function deleteAutosaveDraftFromDb(key: string): Promise<void> {
  return openAutosaveDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(rinAutosaveStoreName, "readwrite");
        transaction.objectStore(rinAutosaveStoreName).delete(key);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("IndexedDB delete failed"));
        };
      }),
  );
}

function readAutosaveDraft(key: string): Promise<RinAutosaveDraft | null> {
  return readAutosaveDraftFromDb(key).catch(() => {
    try {
      const raw = window.localStorage.getItem(localAutosaveKey(key));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isRinAutosaveDraft(parsed, key)) return null;
      return parsed;
    } catch {
      return null;
    }
  });
}

function writeAutosaveDraft(draft: RinAutosaveDraft): Promise<void> {
  return writeAutosaveDraftToDb(draft).catch(() => {
    window.localStorage.setItem(
      localAutosaveKey(draft.key),
      JSON.stringify(draft),
    );
  });
}

function deleteAutosaveDraft(key: string): Promise<void> {
  return deleteAutosaveDraftFromDb(key)
    .catch(() => undefined)
    .then(() => {
      try {
        window.localStorage.removeItem(localAutosaveKey(key));
      } catch {
        // Storage can be unavailable; the server-side save has still succeeded.
      }
    });
}

async function uploadArchiveFromBundle(
  bundle: RinBundle,
): Promise<RinArchiveUpload | null> {
  return uploadRinArchiveFromBundle(
    bundle,
    (file) => uploadAnswerFile("post_attachment", file),
    "rin-source.zip",
  );
}

async function uploadAssetsFromBundle(
  bundle: RinBundle,
): Promise<RinUploadedAsset[]> {
  return uploadRinAssetsFromBundle(bundle, (file) =>
    uploadAnswerFile("post_attachment", file),
  );
}

function replaceRinAssetHtml(html: string, assets: RinUploadedAsset[]) {
  return replaceSharedRinAssetHtml(html, assets);
}

function sourceFromBundle(bundle: RinBundle) {
  return sourceFromRinBundle(bundle);
}

function bodyFromBundle(
  bundle: RinBundle,
  archive: RinArchiveUpload | null,
  assets: RinUploadedAsset[],
  mode: RinWriterMode,
  title: string,
) {
  const html = replaceRinAssetHtml(bundle.html, assets).trim();
  const source = sourceFromBundle(bundle);
  const sections = [
    "[[RIN_WRITER]]",
    html,
    "[[/RIN_WRITER]]",
    "",
    "[[RIN_SOURCE]]",
    source,
    "[[/RIN_SOURCE]]",
  ];
  const reader = mode === "book" ? buildRinReaderPayload(html, title) : null;
  if (reader) {
    sections.push(
      "",
      "[[RIN_READER]]",
      JSON.stringify(reader),
      "[[/RIN_READER]]",
    );
  }
  if (archive) {
    sections.push(
      "",
      "[[RIN_ARCHIVE]]",
      JSON.stringify(archive),
      "[[/RIN_ARCHIVE]]",
    );
  }
  if (assets.length) {
    sections.push(
      "",
      "[[RIN_ASSETS]]",
      JSON.stringify({
        version: "0.1",
        files: assets,
        manifest: bundle.assetManifest || null,
      }),
      "[[/RIN_ASSETS]]",
    );
  }
  return sections.join("\n");
}

function extractMarkedSection(body: string, marker: string) {
  const startMarker = `[[${marker}]]`;
  const endMarker = `[[/${marker}]]`;
  const start = body.indexOf(startMarker);
  if (start < 0) return "";
  const end = body.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return "";
  return body.slice(start + startMarker.length, end).trim();
}

function rinWriterArchive(body: string): RinArchiveInfo | null {
  const raw = extractMarkedSection(body, "RIN_ARCHIVE");
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const archive = value as Record<string, unknown>;
    if (
      typeof archive.url !== "string" ||
      typeof archive.filename !== "string"
    ) {
      return null;
    }
    return {
      url: archive.url,
      filename: archive.filename,
      mime: typeof archive.mime === "string" ? archive.mime : "application/zip",
      bytes: typeof archive.bytes === "number" ? archive.bytes : undefined,
    };
  } catch {
    return null;
  }
}

async function archiveFileFromInfo(archive: RinArchiveInfo): Promise<File> {
  try {
    return await fileFromRinArchiveInfo(archive, "rin-source.tar.gz");
  } catch {
    throw new Error("Unable to read the Rin source archive.");
  }
}

function excerptFromBundle(bundle: RinBundle) {
  const abstract =
    typeof bundle.abstract === "string"
      ? bundle.abstract
      : readLatexEnvironment(sourceFromBundle(bundle), "abstract");
  return abstract.trim().slice(0, 240);
}

function readLatexEnvironment(source: string, name: string) {
  const begin = `\\begin{${name}}`;
  const end = `\\end{${name}}`;
  const start = source.indexOf(begin);
  if (start < 0) return "";
  const endIndex = source.indexOf(end, start + begin.length);
  if (endIndex < 0) return "";
  return source.slice(start + begin.length, endIndex).trim();
}

function defaultBookProject(
  title: string,
  bibliographyComment: string,
): RinProject {
  const safeTitle = title.trim();
  return {
    title: safeTitle,
    slug:
      safeTitle
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "rinspace-book",
    status: "draft",
    mode: "book",
    renderer: "katex",
    mainFile: "main.tex",
    activePath: "main.tex",
    folders: ["chapters", "figures"],
    files: [
      {
        path: "main.tex",
        kind: "tex",
        body: [
          "\\documentclass[11pt,openany]{book}",
          "\\usepackage{amsmath,amssymb,amsthm}",
          "\\usepackage{graphicx}",
          "\\usepackage{float}",
          "\\usepackage{hyperref}",
          "\\graphicspath{{figures/}}",
          "",
          `\\title{${safeTitle}}`,
          "\\author{}",
          "\\date{}",
          "",
          "\\newtheorem{theorem}{Theorem}[section]",
          "\\newtheorem{lemma}[theorem]{Lemma}",
          "\\newtheorem{proposition}[theorem]{Proposition}",
          "\\newtheorem{corollary}[theorem]{Corollary}",
          "\\theoremstyle{definition}",
          "\\newtheorem{definition}[theorem]{Definition}",
          "\\newtheorem{example}[theorem]{Example}",
          "\\theoremstyle{remark}",
          "\\newtheorem{remark}[theorem]{Remark}",
          "",
          "\\begin{document}",
          "\\frontmatter",
          "\\maketitle",
          "\\tableofcontents",
          "",
          "\\mainmatter",
          "",
          "\\input{chapters/chapter-01}",
          "",
          "\\backmatter",
          "",
          "\\bibliographystyle{plain}",
          "\\bibliography{refs}",
          "",
          "\\end{document}",
        ].join("\n"),
      },
      {
        path: "chapters/chapter-01.tex",
        kind: "tex",
        body: [
          "\\chapter{Introduction}",
          "",
          "Start writing the book here.",
          "",
          "\\section{First section}",
          "",
          "Add the first section content here.",
        ].join("\n"),
      },
      {
        path: "refs.bib",
        kind: "bib",
        body: bibliographyComment,
      },
    ],
    view: "split",
  };
}

export default function WriterPage() {
  const { t, i18n: translationI18n } = useFeatureTranslation("creation");
  const locale = resolveLocale(
    translationI18n.resolvedLanguage || translationI18n.language,
    [],
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeParams = useParams();
  const routeBookPostId = routeParams.postId?.trim() || "";
  const routeSectionId = routeParams.sectionId?.trim() || "";
  const editSlug = searchParams.get("edit")?.trim() || routeBookPostId;
  const queryMode =
    searchParams.get("mode") === "book" || routeBookPostId ? "book" : "blog";
  const worksFolderId = searchParams.get("worksFolderId")?.trim() || "";
  const worksVisibility =
    searchParams.get("worksVisibility") === "private" ? "private" : "published";
  const chapterScope = useMemo(() => {
    if (queryMode !== "book") return null;
    const isChapterRoute = Boolean(routeBookPostId && routeSectionId);
    if (!isChapterRoute && searchParams.get("scope") !== "chapter") return null;
    const chapterId =
      routeSectionId || searchParams.get("chapter")?.trim() || "";
    const chapterTitle = searchParams.get("chapterTitle")?.trim() || "";
    const path = searchParams.get("path")?.trim() || "";
    const line = searchParams.get("line")?.trim() || "";
    if (!chapterId && !chapterTitle) return null;
    return {
      id: chapterId,
      title: chapterTitle || chapterId || t("writer.fallbacks.currentChapter"),
      path,
      line,
    };
  }, [queryMode, routeBookPostId, routeSectionId, searchParams, t]);
  const writerContentType = queryMode;
  const isBookWriter = writerContentType === "book";
  const writerMode: RinWriterMode = isBookWriter ? "book" : "article";
  const chapterContext = useMemo(() => {
    const bookId = searchParams.get("bookId")?.trim() || "";
    const chapterKey = searchParams.get("chapterKey")?.trim() || "";
    if (!bookId || !chapterKey || editSlug) return null;
    return {
      bookId,
      bookTitle:
        searchParams.get("bookTitle")?.trim() || t("writer.fallbacks.book"),
      chapterKey,
      chapterTitle:
        searchParams.get("chapterTitle")?.trim() ||
        t("writer.fallbacks.chapter"),
      chapterPage: searchParams.get("chapterPage")?.trim() || "",
    };
  }, [editSlug, searchParams, t]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<RinEditorInstance | null>(null);
  const titleSyncSourceRef = useRef<"host" | "rin" | "">("");
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveRunningRef = useRef(false);
  const autosavePendingRef = useRef(false);
  const autosaveLastRunRef = useRef(0);
  const autosaveKeyRef = useRef("");
  const remoteAutosaveSourceIdRef = useRef("");
  const remoteAutosaveRevisionRef = useRef(0);
  const lastLocalChangeAtRef = useRef(0);
  const lastLocalAutosaveAtRef = useRef(0);
  const applyingRemoteDraftRef = useRef(false);
  const applyingInitialTemplateRef = useRef(false);
  const initialTemplateImportKeyRef = useRef("");
  const autosaveMetaRef = useRef({
    title: "",
    tags: "",
    coverUrl: "",
    editSlug: "",
    mode: "article" as RinWriterMode,
  });
  const [user, setUser] = useState<RinspaceUser | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editPost, setEditPost] = useState<PostDetail | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [importedEditSlug, setImportedEditSlug] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [pendingCoverCrop, setPendingCoverCrop] =
    useState<PendingCoverCrop | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const initialView = useMemo(() => initialRinView(), []);
  const [status, setStatus] = useState<WriterNotice | null>(null);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [savingMode, setSavingMode] = useState<"draft" | "published" | "">("");
  const [importingArchive, setImportingArchive] = useState(false);
  const locksBookProfile = isBookWriter && Boolean(editSlug);
  const autosaveKey = useMemo(
    () =>
      makeAutosaveKey(user, writerMode, editSlug, chapterContext, chapterScope),
    [chapterContext, chapterScope, editSlug, user, writerMode],
  );
  const [autosaveDraft, setAutosaveDraft] = useState<RinAutosaveDraft | null>(
    null,
  );
  const [autosaveChecked, setAutosaveChecked] = useState(false);
  const [autosaveNotice, setAutosaveNotice] = useState<WriterNotice | null>(
    null,
  );
  const restoredAutosave = Boolean(autosaveDraft);

  const canSave = Boolean(
    user &&
    editorReady &&
    !loadingEdit &&
    (!editSlug || importedEditSlug === editSlug) &&
    title.trim().length >= 4 &&
    !importingArchive &&
    !savingMode,
  );
  const rinBaseUrl = useMemo(() => `${window.location.origin}/rin`, []);
  const writerTitleLabel = t(
    `writer.labels.${isBookWriter ? "bookTitle" : "articleTitle"}`,
  );
  const writerPublishLabel = t(
    `writer.actions.${isBookWriter ? "publishBook" : "publish"}`,
  );
  const writerCoverCropTitle = t(
    `writer.cover.${isBookWriter ? "cropBook" : "cropArticle"}`,
  );
  const writerShellTitle = t(
    `writer.documentTitle.${isBookWriter ? "book" : "article"}`,
  );
  const bookProfileTitle =
    editPost?.book?.bookTitle ||
    editPost?.title ||
    title ||
    t("writer.fallbacks.bookProject");
  const bookProfileEditPath = editPost
    ? `/books/${encodeURIComponent(editPost.slug || editPost.id)}/edit`
    : "";
  const bookWorkspaceHref = editPost ? bookWorkspacePath(editPost.id) : "";
  const workspaceActivePath = chapterScope?.path || "";
  const workspaceActiveLine = Number(chapterScope?.line || 0) || undefined;
  const isWorkspaceSectionEditor = isBookWriter && Boolean(chapterScope);
  const rinProjectSyncKey = [
    "rinspace",
    writerMode,
    editSlug || routeBookPostId || "new",
  ].join(":");
  const noticeText = (notice: WriterNotice | null) => {
    if (!notice) return "";
    return t(notice.key, {
      ...notice.values,
      ...(notice.timestamp
        ? { time: formatAutosaveTime(locale, notice.timestamp) }
        : {}),
      ...(notice.source
        ? { source: t(`writer.autosave.sources.${notice.source}`) }
        : {}),
    });
  };
  const statusText = noticeText(status);
  const autosaveNoticeText = noticeText(autosaveNotice);
  const topbarStatus = isWorkspaceSectionEditor ? "" : statusText;
  const feedbackAutosaveNotice = isWorkspaceSectionEditor
    ? ""
    : autosaveNoticeText;

  // Transient notices render as toasts (bottom-left) so they never shift the
  // writing surface layout; the diagnostics list keeps its inline panel.
  const toast = useToast();
  useEffect(() => {
    if (topbarStatus) toast.notify({ title: topbarStatus });
  }, [topbarStatus, toast]);
  useEffect(() => {
    if (feedbackAutosaveNotice)
      toast.notify({
        title: feedbackAutosaveNotice,
        tone: autosaveNotice?.tone || "default",
      });
  }, [autosaveNotice?.tone, feedbackAutosaveNotice, toast]);
  useEffect(() => {
    if (error) toast.notify({ title: error, tone: "destructive" });
  }, [error, toast]);

  useEffect(() => {
    let cancelled = false;
    setUserChecked(false);
    void getCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setUserChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    remoteAutosaveSourceIdRef.current = getRemoteAutosaveSourceId();
  }, []);

  useEffect(() => {
    autosaveKeyRef.current = autosaveKey;
  }, [autosaveKey]);

  useEffect(() => {
    remoteAutosaveRevisionRef.current = 0;
    lastLocalChangeAtRef.current = 0;
    lastLocalAutosaveAtRef.current = 0;
  }, [autosaveKey]);

  useEffect(() => {
    autosaveMetaRef.current = {
      title,
      tags,
      coverUrl,
      editSlug,
      mode: writerMode,
    };
  }, [coverUrl, editSlug, tags, title, writerMode]);

  useEffect(() => {
    let cancelled = false;
    setAutosaveChecked(false);
    setAutosaveDraft(null);
    setAutosaveNotice(null);
    if (!userChecked) return undefined;
    void (async () => {
      const localDraft = await readAutosaveDraft(autosaveKey);
      let remoteDraft: RemoteRinAutosaveDraft | null = null;
      try {
        remoteDraft = user ? await readRemoteAutosaveDraft(autosaveKey) : null;
      } catch (remoteError) {
        if (!cancelled && !localDraft) {
          console.error("Failed to read the remote Rin draft", remoteError);
          setAutosaveNotice({
            key: "writer.autosave.remoteReadFailed",
            tone: "destructive",
          });
        }
      }
      if (remoteDraft) {
        remoteAutosaveRevisionRef.current = Math.max(
          remoteAutosaveRevisionRef.current,
          remoteDraft.revision,
        );
      }
      const draft =
        remoteDraft?.draft &&
        (!localDraft || remoteDraft.draft.savedAt > localDraft.savedAt)
          ? remoteDraft.draft
          : localDraft;
      const draftSource: "remote" | "local" =
        draft && remoteDraft?.draft === draft ? "remote" : "local";
      if (draft && remoteDraft?.draft === draft) {
        await writeAutosaveDraft(draft).catch(() => undefined);
      }
      return { draft, draftSource };
    })()
      .then(({ draft, draftSource }) => {
        if (cancelled) return;
        setAutosaveDraft(draft);
        if (draft) {
          lastLocalAutosaveAtRef.current = draft.savedAt;
        }
        if (draft) {
          setAutosaveNotice({
            key: "writer.autosave.restored",
            timestamp: draft.savedAt,
            source: draftSource,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setAutosaveChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [autosaveKey, user, userChecked]);

  useEffect(() => {
    if (!autosaveDraft || loadingEdit || locksBookProfile) return;
    setTitle((current) => autosaveDraft.title || current);
    setTags(autosaveDraft.tags || "");
    setCoverUrl(autosaveDraft.coverUrl || "");
  }, [autosaveDraft, loadingEdit, locksBookProfile]);

  useEffect(() => {
    let cancelled = false;
    setEditPost(null);
    setImportedEditSlug("");
    setCoverUrl("");
    if (!editSlug) {
      setTags("");
      setLoadingEdit(false);
      return undefined;
    }
    setLoadingEdit(true);
    setError("");
    setStatus({
      key: `writer.loading.${isBookWriter ? "bookProject" : "articleSource"}`,
    });
    void loadContentDetail(editSlug)
      .then((post) => {
        if (cancelled) return;
        if (post.type !== "blog" && post.type !== "book") {
          throw new Error("Unsupported Rin content type.");
        }
        if (isBookWriter && post.type !== "book") {
          throw new Error("Book mode cannot edit blog content.");
        }
        if (!isBookWriter && post.type !== "blog") {
          throw new Error("Article mode cannot edit book content.");
        }
        const archive = rinWriterArchive(post.body);
        if (
          !archive &&
          !(
            isBookWriter &&
            post.type === "book" &&
            post.book?.kind === "original"
          )
        ) {
          throw new Error("No TeX source archive is available.");
        }
        setEditPost(post);
        setTitle(post.title);
        setTags(post.tags.join(", "));
        setCoverUrl(post.coverUrl || "");
        if (!archive) {
          setImportedEditSlug(editSlug);
          setStatus({ key: "writer.status.bookProfileLoaded" });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setEditPost(null);
          setError(
            localizedErrorMessage(loadError, "creation.rinEditLoadFailed"),
          );
          setStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editSlug, isBookWriter]);

  useEffect(() => {
    return () => {
      if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    };
  }, [pendingCoverCrop]);

  const runAutosave = useCallback(async () => {
    const editor = editorRef.current;
    const key = autosaveKeyRef.current;
    const meta = autosaveMetaRef.current;
    if (!editor || !key || !editor.getFiles) return;
    if (autosaveRunningRef.current) {
      autosavePendingRef.current = true;
      return;
    }
    autosaveRunningRef.current = true;
    autosavePendingRef.current = false;
    autosaveLastRunRef.current = Date.now();
    try {
      const files = await editor.getFiles();
      if (!files.length) return;
      const [mainFile, activeFile] = await Promise.all([
        editor.getMainFile?.().catch(() => ""),
        editor.getActiveFile?.().catch(() => null),
      ]);
      const activePath =
        activeFile?.path || files[0]?.path || mainFile || "main.tex";
      const project: RinProject = {
        title: meta.title,
        status: "draft",
        mode: meta.mode,
        renderer: "katex",
        mainFile: mainFile || files[0]?.path || "main.tex",
        activePath,
        folders: foldersFromFiles(files),
        files,
        view: initialView,
      };
      const draft: RinAutosaveDraft = {
        version: 1,
        key,
        mode: meta.mode,
        editSlug: meta.editSlug,
        title: meta.title,
        tags: meta.tags,
        coverUrl: meta.coverUrl,
        project,
        savedAt: Date.now(),
      };
      await writeAutosaveDraft(draft);
      lastLocalAutosaveAtRef.current = draft.savedAt;
      try {
        const remoteDraft = await writeRemoteAutosaveDraft(
          draft,
          remoteAutosaveSourceIdRef.current || getRemoteAutosaveSourceId(),
        );
        if (remoteDraft) {
          remoteAutosaveRevisionRef.current = Math.max(
            remoteAutosaveRevisionRef.current,
            remoteDraft.revision,
          );
          setAutosaveNotice({
            key: "writer.autosave.savedSynced",
            timestamp: draft.savedAt,
          });
        } else {
          setAutosaveNotice({
            key: "writer.autosave.savedLocal",
            timestamp: draft.savedAt,
          });
        }
      } catch (remoteError) {
        console.error("Failed to sync the remote Rin draft", remoteError);
        setAutosaveNotice({
          key: "writer.autosave.cloudSyncFailed",
          tone: "destructive",
        });
      }
    } catch (autosaveError) {
      console.error("Failed to save the local Rin draft", autosaveError);
      setAutosaveNotice({
        key: "writer.autosave.localSaveFailed",
        tone: "destructive",
      });
    } finally {
      autosaveRunningRef.current = false;
      if (autosavePendingRef.current) {
        autosavePendingRef.current = false;
        window.setTimeout(() => {
          void runAutosave();
        }, 500);
      }
    }
  }, [initialView]);

  const scheduleAutosave = useCallback(
    (delay = 8000, options: { force?: boolean } = {}) => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      const elapsed = Date.now() - autosaveLastRunRef.current;
      const minDelay = !options.force && elapsed < 8000 ? 8000 - elapsed : 0;
      autosaveTimerRef.current = window.setTimeout(
        () => {
          autosaveTimerRef.current = null;
          void runAutosave();
        },
        Math.max(delay, minDelay),
      );
    },
    [runAutosave],
  );

  const applyRemoteAutosaveDraft = useCallback(
    async (remoteDraft: RemoteRinAutosaveDraft) => {
      const editor = editorRef.current;
      if (!editor?.setProject) return;
      const draft = remoteDraft.draft;
      if (draft.key !== autosaveKeyRef.current) return;
      if (remoteDraft.revision <= remoteAutosaveRevisionRef.current) return;
      remoteAutosaveRevisionRef.current = remoteDraft.revision;
      if (
        remoteDraft.sourceId &&
        remoteDraft.sourceId === remoteAutosaveSourceIdRef.current
      ) {
        return;
      }
      if (lastLocalChangeAtRef.current > lastLocalAutosaveAtRef.current) {
        setAutosaveNotice({ key: "writer.autosave.remoteConflict" });
        return;
      }
      applyingRemoteDraftRef.current = true;
      try {
        const nextProject: RinProject = {
          ...draft.project,
          syncKey: rinProjectSyncKey,
        };
        await editor.setProject(nextProject);
        await writeAutosaveDraft(draft).catch(() => undefined);
        lastLocalAutosaveAtRef.current = draft.savedAt;
        lastLocalChangeAtRef.current = 0;
        setAutosaveDraft(draft);
        if (!locksBookProfile) {
          setTitle((current) => draft.title || current);
          setTags(draft.tags || "");
          setCoverUrl(draft.coverUrl || "");
        }
        setAutosaveNotice({
          key: "writer.autosave.remoteSynced",
          timestamp: draft.savedAt,
        });
      } finally {
        window.setTimeout(() => {
          applyingRemoteDraftRef.current = false;
        }, 0);
      }
    },
    [locksBookProfile, rinProjectSyncKey],
  );

  const pollRemoteAutosaveDraft = useCallback(async () => {
    const key = autosaveKeyRef.current;
    if (!key || !user || applyingRemoteDraftRef.current) return;
    const remoteDraft = await readRemoteAutosaveDraft(key);
    if (!remoteDraft) return;
    await applyRemoteAutosaveDraft(remoteDraft);
  }, [applyRemoteAutosaveDraft, user]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editorReady) return undefined;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        scheduleAutosave(0, { force: true });
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosaveTimerRef.current && !autosaveRunningRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [editorReady, scheduleAutosave]);

  useEffect(() => {
    if (!editorReady || !user) return undefined;
    let cancelled = false;
    const run = () => {
      void pollRemoteAutosaveDraft().catch((pollError) => {
        if (!cancelled) {
          console.error("Failed to poll the remote Rin draft", pollError);
          setAutosaveNotice({
            key: "writer.autosave.pollFailed",
            tone: "destructive",
          });
        }
      });
    };
    const timer = window.setInterval(run, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [editorReady, pollRemoteAutosaveDraft, user]);

  useEffect(() => {
    let cancelled = false;
    if (
      !editorReady ||
      !editSlug ||
      !editPost ||
      importedEditSlug === editSlug
    ) {
      return undefined;
    }
    if (restoredAutosave) {
      setImportedEditSlug(editSlug);
      return undefined;
    }
    const archive = rinWriterArchive(editPost.body);
    if (!archive) return undefined;

    setError("");
    setStatus({ key: "writer.loading.sourceArchive" });
    void archiveFileFromInfo(archive)
      .then(async (file) => {
        const editor = editorRef.current;
        await editor?.importArchive(file, {
          mode: "replace",
          activePath: workspaceActivePath || undefined,
          activeLine: workspaceActiveLine,
        });
        if (workspaceActivePath && editor?.setActiveFile) {
          await editor.setActiveFile(workspaceActivePath, {
            line: workspaceActiveLine,
          });
        }
      })
      .then(() => {
        if (!cancelled) {
          setImportedEditSlug(editSlug);
          setStatus({
            key: workspaceActivePath
              ? "writer.status.archiveEditing"
              : "writer.status.archiveReady",
            values: {
              filename: archive.filename,
              ...(workspaceActivePath ? { path: workspaceActivePath } : {}),
            },
          });
        }
      })
      .catch((importError) => {
        if (!cancelled) {
          setError(
            localizedErrorMessage(importError, "creation.rinArchiveLoadFailed"),
          );
          setStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    editPost,
    editSlug,
    editorReady,
    importedEditSlug,
    restoredAutosave,
    workspaceActiveLine,
    workspaceActivePath,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (
      !editorReady ||
      editSlug ||
      loadingEdit ||
      locksBookProfile ||
      restoredAutosave ||
      autosaveDraft
    ) {
      return undefined;
    }
    const editor = editorRef.current;
    if (!editor) return undefined;
    const templateKind = isBookWriter ? "latex-book" : "latex-article";
    const importKey = `${rinProjectSyncKey}:${templateKind}`;
    if (initialTemplateImportKeyRef.current === importKey) return undefined;
    initialTemplateImportKeyRef.current = importKey;
    applyingInitialTemplateRef.current = true;
    setImportingArchive(true);
    setError("");
    setStatus({
      key: `writer.loading.${isBookWriter ? "bookTemplate" : "articleTemplate"}`,
    });
    void fileFromLatexTemplate(templateKind)
      .then(async (file) => {
        if (cancelled) return;
        await editor.importArchive(file, {
          mode: "replace",
          activePath: "main.tex",
        });
        if (cancelled) return;
        await editor.setTitle(title.trim());
      })
      .then(() => {
        if (cancelled) return;
        setStatus({
          key: `writer.status.${isBookWriter ? "bookTemplateLoaded" : "articleTemplateLoaded"}`,
        });
        scheduleAutosave(1500);
      })
      .catch((templateError) => {
        if (cancelled) return;
        initialTemplateImportKeyRef.current = "";
        setError(
          localizedErrorMessage(
            templateError,
            "creation.rinTemplateLoadFailed",
          ),
        );
        setStatus(null);
      })
      .finally(() => {
        applyingInitialTemplateRef.current = false;
        if (!cancelled) setImportingArchive(false);
      });
    return () => {
      cancelled = true;
      applyingInitialTemplateRef.current = false;
    };
  }, [
    autosaveDraft,
    editSlug,
    editorReady,
    isBookWriter,
    loadingEdit,
    locksBookProfile,
    restoredAutosave,
    rinProjectSyncKey,
    scheduleAutosave,
    title,
  ]);

  useEffect(() => {
    if (!editorReady) return;
    scheduleAutosave(8000);
  }, [coverUrl, editorReady, scheduleAutosave, tags, title]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host || !autosaveChecked) return undefined;

    setEditorReady(false);
    setError("");
    void loadRinSdk()
      .then((sdk) => {
        if (cancelled) return null;
        const editor = sdk.create({
          target: host,
          baseUrl: rinBaseUrl,
          chrome: true,
          view: initialView,
          height: "100%",
          parentOrigin: window.location.origin,
          persist: false,
          timeout: 45000,
          requestTimeouts: {
            save: 180000,
            exportBundle: 180000,
            getPublishPayload: 180000,
            exportArxivBundle: 180000,
            getHtml: 120000,
            downloadHtml: 120000,
          },
          mode: writerMode,
          title: autosaveDraft?.title || title,
          citationResolver: rinspaceCitationResolver(),
          project: {
            ...(autosaveDraft?.project ||
              (isBookWriter
                ? defaultBookProject(
                    title,
                    i18n.t("creation:writer.template.bibliographyComment"),
                  )
                : defaultProject(title))),
            syncKey: rinProjectSyncKey,
          },
          onError: (payload) => {
            console.error("Rin editor error", payload);
            setError(i18n.t("errors:creation.rinEditorFailed"));
          },
        });
        editorRef.current = editor;
        editor.on("change", (payload) => {
          if (applyingRemoteDraftRef.current) return;
          if (applyingInitialTemplateRef.current) return;
          lastLocalChangeAtRef.current = Date.now();
          scheduleAutosave();
          if (locksBookProfile) return;
          const nextTitle = titleFromRinPayload(payload);
          if (!nextTitle || titleSyncSourceRef.current === "host") return;
          titleSyncSourceRef.current = "rin";
          setTitle((current) => (current === nextTitle ? current : nextTitle));
          window.setTimeout(() => {
            if (titleSyncSourceRef.current === "rin") {
              titleSyncSourceRef.current = "";
            }
          }, 0);
        });
        editor.on("preview", (payload) => {
          setDiagnostics(diagnosticsFromPayload(payload));
          scheduleAutosave(10000);
        });
        void editor.ready
          .then(() => {
            if (!cancelled) {
              setEditorReady(true);
              void editor.getTitle().then((nextTitle) => {
                if (!cancelled && nextTitle.trim()) {
                  setTitle((current) =>
                    current === nextTitle.trim() ? current : nextTitle.trim(),
                  );
                }
              });
            }
          })
          .catch((readyError) => {
            if (!cancelled) {
              setError(
                localizedErrorMessage(readyError, "creation.rinEditorFailed"),
              );
            }
          });
        return editor;
      })
      .catch((sdkError) => {
        if (!cancelled) {
          setError(localizedErrorMessage(sdkError, "creation.rinEditorFailed"));
        }
      });

    return () => {
      cancelled = true;
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [
    autosaveChecked,
    autosaveDraft,
    initialView,
    isBookWriter,
    locksBookProfile,
    rinBaseUrl,
    rinProjectSyncKey,
    scheduleAutosave,
    writerMode,
  ]);

  useEffect(() => {
    if (
      locksBookProfile ||
      !editorReady ||
      titleSyncSourceRef.current === "rin"
    )
      return;
    const editor = editorRef.current;
    if (!editor) return;
    titleSyncSourceRef.current = "host";
    void editor
      .setTitle(title)
      .catch((titleError) => {
        setError(
          localizedErrorMessage(titleError, "creation.rinTitleSyncFailed"),
        );
      })
      .finally(() => {
        if (titleSyncSourceRef.current === "host") {
          titleSyncSourceRef.current = "";
        }
      });
  }, [editorReady, locksBookProfile, title]);

  const saveArticle = async (postStatus: "draft" | "published") => {
    if (!editorRef.current) return;
    if (!user) {
      setError(
        t(`writer.validation.${isBookWriter ? "signInBook" : "signInArticle"}`),
      );
      return;
    }

    setSavingMode(postStatus);
    setError("");
    setStatus(null);
    try {
      const bundle = await editorRef.current.save();
      const [archive, assets] = await Promise.all([
        uploadArchiveFromBundle(bundle),
        uploadAssetsFromBundle(bundle),
      ]);
      const tagList = splitTagValues(tags).slice(0, 6);
      const existingBook = editPost?.book;
      const savedTitle = locksBookProfile
        ? editPost?.book?.bookTitle || editPost?.title || title.trim()
        : title.trim();
      const savedTags = locksBookProfile ? editPost?.tags || [] : tagList;
      const savedCoverUrl = locksBookProfile
        ? editPost?.coverUrl || ""
        : coverUrl;
      const savedExcerpt = locksBookProfile
        ? editPost?.excerpt || ""
        : excerptFromBundle(bundle) || editPost?.excerpt || "";
      const creatingPost = !editPost;
      const savedStatus: CreateContentInput["status"] =
        creatingPost &&
        postStatus === "published" &&
        worksFolderId &&
        worksVisibility === "private"
          ? "private"
          : postStatus;
      const book: BookMetadata | undefined = isBookWriter
        ? {
            ...existingBook,
            kind: "original",
            bookTitle: savedTitle,
            authors: existingBook?.authors || [],
            authorIds: existingBook?.authorIds || [],
          }
        : undefined;
      const input: CreateContentInput = {
        type: writerContentType,
        status: savedStatus,
        editor: "rin",
        title: savedTitle,
        body: bodyFromBundle(bundle, archive, assets, writerMode, savedTitle),
        excerpt: savedExcerpt,
        tags: savedTags,
        coverUrl: savedCoverUrl,
        book,
      };
      const saved = editPost
        ? await updateContent(editPost.slug || editPost.id, input)
        : await createContent(input);
      if (isContentModerationSubmission(saved)) {
        setStatus({
          key: `publishDialog.create.moderation.${
            saved.state === "rejected"
              ? "rejected"
              : saved.state === "published"
                ? "published"
                : "pending"
          }`,
        });
        return;
      }
      await deleteAutosaveDraft(autosaveKeyRef.current);
      await deleteRemoteAutosaveDraft(autosaveKeyRef.current).catch(
        () => undefined,
      );
      setAutosaveDraft(null);
      setAutosaveNotice(null);
      setEditPost(saved);
      setImportedEditSlug(saved.slug || saved.id);
      if (saved.publicationPending) {
        setStatus({ key: "writer.status.activationPending" });
        return;
      }
      if (postStatus === "draft") {
        setStatus({
          key: `writer.status.${isBookWriter ? "bookDraftSaved" : "articleDraftSaved"}`,
        });
        const editRef = encodeURIComponent(saved.slug || saved.id);
        navigate(
          `${isBookWriter ? "/write?mode=book&edit=" : "/write?edit="}${editRef}`,
          {
            replace: true,
          },
        );
      } else {
        let publishStatus: WriterNotice = {
          key: "writer.status.published",
          values: { title: saved.title },
        };
        if (!isBookWriter && chapterContext) {
          try {
            await attachBookChapterLink(
              chapterContext.bookId,
              chapterContext.chapterKey,
              {
                targetType: "blog",
                targetPostId: saved.id,
              },
            );
          } catch (attachError) {
            console.error(
              "Failed to attach the published article to the book chapter",
              attachError,
            );
            publishStatus = { key: "writer.status.chapterLinkFailed" };
          }
        }
        if (creatingPost && worksFolderId) {
          await moveWorkItem({ postId: saved.id, folderId: worksFolderId });
        }
        setStatus(publishStatus);
        navigate(
          isBookWriter
            ? bookWorkspacePath(saved.id)
            : contentPath(writerContentType, saved.id, saved.title),
        );
      }
    } catch (saveError) {
      setError(localizedErrorMessage(saveError, "creation.rinSaveFailed"));
    } finally {
      setSavingMode("");
    }
  };

  const changeCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    setStatus(null);
    if (!file.type.startsWith("image/")) {
      setError(t("writer.validation.imageOnly"));
      return;
    }
    if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    setPendingCoverCrop({
      imageUrl: URL.createObjectURL(file),
      fileName: file.name || "blog-cover.jpg",
    });
  };

  const closeCoverCrop = () => {
    if (coverUploading) return;
    if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    setPendingCoverCrop(null);
  };

  const uploadCroppedCover = async (file: File) => {
    if (!pendingCoverCrop) return;
    if (!user) {
      setError(t('publishPage.validation.signInToUploadCover'));
      setStatus(null);
      return;
    }
    setCoverUploading(true);
    setError("");
    setStatus({ key: "writer.status.coverUploading" });
    try {
      const uploaded = await uploadCoverFile(user, file);
      setCoverUrl(uploaded.fileID);
      setStatus({ key: "writer.status.coverUploaded" });
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    } catch (uploadError) {
      setError(
        localizedErrorMessage(uploadError, "creation.rinCoverUploadFailed"),
      );
      setStatus(null);
    } finally {
      setCoverUploading(false);
    }
  };

  const importLatexProject = async (
    input: HTMLInputElement,
    mode: "merge" | "replace",
  ) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file || !editorRef.current) return;
    setImportingArchive(true);
    setError("");
    setStatus({
      key:
        mode === "merge" ? "writer.status.merging" : "writer.status.replacing",
      values: { filename: file.name },
    });
    try {
      await editorRef.current.importArchive(file, { mode });
      setStatus({
        key:
          mode === "merge" ? "writer.status.merged" : "writer.status.replaced",
        values: { filename: file.name },
      });
      if (editSlug) setImportedEditSlug(editSlug);
      scheduleAutosave(3000);
    } catch (importError) {
      setError(localizedErrorMessage(importError, "creation.rinImportFailed"));
      setStatus(null);
    } finally {
      setImportingArchive(false);
    }
  };

  // A Typst blog has no in-browser body editor: create the empty project here,
  // then hand the author to the repository-backed code workspace.
  if (!editSlug && searchParams.get("kind") === "typst") {
    if (!typstCreationEnabled) return <Navigate to="/write" replace />;
    return (
      <>
        <Helmet title={writerShellTitle} />
        <SiteTopbar />
        <PublishCreateDialog
          open
          mode="typst-blog"
          user={user}
          onClose={() => navigate("/write", { replace: true })}
        />
      </>
    );
  }

  return (
    <>
      <Helmet title={writerShellTitle} />
      <SiteTopbar />
      <main className="writer-shell direct-rin-shell">
        <div
          className={`writer-publish-bar${locksBookProfile ? " book-writer-publish-bar" : ""}${isWorkspaceSectionEditor ? " workspace-section-editor-bar" : ""}`}
        >
          {locksBookProfile ? (
            <div className="book-writer-profile-strip">
              {editPost?.coverUrl ? (
                <img src={editPost.coverUrl} alt="" />
              ) : (
                <span aria-hidden="true">
                  <Icon name="book" />
                </span>
              )}
              <div className="book-writer-profile-main">
                <em>{t("writer.profile.workspace")}</em>
                <strong>
                  <MathInline text={bookProfileTitle} />
                </strong>
                <small>
                  {editPost?.tags.length
                    ? editPost.tags.join(" / ")
                    : t("writer.profile.tagsManaged")}
                </small>
              </div>
              {chapterContext ? (
                <div className="writer-source-context writer-source-context-inline">
                  <span>{t("writer.profile.fromChapter")}</span>
                  <strong>
                    <MathInline text={chapterContext.bookTitle} />
                  </strong>
                  <em>
                    <MathInline text={chapterContext.chapterTitle} />
                    {chapterContext.chapterPage
                      ? ` · p. ${chapterContext.chapterPage}`
                      : ""}
                  </em>
                </div>
              ) : null}
              {chapterScope ? (
                <div className="writer-source-context writer-source-context-inline">
                  <span>{t("writer.profile.chapterEntry")}</span>
                  <strong>
                    <MathInline text={chapterScope.title} />
                  </strong>
                  <em>
                    {chapterScope.path
                      ? `${chapterScope.path}${chapterScope.line ? `:${chapterScope.line}` : ""}`
                      : t("writer.profile.updatesWholeBook")}
                  </em>
                </div>
              ) : null}
              {bookProfileEditPath && !isWorkspaceSectionEditor ? (
                <Link to={bookProfileEditPath}>
                  <Icon name="card-text" />
                  {t("writer.profile.edit")}
                </Link>
              ) : null}
              {bookWorkspaceHref && !isWorkspaceSectionEditor ? (
                <Link to={bookWorkspaceHref}>
                  <Icon name="columns-gap" />
                  {t("writer.profile.openWorkspace")}
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <Form.Group
                className="writer-title-field"
                controlId="writer-title"
              >
                <Form.Label>{writerTitleLabel}</Form.Label>
                <Form.Control
                  value={title}
                  maxLength={120}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
              </Form.Group>
              <Form.Group className="writer-tags-field" controlId="writer-tags">
                <Form.Label>{t("writer.labels.tags")}</Form.Label>
                <TagPicker
                  value={splitTagValues(tags).slice(0, 6)}
                  onChange={(next) => setTags(joinTagValues(next))}
                  disabled={!user || Boolean(savingMode)}
                  ariaLabel={t("writer.labels.tags")}
                />
              </Form.Group>
              <Form.Group
                className="writer-cover-field"
                controlId="writer-cover"
              >
                <Form.Label>{t("writer.labels.cover")}</Form.Label>
                <div className="writer-cover-control">
                  {coverUrl ? <img src={coverUrl} alt="" /> : <span>16:9</span>}
                  <Form.Label className="writer-cover-upload-button">
                    <Icon name="image" />
                    <span>
                      {t(`writer.cover.${coverUrl ? "change" : "upload"}`)}
                    </span>
                    <Form.Control
                      id="writer-cover"
                      type="file"
                      accept="image/*"
                      disabled={!user || coverUploading}
                      onChange={changeCover}
                    />
                  </Form.Label>
                  {coverUrl ? (
                    <AnimateButton
                      unstyled
                      type="button"
                      className="writer-cover-remove-button"
                      disabled={coverUploading}
                      onClick={() => setCoverUrl("")}
                    >
                      {t("writer.cover.remove")}
                    </AnimateButton>
                  ) : null}
                </div>
              </Form.Group>
            </>
          )}
          {isBookWriter && !isWorkspaceSectionEditor ? (
            <div className="writer-import-actions">
              <Form.Label
                className={
                  importingArchive
                    ? "writer-import-control disabled"
                    : "writer-import-control"
                }
              >
                <Icon name="file-earmark-plus" />
                <span>
                  {t(
                    `writer.import.${importingArchive ? "importing" : "merge"}`,
                  )}
                </span>
                <Form.Control
                  type="file"
                  accept=".zip,.tar,.gz,.tgz,.tex,.ltx,application/zip,application/x-tar,application/gzip,text/x-tex,text/plain"
                  disabled={
                    !user ||
                    !editorReady ||
                    importingArchive ||
                    Boolean(savingMode)
                  }
                  onChange={(event) =>
                    void importLatexProject(
                      event.currentTarget as HTMLInputElement,
                      "merge",
                    )
                  }
                />
              </Form.Label>
              <Form.Label
                className={
                  importingArchive
                    ? "writer-import-control disabled"
                    : "writer-import-control"
                }
              >
                <Icon name="arrow-repeat" />
                <span>{t("writer.import.replace")}</span>
                <Form.Control
                  type="file"
                  accept=".zip,.tar,.gz,.tgz,.tex,.ltx,application/zip,application/x-tar,application/gzip,text/x-tex,text/plain"
                  disabled={
                    !user ||
                    !editorReady ||
                    importingArchive ||
                    Boolean(savingMode)
                  }
                  onChange={(event) =>
                    void importLatexProject(
                      event.currentTarget as HTMLInputElement,
                      "replace",
                    )
                  }
                />
              </Form.Label>
            </div>
          ) : null}
          {isWorkspaceSectionEditor ? (
            <div className="writer-topbar-actions">
              {autosaveNoticeText ? (
                <span
                  className={
                    autosaveNotice?.tone === "destructive"
                      ? "writer-inline-save-status warning"
                      : "writer-inline-save-status"
                  }
                >
                  {autosaveNoticeText}
                </span>
              ) : null}
              <Button
                className="primary-button"
                type="button"
                disabled={!canSave}
                onClick={() => void saveArticle("published")}
              >
                {savingMode === "published" ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    {t("writer.actions.saving")}
                  </>
                ) : (
                  t("writer.actions.save")
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="writer-topbar-actions">
                <Button
                  className="primary-button writer-save-button"
                  type="button"
                  disabled={!canSave}
                  onClick={() => void saveArticle("draft")}
                >
                  {savingMode === "draft" ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      {t("writer.actions.saving")}
                    </>
                  ) : (
                    t("writer.actions.save")
                  )}
                </Button>
                <Button
                  className="primary-button"
                  type="button"
                  disabled={!canSave}
                  onClick={() => void saveArticle("published")}
                >
                  {savingMode === "published" ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      {t("writer.actions.publishing")}
                    </>
                  ) : (
                    writerPublishLabel
                  )}
                </Button>
              </div>
            </>
          )}
          {diagnostics.length ? (
            <div className="writer-feedback">
              <div className="writer-diagnostics compact-diagnostics">
                <span>{t("writer.actions.diagnostics")}</span>
                {diagnostics.slice(0, 5).map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <section
          className="writer-frame direct-rin-frame"
          aria-label={t("writer.editor")}
        >
          {!editorReady ? <LoadingState variant="strip" /> : null}
          <div ref={hostRef} className="rin-editor-host" />
        </section>
        {pendingCoverCrop ? (
          <ImageCropDialog
            open
            imageUrl={pendingCoverCrop.imageUrl}
            title={writerCoverCropTitle}
            aspect={16 / 9}
            cropShape="rect"
            outputWidth={1600}
            outputHeight={900}
            outputFileName={pendingCoverCrop.fileName}
            busy={coverUploading}
            error={error}
            onCancel={closeCoverCrop}
            onConfirm={uploadCroppedCover}
          />
        ) : null}
      </main>
    </>
  );
}
