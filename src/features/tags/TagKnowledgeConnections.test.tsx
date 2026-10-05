import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import TagKnowledgeConnections from './TagKnowledgeConnections';

vi.mock('@/services/tagV2', () => ({
  loadCanonicalTagConnections: async (id: number, view: string) => ({
    tag: { id, displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Geometry', parentTagIds: [2], version: 3 },
    parentTagIds: [2],
    childTagIds: [9],
    parentTags: [{ id: 2, displayName: 'Geometry', normalizedName: 'geometry' }],
    childTags: [{ id: 9, displayName: 'Algebraic geometry', normalizedName: 'algebraic geometry' }],
    knowledgeUnavailable: false,
    knowledge: {
      view,
      items: view === 'outgoing' ? [{ kind: view, targetTagId: 7, relation: 'mentions', sourceCommit: 'a'.repeat(40), sourceAnchorId: 'main-result' }] : view === 'anchors' ? [{ kind: view, anchorId: 'main-result', anchorState: 'active', sourceCommit: 'a'.repeat(40) }] : [],
    },
  }),
  loadCanonicalTagCitation: async () => ({ projectId: 'tag-wiki:42', tagId: 42, activeCommit: 'a'.repeat(40), current: 'https://rinspace.com/tags/42', revision: `https://rinspace.com/tags/42?commit=${'a'.repeat(40)}` }),
  loadTagPublicationCandidate: async () => ({ projectId: 'tag-wiki:42', repositoryId: 42, commit: 'b'.repeat(40), sourceRef: 'refs/heads/fix', state: 'failed', activationEligible: false, preview: true, publicErrorCode: 'render_failed', diagnostics: [{ code: 'renderer.failed', severity: 'error', message: 'Bounded diagnostic.' }], updatedAt: '2026-08-20T10:00:00Z' }),
  loadTagImpact: async () => ({ tagId: 42, version: 3, directChildren: 1, descendants: 2, associations: 4, aliases: 0, pendingParentReviews: 0, dependencies: 0, dependants: 0, references: 2, backlinks: 1, redirects: 0 }),
  loadTagAliases: async () => [],
  loadTagGovernanceHistory: async () => [],
  suggestTagParents: async () => ({ id: 'suggestion', tagId: 42, proposedParentTagIds: [2], baseVersion: 3, reason: 'reason', state: 'pending', proposedByUid: 'reader', createdAt: '2026-08-20T10:00:00Z' }),
  renameCanonicalTag: async () => ({ id: 42, displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Geometry', parentTagIds: [2], version: 4 }),
  addCanonicalTagAlias: async () => ({ id: 1, tagId: 42, tagVersion: 4, displayName: 'Faisceau', normalizedName: 'faisceau', reviewState: 'unreviewed' }),
  loadTagStatements: async (_id: number, direction: string) => direction === 'requires' ? [{ id: 'statement-1', subjectTagId: 42, subjectTagDisplayName: 'Sheaf', predicateTagId: 70, objectTagId: 6, objectTagDisplayName: 'Category', evidence: {}, reviewState: 'approved', rank: 0, reason: 'Prerequisite', version: 2, createdAt: '2026-08-20T10:00:00Z' }] : [],
}));

test('shows label-first relationships, maintenance links, and indexed connections without replacing article content', async () => {
  await ensureLocaleNamespaces('zh-CN', ['reader']);
  await i18n.changeLanguage('zh-CN');

  const view = render(
    <MemoryRouter initialEntries={[`/tags/42/sheaf?candidate=${'b'.repeat(40)}`]}>
      <main><article data-testid="valid-article">valid publication</article><TagKnowledgeConnections tagId={42} displayName="Sheaf" parentTags={[{ tagId: '2', slugName: 'geometry', displayName: 'Geometry' }]} repositoryState="active" /></main>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.getByText('Geometry')).toBeTruthy());
  expect(view.getByTestId('valid-article').textContent).toBe('valid publication');
  expect(view.getByText('ID 2')).toBeTruthy();
  expect(view.getByText('Algebraic geometry')).toBeTruthy();
  expect(view.getByText('ID 9')).toBeTruthy();
  expect(view.getByText('Category')).toBeTruthy();
  expect(view.getByText('ID 6')).toBeTruthy();
  expect(view.getByText('标签 #7')).toBeTruthy();
  expect(view.getByText('上级标签')).toBeTruthy();
  expect(view.getByText('前置标签')).toBeTruthy();
  expect(view.getByText('后续标签')).toBeTruthy();
  expect(view.queryByText('被需要')).toBeNull();
  expect(view.getByText('main-result')).toBeTruthy();
  const maintenancePanel = view.getByText('标签维护').closest('.tag-knowledge-maintenance-panel');
  const relationshipsPanel = view.getByText('标签关系').closest('.tag-knowledge-panel');
  if (!maintenancePanel || !relationshipsPanel) throw new Error('Expected separate tag maintenance and relationship panels');
  expect(maintenancePanel.compareDocumentPosition(relationshipsPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(maintenancePanel.querySelector('.tag-knowledge-actions')).toBeTruthy();
  expect(relationshipsPanel.querySelector('.tag-knowledge-actions')).toBeNull();
  expect(maintenancePanel.textContent).not.toContain('上级标签');
  expect(relationshipsPanel.textContent).toContain('上级标签');
  expect(view.getByRole('link', { name: /源码/ }).getAttribute('href')).toContain('/tags/42');
  const reportHref = view.getByRole('link', { name: /报告问题/ }).getAttribute('href');
  expect(reportHref).toBeTruthy();
  const reportURL = new URL(reportHref || '', 'https://rinspace.com');
  expect(reportURL.pathname).toContain('/tags/42/issues/new');
  expect(reportURL.searchParams.get('title')).toContain('Sheaf');
  expect(reportURL.searchParams.get('body')).toContain('标签：Sheaf (#42)');
  expect(reportURL.searchParams.get('body')).toContain(`公开修订：${'a'.repeat(40)}`);
  expect(reportURL.searchParams.get('body')).toContain('页面：http://localhost:3000/tags/42/sheaf');
  expect(reportURL.searchParams.get('body')).not.toContain('?candidate=');
  expect(view.getByRole('button', { name: /当前引用/ })).toBeTruthy();
  const maintenanceAction = view.getByRole('button', { name: '维护标签' });
  const reportAction = view.getByRole('link', { name: '报告问题' });
  const sourceAction = view.getByRole('link', { name: '源码' });
  const currentCitationAction = view.getByRole('button', { name: '复制当前引用' });
  const revisionCitationAction = view.getByRole('button', { name: '复制固定引用' });
  expect(maintenanceAction.textContent).toBe('');
  expect(reportAction.textContent).toBe('');
  expect(sourceAction.textContent).toBe('');
  [maintenanceAction, reportAction, sourceAction, currentCitationAction, revisionCitationAction].forEach((action) => {
    expect(action.querySelector('svg')).toBeTruthy();
    expect(action.classList.contains('tag-knowledge-icon-action')).toBe(true);
  });
  expect(sourceAction.classList.contains('tex-source-link')).toBe(true);
  expect(sourceAction.querySelector('.rin-icon--git')).toBeTruthy();
  expect(maintenanceAction.querySelector('.rin-icon--pencil-square')).toBeTruthy();
  [reportAction, currentCitationAction, revisionCitationAction].forEach((action) => {
    expect(action.querySelector('.rin-icon')).toBeNull();
  });
  expect(maintenanceAction.querySelector('[data-tag-knowledge-icon="maintain"]')).toBeTruthy();
  expect(reportAction.querySelector('[data-tag-knowledge-icon="report"]')).toBeTruthy();
  expect(sourceAction.querySelector('[data-tag-knowledge-icon="source"]')).toBeTruthy();
  expect(currentCitationAction.querySelector('[data-tag-knowledge-icon="copy-current"]')).toBeTruthy();
  expect(revisionCitationAction.querySelector('[data-tag-knowledge-icon="copy-revision"]')).toBeTruthy();
  expect(view.getByText('Pull Request 预览')).toBeTruthy();
  expect(view.getByText('Bounded diagnostic.')).toBeTruthy();
  expect(view.getByText(/不会替换当前公开正文/)).toBeTruthy();
  expect(view.getByText('Category')).toBeTruthy();
  const anchorIssueHref = view.getByRole('link', { name: '勘误' }).getAttribute('href');
  const anchorIssueURL = new URL(anchorIssueHref || '', 'https://rinspace.com');
  expect(anchorIssueURL.searchParams.get('body')).toContain('Anchor: main-result');
});
