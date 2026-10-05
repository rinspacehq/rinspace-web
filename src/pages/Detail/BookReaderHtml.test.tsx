import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { ensureLocaleNamespaces, i18n } from "@/i18n";

import {
  BookReaderTableOfContents,
  RinWriterArticle,
  bookPdfPageCount,
  bookReaderPageCounts,
} from "./index";

const readerTocItems = [
  { id: "chapter-1", text: "第一章", level: 2 as const },
  { id: "section-1", text: "第一节", level: 3 as const },
  { id: "section-2", text: "第二节", level: 3 as const },
];

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
});

test("reports web pages, TOC nodes and PDF pages as separate numbers", async () => {
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={readerTocItems}
        activeId="section-1"
        pageId="section-1"
        pdfPageCount={320}
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  const navigation = view.getByRole("navigation", { name: "书籍目录" });
  expect(
    navigation
      .querySelector("[data-rin-reader-web-pages]")
      ?.getAttribute("data-rin-reader-web-pages"),
  ).toBe("2");
  expect(
    navigation
      .querySelector("[data-rin-reader-toc-nodes]")
      ?.getAttribute("data-rin-reader-toc-nodes"),
  ).toBe("3");
  expect(
    navigation
      .querySelector("[data-rin-reader-pdf-pages]")
      ?.getAttribute("data-rin-reader-pdf-pages"),
  ).toBe("320");
  expect(view.getByText("2 网页页")).toBeTruthy();
  expect(view.getByText("3 目录项")).toBeTruthy();
  expect(view.getByText("PDF 320 页")).toBeTruthy();
});

test("hides the PDF page count when the book metadata records none", async () => {
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={readerTocItems}
        activeId=""
        pageId="section-1"
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  const navigation = view.getByRole("navigation", { name: "书籍目录" });
  expect(navigation.querySelector("[data-rin-reader-pdf-pages]")).toBeNull();
  expect(navigation.textContent).not.toContain("PDF");
  expect(view.getByText("2 网页页")).toBeTruthy();
});

test("counts web pages from reader pages and ignores unusable PDF metadata", () => {
  expect(bookReaderPageCounts(readerTocItems, 320)).toEqual({
    webPages: 2,
    tocNodes: 3,
    pdfPages: 320,
  });
  expect(bookReaderPageCounts(readerTocItems)).toEqual({
    webPages: 2,
    tocNodes: 3,
    pdfPages: null,
  });
  expect(bookReaderPageCounts(readerTocItems, 0).pdfPages).toBeNull();
  expect(bookPdfPageCount({ numberOfPages: "320 页" })).toBe(320);
  expect(bookPdfPageCount({ numberOfPages: "待定" })).toBeNull();
  expect(bookPdfPageCount(null)).toBeNull();
});

test("forwards the declared owner page of a cross-page reader reference", () => {
  const onReaderReference = vi.fn();
  const view = render(
    <MemoryRouter>
      <RinWriterArticle
        html={
          '<section><h2 id="intro">Intro</h2>' +
          '<p><a class="rin-reader-ref" href="#loc-4" data-rin-page="appendix">cross page</a></p>' +
          '<p><a class="rin-reader-ref" href="#intro">same page</a></p></section>'
        }
        title="Book"
        serverFinal
        onReaderReference={onReaderReference}
      />
    </MemoryRouter>,
  );

  const crossPageLink = view.getByText("cross page");
  expect(crossPageLink.getAttribute("data-rin-page")).toBe("appendix");
  fireEvent.click(crossPageLink);
  expect(onReaderReference).toHaveBeenNthCalledWith(1, "loc-4", "appendix");

  fireEvent.click(view.getByText("same page"));
  expect(onReaderReference).toHaveBeenNthCalledWith(2, "intro", undefined);
});

test("keeps reader MathML semantics instead of re-rendering Typst math", () => {
  const view = render(
    <MemoryRouter>
      <RinWriterArticle
        html={
          '<section><h2 id="math">公式</h2><p><math display="block">' +
          '<semantics><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>' +
          '<annotation encoding="application/x-tex">a + b</annotation></semantics></math>' +
          "</p></section>"
        }
        title="Math"
        serverFinal
      />
    </MemoryRouter>,
  );

  const math = view.container.querySelector("math");
  expect(math).toBeTruthy();
  expect(math?.querySelector("semantics annotation")?.textContent).toBe(
    "a + b",
  );
  expect(view.container.querySelector(".katex")).toBeNull();
  expect(view.container.querySelector(".rin-deferred-math")).toBeNull();
});

test("keeps the assistive MathML mirror of the MathJax CHTML profile", () => {
  const view = render(
    <MemoryRouter>
      <RinWriterArticle
        html={
          '<section><h2 id="math">公式</h2><p><span class="rin-math rin-math-mathjax rin-math-inline" ' +
          'data-rin-math-engine="mathjax-chtml" data-rin-math-source="&lt;math&gt;&lt;mi&gt;x&lt;/mi&gt;&lt;/math&gt;">' +
          '<mjx-container class="MathJax" jax="CHTML" overflow="overflow" style="position: relative;">' +
          '<mjx-math class="NCM-N" aria-hidden="true"><mjx-mi><mjx-c class="mjx-c1D465">x</mjx-c></mjx-mi></mjx-math>' +
          '<mjx-assistive-mml unselectable="on" display="inline">' +
          '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mi>x</mi>' +
          '<annotation encoding="application/x-tex">x</annotation></semantics></math>' +
          "</mjx-assistive-mml></mjx-container></span> 等于一。</p></section>"
        }
        title="MathJax profile"
        serverFinal
      />
    </MemoryRouter>,
  );

  const container = view.container.querySelector(".rin-math-mathjax");
  expect(container).toBeTruthy();
  const assistive = container?.querySelector("mjx-assistive-mml");
  expect(assistive).toBeTruthy();
  expect(
    assistive?.querySelector("math semantics annotation")?.textContent,
  ).toBe("x");
  expect(container?.querySelector("mjx-math")?.getAttribute("aria-hidden")).toBe(
    "true",
  );
  expect(
    container?.getAttribute("data-rin-math-source"),
  ).toBe("<math><mi>x</mi></math>");
});

test("never lets rejected output reach the reader DOM", () => {
  const view = render(
    <MemoryRouter>
      <RinWriterArticle
        html={
          '<section><h2 id="h">Safe heading</h2>' +
          "<script>window.__rinXss = 1</script>" +
          '<iframe src="https://evil.example"></iframe>' +
          '<p onclick="window.__rinXss = 2">' +
          '<img src="https://evil.example/pixel.png" onerror="window.__rinXss = 3">' +
          '<a href="javascript:window.__rinXss = 4">bad link</a>' +
          "</p></section>"
        }
        title="Unsafe"
        serverFinal
      />
    </MemoryRouter>,
  );

  expect(view.container.querySelector("script")).toBeNull();
  expect(view.container.querySelector("iframe")).toBeNull();
  expect(view.container.querySelector("[onclick]")).toBeNull();
  expect(view.container.querySelector("[onerror]")).toBeNull();
  expect(view.container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(
    (globalThis as { __rinXss?: number }).__rinXss,
  ).toBeUndefined();
  expect(view.getByText("Safe heading")).toBeTruthy();
});
