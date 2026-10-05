import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { localOrigin, loopbackGuardPlugin } from './local-client/gateway.mjs';
import { localPublicConfigPlugin } from './local-client/config.mjs';
import { createLocalSession } from './local-client/session.mjs';

const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === '--port' && /^[0-9]+$/.test(args[1]))) {
  throw new Error('Usage: pnpm dev:real [--port 5173]. The upstream is fixed to https://rinspace.com.');
}
const port = args.length === 2 ? Number(args[1]) : 5173;
const origin = localOrigin(port);
const session = createLocalSession({ origin });
const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root: uiRoot,
  configFile: path.join(uiRoot, 'vite.config.ts'),
  plugins: [
    localPublicConfigPlugin(uiRoot, port),
    loopbackGuardPlugin(origin, fetch, session),
  ],
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void Promise.all([server.close(), session.close()]).then(() => process.exit(0)); });
}
await server.listen();
console.log(`Rinspace local frontend: ${origin}/`);
console.log('Connected to real Rinspace services. Local login opens official consent; it requires the reviewed native backend to be activated.');
console.log('Gitea and the inner world open on rinspace.com. No Cookie/token, database or production env file is needed.');
