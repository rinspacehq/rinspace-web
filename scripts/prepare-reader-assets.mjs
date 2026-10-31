import { createRequire } from 'node:module';
import { cp, mkdir, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const release = JSON.parse(await readFile(resolve(root, 'contracts/reader/embedpdf-release.json'), 'utf8'));
const source = dirname(require.resolve('@rinspacehq/embedpdf-snippet'));
const installed = JSON.parse(await readFile(resolve(source, '../package.json'), 'utf8'));
if (installed.name !== '@rinspacehq/embedpdf-snippet' || installed.version !== release.version ||
    !/^\d+\.\d+\.\d+-rinspace\.\d+$/.test(release.version) || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(release.integrity)) throw Error('Reader package binding mismatch');
const lock = await readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8');
if (!lock.includes(`integrity: ${release.integrity}, tarball: ${release.url}`)) throw Error('Reader archive integrity is not pinned');
const base = resolve(root, 'public/assets/reader');
const destination = resolve(base, release.version);
const notices = ['LICENSE', 'LICENSE.pdfium', 'THIRD-PARTY-NOTICES.md'];
// Only this generated tree is retired. Versioned URLs prevent mixing viewer/WASM
// across a rollout; removing old generated versions bounds repeated builds.
await mkdir(base, { recursive: true });
for (const version of await readdir(base, { withFileTypes: true })) {
  if (!version.isDirectory() || !/^\d+\.\d+\.\d+-rinspace\.\d+$/.test(version.name)) throw Error('Unexpected Reader asset directory');
  const directory = resolve(base, version.name);
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile() || !(/\.(js|wasm)$/.test(file.name) || notices.includes(file.name))) throw Error('Unexpected Reader asset');
    await unlink(resolve(directory, file.name));
  }
  await rmdir(directory);
}
await mkdir(destination);
for (const entry of await readdir(source)) {
  if (/\.(js|wasm)$/.test(entry)) await cp(resolve(source, entry), resolve(destination, entry));
}
for (const entry of notices) await cp(resolve(source, '..', entry), resolve(destination, entry));
