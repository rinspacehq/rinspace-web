import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const fixtureEnabled = process.env.CODE_EDITOR_PROBE_FIXTURE === 'true';
const probeEnabled = process.env.CODE_EDITOR_PROBE_ENABLED === 'true';
const storageState = process.env.CODE_EDITOR_PROBE_STORAGE_STATE;
const scenario = process.env.CODE_EDITOR_PROBE_SCENARIO || 'cold';
const configuredOutputDir = process.env.CODE_EDITOR_PROBE_OUTPUT_DIR;

if (!['cold', 'hot', 'reconnect'].includes(scenario)) {
  throw new Error('CODE_EDITOR_PROBE_SCENARIO must be cold, hot or reconnect');
}

if (probeEnabled && !fixtureEnabled && !storageState) {
  throw new Error('CODE_EDITOR_PROBE_STORAGE_STATE is required for an authenticated production probe');
}

if (probeEnabled && !fixtureEnabled && (!configuredOutputDir || !path.isAbsolute(configuredOutputDir))) {
  throw new Error('CODE_EDITOR_PROBE_OUTPUT_DIR must be an absolute path outside the repository for an authenticated production probe');
}

export default defineConfig({
  testDir: './playwright',
  testMatch: 'code-editor-baseline.spec.ts',
  outputDir: configuredOutputDir || `./test-results/code-editor-baseline/${scenario}`,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    locale: 'zh-CN',
    storageState,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: fixtureEnabled
    ? {
        command: 'node playwright/code-editor-fixture.mjs',
        url: 'http://127.0.0.1:4174/health',
        reuseExistingServer: false,
        timeout: 15_000,
      }
    : undefined,
});
