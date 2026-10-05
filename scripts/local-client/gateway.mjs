import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { validateHeaderValue } from "node:http";
import { sendProblem } from "./session.mjs";
import { createPayloadGate } from "./payload.mjs";

export const officialOrigin = "https://rinspace.com";
const identityPath = "/api/identity/v1";
const requestHeaderNames = [
  "accept",
  "accept-language",
  "range",
  "if-range",
  "if-none-match",
  "if-modified-since",
];
const responseHeaderNames = [
  "content-type",
  "content-disposition",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "retry-after",
];
const forbiddenQueryKeys = new Set([
  "access_token",
  "refresh_token",
  "authorization",
  "credential",
]);
// Existing private outer-world resources, not the overlapping Mastodon /api/*.
// Explicit resource inventory; this does not claim every feature is verified.
const outerResources = new Set([
  "activity",
  "announcements",
  "answer",
  "badge",
  "badges",
  "book-annotations",
  "book-authors",
  "books",
  "collection",
  "collections",
  "comment",
  "comments",
  "connector",
  "content",
  "diagrams",
  "discussions",
  "embed",
  "feed",
  "file",
  "follow",
  "follows",
  "health",
  "home",
  "knowledge-graph",
  "language",
  "like",
  "meta",
  "notification",
  "notifications",
  "pdf",
  "permission",
  "personal",
  "plugin",
  "profile",
  "question",
  "questions",
  "reasons",
  "report-reasons",
  "reposts",
  "revisions",
  "search",
  "siteinfo",
  "social",
  "sponsor",
  "statuses",
  "tag",
  "tags",
  "user",
  "vote",
  "wiki",
]);

export function localOrigin(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid loopback port.");
  return `http://127.0.0.1:${port}`;
}

export function validLocalRequest(request, origin, websocket = false) {
  const expected = new URL(origin);
  if (request.headers.host !== expected.host) return false;
  if (request.headers.origin !== undefined && request.headers.origin !== origin)
    return false;
  if (websocket && request.headers.origin !== origin) return false;
  const site = request.headers["sec-fetch-site"];
  // The one-shot callback returns from another loopback port. This exception
  // is only a top-level GET of the public home document, never an API/asset,
  // iframe, fetch, write or WebSocket request from a same-site origin.
  if (
    !websocket &&
    site === "same-site" &&
    request.headers.origin === undefined &&
    request.method === "GET" &&
    request.url === "/" &&
    request.headers["sec-fetch-mode"] === "navigate" &&
    request.headers["sec-fetch-dest"] === "document"
  )
    return true;
  return site === undefined || site === "same-origin" || site === "none";
}

function safeRequestURL(raw, origin) {
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /[\\\r\n\0]/.test(raw)
  )
    return null;
  let pathname = raw.split("?")[0];
  // Validate BEFORE URL normalizes dot segments; reject nested path encodings.
  for (let depth = 0; depth < 4; depth += 1) {
    if (
      /[\\\r\n\0#]/.test(pathname) ||
      pathname.split("/").some((part) => part === "." || part === "..")
    )
      return null;
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    if (decoded === pathname) {
      const url = new URL(raw, origin);
      if (
        [...url.searchParams.keys()].some((key) =>
          forbiddenQueryKeys.has(key.toLowerCase()),
        )
      )
        return null;
      return url;
    }
    if (decoded.split("/").length !== pathname.split("/").length) return null;
    pathname = decoded;
  }
  return null;
}

function problem(response, status, code, message) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ code, message }));
}

function officialNavigation(url) {
  return (
    url.pathname === "/git-auth" ||
    /^\/(repos|git)(\/|$)/.test(url.pathname) ||
    (url.pathname === "/" && url.searchParams.get("world") === "inner")
  );
}

/** Legacy name retained for the anonymous foundation and its tests. Writes
 * require the explicitly managed session adapter; never incoming credentials.
 * fetchImpl is a unit-test transport, never an upstream-URL configuration knob.
 */
export function createReadOnlyMiddleware({
  origin,
  fetchImpl = fetch,
  session = null,
}) {
  const expected = new URL(origin);
  if (origin !== localOrigin(Number(expected.port)))
    throw new Error("Only a literal IPv4 loopback origin is supported.");
  const readPayload = createPayloadGate();
  return async function middleware(request, response, next) {
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!validLocalRequest(request, origin)) {
      problem(
        response,
        403,
        "local.origin_rejected",
        "Only this local frontend may access the launcher.",
      );
      return;
    }
    const url = safeRequestURL(request.url, origin);
    if (!url) {
      problem(
        response,
        400,
        "local.path_rejected",
        "Invalid local request path.",
      );
      return;
    }
    if (url.pathname === "/__rinspace_local/status") {
      if (request.method !== "GET") {
        problem(response, 405, "local.method_rejected", "Status is read-only.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(
        JSON.stringify({
          mode: session ? "managed-local-client" : "anonymous-read-only",
          officialOrigin,
          authorizationReady: session?.authorizationAvailable() || false,
          ...(session
            ? { authorizationSupported: true, backendActivationRequired: true }
            : {}),
        }),
      );
      return;
    }
    if (
      session &&
      ["/__rinspace_local/login", "/__rinspace_local/cancel"].includes(
        url.pathname,
      )
    ) {
      await session.handle(request, response, url.pathname, url.search);
      return;
    }
    const read = request.method === "GET" || request.method === "HEAD";
    if (officialNavigation(url)) {
      // A link, not a cookie/SSO/API/streaming proxy for the other runtimes.
      if (
        !read ||
        (request.headers["sec-fetch-mode"] &&
          request.headers["sec-fetch-mode"] !== "navigate")
      ) {
        problem(
          response,
          403,
          "local.navigation_only",
          "Open this service on the official website.",
        );
        return;
      }
      response.writeHead(302, {
        Location: `${officialOrigin}${url.pathname}${url.search}`,
        "Cache-Control": "no-store",
      });
      response.end();
      return;
    }
    let upstreamPath = url.pathname;
    if (upstreamPath.startsWith("/rinspace/api/"))
      upstreamPath = upstreamPath.slice("/rinspace".length);
    const identity = upstreamPath.startsWith(`${identityPath}/`);
    const business =
      upstreamPath.startsWith("/api/") &&
      outerResources.has(upstreamPath.split("/")[2]);
    if (identity || business) {
      if (identity && session) {
        await session.handle(
          request,
          response,
          upstreamPath.slice(identityPath.length),
          url.search,
        );
        return;
      }
      if (!read && !session?.hasSession()) {
        problem(
          response,
          503,
          "local.authorization_not_ready",
          "Local account authorization is not implemented yet. No write was sent to Rinspace.",
        );
        return;
      }
      if (identity && upstreamPath !== `${identityPath}/session`) {
        problem(
          response,
          503,
          "local.authorization_not_ready",
          "Local account authorization is not implemented yet.",
        );
        return;
      }
      const headers = new Headers();
      for (const name of requestHeaderNames) {
        const value = request.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      let payload;
      try {
        if (business && session?.hasSession()) {
          if (
            !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(
              request.method,
            )
          ) {
            problem(
              response,
              405,
              "local.method_rejected",
              "This API method is not enabled.",
            );
            return;
          }
          try {
            headers.set(
              "authorization",
              `Bearer ${await session.authorize(request, !read)}`,
            );
          } catch (error) {
            sendProblem(response, error);
            return;
          }
          if (!read) {
            // Validate local authorization BEFORE reading/forwarding business data.
            // No write retry: uncertainty must not duplicate a real operation.
            try {
              payload = await readPayload(request, upstreamPath);
              // A logout/revocation during a large local upload must not turn
              // buffered data into a request for a different/new local account.
              headers.set(
                "authorization",
                `Bearer ${await session.authorize(request, true)}`,
              );
            } catch (error) {
              if (!response.destroyed) {
                response.setHeader("Connection", "close");
                if (error.code === "local.upload_busy")
                  response.setHeader("Retry-After", "1");
                sendProblem(response, error);
              }
              return;
            }
            if (typeof request.headers["content-type"] === "string")
              headers.set("content-type", request.headers["content-type"]);
          }
        }
        let upstream;
        try {
          upstream = await fetchImpl(
            `${officialOrigin}${upstreamPath}${url.search}`,
            {
              method: request.method,
              headers,
              ...(payload ? { body: payload.body } : {}),
              redirect: "manual",
              signal: AbortSignal.timeout(
                payload && upstreamPath === "/api/file" ? 120_000 : 20_000,
              ),
            },
          );
        } catch {
          // Never echo request headers, URL/query or raw upstream exception text.
          problem(
            response,
            502,
            "local.upstream_unavailable",
            "The official service could not be reached.",
          );
          return;
        }
        if (
          upstream.status >= 300 &&
          upstream.status < 400 &&
          upstream.status !== 304
        ) {
          await upstream.body?.cancel();
          problem(
            response,
            502,
            "local.upstream_redirect_rejected",
            "The official API returned an unexpected redirect.",
          );
          return;
        }
        if (
          ["text/html", "application/xhtml+xml"].includes(
            upstream.headers
              .get("content-type")
              ?.split(";")[0]
              .trim()
              .toLowerCase(),
          )
        ) {
          await upstream.body?.cancel();
          problem(
            response,
            502,
            "local.upstream_contract_rejected",
            "The official API returned HTML instead of an API response.",
          );
          return;
        }
        // Cookies, auth challenges, CORS and hop-by-hop/forwarding headers never cross.
        const responseHeaders = responseHeaderNames
          .map((name) => [name, upstream.headers.get(name)])
          .filter(([, value]) => value !== null);
        try {
          for (const [name, value] of responseHeaders)
            validateHeaderValue(name, value);
        } catch {
          await upstream.body?.cancel();
          problem(
            response,
            502,
            "local.upstream_contract_rejected",
            "The official API returned invalid response headers.",
          );
          return;
        }
        for (const [name, value] of responseHeaders)
          response.setHeader(name, value);
        // Files/SVG/JSON are data, never executable launcher-origin documents.
        // This does not affect callers reading response bytes via fetch.
        response.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; sandbox",
        );
        response.setHeader("Cache-Control", "no-store");
        response.writeHead(upstream.status);
        if (request.method === "HEAD" || !upstream.body) {
          await upstream.body?.cancel();
          response.end();
          return;
        }
        try {
          await pipeline(Readable.fromWeb(upstream.body), response);
        } catch {
          response.destroy();
        }
        return;
      } finally {
        payload?.release();
      }
    }
    // Do not let SPA fallback turn an unsupported API/runtime into a fake 200.
    if (
      /^\/(api|admin|internal|auth|oauth|code|rin|quiver|__rinspace_local)(\/|$)/.test(
        url.pathname,
      ) ||
      /^\/rinspace\/(api|admin|auth)(\/|$)/.test(url.pathname)
    ) {
      problem(
        response,
        403,
        "local.route_not_enabled",
        "This runtime is not enabled in the local read-only launcher.",
      );
      return;
    }
    // Normal pages, local assets and Vite HMR keep the existing UI and styles.
    next();
  };
}

export function loopbackGuardPlugin(origin, fetchImpl = fetch, session = null) {
  return {
    name: "rinspace-local-read-only",
    enforce: "post",
    configureServer(server) {
      server.middlewares.use(
        createReadOnlyMiddleware({ origin, fetchImpl, session }),
      );
      server.httpServer?.prependListener("upgrade", (request, socket) => {
        if (!validLocalRequest(request, origin, true)) socket.destroy();
      });
    },
  };
}
