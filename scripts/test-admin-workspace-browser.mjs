#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.RINSPACE_BROWSER_BASE_URL || 'http://127.0.0.1:5173/rinspace';
const chromiumPath = process.env.CHROMIUM_BIN;

function appPathname(value) {
  return value.replace(/^\/rinspace(?=\/)/, '');
}

const capabilities = {
  capabilities: {
    'operations.control.event_replay': true,
    'operations.control.dry_run': true,
    'operations.control.apply': true,
  },
  views: { home: true, content: true, review: true, system: true },
  systemSections: { overview: true, events: true, publishing: true, consistency: true, records: true },
  features: {
    moderationCasesV2: true,
    reportFeedback: false,
    systemOperations: true,
    controlCommands: true,
  },
};

const currentUser = {
  id: 'admin-uid',
  created_at: 1,
  last_login_date: 1,
  username: 'admin',
  display_name: '管理员',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '',
  bio_html: '',
  website: '',
  location: '',
  language: 'zh-CN',
  color_scheme: 'dark',
  access_token: 'access',
  role_id: 2,
  role_name: 'admin',
  rank: 1,
  status: 'normal',
  have_password: true,
  visit_token: '',
  suspended_until: 0,
};

const emptyQueue = {
  count: 0,
  page: 1,
  pageSize: 20,
  items: [],
  counts: { active: 0, pending: 0, deferred: 0, machine: 0, report: 0, hybrid: 0, closed: 0 },
  generatedAt: '2026-08-27T00:00:00Z',
};

const controlStatus = {
  state: 'available',
  sampledAt: '2026-08-27T00:00:00Z',
  dependencies: { controlPlane: 'available', gitea: 'unknown', renderer: 'unknown', codeServer: 'unknown' },
  events: { inboxPending: 2, inboxQuarantined: 1, inboxOldestAgeSeconds: 30, outboxPending: 1, outboxDead: 0, outboxOldestAgeSeconds: 15, giteaEffectsPending: 0, giteaEffectsDead: 0 },
  publishing: { provisionPending: 0, provisionFailed24h: 0, provisionP95Seconds: 2, publicationActive: 1, publicationFailed24h: 0, publicationDriftOpen: 0, pushObservationP95Seconds: 3, queueWaitP95Seconds: 4, renderDurationP95Seconds: 8, activationDelayP95Seconds: 1 },
  consistency: { branchPolicyDrift: 0, reconciliationRequired: 1, openFindings: 1, manualFindings: 0, reconciliationRepairRatio: 1 },
  runtime: {},
};

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ['--no-sandbox'],
});

let replayRequests = 0;
let dryRunRequests = 0;
let applyRequests = 0;
let caseReviewRequests = 0;
let caseRestrictionRequests = 0;
let coverageRequests = 0;
let refundReviewRequests = 0;
let caseState = 'OPEN';

try {
  const context = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(error));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('rinspace-auth-hint', JSON.stringify({ sub: 'admin-uid' }));
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const pathname = appPathname(url.pathname);
    if (url.pathname.endsWith('/auth/v1/user/me')) {
      await route.fulfill({ json: { sub: 'admin-uid', nickname: '管理员', phone_number: '' } });
      return;
    }
    if (pathname === '/api/identity/v1/session') {
      await route.fulfill({ json: {
        status: 'authenticated',
        csrfToken: 'admin-browser-csrf',
        user: { id: 'admin-uid', username: 'admin', role: 'admin' },
        currentSession: { sid: 'admin-browser-session', version: 1 },
      } });
      return;
    }
    if (pathname === '/api/user/info') {
      await route.fulfill({ json: currentUser });
      return;
    }
    if (pathname === '/admin/api/workspace/capabilities') {
      await route.fulfill({ json: capabilities });
      return;
    }
    if (pathname === '/admin/api/wallet/capabilities') {
      await route.fulfill({ json: { capabilities: {
        'wallet.refund.view': true,
        'wallet.refund.review': true,
        'wallet.refund.revoke': false,
        'wallet.policy.view': true,
        'wallet.policy.configure': false,
        'wallet.risk.view': true,
        'wallet.risk.review': true,
        'wallet.risk.restrict': true,
        'wallet.reconciliation.manage': true,
        'wallet.coverage.manage': true,
      } } });
      return;
    }
    if (pathname === '/admin/api/wallet/refunds/92345678-1234-4234-8234-123456789abc/review') {
      refundReviewRequests += 1;
      assert.equal(route.request().method(), 'POST');
      assert.equal(route.request().headers()['x-rinspace-csrf'], 'admin-browser-csrf');
      assert.equal(route.request().headers()['x-rinspace-step-up'], undefined);
      assert.deepEqual(JSON.parse(route.request().postData() || '{}'), {
        decision: 'approve', expected_version: '2', reason: '原订单与金额一致',
      });
      await route.fulfill({ status: 201, json: {} });
      return;
    }
    if (pathname === '/admin/api/wallet/refunds/92345678-1234-4234-8234-123456789abc') {
      await route.fulfill({ json: {
        operation_id: '92345678-1234-4234-8234-123456789abc', applicant_uid: 'wallet-user',
        payment_operation_id: '82345678-1234-4234-8234-123456789abc', amount_fen: '500',
        state: 'REQUESTED_RESERVED', version: '2', created_at: '2026-09-23T08:00:00Z',
        out_trade_no: 'wallet_11111111111141118111111111111111', paid_at: '2026-09-23T07:00:00Z',
        reserved_quantity: '50', request_reason: '重复充值', payment_amount_fen: '500', reviews: [],
      } });
      return;
    }
    if (pathname === '/admin/api/wallet/refunds') {
      await route.fulfill({ json: { items: [{
        operation_id: '92345678-1234-4234-8234-123456789abc', applicant_uid: 'wallet-user',
        payment_operation_id: '82345678-1234-4234-8234-123456789abc', amount_fen: '500',
        state: 'REQUESTED_RESERVED', version: '2', created_at: '2026-09-23T08:00:00Z',
        out_trade_no: 'wallet_11111111111141118111111111111111', paid_at: '2026-09-23T07:00:00Z',
        reserved_quantity: '50', request_reason: '重复充值',
      }], next_cursor: '' } });
      return;
    }
    if (pathname === '/admin/api/wallet/policy') {
      await route.fulfill({ json: {
        version: '7', daily_recharge_limit_fen: '100000', recharge_enabled: true,
        tip_enabled: true, convert_enabled: true, created_by: 'admin-uid', reason: '生产日限额',
        created_at: '2026-09-20T08:00:00Z',
      } });
      return;
    }
    if (pathname === '/admin/api/wallet/cases/12345678-1234-4234-8234-123456789abc/review') {
      caseReviewRequests += 1;
      assert.equal(route.request().method(), 'POST');
      assert.equal(route.request().headers()['x-rinspace-csrf'], 'admin-browser-csrf');
      assert.equal(route.request().headers()['x-rinspace-step-up'], 'synthetic-case-proof');
      assert.match(route.request().headers()['idempotency-key'] || '', /^[0-9a-f-]{36}$/);
      assert.deepEqual(JSON.parse(route.request().postData() || '{}'), {
        decision: 'start_review', expected_version: '1', reason: '核对渠道证据',
      });
      caseState = 'UNDER_REVIEW';
      await route.fulfill({ status: 201, json: {
        case_id: '12345678-1234-4234-8234-123456789abc', state: caseState,
        version: '2', created_at: '2026-09-20T08:01:00Z',
      } });
      return;
    }
    if (pathname === '/admin/api/wallet/cases/12345678-1234-4234-8234-123456789abc/sources') {
      await route.fulfill({ json: { sources: [{
        lot_id: '32345678-1234-4234-8234-123456789abc', owner_uid: 'wallet-user',
        unit: 'SG', kind: 'recharge', issued: '70', remaining: '70', reserved: '0',
        restricted: '0', available: '70', version: '1',
      }], restrictions: [], appeals: [{
        appeal_id: '52345678-1234-4234-8234-123456789abc', appellant_role: 'subject',
        case_version: '1', reason: '申请复核', created_at: '2026-09-20T08:00:30Z',
      }] } });
      return;
    }
    if (pathname === '/admin/api/wallet/cases/12345678-1234-4234-8234-123456789abc/restrictions') {
      caseRestrictionRequests += 1;
      assert.equal(route.request().headers()['x-rinspace-csrf'], 'admin-browser-csrf');
      assert.equal(route.request().headers()['x-rinspace-step-up'], 'synthetic-case-proof');
      assert.deepEqual(JSON.parse(route.request().postData() || '{}'), {
        lot_id: '32345678-1234-4234-8234-123456789abc', quantity: '7',
        expected_version: '2', reason: '限制争议来源',
      });
      await route.fulfill({ status: 201, json: {
        case_id: '12345678-1234-4234-8234-123456789abc',
        hold_id: '42345678-1234-4234-8234-123456789abc',
        lot_id: '32345678-1234-4234-8234-123456789abc', quantity: '7', hold_state: 'ACTIVE',
        case_version: '3', hold_version: '1', created_at: '2026-09-20T08:02:00Z',
      } });
      return;
    }
    if (pathname === '/admin/api/wallet/cases') {
      await route.fulfill({ json: { items: [{
        case_id: '12345678-1234-4234-8234-123456789abc', kind: 'dispute', state: caseState,
        version: caseState === 'OPEN' ? '1' : '2', subject_uid: 'wallet-user',
        payment_operation_id: '22345678-1234-4234-8234-123456789abc', adjustment_count: '1',
        amount_fen: '700', review_due_at: '2026-09-21T08:00:00Z', reason: '渠道强退待核对',
        created_at: '2026-09-20T08:00:00Z',
      }], next_cursor: '' } });
      return;
    }
    if (pathname === '/admin/api/wallet/reconciliations') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/admin/api/wallet/obligations') {
      await route.fulfill({ json: {
        as_of: '2026-09-20T08:00:00Z', refundable_principal_fen: '1000', refund_reserved_fen: '0',
        approved_unpaid_refund_fen: '0', open_dispute_exposure_fen: '700', unresolved_payment_fen: '0',
        open_case_count: '1', unmatched_reconciliation_count: '0', reconciliation_difference_count: '0',
      } });
      return;
    }
    if (pathname === '/admin/api/wallet/coverage-snapshots' && route.request().method() === 'POST') {
      coverageRequests += 1;
      assert.equal(route.request().headers()['x-rinspace-step-up'], 'synthetic-case-proof');
      const coverageBody = JSON.parse(route.request().postData() || '{}');
      assert.match(coverageBody.evidence_as_of, /^2026-09-(?:19|20)T\d{2}:00:00Z$/);
      delete coverageBody.evidence_as_of;
      assert.deepEqual(coverageBody, {
        available_cash_fen: '1200', approved_required_fen: '1000',
        methodology_reference: 'controlled://methodology/v1', evidence_sha256: 'a'.repeat(64),
        evidence_reference: 'controlled://statement/2', reason: '日终核对',
      });
      await route.fulfill({ status: 201, json: {
        snapshot_id: '72345678-1234-4234-8234-123456789abc', evidence_as_of: '2026-09-20T07:00:00Z',
        available_cash_fen: '1200', approved_required_fen: '1000', state: 'COVERED', shortfall_fen: '0',
        methodology_reference: 'controlled://methodology/v1', evidence_sha256: 'a'.repeat(64),
        evidence_reference: 'controlled://statement/2', refundable_principal_fen: '1000', refund_reserved_fen: '0',
        approved_unpaid_refund_fen: '0', open_dispute_exposure_fen: '700', unresolved_payment_fen: '0',
        created_by: 'admin-uid', reason: '日终核对', created_at: '2026-09-20T08:02:00Z',
      } });
      return;
    }
    if (pathname === '/admin/api/wallet/coverage-snapshots') {
      await route.fulfill({ json: { items: [{
        snapshot_id: '62345678-1234-4234-8234-123456789abc', evidence_as_of: '2026-09-20T08:00:00Z',
        available_cash_fen: '1200', approved_required_fen: '1000', state: 'COVERED', shortfall_fen: '0',
        methodology_reference: 'controlled://methodology/v1', evidence_sha256: 'a'.repeat(64),
        evidence_reference: 'controlled://statement/1', refundable_principal_fen: '1000', refund_reserved_fen: '0',
        approved_unpaid_refund_fen: '0', open_dispute_exposure_fen: '700', unresolved_payment_fen: '0',
        created_by: 'admin-uid', reason: '日终核对', created_at: '2026-09-20T08:01:00Z',
      }] } });
      return;
    }
    if (pathname === '/api/identity/v1/step-up') {
      const body = JSON.parse(route.request().postData() || '{}');
      assert.ok(body.purpose === 'wallet_case_review' || body.purpose === 'wallet_case_restrict' || body.purpose === 'wallet_coverage_record');
      assert.match(body.target || '', /^wallet:v1:[0-9a-f]{64}$/);
      await route.fulfill({ json: body.challengeId
        ? { stepUpProof: 'synthetic-case-proof' }
        : { challengeId: 'case-challenge-1', retryAfter: 60 } });
      return;
    }
    if (pathname === '/admin/api/control/status') {
      await route.fulfill({ json: controlStatus });
      return;
    }
    if (pathname === '/admin/api/control/events/replay-review') {
      await route.fulfill({ json: {
        id: 7, kind: 'inbox', source: 'gitea', eventId: 'event-7', eventType: 'repository.push', schemaVersion: '1',
        state: 'quarantined', attemptCount: 2, lastErrorCode: 'invalid_commit', occurredAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:01:00Z', replayable: true,
      } });
      return;
    }
    if (pathname === '/admin/api/control/events/replay') {
      replayRequests += 1;
      assert.equal(route.request().method(), 'POST');
      assert.match(route.request().postData() || '', /重放隔离事件/);
      await route.fulfill({ json: { replayed: true, kind: 'inbox', id: 7, correlationId: 'ops-browser-replay' } });
      return;
    }
    if (pathname === '/admin/api/control/events') {
      await route.fulfill({ json: { items: [{
        id: 7, kind: 'inbox', source: 'gitea', eventId: 'event-7', eventType: 'repository.push', schemaVersion: '1',
        state: 'quarantined', attemptCount: 2, lastErrorCode: 'invalid_commit', occurredAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:01:00Z',
      }], nextCursor: '' } });
      return;
    }
    if (pathname === '/admin/api/control/reconciliation/dry-run') {
      dryRunRequests += 1;
      await route.fulfill({ json: {
        tier: 'event', examined: 1, differences: 1, repaired: 0, manualRequired: 0, recoverable: 1,
        projectId: 'article:41', impactHash: 'a'.repeat(64), correlationId: 'ops-browser-check',
      } });
      return;
    }
    if (pathname === '/admin/api/control/reconciliation/apply') {
      applyRequests += 1;
      assert.match(route.request().postData() || '', new RegExp('a{64}'));
      await route.fulfill({ json: {
        tier: 'event', examined: 1, differences: 1, repaired: 1, manualRequired: 0, recoverable: 1,
        projectId: 'article:41', impactHash: 'a'.repeat(64), correlationId: 'ops-browser-apply',
      } });
      return;
    }
    if (pathname === '/admin/api/control/findings') {
      await route.fulfill({ json: { items: [{
        id: 9, subjectType: 'project', subjectId: 'article:41', checkCode: 'publication_event_gap', severity: 'critical',
        sourceTier: 'event', state: 'open', occurrenceCount: 1, lastSeenAt: '2026-08-27T00:01:00Z',
      }] } });
      return;
    }
    if (pathname === '/admin/api/operations/audit') {
      await route.fulfill({ json: { items: [], nextCursor: '' } });
      return;
    }
    if (pathname === '/api/moderation/cases') {
      await route.fulfill({ json: emptyQueue });
      return;
    }
    if (pathname.startsWith('/api/')) {
      await route.fulfill({ json: {} });
      return;
    }
    await route.continue();
  });

  await page.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded' });
  try {
    await page.getByRole('heading', { name: '管理中心', level: 1 }).waitFor({ timeout: 10_000 });
  } catch (error) {
    console.error(`URL: ${page.url()}`);
    console.error(await page.locator('body').innerText());
    throw error;
  }
  const navigation = page.getByRole('complementary', { name: '管理中心导航' });
  const navigationText = (await navigation.textContent()) || '';
  for (const label of ['管理中心', '管理主页', '内容管理', '审核台', '系统运营']) assert.match(navigationText, new RegExp(label));
  assert.equal(await page.getByText(/你可以|请先|从这里/).count(), 0);
  assert.match(await page.locator('html').evaluate((node) => getComputedStyle(node).colorScheme), /dark/);

  await page.getByRole('button', { name: '审核台' }).click();
  await page.locator('section[aria-label="审核台"]').waitFor();
  assert.equal(await page.getByRole('heading', { name: '审核台', level: 1 }).count(), 0);
  await page.getByText('没有案件').waitFor();
  assert.match(page.url(), /[?&]view=review(?:&|$)/);

  await page.getByRole('button', { name: '资金风险' }).click();
  await page.getByRole('heading', { name: '资金风险', level: 1 }).waitFor();
  await page.getByRole('button', { name: '充值限额' }).click();
  await page.getByText('¥1000.00').waitFor();
  await page.getByRole('button', { name: '资金覆盖' }).click();
  await page.getByText('充足', { exact: true }).waitFor();
  await page.getByLabel('证据时间').fill('2026-09-20T07:00');
  await page.getByLabel('现金（分）').fill('1200');
  await page.getByLabel('目标（分）').fill('1000');
  await page.getByLabel('口径编号').fill('controlled://methodology/v1');
  await page.getByLabel('证据 SHA-256').fill('a'.repeat(64));
  await page.getByLabel('证据编号').fill('controlled://statement/2');
  await page.getByLabel('快照理由').fill('日终核对');
  await page.getByRole('button', { name: '记录快照' }).click();
  await page.getByRole('textbox', { name: '六位验证码' }).fill('123456');
  await page.getByRole('button', { name: '确认' }).click();
  await page.getByRole('textbox', { name: '六位验证码' }).waitFor({ state: 'detached' });
  assert.equal(coverageRequests, 1);
  await page.getByRole('button', { name: '风险案例' }).click();
  if (process.env.RINSPACE_BROWSER_RISK_SCREENSHOT_PATH) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: process.env.RINSPACE_BROWSER_RISK_SCREENSHOT_PATH, fullPage: true });
  }
  await page.getByText('渠道强退待核对').waitFor();
  await page.getByRole('button', { name: '处理' }).click();
  await page.getByText('申请复核', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: '处理理由' }).fill('核对渠道证据');
  await page.getByRole('button', { name: '开始审核' }).click();
  await page.getByRole('textbox', { name: '六位验证码' }).fill('123456');
  await page.getByRole('button', { name: '确认' }).click();
  await page.locator('.admin-risk-card').getByText('核对中', { exact: true }).waitFor();
  assert.equal(caseReviewRequests, 1);
  await page.getByRole('button', { name: '处理' }).click();
  await page.getByRole('textbox', { name: '处理理由' }).fill('限制争议来源');
  await page.getByRole('textbox', { name: '数量' }).fill('7');
  await page.getByRole('button', { name: '限制' }).click();
  await page.getByRole('textbox', { name: '六位验证码' }).fill('654321');
  await page.getByRole('button', { name: '确认' }).click();
  await page.getByRole('textbox', { name: '数量' }).waitFor({ state: 'detached' });
  assert.equal(caseRestrictionRequests, 1);
  assert.match(page.url(), /[?&]view=risk(?:&|$)/);

  await page.getByRole('button', { name: '退款审核' }).click();
  await page.getByRole('heading', { name: '退款审核', level: 1 }).waitFor();
  await page.getByRole('button', { name: /¥5\.00/ }).click();
  await page.getByRole('heading', { name: '退款详情', level: 2 }).waitFor();
  assert.equal(await page.getByText('充值限额').count(), 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.RINSPACE_BROWSER_REFUND_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.RINSPACE_BROWSER_REFUND_SCREENSHOT_PATH, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const refundOverflowing = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-refunds-view *'))
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    })
    .map((node) => ({ tag: node.tagName, className: node.className, rect: node.getBoundingClientRect().toJSON() }))
    .slice(0, 12));
  assert.deepEqual(refundOverflowing, []);
  if (process.env.RINSPACE_BROWSER_REFUND_MOBILE_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.RINSPACE_BROWSER_REFUND_MOBILE_SCREENSHOT_PATH, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('textbox', { name: '审核／撤销理由' }).fill('原订单与金额一致');
  await page.getByRole('button', { name: '批准退款' }).click();
  assert.equal(refundReviewRequests, 1);
  assert.equal(await page.getByRole('textbox', { name: '六位验证码' }).count(), 0);

  await page.getByRole('button', { name: '系统运营' }).click();
  await page.locator('section[aria-label="系统运营"]').waitFor();
  assert.equal(await page.getByRole('heading', { name: '系统运营', level: 1 }).count(), 0);
  await page.getByText('Control Plane').waitFor();
  await page.getByRole('tab', { name: '事件' }).click();
  await page.getByText('repository.push').waitFor();
  await page.getByRole('button', { name: '重放' }).click();
  const replayDialog = page.getByRole('dialog', { name: '重放隔离事件' });
  await replayDialog.getByRole('textbox', { name: '操作原因' }).fill('重放隔离事件');
  await replayDialog.getByRole('button', { name: '确认重放' }).click();
  await replayDialog.waitFor({ state: 'detached' });
  assert.equal(replayRequests, 1);

  await page.getByRole('tab', { name: '一致性' }).click();
  await page.getByText('publication_event_gap').waitFor();
  await page.getByRole('button', { name: '对账' }).click();
  const reconciliationDialog = page.getByRole('dialog', { name: '单项目对账' });
  await reconciliationDialog.getByRole('textbox', { name: '操作原因' }).fill('检查并修复发布漂移');
  await reconciliationDialog.getByRole('button', { name: '运行检查' }).click();
  await reconciliationDialog.getByText('a'.repeat(64)).waitFor();
  await reconciliationDialog.getByRole('button', { name: '应用修复' }).click();
  await reconciliationDialog.waitFor({ state: 'detached' });
  assert.equal(dryRunRequests, 1);
  assert.equal(applyRequests, 1);
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
  if (process.env.RINSPACE_BROWSER_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.RINSPACE_BROWSER_SCREENSHOT_PATH, fullPage: true });
  }

  await page.getByRole('tab', { name: '记录' }).click();
  await page.getByText('暂无运营记录').waitFor();
  assert.match(page.url(), /[?&]view=system(?:&|$)/);
  assert.match(page.url(), /[?&]system=records(?:&|$)/);

  await page.setViewportSize({ width: 390, height: 844 });
  const overflowing = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-workspace-shell *'))
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    })
    .map((node) => ({ tag: node.tagName, className: node.className, rect: node.getBoundingClientRect().toJSON() }))
    .slice(0, 12));
  assert.deepEqual(overflowing, []);
  const mobileToolbar = page.locator('.admin-workspace-mobile-toolbar');
  try {
    await mobileToolbar.waitFor({ state: 'visible', timeout: 10_000 });
  } catch (error) {
    console.error(await page.locator('body').innerText());
    throw error;
  }
  const mobileTrigger = mobileToolbar.getByRole('button');
  await mobileTrigger.click();
  await page.getByRole('dialog', { name: '管理中心导航' }).waitFor();

  await context.close();
} finally {
  await browser.close();
}

console.log('admin workspace browser acceptance passed');
