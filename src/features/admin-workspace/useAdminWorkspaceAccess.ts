import { useEffect, useState } from "react";

import { publicEnv } from "@/app/config/env";
import { loadCurrentUserInfo } from "@/services/domains/identity";
import { loadAdminWorkspaceCapabilities } from "@/services/domains/operations";
import {
  loadWalletAdminCapabilities,
  type WalletAdminCapabilities,
} from "@/services/domains/walletAdmin";
import { getCurrentUser, normalizePhone, sha256Hex } from "@/services/profile";

import {
  adminWorkspaceFailureState,
  deriveAdminWorkspaceAccess,
  type AdminIdentitySignals,
  type AdminWorkspaceAccessState,
} from "./access";

const adminPhoneHash = publicEnv.adminPhoneSha256 || "";

async function loadIdentitySignals(): Promise<AdminIdentitySignals | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const phoneHash = user.phone
    ? await sha256Hex(normalizePhone(user.phone))
    : "";
  const current = await loadCurrentUserInfo().catch(() => null);
  const isAdmin =
    Boolean(adminPhoneHash && phoneHash === adminPhoneHash) ||
    current?.role_id === 2 ||
    current?.role_name === "admin";
  return {
    uid: user.id,
    isAdmin,
    isModerator: isAdmin ||
      current?.role_id === 3 ||
      current?.role_name === "moderator",
  };
}

export function useAdminWorkspaceAccess() {
  const [state, setState] = useState<AdminWorkspaceAccessState>({
    kind: "loading",
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const identity = await loadIdentitySignals();
        if (!identity) {
          if (active) setState({ kind: "denied" });
          return;
        }
        const [workspaceResult, walletResult] = await Promise.allSettled([
          loadAdminWorkspaceCapabilities(),
          loadWalletAdminCapabilities(),
        ]);
        const walletCapabilities: WalletAdminCapabilities =
          walletResult.status === "fulfilled"
            ? walletResult.value
            : Object.freeze({
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
              });
        if (
          workspaceResult.status === "rejected" &&
          !walletCapabilities["wallet.refund.view"] &&
          !walletCapabilities["wallet.risk.view"]
        )
          throw workspaceResult.reason;
        const capabilities =
          workspaceResult.status === "fulfilled"
            ? workspaceResult.value
            : {
                views: {
                  home: false,
                  content: false,
                  review: false,
                  system: false,
                },
                systemSections: {
                  overview: false,
                  events: false,
                  publishing: false,
                  consistency: false,
                  records: false,
                },
                capabilities: {},
                features: {
                  moderationCasesV2: false,
                  reportFeedback: false,
                  systemOperations: false,
                  controlCommands: false,
                },
              };
        const access = deriveAdminWorkspaceAccess(
          identity,
          capabilities,
          walletCapabilities,
        );
        if (!active) return;
        setState(
          access.allowedViews.length
            ? { kind: "ready", access }
            : { kind: "denied" },
        );
      } catch (error: unknown) {
        console.error("Admin workspace access failed", error);
        if (active) setState(adminWorkspaceFailureState(error));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
