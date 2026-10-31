import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import TagKnowledgeConnections from './TagKnowledgeConnections';

vi.mock('@/services/tagV2', () => ({
  loadCanonicalTagConnections: async (id: number, view: string) => ({
    tag: { id, slugName: `tag-${id}`, displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Geometry', parentTagIds: [2], version: 3 },
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
  renameCanonicalTag: async () => ({ id: 42, slugName: 'tag-42', displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Geometry', parentTagIds: [2], version: 4 }),
  addCanonicalTagAlias: async () => ({ id: 1, tagId: 42, tagVersion: 4, displayName: 'Faisceau', normalizedName: 'faisceau', reviewState: 'unreviewed' }),
  loadTagStatements: async (_id: number, direction: string) => direction === 'requires' ? [{ id: 'statement-1', subjectTagId: 42, subjectTagDisplayName: 'Sheaf', predicateTagId: 70, objectTagId: 6, objectTagDisplayName: 'Category', evidence: {}, reviewState: 'approved', rank: 0, reason: 'Prerequisite', version: 2, createdAt: '2026-08-20T10:00:00Z' }] : [],
}));

test('shows one-row relationships with IDs inside tag information without replacing article content', async () => {
  await ensureLocaleNamespaces('zh-CN', ['reader']);
  await i18n.changeLanguage('zh-CN');

  const view = render(
    <MemoryRouter initialEntries={[`/tags/42/sheaf?candidate=${'b'.repeat(40)}`]}>
      <main><article data-testid="valid-article">valid publication</article><TagKnowledgeConnections tagId={42} displayName="Sheaf" parentTags={[{ tagId: '2', slugName: 'geometry', displayName: 'Geometry' }]} repositoryState="active" interactionActions={<button type="button">Save tag</button>} /></main>
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
  expect(view.getByText('父标签')).toBeTruthy();
  expect(view.getByText('子标签')).toBeTruthy();
  expect(view.getByText('前置标签')).toBeTruthy();
  expect(view.getByText('后续标签')).toBeTruthy();
  expect(view.queryByText('被需要')).toBeNull();
  expect(view.getByText('main-result')).toBeTruthy();
  const informationPanel = view.getByText('标签信息').closest('.tag-information-panel');
  if (!informationPanel) throw new Error('Expected the combined tag information panel');
  expect(informationPanel.querySelector('.tag-knowledge-actions')).toBeNull();
  expect(informationPanel.textContent).toContain('标签 ID');
  expect(informationPanel.textContent).toContain('ID 42');
  expect(informationPanel.textContent).toContain('父标签');
  expect(informationPanel.textContent).toContain('子标签');
  expect(informationPanel.textContent).toContain('Save tag');
  const relationshipRows = informationPanel.querySelectorAll('.tag-knowledge-chips > a');
  expect(relationshipRows.length).toBeGreaterThanOrEqual(3);
  relationshipRows.forEach((row) => {
    expect(row.querySelector('small')?.textContent).toMatch(/^ID /);
  });
  expect(view.getByRole('link', { name: /源码/ }).getAttribute('href')).toContain('/tags/42');
  expect(view.queryByRole('button', { name: '维护标签' })).toBeNull();
  expect(view.queryByRole('link', { name: '报告问题' })).toBeNull();
  expect(view.queryByRole('button', { name: '复制当前引用' })).toBeNull();
  expect(view.queryByRole('button', { name: '复制固定引用' })).toBeNull();
  const sourceAction = view.getByRole('link', { name: 'Gitea 源码' });
  expect(sourceAction.textContent).toContain('Gitea 源码');
  expect(sourceAction.classList.contains('tex-source-link')).toBe(true);
  expect(sourceAction.querySelector('.rin-icon--git')).toBeTruthy();
  expect(view.getByText('Pull Request 预览')).toBeTruthy();
  expect(view.getByText('Bounded diagnostic.')).toBeTruthy();
  expect(view.getByText(/不会替换当前公开正文/)).toBeTruthy();
  expect(view.getByText('Category')).toBeTruthy();
  const anchorIssueHref = view.getByRole('link', { name: '勘误' }).getAttribute('href');
  const anchorIssueURL = new URL(anchorIssueHref || '', 'https://rinspace.com');
  expect(anchorIssueURL.searchParams.get('body')).toContain('Anchor: main-result');
});
