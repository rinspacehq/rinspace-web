import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type Rgb = [number, number, number];

const parseRgb = (value: string): Rgb => {
  const hex = value.trim().match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hex) {
    return [
      Number.parseInt(hex[1], 16),
      Number.parseInt(hex[2], 16),
      Number.parseInt(hex[3], 16),
    ];
  }
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3)
    throw new Error(`Unsupported color: ${value}`);
  return [channels[0], channels[1], channels[2]];
};

const luminance = ([red, green, blue]: Rgb) => {
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (foreground: string, background: string) => {
  const foregroundLuminance = luminance(parseRgb(foreground));
  const backgroundLuminance = luminance(parseRgb(background));
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

const installDarkTheme = async (page: Page) => {
  await page.addInitScript(() =>
    localStorage.setItem("rinspace-theme-v2", "dark"),
  );
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
};

test.beforeEach(async ({ page }) => {
  await installDarkTheme(page);
});

test("book detail legacy text and accent actions retain AA contrast", async ({
  page,
}, testInfo) => {
  await page.goto("/books/254/dark-contrast-fixture", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("body").evaluate((body) => {
    body.insertAdjacentHTML(
      "beforeend",
      `
      <section id="dark-book-contrast-fixture" class="book-reader-shell" style="background:var(--rin-surface);padding:24px">
        <span class="avatar-name-text">作者名称</span>
        <div class="book-rating-summary"><span>32 人评分</span><em>原创书籍</em></div>
        <button class="book-detail-read-action" type="button">开始阅读</button>
        <nav class="book-toc">
          <button class="book-toc-title-button" type="button"><span>第一章 线性空间</span></button>
          <span class="book-toc-title-static">附录</span>
        </nav>
        <div class="book-related-main"><strong>关联书籍</strong><small>作者信息</small></div>
      </section>
    `,
    );
  });

  await expect
    .poll(() =>
      page
        .locator(".book-toc-title-button")
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(232, 240, 245)");
  await expect(page.locator(".book-rating-summary span")).toHaveCSS(
    "color",
    "rgb(168, 182, 194)",
  );
  await expect(page.locator(".book-detail-read-action")).toHaveCSS(
    "color",
    "rgb(11, 18, 24)",
  );
  await page.locator(".book-detail-read-action").hover();
  await expect(page.locator(".book-detail-read-action")).toHaveCSS(
    "background-color",
    "rgb(118, 200, 147)",
  );
  await expect(page.locator(".book-detail-read-action")).toHaveCSS(
    "color",
    "rgb(11, 18, 24)",
  );

  const result = await new AxeBuilder({ page })
    .include("#dark-book-contrast-fixture")
    .withRules(["color-contrast"])
    .analyze();
  expect(result.violations).toEqual([]);
  await testInfo.attach("dark-book-contrast-fixture", {
    body: await page.locator("#dark-book-contrast-fixture").screenshot(),
    contentType: "image/png",
  });
});

test("tag metrics use readable text and interactive borders expose a 3:1 role", async ({
  page,
}, testInfo) => {
  await page.goto("/tags", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("body").evaluate((body) => {
    body.insertAdjacentHTML(
      "beforeend",
      `
      <section id="dark-tag-contrast-fixture" class="directory-stream-board" style="background:var(--rin-surface);padding:24px">
        <article class="stream-card">
          <h2>标签活动</h2>
          <div class="stream-metrics"><span>128 阅读</span><span>11 关注</span></div>
        </article>
        <input class="rin-ui-control" aria-label="搜索标签" value="代数几何" />
      </section>
    `,
    );
  });

  await expect
    .poll(() =>
      page
        .locator(".stream-metrics")
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(168, 182, 194)");

  const tokenColors = await page
    .locator("#dark-tag-contrast-fixture")
    .evaluate((element) => {
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        background: getComputedStyle(element).backgroundColor,
        borderStrong: rootStyle.getPropertyValue("--rin-border-strong").trim(),
        borderSubtle: rootStyle.getPropertyValue("--rin-border-subtle").trim(),
      };
    });
  expect(
    contrast(tokenColors.borderStrong, tokenColors.background),
  ).toBeGreaterThanOrEqual(3);
  expect(
    contrast(tokenColors.borderSubtle, tokenColors.background),
  ).toBeGreaterThanOrEqual(2);

  const result = await new AxeBuilder({ page })
    .include("#dark-tag-contrast-fixture")
    .withRules(["color-contrast"])
    .analyze();
  expect(result.violations).toEqual([]);
  await testInfo.attach("dark-tag-contrast-fixture", {
    body: await page.locator("#dark-tag-contrast-fixture").screenshot(),
    contentType: "image/png",
  });
});
