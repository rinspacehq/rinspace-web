import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import type { FeedItem } from '@/services/contracts';
import { DirectoryFeedCard, DirectoryModeTabs } from './DirectoryStreamCard';

const blog: FeedItem = {
  id: 'article-1',
  type: 'blog',
  title: '保留作者写下的标题',
  author: 'Ada',
  authorId: 'ada',
  createdAt: '2026-08-27T08:00:00Z',
  meta: '不应显示的服务端中文元数据',
  excerpt: 'Author-written excerpt',
  tags: ['geometry'],
  interactions: '900 阅读 · 1 收藏 · 2 评论 · 不应显示',
  heat: '服务端中文热度',
  readCount: 1_200,
  favoriteCount: 2,
  commentCount: 3,
};

describe('DirectoryStreamCard localization', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('zh-CN');
    });
  });

  it('formats structured feed values in English and preserves authored content', async () => {
    await ensureLocaleNamespaces('en', ['discovery']);
    await act(async () => {
      await i18n.changeLanguage('en');
    });

    const { container } = render(
      <LanguageProvider>
        <MemoryRouter>
          <DirectoryModeTabs mode="hot" onChange={() => undefined} />
          <DirectoryFeedCard item={blog} />
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(screen.getByRole('navigation', { name: 'Directory sorting' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Popular' })).toBeTruthy();
    expect(screen.getByText('Article')).toBeTruthy();
    expect(container.querySelector('.content-type-meta-blog .char')?.textContent).toBe('a');
    expect(screen.getByText('保留作者写下的标题')).toBeTruthy();
    expect(screen.getByText('1,200 reads')).toBeTruthy();
    expect(screen.getByText('2 saves')).toBeTruthy();
    expect(screen.getByText('3 comments')).toBeTruthy();
    expect(screen.queryByText(/阅读|收藏|评论|服务端中文|不应显示/)).toBeNull();
  });
});
