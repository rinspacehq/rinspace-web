import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ensureLocaleNamespaces, i18n } from "@/i18n";

import { AdminHomeView } from "./AdminHomeView";
import { AdminWorkspaceShell } from "./AdminWorkspaceShell";
import type { AdminWorkspaceAccess } from "./access";

const adminAccess: AdminWorkspaceAccess = {
  isAdmin: true,
  actorUID: "admin-test",
  canManageContent: true,
  canReview: true,
  canViewRefunds: false,
  canViewRisk: false,
  canViewSystem: false,
  systemSections: {
    overview: false,
    events: false,
    publishing: false,
    consistency: false,
    records: false,
  },
  capabilities: {},
  features: {
    moderationCasesV2: true,
    reportFeedback: false,
    systemOperations: false,
    controlCommands: false,
  },
  walletCapabilities: {
    "wallet.refund.view": false,
    "wallet.refund.review": false,
    "wallet.refund.revoke": false,
    "wallet.policy.view": false,
    "wallet.policy.configure": false,
    "wallet.risk.view": false,
    "wallet.risk.review": false,
    "wallet.risk.restrict": false,
    "wallet.reconciliation.manage": false,
    "wallet.coverage.manage": false,
  },
  allowedViews: ["home", "content", "review"],
};

async function switchLanguage(language: "en" | "zh-CN") {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

beforeAll(async () => {
  await ensureLocaleNamespaces("en", ["admin"]);
  await ensureLocaleNamespaces("zh-CN", ["admin"]);
});

beforeEach(async () => {
  window.localStorage.clear();
  await switchLanguage("zh-CN");
});

afterEach(async () => {
  await switchLanguage("zh-CN");
});

describe("AdminWorkspaceShell", () => {
  it("shows the three admin views and uses management navigation semantics", async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AdminWorkspaceShell
        access={adminAccess}
        view="home"
        onViewChange={onViewChange}
      >
        <main>主页内容</main>
      </AdminWorkspaceShell>,
    );
    expect(
      screen.getByRole("complementary", { name: "管理中心导航" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "管理主页" })
        .getAttribute("aria-current"),
    ).toBe("page");
    await user.click(screen.getByRole("button", { name: "审核台" }));
    expect(onViewChange).toHaveBeenCalledWith("review");
    await user.click(
      screen.getAllByRole("button", { name: "收起管理导航" })[0],
    );
    expect(window.localStorage.getItem("rinspace-admin-sidebar-open")).toBe(
      "false",
    );
  });

  it("does not render unauthorized navigation items", () => {
    render(
      <AdminWorkspaceShell
        access={{
          isAdmin: false,
          actorUID: "reviewer-test",
          canManageContent: false,
          canReview: true,
          canViewRefunds: false,
          canViewRisk: false,
          canViewSystem: false,
          systemSections: {
            overview: false,
            events: false,
            publishing: false,
            consistency: false,
            records: false,
          },
          capabilities: {},
          features: {
            moderationCasesV2: true,
            reportFeedback: false,
            systemOperations: false,
            controlCommands: false,
          },
          walletCapabilities: {
            "wallet.refund.view": false,
            "wallet.refund.review": false,
            "wallet.refund.revoke": false,
            "wallet.policy.view": false,
            "wallet.policy.configure": false,
            "wallet.risk.view": false,
            "wallet.risk.review": false,
            "wallet.risk.restrict": false,
            "wallet.reconciliation.manage": false,
            "wallet.coverage.manage": false,
          },
          allowedViews: ["review"],
        }}
        view="review"
        onViewChange={vi.fn()}
      >
        <main>审核内容</main>
      </AdminWorkspaceShell>,
    );
    expect(screen.getByRole("button", { name: "审核台" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "管理主页" })).toBeNull();
    expect(screen.queryByRole("button", { name: "内容管理" })).toBeNull();
  });

  it("keeps the home view task-first and free of instructional copy", async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();
    render(<AdminHomeView access={adminAccess} onViewChange={onViewChange} />);
    expect(screen.getByRole("heading", { name: "管理中心" })).toBeTruthy();
    expect(screen.getAllByText("可用")).toHaveLength(2);
    expect(screen.queryByText(/你可以|请先|从这里/)).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "打开" })[1]);
    expect(onViewChange).toHaveBeenCalledWith("review");
  });

  it("switches the shell live without changing authorization, active view, or authored children", async () => {
    render(
      <AdminWorkspaceShell
        access={adminAccess}
        view="review"
        onViewChange={vi.fn()}
      >
        <main>管理员保留内容</main>
      </AdminWorkspaceShell>,
    );
    expect(
      screen
        .getByRole("button", { name: "审核台" })
        .getAttribute("aria-current"),
    ).toBe("page");

    await switchLanguage("en");

    expect(
      screen.getByRole("complementary", { name: "Administration navigation" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Review workbench" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByText("管理员保留内容")).toBeTruthy();
  });
});
