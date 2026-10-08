import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { ensureLocaleNamespaces, i18n } from "@/i18n";

import {
  BookReaderTableOfContents,
  RinWriterArticle,
  bookPdfPageCount,
  bookReaderPageCounts,
  rinWriterTocItems,
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

test("builds navigation only from renderer-owned heading anchors", () => {
  expect(rinWriterTocItems(
    '<h2 id="native.section">Section 4</h2><h3>Unanchored authored heading</h3>',
    "Book",
  )).toEqual([{ id: "native.section", text: "Section 4", level: 2 }]);
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
          "<semantics><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>" +
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
  expect(
    container?.querySelector("mjx-math")?.getAttribute("aria-hidden"),
  ).toBe("true");
  expect(container?.getAttribute("data-rin-math-source")).toBe(
    "<math><mi>x</mi></math>",
  );
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
  expect((globalThis as { __rinXss?: number }).__rinXss).toBeUndefined();
  expect(view.getByText("Safe heading")).toBeTruthy();
});

test("preserves final renderer document content, labels and reference identities", () => {
  const html =
    '<article id="doc"><h1 class="rin-doc-title">Renderer title</h1>' +
    '<nav class="rin-toc"><a href="#native.section">Renderer contents</a></nav>' +
    '<h2 id="native.section">Section 4</h2>' +
    '<p id="literal">Literal \\cref{native.theorem} remains renderer text.</p>' +
    '<div id="native.theorem" class="ltx_theorem rin-env"><h6 class="ltx_title_theorem ltx_runin rin-env-title">Lemma 7.</h6>' +
    '<div class="ltx_para"><p class="ltx_p">Native statement.</p></div></div>' +
    '<ol class="ltx_enumerate rin-list"><li class="ltx_item rin-list-item" id="native.item">' +
    '<span class="ltx_tag_item rin-list-marker">(iv)</span><p>Native list item.</p></li></ol>' +
    '<section class="rin-bibliography"><h6 class="rin-env-title">References</h6>' +
    '<ul class="ltx_biblist"><li class="ltx_bibitem" id="native.bib">' +
    '<span class="ltx_tag_bibitem">[Knuth84]</span><span>{TeX} and {C++}</span>' +
    '<a href="https://example.org/book" target="_self" rel="cite">Original reference</a></li></ul></section>' +
    '<table class="ltx_equation ltx_eqn_table" id="native.equation"><tbody><tr>' +
    '<td class="ltx_eqn_cell"><math><mi>x</mi></math></td><td class="ltx_eqn_eqno">(9)</td></tr></tbody></table>' +
    '<figure id="native.figure"><img width="600" height="1200" src="/diagram.svg" alt="Native diagram">' +
    "<figcaption>Figure 3.</figcaption></figure><h3>Unanchored authored heading</h3></article>";
  const source = new DOMParser().parseFromString(html, "text/html");
  source.querySelectorAll("a").forEach((anchor) => {
    const rel = new Set(
      (anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean),
    );
    rel.add("noopener");
    rel.add("noreferrer");
    anchor.setAttribute("rel", Array.from(rel).join(" "));
  });
  const view = render(
    <MemoryRouter>
      <RinWriterArticle
        html={html}
        title="Renderer title"
        serverFinal
        removeGeneratedToc
      />
    </MemoryRouter>,
  );
  const output = view.container.querySelector(".rin-renderer-content");
  expect(output).toBeTruthy();
  for (const selector of [
    ".rin-doc-title",
    ".rin-toc",
    "#literal",
    "#native\\.theorem",
    "#native\\.item",
    "#native\\.equation",
    "#native\\.figure",
    "h3",
  ]) {
    expect(output?.querySelector(selector)?.outerHTML).toBe(
      source.querySelector(selector)?.outerHTML,
    );
  }
  const bibliography = output?.querySelector(".rin-bibliography");
  expect(bibliography?.textContent).toBe(
    source.querySelector(".rin-bibliography")?.textContent,
  );
  expect(bibliography?.querySelector(".ltx_bibitem")?.id).toBe("native.bib");
  const reference = bibliography?.querySelector("a");
  expect(reference?.getAttribute("href")).toBe("https://example.org/book");
  expect(reference?.getAttribute("target")).toBe("_self");
  expect(reference?.getAttribute("rel")?.split(" ")).toEqual([
    "cite",
    "noopener",
    "noreferrer",
  ]);
  expect(output?.querySelector(".rin-ref-clever")).toBeNull();
  expect(output?.querySelector(".katex")).toBeNull();
});
