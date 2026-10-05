import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { AnimateButton } from "@/components/ui";
import { i18n } from "@/i18n";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { requestAuthDialog } from "@/utils/authDialog";
import SiteTopbarShell, { SiteTopbarHost } from "./SiteTopbarShell";

function seedStoredAccount({ withSnapshot = false } = {}) {
  window.localStorage.setItem(
    "rinspace-auth-hint",
    JSON.stringify({
      sub: "user-1",
      sessionEpoch: 1,
    }),
  );
  if (!withSnapshot) return;
  window.localStorage.setItem(
    "rinspace-topbar-session-cache",
    JSON.stringify({
      user: { id: "user-1", username: "reader" },
      profile: { nickname: "读者", avatarDataUrl: "" },
      nickname: "读者",
      avatarDataUrl: "",
      publicUserId: "reader",
      isAdmin: false,
      isModerator: false,
      cachedAt: Date.now(),
    }),
  );
}

function RouteControl() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <AnimateButton
      unstyled
      type="button"
      onClick={() => navigate("/questions")}
    >
      {location.pathname}
    </AnimateButton>
  );
}

function renderHostedTopbar(onSessionChange?: () => void | Promise<void>) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SiteTopbarHost>
          <SiteTopbarShell onSessionChange={onSessionChange} />
          <main>页面内容</main>
          <RouteControl />
        </SiteTopbarHost>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("SiteTopbarHost", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });
    vi.restoreAllMocks();
  });

  it("renders one persistent header while page slots register only", () => {
    const { container } = renderHostedTopbar();
    expect(container.querySelectorAll("header.topbar")).toHaveLength(1);
    expect(screen.getByText("页面内容")).toBeTruthy();
  });

  it("preserves the same header node across route navigation", async () => {
    const user = userEvent.setup();
    const { container } = renderHostedTopbar();
    const header = container.querySelector<HTMLElement>("header.topbar");

    await user.click(screen.getByRole("button", { name: "/" }));

    expect(screen.getByRole("button", { name: "/questions" })).toBeTruthy();
    expect(container.querySelector("header.topbar")).toBe(header);
  });

  it("never presents a stored session as anonymous while it restores", () => {
    seedStoredAccount();

    renderHostedTopbar();

    expect(screen.queryByRole("button", { name: "登录 / 注册" })).toBeNull();
    expect(screen.getByLabelText("正在恢复账户")).toBeTruthy();
  });

  it("keeps the cached identity and brand nodes while the full topbar loads", async () => {
    seedStoredAccount({ withSnapshot: true });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("network unavailable"),
    );

    const { container } = renderHostedTopbar();
    const header = container.querySelector<HTMLElement>("header.topbar");
    const brand = container.querySelector(".brand");
    const brandWord = container.querySelector(".brand-word");

    expect(screen.getAllByText("读者").length).toBeGreaterThan(0);
    expect(header?.dataset.sessionState).toBe("authenticated");

    await screen.findByRole("button", { name: "账户菜单" }, { timeout: 5_000 });

    expect(container.querySelector("header.topbar")).toBe(header);
    expect(container.querySelector(".brand")).toBe(brand);
    expect(container.querySelector(".brand-word")).toBe(brandWord);
    expect(screen.getAllByText("读者").length).toBeGreaterThan(0);
    expect(
      Array.from(
        header?.querySelectorAll(
          ".account-nav :is(.topbar-pill, .notification-pill, .account-menu-trigger)",
        ) ?? [],
        (control) => control.getAttribute("aria-label"),
      ),
    ).toEqual([
      "切换到深色主题",
      "创作中心",
      "创作",
      "通知",
      "更多",
      "账户菜单",
    ]);
  });

  it("keeps compact actions in the approved more-menu order", async () => {
    seedStoredAccount({ withSnapshot: true });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("network unavailable"),
    );
    renderHostedTopbar();

    await userEvent.click(await screen.findByRole("button", { name: "更多" }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent?.trim()),
    ).toEqual(["创作中心", "创作", "通知", "切换到深色主题"]);
  });

  it("keeps anonymous compact controls separate from the search entry", () => {
    const { container } = renderHostedTopbar();
    const accountNav = container.querySelector(".account-nav");

    expect(
      accountNav?.querySelector('.topbar-compact-actions [aria-label="更多"]'),
    ).toBeTruthy();
    expect(
      accountNav?.querySelector(
        '.topbar-auth-control[aria-label="登录 / 注册"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('.topbar-search [aria-label="打开搜索"]'),
    ).toBeTruthy();
  });

  it("keeps the established publish icon and exposes the approved menu order", async () => {
    seedStoredAccount({ withSnapshot: true });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("network unavailable"),
    );
    renderHostedTopbar();

    const publishButton = await screen.findByRole("button", { name: "创作" });
    expect(publishButton.querySelector("svg")).toBeTruthy();
    await userEvent.click(publishButton);

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent?.trim()),
    ).toEqual(["文章", "书籍", "标签", "推文"]);
    expect(screen.queryByRole("menuitem", { name: "问题" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "讨论" })).toBeNull();
  });

  it("keeps the restoring state when session refresh is temporarily unavailable", async () => {
    seedStoredAccount();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("network unavailable"));

    const { container } = renderHostedTopbar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });

    expect(screen.getByLabelText("正在恢复账户")).toBeTruthy();
    expect(screen.queryByText("Rin 用户")).toBeNull();
    expect(screen.queryByRole("button", { name: "账户菜单" })).toBeNull();
    expect(
      container.querySelector<HTMLElement>("header.topbar")?.dataset
        .sessionState,
    ).toBe("restoring");
    expect(window.localStorage.getItem("rinspace-auth-hint")).not.toBeNull();
    fetchMock.mockRestore();
  }, 10_000);

  it("restores the real identity after a temporary session refresh failure", async () => {
    seedStoredAccount();
    let authRequestCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/identity/v1/session")) {
        authRequestCount += 1;
        if (authRequestCount === 1) {
          throw new TypeError("network unavailable");
        }
        return new Response(JSON.stringify({ status: "authenticated", csrfToken: "csrf", user: { id: "user-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/profile")) {
        return new Response("", { status: 404 });
      }
      if (url.endsWith("/api/user/info")) {
        return new Response(
          JSON.stringify({
            id: "user-1",
            created_at: 1,
            last_login_date: 1,
            username: "reader",
            display_name: "月见",
            avatar: {
              type: "custom",
              gravatar: "",
              custom: "https://example.com/avatar.png",
            },
            cover_url: "",
            mobile: "",
            bio: "",
            bio_html: "",
            website: "",
            location: "",
            about_html: "",
            language: "",
            color_scheme: "system",
            access_token: "",
            role_id: 1,
            role_name: "member",
            rank: 0,
            status: "available",
            have_password: false,
            visit_token: "",
            suspended_until: 0,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderHostedTopbar();

    expect(screen.getByLabelText("正在恢复账户")).toBeTruthy();
    const accountMenu = await screen.findByRole(
      "button",
      { name: "账户菜单" },
      { timeout: 5_000 },
    );
    expect(authRequestCount).toBe(2);
    expect(accountMenu.textContent).toContain("月见");
    expect(accountMenu.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/avatar.png",
    );
    expect(screen.queryByText("Rin 用户")).toBeNull();
  }, 10_000);

  it("keeps the account placeholder until the public nickname and avatar are resolved", async () => {
    seedStoredAccount();
    let resolveCurrentUserInfo: ((response: Response) => void) | undefined;
    const currentUserInfoResponse = new Promise<Response>((resolve) => {
      resolveCurrentUserInfo = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/identity/v1/session")) {
        return new Response(
          JSON.stringify({ status: "authenticated", csrfToken: "csrf", user: { id: "user-1", username: "reader" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.endsWith("/api/profile")) {
        return new Response("", { status: 404 });
      }
      if (url.endsWith("/api/user/info")) {
        return currentUserInfoResponse;
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderHostedTopbar();

    await waitFor(() => {
      expect(screen.getByLabelText("正在恢复账户")).toBeTruthy();
      expect(screen.queryByText("Rin 用户")).toBeNull();
      expect(screen.queryByRole("button", { name: "账户菜单" })).toBeNull();
    });

    resolveCurrentUserInfo?.(
      new Response(
        JSON.stringify({
          id: "user-1",
          created_at: 1,
          last_login_date: 1,
          username: "reader",
          display_name: "月见",
          avatar: {
            type: "custom",
            gravatar: "",
            custom: "https://example.com/avatar.png",
          },
          cover_url: "",
          mobile: "",
          bio: "",
          bio_html: "",
          website: "",
          location: "",
          about_html: "",
          language: "",
          color_scheme: "system",
          access_token: "",
          role_id: 1,
          role_name: "member",
          rank: 0,
          status: "available",
          have_password: false,
          visit_token: "",
          suspended_until: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const accountMenu = await screen.findByRole("button", { name: "账户菜单" });
    expect(accountMenu.textContent).toContain("月见");
    expect(accountMenu.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/avatar.png",
    );
    expect(screen.queryByText("Rin 用户")).toBeNull();
  }, 10_000);

  it("notifies the active page after the persistent account signs out", async () => {
    const user = userEvent.setup();
    const onSessionChange = vi.fn();
    seedStoredAccount({ withSnapshot: true });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        const body = url.endsWith("/api/identity/v1/session")
          ? JSON.stringify({ status: "authenticated", csrfToken: "csrf", user: { id: "user-1", username: "reader" } })
          : "{}";
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
    renderHostedTopbar(onSessionChange);

    await user.click(
      await screen.findByRole(
        "button",
        { name: "账户菜单" },
        { timeout: 5_000 },
      ),
    );
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    fetchMock.mockRestore();
  }, 10_000);

  it("opens the login dialog on the first activation", async () => {
    const user = userEvent.setup();
    renderHostedTopbar();

    await user.click(screen.getByRole("button", { name: "登录 / 注册" }));
    expect(
      await screen.findByRole(
        "textbox",
        { name: "手机号" },
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
  }, 10000);

  it("opens login from an in-page request without replacing the reading URL", async () => {
    const { container } = renderHostedTopbar();

    act(() => requestAuthDialog());

    expect(
      await screen.findByRole(
        "textbox",
        { name: "手机号" },
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.textContent === "/",
      ),
    ).toBe(true);
  }, 10000);

  it("renders the restored account shell in English", async () => {
    window.localStorage.setItem(
      "rinspace-language-preference-v1",
      JSON.stringify({ preference: "en" }),
    );
    seedStoredAccount({ withSnapshot: true });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/api/identity/v1/session")
        ? JSON.stringify({ status: "authenticated", csrfToken: "csrf", user: { id: "user-1", username: "reader" } })
        : "{}";
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <LanguageProvider>
        <MemoryRouter>
          <ThemeProvider>
            <SiteTopbarHost>
              <SiteTopbarShell />
            </SiteTopbarHost>
          </ThemeProvider>
        </MemoryRouter>
      </LanguageProvider>,
    );

    const menu = await screen.findByRole("button", { name: "Account menu" });
    await userEvent.click(menu);
    expect(screen.getByRole("menuitem", { name: "Profile" })).toBeTruthy();
    const walletItem = screen.getByRole("menuitem", { name: "Wallet" });
    expect(walletItem.getAttribute('href')).toBe('/wallet');
    expect(walletItem.querySelector('[data-animate-ui-icon="wallet"]')).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Profile', 'Wallet', 'Account settings', 'Sign out']);
    expect(
      screen.getByRole("menuitem", { name: "Account settings" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });
});
