import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { localCommands, startLocal } from '../start-local.mjs';

test('one-command start installs the locked dependencies before the real-service entry', async () => {
  const calls = [];
  const result = await startLocal(['--port', '5176'], {
    nodeVersion: '22.22.3', platform: 'linux',
    install(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    start(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0, null));
      return child;
    },
  });
  assert.equal(result, 0);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ['corepack', ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile']],
    ['corepack', ['pnpm', 'dev:real', '--port', '5176']],
  ]);
  assert.equal(calls[0].options.cwd, calls[1].options.cwd);
  assert.equal(calls[0].options.stdio, 'inherit');
});

test('invalid input stops before installation or browser startup', async () => {
  for (const args of [['--port', '80'], ['--port', '5173;echo'], ['--host', '0.0.0.0']])
    assert.throws(() => localCommands(args, '22.22.3'), /Usage/);
  assert.throws(() => localCommands([], '20.19.0'), /Node.js 22/);
  let started = false;
  const result = await startLocal([], {
    nodeVersion: '22.22.3', platform: 'win32',
    install(command, args, options) {
      assert.equal(command, 'corepack.cmd');
      assert.equal(options.shell, true);
      assert.equal(args[0], 'pnpm');
      return { status: 17 };
    },
    start() { started = true; },
  });
  assert.equal(result, 17);
  assert.equal(started, false);
});
