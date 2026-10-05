import { publicEnv } from 'app/config/env';
import { RouteLayout } from 'app/layouts';
import { AppProviders, RouteAnnouncer } from 'app/providers/AppProviders';
import { routeManifest, type RouteDefinition } from 'app/routing/routeManifest';
import { Component, lazy, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';

import { Notice } from 'components/ui';
import DocumentMetadataController from '@/components/DocumentMetadataController';
import { PageLoadingState } from '@/components/LoadingState';
import { SiteTopbarHost } from '@/components/SiteTopbarShell';
import { useRouteTranslationNamespaces } from '@/i18n/LanguageProvider';
import { hydrateRinMathJaxOfficialMenu } from '@/utils/rinMathJaxMenu';

const RinAssistant = lazy(() => import('components/RinAssistant'));

function DeferredRinAssistant() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 15000);
    return () => window.clearTimeout(id);
  }, []);
  return ready ? <Suspense fallback={null}><RinAssistant /></Suspense> : null;
}

function PublicSnapshotLifecycle() {
  useEffect(() => {
    const mount = document.getElementById('root');
    if (!mount) return;
    mount.removeAttribute('data-rin-search-snapshot');
    mount.setAttribute('data-rin-interactive', 'true');
  }, []);
  return null;
}

function RinMathJaxMenuBridge() {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => { void hydrateRinMathJaxOfficialMenu(event); };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);
  return null;
}

class RinAssistantBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('RinAssistant crashed', error, info); }
  render() { return this.state.hasError ? null : this.props.children; }
}

class RouteErrorBoundary extends Component<{ children: ReactNode; path: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: { path: string }) { if (previous.path !== this.props.path && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <RouteErrorFallback /> : this.props.children; }
}

function RouteErrorFallback() {
  const { t } = useTranslation('common');
  return <main className="rin-page-grid"><Notice tone="destructive" title={t('boundaries.routeTitle')}>{t('boundaries.routeMessage')}</Notice></main>;
}

function RouteDocument({ route }: { route: RouteDefinition }) {
  const location = useLocation();
  const { t } = useTranslation('common');
  const coreOwnsMetadata = route.path === '/'
    || /^\/books\/:postId(?:\/read(?:\/:titleSlug)?|\/:titleSlug)?$/.test(route.path)
    || /^\/(?:test\/a|a|q|d|s)\/:postId(?:\/:titleSlug)?$/.test(route.path)
    || /^\/(?:blog|questions|announcements|discussions|dynamics|forum|activity)\/:slug$/.test(route.path)
    || (route.path.startsWith('/tags/') && !/(?:\/edit|\/history|\/new)(?:\/|$)/.test(route.path));
  if (coreOwnsMetadata) return null;
  const canonical = route.canonicalPath.includes(':') ? location.pathname : route.canonicalPath;
  const title = t(route.titleKey);
  return <DocumentMetadataController metadata={{
    title,
    canonicalPath: canonical,
    robots: route.minimumRole === 'none' ? 'index,follow' : 'noindex,follow',
    pageOwnsDocumentCopy: true,
  }} />;
}

function RouteBody({ route }: { route: RouteDefinition }) {
  const location = useLocation();
  useRouteTranslationNamespaces(route.translationNamespaces);
  return <RouteErrorBoundary path={location.pathname}><RouteDocument route={route} /><RouteLayout kind={route.layout} family={route.family}><Suspense fallback={<PageLoadingState />}>{route.element}</Suspense></RouteLayout></RouteErrorBoundary>;
}

function AppRoutes() {
  return <><PublicSnapshotLifecycle /><RouteAnnouncer /><RinMathJaxMenuBridge /><RinAssistantBoundary><DeferredRinAssistant /></RinAssistantBoundary><Routes>{routeManifest.map((route) => <Route key={`${route.order}:${route.path}`} path={route.path} element={<RouteBody route={route} />} />)}</Routes></>;
}

function App() {
  return <HelmetProvider><BrowserRouter basename={publicEnv.basePath || '/'}><AppProviders><SiteTopbarHost><AppRoutes /></SiteTopbarHost></AppProviders></BrowserRouter></HelmetProvider>;
}

export default App;
