import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { ModerationCaseDetail, ModerationCaseItem } from '@/services/contracts';

import type { AdminWorkspaceQuery } from './queryState';

const api = vi.hoisted(() => ({
  loadModerationCases: vi.fn(),
  loadModerationCaseDetail: vi.fn(),
  reviewModerationCase: vi.fn(),
}));

vi.mock('@/services/domains/moderation', () => api);

import { ReviewWorkbench } from './ReviewWorkbench';

function moderationItem(id: number): ModerationCaseItem {
  return {
    id,
    source: 'report',
    status: 'pending',
    targetScope: 'content',
    targetType: 'blog',
    targetId: `blog-${id}`,
    contentKind: 'blog',
    actorUid: '',
    actorName: '',
    reportedUid: 'reported',
    reportedName: '目标用户',
    title: `案件 ${id}`,
    excerpt: `案件 ${id} 摘要`,
    provider: 'provider',
    bizType: 'text',
    decision: 'review',
    label: 'abuse',
    subLabel: '',
    score: 82,
    requestId: `request-${id}`,
    error: '',
    payloadSha256: `sha-${id}`,
    raw: '',
    moderationEventId: id,
    reportCount: 1,
    reportType: 2,
    reportContent: '举报内容',
    operation: '',
    reviewNote: '',
    reviewedBy: '',
    createdAt: '2026-08-27T01:00:00Z',
    updatedAt: '2026-08-27T01:05:00Z',
    reports: [{
      id,
      reporter: '',
      reportedUser: '',
      reportType: 2,
      reasonKey: 'harassment',
      reasonLabel: '人身攻击',
      reasonVersion: 1,
      content: '补充证据',
      status: 0,
      publicOutcome: '',
      version: 1,
      createdAt: '2026-08-27T01:00:00Z',
    }],
    version: 3,
    allowedActions: ['defer', 'ignore_report', 'hide_post'],
  };
}

function moderationDetail(id: number): ModerationCaseDetail {
  const item = moderationItem(id);
  return {
    case: item,
    decisionOptions: [
      {
        key: 'no_violation',
        label: '未违规',
        actions: [{ operation: 'ignore_report', label: '举报不成立', tone: 'neutral', requiresNote: false, requiresDuration: false, impact: '' }],
      },
      {
        key: 'violation',
        label: '违规',
        actions: [{ operation: 'hide_post', label: '隐藏内容', tone: 'destructive', requiresNote: true, requiresDuration: false, impact: '文章将从公开访问中隐藏。' }],
      },
      {
        key: 'defer',
        label: '暂缓',
        actions: [{ operation: 'defer', label: '暂缓', tone: 'warning', requiresNote: true, requiresDuration: false, impact: '' }],
      },
    ],
    snapshot: { title: `审核快照 ${id}`, body: `正文 ${id}` },
    machineEvidence: [],
    reasonDistribution: [{ reasonKey: 'harassment', reasonLabel: '人身攻击', count: 1 }],
    timeline: [{ id: `case:${id}`, kind: 'case', action: 'created', actorUid: '', summary: '', payload: {}, createdAt: '2026-08-27T01:00:00Z' }],
    generatedAt: '2026-08-27T01:06:00Z',
  };
}

const initialQuery: AdminWorkspaceQuery = {
  view: 'review',
  section: 'blogs',
  source: 'all',
  status: 'active',
  page: 1,
  caseId: null,
  systemSection: 'overview',
};

function Fixture() {
  const [query, setQuery] = useState(initialQuery);
  return <ReviewWorkbench query={query} onQueryChange={(patch) => setQuery((current) => ({ ...current, ...patch }))} />;
}

function queueResult(items: ModerationCaseItem[]) {
  return {
    count: items.length,
    page: 1,
    pageSize: 20,
    items,
    counts: { active: items.length, pending: items.length, deferred: 0, machine: 0, report: items.length, hybrid: 0, closed: 0 },
    generatedAt: '2026-08-27T01:06:00Z',
  };
}

async function switchLanguage(language: 'en' | 'zh-CN') {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

beforeAll(async () => {
  await ensureLocaleNamespaces('en', ['admin']);
  await ensureLocaleNamespaces('zh-CN', ['admin']);
});

describe('ReviewWorkbench', () => {
  beforeEach(async () => {
    await switchLanguage('zh-CN');
    api.loadModerationCases.mockReset();
    api.loadModerationCaseDetail.mockReset();
    api.reviewModerationCase.mockReset();
    api.loadModerationCases.mockResolvedValue(queueResult([moderationItem(41), moderationItem(42)]));
    api.loadModerationCaseDetail.mockImplementation(async (id: number) => moderationDetail(id));
    api.reviewModerationCase.mockResolvedValue({ id: 41, status: 'ignored', operation: 'ignore_report', publicOutcome: '', version: 4, replayed: false, correlationId: '', reviewedAt: '2026-08-27T01:10:00Z' });
  });

  afterEach(async () => {
    await switchLanguage('zh-CN');
  });

  it('moves from a text queue to one focused case and then to the successor', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    expect(await screen.findByRole('button', { name: /案件 41/ })).toBeTruthy();
    expect(screen.queryByText(/你可以|请先|从这里/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /案件 41/ }));
    expect(await screen.findByRole('heading', { name: '案件 41', level: 1 })).toBeTruthy();
    expect(screen.getByText('审核快照 41')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '未违规' }));
    expect(screen.getByRole('button', { name: '举报不成立' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '拦截内容' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '举报不成立' }));
    await user.click(screen.getByRole('button', { name: '提交决策' }));
    await waitFor(() => expect(api.reviewModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      id: 41,
      operation: 'ignore_report',
      expectedVersion: 3,
    })));
    expect(await screen.findByRole('heading', { name: '案件 42', level: 1 })).toBeTruthy();
  });

  it('preserves the decision draft when the server reports a version conflict', async () => {
    api.loadModerationCases.mockResolvedValue(queueResult([moderationItem(41)]));
    api.reviewModerationCase.mockRejectedValue(Object.assign(new Error('案件版本已更新'), { status: 409 }));
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(await screen.findByRole('button', { name: /案件 41/ }));
    await user.click(await screen.findByRole('button', { name: '暂缓' }));
    await user.click(screen.getAllByRole('button', { name: '暂缓' })[1]);
    const note = screen.getByLabelText(/判断依据/) as HTMLTextAreaElement;
    await user.type(note, '等待补充上下文');
    await user.click(screen.getByRole('button', { name: '提交决策' }));
    expect(await screen.findByText('案件已更新')).toBeTruthy();
    expect(note.value).toBe('等待补充上下文');
    expect(api.loadModerationCaseDetail).toHaveBeenCalledTimes(2);
  });

  it('requires final confirmation before a high-impact decision', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(await screen.findByRole('button', { name: /案件 41/ }));
    await user.click(await screen.findByRole('button', { name: '违规' }));
    await user.click(await screen.findByRole('button', { name: '隐藏内容' }));
    await user.type(screen.getByLabelText(/判断依据/), '确认违规内容');
    await user.click(screen.getByRole('button', { name: '提交决策' }));
    expect(await screen.findByRole('heading', { name: '确认审核决定' })).toBeTruthy();
    expect(screen.getAllByText('文章将从公开访问中隐藏。')).toHaveLength(2);
    expect(api.reviewModerationCase).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认提交' }));
    await waitFor(() => expect(api.reviewModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      id: 41,
      operation: 'hide_post',
      note: '确认违规内容',
      expectedVersion: 3,
    })));
  });

  it('reconstructs server labels by semantic keys and preserves the review draft across a live language switch', async () => {
    await switchLanguage('en');
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(await screen.findByRole('button', { name: /案件 41/ }));

    expect(await screen.findByRole('heading', { name: '案件 41', level: 1 })).toBeTruthy();
    expect(screen.getByText('审核快照 41')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No violation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '未违规' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'No violation' }));
    expect(screen.getByRole('button', { name: 'Dismiss report' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '举报不成立' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Dismiss report' }));
    const note = screen.getByLabelText(/Decision basis/) as HTMLTextAreaElement;
    await user.type(note, 'keep this review draft');

    await switchLanguage('zh-CN');

    expect(screen.getByRole('button', { name: '未违规' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '举报不成立' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText(/判断依据/) as HTMLTextAreaElement).value).toBe('keep this review draft');
    expect(screen.getByText('审核快照 41')).toBeTruthy();
  });
});
