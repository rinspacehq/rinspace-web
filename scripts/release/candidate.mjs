import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const repository = 'rinspacehq/rinspace-web';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const compareNames = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const root = path.resolve(import.meta.dirname, '../..');
const maxFileBytes = 64 * 1024 * 1024;
const maxArchiveBytes = 512 * 1024 * 1024;
const publicKeys = new Set([
  'REACT_APP_CLOUDBASE_ENV_ID', 'REACT_APP_CLOUDBASE_REGION',
  'REACT_APP_CLOUDBASE_ACCESS_KEY', 'REACT_APP_GITEA_BASE_PATH',
  'VITE_RINSPACE_TYPST_CREATE_ENABLED',
]);

export function publicConfiguration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Public configuration must be an object');
  for (const [key, item] of Object.entries(value)) {
    if (!publicKeys.has(key) || typeof item !== 'string' || item.length > 4096 || /[\r\n\0]/.test(item)) {
      throw Error('Unknown or invalid public configuration field');
    }
  }
  for (const key of ['REACT_APP_CLOUDBASE_ENV_ID', 'REACT_APP_CLOUDBASE_ACCESS_KEY']) {
    if (!value[key]?.trim()) throw Error(`${key} must be explicitly reviewed public configuration`);
  }
  // The official site uses a redirect-free, root-relative module graph.
  return { ...value, VITE_ASSET_BASE: '/', PUBLIC_URL: '', REACT_APP_BASE_URL: '/' };
}

export function releaseContext(value) {
  if (value.repository !== repository || value.eventName !== 'workflow_dispatch' || value.ref !== 'refs/heads/main') {
    throw Error('Candidate builds require a manual dispatch on canonical main');
  }
  if (!/^[a-f0-9]{40}$/.test(value.sourceCommit) || value.sourceCommit !== value.workflowCommit || value.sourceCommit !== value.remoteMain) {
    throw Error('Source must be the exact reviewed workflow commit and current main');
  }
  if (value.enabled !== 'true' || value.isolatedRunner !== 'true' || value.distributionApproved !== 'true' || value.reviewedSource !== value.sourceCommit || value.reviewedVersion !== value.version) {
    throw Error('Explicit candidate, isolated-runner, source/version and distribution approvals are required');
  }
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value.version)) throw Error('Version must be exact vMAJOR.MINOR.PATCH');
  if (!value.compatibility || typeof value.compatibility !== 'object' || Array.isArray(value.compatibility) || Object.keys(value.compatibility).sort().join(',') !== 'api,identity,shared') throw Error('Explicit api/identity/shared compatibility is required');
  for (const item of Object.values(value.compatibility)) {
    if (typeof item !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{1,119}$/.test(item) || ['main', 'latest'].includes(item)) throw Error('Compatibility must be an explicit reviewed value');
  }
  return { repository, sourceCommit: value.sourceCommit, version: value.version, compatibility: value.compatibility, publicConfig: publicConfiguration(value.publicConfig) };
}

function safePath(name) {
  if (typeof name !== 'string' || Buffer.byteLength(name) > 255 || !name.split('/').every((part) => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part))) throw Error('Package paths must be plain ASCII relative paths');
  return name;
}

export function regularFiles(directory) {
  if (!fs.lstatSync(directory).isDirectory()) throw Error('Input must be a real directory');
  const result = new Map();
  function visit(relative) {
    const absolute = path.join(directory, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(relative ? `${relative}/${name}` : name);
    } else {
      if (!stat.isFile() || stat.size > maxFileBytes) throw Error('Only bounded regular input files are allowed');
      result.set(safePath(relative), fs.readFileSync(absolute));
    }
  }
  visit('');
  return result;
}

const animateNames = [
  'animate-icon.tsx', 'animate-icon-slot.tsx', 'use-is-in-view.ts', 'button.tsx', 'icon-button.tsx', 'theme-toggler.tsx',
  ...['bell', 'bell-ring', 'chevron-down', 'kanban', 'log-out', 'operations', 'plus', 'search', 'settings', 'sparkles', 'user'].map((name) => `icons/${name}.tsx`),
];
const runtimeBindings = {
  AnimateButton: ['components/animate-ui/button.tsx', 'AnimateButton'],
  ...Object.fromEntries(['Bell', 'BellRing', 'ChevronDown', 'Kanban', 'Plus', 'Sparkles', 'User'].map((name) => [`Animate${name}`, [`components/animate-ui/icons/${name.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)}.tsx`, name]])),
  AnimateMore: ['components/animate-ui/icons/operations.tsx', 'More'],
};

export async function sharedInputs(sourceRoot) {
  const ts = (await import('typescript')).default;
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
  const entries = new Map();
  const externals = new Set();
  const pending = [
    'src/components/shared/RinspaceTopbarFrame.tsx', 'src/components/shared/RinspaceTweetComposer.tsx',
    'src/components/shared/topbarClassNames.ts', ...animateNames.map((name) => `src/components/animate-ui/${name}`),
  ];
  function resolveImport(specifier, importer) {
    const base = specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
    if (!base.startsWith('src/')) throw Error('Shared import leaves the reviewed source tree');
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].filter((name) => fs.existsSync(path.join(sourceRoot, name)) && fs.lstatSync(path.join(sourceRoot, name)).isFile());
    if (candidates.length !== 1) throw Error(`Unresolved or ambiguous shared import: ${specifier}`);
    return candidates[0];
  }
  while (pending.length) {
    const name = pending.shift();
    if (entries.has(name)) continue;
    const absolute = path.join(sourceRoot, safePath(name));
    if (!fs.lstatSync(absolute).isFile()) throw Error('Shared source must be a regular file');
    const bytes = fs.readFileSync(absolute);
    entries.set(name, bytes);
    const source = ts.createSourceFile(name, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) throw Error('Dynamic shared imports require a literal');
        specifier = node.arguments[0];
      }
      if (specifier) {
        if (!ts.isStringLiteral(specifier)) throw Error('Shared module specifier must be literal');
        const value = specifier.text;
        if (value === '@/rinspace_topbar_runtime') {
          // Runtime adapters provide this named bridge. All its visual implementations
          // are included below; neither a private adapter nor components/ui is copied.
          if (ts.isImportDeclaration(node)) {
            if (node.importClause?.name || (node.importClause?.namedBindings && !ts.isNamedImports(node.importClause.namedBindings))) throw Error('Shared runtime bridge requires explicit named bindings');
            for (const binding of node.importClause?.namedBindings?.elements ?? []) {
              if (!Object.hasOwn(runtimeBindings, (binding.propertyName ?? binding.name).text)) throw Error('Unknown shared runtime binding');
            }
          }
        } else if (value.startsWith('.') || value.startsWith('@/')) pending.push(resolveImport(value, name));
        else {
          const packageName = value.startsWith('@') ? value.split('/').slice(0, 2).join('/') : value.split('/')[0];
          if (!packageJson.dependencies?.[packageName]) throw Error(`Undeclared shared dependency: ${packageName}`);
          externals.add(packageName);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const name of ['rinspace-tweet-composer.css', 'rinspace-topbar-mobile-search.css', 'topbar-shell.css']) {
    const sourcePath = `src/styles/${name}`;
    const bytes = fs.readFileSync(path.join(sourceRoot, sourcePath));
    if (/@import|url\(/.test(bytes.toString('utf8'))) throw Error('Shared CSS gained an asset import; review and include its closure');
    entries.set(sourcePath, bytes);
  }
  entries.set('public/assets/brand/rinspace-mark-128.png', fs.readFileSync(path.join(sourceRoot, 'public/assets/brand/rinspace-mark-128.png')));
  entries.set('contract.json', jsonBytes({
    schemaVersion: 1,
    entrypoints: ['src/components/shared/RinspaceTopbarFrame.tsx', 'src/components/shared/RinspaceTweetComposer.tsx'],
    alias: { '@': 'src', '@/rinspace_topbar_runtime': 'consumer-owned runtime bridge' },
    runtimeBindings,
    dependencies: Object.fromEntries([...externals].sort().map((name) => [name, packageJson.dependencies[name]])),
    rules: 'Immutable inputs for one-way generation only; not a standalone Animate UI component catalog or an editable frontend copy.',
  }));
  // Carry all reviewed legal inputs verbatim, not just a one-line SPDX identifier.
  for (const name of ['LICENSING.md', 'ASSET-LICENSES.md', 'TRADEMARKS.md', 'CONTRIBUTION-LICENSE.md', 'COMMERCIAL-LICENSING.md', 'DCO']) entries.set(`legal/${name}`, fs.readFileSync(path.join(sourceRoot, name)));
  for (const [name, bytes] of regularFiles(path.join(sourceRoot, 'licenses'))) entries.set(`legal/licenses/${name}`, bytes);
  return entries;
}

export function dependencyInventory(licenses) {
  if (!licenses || typeof licenses !== 'object' || Array.isArray(licenses)) throw Error('pnpm licenses JSON must be an object');
  const items = new Map();
  for (const [license, packages] of Object.entries(licenses)) {
    if (!Array.isArray(packages)) throw Error('pnpm license groups must be arrays');
    for (const item of packages) {
      // pnpm 9 groups versions of the same name/license into a versions ARRAY.
      // Expand every exact installed version; do not silently keep just the first.
      if (!item || typeof item.name !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(item.name) || !Array.isArray(item.versions) || !item.versions.length) throw Error('Invalid dependency inventory entry');
      for (const version of item.versions) {
        if (typeof version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw Error('Invalid exact dependency version');
        const key = `${item.name}@${version}`;
        if (!items.has(key)) items.set(key, { type: 'library', name: item.name, version, 'bom-ref': key, licenses: [] });
        const entry = items.get(key);
        if (!entry.licenses.some((value) => value.license.name === license)) entry.licenses.push({ license: { name: license } });
      }
    }
  }
  if (!items.size) throw Error('Dependency inventory must not be empty');
  // Intentionally omit installer absolute paths, author emails and registry auth.
  for (const item of items.values()) item.licenses.sort((a, b) => compareNames(a.license.name, b.license.name));
  return [...items.values()].sort((a, b) => compareNames(a['bom-ref'], b['bom-ref']));
}

export function ustarGzip(entries, epoch) {
  const chunks = [];
  for (const [name, bytes] of [...entries].sort(([a], [b]) => compareNames(a, b))) {
    safePath(name);
    const header = Buffer.alloc(512);
    let prefix = '';
    let leaf = name;
    if (Buffer.byteLength(leaf) > 100) {
      const slash = name.lastIndexOf('/');
      prefix = name.slice(0, slash);
      leaf = name.slice(slash + 1);
      if (slash < 0 || Buffer.byteLength(prefix) > 155 || Buffer.byteLength(leaf) > 100) throw Error('Path cannot be represented in strict ustar');
    }
    header.write(leaf, 0, 100, 'ascii');
    header.write(prefix, 345, 155, 'ascii');
    for (const [offset, width, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0], [124, 12, bytes.length], [136, 12, epoch]]) {
      const octal = value.toString(8);
      if (octal.length >= width) throw Error('Value exceeds the ustar field');
      header.write(`${octal.padStart(width - 1, '0')}\0`, offset, width, 'ascii');
    }
    header[156] = 48;
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    header.fill(32, 148, 156);
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  if (chunks.reduce((sum, bytes) => sum + bytes.length, 0) > maxArchiveBytes) throw Error('Expanded candidate exceeds the private consumer limit');
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

export function createCandidate({ context, site, shared, license, notices, dependencyLock, licenses, checks, epoch, runId }) {
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 0o77777777777 || !/^\d{1,24}$/.test(runId)) throw Error('Exact source epoch and workflow run ID are required');
  const configSha256 = sha256(jsonBytes(context.publicConfig));
  const lockSha256 = sha256(dependencyLock);
  if (checks.schemaVersion !== 1 || checks.sourceCommit !== context.sourceCommit || checks.dependencyLockSha256 !== lockSha256 || checks.publicConfigSha256 !== configSha256 || ['source-independence', 'typecheck', 'unit', 'vite-artifact', 'i18n-bundles'].some((key) => checks.checks?.[key] !== 'passed')) throw Error('Actual source/build checks must bind the same candidate inputs');
  const files = new Map();
  for (const [name, bytes] of site) files.set(`site/${safePath(name)}`, bytes);
  for (const [name, bytes] of shared) files.set(`shared/${safePath(name)}`, bytes);
  files.set('shared/public-config.json', jsonBytes(context.publicConfig));
  files.set('LICENSE', license);
  files.set('THIRD_PARTY_NOTICES.md', notices);
  files.set('sbom.json', jsonBytes({ bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, metadata: { component: { type: 'application', name: 'rinspace-frontend', version: context.version }, properties: [{ name: 'rinspace:dependency-lock-sha256', value: lockSha256 }] }, components: dependencyInventory(licenses) }));
  files.set('provenance.json', jsonBytes({ schemaVersion: 1, repository, sourceBranch: 'main', sourceCommit: context.sourceCommit, version: context.version, sourceEpoch: epoch, dependencyLockSha256: lockSha256, publicConfigSha256: configSha256, workflow: '.github/workflows/frontend-candidate.yml', runId, tools: { node: '22.22.3', pnpm: '9.7.0' }, productionAuthorized: false }));
  const folded = new Set();
  for (const [name, bytes] of files) {
    safePath(name);
    if (!Buffer.isBuffer(bytes) || bytes.length > maxFileBytes || folded.has(name.toLowerCase())) throw Error('Invalid, oversized or case-colliding candidate file');
    folded.add(name.toLowerCase());
  }
  for (const name of folded) for (let slash = name.indexOf('/'); slash >= 0; slash = name.indexOf('/', slash + 1)) if (folded.has(name.slice(0, slash))) throw Error('Candidate file/directory collision');
  if (!files.get('site/index.html')?.length || !files.get('LICENSE')?.length || !files.get('THIRD_PARTY_NOTICES.md')?.length || !shared.size || files.size >= 20000) throw Error('Required candidate inputs are missing or too numerous');
  const manifest = { schemaVersion: 1, component: 'rinspace-frontend', repository, sourceBranch: 'main', sourceCommit: context.sourceCommit, version: context.version, dependencyLockSha256: lockSha256, compatibility: context.compatibility, publicConfigSha256: configSha256, archiveFormat: 'ustar-gzip-v1', files: [...files].sort(([a], [b]) => compareNames(a, b)).map(([name, bytes]) => ({ path: name, size: bytes.length, sha256: sha256(bytes) })) };
  const manifestBytes = jsonBytes(manifest);
  if (manifestBytes.length > 1024 * 1024) throw Error('Manifest exceeds the private consumer limit');
  files.set('manifest.json', manifestBytes);
  const artifactBytes = ustarGzip(files, epoch);
  if (artifactBytes.length > maxArchiveBytes) throw Error('Compressed candidate exceeds the private consumer limit');
  const evidence = { schemaVersion: 1, status: 'passed', repository, sourceCommit: context.sourceCommit, artifactSha256: sha256(artifactBytes), manifestSha256: sha256(manifestBytes), checks: checks.checks, runId, productionAuthorized: false };
  return { artifactBytes, manifestBytes, publicEvidenceBytes: jsonBytes(evidence), name: `rinspace-frontend-${context.version.slice(1)}.tar.gz` };
}

function boundedJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('Metadata must be bounded regular JSON');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const options = new Map();
  const allowed = new Set(['--context', '--site', '--licenses', '--checks', '--output']);
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/release/candidate.mjs --context context.json --site checked-build --licenses pnpm-licenses.json --checks checks.json --output NEW-directory');
    return;
  }
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || options.has(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw Error('Unknown, repeated or incomplete candidate argument');
    options.set(args[index], args[index + 1]);
  }
  if (options.size !== allowed.size) throw Error('All five candidate inputs are required');
  const input = boundedJson(options.get('--context'));
  const context = releaseContext(input);
  if (process.version !== 'v22.22.3' || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== context.sourceCommit || execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Packaging requires the pinned Node runtime and a clean exact source checkout');
  const result = createCandidate({ context, site: regularFiles(options.get('--site')), shared: await sharedInputs(root), license: fs.readFileSync(path.join(root, 'LICENSE')), notices: fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md')), dependencyLock: fs.readFileSync(path.join(root, 'pnpm-lock.yaml')), licenses: boundedJson(options.get('--licenses')), checks: boundedJson(options.get('--checks')), epoch: Number(execFileSync('git', ['show', '-s', '--format=%ct', context.sourceCommit], { cwd: root, encoding: 'utf8' }).trim()), runId: input.runId });
  const output = path.resolve(options.get('--output'));
  if (output === root || output.startsWith(`${root}${path.sep}`)) throw Error('Candidate output must be a new directory outside the source checkout');
  fs.mkdirSync(output, { mode: 0o700 });
  for (const [name, bytes] of [[result.name, result.artifactBytes], ['manifest.json', result.manifestBytes], ['public-evidence.json', result.publicEvidenceBytes], ['checksums.txt', Buffer.from(`${sha256(result.artifactBytes)}  ${result.name}\n${sha256(result.manifestBytes)}  manifest.json\n${sha256(result.publicEvidenceBytes)}  public-evidence.json\n`)]]) fs.writeFileSync(path.join(output, name), bytes, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ directory: output, artifact: result.name, artifactSha256: sha256(result.artifactBytes), productionAuthorized: false }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
