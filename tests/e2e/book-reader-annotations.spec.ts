import { expect, test } from "@playwright/test";
import { identitySessionMock } from './identity-session-mock';

const commit = "a".repeat(40);
const now = new Date().toISOString();
const paragraphBlock = `rb_${"1".repeat(32)}`;
const headingBlock = `rb_${"2".repeat(32)}`;

const book = {
  id: "202",
  slug: "book-actions",
  type: "book",
  title: "书籍阅读页验收",
  author: "Lunifans",
  authorId: "lunifans",
  authorUid: "user-42",
  authorAvatar: "",
  authorRank: 1403,
  meta: "浏览器验收",
  excerpt: "书籍阅读页验收夹具。",
  interactions: "30 阅读",
  heat: "30",
  tags: [],
  images: [],
  coverUrl: "",
  editor: "rin",
  body: "",
  readCount: 30,
  collected: false,
  liked: false,
  likeCount: 0,
  createdAt: now,
  updatedAt: now,
};

const blog = {
  ...book,
  id: "101",
  slug: "blog-width",
  type: "blog",
  title: "文章正文宽度验收",
  body: "[[RIN_WRITER]]<p>文章正文宽度参照。</p>[[/RIN_WRITER]]",
};

const reader = {
  post: book,
  toc: [{ id: "chapter-1", text: "第一章", level: 2 }],
  page: {
    id: "chapter-1",
    text: "第一章",
    level: 2,
    html: `<h2 data-rin-block-id="${headingBlock}" data-rin-block-kind="heading">第一章</h2><p data-rin-block-id="${paragraphBlock}" data-rin-block-kind="paragraph">成熟段评系统把操作入口放在原文旁边。</p>`,
  },
  pageIndex: 0,
  pageCount: 1,
  source: "markdown-book-renderer",
  anchorVersion: "rin-document-bundle/v2",
  publicationCommit: commit,
  capabilities: {
    annotationsRead: true,
    annotationsWrite: true,
    annotationsWriteAvailable: true,
    erratumSync: true,
    erratumSyncAvailable: true,
  },
};

async function installFixture(
  page: import("@playwright/test").Page,
  blockCount = 0,
) {
  const fixtureReader =
    blockCount > 0
      ? {
          ...reader,
          page: {
            ...reader.page,
            html: Array.from({ length: blockCount }, (_value, index) => {
              const id = `rb_${index.toString(16).padStart(32, "0")}`;
              return `<p data-rin-block-id="${id}" data-rin-block-kind="paragraph">长页段落 ${index + 1}</p>`;
            }).join(""),
          },
        }
      : reader;
  await page.addInitScript(() => {
    localStorage.setItem("rinspace-auth-hint", JSON.stringify({ sub: "reader-7" }));
  });
  await page.route("**/auth/v1/user/me", (route) =>
    route.fulfill({
      json: { sub: "reader-7", username: "reader" },
    }),
  );
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(
      /^\/rinspace(?=\/)/,
      "",
    );
    if (pathname === "/api/identity/v1/session") {
      await route.fulfill({ json: identitySessionMock("reader-7", "reader") });
      return;
    }
    if (pathname === "/api/books/202/read") {
      await route.fulfill({ json: fixtureReader });
      return;
    }
    if (pathname === "/api/content/101") {
      await route.fulfill({ json: blog });
      return;
    }
    if (pathname === "/api/comments") {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === "/api/books/202/reader/pages/chapter-1/annotations") {
      await route.fulfill({
        json: {
          anchorVersion: "rin-document-bundle/v2",
          publicationCommit: commit,
          public: [],
          mine: [],
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

test("semantic paragraph exposes one Cross and four tested content actions", async ({
  page,
}) => {
  await installFixture(page);
  await page.goto("/books/202/read/book-actions#chapter-1", {
    waitUntil: "domcontentloaded",
  });

  const paragraph = page.locator(`[data-rin-block-id="${paragraphBlock}"]`);
  await expect(paragraph).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".book-annotation-margin-rail")).toHaveCount(0);
  await paragraph.hover();

  const cross = page.locator(".book-annotation-cross-trigger");
  await expect(cross).toHaveCount(1);
  await expect(cross).toBeVisible();
  await expect(cross.locator("svg")).toBeVisible();
  await expect(paragraph).toHaveClass(/is-rin-annotation-target/);
  expect(
    await paragraph.evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe("none");
  await expect(page.locator(".detail-side")).toHaveCount(0);
  await cross.click();

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText([
    "笔记",
    "评论",
    "问题",
    "勘误",
  ]);
  await expect(menu.getByRole("menuitem", { name: "高亮" })).toHaveCount(0);
  await expect(page.getByText("如何使用")).toHaveCount(0);
  await expect(page.getByText("批注回复")).toHaveCount(0);
  await expect(page.getByText("面包屑")).toHaveCount(0);

  for (const action of [
    { label: "笔记", kind: "note", fields: ["笔记"] },
    { label: "评论", kind: "comment", fields: ["评论"] },
    { label: "问题", kind: "question", fields: ["问题"] },
    {
      label: "勘误",
      kind: "erratum",
      fields: ["建议修正为", "说明或依据"],
    },
  ]) {
    await menu.getByRole("menuitem", { name: action.label }).click();
    const composer = page.locator(
      `.book-annotation-composer[data-kind="${action.kind}"]`,
    );
    await expect(composer).toBeVisible();
    for (const field of action.fields) {
      await expect(page.getByRole("textbox", { name: field })).toBeVisible();
    }
    await composer.getByRole("button", { name: "取消" }).click();
    await expect(composer).toHaveCount(0);
    if (action.kind !== "erratum") {
      await cross.click();
      await expect(menu).toBeVisible();
    }
  }
});

test("narrow reader keeps content full-width and opens annotations in a Sheet", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width || 0) >= 900, "mobile viewport only");
  await installFixture(page);
  await page.goto("/books/202/read/book-actions#chapter-1", {
    waitUntil: "domcontentloaded",
  });

  const paragraph = page.locator(`[data-rin-block-id="${paragraphBlock}"]`);
  await expect(paragraph).toBeVisible({ timeout: 20_000 });
  await paragraph.tap();
  const cross = page.locator(".book-annotation-cross-trigger");
  await expect(cross).toBeVisible();
  await cross.tap();
  await page.getByRole("menuitem", { name: "问题" }).tap();
  await expect(page.getByRole("dialog", { name: "问题" })).toBeVisible();

  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    article:
      document.querySelector(".book-reader-article")?.getBoundingClientRect()
        .width || 0,
    overflow:
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  }));
  expect(sizes.overflow).toBe(false);
  expect(sizes.article).toBeGreaterThan(sizes.viewport - 20);
});

test("1440px reader uses the margin rail and matches the blog reading width", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "single desktop width gate",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installFixture(page);
  await page.goto("/books/202/read/book-actions#chapter-1", {
    waitUntil: "domcontentloaded",
  });

  const paragraph = page.locator(`[data-rin-block-id="${paragraphBlock}"]`);
  await expect(paragraph).toBeVisible({ timeout: 20_000 });
  const bookMetrics = await page
    .locator(".book-reader-article .rin-writer-html")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        centerDelta: rect.left + rect.width / 2 - window.innerWidth / 2,
      };
    });
  await paragraph.hover();
  await page.locator(".book-annotation-cross-trigger").click();
  await page.getByRole("menuitem", { name: "评论" }).click();
  await expect(
    page.locator(".book-annotation-margin-rail .book-annotation-composer"),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "评论" })).toHaveCount(0);

  await page.goto("/a/101/blog-width", { waitUntil: "domcontentloaded" });
  const blogBody = page.locator(".blog-detail-article .rin-writer-html");
  await expect(blogBody).toBeVisible({ timeout: 20_000 });
  const blogMetrics = await blogBody.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      centerDelta: rect.left + rect.width / 2 - window.innerWidth / 2,
    };
  });
  expect(
    Math.abs(bookMetrics.width - blogMetrics.width),
    `book=${bookMetrics.width} blog=${blogMetrics.width}`,
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(bookMetrics.centerDelta)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(bookMetrics.centerDelta - blogMetrics.centerDelta),
  ).toBeLessThanOrEqual(1);
});

test("1000-block page keeps one delegated Cross and scrolls without horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-light",
    "single long-page performance gate",
  );
  await installFixture(page, 1000);
  const startedAt = Date.now();
  await page.goto("/books/202/read/book-actions#chapter-1", {
    waitUntil: "domcontentloaded",
  });

  const blocks = page.locator("[data-rin-block-id]");
  await expect(blocks).toHaveCount(1000, { timeout: 20_000 });
  const last = blocks.last();
  await last.scrollIntoViewIfNeeded();
  await last.hover();
  await expect(page.locator(".book-annotation-cross-trigger")).toHaveCount(1);
  await expect(page.locator(".book-annotation-cross-trigger")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  expect(Date.now() - startedAt).toBeLessThan(10_000);
});
