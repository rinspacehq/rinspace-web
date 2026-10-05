import { render } from '@testing-library/react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { beforeEach, describe, expect, it } from 'vitest';

import DocumentMetadataController, { absolutePublicUrl, removeStaticDocumentMetadata } from './DocumentMetadataController';

describe('DocumentMetadataController', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>stale</title>
      <link rel="canonical" href="https://rinspace.com/stale">
      <link rel="canonical" href="https://rinspace.com/duplicate">
      <meta name="description" content="stale">
      <meta property="og:image" content="https://rinspace.com/cover.png">
      <script type="application/ld+json">{"stale":true}</script>
    `;
    removeStaticDocumentMetadata();
  });

  it('normalizes the public base path and doubled slashes', () => {
    expect(absolutePublicUrl('//a//42//hello?sort=hot#comments', 'https://rinspace.com/old'))
      .toBe('https://rinspace.com/a/42/hello');
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content'))
      .toBe('https://rinspace.com/cover.png');
  });

  it('upserts one marked metadata set across client navigation', () => {
    const view = render(<DocumentMetadataController metadata={{
      title: 'First - Rinspace',
      description: 'First description',
      canonicalPath: '/a/42/first?tab=comments',
      openGraphType: 'article',
      jsonLd: { '@type': 'BlogPosting', name: 'First' },
    }} />);

    view.rerender(<DocumentMetadataController metadata={{
      title: 'Second - Rinspace',
      description: 'Second description',
      canonicalPath: '/books/84/second#reader',
      robots: 'noindex,follow',
      openGraphType: 'book',
      jsonLd: { '@type': 'Book', name: 'Second' },
    }} />);

    expect(document.querySelectorAll('title')).toHaveLength(1);
    expect(document.querySelector('title')?.getAttribute('data-rin-metadata')).toBe('title');
    expect(document.title).toBe('Second - Rinspace');
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe(`${window.location.origin}/books/84/second`);
    expect(document.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(document.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content'))
      .toBe(`${window.location.origin}/books/84/second`);
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain('"Book"');
  });

  it('preserves page-authored title and description while owning canonical metadata', () => {
    document.title = 'Review workbench - Rinspace';
    const description = document.createElement('meta');
    description.name = 'description';
    description.content = 'Page-authored review copy';
    document.head.append(description);

    render(<DocumentMetadataController metadata={{
      title: 'Administration · Rinspace',
      canonicalPath: '/admin',
      robots: 'noindex,follow',
      pageOwnsDocumentCopy: true,
    }} />);

    expect(document.title).toBe('Review workbench - Rinspace');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content'))
      .toBe('Page-authored review copy');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe(`${window.location.origin}/admin`);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
  });

  it('lets React remove metadata when moving between a page title and public content', () => {
    const home = <DocumentMetadataController metadata={{
      title: 'Home - Rinspace', canonicalPath: '/', jsonLd: { '@type': 'WebSite' },
    }} />;
    const article = <DocumentMetadataController metadata={{
      title: 'Article - Rinspace', canonicalPath: '/a/42/article', jsonLd: { '@type': 'BlogPosting' },
    }} />;
    const generic = <>
      <Helmet title="Books - Rinspace" />
      <DocumentMetadataController metadata={{
        title: 'Books - Rinspace', canonicalPath: '/books', pageOwnsDocumentCopy: true,
      }} />
    </>;
    const view = render(<HelmetProvider>{home}</HelmetProvider>);

    view.rerender(<HelmetProvider>{article}</HelmetProvider>);
    expect(document.title).toBe('Article - Rinspace');
    expect(document.querySelectorAll('title')).toHaveLength(1);
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain('BlogPosting');

    view.rerender(<HelmetProvider>{generic}</HelmetProvider>);
    expect(document.title).toBe('Books - Rinspace');
    expect(document.querySelectorAll('title')).toHaveLength(1);
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});
