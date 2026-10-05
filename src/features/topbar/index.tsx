import { forwardRef, type FormHTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { publicEnv } from "@/app/config/env";
import { RinspaceTopbarFrame } from "@/components/shared/RinspaceTopbarFrame";

export function BrandNavigation({
  children,
  sessionState = "anonymous",
}: {
  children?: ReactNode;
  sessionState?: "anonymous" | "restoring" | "authenticated";
}) {
  const { t } = useTranslation("navigation");
  const navigate = useNavigate();
  return (
    <RinspaceTopbarFrame
      sessionState={sessionState}
      logoSrc={`${publicEnv.publicBasePath || ""}/assets/brand/rinspace-mark-128.png`}
      brandName={t("brandName")}
      flipHref="/?world=inner"
      homeHref="/"
      flipLabel={t("flipToInner")}
      homeLabel={t("brandHome")}
      onHomeNavigate={(event) => {
        event.preventDefault();
        navigate("/");
      }}
    >
      {children}
    </RinspaceTopbarFrame>
  );
}

export const DiscoverySearch = forwardRef<
  HTMLFormElement,
  FormHTMLAttributes<HTMLFormElement>
>(function DiscoverySearch({ children, ...props }, ref) {
  return (
    <form {...props} ref={ref} role="search">
      {children}
    </form>
  );
});

export function PublishingActions({ children }: { children: ReactNode }) {
  return <div className="publish-menu">{children}</div>;
}
export function NotificationNavigation({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function SessionMenu({ children }: { children: ReactNode }) {
  return <div className="account-menu">{children}</div>;
}
