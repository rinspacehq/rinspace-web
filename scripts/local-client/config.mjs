import { localOrigin } from './gateway.mjs';

export function localPublicConfigPlugin(uiRoot, port) {
  localOrigin(port);
  return {
    name: 'rinspace-local-public-config',
    enforce: 'post',
    config(config) {
      // Opt-in only. Ordinary Vite and release configurations stay unchanged.
      config.base = '/';
      config.envDir = false;
      config.envPrefix = [];
      config.define = {
        __RINSPACE_PUBLIC_ENV__: JSON.stringify({
          publicBasePath: '', basePath: '/', cloudbaseEnvId: '',
          cloudbaseRegion: 'ap-shanghai', cloudbaseAccessKey: '', adminPhoneSha256: '',
          giteaBasePath: '/repos/', typstCreateEnabled: false, localRealClient: true,
        }),
      };
      config.server = {
        host: '127.0.0.1', port, strictPort: true,
        allowedHosts: ['127.0.0.1'], proxy: undefined, cors: false,
        hmr: { host: '127.0.0.1', port },
        fs: { strict: true, allow: [uiRoot] },
      };
    },
  };
}
