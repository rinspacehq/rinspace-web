import { render, screen, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { LocaleId } from '@/i18n/types';
import LegalPage from './index';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/components/SiteIcpLink', () => ({ default: () => null }));

describe('About copy', () => {
  it.each([
    ['zh-CN', '关于芥子环', '以 Tag 连接知识', '创作与社区', /稳定身份.*知识连接/, /二者共用一个身份/],
    ['en', 'About Rinspace', 'Knowledge connected by tags', 'Writing and community', /stable identities.*connections/, /One identity connects both/],
  ] as const)('renders the README product positioning in %s', async (locale: LocaleId, title, knowledge, community, tagDefinition, sharedIdentity) => {
    await ensureLocaleNamespaces(locale, ['legal']);
    await i18n.changeLanguage(locale);
    const view = render(<HelmetProvider><MemoryRouter><LegalPage page="about" /></MemoryRouter></HelmetProvider>);
    try {
      expect(screen.getByRole('heading', { name: title, level: 1 })).toBeTruthy();
      expect(screen.getByRole('heading', { name: knowledge, level: 2 })).toBeTruthy();
      expect(screen.getByRole('heading', { name: community, level: 2 })).toBeTruthy();
      const article = within(view.container.querySelector('article')!);
      expect(article.getByText(/Markdown.*LaTeX.*Typst/)).toBeTruthy();
      expect(article.getByText(tagDefinition)).toBeTruthy();
      expect(article.getByText(sharedIdentity)).toBeTruthy();
      expect(article.getByText(/\bGit\b/)).toBeTruthy();
      expect(article.getByText(/Gitea.*Mastodon/)).toBeTruthy();
      const organization = screen.getByRole('link', { name: 'github.com/rinspacehq' });
      expect(organization.getAttribute('href')).toBe('https://github.com/rinspacehq');
      expect(organization.getAttribute('rel')).toContain('noopener');
      expect(view.container.querySelectorAll('article > section')).toHaveLength(4);
      expect(view.container.querySelectorAll('article p')).toHaveLength(8);
      expect(screen.getByRole('link', { name: 'lunifans@outlook.com' }).getAttribute('href')).toBe('mailto:lunifans@outlook.com');
    } finally {
      view.unmount();
      await i18n.changeLanguage('zh-CN');
    }
  });
});
