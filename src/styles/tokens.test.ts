import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const themes = {
  light: {
    canvas: "#f8fafc",
    surface: "#ffffff",
    ink: "#2c3e50",
    muted: "#4a5568",
    accent: "#2b577a",
    signal: "#2b577a",
    destructive: "#b42318",
    warning: "#8a5a00",
  },
  dark: {
    canvas: "#0b1218",
    surface: "#111c25",
    ink: "#e8f0f5",
    muted: "#a8b6c2",
    accent: "#83b4d4",
    signal: "#83b4d4",
    destructive: "#ff8a80",
    warning: "#f1c75b",
  },
} as const;

function luminance(hex: string) {
  const channels = hex
    .match(/[a-f\d]{2}/gi)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe.each(Object.entries(themes))("%s semantic tokens", (_name, colors) => {
  it.each([
    "ink",
    "muted",
    "accent",
    "signal",
    "destructive",
    "warning",
  ] as const)("%s is readable on canvas", (token) => {
    expect(contrast(colors[token], colors.canvas)).toBeGreaterThanOrEqual(
      token === "muted" ? 4.5 : 3,
    );
  });
  it("body ink is readable on surfaces", () =>
    expect(contrast(colors.ink, colors.surface)).toBeGreaterThanOrEqual(7));
});

describe("foundation ownership boundaries", () => {
  it("blocks initial paint on all self-hosted core font faces", () => {
    const css = fs.readFileSync(
      path.resolve("public/fonts/library/rinspace-core-fonts.css"),
      "utf8",
    );
    for (const family of [
      "IBM Plex Sans",
      "Rinspace Newsreader",
      "IBM Plex Mono",
      "Rinspace Noto Sans SC",
      "Rinspace Noto Serif SC",
    ])
      expect(css).toContain(family);
    const faces = css.match(/@font-face/g) || [];
    expect(faces.length).toBeGreaterThan(4);
    expect(css.match(/font-display:\s*block/g)).toHaveLength(faces.length);
    expect(css).not.toMatch(/font-display:\s*(swap|fallback|optional)/);
    expect(css).not.toMatch(/font-family:\s*'(?:Newsreader|Noto Sans SC|Noto Serif SC)'/);
  });

  it("omits Tailwind preflight and protects rich/editor/frozen surfaces", () => {
    const entry = fs.readFileSync(path.resolve("src/styles/index.css"), "utf8");
    const foundations = fs.readFileSync(
      path.resolve("src/styles/foundations.css"),
      "utf8",
    );
    expect(entry).not.toContain("preflight.css");
    for (const boundary of [
      ".rin-rich-content",
      ".rin-editor-host",
      '[data-rin-ui-boundary="frozen"]',
      ".katex",
      "mjx-container",
    ])
      expect(foundations).toContain(boundary);
  });

  it("keeps v2 text on target families instead of legacy system fallbacks", () => {
    const entry = fs.readFileSync(path.resolve("src/styles/index.css"), "utf8");
    const contract = fs.readFileSync(
      path.resolve("src/styles/font-contract.css"),
      "utf8",
    );
    expect(entry).toContain('@import "./font-contract.css"');
    expect(contract).toContain("var(--rin-font-interface)");
    expect(contract).toContain("var(--rin-font-editorial)");
    expect(contract).toContain("var(--rin-font-mono)");
    expect(contract).toContain('[data-rin-ui-boundary="frozen"]');
    expect(contract).toContain(".cm-editor");
    expect(contract).toContain("font-family: inherit !important");
    expect(contract).toContain(".rin-milkdown-editor-host");
    expect(contract).toContain(".rin-community-action-icon");
    expect(contract).toContain(
      'font-family: "Rin Community Actions" !important',
    );
    expect(contract).not.toMatch(/Georgia|Open Sans|PingFang|Microsoft YaHei/);

    const homeCards = fs.readFileSync(
      path.resolve("src/styles/home-community-content-cards.css"),
      "utf8",
    );
    expect(homeCards).toContain('font-family: "Rin Community Actions"');
  });

  it("keeps cultivation realm and phase semantics in the shared style entry", () => {
    const entry = fs.readFileSync(path.resolve("src/styles/index.css"), "utf8");
    const cultivation = fs.readFileSync(
      path.resolve("src/styles/cultivation.css"),
      "utf8",
    );
    expect(entry).toContain('@import "./cultivation.css"');
    for (const realm of [
      "qi",
      "foundation",
      "dan",
      "yuanying",
      "huashen",
      "lianxu",
      "heti",
      "dacheng",
      "zhenxian",
      "jinxian",
      "taiyi",
      "daluo",
      "daozu",
    ]) {
      expect(cultivation).toContain(`.cultivation-badge.realm-${realm}`);
    }
    for (const phase of ["q1", "q13", "early", "middle", "late", "complete"]) {
      expect(cultivation).toContain(`.cultivation-badge.phase-${phase}`);
    }
  });

  it("anchors shared transient notices to the bottom-left", () => {
    const foundations = fs.readFileSync(
      path.resolve("src/styles/foundations.css"),
      "utf8",
    );
    expect(foundations).toContain(".rin-ui-toast-region");
    expect(foundations).toContain("inset-inline-start");
    expect(foundations).toMatch(
      /\.rin-ui-toast-region\s*\{[^}]*pointer-events:\s*none;/s,
    );
    expect(foundations).toMatch(
      /\.rin-ui-toast-action\s*\{[^}]*pointer-events:\s*auto;/s,
    );
    expect(foundations).toContain("body .notice { --rin-notice-bottom:");
    expect(foundations).toContain("top: auto !important");
    expect(foundations).toContain("left: max(1rem");
    expect(foundations).toContain(
      "bottom: calc(var(--rin-notice-bottom) + 58px) !important",
    );
  });

  it("lets the Markdown editor content grow without releasing the sticky toolbar", () => {
    const migratedPages = fs.readFileSync(
      path.resolve("src/styles/migrated-pages.css"),
      "utf8",
    );
    expect(migratedPages).toMatch(
      /\.markdown-writer-shell \.milkdown-editor-host \.milkdown\s*\{[^}]*block-size:\s*auto;[^}]*min-block-size:\s*100%;/s,
    );
    expect(migratedPages).toMatch(
      /\.markdown-writer-shell \.milkdown-editor-host \.ProseMirror\s*\{[^}]*flex:\s*1 0 auto;/s,
    );
  });

  it("aligns the Markdown publish controls to the compact control height", () => {
    const migratedPages = fs.readFileSync(
      path.resolve("src/styles/migrated-pages.css"),
      "utf8",
    );
    expect(migratedPages).toMatch(
      /\.markdown-writer-publish-bar\s+:is\(\.writer-title-field > \.rin-ui-control, \.markdown-status-select\)\s*\{[^}]*block-size:\s*38px;[^}]*min-block-size:\s*38px;[^}]*padding-block:\s*0;/s,
    );
  });

  it("stacks the Markdown publish fields without collapsing columns on mobile", () => {
    const migratedPages = fs.readFileSync(
      path.resolve("src/styles/migrated-pages.css"),
      "utf8",
    );
    expect(migratedPages).toMatch(
      /@media \(max-width:\s*620px\)\s*\{[\s\S]*?\.markdown-writer-publish-bar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
    expect(migratedPages).toMatch(
      /\.markdown-writer-publish-bar > :is\([\s\S]*?\.writer-title-field,[\s\S]*?\.writer-tags-field,[\s\S]*?\.writer-cover-field,[\s\S]*?\.writer-topbar-actions[\s\S]*?\)\s*\{[^}]*grid-column:\s*1 \/ -1;/,
    );
    expect(migratedPages).toMatch(
      /\.markdown-writer-publish-bar \.markdown-status-controls\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    );
  });

  it("keeps the full topbar brand while compacting actions at phone and tablet widths", () => {
    const tokens = fs.readFileSync(
      path.resolve("src/styles/tokens.css"),
      "utf8",
    );
    const topbar = fs.readFileSync(
      path.resolve("src/styles/topbar-shell.css"),
      "utf8",
    );
    expect(tokens).toContain("--rin-topbar-compact-control-size: 34px");
    expect(topbar).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(140px,\s*1fr\) auto;/,
    );
    expect(topbar).toMatch(
      /\.rin-app-shell > \.topbar\.rin-topbar-shell \.brand\s*\{[^}]*min-inline-size:\s*max-content;[^}]*max-inline-size:\s*none;/s,
    );
    expect(topbar).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.topbar-desktop-actions\s*\{[^}]*display:\s*none;[\s\S]*?\.topbar-compact-actions\s*\{[^}]*display:\s*inline-flex;/,
    );
    expect(topbar).not.toMatch(
      /data-session-state="(?:authenticated|restoring)"[^\n]*\.brand-word/,
    );
    expect(topbar).toMatch(
      /\.rin-app-shell > \.topbar \.brand-word\s*\{[^}]*display:\s*grid;[^}]*block-size:\s*38px;[^}]*place-items:\s*center;/s,
    );
    expect(topbar).not.toContain("translateY(2px)");
    expect(topbar).toMatch(
      /\.account-menu-trigger \.avatar-name-mark\s*\{[^}]*inline-size:\s*100%;[^}]*block-size:\s*100%;[^}]*flex-basis:\s*100%;/s,
    );
  });

  it("uses one near-full-width gutter for standard mobile pages", () => {
    const tokens = fs.readFileSync(
      path.resolve("src/styles/tokens.css"),
      "utf8",
    );
    const migratedPages = fs.readFileSync(
      path.resolve("src/styles/migrated-pages.css"),
      "utf8",
    );
    const home = fs.readFileSync(
      path.resolve("src/styles/home-community-content-cards.css"),
      "utf8",
    );
    expect(tokens).toContain("--rin-mobile-page-gutter: 8px");
    for (const shell of [".home-shell", ".detail-shell", ".profile-shell"]) {
      expect(migratedPages).toContain(shell);
    }
    expect(migratedPages).toContain(
      "padding-inline-start: max(var(--rin-mobile-page-gutter), env(safe-area-inset-left, 0px))",
    );
    expect(migratedPages).toContain(
      "padding-inline-end: max(var(--rin-mobile-page-gutter), env(safe-area-inset-right, 0px))",
    );
    expect(home).toContain(
      "padding-inline-start: max(var(--rin-mobile-page-gutter), env(safe-area-inset-left, 0px))",
    );
  });

  it("compacts profile tabs on mobile while preserving scrollbar-free horizontal access", () => {
    const migratedPages = fs.readFileSync(
      path.resolve("src/styles/migrated-pages.css"),
      "utf8",
    );
    expect(migratedPages).toMatch(
      /@media \(max-width:\s*48rem\)\s*\{[\s\S]*?\.profile-tabs\.rin-animate-tabs\s*\{[^}]*gap:\s*0;[^}]*padding:\s*0;[^}]*scrollbar-width:\s*none;/s,
    );
    expect(migratedPages).toMatch(
      /\.profile-tabs\.rin-animate-tabs::-webkit-scrollbar\s*\{[^}]*display:\s*none;/s,
    );
    expect(migratedPages).toMatch(
      /\.profile-tabs\.rin-animate-tabs button\s*\{[^}]*min-inline-size:\s*0;[^}]*min-block-size:\s*42px;[^}]*padding-inline:\s*10px;/s,
    );
    expect(migratedPages).toMatch(
      /\.profile-tabs\.rin-animate-tabs \.rin-animate-tab__label\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*4px;/s,
    );
  });

  it("keeps shared mobile topbar controls aligned across both runtimes", () => {
    const mobileSearch = fs.readFileSync(
      path.resolve("src/styles/rinspace-topbar-mobile-search.css"),
      "utf8",
    );
    expect(mobileSearch).toMatch(
      /@media \(width <= 900px\)\s*\{[\s\S]*?\.account-menu-trigger\s*\{[^}]*inline-size:\s*var\(--rin-topbar-compact-control-size\);[^}]*max-inline-size:\s*var\(--rin-topbar-compact-control-size\);[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    );
    expect(mobileSearch).toMatch(
      /\.account-menu-trigger\s+\.avatar-name-mark\s*\{[^}]*inline-size:\s*100%;[^}]*block-size:\s*100%;[^}]*flex-basis:\s*100%;[^}]*box-sizing:\s*border-box;/s,
    );
    expect(mobileSearch).toMatch(
      /\.topbar\.rin-topbar-shell\s*\{[^}]*grid-template-columns:\s*max-content minmax\(36px,\s*1fr\) auto;/s,
    );
    expect(mobileSearch).toMatch(
      /:is\(\.rinspace-topbar-search,\s*\.topbar-search\)\s*>\s*button\s*\{[^}]*inline-size:\s*var\(--rin-topbar-compact-control-size\);[^}]*block-size:\s*var\(--rin-topbar-compact-control-size\);[^}]*flex:\s*0 0 var\(--rin-topbar-compact-control-size\);[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*border-radius:\s*999px;/s,
    );
    expect(mobileSearch).toMatch(
      /@media \(width <= 620px\)\s*\{[\s\S]*?\.mobile-search-open\[role="search"\]\s*\{[^}]*position:\s*absolute;[^}]*grid-column:\s*auto;[^}]*grid-row:\s*auto;[^}]*inset-block-start:\s*calc\(100% \+ 8px\);[^}]*inset-inline-start:\s*max\(10px,\s*env\(safe-area-inset-left\)\);[^}]*inset-inline-end:\s*max\(10px,\s*env\(safe-area-inset-right\)\);[^}]*inline-size:\s*auto;[^}]*justify-self:\s*stretch;/s,
    );
    expect(mobileSearch).not.toContain("position: fixed");
    expect(mobileSearch).not.toContain("100vw");
  });
});
