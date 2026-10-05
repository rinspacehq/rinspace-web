import type { ReactNode } from "react";

import {
  AnimateFilter,
  AnimateHeartHandshake,
  AnimateLayoutDashboard,
  AnimateShieldCheck,
  AnimateCircleAlert,
  AnimateTerminal,
  AnimateSidebar,
  AnimateSidebarContent,
  AnimateSidebarFooter,
  AnimateSidebarHeader,
  AnimateSidebarInset,
  AnimateSidebarMenu,
  AnimateSidebarMenuButton,
  AnimateSidebarMenuItem,
  AnimateSidebarProvider,
  AnimateSidebarTrigger,
  Badge,
  Button,
} from "components/ui";

import type { AdminWorkspaceAccess } from "./access";
import { adminViewLabel } from "./labels";
import type { AdminView } from "./queryState";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";

const navigationItems: ReadonlyArray<
  Readonly<{
    view: AdminView;
    icon: ReactNode;
  }>
> = [
  {
    view: "home",
    icon: (
      <AnimateLayoutDashboard animateOnHover size={18} aria-hidden="true" />
    ),
  },
  {
    view: "content",
    icon: <AnimateFilter animateOnHover size={18} aria-hidden="true" />,
  },
  {
    view: "review",
    icon: <AnimateShieldCheck animateOnHover size={18} aria-hidden="true" />,
  },
  {
    view: "refunds",
    icon: <AnimateHeartHandshake animateOnHover size={18} aria-hidden="true" />,
  },
  {
    view: "risk",
    icon: <AnimateCircleAlert animateOnHover size={18} aria-hidden="true" />,
  },
  {
    view: "system",
    icon: <AnimateTerminal animateOnHover size={18} aria-hidden="true" />,
  },
];

export function AdminWorkspaceShell({
  access,
  view,
  onViewChange,
  children,
}: {
  access: AdminWorkspaceAccess;
  view: AdminView;
  onViewChange(view: AdminView): void;
  children: ReactNode;
}) {
  const { t } = useFeatureTranslation("admin");
  const visibleItems = navigationItems.filter((item) =>
    access.allowedViews.includes(item.view),
  );
  return (
    <AnimateSidebarProvider
      className="admin-workspace-shell"
      navigationName={t("shell.navigationName")}
      storageKey="rinspace-admin-sidebar-open"
    >
      <AnimateSidebar label={t("shell.navigation")}>
        <AnimateSidebarHeader className="admin-workspace-sidebar-header">
          <Button
            className="admin-workspace-brand"
            onClick={() => onViewChange("home")}
            type="button"
            variant="ghost"
          >
            {t("home.title")}
          </Button>
          <AnimateSidebarTrigger />
        </AnimateSidebarHeader>
        <AnimateSidebarContent>
          <AnimateSidebarMenu>
            {visibleItems.map((item) => {
              const label = adminViewLabel(t, item.view);
              return (
                <AnimateSidebarMenuItem key={item.view}>
                  <AnimateSidebarMenuButton
                    isActive={view === item.view}
                    onClick={() => onViewChange(item.view)}
                    tooltip={label}
                  >
                    {item.icon}
                    <span>{label}</span>
                  </AnimateSidebarMenuButton>
                </AnimateSidebarMenuItem>
              );
            })}
          </AnimateSidebarMenu>
        </AnimateSidebarContent>
        <AnimateSidebarFooter className="admin-workspace-sidebar-footer">
          <Badge tone={access.isAdmin ? "info" : "neutral"}>
            {access.isAdmin ? t("shell.roleAdmin") : t("shell.roleReviewer")}
          </Badge>
        </AnimateSidebarFooter>
      </AnimateSidebar>
      <AnimateSidebarInset className="admin-workspace-main">
        <div className="admin-workspace-mobile-toolbar">
          <AnimateSidebarTrigger />
        </div>
        {children}
      </AnimateSidebarInset>
    </AnimateSidebarProvider>
  );
}
