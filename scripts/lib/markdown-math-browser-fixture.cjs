const diagramPath = "/__math-fixtures__/diagram.svg";
const fixtureSession = Object.freeze({
  status: "authenticated",
  csrfToken: "playwright-csrf",
  user: {
    id: "math-fixture-author",
    username: "math-fixture-author",
    role: "member",
    sessionEpoch: 1,
    identityVersion: 1,
  },
  currentSession: {
    sid: "playwright-math-fixture-author",
    authMethod: "sms",
    version: 1,
  },
});

function checkedFixtureOrigin(targetUrl) {
  const url = new URL(targetUrl);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Isolated markdown math checks require an HTTP loopback URL.",
    );
  }
  return url.origin;
}

async function installMarkdownMathBrowserFixture(page, targetUrl) {
  const origin = checkedFixtureOrigin(targetUrl);
  const blockedRequests = [];
  await page.addInitScript(() => {
    localStorage.setItem(
      "rinspace-auth-hint",
      JSON.stringify({ sub: "math-fixture-author" }),
    );
    localStorage.setItem(
      "rinspace-language-preference-v1",
      JSON.stringify({ preference: "zh-CN" }),
    );
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      blockedRequests.push(url.origin);
      await route.abort("blockedbyclient");
      return;
    }
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, "");
    if (pathname === diagramPath) {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32"><text x="4" y="20">A → B</text></svg>',
      });
      return;
    }
    if (pathname === "/auth/v1/user/me") {
      await route.fulfill({
        json: {
          sub: fixtureSession.user.id,
          username: fixtureSession.user.username,
        },
      });
      return;
    }
    if (/^\/(?:api|auth|rin\/api)(?:\/|$)/.test(pathname)) {
      if (pathname === "/api/identity/v1/session") {
        await route.fulfill({ json: fixtureSession });
      } else if (pathname === "/api/rin-writer/draft") {
        await route.fulfill({ status: 204 });
      } else if (route.request().method() === "GET") {
        await route.fulfill({ json: {} });
      } else {
        blockedRequests.push(`${route.request().method()} ${pathname}`);
        await route.fulfill({
          status: 405,
          json: { error: "Unsupported fixture operation" },
        });
      }
      return;
    }
    await route.continue();
  });
  return blockedRequests;
}

module.exports = {
  diagramPath,
  fixtureSession,
  checkedFixtureOrigin,
  installMarkdownMathBrowserFixture,
};
