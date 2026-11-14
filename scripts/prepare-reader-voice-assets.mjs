import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'contracts/reader/voice-assets.json'), 'utf8'));
const lock = await readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8');
if (manifest.schema !== 'reader-browser-voice-assets/v1' || manifest.directory !== 'vad-0.0.31-ort-1.31.1-v5' || manifest.assets.length !== 4) throw Error('Unreviewed browser speech manifest');
const versions = { '@ricky0123/vad-web': '0.0.31', 'onnxruntime-web': '1.31.1' };
for (const [name, version] of Object.entries(versions)) {
  const pkg = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8'));
  if (pkg.name !== name || pkg.version !== version || !lock.includes(`${name}@${version}`)) throw Error('Browser speech package binding mismatch');
}
const allowed = new Set(['vad.worklet.bundle.min.js', 'silero_vad_v5.onnx', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']);
const destination = resolve(root, 'public/assets/reader-voice', manifest.directory);
await mkdir(destination, { recursive: true });
async function copyBound(source, entry) {
  const bytes = await readFile(source);
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error('Browser speech asset bytes changed');
  await writeFile(resolve(destination, entry.name), bytes);
}
for (const asset of manifest.assets) {
  if (!Object.hasOwn(versions, asset.package) || !allowed.delete(asset.name) || asset.path !== `dist/${asset.name}`) throw Error('Unexpected browser speech asset');
  if (asset.name === 'silero_vad_v5.onnx' && asset.sha256 !== manifest.model.sha256) throw Error('Browser VAD model source mismatch');
  await copyBound(resolve(root, 'node_modules', asset.package, asset.path), asset);
}
if (allowed.size) throw Error('Incomplete browser speech assets');
for (const notice of manifest.notices) {
  if (!/^[A-Za-z-]+\.txt$/.test(notice.name) || notice.path !== `third_party/reader-voice/${notice.name}`) throw Error('Unexpected browser speech notice');
  await copyBound(resolve(root, notice.path), notice);
}
