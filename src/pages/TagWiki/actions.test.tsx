import { act, fireEvent, render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { TagDetail } from '@/services/contracts';
import { loadTagDetail, loadTagSynonyms } from '@/services/domains/tag';
import { TagDetailWikiArticle, TagSocialActions } from '@/pages/TagDetail';
import TagWikiPage from './index';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/components/SiteIcpLink', () => ({ default: () => null }));
vi.mock('@/services/domains/tag', () => ({
  loadTagDetail: vi.fn(),
  loadTagSynonyms: vi.fn(),
}));

const tag: TagDetail = {
  id: 5815,
  tagId: '5815',
  slug: 'weil-pairings',
  slugName: 'weil-pairings',
  name: 'Weil Pairings',
  displayName: 'Weil Pairings',
  excerpt: 'A pairing on torsion points.',
  originalText: '# Weil Pairings',
  parsedText: '<h1>Weil Pairings</h1>',
  html: '<h1>Weil Pairings</h1>',
  texSource: '',
  rendererFinal: true,
  followCount: 3,
  readCount: 17,
  questionCount: 2,
  status: 1,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-02T00:00:00Z',
  usageExcerpt: 'A pairing on torsion points.',
  repositoryState: 'active',
  repositoryId: 12,
  parentTags: [],
  outgoingReferences: [],
  incomingReferences: [],
  outgoingObjectReferences: [],
  incomingObjectReferences: [],
};

beforeAll(async () => {
  await ensureLocaleNamespaces('zh-CN', ['reader']);
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

describe('tag Wiki source actions', () => {
  it('keeps only source access on the standalone Info page', async () => {
    vi.mocked(loadTagDetail).mockResolvedValue(tag);
    vi.mocked(loadTagSynonyms).mockResolvedValue({ synonyms: [], memberActions: [] });

    const view = render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/tags/5815/info/weil-pairings']}>
          <Routes>
            <Route path="/tags/:tagId/info/:tagName" element={<TagWikiPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );

    const source = await view.findByRole('link', { name: '源码' });
    expect(source.getAttribute('href')).toBe('/repos/rinspace/tags/src/branch/main/5815-weil-pairings');
    expect(view.queryByRole('button', { name: '编辑' })).toBeNull();
  });

  it('keeps only the detail link in the detail-page Wiki header', () => {
    const view = render(
      <MemoryRouter>
        <TagDetailWikiArticle tag={tag} intro={tag.excerpt} />
      </MemoryRouter>,
    );

    expect(view.getByRole('link', { name: '详情' })).toBeTruthy();
    expect(view.queryByRole('button', { name: '源码' })).toBeNull();
    expect(view.queryByRole('button', { name: '编辑' })).toBeNull();
  });

  it('renders independent homepage-style Like and Follow actions', () => {
    const onLike = vi.fn();
    const onFollow = vi.fn();
    const view = render(
      <TagSocialActions
        isLiked
        likeCount={7}
        likeBusy={false}
        isFollower={false}
        followCount={11}
        followBusy={false}
        repositoryReady
        onLike={onLike}
        onFollow={onFollow}
      />,
    );

    const like = view.getByRole('button', { name: '已喜欢，7' });
    const follow = view.getByRole('button', { name: '关注，11' });
    expect(like.getAttribute('aria-pressed')).toBe('true');
    expect(follow.getAttribute('aria-pressed')).toBe('false');
    expect(like.querySelector('.rin-community-action-icon--heart-fill')).not.toBeNull();
    expect(follow.querySelector('.rin-community-action-icon--bookmark')).not.toBeNull();
    expect((like.querySelector('.rin-community-action-icon--heart-fill') as HTMLElement).style.fontSize).toBe('1.25rem');
    expect((follow.querySelector('.rin-community-action-icon--bookmark') as HTMLElement).style.fontSize).toBe('1.25rem');
    fireEvent.click(like);
    fireEvent.click(follow);
    expect(onLike).toHaveBeenCalledOnce();
    expect(onFollow).toHaveBeenCalledOnce();
  });
});
