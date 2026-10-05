import { publicEnv } from "app/config/env";
import {
  authHeaders as sessionAuthHeaders,
  getAuthAccessToken,
  hasAuthSession,
} from "./phoneAuth";

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
    readonly code: string = `http.${status}`,
    readonly diagnosticDetail: string = message,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export type RequestOptions = Omit<RequestInit, "body" | "headers"> & {
  auth?: "none" | "optional" | "required";
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
};
export function apiPath(pathname: string) {
  return `${publicEnv.publicBasePath || ""}/api/${pathname.replace(/^\/+/, "")}`;
}
export function adminApiPath(pathname: string) {
  return `${publicEnv.publicBasePath || ""}/admin/api/${pathname.replace(/^\/+/, "")}`;
}

export async function requestJson<T>(
  pathname: string,
  options: RequestOptions = {},
): Promise<T> {
  return requestJsonURL<T>(apiPath(pathname), options);
}

export async function requestAdminJson<T>(
  pathname: string,
  options: RequestOptions = {},
): Promise<T> {
  return requestJsonURL<T>(adminApiPath(pathname), options);
}

function serviceErrorData(payload: unknown, text: string, status: number) {
  let code = `http.${status}`;
  let message = text || `Request failed (${status})`;
  if (payload && typeof payload === "object") {
    if ("code" in payload && typeof payload.code === "string")
      code = payload.code;
    if ("message" in payload && typeof payload.message === "string")
      message = payload.message;
    if (
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object"
    ) {
      if ("code" in payload.error && typeof payload.error.code === "string")
        code = payload.error.code;
      if (
        "message" in payload.error &&
        typeof payload.error.message === "string"
      )
        message = payload.error.message;
    }
  }
  return { code, message };
}

async function requestJsonURL<T>(
  pathname: string,
  options: RequestOptions,
): Promise<T> {
  const url = new URL(pathname, window.location.origin);
  for (const [key, value] of Object.entries(options.query || {}))
    if (value !== undefined && value !== null)
      url.searchParams.set(key, String(value));
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined)
    headers["Content-Type"] ||= "application/json";
  if (options.auth && options.auth !== "none") {
    let token = "";
    try {
      token = await getAuthAccessToken();
    } catch (error) {
      if (options.auth === "required") throw error;
    }
    Object.assign(headers, sessionAuthHeaders(token));
    if (!token && options.auth === "required" && !hasAuthSession())
      throw new ServiceError(
        "Authentication required",
        401,
        null,
        "authentication.required",
      );
  }
  const response = await fetch(url.pathname + url.search, {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "include",
    headers,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const error = serviceErrorData(payload, text, response.status);
    throw new ServiceError(error.message, response.status, payload, error.code);
  }
  return payload as T;
}
