import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Search, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/app/providers/ThemeProvider";
import AvatarName from "@/components/AvatarName";
import TopbarSessionPlaceholder from "@/components/TopbarSessionPlaceholder";
import {
  RinspaceTopbarAnonymousActionBar,
  RinspaceTopbarCompactMenuControl,
  RinspaceTopbarControls,
} from "@/components/shared/RinspaceTopbarFrame";
import {
  AnimateIconButton,
  AnimateThemeToggler,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tooltip,
} from "components/ui";
import { BrandNavigation } from "features/topbar";
import { getCurrentAuthUser, getStoredSession } from "@/services/phoneAuth";
import {
  readTopbarSessionSnapshot,
  topbarSessionDisplayName,
} from "@/services/topbarSessionSnapshot";
import { authDialogRequestEvent } from "@/utils/authDialog";

type SiteTopbarProps = {
  ariaLabel?: string;
  onSessionChange?: () => void | Promise<void>;
  authRequestVersion?: number;
};

type SessionPresentation = "anonymous" | "restoring" | "authenticated";

type RegisterSessionChange = (
  callback: () => void | Promise<void>,
) => () => void;

const SiteTopbarHostContext = createContext<RegisterSessionChange | null>(null);
const loadFullSiteTopbar = () => import("./SiteTopbar");
const FullSiteTopbar = lazy(loadFullSiteTopbar);

function SiteTopbarInstance({ ariaLabel, onSessionChange }: SiteTopbarProps) {
  const { t } = useTranslation("navigation");
  const [cachedSnapshot] = useState(() => readTopbarSessionSnapshot());
  const [interactive, setInteractive] = useState(() =>
    Boolean(getStoredSession()),
  );
  const [sessionPresentation, setSessionPresentation] =
    useState<SessionPresentation>(() =>
      cachedSnapshot
        ? "authenticated"
        : getStoredSession()
          ? "restoring"
          : "anonymous",
    );
  const [authRequestVersion, setAuthRequestVersion] = useState(0);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { resolved, setPreference } = useTheme();
  const themeLabel =
    resolved === "light" ? t("theme.toDark") : t("theme.toLight");
  const toggleTheme = () =>
    setPreference(resolved === "light" ? "dark" : "light");
  const themeControl = (
    <AnimateThemeToggler
      className="topbar-pill"
      label={themeLabel}
      resolved={resolved}
      onToggle={toggleTheme}
    />
  );
  const compactMenu = {
    label: t("more.label"),
    render: (trigger: ReactNode) => (
      <Menu open={compactMenuOpen} onOpenChange={setCompactMenuOpen}>
        <Tooltip content={t("more.label")}>
          <MenuTrigger asChild>{trigger}</MenuTrigger>
        </Tooltip>
        <MenuContent align="end" sideOffset={8}>
          <MenuItem onSelect={toggleTheme}>
            {resolved === "light" ? <Moon size={16} /> : <Sun size={16} />}
            <span>{themeLabel}</span>
          </MenuItem>
        </MenuContent>
      </Menu>
    ),
  };

  const activateLogin = useCallback(() => {
    void loadFullSiteTopbar();
    setInteractive(true);
    setAuthRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    // HttpOnly cookies remain authoritative even when the optional local display
    // hint was cleared, so every page eventually runs the read-only bootstrap.
    // The probe itself stays on the lightweight shell: the full topbar owns the
    // publish dialogs, the PDF and maths renderers and the editor, and loading it
    // for anonymous readers pushes those into the public entry bundle.
    if (getStoredSession()) {
      setInteractive(true);
      return undefined;
    }
    let cancelled = false;
    void getCurrentAuthUser()
      .then((user) => {
        if (!cancelled && user) setInteractive(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.addEventListener(authDialogRequestEvent, activateLogin);
    return () =>
      window.removeEventListener(authDialogRequestEvent, activateLogin);
  }, [activateLogin]);

  useEffect(() => {
    if (!mobileSearchOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !searchFormRef.current?.contains(event.target)
      ) {
        setMobileSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [mobileSearchOpen]);

  const lightweightControls = (
    <RinspaceTopbarControls
      navigationLabel={ariaLabel || t("landmark")}
      search={
        <form
          ref={searchFormRef}
          className={
            mobileSearchOpen
              ? "topbar-search mobile-search-open"
              : "topbar-search"
          }
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = query.trim();
            if (next) {
              navigate(`/search?q=${encodeURIComponent(next)}`);
            } else {
              setMobileSearchOpen(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !mobileSearchOpen) return;
            event.preventDefault();
            setMobileSearchOpen(false);
            searchInputRef.current?.blur();
          }}
        >
          <input
            ref={searchInputRef}
            value={query}
            maxLength={60}
            placeholder={t("search.placeholder")}
            aria-label={t("search.community")}
            onFocus={() => setMobileSearchOpen(true)}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <AnimateIconButton
            icon={<Search />}
            label={mobileSearchOpen ? t("search.label") : t("search.open")}
            type="submit"
            onClick={(event) => {
              if (
                !window.matchMedia("(max-width: 620px)").matches ||
                mobileSearchOpen
              ) {
                return;
              }
              event.preventDefault();
              setMobileSearchOpen(true);
              setCompactMenuOpen(false);
              window.requestAnimationFrame(() =>
                searchInputRef.current?.focus(),
              );
            }}
          />
        </form>
      }
    >
      {cachedSnapshot ? (
        <>
          <span className="topbar-desktop-actions">{themeControl}</span>
          <RinspaceTopbarCompactMenuControl compactMenu={compactMenu} />
          <span className="account-menu-trigger" aria-label={t("account.menu")}>
            <AvatarName
              name={topbarSessionDisplayName(cachedSnapshot)}
              imageUrl={
                cachedSnapshot.profile?.avatarDataUrl ||
                cachedSnapshot.avatarDataUrl
              }
            />
          </span>
        </>
      ) : sessionPresentation === "restoring" ? (
        <TopbarSessionPlaceholder />
      ) : (
        <RinspaceTopbarAnonymousActionBar
          themeControl={themeControl}
          compactMenu={compactMenu}
          authentication={{
            label: t("account.signInOrRegister"),
            onSelect: activateLogin,
            onFocus: () => void loadFullSiteTopbar(),
            onPointerEnter: () => void loadFullSiteTopbar(),
          }}
        />
      )}
    </RinspaceTopbarControls>
  );

  return (
    <BrandNavigation sessionState={sessionPresentation}>
      {interactive ? (
        <Suspense fallback={lightweightControls}>
          <FullSiteTopbar
            ariaLabel={ariaLabel}
            onSessionChange={onSessionChange}
            authRequestVersion={authRequestVersion}
            onSessionPresentationChange={setSessionPresentation}
          />
        </Suspense>
      ) : (
        lightweightControls
      )}
    </BrandNavigation>
  );
}

export function SiteTopbarHost({ children }: { children: ReactNode }) {
  const sessionChangeCallbacks = useRef(new Set<() => void | Promise<void>>());
  const registerSessionChange = useCallback<RegisterSessionChange>(
    (callback) => {
      sessionChangeCallbacks.current.add(callback);
      return () => sessionChangeCallbacks.current.delete(callback);
    },
    [],
  );
  const notifySessionChange = useCallback(async () => {
    await Promise.all(
      Array.from(sessionChangeCallbacks.current, (callback) => callback()),
    );
  }, []);

  return (
    <SiteTopbarHostContext.Provider value={registerSessionChange}>
      <div className="rin-app-shell">
        <SiteTopbarInstance onSessionChange={notifySessionChange} />
        {children}
      </div>
    </SiteTopbarHostContext.Provider>
  );
}

export default function SiteTopbarShell(props: SiteTopbarProps) {
  const registerSessionChange = useContext(SiteTopbarHostContext);
  const onSessionChange = props.onSessionChange;

  useEffect(() => {
    if (!registerSessionChange || !onSessionChange) return undefined;
    return registerSessionChange(onSessionChange);
  }, [onSessionChange, registerSessionChange]);

  if (registerSessionChange) return null;
  return <SiteTopbarInstance {...props} />;
}
