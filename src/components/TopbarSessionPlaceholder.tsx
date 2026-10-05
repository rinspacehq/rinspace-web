import { Bell, MoreHorizontal, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function TopbarSessionPlaceholder() {
  const { t } = useTranslation("common");
  return (
    <div
      className="topbar-session-placeholder"
      aria-label={t("accountRestoring")}
      aria-busy="true"
    >
      <span className="topbar-desktop-actions">
        <span
          className="topbar-pill topbar-session-placeholder-control"
          aria-hidden="true"
        >
          <Sparkles size={18} />
        </span>
        <span
          className="topbar-pill topbar-session-placeholder-control"
          aria-hidden="true"
        >
          <Plus size={16} />
        </span>
        <span
          className="notification-pill topbar-session-placeholder-control"
          aria-hidden="true"
        >
          <Bell size={16} />
        </span>
      </span>
      <span className="topbar-compact-actions">
        <span
          className="topbar-pill topbar-session-placeholder-control"
          aria-hidden="true"
        >
          <MoreHorizontal size={18} />
        </span>
      </span>
      <span
        className="account-menu-trigger topbar-session-placeholder-account"
        aria-hidden="true"
      >
        <span className="topbar-session-placeholder-avatar" />
        <span className="topbar-session-placeholder-name" />
      </span>
    </div>
  );
}
