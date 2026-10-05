import { AnimateButton } from "components/ui";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { i18n } from "@/i18n";

import {
  BrandNavigation,
  DiscoverySearch,
  NotificationNavigation,
  PublishingActions,
  SessionMenu,
} from "./index";

describe("topbar feature boundaries", () => {
  it("localizes independent world-flip and current-home brand controls", async () => {
    await i18n.changeLanguage("zh-CN");
    const { container } = render(
      <MemoryRouter>
        <BrandNavigation />
        <DiscoverySearch aria-label="发现">
          <input aria-label="查询" />
        </DiscoverySearch>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "翻到里世界" }).getAttribute("href"),
    ).toBe("/?world=inner");
    expect(
      screen.getByRole("link", { name: "芥子环首页" }).getAttribute("href"),
    ).toBe("/");
    expect(container.querySelector(".brand-word")?.textContent).toBe("芥子环");
    expect(container.querySelector(".brand-word-text")?.textContent).toBe(
      "芥子环",
    );
    expect(container.querySelector(".brand-word-motion")).toBeNull();
    expect(
      container.querySelector<HTMLImageElement>(".brand-mark img")?.src,
    ).toContain("/assets/brand/rinspace-mark-128.png");
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".brand-word-motion > span > span",
        ),
      ).every(
        (letter) =>
          letter.style.transform === "" && letter.style.clipPath === "",
      ),
    ).toBe(true);
    expect(i18n.t("routes.home", { ns: "common" })).toContain("芥子环");
    expect(screen.getByRole("search", { name: "发现" })).toBeTruthy();

    await act(async () => i18n.changeLanguage("en"));
    expect(
      screen
        .getByRole("link", { name: "Flip to the inner world" })
        .getAttribute("href"),
    ).toBe("/?world=inner");
    expect(
      screen.getByRole("link", { name: "Rinspace home" }).getAttribute("href"),
    ).toBe("/");
    expect(container.querySelector(".brand-word")?.textContent).toBe(
      "Rinspace",
    );
    expect(i18n.t("routes.home", { ns: "common" })).toContain("Rinspace");

    await act(async () => i18n.changeLanguage("zh-CN"));
  });
  it("retains independent publishing, notification and session regions", () => {
    const { container } = render(
      <>
        <PublishingActions>
          <AnimateButton unstyled>发布</AnimateButton>
        </PublishingActions>
        <NotificationNavigation>
          <a href="/notifications">通知</a>
        </NotificationNavigation>
        <SessionMenu>
          <AnimateButton unstyled>账户</AnimateButton>
        </SessionMenu>
      </>,
    );
    expect(container.querySelector(".publish-menu")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "通知" }).getAttribute("href"),
    ).toBe("/notifications");
    expect(container.querySelector(".account-menu")).toBeTruthy();
  });
});
