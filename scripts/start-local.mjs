#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function localCommands(args, nodeVersion = process.versions.node) {
  const major = Number(nodeVersion.split('.')[0]);
  if (!Number.isInteger(major) || major < 22)
    throw new Error('Node.js 22 or newer is required for the local frontend.');
  if (args.length !== 0 &&
      !(args.length === 2 && args[0] === '--port' && /^\d+$/.test(args[1]) &&
        Number(args[1]) >= 1024 && Number(args[1]) <= 65535))
    throw new Error('Usage: node scripts/start-local.mjs [--port 5173]');
  return {
    install: ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile'],
    dev: ['pnpm', 'dev:real', ...args],
  };
}

export async function startLocal(args, { nodeVersion = process.versions.node,
  platform = process.platform, install = spawnSync, start = spawn } = {}) {
  const commands = localCommands(args, nodeVersion);
  const executable = platform === 'win32' ? 'corepack.cmd' : 'corepack';
  const options = { cwd: root, stdio: 'inherit', shell: platform === 'win32' };
  console.log('Installing locked frontend dependencies without package install scripts...');
  const installed = install(executable, commands.install, options);
  if (installed.error)
    throw new Error('Corepack could not start. Install Node.js 22 with Corepack, then retry.');
  if (installed.status !== 0) return installed.status ?? 1;

  console.log('Starting the local frontend on loopback; it connects to real Rinspace services.');
  const child = start(executable, commands.dev, options);
  return await new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Corepack could not start the local frontend.')));
    child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 1)));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocal(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
