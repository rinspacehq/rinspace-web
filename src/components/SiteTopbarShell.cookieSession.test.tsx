import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { i18n } from "@/i18n";

import SiteTopbarShell, { SiteTopbarHost } from "./SiteTopbarShell";

vi.mock("./SiteTopbar", () => ({
  default: () => <div data-testid="full-site-topbar" />,
}));

describe("SiteTopbarShell cookie session", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage("zh-CN");
  });

  it("promotes a cookie-only session with no local display hint", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/api/identity/v1/session")
        ? JSON.stringify({
            status: "authenticated",
            csrfToken: "csrf",
            user: { id: "user-1", username: "reader" },
          })
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

    expect(await screen.findByTestId("full-site-topbar")).toBeTruthy();
  }, 10_000);
});
