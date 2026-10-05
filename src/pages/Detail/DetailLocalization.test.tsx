import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test } from "vitest";

import { ensureLocaleNamespaces, i18n } from "@/i18n";

import {
  BlogTableOfContents,
  BookReaderTableOfContents,
} from "./index";

const tocItems = [
  { id: "section", text: "Section", level: 2 as const },
  { id: "subsection", text: "Subsection", level: 3 as const },
];

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
});

test("switches a blog table of contents without resetting its collapsed state", async () => {
  await ensureLocaleNamespaces("en", ["reader"]);
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = render(
    <MemoryRouter>
      <BlogTableOfContents
        items={tocItems}
        activeId=""
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  fireEvent.click(view.getByRole("button", { name: "Collapse Section" }));
  expect(view.queryByText("Subsection")).toBeNull();

  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  expect(view.getByRole("navigation", { name: "文章目录" })).toBeTruthy();
  expect(view.getByRole("button", { name: "展开 Section" })).toBeTruthy();
  expect(view.queryByText("Subsection")).toBeNull();
});

test("localizes book reader navigation and page counts", async () => {
  await ensureLocaleNamespaces("en", ["reader"]);
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={tocItems}
        activeId="section"
        pageId="section"
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  expect(
    view.getByRole("navigation", { name: "Book table of contents" }),
  ).toBeTruthy();
  expect(view.getByText("1 web page")).toBeTruthy();
  expect(view.getByText("2 TOC items")).toBeTruthy();

  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  expect(view.getByRole("navigation", { name: "书籍目录" })).toBeTruthy();
  expect(view.getByText("1 网页页")).toBeTruthy();
  expect(view.getByText("2 目录项")).toBeTruthy();
});

test("keeps an unsectioned chapter in the reader table of contents", async () => {
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  const selected: string[] = [];
  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={[
          { id: "chapter-2", text: "Chapter 2", level: 2 },
          { id: "section-2-3", text: "2.3 Smoothness", level: 3 },
          { id: "chapter-3", text: "Chapter 3", level: 2 },
          { id: "chapter-4", text: "Chapter 4", level: 2 },
          { id: "section-4-1", text: "4.1 Subgroups", level: 3 },
          { id: "page-section-2-3", text: "2.3 Smoothness", level: 2 },
        ]}
        activeId="chapter-3"
        pageId="chapter-3"
        onSelect={(id) => selected.push(id)}
      />
    </MemoryRouter>,
  );

  expect(view.getByText("3 网页页")).toBeTruthy();
  expect(view.getByText("6 目录项")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Chapter 3" }));
  expect(selected).toEqual(["chapter-3"]);
});

test("keeps Markdown book pages whose real ids begin with page-", async () => {
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={[
          { id: "page-introduction", text: "Introduction", level: 2 },
          { id: "page-methods", text: "Methods", level: 2 },
        ]}
        activeId="page-introduction"
        pageId="page-introduction"
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  expect(view.getByText("2 网页页")).toBeTruthy();
  expect(view.getByText("2 目录项")).toBeTruthy();
  expect(view.getByRole("button", { name: "Methods" })).toBeTruthy();
});

test("keeps an unsectioned chapter in the reader table of contents", async () => {
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  const selected: string[] = [];
  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={[
          { id: "chapter-2", text: "Chapter 2", level: 2 },
          { id: "section-2-3", text: "2.3 Smoothness", level: 3 },
          { id: "chapter-3", text: "Chapter 3", level: 2 },
          { id: "chapter-4", text: "Chapter 4", level: 2 },
          { id: "section-4-1", text: "4.1 Subgroups", level: 3 },
          { id: "page-section-2-3", text: "2.3 Smoothness", level: 2 },
        ]}
        activeId="chapter-3"
        pageId="chapter-3"
        onSelect={(id) => selected.push(id)}
      />
    </MemoryRouter>,
  );

  expect(view.getByText("3 网页页")).toBeTruthy();
  expect(view.getByText("6 目录项")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Chapter 3" }));
  expect(selected).toEqual(["chapter-3"]);
});

test("keeps Markdown book pages whose real ids begin with page-", async () => {
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={[
          { id: "page-introduction", text: "Introduction", level: 2 },
          { id: "page-methods", text: "Methods", level: 2 },
        ]}
        activeId="page-introduction"
        pageId="page-introduction"
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  expect(view.getByText("2 网页页")).toBeTruthy();
  expect(view.getByRole("button", { name: "Methods" })).toBeTruthy();
});
