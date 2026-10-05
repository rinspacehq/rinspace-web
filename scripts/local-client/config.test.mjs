import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localPublicConfigPlugin } from './config.mjs';

test('opt-in config keeps pages at root and exposes only the public local-client configuration', () => {
  const config = {
    base: '/rinspace/', envPrefix: 'VITE_', envDir: '/private-env',
    define: { __PRIVATE_CONFIG__: 'synthetic-private', __RINSPACE_PUBLIC_ENV__: JSON.stringify({ cloudbaseAccessKey: 'synthetic-private-config', adminPhoneSha256: 'synthetic-admin' }) },
    server: { host: '0.0.0.0', port: 80, cors: true, headers: { 'x-private-config': 'synthetic-private' }, proxy: { '/api': { target: 'http://private-backend' } }, fs: { allow: ['/private-files'] } },
  };
  localPublicConfigPlugin('/frontend/ui', 5173).config(config);
  assert.equal(config.base, '/');
  assert.equal(config.envDir, false);
  assert.deepEqual(config.envPrefix, []);
  const exposed = JSON.parse(config.define.__RINSPACE_PUBLIC_ENV__);
  assert.equal(exposed.publicBasePath, '');
  assert.equal(exposed.cloudbaseAccessKey, '');
  assert.equal(exposed.adminPhoneSha256, '');
  assert.equal(exposed.localRealClient, true);
  assert.deepEqual(Object.keys(config.define), ['__RINSPACE_PUBLIC_ENV__']);
  assert.equal(config.server.headers, undefined);
  assert.equal(config.server.proxy, undefined);
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.server.cors, false);
  assert.equal(config.server.strictPort, true);
  assert.deepEqual(config.server.fs, { strict: true, allow: ['/frontend/ui'] });
  assert.deepEqual(config.server.hmr, { host: '127.0.0.1', port: 5173 });
});
