// RINSPACE_SHARED_SOURCE: edit only in rinspace/ui, then run the one-way sync.
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, type HTMLMotionProps } from "motion/react";

export type TweetComposerVisibility =
  | "public"
  | "unlisted"
  | "private"
  | "direct";

export interface TweetComposerLanguage {
  code: string;
  label: string;
}

export interface TweetComposerConfig {
  maxCharacters: number;
  maxMediaAttachments: number;
  maxMediaBytes: number;
  acceptedMediaTypes: string[];
  pollMinOptions: number;
  pollMaxOptions: number;
  pollMaxOptionCharacters: number;
  pollDurations: number[];
  languages: TweetComposerLanguage[];
  defaultLanguage: string;
  defaultVisibility: TweetComposerVisibility;
}

export interface TweetComposerEmoji {
  shortcode: string;
  url: string;
  staticUrl: string;
  category?: string;
}

export interface TweetComposerSuggestion {
  id: string;
  kind: "account" | "hashtag";
  label: string;
  value: string;
  avatarUrl?: string;
}

export interface TweetComposerUploadedMedia {
  id: string;
  type: string;
  url: string;
  previewUrl: string;
  description?: string;
}

export interface TweetComposerMediaDraft extends TweetComposerUploadedMedia {
  localId: string;
  fileName: string;
  progress: number;
  state: "uploading" | "ready" | "failed";
  error?: string;
}

export interface TweetComposerPoll {
  options: string[];
  multiple: boolean;
  expiresIn: number;
}

export interface TweetComposerDraft {
  text: string;
  sensitive: boolean;
  spoilerText: string;
  visibility: TweetComposerVisibility;
  language: string;
  media: TweetComposerMediaDraft[];
  poll: TweetComposerPoll | null;
  inReplyToId?: string;
  quotedStatusId?: string;
  editStatusId?: string;
}

export interface TweetComposerPublishInput {
  text: string;
  sensitive: boolean;
  spoilerText: string;
  visibility: TweetComposerVisibility;
  language: string;
  mediaIds: string[];
  poll: TweetComposerPoll | null;
  inReplyToId?: string;
  quotedStatusId?: string;
  editStatusId?: string;
  idempotencyKey: string;
}

export interface TweetComposerPublishResult {
  id: string;
  url: string;
  createdAt: string;
}

export interface TweetComposerAdapter {
  countCharacters(value: string): number;
  loadConfig(signal?: AbortSignal): Promise<TweetComposerConfig>;
  loadEmojis(signal: AbortSignal): Promise<TweetComposerEmoji[]>;
  searchSuggestions(
    query: string,
    kind: "account" | "hashtag",
    signal: AbortSignal,
  ): Promise<TweetComposerSuggestion[]>;
  uploadMedia(input: {
    file: File;
    description: string;
    signal: AbortSignal;
    onProgress: (value: number) => void;
  }): Promise<TweetComposerUploadedMedia>;
  updateMediaDescription(
    mediaId: string,
    description: string,
    signal: AbortSignal,
  ): Promise<void>;
  publish(
    input: TweetComposerPublishInput,
    signal: AbortSignal,
  ): Promise<TweetComposerPublishResult>;
}

export class TweetComposerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "TweetComposerError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface TweetComposerMessages {
  title: string;
  close: string;
  minimize: string;
  placeholder: string;
  contentWarning: string;
  contentWarningPlaceholder: string;
  visibility: string;
  visibilityPublic: string;
  visibilityUnlisted: string;
  visibilityPrivate: string;
  visibilityDirect: string;
  language: string;
  addMedia: string;
  addPoll: string;
  removePoll: string;
  addEmoji: string;
  altText: string;
  removeMedia: string;
  pollOption: string;
  addPollOption: string;
  removePollOption: string;
  multipleChoice: string;
  pollDuration: string;
  replyTo: string;
  quoting: string;
  removeQuote: string;
  publishing: string;
  publish: string;
  save: string;
  published: string;
  loading: string;
  retry: string;
  configFailed: string;
  suggestionsFailed: string;
  mediaTooLarge: string;
  mediaUploadFailed: string;
  publishFailed: string;
  empty: string;
  overLimit: string;
  mediaCount: string;
  pollAndMediaConflict: string;
  durationMinutes: string;
  durationHours: string;
  durationDays: string;
}

const zhMessages: TweetComposerMessages = {
  title: "发布推文",
  close: "关闭",
  minimize: "最小化",
  placeholder: "有什么新鲜事？",
  contentWarning: "内容警告",
  contentWarningPlaceholder: "简要说明需要预警的内容",
  visibility: "可见范围",
  visibilityPublic: "公开",
  visibilityUnlisted: "公开但不进入发现",
  visibilityPrivate: "仅关注者",
  visibilityDirect: "仅提及的人",
  language: "语言",
  addMedia: "添加媒体",
  addPoll: "添加投票",
  removePoll: "移除投票",
  addEmoji: "添加表情",
  altText: "替代文字",
  removeMedia: "移除媒体",
  pollOption: "选项 {{index}}",
  addPollOption: "添加选项",
  removePollOption: "移除选项 {{index}}",
  multipleChoice: "允许多选",
  pollDuration: "投票时长",
  replyTo: "回复 {{name}}",
  quoting: "引用 {{name}}",
  removeQuote: "移除引用",
  publishing: "发布中…",
  publish: "发布",
  save: "保存修改",
  published: "推文已发布",
  loading: "正在加载发布能力…",
  retry: "重试",
  configFailed: "无法加载发布配置。",
  suggestionsFailed: "无法加载建议。",
  mediaTooLarge: "媒体文件超过大小限制。",
  mediaUploadFailed: "媒体上传失败。",
  publishFailed: "推文发布失败。",
  empty: "请输入正文、添加媒体或创建投票。",
  overLimit: "正文超过字数限制。",
  mediaCount: "最多可添加 {{count}} 个媒体。",
  pollAndMediaConflict: "投票和媒体不能同时发布。",
  durationMinutes: "{{count}} 分钟",
  durationHours: "{{count}} 小时",
  durationDays: "{{count}} 天",
};

const enMessages: TweetComposerMessages = {
  title: "New tweet",
  close: "Close",
  minimize: "Minimize",
  placeholder: "What is happening?",
  contentWarning: "Content warning",
  contentWarningPlaceholder: "Summarize what readers should know first",
  visibility: "Visibility",
  visibilityPublic: "Public",
  visibilityUnlisted: "Public, but not in discovery",
  visibilityPrivate: "Followers only",
  visibilityDirect: "Mentioned people only",
  language: "Language",
  addMedia: "Add media",
  addPoll: "Add poll",
  removePoll: "Remove poll",
  addEmoji: "Add emoji",
  altText: "Alternative text",
  removeMedia: "Remove media",
  pollOption: "Option {{index}}",
  addPollOption: "Add option",
  removePollOption: "Remove option {{index}}",
  multipleChoice: "Allow multiple choices",
  pollDuration: "Poll duration",
  replyTo: "Replying to {{name}}",
  quoting: "Quoting {{name}}",
  removeQuote: "Remove quote",
  publishing: "Publishing…",
  publish: "Publish",
  save: "Save changes",
  published: "Tweet published",
  loading: "Loading publishing capabilities…",
  retry: "Retry",
  configFailed: "Publishing configuration could not be loaded.",
  suggestionsFailed: "Suggestions could not be loaded.",
  mediaTooLarge: "The media file exceeds the size limit.",
  mediaUploadFailed: "Media upload failed.",
  publishFailed: "Tweet publishing failed.",
  empty: "Enter text, attach media, or create a poll.",
  overLimit: "The tweet exceeds the character limit.",
  mediaCount: "You can attach up to {{count}} media files.",
  pollAndMediaConflict: "A poll and media cannot be published together.",
  durationMinutes: "{{count}} minutes",
  durationHours: "{{count}} hours",
  durationDays: "{{count}} days",
};

export function resolveTweetComposerMessages(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? zhMessages : enMessages;
}

function formatMessage(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

function errorMessage(
  error: unknown,
  messages: TweetComposerMessages,
  fallback: keyof Pick<
    TweetComposerMessages,
    "configFailed" | "suggestionsFailed" | "mediaUploadFailed" | "publishFailed"
  >,
) {
  if (error instanceof TweetComposerError) {
    if (error.code === "composer.media_too_large") return messages.mediaTooLarge;
    if (error.message && error.message !== error.code) return error.message;
  }
  return messages[fallback];
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `tweet-${crypto.randomUUID()}`;
  }
  return `tweet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function initialComposerDraft(
  initial: Partial<TweetComposerDraft> | undefined,
): TweetComposerDraft {
  return {
    text: initial?.text ?? "",
    sensitive: initial?.sensitive ?? false,
    spoilerText: initial?.spoilerText ?? "",
    visibility: initial?.visibility ?? "public",
    language: initial?.language ?? "",
    media: initial?.media ?? [],
    poll: initial?.poll ?? null,
    inReplyToId: initial?.inReplyToId,
    quotedStatusId: initial?.quotedStatusId,
    editStatusId: initial?.editStatusId,
  };
}

function draftSignature(draft: TweetComposerDraft) {
  return JSON.stringify({
    text: draft.text,
    sensitive: draft.sensitive,
    spoilerText: draft.spoilerText,
    visibility: draft.visibility,
    language: draft.language,
    media: draft.media.map(({ id, description }) => ({ id, description })),
    poll: draft.poll,
    inReplyToId: draft.inReplyToId,
    quotedStatusId: draft.quotedStatusId,
    editStatusId: draft.editStatusId,
  });
}

function trailingSuggestion(value: string) {
  const match = value.match(/(?:^|\s)([@#])([\p{L}\p{N}_]{1,40})$/u);
  const query = match?.[2];
  if (!match || !query) return null;
  return {
    kind: match[1] === "@" ? ("account" as const) : ("hashtag" as const),
    query,
    start: value.length - match[0].trimStart().length,
  };
}

export interface TweetComposerControllerOptions {
  adapter: TweetComposerAdapter;
  enabled?: boolean;
  initialDraft?: Partial<TweetComposerDraft>;
  messages: TweetComposerMessages;
  onPublished?: (result: TweetComposerPublishResult) => void;
}

export interface TweetComposerViewProps {
  draft: TweetComposerDraft;
  config: TweetComposerConfig | null;
  configLoading: boolean;
  count: number;
  dirty: boolean;
  submitting: boolean;
  error: string;
  suggestions: TweetComposerSuggestion[];
  suggestionsLoading: boolean;
  suggestionError: string;
  emojis: TweetComposerEmoji[];
  emojisLoading: boolean;
  emojiOpen: boolean;
  canSubmit: boolean;
  onTextChange(value: string): void;
  onSensitiveChange(value: boolean): void;
  onSpoilerTextChange(value: string): void;
  onVisibilityChange(value: TweetComposerVisibility): void;
  onLanguageChange(value: string): void;
  onFiles(files: FileList | File[]): void;
  onRemoveMedia(localId: string): void;
  onMediaDescriptionChange(localId: string, value: string): void;
  onPollToggle(): void;
  onPollOptionChange(index: number, value: string): void;
  onPollOptionAdd(): void;
  onPollOptionRemove(index: number): void;
  onPollMultipleChange(value: boolean): void;
  onPollDurationChange(value: number): void;
  onSuggestionSelect(value: string): void;
  onEmojiToggle(): void;
  onEmojiSelect(shortcode: string): void;
  onRetryConfig(): void;
  onSubmit(event?: FormEvent<HTMLFormElement>): void;
}

export function useTweetComposerController({
  adapter,
  enabled = true,
  initialDraft,
  messages,
  onPublished,
}: TweetComposerControllerOptions) {
  const baseline = useMemo(() => initialComposerDraft(initialDraft), [initialDraft]);
  const [draft, setDraft] = useState<TweetComposerDraft>(baseline);
  const [config, setConfig] = useState<TweetComposerConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<TweetComposerSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [emojis, setEmojis] = useState<TweetComposerEmoji[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const configRevision = useRef(0);
  const idempotency = useRef({ signature: "", key: "" });
  const cleanSignature = useRef(draftSignature(baseline));
  const activeUploads = useRef(new Map<string, AbortController>());
  const publishAbort = useRef<AbortController | null>(null);

  const loadConfig = useCallback(() => {
    const controller = new AbortController();
    const revision = configRevision.current + 1;
    configRevision.current = revision;
    setConfigLoading(true);
    setError("");
    void adapter
      .loadConfig(controller.signal)
      .then((next) => {
        if (configRevision.current !== revision) return;
        setConfig(next);
        setDraft((current) => {
          const currentSignature = draftSignature(current);
          const resolved = {
            ...current,
            language: current.language || next.defaultLanguage,
            visibility: current.visibility || next.defaultVisibility,
          };
          if (currentSignature === cleanSignature.current) {
            cleanSignature.current = draftSignature(resolved);
          }
          return resolved;
        });
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || configRevision.current !== revision) return;
        setConfig(null);
        setError(errorMessage(loadError, messages, "configFailed"));
      })
      .finally(() => {
        if (configRevision.current === revision) setConfigLoading(false);
      });
    return controller;
  }, [adapter, messages]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = loadConfig();
    return () => controller.abort();
  }, [enabled, loadConfig]);

  useEffect(() => () => {
    activeUploads.current.forEach((controller) => controller.abort());
    publishAbort.current?.abort();
  }, []);

  const suggestionToken = useMemo(() => trailingSuggestion(draft.text), [draft.text]);
  useEffect(() => {
    if (!suggestionToken) {
      setSuggestions([]);
      setSuggestionError("");
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSuggestionsLoading(true);
      setSuggestionError("");
      void adapter
        .searchSuggestions(
          suggestionToken.query,
          suggestionToken.kind,
          controller.signal,
        )
        .then(setSuggestions)
        .catch((searchError: unknown) => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSuggestionError(errorMessage(searchError, messages, "suggestionsFailed"));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSuggestionsLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [adapter, messages, suggestionToken]);

  const count = adapter.countCharacters(draft.text);
  const signature = draftSignature(draft);
  const dirty = signature !== cleanSignature.current;
  const readyMedia = draft.media.filter((media) => media.state === "ready" && media.id);
  const pollHasContent = Boolean(draft.poll?.options.some((option) => option.trim()));
  const hasContent = Boolean(draft.text.trim() || readyMedia.length || pollHasContent);
  const pollComplete = draft.poll
    ? draft.poll.options.filter((option) => option.trim()).length >= (config?.pollMinOptions ?? 2)
    : true;
  const canSubmit = Boolean(
    config &&
      !configLoading &&
      !submitting &&
      hasContent &&
      count <= config.maxCharacters &&
      draft.media.every((media) => media.state === "ready") &&
      pollComplete &&
      !(draft.poll && draft.media.length),
  );

  const changeDraft = useCallback((updater: (current: TweetComposerDraft) => TweetComposerDraft) => {
    setError("");
    setDraft(updater);
  }, []);

  const onFiles = useCallback((input: FileList | File[]) => {
    const files = Array.from(input);
    if (!config || files.length === 0) return;
    if (draft.poll) {
      setError(messages.pollAndMediaConflict);
      return;
    }
    const capacity = Math.max(0, config.maxMediaAttachments - draft.media.length);
    if (files.length > capacity) {
      setError(formatMessage(messages.mediaCount, { count: config.maxMediaAttachments }));
    }
    files.slice(0, capacity).forEach((file) => {
      const localId = `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      if (file.size > config.maxMediaBytes) {
        setError(messages.mediaTooLarge);
        return;
      }
      const placeholder: TweetComposerMediaDraft = {
        localId,
        id: "",
        type: file.type,
        url: "",
        previewUrl: URL.createObjectURL(file),
        description: "",
        fileName: file.name,
        progress: 0,
        state: "uploading",
      };
      setDraft((current) => ({ ...current, media: [...current.media, placeholder] }));
      const controller = new AbortController();
      activeUploads.current.set(localId, controller);
      void adapter
        .uploadMedia({
          file,
          description: "",
          signal: controller.signal,
          onProgress(value) {
            setDraft((current) => ({
              ...current,
              media: current.media.map((media) =>
                media.localId === localId
                  ? { ...media, progress: Math.max(0, Math.min(100, value)) }
                  : media,
              ),
            }));
          },
        })
        .then((uploaded) => {
          setDraft((current) => ({
            ...current,
            media: current.media.map((media) =>
              media.localId === localId
                ? {
                    ...media,
                    ...uploaded,
                    description: uploaded.description ?? media.description,
                    progress: 100,
                    state: "ready",
                    error: undefined,
                  }
                : media,
            ),
          }));
        })
        .catch((uploadError: unknown) => {
          if (controller.signal.aborted) return;
          setDraft((current) => ({
            ...current,
            media: current.media.map((media) =>
              media.localId === localId
                ? {
                    ...media,
                    state: "failed",
                    error: errorMessage(uploadError, messages, "mediaUploadFailed"),
                  }
                : media,
            ),
          }));
        })
        .finally(() => activeUploads.current.delete(localId));
    });
  }, [adapter, config, draft.media.length, draft.poll, messages]);

  const onRemoveMedia = useCallback((localId: string) => {
    activeUploads.current.get(localId)?.abort();
    activeUploads.current.delete(localId);
    setDraft((current) => {
      const media = current.media.find((item) => item.localId === localId);
      if (media?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(media.previewUrl);
      return { ...current, media: current.media.filter((item) => item.localId !== localId) };
    });
  }, []);

  const onEmojiToggle = useCallback(() => {
    setEmojiOpen((open) => !open);
    if (emojis.length || emojisLoading) return;
    const controller = new AbortController();
    setEmojisLoading(true);
    void adapter
      .loadEmojis(controller.signal)
      .then(setEmojis)
      .catch((loadError: unknown) => setError(errorMessage(loadError, messages, "configFailed")))
      .finally(() => setEmojisLoading(false));
  }, [adapter, emojis.length, emojisLoading, messages]);

  const onSubmit = useCallback((event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!config) {
      setError(messages.configFailed);
      return;
    }
    if (!hasContent) {
      setError(messages.empty);
      return;
    }
    if (count > config.maxCharacters) {
      setError(messages.overLimit);
      return;
    }
    if (draft.poll && draft.media.length) {
      setError(messages.pollAndMediaConflict);
      return;
    }
    if (!canSubmit) return;

    const currentSignature = draftSignature(draft);
    if (idempotency.current.signature !== currentSignature) {
      idempotency.current = {
        signature: currentSignature,
        key: newIdempotencyKey(),
      };
    }
    const controller = new AbortController();
    publishAbort.current = controller;
    setSubmitting(true);
    setError("");
    void (async () => {
      for (const media of readyMedia) {
        await adapter.updateMediaDescription(
          media.id,
          media.description ?? "",
          controller.signal,
        );
      }
      return adapter.publish({
        text: draft.text,
        sensitive: draft.sensitive,
        spoilerText: draft.sensitive ? draft.spoilerText : "",
        visibility: draft.visibility,
        language: draft.language,
        mediaIds: readyMedia.map((media) => media.id),
        poll: draft.poll,
        inReplyToId: draft.inReplyToId,
        quotedStatusId: draft.quotedStatusId,
        editStatusId: draft.editStatusId,
        idempotencyKey: idempotency.current.key,
      }, controller.signal);
    })()
      .then((result) => {
        idempotency.current = { signature: "", key: "" };
        const resetDraft = initialComposerDraft({
          visibility: config.defaultVisibility,
          language: config.defaultLanguage,
        });
        cleanSignature.current = draftSignature(resetDraft);
        setDraft(resetDraft);
        onPublished?.(result);
      })
      .catch((publishError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(publishError, messages, "publishFailed"));
        }
      })
      .finally(() => {
        if (publishAbort.current === controller) publishAbort.current = null;
        setSubmitting(false);
      });
  }, [adapter, canSubmit, config, count, draft, hasContent, messages, onPublished, readyMedia]);

  const composerProps: TweetComposerViewProps = {
    draft,
    config,
    configLoading,
    count,
    dirty,
    submitting,
    error,
    suggestions,
    suggestionsLoading,
    suggestionError,
    emojis,
    emojisLoading,
    emojiOpen,
    canSubmit,
    onTextChange: (text) => changeDraft((current) => ({ ...current, text })),
    onSensitiveChange: (sensitive) => changeDraft((current) => ({ ...current, sensitive })),
    onSpoilerTextChange: (spoilerText) => changeDraft((current) => ({ ...current, spoilerText })),
    onVisibilityChange: (visibility) => changeDraft((current) => ({ ...current, visibility })),
    onLanguageChange: (language) => changeDraft((current) => ({ ...current, language })),
    onFiles,
    onRemoveMedia,
    onMediaDescriptionChange: (localId, description) => changeDraft((current) => ({
      ...current,
      media: current.media.map((media) => media.localId === localId ? { ...media, description } : media),
    })),
    onPollToggle: () => changeDraft((current) => {
      if (current.poll) return { ...current, poll: null };
      if (current.media.length) {
        setError(messages.pollAndMediaConflict);
        return current;
      }
      return {
        ...current,
        poll: {
          options: Array.from({ length: Math.max(2, config?.pollMinOptions ?? 2) }, () => ""),
          multiple: false,
          expiresIn: config?.pollDurations[0] ?? 86_400,
        },
      };
    }),
    onPollOptionChange: (index, value) => changeDraft((current) => current.poll ? {
      ...current,
      poll: { ...current.poll, options: current.poll.options.map((option, optionIndex) => optionIndex === index ? value : option) },
    } : current),
    onPollOptionAdd: () => changeDraft((current) => current.poll ? {
      ...current,
      poll: { ...current.poll, options: [...current.poll.options, ""] },
    } : current),
    onPollOptionRemove: (index) => changeDraft((current) => current.poll ? {
      ...current,
      poll: { ...current.poll, options: current.poll.options.filter((_, optionIndex) => optionIndex !== index) },
    } : current),
    onPollMultipleChange: (multiple) => changeDraft((current) => current.poll ? {
      ...current,
      poll: { ...current.poll, multiple },
    } : current),
    onPollDurationChange: (expiresIn) => changeDraft((current) => current.poll ? {
      ...current,
      poll: { ...current.poll, expiresIn },
    } : current),
    onSuggestionSelect: (value) => changeDraft((current) => {
      const token = trailingSuggestion(current.text);
      if (!token) return current;
      return { ...current, text: `${current.text.slice(0, token.start)}${value} ` };
    }),
    onEmojiToggle,
    onEmojiSelect: (shortcode) => {
      changeDraft((current) => ({ ...current, text: `${current.text}:${shortcode}:` }));
      setEmojiOpen(false);
    },
    onRetryConfig: () => {
      loadConfig();
    },
    onSubmit,
  };

  return {
    composerProps,
    dirty,
    removeQuote: () => changeDraft((current) => ({ ...current, quotedStatusId: undefined })),
  };
}

export interface TweetComposerContext {
  displayName: string;
  avatarUrl?: string | null;
  content: string;
}

export interface RinspaceTweetComposerProps extends TweetComposerViewProps {
  account: {
    displayName: string;
    avatarUrl?: string | null;
  };
  messages: TweetComposerMessages;
  autoFocus?: boolean;
  className?: string;
  hidden?: boolean;
  quoteContext?: TweetComposerContext;
  replyContext?: TweetComposerContext;
  role?: string;
  style?: CSSProperties;
  textareaId?: string;
  onRemoveQuote?: () => void;
  onRequestClose?: () => void;
  onRequestMinimize?: () => void;
}

function ComposerIcon({ children }: { children: ReactNode }) {
  return <span aria-hidden="true" className="rin-tweet-composer__icon">{children}</span>;
}

function ComposerButton({ children, ...props }: HTMLMotionProps<"button">) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.975, y: 0 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

function durationLabel(seconds: number, messages: TweetComposerMessages) {
  if (seconds % 86_400 === 0) return formatMessage(messages.durationDays, { count: seconds / 86_400 });
  if (seconds % 3_600 === 0) return formatMessage(messages.durationHours, { count: seconds / 3_600 });
  return formatMessage(messages.durationMinutes, { count: Math.round(seconds / 60) });
}

export function RinspaceTweetComposer({
  account,
  messages,
  autoFocus = false,
  className = "",
  hidden = false,
  quoteContext,
  replyContext,
  role = "dialog",
  style,
  textareaId,
  onRemoveQuote,
  onRequestClose,
  onRequestMinimize,
  ...controller
}: RinspaceTweetComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const classes = `rin-tweet-composer ${className}`.trim();
  const config = controller.config;
  const overLimit = Boolean(config && controller.count > config.maxCharacters);
  const poll = controller.draft.poll;

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) controller.onFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };

  return (
    <form
      className={classes}
      hidden={hidden}
      role={role}
      style={style}
      aria-label={messages.title}
      onSubmit={controller.onSubmit}
    >
      <header className="rin-tweet-composer__header">
        <div className="rin-tweet-composer__identity">
          {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>{account.displayName.slice(0, 1)}</span>}
          <h2>{messages.title}</h2>
        </div>
        <div className="rin-tweet-composer__window-actions">
          {onRequestMinimize ? (
            <ComposerButton type="button" className="rin-tweet-composer__icon-button" aria-label={messages.minimize} onClick={onRequestMinimize}>−</ComposerButton>
          ) : null}
          {onRequestClose ? (
            <ComposerButton type="button" className="rin-tweet-composer__icon-button" aria-label={messages.close} onClick={onRequestClose}>×</ComposerButton>
          ) : null}
        </div>
      </header>

      {replyContext ? (
        <aside className="rin-tweet-composer__context">
          <strong>{formatMessage(messages.replyTo, { name: replyContext.displayName })}</strong>
          <span>{replyContext.content}</span>
        </aside>
      ) : null}
      {quoteContext ? (
        <aside className="rin-tweet-composer__context rin-tweet-composer__context--quote">
          <div><strong>{formatMessage(messages.quoting, { name: quoteContext.displayName })}</strong><span>{quoteContext.content}</span></div>
          {onRemoveQuote ? <ComposerButton type="button" onClick={onRemoveQuote}>{messages.removeQuote}</ComposerButton> : null}
        </aside>
      ) : null}

      {controller.configLoading ? <p className="rin-tweet-composer__state">{messages.loading}</p> : null}
      {!controller.configLoading && !config ? (
        <p className="rin-tweet-composer__state rin-tweet-composer__state--error">
          <span>{controller.error || messages.configFailed}</span>
          <ComposerButton type="button" onClick={controller.onRetryConfig}>{messages.retry}</ComposerButton>
        </p>
      ) : null}

      {config ? (
        <>
          <div className="rin-tweet-composer__settings">
            <label>
              <span>{messages.visibility}</span>
              <select value={controller.draft.visibility} onChange={(event) => controller.onVisibilityChange(event.currentTarget.value as TweetComposerVisibility)}>
                <option value="public">{messages.visibilityPublic}</option>
                <option value="unlisted">{messages.visibilityUnlisted}</option>
                <option value="private">{messages.visibilityPrivate}</option>
                <option value="direct">{messages.visibilityDirect}</option>
              </select>
            </label>
            <label>
              <span>{messages.language}</span>
              <select value={controller.draft.language} onChange={(event) => controller.onLanguageChange(event.currentTarget.value)}>
                {config.languages.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
              </select>
            </label>
            <label className="rin-tweet-composer__toggle">
              <input type="checkbox" checked={controller.draft.sensitive} onChange={(event) => controller.onSensitiveChange(event.currentTarget.checked)} />
              <span>{messages.contentWarning}</span>
            </label>
          </div>

          {controller.draft.sensitive ? (
            <input
              className="rin-tweet-composer__spoiler"
              value={controller.draft.spoilerText}
              placeholder={messages.contentWarningPlaceholder}
              onChange={(event) => controller.onSpoilerTextChange(event.currentTarget.value)}
            />
          ) : null}

          <div className="rin-tweet-composer__editor">
            <textarea
              id={textareaId}
              value={controller.draft.text}
              placeholder={messages.placeholder}
              rows={6}
              autoFocus={autoFocus}
              onChange={(event) => controller.onTextChange(event.currentTarget.value)}
            />
            {(controller.suggestionsLoading || controller.suggestions.length || controller.suggestionError) ? (
              <div className="rin-tweet-composer__suggestions" role="listbox">
                {controller.suggestionsLoading ? <span>{messages.loading}</span> : null}
                {controller.suggestionError ? <span>{controller.suggestionError}</span> : null}
                {controller.suggestions.map((suggestion) => (
                  <ComposerButton key={`${suggestion.kind}-${suggestion.id}`} type="button" role="option" aria-selected="false" onClick={() => controller.onSuggestionSelect(suggestion.value)}>
                    {suggestion.avatarUrl ? <img src={suggestion.avatarUrl} alt="" /> : null}
                    <span><strong>{suggestion.label}</strong><small>{suggestion.value}</small></span>
                  </ComposerButton>
                ))}
              </div>
            ) : null}
          </div>

          {controller.draft.media.length ? (
            <div className="rin-tweet-composer__media-grid">
              {controller.draft.media.map((media) => (
                <article key={media.localId} className="rin-tweet-composer__media">
                  {(media.type === "image" || media.type.startsWith("image/")) && media.previewUrl ? <img src={media.previewUrl} alt="" /> : <div className="rin-tweet-composer__media-kind">{media.type || media.fileName}</div>}
                  <label>
                    <span>{messages.altText}</span>
                    <input value={media.description ?? ""} disabled={media.state !== "ready"} onChange={(event) => controller.onMediaDescriptionChange(media.localId, event.currentTarget.value)} />
                  </label>
                  {media.state === "uploading" ? <progress max="100" value={media.progress}>{media.progress}%</progress> : null}
                  {media.error ? <span className="rin-tweet-composer__inline-error">{media.error}</span> : null}
                  <ComposerButton type="button" onClick={() => controller.onRemoveMedia(media.localId)}>{messages.removeMedia}</ComposerButton>
                </article>
              ))}
            </div>
          ) : null}

          {poll ? (
            <fieldset className="rin-tweet-composer__poll">
              {poll.options.map((option, index) => (
                <div key={`poll-${index}`}>
                  <input
                    value={option}
                    maxLength={config.pollMaxOptionCharacters}
                    aria-label={formatMessage(messages.pollOption, { index: index + 1 })}
                    placeholder={formatMessage(messages.pollOption, { index: index + 1 })}
                    onChange={(event) => controller.onPollOptionChange(index, event.currentTarget.value)}
                  />
                  {poll.options.length > config.pollMinOptions ? (
                    <ComposerButton type="button" aria-label={formatMessage(messages.removePollOption, { index: index + 1 })} onClick={() => controller.onPollOptionRemove(index)}>×</ComposerButton>
                  ) : null}
                </div>
              ))}
              <div className="rin-tweet-composer__poll-settings">
                <ComposerButton type="button" disabled={poll.options.length >= config.pollMaxOptions} onClick={controller.onPollOptionAdd}>{messages.addPollOption}</ComposerButton>
                <label><input type="checkbox" checked={poll.multiple} onChange={(event) => controller.onPollMultipleChange(event.currentTarget.checked)} /> {messages.multipleChoice}</label>
                <label>
                  <span>{messages.pollDuration}</span>
                  <select value={poll.expiresIn} onChange={(event) => controller.onPollDurationChange(Number(event.currentTarget.value))}>
                    {config.pollDurations.map((duration) => <option key={duration} value={duration}>{durationLabel(duration, messages)}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>
          ) : null}

          <footer className="rin-tweet-composer__footer">
            <div className="rin-tweet-composer__tools">
              <input ref={fileInputRef} hidden type="file" multiple accept={config.acceptedMediaTypes.join(",")} onChange={selectFiles} />
              <ComposerButton type="button" aria-label={messages.addMedia} title={messages.addMedia} disabled={Boolean(poll) || controller.draft.media.length >= config.maxMediaAttachments} onClick={() => fileInputRef.current?.click()}><ComposerIcon>▧</ComposerIcon><span>{messages.addMedia}</span></ComposerButton>
              <ComposerButton type="button" aria-label={poll ? messages.removePoll : messages.addPoll} title={poll ? messages.removePoll : messages.addPoll} disabled={controller.draft.media.length > 0} onClick={controller.onPollToggle}><ComposerIcon>☷</ComposerIcon><span>{poll ? messages.removePoll : messages.addPoll}</span></ComposerButton>
              <ComposerButton type="button" aria-label={messages.addEmoji} title={messages.addEmoji} onClick={controller.onEmojiToggle}><ComposerIcon>☺</ComposerIcon><span>{messages.addEmoji}</span></ComposerButton>
            </div>
            <div className="rin-tweet-composer__submit-row">
              <output className={overLimit ? "rin-tweet-composer__count rin-tweet-composer__count--over" : "rin-tweet-composer__count"}>{controller.count} / {config.maxCharacters}</output>
              <ComposerButton className="rin-tweet-composer__submit" type="submit" disabled={!controller.canSubmit}>{controller.submitting ? messages.publishing : controller.draft.editStatusId ? messages.save : messages.publish}</ComposerButton>
            </div>
          </footer>

          {controller.emojiOpen ? (
            <div className="rin-tweet-composer__emoji-picker">
              {controller.emojisLoading ? <span>{messages.loading}</span> : null}
              {controller.emojis.map((emoji) => <ComposerButton key={emoji.shortcode} type="button" title={`:${emoji.shortcode}:`} onClick={() => controller.onEmojiSelect(emoji.shortcode)}><img src={emoji.staticUrl || emoji.url} alt={`:${emoji.shortcode}:`} /></ComposerButton>)}
            </div>
          ) : null}
          {controller.error ? <p className="rin-tweet-composer__error" role="alert">{controller.error}</p> : null}
        </>
      ) : null}
    </form>
  );
}
