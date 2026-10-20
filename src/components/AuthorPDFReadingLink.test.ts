import { webcrypto, createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import AuthorPDFReadingLink, { AuthorPDFInline } from "./AuthorPDFReadingLink";
vi.mock("@/i18n/useFeatureTranslation", () => ({
  useFeatureTranslation: () => ({ t: (key: string) => key }),
}));
import {
  authorPDFFromFragment,
  verifiedAuthorPDFBytes,
} from "./AuthorPDFReadingLink";
const bytes = Buffer.from("%PDF-1.7 fixture bytes");
const sha = createHash("sha256").update(bytes).digest("hex");
const fragment = `<div class="rin-author-pdf" data-rin-pdf="${bytes.toString("base64")}" data-rin-pdf-sha256="${sha}" data-rin-pdf-pages="16" data-rin-pdf-commit="${"a".repeat(40)}" data-rin-pdf-path="main.pdf"><p>PDF</p></div>`;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("recognises only the isolated PDF result with full source identity", () => {
  expect(authorPDFFromFragment(fragment)?.pageCount).toBe(16);
  for (const value of [
    fragment + "<p>other content</p>",
    fragment.replace("main.pdf", "../main.pdf"),
    fragment.replace('pages="16"', 'pages="0"'),
    fragment.replace("a".repeat(40), "abcdefa"),
    fragment.replace(sha, "bad"),
  ])
    expect(authorPDFFromFragment(value)).toBeNull();
});
test("verifies original bytes before the browser receives them", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const pdf = authorPDFFromFragment(fragment)!;
  expect(Array.from(await verifiedAuthorPDFBytes(pdf))).toEqual(
    Array.from(bytes),
  );
  await expect(
    verifiedAuthorPDFBytes({ ...pdf, sha256: "b".repeat(64) }),
  ).rejects.toThrow("identity mismatch");
  await expect(
    verifiedAuthorPDFBytes({ ...pdf, base64: btoa("not a PDF") }),
  ).rejects.toThrow("Invalid PDF");
});

test("opens verified original bytes as a native PDF link and releases its URL", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const createObjectURL = vi.fn((_blob: Blob) => "blob:verified-pdf");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  const view = render(
    createElement(AuthorPDFReadingLink, {
      pdf: authorPDFFromFragment(fragment)!,
    }),
  );
  const link = await screen.findByRole("link", {
    name: "pdfReading.startReading",
  });
  expect(link.getAttribute("href")).toBe("blob:verified-pdf");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.hasAttribute("download")).toBe(false);
  expect(createObjectURL.mock.calls[0][0].type).toBe("application/pdf");
  expect(
    view.container.querySelector("canvas, iframe, embed, object"),
  ).toBeNull();
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:verified-pdf");
});
test("does not hand an invalid PDF identity to the browser", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const createObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  render(
    createElement(AuthorPDFReadingLink, {
      pdf: { ...authorPDFFromFragment(fragment)!, sha256: "b".repeat(64) },
    }),
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByRole("link")).toBeNull();
  expect(createObjectURL).not.toHaveBeenCalled();
});

test("embeds verified original bytes in the article without a start-reading link", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const createObjectURL = vi.fn((_blob: Blob) => "blob:verified-inline-pdf");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  const view = render(createElement(AuthorPDFInline, {
    pdf: authorPDFFromFragment(fragment)!, title: "Article title",
  }));
  const frame = await screen.findByTitle("Article title — PDF");
  expect(frame.tagName).toBe("IFRAME");
  expect(frame.getAttribute("src")).toBe("blob:verified-inline-pdf");
  expect(screen.queryByRole("link")).toBeNull();
  expect(createObjectURL.mock.calls[0][0].type).toBe("application/pdf");
  expect(view.container.querySelector("[data-source-commit]")?.getAttribute("data-source-commit")).toBe("a".repeat(40));
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:verified-inline-pdf");
});

test("inline reader never embeds bytes whose identity verification fails", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const createObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  const view = render(createElement(AuthorPDFInline, {
    pdf: { ...authorPDFFromFragment(fragment)!, sha256: "b".repeat(64) },
    title: "Invalid article",
  }));
  await screen.findByRole("alert");
  expect(view.container.querySelector("iframe")).toBeNull();
  expect(createObjectURL).not.toHaveBeenCalled();
});
