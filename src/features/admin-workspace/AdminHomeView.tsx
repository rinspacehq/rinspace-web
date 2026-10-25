import {
  AnimateFilter,
  AnimateShieldCheck,
  AnimateTerminal,
  Badge,
  Button,
  Surface,
} from "components/ui";

import type { AdminWorkspaceAccess } from "./access";
import { adminViewLabel } from "./labels";
import type { AdminView } from "./queryState";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";

export function AdminHomeView({
  access,
  onViewChange,
}: {
  access: AdminWorkspaceAccess;
  onViewChange(view: AdminView): void;
}) {
  const { t } = useFeatureTranslation("admin");
  return (
    <section
      className="admin-workspace-view admin-home-view"
      aria-label={t("home.title")}
    >
      <div className="admin-home-list">
        {access.canManageContent ? (
          <Surface className="admin-home-row">
            <AnimateFilter size={20} aria-hidden="true" />
            <strong>{adminViewLabel(t, "content")}</strong>
            <Badge tone="success">{t("shared.available")}</Badge>
            <Button onClick={() => onViewChange("content")} variant="ghost">
              {t("shared.open")}
            </Button>
          </Surface>
        ) : null}
        {access.canReview ? (
          <Surface className="admin-home-row">
            <AnimateShieldCheck size={20} aria-hidden="true" />
            <strong>{adminViewLabel(t, "review")}</strong>
            <Badge tone="success">{t("shared.available")}</Badge>
            <Button onClick={() => onViewChange("review")} variant="ghost">
              {t("shared.open")}
            </Button>
          </Surface>
        ) : null}
        {access.canViewSystem ? (
          <Surface className="admin-home-row">
            <AnimateTerminal size={20} aria-hidden="true" />
            <strong>{adminViewLabel(t, "system")}</strong>
            <Badge tone="success">{t("shared.available")}</Badge>
            <Button onClick={() => onViewChange("system")} variant="ghost">
              {t("shared.open")}
            </Button>
          </Surface>
        ) : null}
      </div>
    </section>
  );
}
