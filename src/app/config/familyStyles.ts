let darkLegacyStyles: Promise<unknown> | undefined;

export function loadDarkLegacyStyles() {
  if (typeof document === "undefined" || document.documentElement.dataset.theme !== "dark") {
    return Promise.resolve();
  }
  darkLegacyStyles ??= import("@/styles/product-families/dark-legacy-overrides.css");
  return darkLegacyStyles;
}

const loaders: Record<string, () => Promise<unknown>> = {
  discovery: async () => {
    await import("@/styles/product-families/discovery.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return loadDarkLegacyStyles();
  },
  knowledge: async () => {
    await import("@/styles/product-families/knowledge.css");
    await import("@/styles/product-families/knowledge-accessibility.css");
    await import("@/styles/product-families/unified-comments.css");
    await import("@/styles/product-families/unified-book-reviews.css");
    await import("@/styles/product-families/book-reader-annotations.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return loadDarkLegacyStyles();
  },
  identity: async () => {
    await import("@/styles/product-families/identity.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return loadDarkLegacyStyles();
  },
  creation: async () => {
    await import("@/styles/product-families/creation.css");
    await import("@/styles/creator-workspace.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return loadDarkLegacyStyles();
  },
  operations: async () => {
    await import("@/styles/product-families/operations.css");
    await import("@/styles/admin-workspace.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return loadDarkLegacyStyles();
  },
  "account-policy": async () => {
    await import("@/styles/product-families/account-policy.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return loadDarkLegacyStyles();
  },
  download: async () => import("@/styles/product-families/download.css"),
};

const loaded = new Map<string, Promise<unknown>>();
export function loadFamilyStyles(family: string) {
  const loader = loaders[family];
  if (!loader) return Promise.resolve();
  const existing = loaded.get(family);
  if (existing) return existing;
  const request = loader();
  loaded.set(family, request);
  return request;
}
