import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { i18n } from "@/i18n";

import SiteTopbarShell, { SiteTopbarHost } from "./SiteTopbarShell";

vi.mock("./SiteTopbar", () => ({
  default: () => <div data-testid="full-site-topbar" />,
}));

describe("SiteTopbarShell anonymous entry", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage("zh-CN");
  });

  it("does not pull the signed-in topbar for an anonymous reader", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/api/identity/v1/session")
        ? JSON.stringify({ status: "anonymous" })
        : JSON.stringify({ items: [] });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <MemoryRouter>
        <ThemeProvider>
          <SiteTopbarHost>
            <SiteTopbarShell />
            <main>页面内容</main>
          </SiteTopbarHost>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });
    expect(screen.queryByTestId("full-site-topbar")).toBeNull();
    expect(screen.getByRole("button", { name: "登录 / 注册" })).toBeTruthy();
  }, 10_000);
});
