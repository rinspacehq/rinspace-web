import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
function readingPDF(): Buffer {
  let body = "%PDF-1.4\n";
  const offsets = [0];
  const streams = [
    "0 0 0 rg 20 20 100 100 re f\n",
    "0 0 0 rg 100 100 120 120 re f\n",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 6 0 R >>",
    ...streams.map(
      (s) => `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}endstream`,
    ),
  ];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += "xref\n0 7\n0000000000 65535 f \n";
  offsets.slice(1).forEach((o) => {
    body += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
for (const kind of ["book", "blog"] as const) {
  test(`start reading opens the original PDF in the browser for ${kind}`, async ({
    page,
  }) => {
    const pdf = readingPDF(),
      hash = createHash("sha256").update(pdf).digest("hex"),
      commit = "a".repeat(40);
    const html = `<div class="rin-author-pdf" data-rin-pdf="${pdf.toString("base64")}" data-rin-pdf-sha256="${hash}" data-rin-pdf-pages="2" data-rin-pdf-commit="${commit}" data-rin-pdf-path="main.pdf"><p>PDF</p></div>`;
    const readerPayload = {
      version: "rin-book-reader/v1",
      title: "PDF 阅读验收",
      toc: [{ id: "page-pdf-reading", text: "PDF", level: 2 }],
      pages: [{ id: "page-pdf-reading", text: "PDF", level: 2, html }],
    };
    const post = {
      id: "202",
      type: kind,
      title: "PDF 阅读验收",
      author: "Reader",
      authorId: "reader",
      slug: "pdf-reading",
      editor: "rin",
      body:
        kind === "book"
          ? `[[RIN_READER]]${JSON.stringify(readerPayload)}[[/RIN_READER]]`
          : `[[RIN_WRITER]]${html}[[/RIN_WRITER]]`,
      meta: "",
      excerpt: "",
      tags: [],
      images: [],
      interactions: "",
      heat: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(kind === "book"
        ? {
            book: {
              kind: "original",
              bookTitle: "PDF 阅读验收",
              authors: ["Reader"],
            },
          }
        : {}),
    };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        /^\/rinspace(?=\/)/,
        "",
      );
      if (path === "/api/content/202") return route.fulfill({ json: post });
      if (path === "/api/books/202/read")
        return route.fulfill({
          json: {
            post,
            toc: [{ id: "page-pdf-reading", text: post.title, level: 2 }],
            page: { id: "page-pdf-reading", text: post.title, level: 2, html },
            pageIndex: 0,
            pageCount: 1,
            source: "stored",
            publicationCommit: commit,
            capabilities: { annotationsRead: false, annotationsWrite: false },
          },
        });
      if (path.endsWith("/publication-progress"))
        return route.fulfill({ status: 204 });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto(
      kind === "book" ? "/books/202/pdf-reading" : "/a/202/pdf-reading",
      { waitUntil: "domcontentloaded" },
    );
    const reader = page.locator('[data-rin-reading-mode="author-pdf"]');
    await expect(reader).toBeVisible({ timeout: 20000 });
    await expect(reader.getByRole("status")).toHaveCount(0, { timeout: 20000 });
    await expect(reader.getByRole("alert")).toHaveCount(0);
    await expect(reader).toHaveAttribute("data-source-commit", commit);
    const link = reader.getByRole("link", { name: "开始阅读" });
    await expect(link).toHaveAttribute("href", /^blob:/);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("type", "application/pdf");
    await expect(reader.locator("canvas, iframe, embed, object")).toHaveCount(
      0,
    );
    await expect(reader.getByRole("button")).toHaveCount(0);
    const original = await link.evaluate(async (element) => {
      const response = await fetch((element as HTMLAnchorElement).href);
      return {
        type: response.headers.get("content-type"),
        bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
      };
    });
    expect(original.type).toBe("application/pdf");
    expect(
      createHash("sha256").update(Buffer.from(original.bytes)).digest("hex"),
    ).toBe(hash);
    const sourceURL = page.url();
    const handoff = Promise.race([
      page
        .waitForEvent("popup", { timeout: 10000 })
        .then((popup) => ({ popup }))
        .catch(() => null),
      page
        .waitForEvent("download", { timeout: 10000 })
        .then((download) => ({ download }))
        .catch(() => null),
    ]);
    await link.click();
    const opened = await handoff;
    expect(opened).not.toBeNull();
    if (opened && "popup" in opened) await opened.popup.close();
    await expect(page).toHaveURL(sourceURL);
  });
}
