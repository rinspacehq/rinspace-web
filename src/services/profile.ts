import { publicEnv } from "@/app/config/env";
import {
  authHeaders as sessionAuthHeaders,
  getAuthAccessToken,
  getCurrentAuthUser,
} from "./phoneAuth";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const profileEndpoint = `${publicEnv.publicBasePath || ""}/api/profile`;
const fileUploadEndpoint = `${publicEnv.publicBasePath || ""}/api/file`;

type ProfileResponse = {
  uid?: string;
  nickname?: string;
  avatarDataUrl?: string;
  coverUrl?: string;
  bio?: string;
  website?: string;
  location?: string;
  aboutHtml?: string;
  updatedAt?: string;
  createdAt?: string;
};

type UploadedAvatar = {
  fileID: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function responseMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (isRecord(payload) && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}

async function requestProfile(
  method: "GET" | "POST",
  body: Record<string, unknown> | null = null,
) {
  const accessToken = await getAuthAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...sessionAuthHeaders(accessToken),
  };

  const response = await fetch(profileEndpoint, {
    method,
    credentials: "same-origin",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = parseJson(await response.text());
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(responseMessage(payload, "资料保存失败，请稍后重试。"));
  }
  if (!isRecord(payload)) {
    throw new Error("资料返回格式异常。");
  }
  return payload as ProfileResponse;
}

export function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "操作失败，请稍后重试。";
}

export function normalizePhone(phone: string) {
  return phone.replace(/\s+/g, "");
}

export function isMainlandPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(normalizePhone(phone));
}

export async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function getCurrentUser() {
  return getCurrentAuthUser();
}

export async function loadProfile(user: { id?: string }) {
  if (!user.id) throw new Error("当前用户缺少 uid。");
  return requestProfile("GET");
}

export async function saveProfile(
  user: { id?: string },
  profile: {
    username: string;
    nickname: string;
    avatarDataUrl: string;
    coverUrl?: string;
    bio?: string;
    website?: string;
    location?: string;
    aboutHtml?: string;
  },
) {
  if (!user.id) throw new Error("当前用户缺少 uid。");

  const nickname = profile.nickname.trim();
  if (nickname.length < 2 || nickname.length > 24) {
    throw new Error("昵称需要 2 到 24 个字符。");
  }
  const username = profile.username.trim().replace(/^@+/, "");

  return requestProfile("POST", {
    username,
    nickname,
    avatarDataUrl: profile.avatarDataUrl,
    coverUrl: profile.coverUrl || "",
    bio: profile.bio,
    website: profile.website,
    location: profile.location,
    aboutHtml: profile.aboutHtml,
  });
}

function validateAvatarFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("头像图片不能超过 2MB。");
  }
}

async function uploadProfileImageFile(
  user: { id?: string },
  file: File,
  source: "avatar" | "cover",
): Promise<UploadedAvatar> {
  if (!user.id) throw new Error("当前用户缺少 uid。");
  validateAvatarFile(file);

  const accessToken = await getAuthAccessToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...sessionAuthHeaders(accessToken),
  };

  const body = new FormData();
  body.set("source", source);
  body.set("file", file);
  const uploadResponse = await fetch(fileUploadEndpoint, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body,
  });
  const payload = parseJson(await uploadResponse.text());
  if (!uploadResponse.ok) {
    throw new Error(
      responseMessage(
        payload,
        source === "cover" ? "封面上传失败。" : "头像上传失败。",
      ),
    );
  }
  if (typeof payload !== "string" || !payload.startsWith("https://")) {
    throw new Error(
      source === "cover"
        ? "封面上传失败：缺少公开图片地址。"
        : "头像上传失败：缺少公开头像地址。",
    );
  }

  return {
    fileID: payload,
  };
}

export async function uploadAvatarFile(
  user: { id?: string },
  file: File,
): Promise<UploadedAvatar> {
  return uploadProfileImageFile(user, file, "avatar");
}

export async function uploadCoverFile(
  user: { id?: string },
  file: File,
): Promise<UploadedAvatar> {
  return uploadProfileImageFile(user, file, "cover");
}
