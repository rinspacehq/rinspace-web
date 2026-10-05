// RINSPACE_SHARED_SOURCE: edit only in rinspace/ui, then run the one-way sync.
import { useEffect, useRef } from "react";
import type { MouseEventHandler, ReactNode, Ref, SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";

import {
  AnimateBell,
  AnimateBellRing,
  AnimateButton,
  AnimateChevronDown,
  AnimateKanban,
  AnimateMore,
  AnimatePlus,
  AnimateSparkles,
  AnimateUser,
} from "@/rinspace_topbar_runtime";

export interface RinspaceTopbarFrameProps {
  sessionState: "anonymous" | "restoring" | "authenticated";
  logoSrc: string;
  brandName: string;
  flipHref: string;
  homeHref: string;
  flipLabel: string;
  homeLabel: string;
  children: ReactNode;
  onFlipNavigate?: MouseEventHandler<HTMLAnchorElement>;
  onHomeNavigate?: MouseEventHandler<HTMLAnchorElement>;
}

export interface RinspaceTopbarControlsProps {
  search: ReactNode;
  navigationLabel: string;
  children: ReactNode;
}

export interface RinspaceTopbarAction {
  href: string;
  label: string;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}

export interface RinspaceTopbarActionBarProps {
  themeControl: ReactNode;
  compactMenu: RinspaceTopbarCompactMenu;
  primary: RinspaceTopbarAction;
  publishing: {
    label: string;
    onSelect: () => void;
  };
  notifications: RinspaceTopbarAction & { count: number };
  administration?: RinspaceTopbarAction;
  renderPublishing?: (trigger: ReactNode, label: string) => ReactNode;
  renderAccount: (chevron: ReactNode) => ReactNode;
  decorate?: (control: ReactNode, label: string) => ReactNode;
  nativeTitles?: boolean;
}

export interface RinspaceTopbarCompactMenu {
  label: string;
  notificationCount?: number;
  expanded?: boolean;
  onSelect?: MouseEventHandler<HTMLButtonElement>;
  render: (trigger: ReactNode) => ReactNode;
}

export interface RinspaceTopbarAnonymousActionBarProps {
  themeControl: ReactNode;
  compactMenu: RinspaceTopbarCompactMenu;
  authentication: {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    buttonRef?: Ref<HTMLButtonElement>;
    onFocus?: () => void;
    onPointerEnter?: () => void;
  };
  nativeTitles?: boolean;
}

/**
 * The single visual frame used by both Rinspace runtimes.
 *
 * Runtime adapters own data and navigation. This component owns the header DOM,
 * brand controls and their motion policy, so the inner world cannot silently
 * substitute a second logo, animated wordmark or different shell structure.
 */
export function RinspaceTopbarFrame({
  sessionState,
  logoSrc,
  brandName,
  flipHref,
  homeHref,
  flipLabel,
  homeLabel,
  children,
  onFlipNavigate,
  onHomeNavigate,
}: RinspaceTopbarFrameProps) {
  const reducedMotion = useReducedMotion();

  return (
    <header
      className="topbar rin-topbar-shell"
      data-session-state={sessionState}
    >
      <span className="brand">
        <motion.a
          className="brand-mark"
          href={flipHref}
          aria-label={flipLabel}
          onClick={onFlipNavigate}
          whileHover={reducedMotion ? undefined : { rotateY: 360 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          style={{ transformPerspective: 600 }}
        >
          <img
            src={logoSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={128}
            height={128}
            decoding="sync"
            fetchPriority="high"
          />
        </motion.a>
        <a
          className="brand-word"
          href={homeHref}
          aria-label={homeLabel}
          onClick={onHomeNavigate}
        >
          <span className="brand-word-text">{brandName}</span>
        </a>
      </span>
      {children}
    </header>
  );
}

/**
 * Shared topbar slot order. The outer and inner adapters provide runtime
 * controls, but cannot change the search/navigation structure or button row.
 */
export function RinspaceTopbarControls({
  search,
  navigationLabel,
  children,
}: RinspaceTopbarControlsProps) {
  return (
    <>
      {search}
      <nav className="account-nav" aria-label={navigationLabel}>
        {children}
      </nav>
    </>
  );
}

/**
 * The shared authenticated action row. Runtimes inject destinations and menu
 * contents, while this component alone owns action order, button markup,
 * icons, sizes and Animate UI behavior.
 */
export function RinspaceTopbarActionBar({
  themeControl,
  compactMenu,
  primary,
  publishing,
  notifications,
  administration,
  renderPublishing = (trigger) => trigger,
  renderAccount,
  decorate = (control) => control,
  nativeTitles = false,
}: RinspaceTopbarActionBarProps) {
  const title = (label: string) => (nativeTitles ? label : undefined);

  return (
    <>
      <span className="topbar-desktop-actions">
        {themeControl}
        {decorate(
          <a
            className="topbar-pill"
            href={primary.href}
            aria-label={primary.label}
            title={title(primary.label)}
            onClick={primary.onNavigate}
          >
            <AnimateSparkles animateOnHover size={18} />
          </a>,
          primary.label,
        )}
        {renderPublishing(
          <AnimateButton
            unstyled
            type="button"
            className="topbar-pill"
            aria-label={publishing.label}
            title={title(publishing.label)}
            onClick={publishing.onSelect}
          >
            <AnimatePlus animateOnHover size={16} />
          </AnimateButton>,
          publishing.label,
        )}
        {decorate(
          <a
            className="notification-pill"
            href={notifications.href}
            aria-label={notifications.label}
            title={title(notifications.label)}
            onClick={notifications.onNavigate}
          >
            {notifications.count > 0 ? (
              <AnimateBellRing animateOnHover size={16} />
            ) : (
              <AnimateBell animateOnHover size={16} />
            )}
            {notifications.count > 0 ? (
              <span>{notifications.count}</span>
            ) : null}
          </a>,
          notifications.label,
        )}
        {administration
          ? decorate(
              <a
                className="notification-pill"
                href={administration.href}
                aria-label={administration.label}
                title={title(administration.label)}
                onClick={administration.onNavigate}
              >
                <AnimateKanban animateOnHover size={16} />
              </a>,
              administration.label,
            )
          : null}
      </span>
      <RinspaceTopbarCompactMenuControl
        compactMenu={compactMenu}
        nativeTitles={nativeTitles}
      />
      {renderAccount(
        <AnimateChevronDown
          className="account-menu-chevron"
          animateOnHover
          size={16}
        />,
      )}
    </>
  );
}

export function RinspaceTopbarCompactMenuControl({
  compactMenu,
  nativeTitles = false,
}: {
  compactMenu: RinspaceTopbarCompactMenu;
  nativeTitles?: boolean;
}) {
  return (
    <span className="topbar-compact-actions">
      {compactMenu.render(
        <AnimateButton
          unstyled
          type="button"
          className="topbar-pill topbar-more-trigger"
          aria-label={compactMenu.label}
          aria-expanded={compactMenu.expanded}
          aria-haspopup="menu"
          title={nativeTitles ? compactMenu.label : undefined}
          onClick={compactMenu.onSelect}
        >
          <AnimateMore animateOnHover size={18} />
          {(compactMenu.notificationCount ?? 0) > 0 ? (
            <span className="topbar-more-count">
              {compactMenu.notificationCount}
            </span>
          ) : null}
        </AnimateButton>,
      )}
    </span>
  );
}

export function RinspaceTopbarAnonymousActionBar({
  themeControl,
  compactMenu,
  authentication,
  nativeTitles = false,
}: RinspaceTopbarAnonymousActionBarProps) {
  return (
    <>
      <span className="topbar-desktop-actions">{themeControl}</span>
      <RinspaceTopbarCompactMenuControl
        compactMenu={compactMenu}
        nativeTitles={nativeTitles}
      />
      <AnimateButton
        ref={authentication.buttonRef}
        unstyled
        type="button"
        className="topbar-auth-button topbar-auth-control"
        aria-label={authentication.label}
        title={nativeTitles ? authentication.label : undefined}
        disabled={authentication.disabled}
        onClick={authentication.onSelect}
        onFocus={authentication.onFocus}
        onPointerEnter={authentication.onPointerEnter}
      >
        <span className="topbar-auth-label">{authentication.label}</span>
        <span className="topbar-auth-icon" aria-hidden="true">
          <AnimateUser animateOnHover size={18} />
        </span>
      </AnimateButton>
    </>
  );
}

export interface RinspacePhoneAuthDialogProps {
  open: boolean;
  busy: boolean;
  phone: string;
  code: string;
  challenge: boolean;
  error: string;
  status: string;
  labels: {
    title: string;
    close: string;
    phone: string;
    phonePlaceholder: string;
    code: string;
    codePlaceholder: string;
    changePhone: string;
    processing: string;
    complete: string;
    sendCode: string;
  };
  onClose: () => void;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onChangePhone: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}

export function RinspacePhoneAuthDialog({
  open,
  busy,
  phone,
  code,
  challenge,
  error,
  status,
  labels,
  onClose,
  onPhoneChange,
  onCodeChange,
  onChangePhone,
  onSubmit,
}: RinspacePhoneAuthDialogProps) {
  const reducedMotion = useReducedMotion();
  const dialog = useRef<HTMLElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const restoreTarget = document.activeElement as HTMLElement | null;
    const dialogNode = dialog.current;
    const focusFrame = window.requestAnimationFrame(() => {
      const current = document.activeElement;
      if (current instanceof Node && dialogNode?.contains(current)) return;
      phoneInput.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      const current = document.activeElement;
      const stillOwnsFocus =
        !current ||
        current === document.body ||
        (dialogNode ? dialogNode.contains(current) : false);
      if (stillOwnsFocus && restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <motion.div
        className="rin-ui-overlay rin-auth-overlay"
        data-state="open"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
      />
      <motion.section
        ref={dialog}
        className="auth-dialog rin-auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rinspace-auth-dialog-title"
        initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
      >
        <div className="auth-dialog-head rin-auth-dialog__head">
          <h2 className="auth-dialog-title" id="rinspace-auth-dialog-title">
            {labels.title}
          </h2>
          <motion.button
            type="button"
            aria-label={labels.close}
            disabled={busy}
            onClick={onClose}
            whileHover={reducedMotion ? undefined : { y: -1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.975 }}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M2.15 2.85a.5.5 0 0 1 .7-.7L8 7.29l5.15-5.14a.5.5 0 0 1 .7.7L8.71 8l5.14 5.15a.5.5 0 0 1-.7.7L8 8.71l-5.15 5.14a.5.5 0 0 1-.7-.7L7.29 8z"
              />
            </svg>
          </motion.button>
        </div>
        <form
          className="auth-dialog-form rin-auth-dialog__form"
          onSubmit={onSubmit}
        >
          <label>
            <span>{labels.phone}</span>
            <input
              ref={phoneInput}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              disabled={challenge || busy}
              placeholder={labels.phonePlaceholder}
              onChange={(event) => {
                onPhoneChange(event.currentTarget.value);
              }}
            />
          </label>
          {challenge ? (
            <label>
              <span>{labels.code}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                disabled={busy}
                placeholder={labels.codePlaceholder}
                onChange={(event) => {
                  onCodeChange(event.currentTarget.value);
                }}
              />
            </label>
          ) : null}
          {error ? (
            <p
              className="auth-dialog-error rin-auth-dialog__error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {status ? (
            <p
              className="auth-dialog-status rin-auth-dialog__status"
              role="status"
            >
              {status}
            </p>
          ) : null}
          <div className="auth-dialog-actions rin-auth-dialog__actions">
            {challenge ? (
              <motion.button
                type="button"
                className="auth-dialog-link rin-auth-dialog__link"
                disabled={busy}
                onClick={onChangePhone}
              >
                {labels.changePhone}
              </motion.button>
            ) : null}
            <motion.button type="submit" disabled={busy}>
              {busy
                ? labels.processing
                : challenge
                  ? labels.complete
                  : labels.sendCode}
            </motion.button>
          </div>
        </form>
      </motion.section>
    </>,
    document.body,
  );
}
