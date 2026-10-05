import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const manifest = JSON.parse(fs.readFileSync(path.join(build, 'asset-manifest.json'), 'utf8'));
if (!manifest.files?.['main.js'] || !Array.isArray(manifest.entrypoints)) {
  throw new Error('CRA-compatible manifest is missing files.main.js or entrypoints.');
}
for (const emitted of Object.values(manifest.files)) {
  if (typeof emitted !== 'string') throw new Error('Manifest file values must be strings.');
  const absolute = path.join(build, emitted.replace(/^\//, ''));
  if (!fs.existsSync(absolute)) throw new Error(`Manifest points to a missing file: ${emitted}`);
}
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
if (!html.includes('src="/static/js/') || html.includes('/rinspace/static/')) {
  throw new Error('Built HTML must use one redirect-free /static module graph.');
}
const forbiddenNames = ['DB_PASSWORD', 'DATABASE_URL', 'PRIVATE_KEY', 'GITEA_TOKEN', 'CLOUDREVE_SECRET'];
const scripts = fs
  .readdirSync(path.join(build, 'static/js'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(build, 'static/js', name), 'utf8'))
  .join('\n');
for (const name of forbiddenNames) {
  if (scripts.includes(name)) throw new Error(`Forbidden server environment name reached the UI: ${name}`);
}
console.log(`Vite artifact contract passed (${Object.keys(manifest.files).length} manifest entries).`);
