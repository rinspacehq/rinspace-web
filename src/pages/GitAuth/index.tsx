import { AnimateButton } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import SiteTopbar from '@/components/SiteTopbarShell';
import { messageFromError } from '@/services/errors';
import { getStoredSession } from '@/services/phoneAuth';
import { syncGiteaSession } from '@/services/gitea';
import {
  giteaBasePath,
  giteaPath,
  safeGiteaRedirectPath,
} from '@/utils/giteaPaths';

type GitAuthState =
  | 'checking'
  | 'login'
  | 'syncing'
  | 'ready'
  | 'opening'
  | 'error';

const recentGiteaReposEndpoint = `${giteaBasePath}api/v1/user/repos?limit=1&sort=updated`;
const repositoryRedirectDelayMs = 3000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function safeGitRedirect(value: string | null) {
  const fallback = `${giteaBasePath}user/login`;
  return safeGiteaRedirectPath(value || fallback, fallback);
}

function giteaRepoPathFromApiRecord(value: unknown) {
  if (!isRecord(value)) return '';
  const htmlUrl = optionalString(value.html_url);
  if (htmlUrl) {
    try {
      const parsed = new URL(htmlUrl, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return safeGiteaRedirectPath(`${parsed.pathname}${parsed.search}${parsed.hash}`, '');
      }
    } catch {
      // Fall back to full_name below.
    }
  }

  const fullName = optionalString(value.full_name);
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
    const [owner, name] = fullName.split('/');
    return giteaPath(owner, name);
  }

  const owner = isRecord(value.owner)
    ? optionalString(value.owner.login) || optionalString(value.owner.username)
    : '';
  const name = optionalString(value.name);
  if (/^[A-Za-z0-9_.-]+$/.test(owner) && /^[A-Za-z0-9_.-]+$/.test(name)) {
    return giteaPath(owner, name);
  }

  return '';
}

async function loadRecentGiteaRepositoryPath() {
  const response = await fetch(recentGiteaReposEndpoint, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) return giteaBasePath;
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(payload) || payload.length === 0) return giteaBasePath;
  return giteaRepoPathFromApiRecord(payload[0]) || giteaBasePath;
}

function GitAuthPage() {
  const { t } = useTranslation('navigation');
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get('next');
  const shouldRedirect = nextParam !== null;
  const redirectTarget = useMemo(() => safeGitRedirect(nextParam), [nextParam]);
  const [state, setState] = useState<GitAuthState>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let redirectTimer: number | undefined;

    const attempt = async () => {
      if (cancelled) return;
      if (!getStoredSession()) {
        setState('login');
        timer = window.setTimeout(attempt, 1200);
        return;
      }

      setState('syncing');
      setError('');
      try {
        const synced = await syncGiteaSession();
        if (cancelled) return;
        if (!synced) {
          setState('login');
          timer = window.setTimeout(attempt, 1200);
          return;
        }
        if (shouldRedirect) {
          window.location.replace(redirectTarget);
          return;
        }
        if (!cancelled) {
          setState('ready');
          redirectTimer = window.setTimeout(() => {
            void loadRecentGiteaRepositoryPath()
              .then((path) => {
                if (cancelled) return;
                setState('opening');
                window.location.replace(path);
              })
              .catch(() => {
                if (cancelled) return;
                setState('opening');
                window.location.replace(giteaBasePath);
              });
          }, repositoryRedirectDelayMs);
        }
      } catch (syncError) {
        if (cancelled) return;
        setState('error');
        setError(messageFromError(syncError, 'integrations.gitSyncFailed'));
      }
    };

    void attempt();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [redirectTarget, shouldRedirect]);

  return (
    <>
      <Helmet title={`Git 授权 - ${t('brandName')}`} />
      <SiteTopbar />
      <main className="git-auth-shell">
        <section className="panel git-auth-panel">
          <div className="panel-heading large">
            <div>
              <span>Rinspace Git</span>
              <strong>
                {state === 'login'
                  ? '等待登录'
                  : state === 'syncing'
                    ? '授权中'
                    : state === 'ready'
                      ? '已连接'
                      : state === 'opening'
                        ? '正在打开'
                        : state === 'error'
                          ? '需要重试'
                          : '检查中'}
              </strong>
            </div>
          </div>
          <h1>连接 Gitea</h1>
          {state === 'login' ? (
            <p>
              请先在右上角登录 Rinspace，登录完成后会自动回到 Git 授权流程。
            </p>
          ) : null}
          {state === 'syncing' || state === 'checking' ? (
            <p>正在确认当前 Rinspace 身份。</p>
          ) : null}
          {state === 'ready' ? (
            <div className="git-auth-credential-panel">
              <p>
                当前 Rinspace 身份已同步到 Gitea。稍后会打开最近更新的仓库。
              </p>
              <div className="git-auth-actions">
                <a href={giteaBasePath}>打开 Gitea</a>
                <Link to="/">返回 Rinspace</Link>
              </div>
            </div>
          ) : null}
          {state === 'opening' ? <p>正在打开最近更新的 Gitea 仓库。</p> : null}
          {state === 'error' ? (
            <>
              <p>{error}</p>
              <div className="git-auth-actions">
                <AnimateButton unstyled type="button" onClick={() => window.location.reload()}>
                  重试
                </AnimateButton>
                <Link to="/">返回 Rinspace</Link>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}

export default GitAuthPage;
