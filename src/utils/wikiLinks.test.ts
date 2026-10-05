import {
  enhanceWikiTagLinks,
  extractWikiTagReferences,
  polishRinBibliographyDocument,
  polishRinBibliographyHtml,
  stripRinDocumentTitle,
  wikiPlainTextFromHtml,
} from './wikiLinks';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toContain(expected: string): void;
};

test('enhances wiki tag links in rendered html text nodes', () => {
  const html = enhanceWikiTagLinks('<p>See [[sheaf|sheaves]] and [[cohomology]].</p>');

  expect(html).toContain('href="/rinspace/tags/sheaf/info"');
  expect(html).toContain('data-wiki-tag-ref="sheaf"');
  expect(html).toContain('>sheaves</a>');
  expect(html).toContain('href="/rinspace/tags/cohomology/info"');
});

test('does not enhance wiki tag links inside code-like containers', () => {
  const html = enhanceWikiTagLinks('<p><code>[[sheaf]]</code></p><p>[[scheme]]</p>');

  expect(html).toContain('<code>[[sheaf]]</code>');
  expect(html).toContain('href="/rinspace/tags/scheme/info"');
});

test('strips rin writer document title from wiki html', () => {
  const html = stripRinDocumentTitle('<h1 class="rin-doc-title">group object</h1><p>正文</p>');

  expect(html).toBe('<p>正文</p>');
});

test('preserves Rin Renderer MathJax styles through wiki document transforms', () => {
  const source = [
    '<style class="rin-mathjax-chtml-style" data-rin-math-engine="mathjax-chtml">',
    '@font-face{src:url("/fonts/mathjax-newcm/font.woff2")}mjx-container{display:inline}',
    '</style>',
    '<h1 class="rin-doc-title">Title</h1>',
    '<p>[[scheme]] <mjx-container><mjx-math>x</mjx-math></mjx-container></p>',
  ].join('');

  const html = enhanceWikiTagLinks(stripRinDocumentTitle(source));
  expect(html).toContain('rin-mathjax-chtml-style');
  expect(html).toContain('<mjx-container>');
  expect(html).toContain('data-wiki-tag-ref="scheme"');
  expect(html.includes('rin-doc-title')).toBe(false);
});

test('returns empty text when wiki excerpt only contains the rin writer title', () => {
  const text = wikiPlainTextFromHtml('<h1 class="rin-doc-title">group object</h1>');

  expect(text).toBe('');
});

test('extracts unique wiki tag references from source and html', () => {
  const references = extractWikiTagReferences(
    '\\section{A} [[sheaf|Sheaf]] [[sheaf]] <a href="/rinspace/tags/scheme/info">Scheme</a>',
  );

  expect(references.length).toBe(2);
  expect(references[0].slug).toBe('sheaf');
  expect(references[0].label).toBe('Sheaf');
  expect(references[1].slug).toBe('scheme');
});

test('enhances and extracts rinspace article citations', () => {
  const html = enhanceWikiTagLinks('<p>See \\cite{tags/42,a/123,books/91}.</p>');
  const references = extractWikiTagReferences('\\cite{tags/42,a/123,books/91}');

  expect(html).toContain('href="/rinspace/tags/42/info/tag"');
  expect(html).toContain('href="/rinspace/a/123"');
  expect(html).toContain('href="/rinspace/books/91"');
  expect(references.length).toBe(3);
  expect(references[0].kind).toBe('tag');
  expect(references[1].kind).toBe('blog');
  expect(references[1].slug).toBe('123');
  expect(references[2].kind).toBe('book');
  expect(references[2].slug).toBe('91');
});

test('uses resolved citation labels and links when available', () => {
  const html = enhanceWikiTagLinks('<p>See \\cite{tags/42#definition,a/123}.</p>', [
    {
      key: 'tags/42#definition',
      label: 'Sheaf',
      href: '/rinspace/tags/42/info/sheaf#definition',
      resolved: true,
    },
    {
      key: 'a/123',
      label: 'Derived Functors',
      href: '/rinspace/a/123/derived-functors',
      resolved: true,
    },
  ]);
  const references = extractWikiTagReferences(html);

  expect(html).toContain('href="/rinspace/tags/42/info/sheaf#definition"');
  expect(html).toContain('data-rinspace-citation="tags/42#definition"');
  expect(html).toContain('>Sheaf</a>');
  expect(html).toContain('href="/rinspace/a/123/derived-functors"');
  expect(html).toContain('>Derived Functors</a>');
  expect(references[0].tagId).toBe('42');
  expect(references[0].section).toBe('definition');
});

test('extracts canonical id-first wiki tag links', () => {
  const references = extractWikiTagReferences(
    '<a href="/rinspace/tags/42/info/sheaf#definition">Sheaf</a>',
  );

  expect(references.length).toBe(1);
  expect(references[0].kind).toBe('tag');
  expect(references[0].tagId).toBe('42');
  expect(references[0].slug).toBe('sheaf');
  expect(references[0].section).toBe('definition');
  expect(references[0].href).toBe('/rinspace/tags/42/info/sheaf#definition');
});

test('extracts rin bibliography citation anchors', () => {
  const references = extractWikiTagReferences(
    '<p><a class="rin-citation" href="#rin-bib-tags/35">[1]</a></p>',
  );

  expect(references.length).toBe(1);
  expect(references[0].kind).toBe('tag');
  expect(references[0].tagId).toBe('35');
  expect(references[0].label).toBe('tags/35');
});

test('extracts rin bibliography citation anchors with tag slugs', () => {
  const references = extractWikiTagReferences(
    '<p><a class="rin-citation" href="#rin-bib-tags/abelian-variety">[1]</a></p>',
  );

  expect(references.length).toBe(1);
  expect(references[0].kind).toBe('tag');
  expect(references[0].slug).toBe('abelian-variety');
  expect(references[0].label).toBe('abelian-variety');
});

test('polishes rin bibliography html', () => {
  const html = polishRinBibliographyHtml(
    '<section class="rin-bibliography"><div class="rin-env-title">References</div><div class="rin-bibliography-list"><div class="rin-bib-item"><span class="rin-bib-index">[1]</span> {Rinspace}. <em>{abelian-variety}</em> (2026).</div></div></section>',
  );

  expect(html).toContain('>参考文献</div>');
  expect(html).toContain('<em>abelian-variety</em>');
  expect(html.includes('{Rinspace}')).toBe(false);
  expect(html.includes('{abelian-variety}')).toBe(false);
});

test('polishes rin bibliography documents without changing non-bibliography braces', () => {
  const parsedDocument = new DOMParser().parseFromString(
    '<p>{keep}</p><section class="rin-bibliography"><div class="rin-env-title">References</div><div class="rin-bibliography-list"><div class="rin-bib-item"><span class="rin-bib-index">[1]</span> {Rinspace}. <em>{vector bundle}</em> (2026).</div></div></section>',
    'text/html',
  );

  expect(polishRinBibliographyDocument(parsedDocument)).toBe(true);
  expect(parsedDocument.body.innerHTML).toContain('<p>{keep}</p>');
  expect(parsedDocument.body.innerHTML).toContain('Rinspace');
  expect(parsedDocument.body.innerHTML).toContain('<em>vector bundle</em>');
  expect(parsedDocument.body.innerHTML.includes('{Rinspace}')).toBe(false);
  expect(parsedDocument.body.innerHTML.includes('{vector bundle}')).toBe(false);
});
