import { publicEnv } from "@/app/config/env";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatDate } from "@/i18n/format";
import { resolveLocale } from "@/i18n/resolveLocale";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import type { RinspaceUser } from "@/services/phoneAuth";
import type { RepositoryFileInput } from "@/components/milkdown/repositoryAssets";
import {
  authHeaders as sessionAuthHeaders,
  getAuthAccessToken,
  getAuthDeviceId,
  hasAuthSession,
} from "@/services/phoneAuth";

export type MilkdownAutosaveKind = "blog-markdown" | "markdown-book-section";

export class MilkdownDraftSaveError extends Error {
  constructor(public readonly localSaved: boolean, cause: unknown) {
    super("Account draft save failed", { cause });
  }
}

export type MilkdownAutosaveDraft = {
  version: 1;
  key: string;
  kind: MilkdownAutosaveKind;
  title: string;
  markdown: string;
  excerpt?: string;
  excerptCustomized?: boolean;
  tags?: string;
  coverUrl?: string;
  sourceVisibility?: "private" | "open";
  editSlug?: string;
  bookId?: string;
  sectionId?: string;
  bookTitle?: string;
  repositoryFiles?: RepositoryFileInput[];
  savedAt: number;
};

type RemoteMilkdownAutosaveDraft = {
  draft: MilkdownAutosaveDraft;
  revision: number;
  sourceId: string;
  updatedAt: string;
};

type MilkdownAutosaveNotice = {
  key: string;
  timestamp?: number;
  source?: "local" | "remote";
  tone?: "default" | "destructive";
};

type UseMilkdownAutosaveOptions = {
  key: string;
  user: RinspaceUser | null;
  userChecked: boolean;
  enabled: boolean;
  ready: boolean;
  makeDraft: () => MilkdownAutosaveDraft | null;
  applyDraft: (
    draft: MilkdownAutosaveDraft,
    source: "local" | "remote" | "sync",
  ) => void | Promise<void>;
};

const milkdownAutosaveDbName = "rinspace-milkdown-autosave";
const milkdownAutosaveStoreName = "drafts";
const milkdownRemoteAutosaveEndpoint = `${publicEnv.publicBasePath || ""}/api/rin-writer/draft`;
const milkdownRemoteAutosaveSourceKey = "rinspace-milkdown-autosave-source";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMilkdownAutosaveKind(value: unknown): value is MilkdownAutosaveKind {
  return value === "blog-markdown" || value === "markdown-book-section";
}

function isMilkdownAutosaveDraft(
  value: unknown,
  key?: string,
): value is MilkdownAutosaveDraft {
  if (!isRecord(value)) return false;
  if (value.version !== 1 || typeof value.key !== "string") return false;
  if (key && value.key !== key) return false;
  return (
    isMilkdownAutosaveKind(value.kind) &&
    typeof value.title === "string" &&
    typeof value.markdown === "string" &&
    typeof value.savedAt === "number"
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
    const existing = window.sessionStorage.getItem(
      milkdownRemoteAutosaveSourceKey,
    );
    if (existing) return existing;
    const random = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const sourceId = `milkdown-${random}`;
    window.sessionStorage.setItem(milkdownRemoteAutosaveSourceKey, sourceId);
    return sourceId;
  } catch {
    return `milkdown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function parseRemoteAutosaveDraft(
  value: unknown,
  key: string,
): RemoteMilkdownAutosaveDraft | null {
  if (!isRecord(value) || !isMilkdownAutosaveDraft(value.draft, key))
    return null;
  return {
    draft: value.draft,
    revision: typeof value.revision === "number" ? value.revision : 0,
    sourceId: typeof value.sourceId === "string" ? value.sourceId : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

async function readRemoteAutosaveDraft(
  key: string,
): Promise<RemoteMilkdownAutosaveDraft | null> {
  const token = await getAuthAccessToken();
  if (!token && !hasAuthSession()) return null;
  const response = await fetch(
    `${milkdownRemoteAutosaveEndpoint}?key=${encodeURIComponent(key)}`,
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
  draft: MilkdownAutosaveDraft,
  sourceId: string,
): Promise<RemoteMilkdownAutosaveDraft | null> {
  const token = await getAuthAccessToken();
  if (!token && !hasAuthSession()) return null;
  const response = await fetch(
    `${milkdownRemoteAutosaveEndpoint}?key=${encodeURIComponent(draft.key)}`,
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
    `${milkdownRemoteAutosaveEndpoint}?key=${encodeURIComponent(key)}`,
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
  return `rinspace:milkdown-autosave:${encodeURIComponent(key)}`;
}

export function formatMilkdownAutosaveTime(
  timestamp: number,
  locale: "zh-CN" | "en" = "zh-CN",
) {
  if (!timestamp || !Number.isFinite(timestamp)) return "";
  return formatDate(locale, timestamp, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function openAutosaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(milkdownAutosaveDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(milkdownAutosaveStoreName)) {
        db.createObjectStore(milkdownAutosaveStoreName, { keyPath: "key" });
      }
    };
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function readAutosaveDraftFromDb(
  key: string,
): Promise<MilkdownAutosaveDraft | null> {
  return openAutosaveDb().then(
    (db) =>
      new Promise<MilkdownAutosaveDraft | null>((resolve, reject) => {
        const transaction = db.transaction(
          milkdownAutosaveStoreName,
          "readonly",
        );
        const store = transaction.objectStore(milkdownAutosaveStoreName);
        const request = store.get(key) as IDBRequest<
          MilkdownAutosaveDraft | undefined
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

function writeAutosaveDraftToDb(draft: MilkdownAutosaveDraft): Promise<void> {
  return openAutosaveDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          milkdownAutosaveStoreName,
          "readwrite",
        );
        transaction.objectStore(milkdownAutosaveStoreName).put(draft);
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
        const transaction = db.transaction(
          milkdownAutosaveStoreName,
          "readwrite",
        );
        transaction.objectStore(milkdownAutosaveStoreName).delete(key);
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

async function readAutosaveDraft(
  key: string,
): Promise<MilkdownAutosaveDraft | null> {
  return readAutosaveDraftFromDb(key).catch(() => {
    try {
      const raw = window.localStorage.getItem(localAutosaveKey(key));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isMilkdownAutosaveDraft(parsed, key)) return null;
      return parsed;
    } catch {
      return null;
    }
  });
}

function writeAutosaveDraft(draft: MilkdownAutosaveDraft): Promise<void> {
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
        // Manual save already succeeded; storage cleanup can be best effort.
      }
    });
}

export function milkdownAutosaveUserId(user: RinspaceUser | null) {
  return user?.id || user?.phone || "anonymous";
}

export function makeMilkdownAutosaveKey(
  user: RinspaceUser | null,
  kind: MilkdownAutosaveKind,
  contentRef: string,
) {
  return [
    milkdownAutosaveUserId(user),
    "milkdown",
    kind,
    contentRef || "new",
  ].join(":");
}

export function useMilkdownAutosave({
  key,
  user,
  userChecked,
  enabled,
  ready,
  makeDraft,
  applyDraft,
}: UseMilkdownAutosaveOptions) {
  const { t, i18n } = useFeatureTranslation("creation");
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const activeAutosaveRef = useRef<Promise<void> | null>(null);
  const manualSavingRef = useRef(false);
  const pendingRef = useRef(false);
  const lastRunRef = useRef(0);
  const keyRef = useRef(key);
  const sourceIdRef = useRef("");
  const remoteRevisionRef = useRef(0);
  const lastLocalChangeAtRef = useRef(0);
  const lastLocalAutosaveAtRef = useRef(0);
  const applyingRemoteDraftRef = useRef(false);
  const makeDraftRef = useRef(makeDraft);
  const applyDraftRef = useRef(applyDraft);
  const enabledRef = useRef(enabled);
  const readyRef = useRef(ready);
  const userRef = useRef(user);
  const [checked, setChecked] = useState(false);
  const [noticeState, setNotice] = useState<MilkdownAutosaveNotice | null>(
    null,
  );
  const notice = noticeState
    ? t(noticeState.key, {
        ...(noticeState.timestamp
          ? { time: formatMilkdownAutosaveTime(noticeState.timestamp, locale) }
          : {}),
        ...(noticeState.source
          ? { source: t(`writer.autosave.sources.${noticeState.source}`) }
          : {}),
      })
    : "";

  useEffect(() => {
    sourceIdRef.current = getRemoteAutosaveSourceId();
  }, []);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    makeDraftRef.current = makeDraft;
  }, [makeDraft]);

  useEffect(() => {
    applyDraftRef.current = applyDraft;
  }, [applyDraft]);

  useEffect(() => {
    enabledRef.current = enabled;
    readyRef.current = ready;
    userRef.current = user;
  }, [enabled, ready, user]);

  useEffect(() => {
    remoteRevisionRef.current = 0;
    lastLocalChangeAtRef.current = 0;
    lastLocalAutosaveAtRef.current = 0;
  }, [key]);

  const runAutosave = useCallback(async () => {
    if (!enabledRef.current || !readyRef.current || manualSavingRef.current) return;
    const draft = makeDraftRef.current();
    const currentKey = keyRef.current;
    if (!draft || !currentKey || draft.key !== currentKey) return;
    if (runningRef.current) {
      pendingRef.current = true;
      return;
    }
    runningRef.current = true;
    pendingRef.current = false;
    lastRunRef.current = Date.now();
    const operation = (async () => {
      try {
        await writeAutosaveDraft(draft);
        lastLocalAutosaveAtRef.current = draft.savedAt;
        try {
          const remoteDraft = await writeRemoteAutosaveDraft(
            draft,
            sourceIdRef.current || getRemoteAutosaveSourceId(),
          );
          if (remoteDraft) {
            remoteRevisionRef.current = Math.max(
              remoteRevisionRef.current,
              remoteDraft.revision,
            );
            setNotice({
              key: "writer.autosave.savedSynced",
              timestamp: draft.savedAt,
            });
          } else {
            setNotice({
              key: "writer.autosave.savedLocal",
              timestamp: draft.savedAt,
            });
          }
        } catch (remoteError) {
          console.error("Failed to sync the remote Milkdown draft", remoteError);
          setNotice({
            key: "writer.autosave.cloudSyncFailed",
            tone: "destructive",
          });
        }
      } catch (autosaveError) {
        console.error("Failed to save the local Milkdown draft", autosaveError);
        setNotice({
          key: "writer.autosave.localSaveFailed",
          tone: "destructive",
        });
      } finally {
        runningRef.current = false;
        if (pendingRef.current && !manualSavingRef.current) {
          pendingRef.current = false;
          window.setTimeout(() => {
            void runAutosave();
          }, 500);
        }
      }
    })();
    activeAutosaveRef.current = operation;
    await operation;
    if (activeAutosaveRef.current === operation) activeAutosaveRef.current = null;
  }, []);

  const saveNow = useCallback(async () => {
    const draft = makeDraftRef.current();
    if (!draft || !keyRef.current || draft.key !== keyRef.current) {
      throw new Error("No Markdown draft is available to save.");
    }
    manualSavingRef.current = true;
    pendingRef.current = false;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      await activeAutosaveRef.current;
      let localSaved = false;
      try {
        await writeAutosaveDraft(draft);
        lastLocalAutosaveAtRef.current = draft.savedAt;
        localSaved = true;
      } catch (localError) {
        // A failed browser storage write must not block the account draft.
        console.error("Failed to save the local Milkdown draft", localError);
      }
      let remoteDraft: RemoteMilkdownAutosaveDraft | null;
      try {
        remoteDraft = await writeRemoteAutosaveDraft(
          draft,
          sourceIdRef.current || getRemoteAutosaveSourceId(),
        );
        if (!remoteDraft) throw new Error("No authenticated account draft is available.");
      } catch (remoteError) {
        throw new MilkdownDraftSaveError(localSaved, remoteError);
      }
      remoteRevisionRef.current = Math.max(remoteRevisionRef.current, remoteDraft.revision);
      setNotice({ key: "writer.autosave.savedSynced", timestamp: draft.savedAt });
      return remoteDraft;
    } finally {
      manualSavingRef.current = false;
    }
  }, []);

  const scheduleAutosave = useCallback(
    (delay = 8000, options: { force?: boolean } = {}) => {
      if (!enabledRef.current || !readyRef.current) return;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      const elapsed = Date.now() - lastRunRef.current;
      const minDelay = !options.force && elapsed < 8000 ? 8000 - elapsed : 0;
      timerRef.current = window.setTimeout(
        () => {
          timerRef.current = null;
          void runAutosave();
        },
        Math.max(delay, minDelay),
      );
    },
    [runAutosave],
  );

  const markChanged = useCallback(
    (delay = 8000) => {
      lastLocalChangeAtRef.current = Date.now();
      scheduleAutosave(delay);
    },
    [scheduleAutosave],
  );

  const clearAutosave = useCallback(async () => {
    const currentKey = keyRef.current;
    if (!currentKey) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    manualSavingRef.current = true;
    pendingRef.current = false;
    try {
      await activeAutosaveRef.current;
      await deleteAutosaveDraft(currentKey);
      await deleteRemoteAutosaveDraft(currentKey).catch(() => undefined);
      setNotice(null);
      lastLocalChangeAtRef.current = 0;
      lastLocalAutosaveAtRef.current = 0;
    } finally {
      manualSavingRef.current = false;
    }
  }, []);

  const applyRemoteAutosaveDraft = useCallback(
    async (remoteDraft: RemoteMilkdownAutosaveDraft) => {
      const draft = remoteDraft.draft;
      if (draft.key !== keyRef.current) return;
      if (remoteDraft.revision <= remoteRevisionRef.current) return;
      remoteRevisionRef.current = remoteDraft.revision;
      if (remoteDraft.sourceId && remoteDraft.sourceId === sourceIdRef.current)
        return;
      if (lastLocalChangeAtRef.current > lastLocalAutosaveAtRef.current) {
        setNotice({ key: "writer.autosave.remoteConflict" });
        return;
      }
      applyingRemoteDraftRef.current = true;
      try {
        await applyDraftRef.current(draft, "sync");
        await writeAutosaveDraft(draft).catch(() => undefined);
        lastLocalAutosaveAtRef.current = draft.savedAt;
        lastLocalChangeAtRef.current = 0;
        setNotice({
          key: "writer.autosave.remoteSynced",
          timestamp: draft.savedAt,
        });
      } finally {
        window.setTimeout(() => {
          applyingRemoteDraftRef.current = false;
        }, 0);
      }
    },
    [],
  );

  const pollRemoteAutosaveDraft = useCallback(async () => {
    const currentKey = keyRef.current;
    if (!currentKey || !userRef.current || applyingRemoteDraftRef.current)
      return;
    const remoteDraft = await readRemoteAutosaveDraft(currentKey);
    if (!remoteDraft) return;
    await applyRemoteAutosaveDraft(remoteDraft);
  }, [applyRemoteAutosaveDraft]);

  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    setNotice(null);
    if (!userChecked || !enabled || !key) return undefined;
    void (async () => {
      const localDraft = await readAutosaveDraft(key);
      let remoteDraft: RemoteMilkdownAutosaveDraft | null = null;
      try {
        remoteDraft = user ? await readRemoteAutosaveDraft(key) : null;
      } catch (remoteError) {
        if (!cancelled && !localDraft) {
          console.error(
            "Failed to read the remote Milkdown draft",
            remoteError,
          );
          setNotice({
            key: "writer.autosave.remoteReadFailed",
            tone: "destructive",
          });
        }
      }
      if (remoteDraft) {
        remoteRevisionRef.current = Math.max(
          remoteRevisionRef.current,
          remoteDraft.revision,
        );
      }
      const draft =
        remoteDraft?.draft &&
        (!localDraft || remoteDraft.draft.savedAt > localDraft.savedAt)
          ? remoteDraft.draft
          : localDraft;
      const source: "local" | "remote" =
        draft && remoteDraft?.draft === draft ? "remote" : "local";
      if (draft && source === "remote") {
        await writeAutosaveDraft(draft).catch(() => undefined);
      }
      return { draft, source };
    })()
      .then(async ({ draft, source }) => {
        if (cancelled) return;
        if (draft) {
          lastLocalAutosaveAtRef.current = draft.savedAt;
          await applyDraftRef.current(draft, source);
          setNotice({
            key: "writer.autosave.restored",
            timestamp: draft.savedAt,
            source,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, user, userChecked]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !enabled) return undefined;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        scheduleAutosave(0, { force: true });
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!timerRef.current && !runningRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled, ready, scheduleAutosave]);

  useEffect(() => {
    if (!ready || !enabled || !user) return undefined;
    let cancelled = false;
    const run = () => {
      void pollRemoteAutosaveDraft().catch((pollError) => {
        if (!cancelled) {
          console.error("Failed to poll the remote Milkdown draft", pollError);
          setNotice({ key: "writer.autosave.pollFailed", tone: "destructive" });
        }
      });
    };
    const timer = window.setInterval(run, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, pollRemoteAutosaveDraft, ready, user]);

  return {
    checked,
    notice,
    noticeTone: noticeState?.tone || "default",
    markChanged,
    scheduleAutosave,
    saveNow,
    clearAutosave,
  };
}
