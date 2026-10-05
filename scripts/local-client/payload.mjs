import { LocalProblem } from "./session.mjs";

export const businessPayloadLimit = 32 * 1024 * 1024;
// server/main.go: maxAnswerAttachmentFileUploadBytes + multipart overhead.
// The official handler still decides source/file size, type, quota and rights.
export const filePayloadLimit = 81 * 1024 * 1024;

function readCompleteBody(request, limit, timeout) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const cleanupReadable = () => {
      clearTimeout(timer);
      request.off("data", data);
      request.off("end", end);
      request.off("aborted", interrupted);
    };
    const cleanup = () => {
      cleanupReadable();
      request.off("error", interrupted);
      request.off("close", closed);
    };
    const fail = (status, code, message) => {
      if (settled) return;
      settled = true;
      cleanupReadable();
      request.pause();
      // IncomingMessage can emit aborted, then error, then close. Keep its
      // terminal error handler until close, after reporting the first failure.
      reject(new LocalProblem(status, code, message));
    };
    const interrupted = () =>
      fail(
        400,
        "local.payload_interrupted",
        "The request body was not completed. No business request was sent.",
      );
    const closed = () => {
      if (!settled && !request.complete) interrupted();
      cleanup();
    };
    const data = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        fail(
          413,
          "local.payload_too_large",
          "The request exceeds the local transport limit. No business request was sent.",
        );
        return;
      }
      chunks.push(chunk);
    };
    const end = () => {
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, size));
    };
    const timer = setTimeout(
      () =>
        fail(
          408,
          "local.payload_timeout",
          "The request body was not completed in time. No business request was sent.",
        ),
      timeout,
    );
    timer.unref();
    request.on("data", data);
    request.once("end", end);
    request.once("aborted", interrupted);
    request.on("error", interrupted);
    request.once("close", closed);
    if (request.aborted || request.destroyed) interrupted();
  });
}

export function createPayloadGate({ readTimeout = 30_000 } = {}) {
  let uploadActive = false;
  return async function readPayload(request, path) {
    const upload = request.method === "POST" && path === "/api/file";
    const limit = upload ? filePayloadLimit : businessPayloadLimit;
    if (upload && uploadActive)
      throw new LocalProblem(
        429,
        "local.upload_busy",
        "Wait for the current file upload before starting another.",
      );
    if (upload) uploadActive = true;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        if (upload) uploadActive = false;
      }
    };
    try {
      const length = request.headers["content-length"];
      if (
        length !== undefined &&
        (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
      )
        throw new LocalProblem(
          400,
          "local.invalid_payload_length",
          "Invalid request length.",
        );
      if (length !== undefined && Number(length) > limit)
        throw new LocalProblem(
          413,
          "local.payload_too_large",
          "The request exceeds the local transport limit. No business request was sent.",
        );
      if (
        request.headers["content-encoding"] &&
        request.headers["content-encoding"] !== "identity"
      )
        throw new LocalProblem(
          415,
          "local.payload_encoding_rejected",
          "Encoded business request bodies are not supported.",
        );
      const body = await readCompleteBody(request, limit, readTimeout);
      // Keep the upload slot until its upstream response finishes, not merely
      // until buffering ends. No disk/temp file or second business attempt.
      return { body, release };
    } catch (error) {
      release();
      throw error;
    }
  };
}
