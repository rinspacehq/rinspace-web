import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { sha256, publicConfiguration } from './candidate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
let build = false;
let output;
let dependencies = path.join(root, 'node_modules');
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--build' && !build) build = true;
  else if (args[index] === '--output' && !output && args[index + 1]) output = path.resolve(args[++index]);
  else if (args[index] === '--dependencies' && dependencies === path.join(root, 'node_modules') && args[index + 1]) dependencies = path.resolve(args[++index]);
  else throw Error('Usage: node scripts/release/run-isolated-checks.mjs [--build --output NEW-directory] [--dependencies installed-node_modules]');
}
if (build && (!output || dependencies !== path.join(root, 'node_modules'))) throw Error('Formal build requires a new output directory and its own installed dependencies');
if (output && (output === root || output.startsWith(`${root}${path.sep}`) || fs.existsSync(output))) throw Error('Output must be a new directory outside the source checkout');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (build && (sourceCommit !== process.env.RINSPACE_SOURCE_COMMIT || process.version !== 'v22.22.3' || execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim())) throw Error('Build requires the clean exact approved source and pinned Node');
const publicConfig = build ? publicConfiguration(JSON.parse(process.env.RINSPACE_PUBLIC_CONFIG || 'null')) : undefined;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rinspace-frontend-check-'));
try {
  const project = path.join(scratch, 'app');
  fs.mkdirSync(project, { mode: 0o700 });
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
  for (const name of new Set(files)) {
    if (name.split('/').some((part) => ['..', '.git', 'node_modules', 'secrets', '.auth'].includes(part)) || /(^|\/)\.env(?:\.|$)/.test(name) || path.isAbsolute(name)) throw Error('Forbidden source snapshot input');
    const source = path.join(root, name);
    if (!fs.lstatSync(source).isFile()) throw Error('Only regular tracked/visible source inputs are accepted');
    const target = path.join(project, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  fs.mkdirSync(path.join(project, 'node_modules'));
  const dependencyRoot = fs.realpathSync(dependencies);
  if (!fs.lstatSync(dependencyRoot).isDirectory()) throw Error('Dependencies must be an installed directory');
  const sandbox = ['--die-with-parent', '--unshare-net', '--unshare-pid', '--clearenv'];
  for (const name of ['/usr', '/lib', '/lib64']) if (fs.existsSync(name)) sandbox.push('--ro-bind', name, name);
  // setup-node installs under a tool cache; /usr/bin/node may not exist, and
  // /usr is already read-only. Mount the pinned binary into our own directory.
  sandbox.push('--dir', '/tools', '--ro-bind', fs.realpathSync(process.execPath), '/tools/node', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/etc');
  for (const name of ['/etc/hosts', '/etc/nsswitch.conf']) sandbox.push('--ro-bind', name, name);
  sandbox.push('--bind', project, '/app', '--ro-bind', dependencyRoot, '/app/node_modules');
  // Caches live only in the sandbox, never in a shared dependency installation.
  if (!fs.existsSync(path.join(dependencyRoot, '.vite'))) fs.mkdirSync(path.join(dependencyRoot, '.vite'));
  sandbox.push('--tmpfs', '/app/node_modules/.vite');
  sandbox.push('--setenv', 'PATH', '/tools:/usr/bin:/bin', '--setenv', 'CI', 'true', '--setenv', 'NODE_OPTIONS', '--max-old-space-size=2048');
  if (build) for (const [key, value] of Object.entries(publicConfig)) sandbox.push('--setenv', key, value);
  sandbox.push('--chdir', '/app', '--');
  function run(command) {
    const result = spawnSync('bwrap', [...sandbox, '/tools/node', ...command], { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw Error(`Isolated frontend check failed: ${command[0]}`);
  }
  run(['-e', "const fs=require('node:fs'); for(const p of ['/home/ubuntu/rinspace','/specs','/templates','/app/.git','/app/.env.production']) if(fs.existsSync(p)) throw Error('Hidden/private input visible'); if(Object.keys(process.env).some(k=>/TOKEN|SECRET|PASSWORD|GITHUB|ACTIONS_RUNTIME/.test(k))) throw Error('Inherited credential environment'); console.log('Frontend-only snapshot, empty credential environment, network isolated.');"]);
  // This existing entry checks hidden inputs, typecheck, routes, templates,
  // translations and all UI unit tests, without a private parent mount.
  run(['scripts/check-source-independence.mjs']);
  run(['scripts/check-env-boundary.mjs']);
  run(['scripts/check-animate-ui-application.mjs']);
  run(['--test', ...['local-client', 'release'].flatMap((name) => fs.readdirSync(path.join(project, 'scripts', name)).filter((file) => file.endsWith('.test.mjs')).sort().map((file) => `scripts/${name}/${file}`))]);
  const checks = { 'source-independence': 'passed', typecheck: 'passed', unit: 'passed', 'env-boundary': 'passed', 'application-components': 'passed', 'local-client': 'passed', 'release-tools': 'passed' };
  if (build) {
    // Exactly the existing package.json build pipeline, executed once in the
    // isolated writable snapshot, never on the host source/production runner.
    const command = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.build;
    if (command !== 'node scripts/build-latex-template-archives.mjs && node scripts/generate-core-font-css.mjs && vite build') throw Error('Build entry changed; review the isolated build pipeline');
    run(['scripts/build-latex-template-archives.mjs']);
    run(['scripts/generate-core-font-css.mjs']);
    run(['node_modules/vite/bin/vite.js', 'build']);
    run(['scripts/check-vite-artifact.mjs']);
    run(['scripts/check-i18n-bundle-budget.mjs']);
    checks['vite-artifact'] = 'passed';
    checks['i18n-bundles'] = 'passed';
  }
  if (output) {
    fs.mkdirSync(output, { mode: 0o700 });
    if (build) fs.cpSync(path.join(project, 'build'), path.join(output, 'build'), { recursive: true, dereference: false });
    fs.writeFileSync(path.join(output, 'checks.json'), `${JSON.stringify({ schemaVersion: 1, sourceCommit, dependencyLockSha256: sha256(fs.readFileSync(path.join(project, 'pnpm-lock.yaml'))), publicConfigSha256: publicConfig ? sha256(Buffer.from(`${JSON.stringify(publicConfig, null, 2)}\n`)) : null, checks }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  console.log(build ? 'One fixed candidate build completed; no publication or deployment.' : 'Public frontend CI checks completed; no production build.');
} finally {
  // Only the exact scratch directory allocated by this invocation.
  fs.rmSync(scratch, { recursive: true, force: true });
}
