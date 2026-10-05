import { publicEnv } from "@/app/config/env";
import {
  TweetComposerError,
  type TweetComposerAdapter,
  type TweetComposerConfig,
  type TweetComposerEmoji,
  type TweetComposerPublishInput,
  type TweetComposerPublishResult,
  type TweetComposerSuggestion,
  type TweetComposerUploadedMedia,
  type TweetComposerVisibility,
} from "@/components/shared/RinspaceTweetComposer";
import {
  authHeaders as sessionAuthHeaders,
  getAuthAccessToken,
  hasAuthSession,
} from "@/services/phoneAuth";

const socialBase = `${publicEnv.publicBasePath || ""}/api/social`;
export const tweetPublishedEvent = "rinspace:tweet-published";

type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    correlationId?: string;
  };
};

export interface MastodonStatusMedia extends TweetComposerUploadedMedia {}

export interface MastodonStatusSummary {
  id: string;
  url: string;
  content: string;
  spoilerText: string;
  visibility: TweetComposerVisibility;
  language: string | null;
  createdAt: string;
  repliesCount: number;
  reblogsCount: number;
  favouritesCount: number;
  media: MastodonStatusMedia[];
}

export interface MastodonStatusPage {
  accountId: string;
  items: MastodonStatusSummary[];
  nextMaxId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function errorFromPayload(response: Response, value: unknown) {
  const payload = isRecord(value) ? (value as ErrorPayload) : null;
  const code = payload?.error?.code || `social.http_${response.status}`;
  const message = payload?.error?.message || code;
  return new TweetComposerError(
    code,
    message,
    payload?.error?.retryable === true || response.status >= 500,
  );
}

async function parseJSON(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  if (!response.ok) throw errorFromPayload(response, payload);
  return payload;
}

async function authHeaders(contentType?: string) {
  const token = await getAuthAccessToken();
  if (!token && !hasAuthSession()) {
    throw new TweetComposerError(
      "authentication.required",
      "authentication.required",
      false,
    );
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...sessionAuthHeaders(token),
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

function parseConfig(value: unknown): TweetComposerConfig {
  if (!isRecord(value)) {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  const languages = Array.isArray(value.languages)
    ? value.languages.flatMap((item) => {
        if (!isRecord(item)) return [];
        const code = stringValue(item.code);
        const label = stringValue(item.label);
        return code && label ? [{ code, label }] : [];
      })
    : [];
  const defaultVisibility = stringValue(value.defaultVisibility);
  if (
    !["public", "unlisted", "private", "direct"].includes(defaultVisibility) ||
    numberValue(value.maxCharacters) <= 0 ||
    numberValue(value.maxMediaAttachments) <= 0
  ) {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  return {
    maxCharacters: numberValue(value.maxCharacters),
    maxMediaAttachments: numberValue(value.maxMediaAttachments),
    maxMediaBytes: numberValue(value.maxMediaBytes),
    acceptedMediaTypes: stringArray(value.acceptedMediaTypes),
    pollMinOptions: numberValue(value.pollMinOptions),
    pollMaxOptions: numberValue(value.pollMaxOptions),
    pollMaxOptionCharacters: numberValue(value.pollMaxOptionCharacters),
    pollDurations: Array.isArray(value.pollDurations)
      ? value.pollDurations.filter(
          (item): item is number =>
            typeof item === "number" && Number.isFinite(item),
        )
      : [],
    languages,
    defaultLanguage: stringValue(value.defaultLanguage),
    defaultVisibility: defaultVisibility as TweetComposerVisibility,
  };
}

function parseEmoji(value: unknown): TweetComposerEmoji | null {
  if (!isRecord(value)) return null;
  const shortcode = stringValue(value.shortcode);
  const url = stringValue(value.url);
  const staticUrl = stringValue(value.staticUrl);
  if (!shortcode || !url || !staticUrl) return null;
  return {
    shortcode,
    url,
    staticUrl,
    category: stringValue(value.category) || undefined,
  };
}

function parseSuggestion(value: unknown): TweetComposerSuggestion | null {
  if (!isRecord(value)) return null;
  const kind = stringValue(value.kind);
  const id = stringValue(value.id);
  const label = stringValue(value.label);
  const suggestionValue = stringValue(value.value);
  if (
    (kind !== "account" && kind !== "hashtag") ||
    !id ||
    !label ||
    !suggestionValue
  )
    return null;
  return {
    id,
    kind,
    label,
    value: suggestionValue,
    avatarUrl: stringValue(value.avatarUrl) || undefined,
  };
}

function parseMedia(value: unknown): TweetComposerUploadedMedia {
  if (!isRecord(value)) {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  const id = stringValue(value.id);
  const type = stringValue(value.type);
  const url = stringValue(value.url);
  const previewUrl = stringValue(value.previewUrl);
  if (!id || !type || !url || !previewUrl) {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  return {
    id,
    type,
    url,
    previewUrl,
    description: stringValue(value.description),
  };
}

function parsePublishResult(value: unknown): TweetComposerPublishResult {
  if (!isRecord(value)) {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  const result = {
    id: stringValue(value.id),
    url: stringValue(value.url),
    createdAt: stringValue(value.createdAt),
  };
  if (!result.id || !result.url || !result.createdAt) {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  return result;
}

function parseStatusPage(value: unknown): MastodonStatusPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new TweetComposerError(
      "social.invalid_response",
      "social.invalid_response",
      true,
    );
  }
  const items = value.items.flatMap((item): MastodonStatusSummary[] => {
    if (!isRecord(item)) return [];
    const id = stringValue(item.id);
    const url = stringValue(item.url);
    const visibility = stringValue(item.visibility);
    if (
      !id ||
      !url ||
      !["public", "unlisted", "private", "direct"].includes(visibility)
    )
      return [];
    const media = Array.isArray(item.media)
      ? item.media.flatMap((candidate) => {
          try {
            return [parseMedia(candidate)];
          } catch {
            return [];
          }
        })
      : [];
    return [
      {
        id,
        url,
        content: stringValue(item.content),
        spoilerText: stringValue(item.spoilerText),
        visibility: visibility as TweetComposerVisibility,
        language: typeof item.language === "string" ? item.language : null,
        createdAt: stringValue(item.createdAt),
        repliesCount: numberValue(item.repliesCount),
        reblogsCount: numberValue(item.reblogsCount),
        favouritesCount: numberValue(item.favouritesCount),
        media,
      },
    ];
  });
  return {
    accountId: stringValue(value.accountId),
    items,
    nextMaxId: typeof value.nextMaxId === "string" ? value.nextMaxId : null,
  };
}

export function createOuterTweetComposerAdapter(): TweetComposerAdapter {
  const adapter: TweetComposerAdapter = {
    countCharacters(value: string) {
      return Array.from(value).length;
    },
    async loadConfig(signal?: AbortSignal) {
      const response = await fetch(`${socialBase}/tweet-composer/config`, {
        signal,
        headers: await authHeaders(),
      });
      return parseConfig(await parseJSON(response));
    },
    async loadEmojis(signal: AbortSignal) {
      const response = await fetch(`${socialBase}/tweet-composer/emojis`, {
        signal,
        headers: await authHeaders(),
      });
      const payload = await parseJSON(response);
      if (!Array.isArray(payload)) {
        throw new TweetComposerError(
          "social.invalid_response",
          "social.invalid_response",
          true,
        );
      }
      return payload
        .map(parseEmoji)
        .filter((item): item is TweetComposerEmoji => item !== null);
    },
    async searchSuggestions(query, kind, signal) {
      const params = new URLSearchParams({ q: query, type: kind });
      const response = await fetch(
        `${socialBase}/tweet-composer/suggestions?${params.toString()}`,
        {
          signal,
          headers: await authHeaders(),
        },
      );
      const payload = await parseJSON(response);
      if (!Array.isArray(payload)) {
        throw new TweetComposerError(
          "social.invalid_response",
          "social.invalid_response",
          true,
        );
      }
      return payload
        .map(parseSuggestion)
        .filter((item): item is TweetComposerSuggestion => item !== null);
    },
    async uploadMedia({ file, description, signal, onProgress }) {
      const body = new FormData();
      body.append("file", file);
      body.append("description", description);
      onProgress(5);
      const response = await fetch(`${socialBase}/tweet-composer/media`, {
        method: "POST",
        signal,
        headers: await authHeaders(),
        body,
      });
      const media = parseMedia(await parseJSON(response));
      onProgress(100);
      return media;
    },
    async updateMediaDescription(mediaId, description, signal) {
      const response = await fetch(
        `${socialBase}/tweet-composer/media/${encodeURIComponent(mediaId)}`,
        {
          method: "PUT",
          signal,
          headers: await authHeaders("application/json"),
          body: JSON.stringify({ description }),
        },
      );
      parseMedia(await parseJSON(response));
    },
    async publish(input: TweetComposerPublishInput, signal: AbortSignal) {
      const response = await fetch(`${socialBase}/tweet-composer/statuses`, {
        method: "POST",
        signal,
        headers: {
          ...(await authHeaders("application/json")),
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify(input),
      });
      return parsePublishResult(await parseJSON(response));
    },
  };
  return Object.freeze(adapter);
}

export async function loadMastodonAccountStatuses(
  publicUserId: string,
  maxId?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (maxId) params.set("max_id", maxId);
  const query = params.toString();
  const response = await fetch(
    `${socialBase}/accounts/${encodeURIComponent(publicUserId)}/statuses${query ? `?${query}` : ""}`,
    { signal, headers: { Accept: "application/json" } },
  );
  return parseStatusPage(await parseJSON(response));
}
