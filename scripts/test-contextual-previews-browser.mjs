#!/usr/bin/env node

import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = (
  process.env.RINSPACE_BROWSER_BASE_URL || "http://127.0.0.1:4173"
).replace(/\/$/, "");
const chromiumPath = process.env.CHROMIUM_BIN;
const screenshotPrefix = process.env.RINSPACE_CONTEXTUAL_PREVIEW_SCREENSHOT;
const now = new Date().toISOString();
let followRequests = 0;
const browserErrors = [];
const apiRequests = [];

function postFixture(id, type, body) {
  return {
    id,
    slug: id,
    type,
    title:
      type === "book"
        ? "站内预览测试书"
        : type === "question"
          ? "站内预览目标问题"
          : "站内预览测试文章",
    author: "Lunifans",
    authorId: "lunifans",
    authorUid: "user-42",
    authorAvatar: "/avatar.jpg",
    authorRank: 1403,
    meta: "浏览器验收",
    excerpt:
      type === "question"
        ? "这是来自站内公开内容接口的摘要。"
        : "用于验证上下文预览。",
    interactions: "20 阅读",
    heat: "20",
    tags: [],
    images: [],
    coverUrl: type === "question" ? "/preview-cover.jpg" : "",
    editor: "rin",
    body,
    readCount: 20,
    collected: false,
    createdAt: now,
    updatedAt: now,
    ...(type === "book"
      ? {
          book: {
            kind: "markdown",
            bookTitle: "站内预览测试书",
            authors: ["Lunifans"],
            toc: [],
          },
        }
      : {}),
  };
}

const profile = {
  id: "user-42",
  created_at: 1,
  last_login_date: 1,
  username: "lunifans",
  follow_count: 13,
  following_count: 14,
  answer_count: 2,
  question_count: 3,
  rank: 1403,
  display_name: "Lunifans",
  avatar: "/avatar.jpg",
  cover_url: "/cover.jpg",
  mobile: "",
  bio: "最高权限管理员。",
  bio_html: "",
  website: "lunifans.com",
  location: "代数几何",
  about_html: "",
  status: "active",
  suspended_until: 0,
  is_follower: false,
};

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/rinspace(?=\/)/, "");
  apiRequests.push(`${request.method()} ${path}`);
  if (path === "/api/content/101") {
    return route.fulfill({
      json: postFixture(
        "101",
        "blog",
        '[[RIN_WRITER]]<p>继续阅读 <a href="/q/303/target-question">站内目标问题</a>，也可查看 <a href="https://example.com/a/404">外部文章</a>。</p>[[/RIN_WRITER]]',
      ),
    });
  }
  if (path === "/api/content/102")
    return route.fulfill({ json: postFixture("102", "book", "") });
  if (path === "/api/content/303")
    return route.fulfill({ json: postFixture("303", "question", "问题正文") });
  if (path === "/api/books/102/read") {
    return route.fulfill({
      json: {
        post: postFixture("102", "book", ""),
        toc: [{ id: "chapter-1", text: "第一章", level: 2 }],
        page: {
          id: "chapter-1",
          text: "第一章",
          level: 2,
          html: '<p>书中引用 <a href="/q/303/target-question">站内目标问题</a>。</p>',
        },
        pageIndex: 0,
        pageCount: 1,
        source: "stored",
      },
    });
  }
  if (path === "/api/books/102/reviews") {
    return route.fulfill({
      json: {
        items: [],
        rating: { averageScore: 0, reviewCount: 0, breakdown: [] },
      },
    });
  }
  if (path === "/api/personal/user/info")
    return route.fulfill({ json: profile });
  if (path === "/api/follows") {
    followRequests += 1;
    const payload = request.postDataJSON();
    return route.fulfill({
      json: {
        targetType: "user",
        targetId: "user-42",
        following: !payload.isCancel,
        followerCount: payload.isCancel ? 13 : 14,
      },
    });
  }
  return route.fulfill({ json: {} });
}

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.addInitScript(() => {
    const payload = btoa(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    localStorage.setItem(
      "rinspace-auth-session",
      JSON.stringify({
        access_token: `e30.${payload}.signature`,
        refresh_token: "refresh",
        expires_in: 3600,
        sub: "reader-7",
        issued_at: Date.now(),
      }),
    );
  });
  await page.route("**/auth/v1/user/me", (route) =>
    route.fulfill({ json: { sub: "reader-7", username: "reader" } }),
  );
  await page.route("**/api/**", handleApi);

  await page.goto(`${baseURL}/a/101/contextual-preview`, {
    waitUntil: "domcontentloaded",
  });
  const identity = page.locator('[data-user-identity="lunifans"]').first();
  try {
    await identity.waitFor({ state: "visible" });
  } catch (error) {
    console.error(
      `page=${page.url()} title=${await page.title()} text=${(await page.locator("body").innerText()).slice(0, 800)}`,
    );
    console.error(
      `html=${(await page.locator("body").innerHTML()).slice(0, 1600)}`,
    );
    console.error(`api requests: ${apiRequests.join(" | ")}`);
    console.error(`browser errors: ${browserErrors.join(" | ")}`);
    throw error;
  }
  await identity.hover();
  const profileCard = page.locator(".user-profile-hover-card");
  await profileCard.waitFor({ state: "visible" });
  await profileCard.getByText("最高权限管理员。").waitFor();
  assert.match(await profileCard.innerText(), /最高权限管理员。/);
  if (screenshotPrefix)
    await page.screenshot({
      path: `${screenshotPrefix}-profile.png`,
      fullPage: false,
    });
  await profileCard.getByRole("button", { name: "关注" }).click();
  await profileCard.getByRole("button", { name: "取消关注" }).waitFor();
  assert.equal(followRequests, 1);
  await page.mouse.move(1200, 850);
  await profileCard.waitFor({ state: "hidden" });

  const blogBody = page.locator(".rin-writer-html");
  const blogInternalLink = blogBody.getByRole("link", { name: "站内目标问题" });
  const blogExternalLink = blogBody.getByRole("link", { name: "外部文章" });
  await blogInternalLink.hover();
  const contentCard = page.locator(".internal-content-preview-card");
  try {
    await contentCard.waitFor({ state: "visible" });
  } catch (error) {
    console.error(
      `internal href=${await blogInternalLink.getAttribute("href")} api requests=${apiRequests.join(" | ")}`,
    );
    throw error;
  }
  assert.match(await contentCard.innerText(), /站内预览目标问题/);
  const previewEyebrow = contentCard.locator(
    ".rin-animate-preview-link-eyebrow",
  );
  const previewMeta = contentCard.locator(".rin-animate-preview-link-meta");
  await previewMeta.waitFor({ state: "visible" });
  assert.equal((await previewEyebrow.innerText()).trim(), "问题");
  assert.equal((await previewMeta.innerText()).trim(), "Lunifans · 浏览器验收");
  if (screenshotPrefix)
    await page.screenshot({
      path: `${screenshotPrefix}-content.png`,
      fullPage: false,
    });
  await blogExternalLink.hover();
  await page.waitForTimeout(650);
  assert.equal(
    await contentCard.count(),
    0,
    "external link unexpectedly opened a preview",
  );

  await page.goto(`${baseURL}/books/102/read/contextual-preview`, {
    waitUntil: "domcontentloaded",
  });
  const bookInternalLink = page
    .locator(".rin-writer-html")
    .getByRole("link", { name: "站内目标问题" });
  await bookInternalLink.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  await bookInternalLink.focus();
  await page
    .locator(".internal-content-preview-card")
    .waitFor({ state: "visible" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/a/101/contextual-preview`, {
    waitUntil: "domcontentloaded",
  });
  const mobileIdentity = page
    .locator('[data-user-identity="lunifans"]')
    .first();
  await mobileIdentity.waitFor({ state: "visible" });
  assert.equal(await mobileIdentity.getAttribute("href"), "/@lunifans");
  await mobileIdentity.click();
  await page.waitForURL(`${baseURL}/@lunifans`);
} finally {
  await browser.close();
}

console.log("contextual previews browser acceptance passed");
