import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const inventory = JSON.parse(
  fs.readFileSync(path.join(root, "contracts/routes-baseline.json"), "utf8"),
);
if (inventory.declarationCount !== 87 || inventory.routes.length !== 87)
  throw new Error("Route baseline is not 87/87.");

const baselineRoutes = inventory.routes;
const catchAll = baselineRoutes.at(-1);
if (!catchAll || catchAll.path !== "*")
  throw new Error("Route baseline catch-all is missing.");
const routes = baselineRoutes
  .filter((route) => route.path !== "/review" && route.path !== "/space")
  .map((route, order) => {
    if (route.path === "/admin")
      return {
        ...route,
        order,
        minimumRole: "member",
        element: "<AdminPage />",
      };
    return { ...route, order };
  });
const imports = new Map();
// Product additions are explicit; do not rewrite the immutable 87-route baseline.
routes.splice(routes.length - 1, 0, {
  path: "/wallet",
  canonicalPath: "/wallet",
  pageComponent: "WalletPage",
  pageModule: "@/pages/Wallet",
  family: "account-policy",
  expectedLayout: "WorkspaceLayout",
  minimumRole: "member",
  anonymousResult: "login-required",
  frozenBoundary: "rinspace-owned",
  element: "<WalletPage />",
});
routes.splice(routes.length - 1, 0, {
  path: "/download",
  canonicalPath: "/download",
  pageComponent: "DownloadPage",
  pageModule: "@/pages/Download",
  family: "download",
  expectedLayout: "PublicLayout",
  minimumRole: "none",
  anonymousResult: "render",
  frozenBoundary: "rinspace-owned",
  element: "<DownloadPage />",
});
routes.splice(routes.length - 1, 0, {
  path: "/local-client/authorize",
  canonicalPath: "/local-client/authorize",
  pageComponent: "LocalAuthorizationPage",
  pageModule: "@/pages/LocalAuthorization",
  family: "account-policy",
  expectedLayout: "PublicLayout",
  minimumRole: "none",
  anonymousResult: "official-consent-or-error",
  frozenBoundary: "rinspace-owned",
  element: "<LocalAuthorizationPage />",
});
routes.forEach((route, order) => {
  route.order = order;
});
for (const route of routes) {
  if (route.pageComponent === "Navigate") continue;
  const modulePath = route.pageModule.replace(/^@\//, "");
  const current = imports.get(route.pageComponent);
  if (
    current &&
    (current.modulePath !== modulePath || current.family !== route.family)
  )
    throw new Error(`Conflicting module/family for ${route.pageComponent}.`);
  imports.set(route.pageComponent, { modulePath, family: route.family });
}

const namedSponsor = new Set([
  "SponsorSupporterListPage",
  "SponsorSupporterPage",
  "SponsorAlipayReturnPage",
]);
const declarations = [...imports]
  .map(([component, { modulePath, family }]) =>
    namedSponsor.has(component)
      ? `const ${component} = lazy(() => Promise.all([import('${modulePath}'), loadFamilyStyles(${JSON.stringify(family)})]).then(([module]) => ({ default: module.${component} })));`
      : `const ${component} = lazy(() => Promise.all([import('${modulePath}'), loadFamilyStyles(${JSON.stringify(family)})]).then(([module]) => module));`,
  )
  .join("\n");

function titleKeyForRoute(route) {
  const routePath = route.path;
  if (routePath === "/") return "routes.home";
  const exact = {
    "/about": "routes.about",
    "/legal": "routes.legal",
    "/terms": "routes.terms",
    "/privacy": "routes.privacy",
    "/copyright": "routes.copyright",
    "/contact": "routes.contact",
    "/search": "routes.search",
    "/creator": "routes.creator",
    "/settings": "routes.settings",
    "/wallet": "routes.wallet",
    "/download": "routes.download",
    "/local-client/authorize": "routes.localAuthorization",
    "/admin": "routes.admin",
    "/notifications": "routes.notifications",
    "/activity": "routes.activity",
    "/badges": "routes.badges",
    "/users": "routes.users",
    "*": "routes.notFound",
  };
  if (exact[routePath]) return exact[routePath];
  if (routePath.startsWith("/sponsor")) return "routes.sponsor";
  if (routePath.includes("/questions/ask")) return "routes.ask";
  if (routePath.startsWith("/questions") || routePath.startsWith("/q/"))
    return "routes.questions";
  if (routePath.startsWith("/tags"))
    return routePath === "/tags" ? "routes.tags" : "routes.tag";
  if (routePath.startsWith("/blog") || routePath.startsWith("/a/"))
    return "routes.blogs";
  if (routePath.startsWith("/books") || routePath.startsWith("/author/"))
    return routePath === "/books" ? "routes.books" : "routes.book";
  if (
    routePath.startsWith("/users/") ||
    routePath.startsWith("/:username") ||
    routePath === "/me"
  )
    return "routes.profile";
  if (routePath.startsWith("/announcements")) return "routes.announcements";
  if (
    routePath.startsWith("/discussions") ||
    routePath.startsWith("/d/") ||
    routePath.startsWith("/forum/")
  )
    return "routes.discussions";
  if (routePath.startsWith("/dynamics") || routePath.startsWith("/s/"))
    return "routes.dynamics";
  if (
    routePath.startsWith("/write") ||
    routePath.includes("/workspace") ||
    routePath.endsWith("/edit") ||
    routePath.endsWith("/new")
  )
    return "routes.write";
  return "routes.content";
}

function namespacesForRoute(route) {
  if (route.path === "/local-client/authorize") return ["auth"];
  if (route.path === "/wallet") return ["wallet"];
  if (route.path === "/settings") return ["settings"];
  if (route.path === "/admin") return ["admin", "identity"];
  if (route.path === "/creator") return ["creator"];
  const namespaceByFamily = {
    "account-policy": "legal",
    creation: "creation",
    discovery: "discovery",
    identity: "identity",
    knowledge: "reader",
    operations: "admin",
  };
  const namespace = namespaceByFamily[route.family];
  return namespace ? [namespace] : [];
}

const rows = routes
  .map(
    (route) => `  {
    order: ${route.order},
    path: ${JSON.stringify(route.path)},
    canonicalPath: ${JSON.stringify(route.canonicalPath)},
    titleKey: ${JSON.stringify(titleKeyForRoute(route))},
    translationNamespaces: ${JSON.stringify(namespacesForRoute(route))},
    layout: ${JSON.stringify(route.expectedLayout)},
    family: ${JSON.stringify(route.family)},
    minimumRole: ${JSON.stringify(route.minimumRole)},
    anonymousResult: ${JSON.stringify(route.anonymousResult)},
    frozenBoundary: ${JSON.stringify(route.frozenBoundary)},
    element: ${route.element},
  },`,
  )
  .join("\n");

const source = `/* Generated by scripts/generate-typed-route-manifest.mjs. */
import { lazy, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { loadFamilyStyles } from 'app/config/familyStyles';
import type { TranslationNamespace } from '@/i18n/types';

${declarations}

export type LayoutKind = 'PublicLayout' | 'ReaderLayout' | 'WorkspaceLayout' | 'AdminLayout' | 'FrozenIntegrationLayout';
export type RouteDefinition = Readonly<{
  order: number;
  path: string;
  canonicalPath: string;
  titleKey: string;
  translationNamespaces: readonly TranslationNamespace[];
  layout: LayoutKind;
  family: string;
  minimumRole: string;
  anonymousResult: string;
  frozenBoundary: string;
  element: ReactElement;
}>;

export const routeManifest = [
${rows}
] as const satisfies readonly RouteDefinition[];

if (routeManifest.length !== 88) throw new Error('Typed route manifest must contain 85 retained routes plus wallet, download and local consent.');
`;
const output = path.join(root, "src/app/routing/routeManifest.tsx");
if (process.argv.includes("--check")) {
  if (fs.readFileSync(output, "utf8") !== source)
    throw new Error("Typed route manifest is stale; run pnpm generate:routes.");
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, source);
}
console.log(
  `Generated typed route manifest with ${routes.length} routes and ${imports.size} lazy page components.`,
);
