import {
  AnimateThemeToggler,
  AnimateBell,
  AnimateBellRing,
  Icon,
  AnimateButton,
  AnimateKanban,
  AnimateWallet,
  AnimateLogOut,
  AnimatePlus,
  AnimateSearch,
  AnimateSettings,
  AnimateSparkles,
  AnimateUser,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
  Tooltip,
} from "components/ui";
import { publicEnv } from "@/app/config/env";
import { useTheme } from "@/app/providers/ThemeProvider";
import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import katex from "katex";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import AvatarName from "@/components/AvatarName";
import { MathInline } from "@/components/MathText";
import TopbarSessionPlaceholder from "@/components/TopbarSessionPlaceholder";
import LocalAuthorizationDialog from "@/components/LocalAuthorizationDialog";
import {
  RinspacePhoneAuthDialog,
  RinspaceTopbarActionBar,
  RinspaceTopbarAnonymousActionBar,
  RinspaceTopbarControls,
} from "@/components/shared/RinspaceTopbarFrame";
import TagCreationFlow from "@/features/tags/TagCreationFlow";
import {
  DiscoverySearch,
  PublishingActions,
  SessionMenu,
} from "@/features/topbar";
import PublishCreateDialog, {
  type PublishDialogMode,
} from "@/features/publish/PublishCreateDialog";
import { typstCreationEnabled } from "@/features/publish/typstFeature";
import TweetComposerDialog from "@/features/tweets/TweetComposerDialog";
import {
  completePhoneOtp,
  getSessionPresentation,
  getStoredSession,
  logoutCurrentSession,
  sendPhoneOtp,
  type RinspaceUser,
  type OtpChallenge,
} from "@/services/phoneAuth";
import {
  clearTopbarSessionSnapshot,
  readTopbarSessionSnapshot,
  writeTopbarSessionSnapshot,
  type TopbarUserProfile,
} from "@/services/topbarSessionSnapshot";
import { searchContent } from "@/services/domains/activity";
import { messageFromError } from "@/services/errors";
import { loadCurrentUserInfo } from "@/services/domains/identity";
import {
  loadNotifications,
  notificationStateChangedEvent,
} from "@/services/domains/notification";
import type { NotificationItem, SearchResult } from "@/services/contracts";
import { useOptionalLanguage } from "@/i18n/LanguageProvider";
import {
  getCurrentUser,
  isMainlandPhone,
  loadProfile,
  normalizePhone,
  sha256Hex,
} from "@/services/profile";
import { clearGiteaSession, syncGiteaSession } from "@/services/gitea";
import {
  answerPath,
  cleanUserId,
  contentPath,
  profilePath,
  tagReadOrLegacyPath,
} from "@/utils/routes";
import { openGiteaPath } from "@/utils/giteaPaths";
import { slugify } from "@/utils/rinWriter";

type UserProfile = TopbarUserProfile;

type SiteTopbarProps = {
  ariaLabel?: string;
  onSessionChange?: () => void | Promise<void>;
  authRequestVersion?: number;
  onSessionPresentationChange?: (presentation: SessionPresentation) => void;
};

type SessionPresentation = "anonymous" | "restoring" | "authenticated";

const adminPhoneHash = publicEnv.adminPhoneSha256 || "";
const sessionRefreshRetryInitialDelayMs = 1_500;
const sessionRefreshRetryMaxDelayMs = 30_000;
const texLogoHtml = katex.renderToString("\\TeX", {
  displayMode: false,
  throwOnError: false,
  strict: "ignore",
  trust: false,
});

function optionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function searchResultPath(result: SearchResult) {
  const ref = result.id || result.slug;
  switch (result.objectType) {
    case "question":
      return contentPath("question", ref, result.title);
    case "answer":
      return answerPath(ref, result.id);
    case "blog":
      return contentPath("blog", ref, result.title);
    case "book":
      return contentPath("book", ref, result.title);
    case "announcement":
      return contentPath("announcement", ref);
    case "discussion":
    case "forum":
      return contentPath("discussion", ref, result.title);
    case "dynamic":
    case "status":
      return contentPath("dynamic", ref, result.title);
    case "tag":
      return tagReadOrLegacyPath(
        result.id,
        result.slug || result.title || result.id,
      );
    case "user":
      return profilePath(result.userId || result.author || result.id);
    default:
      return "/search";
  }
}

export function shouldShowTopbarSearchPreview(
  query: string,
  searchOpen: boolean,
) {
  return searchOpen && query.trim().length >= 2;
}

export default function SiteTopbar({
  ariaLabel,
  onSessionChange,
  authRequestVersion = 0,
  onSessionPresentationChange,
}: SiteTopbarProps) {
  const { t: tNavigation } = useTranslation("navigation");
  const { t: tAuth } = useTranslation("auth");
  const language = useOptionalLanguage();
  const syncAccountPreference = language?.syncAccountPreference;
  const navigate = useNavigate();
  const location = useLocation();
  const { resolved: resolvedTheme, setPreference: setThemePreference } =
    useTheme();
  const [cachedSnapshot] = useState(() => readTopbarSessionSnapshot());
  const [sessionPresentation, setSessionPresentation] =
    useState<SessionPresentation>(() =>
      cachedSnapshot
        ? "authenticated"
        : getStoredSession()
          ? "restoring"
          : "anonymous",
    );
  const [user, setUser] = useState<RinspaceUser | null>(
    () => cachedSnapshot?.user ?? null,
  );
  const [profile, setProfile] = useState<UserProfile | null>(
    () => cachedSnapshot?.profile ?? null,
  );
  const [publicUserId, setPublicUserId] = useState(
    () => cachedSnapshot?.publicUserId ?? "",
  );
  const [nickname, setNickname] = useState(
    () => cachedSnapshot?.nickname ?? "",
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState(
    () => cachedSnapshot?.avatarDataUrl ?? "",
  );
  const [isAdmin, setIsAdmin] = useState(
    () => cachedSnapshot?.isAdmin ?? false,
  );
  const [isModerator, setIsModerator] = useState(
    () => cachedSnapshot?.isModerator ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchFormRef = useRef<HTMLFormElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchPreviewItems, setSearchPreviewItems] = useState<SearchResult[]>(
    [],
  );
  const [searchPreviewCount, setSearchPreviewCount] = useState(0);
  const [searchPreviewLoading, setSearchPreviewLoading] = useState(false);
  const [searchPreviewError, setSearchPreviewError] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authPhone, setAuthPhone] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authChallenge, setAuthChallenge] = useState<OtpChallenge | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDialogMode, setPublishDialogMode] =
    useState<PublishDialogMode>("blog");
  const [tagCreateDialogOpen, setTagCreateDialogOpen] = useState(false);
  const [tweetComposerOpen, setTweetComposerOpen] = useState(false);

  const currentDisplayName =
    profile?.nickname ||
    nickname ||
    optionalString(user?.username) ||
    publicUserId ||
    tNavigation("account.anonymousName");
  const currentProfileRouteId = publicUserId || cleanUserId(user?.id);
  const trimmedSearchDraft = searchDraft.trim();
  const showSearchPreview = shouldShowTopbarSearchPreview(
    trimmedSearchDraft,
    mobileSearchOpen,
  );

  useLayoutEffect(() => {
    onSessionPresentationChange?.(sessionPresentation);
  }, [onSessionPresentationChange, sessionPresentation]);
  const searchTypeLabel: Record<string, string> = {
    answer: tNavigation("contentTypes.answer"),
    announcement: tNavigation("contentTypes.announcement"),
    blog: tNavigation("contentTypes.blog"),
    book: tNavigation("contentTypes.book"),
    discussion: tNavigation("contentTypes.discussion"),
    dynamic: tNavigation("contentTypes.dynamic"),
    forum: tNavigation("contentTypes.discussion"),
    post: tNavigation("contentTypes.post"),
    question: tNavigation("contentTypes.question"),
    status: tNavigation("contentTypes.dynamic"),
    tag: tNavigation("contentTypes.tag"),
    user: tNavigation("contentTypes.user"),
  };
  const searchResultSignal = (result: SearchResult) => {
    if (result.objectType === "user") return tNavigation("contentTypes.user");
    if (result.objectType === "tag")
      return tNavigation("search.relatedCount", { count: result.voteCount });
    if (typeof result.answerCount === "number" && result.answerCount > 0) {
      return tNavigation("search.answerCount", { count: result.answerCount });
    }
    return tNavigation("search.voteCount", { count: result.voteCount });
  };

  const refreshSession = useCallback(async () => {
    const nextUser = await getCurrentUser();
    setUser(nextUser);
    if (!nextUser) {
      // A deployment/cookie race is retryable, not a logout. Keep the cached
      // identity visible while the managed HttpOnly cookies settle.
      if (
        getSessionPresentation() === "temporarily_unavailable" &&
        getStoredSession()
      ) {
        setSessionPresentation("restoring");
        return;
      }
      setSessionPresentation("anonymous");
      clearTopbarSessionSnapshot();
      setProfile(null);
      setPublicUserId("");
      setNickname("");
      setAvatarDataUrl("");
      setIsAdmin(false);
      setIsModerator(false);
      return;
    }
    setSessionPresentation((current) =>
      current === "authenticated" ? current : "restoring",
    );

    const phoneHash = nextUser.phone
      ? await sha256Hex(normalizePhone(nextUser.phone))
      : "";
    const isAdminByPhone = Boolean(
      adminPhoneHash && phoneHash === adminPhoneHash,
    );

    const metadataNickname =
      optionalString(nextUser.user_metadata?.nickName) ||
      optionalString(nextUser.user_metadata?.nickname);
    const metadataAvatar =
      optionalString(nextUser.user_metadata?.avatarUrl) ||
      optionalString(nextUser.user_metadata?.avatar_url) ||
      optionalString(nextUser.user_metadata?.picture);

    setNickname(metadataNickname);
    setAvatarDataUrl(metadataAvatar);

    const [nextProfile, nextCurrentUserInfo] = await Promise.all([
      loadProfile(nextUser).catch(() => null) as Promise<UserProfile | null>,
      loadCurrentUserInfo().catch(() => null),
    ]);
    const previousSnapshot = readTopbarSessionSnapshot();
    const matchingPreviousSnapshot =
      previousSnapshot?.user.id === nextUser.id ? previousSnapshot : null;
    const resolvedProfile =
      nextProfile || matchingPreviousSnapshot?.profile || null;
    const resolvedNickname = (
      resolvedProfile?.nickname ||
      optionalString(nextCurrentUserInfo?.display_name) ||
      optionalString(nextCurrentUserInfo?.username) ||
      metadataNickname ||
      matchingPreviousSnapshot?.nickname ||
      optionalString(nextUser.username) ||
      ""
    ).trim();
    const resolvedAvatarDataUrl =
      resolvedProfile?.avatarDataUrl ||
      optionalString(nextCurrentUserInfo?.avatar.custom) ||
      optionalString(nextCurrentUserInfo?.avatar.gravatar) ||
      metadataAvatar ||
      matchingPreviousSnapshot?.avatarDataUrl ||
      "";
    const nextPublicUserId = (
      optionalString(nextCurrentUserInfo?.username) ||
      matchingPreviousSnapshot?.publicUserId ||
      ""
    ).trim();
    const nextIsAdmin =
      isAdminByPhone ||
      nextCurrentUserInfo?.role_id === 2 ||
      nextCurrentUserInfo?.role_name === "admin" ||
      (!nextCurrentUserInfo && matchingPreviousSnapshot?.isAdmin === true);
    const nextIsModerator =
      nextIsAdmin ||
      nextCurrentUserInfo?.role_id === 3 ||
      nextCurrentUserInfo?.role_name === "moderator" ||
      (!nextCurrentUserInfo && matchingPreviousSnapshot?.isModerator === true);

    if (nextCurrentUserInfo?.language && syncAccountPreference) {
      await syncAccountPreference(nextCurrentUserInfo.language);
    }

    if (!resolvedNickname && !nextPublicUserId) {
      setProfile(resolvedProfile);
      setPublicUserId("");
      setNickname("");
      setAvatarDataUrl(resolvedAvatarDataUrl);
      setIsAdmin(false);
      setIsModerator(false);
      setSessionPresentation("restoring");
      throw new Error("Topbar session is missing a display identity.");
    }

    setProfile(resolvedProfile);
    setPublicUserId(nextPublicUserId);
    setIsAdmin(nextIsAdmin);
    setIsModerator(nextIsModerator);
    setNickname(resolvedNickname);
    setAvatarDataUrl(resolvedAvatarDataUrl);
    setSessionPresentation("authenticated");
    writeTopbarSessionSnapshot({
      user: nextUser,
      profile: resolvedProfile,
      nickname: resolvedNickname,
      avatarDataUrl: resolvedAvatarDataUrl,
      publicUserId: nextPublicUserId,
      isAdmin: nextIsAdmin,
      isModerator: nextIsModerator,
      cachedAt: Date.now(),
    });
    void syncGiteaSession().catch(() => {});
  }, [syncAccountPreference]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let retryDelayMs = sessionRefreshRetryInitialDelayMs;

    const attemptRefresh = () => {
      void refreshSession().catch(() => {
        if (cancelled) return;
        if (cachedSnapshot) {
          setUser(cachedSnapshot.user);
          setProfile(cachedSnapshot.profile);
          setPublicUserId(cachedSnapshot.publicUserId);
          setNickname(cachedSnapshot.nickname);
          setAvatarDataUrl(cachedSnapshot.avatarDataUrl);
          setIsAdmin(cachedSnapshot.isAdmin);
          setIsModerator(cachedSnapshot.isModerator);
          setSessionPresentation("authenticated");
          return;
        }

        setUser(null);
        setProfile(null);
        setPublicUserId("");
        setNickname("");
        setAvatarDataUrl("");
        setIsAdmin(false);
        setIsModerator(false);
        setSessionPresentation("restoring");
        retryTimer = window.setTimeout(attemptRefresh, retryDelayMs);
        retryDelayMs = Math.min(
          retryDelayMs * 2,
          sessionRefreshRetryMaxDelayMs,
        );
      });
    };

    attemptRefresh();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [cachedSnapshot, refreshSession]);

  useEffect(() => {
    if (location.hash !== "#login" || sessionPresentation !== "anonymous")
      return;
    setAuthDialogOpen(true);
  }, [location.hash, sessionPresentation]);

  useEffect(() => {
    if (authRequestVersion < 1 || sessionPresentation !== "anonymous") return;
    setAuthDialogOpen(true);
  }, [authRequestVersion, sessionPresentation]);

  useEffect(() => {
    setMobileSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setNotifications([]);
      return undefined;
    }

    const refreshNotifications = () => {
      void loadNotifications()
        .then((items) => {
          if (!cancelled) setNotifications(items);
        })
        .catch(() => {
          if (!cancelled) setNotifications([]);
        });
    };

    refreshNotifications();
    window.addEventListener(
      notificationStateChangedEvent,
      refreshNotifications,
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        notificationStateChangedEvent,
        refreshNotifications,
      );
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const query = searchDraft.trim();
    if (query.length < 2) {
      setSearchPreviewItems([]);
      setSearchPreviewCount(0);
      setSearchPreviewLoading(false);
      setSearchPreviewError("");
      return undefined;
    }

    setSearchPreviewLoading(true);
    setSearchPreviewError("");
    const timer = window.setTimeout(() => {
      void searchContent({
        query,
        type: "all",
        order: "relevance",
        page: 1,
        size: 4,
      })
        .then((result) => {
          if (!cancelled) {
            setSearchPreviewItems(result.items);
            setSearchPreviewCount(result.count);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setSearchPreviewItems([]);
            setSearchPreviewCount(0);
            setSearchPreviewError(
              messageFromError(searchError, "discovery.searchFailed"),
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearchPreviewLoading(false);
          }
        });
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchDraft]);

  const submitTopbarSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchDraft.trim();
    if (!query) {
      if (mobileSearchOpen) closeMobileSearch();
      return;
    }
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const focusSearchInput = () => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleTopbarSearchButtonClick = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const isMobileTopbar = window.matchMedia("(max-width: 620px)").matches;
    if (!isMobileTopbar || mobileSearchOpen) return;
    event.preventDefault();
    setMobileSearchOpen(true);
    setPublishMenuOpen(false);
    setCompactMenuOpen(false);
    setAccountMenuOpen(false);
    focusSearchInput();
  };

  const closeMobileSearch = () => {
    setMobileSearchOpen(false);
    searchInputRef.current?.blur();
  };

  useEffect(() => {
    if (!mobileSearchOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (searchFormRef.current?.contains(target)) return;
      closeMobileSearch();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [mobileSearchOpen]);

  const handleTopbarSearchKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape" || !mobileSearchOpen) return;
    event.preventDefault();
    closeMobileSearch();
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await clearGiteaSession().catch(() => {});
      await logoutCurrentSession();
      clearTopbarSessionSnapshot();
      await refreshSession();
      await onSessionChange?.();
    } finally {
      setBusy(false);
    }
  };

  const closeAuthDialog = () => {
    if (authBusy) return;
    setAuthDialogOpen(false);
    setAuthError("");
    setAuthStatus("");
    setAuthCode("");
    setAuthChallenge(null);
  };

  const openPublishDialog = (mode: PublishDialogMode) => {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }
    setPublishMenuOpen(false);
    setCompactMenuOpen(false);
    setPublishDialogMode(mode);
    setPublishDialogOpen(true);
  };

  const openTagCreateDialog = () => {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }
    setPublishMenuOpen(false);
    setCompactMenuOpen(false);
    setTagCreateDialogOpen(true);
  };

  const openTweetComposer = () => {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }
    setPublishMenuOpen(false);
    setCompactMenuOpen(false);
    setTweetComposerOpen(true);
  };

  const submitPhoneOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = normalizePhone(authPhone);
    if (!isMainlandPhone(normalizedPhone)) {
      setAuthError(tAuth("validation.mainlandPhone"));
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      const challenge = await sendPhoneOtp(normalizedPhone);
      setAuthChallenge(challenge);
      setAuthCode("");
      setAuthPhone(normalizedPhone);
      setAuthStatus(
        challenge.isUser ? tAuth("status.existing") : tAuth("status.new"),
      );
    } catch (error) {
      setAuthError(messageFromError(error, "authentication.otpSendFailed"));
    } finally {
      setAuthBusy(false);
    }
  };

  const submitPhoneLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authChallenge) {
      await submitPhoneOtp(event);
      return;
    }
    const normalizedCode = authCode.trim();
    if (!/^\d{4,8}$/.test(normalizedCode)) {
      setAuthError(tAuth("validation.code"));
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      await completePhoneOtp(authChallenge, normalizedCode);
      await refreshSession();
      await onSessionChange?.();
      setAuthDialogOpen(false);
      setAuthPhone("");
      setAuthCode("");
      setAuthChallenge(null);
    } catch (error) {
      setAuthError(messageFromError(error, "authentication.signInFailed"));
    } finally {
      setAuthBusy(false);
    }
  };

  const themeLabel =
    resolvedTheme === "light"
      ? tNavigation("theme.toDark")
      : tNavigation("theme.toLight");
  const toggleTheme = () =>
    setThemePreference(resolvedTheme === "light" ? "dark" : "light");
  const themeControl = (
    <Tooltip content={themeLabel}>
      <AnimateThemeToggler
        resolved={resolvedTheme}
        onToggle={toggleTheme}
        label={themeLabel}
        className="topbar-pill"
      />
    </Tooltip>
  );
  const renderPublishMenuItems = () => (
    <>
      <MenuSub>
        <MenuSubTrigger className="rin-ui-menu-item rin-ui-menu-sub-trigger">
          <Icon name="journal-text" />
          <span>{tNavigation("publish.blog")}</span>
          <Icon name="chevron-right" />
        </MenuSubTrigger>
        <MenuSubContent className="rin-ui-panel rin-ui-menu">
          <MenuItem onSelect={() => openPublishDialog("blog")}>
            <span
              className="latex-menu-mark"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: texLogoHtml }}
            />
            <span>LaTeX</span>
          </MenuItem>
          {typstCreationEnabled ? (
            <MenuItem onSelect={() => openPublishDialog("typst-blog")}>
              <span className="typst-menu-mark" aria-hidden="true">T</span>
              <span>Typst</span>
            </MenuItem>
          ) : null}
          <MenuItem asChild>
            <Link to="/write/markdown">
              <Icon name="markdown" />
              <span>Markdown</span>
            </Link>
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
      <MenuSub>
        <MenuSubTrigger className="rin-ui-menu-item rin-ui-menu-sub-trigger">
          <Icon name="book" />
          <span>{tNavigation("publish.book")}</span>
          <Icon name="chevron-right" />
        </MenuSubTrigger>
        <MenuSubContent className="rin-ui-panel rin-ui-menu">
          <MenuItem onSelect={() => openPublishDialog("pdf-book")}>
            <Icon name="filetype-pdf" />
            <span>PDF</span>
          </MenuItem>
          <MenuItem onSelect={() => openPublishDialog("latex-book")}>
            <span
              className="latex-menu-mark"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: texLogoHtml }}
            />
            <span>LaTeX</span>
          </MenuItem>
          {typstCreationEnabled ? (
            <MenuItem onSelect={() => openPublishDialog("typst-book")}>
              <span className="typst-menu-mark" aria-hidden="true">T</span>
              <span>Typst</span>
            </MenuItem>
          ) : null}
          <MenuItem onSelect={() => openPublishDialog("markdown-book")}>
            <Icon name="markdown" />
            <span>Markdown</span>
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
      <MenuItem onSelect={openTagCreateDialog}>
        <Icon name="tags" />
        <span>{tNavigation("publish.tag")}</span>
      </MenuItem>
      <MenuItem onSelect={openTweetComposer}>
        <Icon name="lightning-charge" />
        <span>{tNavigation("publish.tweet")}</span>
      </MenuItem>
      {isModerator ? (
        <MenuItem asChild>
          <Link to="/announcements/new">
            <Icon name="megaphone" />
            <span>{tNavigation("publish.announcement")}</span>
          </Link>
        </MenuItem>
      ) : null}
    </>
  );
  const compactThemeItem = (
    <MenuItem onSelect={toggleTheme}>
      {resolvedTheme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      <span>{themeLabel}</span>
    </MenuItem>
  );
  const compactAnonymousMenu = {
    label: tNavigation("more.label"),
    render: (trigger: ReactNode) => (
      <Menu open={compactMenuOpen} onOpenChange={setCompactMenuOpen}>
        <Tooltip content={tNavigation("more.label")}>
          <MenuTrigger asChild>{trigger}</MenuTrigger>
        </Tooltip>
        <MenuContent align="end" sideOffset={8}>
          {compactThemeItem}
        </MenuContent>
      </Menu>
    ),
  };

  return (
    <>
      <RinspaceTopbarControls
        navigationLabel={ariaLabel || tNavigation("landmark")}
        search={
          <DiscoverySearch
            className={
              mobileSearchOpen
                ? "topbar-search mobile-search-open"
                : "topbar-search"
            }
            ref={searchFormRef}
            onSubmit={submitTopbarSearch}
            onKeyDown={handleTopbarSearchKeyDown}
          >
            <input
              ref={searchInputRef}
              value={searchDraft}
              maxLength={60}
              placeholder={tNavigation("search.placeholder")}
              aria-label={tNavigation("search.community")}
              onFocus={() => setMobileSearchOpen(true)}
              onChange={(event) => setSearchDraft(event.currentTarget.value)}
            />
            <AnimateButton
              unstyled
              type="submit"
              title={tNavigation("search.label")}
              aria-label={
                mobileSearchOpen
                  ? tNavigation("search.label")
                  : tNavigation("search.open")
              }
              onClick={handleTopbarSearchButtonClick}
            >
              <AnimateSearch animateOnHover size={16} />
            </AnimateButton>
            {showSearchPreview ? (
              <div className="topbar-search-preview" aria-live="polite">
                <div className="topbar-search-preview-head">
                  <span>{tNavigation("search.liveIndex")}</span>
                  <Link
                    to={`/search?q=${encodeURIComponent(trimmedSearchDraft)}`}
                  >
                    {searchPreviewLoading
                      ? tNavigation("search.loading")
                      : tNavigation("search.resultCount", {
                          count: searchPreviewCount,
                        })}
                  </Link>
                </div>
                {searchPreviewError ? (
                  <p className="topbar-search-preview-note">
                    {searchPreviewError}
                  </p>
                ) : null}
                {!searchPreviewError &&
                searchPreviewLoading &&
                !searchPreviewItems.length ? (
                  <p className="topbar-search-preview-note"> </p>
                ) : null}
                {!searchPreviewError &&
                !searchPreviewLoading &&
                !searchPreviewItems.length ? (
                  <p className="topbar-search-preview-note">
                    {tNavigation("search.noResults")}
                  </p>
                ) : null}
                {searchPreviewItems.map((item) => (
                  <Link
                    className="topbar-search-result"
                    to={searchResultPath(item)}
                    key={`${item.objectType}-${item.id}`}
                  >
                    <span>
                      {searchTypeLabel[item.objectType] || item.objectType}
                    </span>
                    <strong>
                      <MathInline text={item.title} />
                    </strong>
                    <em>{searchResultSignal(item)}</em>
                  </Link>
                ))}
                <Link
                  className="topbar-search-all"
                  to={`/search?q=${encodeURIComponent(trimmedSearchDraft)}`}
                >
                  {tNavigation("search.allResults")}
                  <Icon name="arrow-right" />
                </Link>
              </div>
            ) : null}
          </DiscoverySearch>
        }
      >
        {sessionPresentation === "restoring" ? (
          <TopbarSessionPlaceholder />
        ) : user ? (
          <RinspaceTopbarActionBar
            themeControl={themeControl}
            compactMenu={{
              label: tNavigation("more.label"),
              notificationCount: notifications.length,
              render: (trigger) => (
                <Menu
                  open={compactMenuOpen}
                  onOpenChange={(open) => {
                    setCompactMenuOpen(open);
                    if (open) setAccountMenuOpen(false);
                  }}
                >
                  <Tooltip content={tNavigation("more.label")}>
                    <MenuTrigger asChild>{trigger}</MenuTrigger>
                  </Tooltip>
                  <MenuContent align="end" sideOffset={8}>
                    <MenuItem asChild>
                      <Link to="/creator">
                        <AnimateSparkles animateOnHover size={16} />
                        <span>{tNavigation("account.creator")}</span>
                      </Link>
                    </MenuItem>
                    <MenuSub>
                      <MenuSubTrigger className="rin-ui-menu-item rin-ui-menu-sub-trigger">
                        <AnimatePlus animateOnHover size={16} />
                        <span>{tNavigation("publish.label")}</span>
                        <Icon name="chevron-right" />
                      </MenuSubTrigger>
                      <MenuSubContent className="rin-ui-panel rin-ui-menu">
                        {renderPublishMenuItems()}
                      </MenuSubContent>
                    </MenuSub>
                    <MenuItem asChild>
                      <Link to="/notifications">
                        {notifications.length > 0 ? (
                          <AnimateBellRing animateOnHover size={16} />
                        ) : (
                          <AnimateBell animateOnHover size={16} />
                        )}
                        <span>{tNavigation("account.notifications")}</span>
                        {notifications.length > 0 ? (
                          <span className="topbar-menu-count">
                            {notifications.length}
                          </span>
                        ) : null}
                      </Link>
                    </MenuItem>
                    {compactThemeItem}
                    {isModerator ? (
                      <MenuItem asChild>
                        <Link to="/admin">
                          <AnimateKanban animateOnHover size={16} />
                          <span>{tNavigation("account.admin")}</span>
                        </Link>
                      </MenuItem>
                    ) : null}
                  </MenuContent>
                </Menu>
              ),
            }}
            primary={{
              href: "/creator",
              label: tNavigation("account.creator"),
              onNavigate: (event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                navigate("/creator");
              },
            }}
            publishing={{
              label: tNavigation("publish.label"),
              onSelect: () => undefined,
            }}
            renderPublishing={(trigger, label) => (
              <PublishingActions>
                <Menu
                  open={publishMenuOpen}
                  onOpenChange={(open) => {
                    setPublishMenuOpen(open);
                    if (open) setAccountMenuOpen(false);
                  }}
                >
                  <Tooltip content={label}>
                    <MenuTrigger asChild>{trigger}</MenuTrigger>
                  </Tooltip>
                  <MenuContent align="end" sideOffset={8}>
                    {renderPublishMenuItems()}
                  </MenuContent>
                </Menu>
              </PublishingActions>
            )}
            notifications={{
              href: "/notifications",
              label: tNavigation("account.notifications"),
              count: notifications.length,
              onNavigate: (event) => {
                event.preventDefault();
                navigate("/notifications");
              },
            }}
            administration={
              isModerator
                ? {
                    href: "/admin",
                    label: tNavigation("account.admin"),
                    onNavigate: (event) => {
                      event.preventDefault();
                      navigate("/admin");
                    },
                  }
                : undefined
            }
            decorate={(control, label) => (
              <Tooltip content={label}>{control}</Tooltip>
            )}
            renderAccount={(chevron) => (
              <SessionMenu>
                <Menu
                  open={accountMenuOpen}
                  onOpenChange={(open) => {
                    setAccountMenuOpen(open);
                    if (open) {
                      setCompactMenuOpen(false);
                      setPublishMenuOpen(false);
                    }
                  }}
                >
                  <Tooltip content={tNavigation("account.menu")}>
                    <MenuTrigger asChild>
                      <AnimateButton
                        unstyled
                        type="button"
                        className="account-menu-trigger"
                        aria-label={tNavigation("account.menu")}
                      >
                        <AvatarName
                          name={currentDisplayName}
                          imageUrl={avatarDataUrl}
                        />
                        {chevron}
                      </AnimateButton>
                    </MenuTrigger>
                  </Tooltip>
                  <MenuContent align="end" sideOffset={8}>
                    <MenuItem asChild>
                      <Link to={profilePath(currentProfileRouteId)}>
                        <AnimateUser animateOnHover size={16} />
                        <span>{tNavigation("account.profile")}</span>
                      </Link>
                    </MenuItem>
                    <MenuItem asChild>
                      <Link to="/wallet">
                        <AnimateWallet animateOnHover size={16} />
                        <span>{tNavigation("account.wallet")}</span>
                      </Link>
                    </MenuItem>
                    <MenuItem asChild>
                      <Link to="/settings">
                        <AnimateSettings animateOnHover size={16} />
                        <span>{tNavigation("account.accountSettings")}</span>
                      </Link>
                    </MenuItem>
                    <MenuItem onSelect={() => void signOut()} disabled={busy}>
                      <AnimateLogOut animateOnHover size={16} />
                      <span>
                        {busy
                          ? tNavigation("account.signingOut")
                          : tNavigation("account.signOut")}
                      </span>
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </SessionMenu>
            )}
          />
        ) : (
          <RinspaceTopbarAnonymousActionBar
            themeControl={themeControl}
            compactMenu={compactAnonymousMenu}
            authentication={{
              label: tNavigation("account.signInOrRegister"),
              onSelect: () => setAuthDialogOpen(true),
            }}
          />
        )}
      </RinspaceTopbarControls>
      <PublishCreateDialog
        open={publishDialogOpen}
        mode={publishDialogMode}
        user={user}
        onClose={() => setPublishDialogOpen(false)}
      />
      <TagCreationFlow
        open={tagCreateDialogOpen}
        onOpenChange={setTagCreateDialogOpen}
        invocation={{ source: "topbar" }}
        onCreated={(tag) => {
          openGiteaPath("tags", tag.id);
        }}
      />
      <TweetComposerDialog
        open={tweetComposerOpen}
        displayName={currentDisplayName}
        avatarUrl={avatarDataUrl || undefined}
        onClose={() => setTweetComposerOpen(false)}
      />
      {publicEnv.localRealClient ? <LocalAuthorizationDialog open={authDialogOpen} onClose={closeAuthDialog} /> : <RinspacePhoneAuthDialog
        open={authDialogOpen}
        busy={authBusy}
        phone={authPhone}
        code={authCode}
        challenge={Boolean(authChallenge)}
        error={authError}
        status={authStatus}
        labels={{
          title: tAuth("title"),
          close: tAuth("close"),
          phone: tAuth("phone"),
          phonePlaceholder: tAuth("phonePlaceholder"),
          code: tAuth("code"),
          codePlaceholder: tAuth("codePlaceholder"),
          changePhone: tAuth("changePhone"),
          processing: tAuth("processing"),
          complete: tAuth("complete"),
          sendCode: tAuth("sendCode"),
        }}
        onClose={closeAuthDialog}
        onPhoneChange={setAuthPhone}
        onCodeChange={setAuthCode}
        onChangePhone={() => {
          setAuthChallenge(null);
          setAuthCode("");
          setAuthStatus("");
          setAuthError("");
        }}
        onSubmit={authChallenge ? submitPhoneLogin : submitPhoneOtp}
      />}
    </>
  );
}
