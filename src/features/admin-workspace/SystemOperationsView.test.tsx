import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ensureLocaleNamespaces, i18n } from "@/i18n";
import type {
  OperationsControlStatus,
  OperationsEventItem,
} from "@/services/domains/operations";

const api = vi.hoisted(() => ({
  applyOperationsReconciliation: vi.fn(),
  loadOperationsAuditPage: vi.fn(),
  loadOperationsControlStatus: vi.fn(),
  loadOperationsEventPage: vi.fn(),
  loadOperationsFindings: vi.fn(),
  loadOperationsReplayReview: vi.fn(),
  replayOperationsEvent: vi.fn(),
  runOperationsReconciliationDryRun: vi.fn(),
}));

vi.mock("@/services/domains/operations", () => ({
  ...api,
  operationsCapability: {
    controlDryRun: "operations.control.dry_run",
    controlApply: "operations.control.apply",
    eventReplay: "operations.control.event_replay",
  },
}));

import { SystemOperationsView } from "./SystemOperationsView";
import type { AdminWorkspaceAccess } from "./access";

const status: OperationsControlStatus = {
  state: "available",
  sampledAt: "2026-08-28T08:00:00Z",
  dependencies: {
    controlPlane: "available",
    gitea: "available",
    renderer: "available",
    codeServer: "available",
  },
  events: {
    inboxPending: 1234,
    inboxQuarantined: 1,
    inboxOldestAgeSeconds: 900,
    outboxPending: 0,
    outboxDead: 0,
    outboxOldestAgeSeconds: 0,
    giteaEffectsPending: 0,
    giteaEffectsDead: 0,
  },
  publishing: {
    provisionPending: 0,
    provisionFailed24h: 0,
    provisionP95Seconds: 0,
    publicationActive: 2,
    publicationFailed24h: 0,
    publicationDriftOpen: 0,
    pushObservationP95Seconds: 0,
    queueWaitP95Seconds: 3,
    renderDurationP95Seconds: 8,
    activationDelayP95Seconds: 2,
  },
  consistency: {
    branchPolicyDrift: 0,
    reconciliationRequired: 0,
    openFindings: 0,
    manualFindings: 0,
    reconciliationRepairRatio: 1,
  },
};

const event: OperationsEventItem = {
  id: 77,
  kind: "inbox",
  source: "renderer",
  eventId: "event-77",
  eventType: "CONTENT_RENDER_FAILED",
  schemaVersion: "v1",
  state: "quarantined",
  attemptCount: 3,
  lastErrorCode: "RENDER_TIMEOUT",
  occurredAt: "2026-08-28T07:30:00Z",
  processedAt: "",
  updatedAt: "2026-08-28T07:45:00Z",
};

const access: AdminWorkspaceAccess = {
  isAdmin: true,
  actorUID: "admin-test",
  canManageContent: true,
  canReview: true,
  canViewRefunds: false,
  canViewRisk: false,
  canViewSystem: true,
  systemSections: {
    overview: true,
    events: true,
    publishing: true,
    consistency: true,
    records: true,
  },
  capabilities: { "operations.control.event_replay": true },
  features: {
    moderationCasesV2: true,
    reportFeedback: true,
    systemOperations: true,
    controlCommands: true,
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
  allowedViews: ["home", "content", "review", "system"],
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
  await switchLanguage("en");
  api.loadOperationsControlStatus.mockReset();
  api.loadOperationsEventPage.mockReset();
  api.loadOperationsReplayReview.mockReset();
  api.loadOperationsControlStatus.mockResolvedValue(status);
  api.loadOperationsEventPage.mockResolvedValue({
    items: [event],
    nextCursor: "",
  });
  api.loadOperationsReplayReview.mockResolvedValue({
    ...event,
    replayable: true,
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  await switchLanguage("zh-CN");
});

describe("SystemOperationsView localization", () => {
  it("localizes operational states while retaining system codes and command drafts", async () => {
    const user = userEvent.setup();
    render(
      <SystemOperationsView
        access={access}
        section="events"
        onSectionChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("CONTENT_RENDER_FAILED")).toBeTruthy();
    expect(screen.getByText("Quarantined")).toBeTruthy();
    expect(screen.getByText("1,234")).toBeTruthy();
    expect(screen.getByText("15 minutes")).toBeTruthy();
    expect(screen.getByText("RENDER_TIMEOUT")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Replay" }));
    expect(
      await screen.findByRole("heading", { name: "Replay quarantined event" }),
    ).toBeTruthy();
    const reason = screen.getByLabelText(
      "Operation reason",
    ) as HTMLTextAreaElement;
    await user.type(reason, "retain this command draft");

    await switchLanguage("zh-CN");

    expect(screen.getByRole("heading", { name: "重放隔离事件" })).toBeTruthy();
    expect(
      (screen.getByLabelText("操作原因") as HTMLTextAreaElement).value,
    ).toBe("retain this command draft");
    expect(screen.getAllByText("CONTENT_RENDER_FAILED").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("RENDER_TIMEOUT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已隔离").length).toBeGreaterThan(0);
  });
});
