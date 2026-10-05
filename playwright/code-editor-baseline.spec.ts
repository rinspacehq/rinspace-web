import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import baselineContract from '../contracts/code-editor-baseline-contract.cjs';

const { validateSample } = baselineContract;

const probeEnabled = process.env.CODE_EDITOR_PROBE_ENABLED === 'true';
const editorURL = process.env.CODE_EDITOR_PROBE_URL || '';
const scenario = process.env.CODE_EDITOR_PROBE_SCENARIO || 'cold';

test.describe.configure({ mode: 'serial' });
test.skip(!probeEnabled || !editorURL, 'Set CODE_EDITOR_PROBE_ENABLED=true and a controlled CODE_EDITOR_PROBE_URL.');

type TimingMap = Record<string, number | null>;

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const probe = {
      clickAt: performance.now(),
      reconnectStartAt: null as number | null,
      webSocketOpenTimes: [] as number[],
    };
    const OriginalWebSocket = window.WebSocket;
    class ProbedWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener('open', () => {
          probe.webSocketOpenTimes.push(performance.now());
        }, { once: true });
      }
    }
    Object.defineProperty(window, 'WebSocket', { value: ProbedWebSocket });
    Object.defineProperty(window, '__RINSPACE_CODE_PROBE__', { value: probe });
  });
}

async function attachSample(page: Page, testInfo: TestInfo, responseHeaders: Record<string, string>) {
  const browserTiming = await page.evaluate((currentScenario) => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const marks = Object.fromEntries(performance.getEntriesByType('mark').map((mark) => [mark.name, mark.startTime]));
    const probe = (window as typeof window & {
      __RINSPACE_CODE_PROBE__?: {
        clickAt: number;
        reconnectStartAt: number | null;
        webSocketOpenTimes: number[];
      };
      __RINSPACE_CODE_METRICS__?: Record<string, number>;
    }).__RINSPACE_CODE_PROBE__;
    const manager = (window as typeof window & {
      __RINSPACE_CODE_METRICS__?: Record<string, number>;
    }).__RINSPACE_CODE_METRICS__ || {};
    let webSocketOpenAt = probe?.webSocketOpenTimes[0] ?? null;
    if (currentScenario === 'reconnect' && probe?.reconnectStartAt != null) {
      const latestOpen = probe.webSocketOpenTimes.at(-1);
      webSocketOpenAt = latestOpen === undefined ? null : latestOpen - probe.reconnectStartAt;
    }
    return {
      navigation: navigation ? {
        responseStart: navigation.responseStart,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        load: navigation.loadEventEnd,
      } : null,
      immutableAssetEnd: resources
        .filter((resource) => /\.(?:js|css|woff2?|wasm)(?:\?|$)/i.test(resource.name))
        .reduce((latest, resource) => Math.max(latest, resource.responseEnd), 0),
      marks,
      manager,
      webSocketOpenAt,
    };
  }, scenario);

  const custom = { ...browserTiming.manager, ...browserTiming.marks };
  const stages: TimingMap = {
    clickToGrantMs: custom['rinspace-click-to-grant'] ?? null,
    grantMs: custom['rinspace-grant'] ?? null,
    managerLookupMs: custom['rinspace-manager-lookup'] ?? null,
    cloneMs: custom['rinspace-clone'] ?? null,
    containerCreateMs: custom['rinspace-container-create'] ?? null,
    containerStartMs: custom['rinspace-container-start'] ?? null,
    httpReadyMs: custom['rinspace-http-ready'] ?? null,
    htmlTtfbMs: browserTiming.navigation?.responseStart ?? null,
    immutableAssetsMs: browserTiming.immutableAssetEnd || null,
    webSocketOpenMs: browserTiming.webSocketOpenAt,
    extensionHostMs: custom['rinspace-extension-host-ready'] ?? null,
    targetFileReadyMs: custom['rinspace-target-file-ready'] ?? null,
    firstInputReadyMs: custom['rinspace-first-input-ready'] ?? null,
  };
  const edgeHeader = responseHeaders['eo-cache-status'] || '';
  const normalizedEdge = /hit/i.test(edgeHeader) ? 'hit' : /miss/i.test(edgeHeader) ? 'miss' : /bypass/i.test(edgeHeader) ? 'bypass' : 'unknown';
  const parsedURL = new URL(editorURL);
  const sample = validateSample({
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    scenario,
    endpoint: `${parsedURL.origin}${parsedURL.pathname.replace(/\/code\/s\/[^/]+/i, '/code/s/[session]')}`,
    edgeCacheStatus: normalizedEdge,
    edgeRequestIdPresent: Boolean(responseHeaders['eo-log-uuid'] || responseHeaders['x-tencent-request-id'] || responseHeaders['x-request-id']),
    stages,
    missingStages: Object.entries(stages).filter(([, value]) => value === null).map(([name]) => name),
  });
  const outputPath = testInfo.outputPath('code-editor-baseline.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(sample, null, 2)}\n`, { flag: 'wx', mode: 0o640 });
  await testInfo.attach('code-editor-baseline.json', {
    path: outputPath,
    contentType: 'application/json',
  });
}

test('captures one bounded editor waterfall', async ({ page }, testInfo) => {
  await instrument(page);
  if (scenario === 'hot') {
    await page.goto(editorURL, { waitUntil: 'load', timeout: 60_000 });
  }
  const response = scenario === 'hot'
    ? await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    : await page.goto(editorURL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  expect(response, 'editor navigation must return a response').not.toBeNull();
  await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => undefined);
  await page.waitForFunction(() => {
    const probe = (window as typeof window & {
      __RINSPACE_CODE_PROBE__?: { webSocketOpenTimes: number[] };
    }).__RINSPACE_CODE_PROBE__;
    return (probe?.webSocketOpenTimes.length || 0) >= 1;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
  if (scenario === 'reconnect') {
    await page.evaluate(() => {
      const probe = (window as typeof window & {
        __RINSPACE_CODE_PROBE__?: { reconnectStartAt: number | null };
      }).__RINSPACE_CODE_PROBE__;
      if (probe) probe.reconnectStartAt = performance.now();
    });
    await page.context().setOffline(true);
    await page.waitForTimeout(100);
    await page.context().setOffline(false);
    await page.waitForFunction(() => {
      const probe = (window as typeof window & {
        __RINSPACE_CODE_PROBE__?: { webSocketOpenTimes: number[] };
      }).__RINSPACE_CODE_PROBE__;
      return (probe?.webSocketOpenTimes.length || 0) >= 2;
    }, undefined, { timeout: 30_000 }).catch(() => undefined);
  }
  await attachSample(page, testInfo, response?.headers() || {});
});
