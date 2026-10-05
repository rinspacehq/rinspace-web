import { defineConfig, devices } from '@playwright/test';

const requestedPreviewPort = Number.parseInt(process.env.PORT || '4173', 10);
const previewPort = Number.isInteger(requestedPreviewPort) && requestedPreviewPort > 0 && requestedPreviewPort <= 65535
  ? requestedPreviewPort
  : 4173;
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const baseURL = process.env.RINSPACE_PREVIEW_URL || `${previewOrigin}/rinspace`;
const isContinuousIntegration = process.env.GITHUB_ACTIONS === 'true'
  || /^(1|true)$/i.test(process.env.CI || '');
const requestedWorkers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '', 10);
const workers = Number.isInteger(requestedWorkers) && requestedWorkers > 0
  ? requestedWorkers
  : isContinuousIntegration ? 1 : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright',
  snapshotDir: './tests/e2e/__snapshots__',
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 1 : 0,
  workers,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'zh-CN',
    storageState: { cookies: [], origins: [] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.RINSPACE_PREVIEW_URL
    ? undefined
    : {
        command: 'pnpm preview:artifact',
        url: `${previewOrigin}/rinspace/`,
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          PORT: String(previewPort),
          NO_PROXY: '127.0.0.1,localhost',
          no_proxy: '127.0.0.1,localhost',
        },
      },
  projects: [
    { name: 'desktop-light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'desktop-dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'desktop-reduced', use: { ...devices['Desktop Chrome'], colorScheme: 'light', reducedMotion: 'reduce' } },
    { name: 'mobile-light', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
    { name: 'mobile-dark', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
    { name: 'mobile-reduced', use: { ...devices['Pixel 7'], colorScheme: 'light', reducedMotion: 'reduce' } },
  ],
});
