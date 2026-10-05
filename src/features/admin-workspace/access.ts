import type {
  AdminSystemSection,
  AdminWorkspaceCapabilitiesResponse,
} from "@/services/domains/operations";

import type { AdminView } from "./queryState";
import type { WalletAdminCapabilities } from "@/services/domains/walletAdmin";

export type AdminWorkspaceAccess = Readonly<{
  isAdmin: boolean;
  actorUID: string;
  canManageContent: boolean;
  canReview: boolean;
  canViewRefunds: boolean;
  canViewRisk: boolean;
  canViewSystem: boolean;
  systemSections: Readonly<Record<AdminSystemSection, boolean>>;
  capabilities: Readonly<Record<string, boolean>>;
  features: AdminWorkspaceCapabilitiesResponse["features"];
  walletCapabilities: WalletAdminCapabilities;
  allowedViews: readonly AdminView[];
}>;

export type AdminWorkspaceAccessState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; access: AdminWorkspaceAccess }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "unavailable" }>;

export type AdminIdentitySignals = Readonly<{
  uid?: string;
  isAdmin: boolean;
  isModerator: boolean;
}>;

export function deriveAdminWorkspaceAccess(
  identity: AdminIdentitySignals,
  capabilities: AdminWorkspaceCapabilitiesResponse,
  walletCapabilities: WalletAdminCapabilities = Object.freeze({
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
  }),
): AdminWorkspaceAccess {
  const isAdmin = identity.isAdmin || capabilities.views.home;
  const canManageContent = capabilities.views.content;
  const canReview = capabilities.views.review;
  const canViewRefunds = walletCapabilities["wallet.refund.view"];
  const canViewRisk = walletCapabilities["wallet.risk.view"];
  const allowedViews: AdminView[] = [];
  if (capabilities.views.home) allowedViews.push("home");
  if (canManageContent) allowedViews.push("content");
  if (canReview) allowedViews.push("review");
  if (canViewRefunds) allowedViews.push("refunds");
  if (canViewRisk) allowedViews.push("risk");
  if (capabilities.views.system) allowedViews.push("system");
  return {
    isAdmin,
    actorUID: identity.uid || "",
    canManageContent,
    canReview,
    canViewRefunds,
    canViewRisk,
    canViewSystem: capabilities.views.system,
    systemSections: capabilities.systemSections,
    capabilities: capabilities.capabilities,
    features: capabilities.features,
    walletCapabilities,
    allowedViews,
  };
}

function errorStatus(error: unknown) {
  return error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 0;
}

export function adminWorkspaceFailureState(
  error: unknown,
): AdminWorkspaceAccessState {
  const status = errorStatus(error);
  if (status === 401 || status === 403) return { kind: "denied" };
  return { kind: "unavailable" };
}

export function firstAllowedAdminView(
  access: AdminWorkspaceAccess,
  requested: AdminView,
): AdminView | null {
  if (access.allowedViews.includes(requested)) return requested;
  return access.allowedViews[0] ?? null;
}
