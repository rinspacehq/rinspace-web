import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const uiRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(uiRoot, 'src');
const resourcesRoot = path.join(sourceRoot, 'i18n/resources');
const sourceLocale = 'zh-CN';
const locales = ['zh-CN', 'en'];
const generatedKeysPath = path.join(sourceRoot, 'i18n/generatedTranslationKeys.ts');
const migratedFiles = [
  'src/App.tsx',
  'src/app/providers/AppProviders.tsx',
  'src/app/layouts/index.tsx',
  'src/components/ConfirmActionDialog.tsx',
  'src/components/CultivationBadge.tsx',
  'src/components/CollectionFolderDialog.tsx',
  'src/components/DirectoryStreamCard.tsx',
  'src/components/ImageCropDialog.tsx',
  'src/components/InternalContentLinkPreview.tsx',
  'src/components/LoadingState.tsx',
  'src/components/MathText.tsx',
  'src/components/PublicationProgressPanel.tsx',
  'src/components/SiteTopbar.tsx',
  'src/components/SiteIcpLink.tsx',
  'src/components/SiteTopbarShell.tsx',
  'src/components/TagPicker.tsx',
  'src/components/TopbarSessionPlaceholder.tsx',
  'src/components/animate-ui/theme-toggler.tsx',
  'src/components/patterns/index.tsx',
  'src/components/ui/compat.tsx',
  'src/components/ui/primitives.tsx',
  'src/features/reporting/ReportDialog.tsx',
  'src/features/admin-workspace/AdminHomeView.tsx',
  'src/features/admin-workspace/AdminWorkspaceShell.tsx',
  'src/features/admin-workspace/ReviewWorkbench.tsx',
  'src/features/admin-workspace/SystemOperationsView.tsx',
  'src/features/tags/TagGovernancePanel.tsx',
  'src/features/tags/TagKnowledgeConnections.tsx',
  'src/features/tags/TagCreationFlow.tsx',
  'src/features/home/HomeCommunityContentCards.tsx',
  'src/features/publish/BookProfileDialog.tsx',
  'src/features/publish/PublishCreateDialog.tsx',
  'src/features/comments/ContentCommentThreadList.tsx',
  'src/features/book-reader/annotations/BookAnnotationsLayer.tsx',
  'src/features/content-analytics/ContentAnalyticsDashboard.tsx',
  'src/features/content-analytics/periods.ts',
  'src/features/identity/labels.ts',
  'src/features/topbar/index.tsx',
  'src/components/milkdown/mathCommands.ts',
  'src/components/milkdown/mathEvents.ts',
  'src/components/milkdown/mathMarkdown.ts',
  'src/components/milkdown/mathReparse.ts',
  'src/components/milkdown/mathSelection.ts',
  'src/components/milkdown/mathView.ts',
  'src/components/milkdown/quiver.ts',
  'src/pages/Blog/index.tsx',
  'src/pages/BlogMarkdown/index.tsx',
  'src/pages/BookActivity/index.tsx',
  'src/pages/BookAuthor/index.tsx',
  'src/pages/BookWorkspace/index.tsx',
  'src/pages/Books/index.tsx',
  'src/pages/Announcements/index.tsx',
  'src/pages/Discussions/index.tsx',
  'src/pages/Dynamics/index.tsx',
  'src/pages/Detail/index.tsx',
  'src/pages/Home/index.tsx',
  'src/pages/Legal/index.tsx',
  'src/pages/LinkedQuestions/index.tsx',
  'src/pages/MarkdownBookSection/index.tsx',
  'src/pages/Publish/index.tsx',
  'src/pages/Questions/index.tsx',
  'src/pages/Creator/CreatorContributionHeatmap.tsx',
  'src/pages/Creator/index.tsx',
  'src/pages/ActivityTimeline/index.tsx',
  'src/pages/Admin/index.tsx',
  'src/pages/Badges/index.tsx',
  'src/pages/Me/index.tsx',
  'src/pages/Notifications/index.tsx',
  'src/pages/Profile/index.tsx',
  'src/pages/ProfileRank/index.tsx',
  'src/pages/Search/index.tsx',
  'src/pages/Settings/index.tsx',
  'src/pages/Tags/index.tsx',
  'src/pages/TagDetail/index.tsx',
  'src/pages/TagWikiHistory/index.tsx',
  'src/pages/TagWiki/index.tsx',
  'src/pages/TagWikiEdit/index.tsx',
  'src/pages/Users/index.tsx',
  'src/pages/Writer/index.tsx',
  'src/pages/Wallet/index.tsx',
  'src/utils/milkdownAutosave.ts',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flatten(value, prefix = '') {
  if (typeof value === 'string') return [[prefix, value]];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Translation value ${prefix || '<root>'} must be a string or object.`);
  }
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error(`Translation object ${prefix || '<root>'} is empty.`);
  return entries.flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

function variables(value) {
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((match) => match[1]).sort();
}

const namespaces = fs.readdirSync(path.join(resourcesRoot, sourceLocale))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -5))
  .sort();
const allKeys = [];
const failures = [];

for (const locale of locales) {
  const localeNamespaces = fs.readdirSync(path.join(resourcesRoot, locale))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5))
    .sort();
  if (JSON.stringify(localeNamespaces) !== JSON.stringify(namespaces)) {
    failures.push(`${locale}: namespace set differs from ${sourceLocale}`);
  }
}

for (const namespace of namespaces) {
  const sourceEntries = new Map(flatten(readJson(path.join(resourcesRoot, sourceLocale, `${namespace}.json`))));
  for (const [key] of sourceEntries) allKeys.push(`${namespace}:${key}`);
  for (const locale of locales) {
    const entries = new Map(flatten(readJson(path.join(resourcesRoot, locale, `${namespace}.json`))));
    const sourceKeys = [...sourceEntries.keys()].sort();
    const localeKeys = [...entries.keys()].sort();
    if (JSON.stringify(localeKeys) !== JSON.stringify(sourceKeys)) {
      const missing = sourceKeys.filter((key) => !entries.has(key));
      const extra = localeKeys.filter((key) => !sourceEntries.has(key));
      failures.push(`${locale}/${namespace}: missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
    }
    for (const [key, value] of entries) {
      if (!value.trim()) failures.push(`${locale}/${namespace}:${key} is empty`);
      const sourceValue = sourceEntries.get(key);
      if (sourceValue && JSON.stringify(variables(value)) !== JSON.stringify(variables(sourceValue))) {
        failures.push(`${locale}/${namespace}:${key} has different interpolation variables`);
      }
    }
  }
}

const generatedSource = `/* Generated by ui/scripts/check-i18n.mjs --write. */\nexport type TranslationKey =\n${allKeys.sort().map((key) => `  | ${JSON.stringify(key)}`).join('\n')};\n`;
if (process.argv.includes('--write')) {
  fs.writeFileSync(generatedKeysPath, generatedSource);
} else if (!fs.existsSync(generatedKeysPath) || fs.readFileSync(generatedKeysPath, 'utf8') !== generatedSource) {
  failures.push('generatedTranslationKeys.ts is stale; run pnpm check:i18n:write');
}

const commonKeys = new Set(flatten(readJson(path.join(resourcesRoot, sourceLocale, 'common.json'))).map(([key]) => key));
const routeManifest = fs.readFileSync(path.join(sourceRoot, 'app/routing/routeManifest.tsx'), 'utf8');
for (const match of routeManifest.matchAll(/titleKey: "([^"]+)"/g)) {
  if (!commonKeys.has(match[1])) failures.push(`route title key common:${match[1]} is missing`);
}

for (const relativePath of migratedFiles) {
  const source = fs.readFileSync(path.join(uiRoot, relativePath), 'utf8');
  if (/[㐀-鿿]/u.test(source)) {
    failures.push(`${relativePath} contains hard-coded CJK product copy`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`i18n checks passed: ${locales.length} locales, ${namespaces.length} namespaces, ${allKeys.length} keys.`);
