import { describe, expect, it } from 'vitest';

import { routeManifest } from './routeManifest';

import baseline from '../../../contracts/routes-baseline.json';

describe('typed route manifest', () => {
  it('keeps /admin as the only operations workspace route', () => {
    expect(routeManifest).toHaveLength(88);
    const expectedRoutes = baseline.routes.filter((route) => route.path !== '/review' && route.path !== '/space');
    expect(
      routeManifest.filter(route => !['/wallet', '/download', '/local-client/authorize'].includes(route.path)).map(({ path, canonicalPath, layout, family, minimumRole, anonymousResult, frozenBoundary }, order) => ({
        order,
        path,
        canonicalPath,
        layout,
        family,
        minimumRole,
        anonymousResult,
        frozenBoundary,
      })),
    ).toEqual(
      expectedRoutes.map(({ path, canonicalPath, expectedLayout: layout, family, minimumRole, anonymousResult, frozenBoundary }, order) => ({
          order,
          path,
          canonicalPath,
          layout,
          family,
          minimumRole: path === '/admin' ? 'member' : minimumRole,
          anonymousResult,
          frozenBoundary,
      })),
    );
    expect(routeManifest.filter((route) => route.family === 'operations').map((route) => route.path)).toEqual(['/admin']);
    expect(routeManifest.find((route) => route.path === '/admin')?.minimumRole).toBe('member');
    expect(routeManifest.some((route) => ['/review', '/space', '/admin/content', '/admin/users', '/admin/system', '/admin/records'].includes(route.path))).toBe(false);
  });

  it('keeps the catch-all last and every route lazy-loadable', () => {
    expect(routeManifest.at(-1)?.path).toBe('*');
    expect(routeManifest.slice(0, -1).every((route) => route.path.startsWith('/'))).toBe(true);
    expect(new Set(routeManifest.map((route) => route.order)).size).toBe(88);
  });

  it('does not declare the retired /space route', () => {
    const activePaths: readonly string[] = routeManifest.map((route) => route.path);
    expect(activePaths).not.toContain('/space');
  });
  it('adds the private wallet without changing the historical route baseline', () => {
    expect(routeManifest.find(route => route.path === '/wallet')).toMatchObject({ layout: 'WorkspaceLayout', minimumRole: 'member', translationNamespaces: ['wallet'], titleKey: 'routes.wallet' });
  });
  it('adds the public Android download page before the catch-all', () => {
    expect(routeManifest.find(route => route.path === '/download')).toMatchObject({ layout: 'PublicLayout', minimumRole: 'none', family: 'download', titleKey: 'routes.download' });
  });
  it('adds official consent explicitly without rewriting the immutable route baseline', () => {
    expect(routeManifest.find(route => route.path === '/local-client/authorize')).toMatchObject({ minimumRole: 'none', translationNamespaces: ['auth'], titleKey: 'routes.localAuthorization' });
  });
});
