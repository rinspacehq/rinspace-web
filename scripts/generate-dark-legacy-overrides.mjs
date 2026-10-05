// Generates src/styles/product-families/dark-legacy-overrides.css from the six
// minimized legacy route-family stylesheets. Parses every rule with postcss,
// rewrites hardcoded light-theme colors to --rin-* dark tokens, and emits
// unlayered `[data-theme="dark"] <selector>` rules that win over the low-priority
// `route-foundation` layer.
//
// Run from ui/:  node scripts/generate-dark-legacy-overrides.mjs
// Manual additions go in dark-legacy-overrides.manual.css (appended verbatim).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const uiRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const familiesDir = path.join(uiRoot, 'src/styles/product-families');
const familyFiles = [
  'discovery.css',
  'knowledge.css',
  'knowledge-accessibility.css',
  'identity.css',
  'creation.css',
  'operations.css',
  'account-policy.css',
];
const outFile = path.join(familiesDir, 'dark-legacy-overrides.css');
const manualFile = path.join(familiesDir, 'dark-legacy-overrides.manual.css');

// Property groups decide which replacement table applies.
const TEXT_PROPS = new Set(['color', 'caret-color', 'fill', 'stroke', 'text-decoration-color']);
const BORDER_PROPS = new Set([
  'border', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-inline', 'border-block', 'border-inline-start', 'border-inline-end',
  'border-block-start', 'border-block-end', 'outline', 'outline-color',
]);
const BG_PROPS = new Set(['background', 'background-color']);
const SHADOW_PROPS = new Set(['box-shadow']);

// Ordered longest-first; each entry replaces one hardcoded light value.
const TEXT_MAP = [
  [/rgba\(\s*26\s*,\s*27\s*,\s*23\s*,\s*[\d.]+\s*\)/g, 'var(--rin-ink)'],
  [/rgba\(\s*(?:38\s*,\s*38\s*,\s*32|44\s*,\s*62\s*,\s*80|111\s*,\s*103\s*,\s*90)\s*,\s*[\d.]+\s*\)/g, 'var(--rin-ink-muted)'],
  [/rgba\(\s*43\s*,\s*87\s*,\s*122\s*,\s*[\d.]+\s*\)/g, 'var(--rin-accent)'],
  [/rgb\(\s*27\s*,\s*27\s*,\s*24\s*\)/g, 'var(--rin-ink)'],
  [/rgb\(\s*44\s*,\s*62\s*,\s*80\s*\)/g, 'var(--rin-ink)'],
  [/#374151/gi, 'var(--rin-ink)'],
  [/#334155/gi, 'var(--rin-ink)'],
  [/#243447/gi, 'var(--rin-ink)'],
  [/#24292e/gi, 'var(--rin-ink)'],
  [/#384457/gi, 'var(--rin-ink)'],
  [/#2f3744/gi, 'var(--rin-ink)'],
  [/#28332d/gi, 'var(--rin-ink)'],
  [/#2c3e50/gi, 'var(--rin-ink)'],
  [/#1b1b18/gi, 'var(--rin-ink)'],
  [/#1f2a24/gi, 'var(--rin-ink)'],
  [/#1f2933/gi, 'var(--rin-ink)'],
  [/#1f2937/gi, 'var(--rin-ink)'],
  [/#18191c/gi, 'var(--rin-ink)'],
  [/#17202a/gi, 'var(--rin-ink)'],
  [/#111827/gi, 'var(--rin-ink)'],
  [/#000(?:000)?(?![0-9a-fA-F])/gi, 'var(--rin-ink)'],
  [/#333(?![0-9a-fA-F])/gi, 'var(--rin-ink)'],
  [/rgba\(\s*74\s*,\s*85\s*,\s*104\s*,\s*(?:0?\.34)\s*\)/g, 'var(--rin-border-strong)'],
  [/rgba\(\s*74\s*,\s*85\s*,\s*104\s*,\s*[\d.]+\s*\)/g, 'var(--rin-ink-muted)'],
  [/#718096/gi, 'var(--rin-ink-muted)'],
  [/#708078/gi, 'var(--rin-ink-muted)'],
  [/#6b7280/gi, 'var(--rin-ink-muted)'],
  [/#64706a/gi, 'var(--rin-ink-muted)'],
  [/#64748b/gi, 'var(--rin-ink-muted)'],
  [/#61666d/gi, 'var(--rin-ink-muted)'],
  [/#5f6f68/gi, 'var(--rin-ink-muted)'],
  [/#5f6b63/gi, 'var(--rin-ink-muted)'],
  [/#53645d/gi, 'var(--rin-ink-muted)'],
  [/#52606d/gi, 'var(--rin-ink-muted)'],
  [/#4b5563/gi, 'var(--rin-ink-muted)'],
  [/#4a5568/gi, 'var(--rin-ink-muted)'],
  [/#475569/gi, 'var(--rin-ink-muted)'],
  [/#46564f/gi, 'var(--rin-ink-muted)'],
  [/#465461/gi, 'var(--rin-ink-muted)'],
  [/#7a847d/gi, 'var(--rin-ink-muted)'],
  [/#7a817b/gi, 'var(--rin-ink-muted)'],
  [/#68736d/gi, 'var(--rin-ink-muted)'],
  [/#345773/gi, 'var(--rin-accent)'],
  [/#245a83/gi, 'var(--rin-accent)'],
  [/#244a68/gi, 'var(--rin-accent)'],
  [/#173f60/gi, 'var(--rin-accent)'],
  [/#008ac5/gi, 'var(--rin-accent)'],
  [/#2b577a/gi, 'var(--rin-accent)'],
  [/#3b82f6/gi, 'var(--rin-collection)'],
  [/#2563eb/gi, 'var(--rin-collection)'],
  [/#1d4ed8/gi, 'var(--rin-collection)'],
  [/#1e3a8a/gi, 'var(--rin-collection)'],
  [/#165dff/gi, 'var(--rin-collection)'],
  [/#476454/gi, 'var(--rin-success)'],
  [/#315f52/gi, 'var(--rin-success)'],
  [/#315946/gi, 'var(--rin-success)'],
  [/#244f3d/gi, 'var(--rin-success)'],
  [/#244b39/gi, 'var(--rin-success)'],
  [/#1f6f50/gi, 'var(--rin-success)'],
  [/#1f553d/gi, 'var(--rin-success)'],
  [/#166534/gi, 'var(--rin-success)'],
  [/#0f5f59/gi, 'var(--rin-success)'],
  [/#065f46/gi, 'var(--rin-success)'],
  [/#064e3b/gi, 'var(--rin-success)'],
  [/#8a5a20/gi, 'var(--rin-warning)'],
  [/#8a5a00/gi, 'var(--rin-warning)'],
  [/#276749/gi, 'var(--rin-success)'],
  [/#b91c1c/gi, 'var(--rin-destructive)'],
  [/#9f2f2f/gi, 'var(--rin-destructive)'],
  [/#9f1239/gi, 'var(--rin-destructive)'],
  [/#9a3412/gi, 'var(--rin-destructive)'],
  [/#991b1b/gi, 'var(--rin-destructive)'],
  [/#8f3420/gi, 'var(--rin-destructive)'],
  [/#7f1d1d/gi, 'var(--rin-destructive)'],
  [/#9d2f25/gi, 'var(--rin-destructive)'],
  [/#b42318/gi, 'var(--rin-destructive)'],
];

const BG_MAP = [
  [/#ffffff/gi, 'var(--rin-surface)'],
  [/#fff(?![0-9a-fA-F])/gi, 'var(--rin-surface)'],
  [/#f8fafc/gi, 'var(--rin-canvas)'],
  [/#f1f5f9/gi, 'var(--rin-surface-subtle)'],
  [/#edf2f7/gi, 'var(--rin-surface-subtle)'],
  [/#e2e8f0/gi, 'var(--rin-surface-subtle)'],
  [/#e5e7eb/gi, 'var(--rin-surface-subtle)'],
  [/#cbd5df/gi, 'var(--rin-surface-subtle)'],
  [/#2b577a/gi, 'var(--rin-accent)'],
  [/#2c3e50/gi, 'var(--rin-elevated)'],
  [/#1b1b18/gi, 'var(--rin-elevated)'],
  [/#276749/gi, 'var(--rin-success)'],
  [/#25583f/gi, 'var(--rin-success)'],
  [/#1f6f50/gi, 'var(--rin-success)'],
  [/#1f553d/gi, 'var(--rin-success)'],
  [/#b91c1c/gi, 'var(--rin-destructive)'],
  [/#9f2f2f/gi, 'var(--rin-destructive)'],
  [/#991b1b/gi, 'var(--rin-destructive)'],
  [/#9d2f25/gi, 'var(--rin-destructive)'],
  [/#b42318/gi, 'var(--rin-destructive)'],
  [/#8a5a20/gi, 'var(--rin-warning)'],
  [/#8a5a00/gi, 'var(--rin-warning)'],
  [/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g, 'rgba(17, 28, 37, $1)'],
  [/rgba\(\s*248\s*,\s*250\s*,\s*252\s*,\s*([\d.]+)\s*\)/g, 'rgba(11, 18, 24, $1)'],
  [/rgba\(\s*237\s*,\s*242\s*,\s*247\s*,\s*([\d.]+)\s*\)/g, 'rgba(15, 25, 33, $1)'],
];

const BORDER_MAP = [
  [/#e5e7eb/gi, 'var(--rin-border-subtle)'],
  [/#e3e5e7/gi, 'var(--rin-border-subtle)'],
  [/#e2e8f0/gi, 'var(--rin-border-subtle)'],
  [/#edf2f7/gi, 'var(--rin-border-subtle)'],
  [/#f1f5f9/gi, 'var(--rin-border-subtle)'],
  [/#cbd5df/gi, 'var(--rin-border-subtle)'],
  [/#d1d5db/gi, 'var(--rin-border-subtle)'],
  [/#d8dce3/gi, 'var(--rin-border-subtle)'],
  [/#d8e0dc/gi, 'var(--rin-border-subtle)'],
  [/#d0d7de/gi, 'var(--rin-border-subtle)'],
  [/#c9ced8/gi, 'var(--rin-border-subtle)'],
  [/#c9ccd0/gi, 'var(--rin-border-subtle)'],
  [/#cbd5e1/gi, 'var(--rin-border-subtle)'],
  [/#b7bcc5/gi, 'var(--rin-border-subtle)'],
  [/#f1f2f3/gi, 'var(--rin-border-subtle)'],
  [/#eef0f3/gi, 'var(--rin-border-subtle)'],
  [/#9ca3af/gi, 'var(--rin-border-strong)'],
  [/rgba\(\s*(?:15\s*,\s*23\s*,\s*42|27\s*,\s*27\s*,\s*24|24\s*,\s*33\s*,\s*47|36\s*,\s*52\s*,\s*71|44\s*,\s*62\s*,\s*80|100\s*,\s*116\s*,\s*139)\s*,\s*(?:0?\.(?:1[89]|[2-9]\d?)|1(?:\.0+)?)\s*\)/g, 'var(--rin-border-strong)'],
  [/rgba\(\s*(?:15\s*,\s*23\s*,\s*42|27\s*,\s*27\s*,\s*24|24\s*,\s*33\s*,\s*47|36\s*,\s*52\s*,\s*71|44\s*,\s*62\s*,\s*80|100\s*,\s*116\s*,\s*139)\s*,\s*(?:0?\.(?=\d*[1-9])\d+|1(?:\.0+)?)\s*\)/g, 'var(--rin-border-subtle)'],
  [/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(?:0?\.(?=\d*[1-9])\d+|1(?:\.0+)?)\s*\)/g, 'var(--rin-border-subtle)'],
];

const SHADOW_MAP = [
  [/rgba\(\s*27\s*,\s*27\s*,\s*24\s*,\s*([\d.]+)\s*\)/g, 'rgba(0, 0, 0, $1)'],
  [/rgba\(\s*44\s*,\s*62\s*,\s*80\s*,\s*([\d.]+)\s*\)/g, 'rgba(0, 0, 0, $1)'],
  [/rgb\(\s*44\s*62\s*80\s*\/\s*([\d.]+)\s*\)/g, 'rgb(0 0 0 / $1)'],
];

const mapsFor = (prop) =>
  TEXT_PROPS.has(prop) ? TEXT_MAP : BORDER_PROPS.has(prop) ? BORDER_MAP
  : BG_PROPS.has(prop) ? BG_MAP : SHADOW_PROPS.has(prop) ? SHADOW_MAP : null;

function rewriteValue(prop, value, onColor = null) {
  if (/var\(|gradient\(|url\(/i.test(value)) return null;
  if (TEXT_PROPS.has(prop) && onColor && /^(?:#fff(?:fff)?|white)$/i.test(value.trim())) {
    return `var(${onColor})`;
  }
  const map = mapsFor(prop);
  if (!map) return null;
  let out = value;
  let changed = false;
  for (const [re, repl] of map) {
    if (re.test(out)) { out = out.replace(re, repl); changed = true; }
  }
  return changed ? out : null;
}

function splitTopLevelCommas(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts;
}

function prefixSelectorWithDark(selector) {
  return splitTopLevelCommas(selector).map((part) => `[data-theme="dark"] ${part}`).join(', ');
}

function parentAtRulePrefix(rule) {
  const parts = [];
  let p = rule.parent;
  while (p && p.type === 'atrule') {
    if (p.name !== 'layer') parts.unshift(p);
    p = p.parent;
  }
  return parts;
}

const emitted = new Map(); // key -> { wrapper, selector, prop, value, important }
let skippedVarGradient = 0;

for (const file of familyFiles) {
  const css = fs.readFileSync(path.join(familiesDir, file), 'utf8');
  const root = postcss.parse(css, { from: file });
  root.walkRules((rule) => {
    if (!rule.selector) return;
    if (/^:root$/.test(rule.selector)) return;
    const wrappers = parentAtRulePrefix(rule);
    const wrapperKey = wrappers.map((w) => `${w.name} ${w.params}`).join('|');
    if (wrappers.some((w) => w.name === 'keyframes')) return;
    if (rule.selector.includes('[data-theme')) return;

    let prefixed = null;
    const declarations = (rule.nodes ?? []).filter((node) => node.type === 'decl');
    const hasFlatBackground = (pattern) => declarations.some((decl) =>
      BG_PROPS.has(decl.prop) && !/gradient\(|url\(/i.test(decl.value) && pattern.test(decl.value));
    const onColor = hasFlatBackground(/#2b577a/i)
      ? '--rin-on-accent'
      : hasFlatBackground(/#(?:9d2f25|b42318|991b1b|9f2f2f|b91c1c)/i)
        ? '--rin-on-destructive'
      : hasFlatBackground(/#(?:276749|25583f|1f6f50|1f553d)/i)
          ? '--rin-on-success'
          : hasFlatBackground(/#(?:8a5a20|8a5a00|f59e0b)/i)
            ? '--rin-on-warning'
            : null;
    for (const decl of rule.nodes ?? []) {
      if (decl.type !== 'decl') continue;
      const rewritten = rewriteValue(decl.prop, decl.value, onColor);
      if (!rewritten) {
        if (/var\(|gradient\(/i.test(decl.value) && mapsFor(decl.prop)) skippedVarGradient++;
        continue;
      }
      if (prefixed === null) prefixed = prefixSelectorWithDark(rule.selector);
      const key = `${wrapperKey}||${prefixed}||${decl.prop}`;
      if (!emitted.has(key)) {
        emitted.set(key, {
          wrappers, selector: prefixed, prop: decl.prop,
          value: rewritten, important: decl.important,
        });
      }
    }
  });
}

const lines = [];
lines.push('/* AUTO-GENERATED by scripts/generate-dark-legacy-overrides.mjs — do not edit. */');
lines.push('/* Regenerate: node scripts/generate-dark-legacy-overrides.mjs */');
lines.push('');
lines.push('/* Important overrides live in the early `rin-dark-important` layer: for');
lines.push('   important declarations the layer order reverses, so this beats the');
lines.push('   route-foundation layer that the legacy family files live in. */');

const sorted = [...emitted.values()].sort((a, b) => a.selector.localeCompare(b.selector));
const grouped = new Map();
for (const rule of sorted) {
  const wrapperKey = rule.wrappers.map((wrapper) => `${wrapper.name} ${wrapper.params}`).join('|');
  const key = `${wrapperKey}||${rule.selector}||${rule.important}`;
  const group = grouped.get(key) ?? {
    wrappers: rule.wrappers,
    selector: rule.selector,
    important: rule.important,
    declarations: [],
  };
  group.declarations.push({ prop: rule.prop, value: rule.value });
  grouped.set(key, group);
}
const groupedRules = [...grouped.values()];
const importantRules = groupedRules.filter((r) => r.important);
const normalRules = groupedRules.filter((r) => !r.important);

function ruleText(r, indent = '  ') {
  const declarations = r.declarations.map(({ prop, value }) => `${prop}: ${value} !important;`).join(' ');
  return `${indent}${r.selector} { ${declarations} }`;
}

lines.push('@layer rin-dark-important {');
for (const r of importantRules) {
  if (r.wrappers.length > 0) {
    const open = r.wrappers.map((w) => `  @${w.name} ${w.params} {`).join('\n');
    const close = r.wrappers.map(() => '  }').join('\n');
    lines.push(`${open}\n${ruleText(r, '    ')}\n${close}`);
  } else {
    lines.push(ruleText(r));
  }
}
lines.push('}');
lines.push('');

function writeRule(l, r) {
  const declarations = r.declarations.map(({ prop, value }) => `${prop}: ${value};`).join(' ');
  l.push(`${r.selector} { ${declarations} }`);
}

for (const r of normalRules) {
  if (r.wrappers.length > 0) {
    const open = r.wrappers.map((w) => `@${w.name} ${w.params} {`).join('\n');
    const close = r.wrappers.map(() => '}').join('\n');
    lines.push(`${open}\n  ${r.selector} { ${r.declarations.map(({ prop, value }) => `${prop}: ${value};`).join(' ')} }\n${close}`);
  } else {
    writeRule(lines, r);
  }
}

if (fs.existsSync(manualFile)) {
  lines.push('');
  lines.push('/* MANUAL OVERRIDES (dark-legacy-overrides.manual.css) */');
  lines.push(fs.readFileSync(manualFile, 'utf8'));
}

fs.writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`emitted ${emitted.size} override rules (${skippedVarGradient} var()/gradient decls left to tokens) -> ${path.relative(uiRoot, outFile)}`);
