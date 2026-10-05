import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { craCompatManifest } from './scripts/cra-compat-manifest';

const normalizedBase = (value: string | undefined) => {
  const base = (value || '/rinspace').trim();
  return `${base.startsWith('/') ? base : `/${base}`.replace(/\/+/, '/')}`.replace(/\/$/, '') + '/';
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizedBase(env.VITE_ASSET_BASE || '/rinspace');
  if (mode === 'production') {
    for (const key of ['REACT_APP_CLOUDBASE_ENV_ID', 'REACT_APP_CLOUDBASE_ACCESS_KEY']) {
      if (!env[key]?.trim()) {
        throw new Error(`${key} is required for the production UI build.`);
      }
    }
  }
  const publicEnv = {
    publicBasePath: Object.prototype.hasOwnProperty.call(env, 'PUBLIC_URL') ? (env.PUBLIC_URL || '').replace(/\/$/, '') : base.slice(0, -1),
    basePath: env.REACT_APP_BASE_URL || '/',
    cloudbaseEnvId: env.REACT_APP_CLOUDBASE_ENV_ID || '',
    cloudbaseRegion: env.REACT_APP_CLOUDBASE_REGION || 'ap-shanghai',
    cloudbaseAccessKey: env.REACT_APP_CLOUDBASE_ACCESS_KEY || '',
    adminPhoneSha256: env.REACT_APP_RIN_ADMIN_PHONE_SHA256 || '',
    giteaBasePath: env.REACT_APP_GITEA_BASE_PATH || '/repos/',
    typstCreateEnabled: env.VITE_RINSPACE_TYPST_CREATE_ENABLED === 'true',
  };

  return {
    base,
    plugins: [react(), tailwindcss(), craCompatManifest()],
    resolve: {
      alias: {
        'react-bootstrap': path.resolve(__dirname, 'src/components/ui/compat.tsx'),
        '@': path.resolve(__dirname, 'src'),
        app: path.resolve(__dirname, 'src/app'),
        components: path.resolve(__dirname, 'src/components'),
        features: path.resolve(__dirname, 'src/features'),
        pages: path.resolve(__dirname, 'src/pages'),
        services: path.resolve(__dirname, 'src/services'),
        styles: path.resolve(__dirname, 'src/styles'),
        '@mathjax/src': path.resolve(__dirname, 'node_modules/@mathjax/src'),
      },
    },
    define: { __RINSPACE_PUBLIC_ENV__: JSON.stringify(publicEnv) },
    build: {
      outDir: 'build',
      emptyOutDir: true,
      cssMinify: 'lightningcss',
      sourcemap: env.GENERATE_SOURCEMAP === 'true',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
        },
        output: {
          entryFileNames: 'static/js/[name].[hash].js',
          chunkFileNames: 'static/js/[name].[hash].chunk.js',
          assetFileNames: (asset) => (asset.name?.endsWith('.css') ? 'static/css/[name].[hash][extname]' : 'assets/[name].[hash][extname]'),
        },
      },
    },
    server: {
      proxy: {
        '/rinspace/admin/api': {
          target: env.REACT_APP_API_URL || 'http://127.0.0.1:8080',
          changeOrigin: true,
          secure: false,
        },
        '/rinspace/api': {
          target: env.REACT_APP_API_URL || 'http://127.0.0.1:8080',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      coverage: { provider: 'v8', reporter: ['text', 'json-summary'] },
    },
  };
});
