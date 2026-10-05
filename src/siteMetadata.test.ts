import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/site.webmanifest'), 'utf8'),
) as {
  name: string;
  icons: Array<{ src: string; sizes: string }>;
};

describe('site brand metadata', () => {
  it('uses the current mark across browser and discovery icon entrypoints', () => {
    expect(indexHtml).toContain('href="%BASE_URL%favicon.ico"');
    expect(indexHtml).toContain('href="%BASE_URL%favicon-32x32.png"');
    expect(indexHtml).toContain('href="%BASE_URL%apple-touch-icon.png"');
    expect(indexHtml).toContain('href="%BASE_URL%site.webmanifest"');
    expect(indexHtml).toContain('https://rinspace.com/assets/brand/rinspace-mark.png');
    expect(indexHtml).not.toContain('favicon.svg');
    expect(manifest.name).toBe('芥子环');
    expect(manifest.icons).toEqual([
      { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);
  });
});
