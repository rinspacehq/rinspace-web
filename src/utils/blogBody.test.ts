import {
  blogEditorKind,
  bodyFromMarkdownSource,
  commentMarkdownToHtml,
  excerptFromMarkdown,
  giteaSourceFilePageUrl,
  giteaSourceFolderPageUrl,
  markdownBlogHtml,
  markdownBlogSource,
  markdownSourceFile,
  markdownStoredArticleRender,
  markdownToHtml,
  normalizeMarkdownWhitespaceEntities,
  rinWriterSourceFile,
  rinWriterSourceFallbackFile,
  typstSourceFile,
} from './blogBody';
import type { PostDetail } from '@/services/feed';

const testHashA = 'a'.repeat(64);
const testHashB = 'b'.repeat(64);
const testJobId = '11111111-2222-3333-4444-555555555555';

function base64UrlJson(value: unknown) {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function storedMarkdownRenderBody(overrides: {
  sourceSha256?: string;
  dependencyHashes?: string[];
  adapterVersion?: string;
  sourcePath?: string;
  entrypoint?: string;
  requestId?: string;
  resultDiagnostics?: unknown;
  bundleSchema?: string;
  fragment?: string;
  blocks?: unknown;
} = {}) {
  const sourceSha256 = overrides.sourceSha256 || testHashA;
  const versions = {
    rinRenderer: 'renderer-test',
    markdownAdapter: 'adapter-test',
    markdownPipeline: 'pipeline-test',
    markdownSanitizer: 'sanitizer-test',
    shiki: 'shiki-test',
    mathJax: 'mathjax-test',
    mathJaxFont: 'font-test',
    diagramEngine: 'diagram-test',
  };
  const stored = {
    schemaVersion: 'rin-markdown-article-render/v1',
    sourceSha256,
    ...(overrides.entrypoint ? { entrypoint: overrides.entrypoint } : {}),
    result: {
      schemaVersion: 'rin-render-result/v1',
      jobId: testJobId,
      requestId: overrides.requestId || testJobId,
      projectHash: testHashB,
      resultHash: testHashA,
      contentKind: 'markdown',
      engine: 'rin-markdown',
      inline: {
        schemaVersion: overrides.bundleSchema || 'rin-document-bundle/v1',
        projectHash: testHashB,
        bundleHash: testHashA,
        state: 'final',
        contentKind: 'markdown',
        documentEngine: 'rin-markdown',
        title: 'Server article',
        pages: [{
          id: 'page-1',
          sourcePath: overrides.sourcePath || 'article.md',
          fragment: overrides.fragment || '<p data-from-server="true">Final MathJax and Shiki HTML</p>',
          fragmentFormat: 'html',
          toc: [{ id: 'section', depth: 2, text: 'Section' }],
          dependencyHashes: overrides.dependencyHashes || [sourceSha256],
          ...(overrides.blocks === undefined ? {} : { blocks: overrides.blocks }),
        }],
        workUnits: [],
        assets: [],
        diagnostics: [],
        provenance: {
          adapter: 'rin-markdown',
          adapterVersion: overrides.adapterVersion || versions.markdownAdapter,
          engineVersion: versions.markdownPipeline,
          projectGraphSchemaVersion: 'rin-project-graph/v1',
        },
      },
      assets: [],
      diagnostics: overrides.resultDiagnostics === undefined ? [] : overrides.resultDiagnostics,
      versions,
      cache: { hit: false, reusedStages: [] },
    },
  };
  return [
    '[[RIN_MARKDOWN_SOURCE]]',
    '# Historical browser source',
    '[[/RIN_MARKDOWN_SOURCE]]',
    '[[RIN_MARKDOWN_RENDER]]',
    base64UrlJson(stored),
    '[[/RIN_MARKDOWN_RENDER]]',
  ].join('\n');
}

function repositoryStoredMarkdownRenderBody(sourcePath: string, sourceFilename = sourcePath, entrypoint?: string) {
  return storedMarkdownRenderBody({ sourcePath, entrypoint }).replace(
    '[[RIN_MARKDOWN_RENDER]]',
    [
      '[[RIN_MARKDOWN_FILE]]',
      JSON.stringify({
        filename: sourceFilename,
        mime: 'text/markdown;charset=utf-8',
        bytes: 24,
        url: `https://rinspace.com/git/example/raw/commit/source/${sourceFilename}`,
      }),
      '[[/RIN_MARKDOWN_FILE]]',
      '[[RIN_MARKDOWN_RENDER]]',
    ].join('\n'),
  );
}

test('decodes a validated durable Markdown article result for direct reader use', () => {
  const render = markdownStoredArticleRender(storedMarkdownRenderBody());

  expect(render?.html).toContain('data-from-server="true"');
  expect(render?.jobId).toBe(testJobId);
  expect(render?.versions.mathJax).toBe('mathjax-test');
});

test('decodes a v2 durable Markdown article result with semantic blocks', () => {
  const id = `rb_${'1'.repeat(32)}`;
  const render = markdownStoredArticleRender(storedMarkdownRenderBody({
    bundleSchema: 'rin-document-bundle/v2',
    fragment: `<p data-from-server="true" data-rin-block-id="${id}" data-rin-block-kind="paragraph">Final HTML</p>`,
    blocks: [{ id, kind: 'paragraph', text: 'Final HTML', textHash: testHashA, headingPath: [] }],
  }));

  expect(render?.html).toContain(`data-rin-block-id="${id}"`);
  expect(render?.jobId).toBe(testJobId);
});

test('rejects a v2 durable Markdown result without matching semantic blocks', () => {
  const id = `rb_${'1'.repeat(32)}`;
  const render = markdownStoredArticleRender(storedMarkdownRenderBody({
    bundleSchema: 'rin-document-bundle/v2',
    fragment: `<p data-rin-block-id="${id}" data-rin-block-kind="paragraph">Final HTML</p>`,
    blocks: [],
  }));

  expect(render).toBe(null);
});

test('accepts an independent durable Renderer request identity', () => {
  const render = markdownStoredArticleRender(storedMarkdownRenderBody({
    requestId: 'render-aa5e95719d8eef78d703d6fbaca5d4d2',
  }));

  expect(render?.jobId).toBe(testJobId);
});

test('accepts the exact repository Markdown filename as the durable page source path', () => {
  const render = markdownStoredArticleRender(repositoryStoredMarkdownRenderBody('content.md'));

  expect(render?.html).toContain('data-from-server="true"');
  expect(render?.jobId).toBe(testJobId);
});

test('active binding entrypoint supersedes a stale legacy source file marker', () => {
  const body = storedMarkdownRenderBody({
    sourceSha256: testHashA,
    sourcePath: 'content.md',
    entrypoint: 'content.md',
    dependencyHashes: [testHashB],
  }).replace(
    '[[RIN_MARKDOWN_RENDER]]',
    [
      '[[RIN_MARKDOWN_FILE]]',
      JSON.stringify({ filename: 'historical-upload.md', mime: 'text/markdown;charset=utf-8', bytes: 24, url: 'https://example.invalid/old.md' }),
      '[[/RIN_MARKDOWN_FILE]]',
      '[[RIN_MARKDOWN_RENDER]]',
    ].join('\n'),
  );
  const render = markdownStoredArticleRender(body);

  expect(render?.html).toContain('data-from-server="true"');
  expect(render?.jobId).toBe(testJobId);
});

test('accepts a durable Markdown result with nullable top-level diagnostics', () => {
  const render = markdownStoredArticleRender(storedMarkdownRenderBody({
    resultDiagnostics: null,
  }));

  expect(render?.html).toContain('data-from-server="true"');
  expect(render?.jobId).toBe(testJobId);
});

test('accepts a canonical Renderer entrypoint independently of archival source metadata', () => {
  const render = markdownStoredArticleRender(repositoryStoredMarkdownRenderBody(
    'content.md',
    'different.md',
  ));

  expect(render?.html).toContain('data-from-server="true"');
});

test('falls back for historical Markdown without a durable render marker', () => {
  const render = markdownStoredArticleRender([
    '[[RIN_MARKDOWN_SOURCE]]',
    '# Historical browser source',
    '[[/RIN_MARKDOWN_SOURCE]]',
  ].join('\n'));

  expect(render).toBe(null);
});

test('rejects durable Markdown results with mismatched source dependency identity', () => {
  const render = markdownStoredArticleRender(storedMarkdownRenderBody({
    dependencyHashes: [testHashB],
  }));

  expect(render).toBe(null);
});

test('rejects durable Markdown results with mismatched renderer provenance', () => {
  const render = markdownStoredArticleRender(storedMarkdownRenderBody({
    adapterVersion: 'wrong-adapter',
  }));

  expect(render).toBe(null);
});

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toContain(expected: string): void;
  toBe(expected: unknown): void;
  not: {
    toContain(expected: string): void;
  };
};

test('renders multiline dollar display math outside normal paragraphs', () => {
  const html = markdownToHtml(['Intro', '', '$$', 'a^2 + b^2 = c^2', '$$'].join('\n'));

  expect(html).toContain('<p>Intro</p>');
  expect(html).toContain('class="rin-display-math"');
  expect(html).toContain('katex-display');
  expect(html).not.toContain('$$');
});

test('renders comment mentions and Rin stickers without weakening Markdown code literals', () => {
  const html = commentMarkdownToHtml([
    '@[琳](user:rin) 请看 :rin_confused:，也请 @Lunifans 看看。',
    '',
    '`@[琳](user:rin) :rin_confused:`',
    '',
    '```text',
    '@[琳](user:rin) :rin_confused:',
    '```',
  ].join('\n'));

  expect(html).toContain('class="mention-link"');
  expect(html).toContain('/@rin');
  expect(html).toContain('class="mention-text"');
  expect(html).toContain('class="rin-sticker-inline"');
  expect(html).toContain('alt="困惑"');
  expect(html).toContain('<code>@[琳](user:rin) :rin_confused:</code>');
  expect(html).toContain('<pre data-rin-code-language="text"><code class="language-text" data-language="text">@[琳](user:rin) :rin_confused:</code></pre>');
});

test('keeps headings between separate display math blocks', () => {
  const html = markdownToHtml(
    ['$$', 'a+b', '$$', '', '## Middle', '', '$$', 'c+d', '$$'].join('\n'),
  );

  expect(html).toContain('<h2>Middle</h2>');
  expect(html).toContain('a+b');
  expect(html).toContain('c+d');
  expect(html).not.toContain('<p>## Middle</p>');
});

test('renders bracket display math outside normal paragraphs', () => {
  const html = markdownToHtml('\\[\n\\int_0^1 x\\,dx\n\\]');

  expect(html).toContain('class="rin-display-math"');
  expect(html).toContain('katex-display');
  expect(html).not.toContain('\\[');
});

test('does not consume an escaped footnote-looking line as bracket display math', () => {
  const html = markdownToHtml([
    '正文[^1]',
    '',
    '\\[^1]: legacy escaped footnote definition',
  ].join('\n'), { deferMath: true });

  expect(html).toContain('legacy escaped footnote definition');
  expect(html).not.toContain('class="rin-display-math rin-deferred-math"');
  expect(html).not.toContain('data-rin-math-source="^1]');
});

test('renders inline dollar and bracket math inside a paragraph', () => {
  const html = markdownToHtml('Let $a_b$ and \\(c^2\\) stay inline.');

  expect(html).toContain('<p>Let ');
  expect(html).toContain('katex');
  expect(html).not.toContain('$a_b$');
  expect(html).not.toContain('\\(c^2\\)');
});

test('recovers orphaned display math before a trailing dollar fence', () => {
  const html = markdownToHtml(
    ['x\\in B\\subseteq B\\_1\\cap B\\_2.', '', '$$'].join('\n'),
    { deferMath: true },
  );

  expect(html).toContain('class="rin-display-math rin-deferred-math"');
  expect(html).toContain('data-rin-math-source="x\\in B\\subseteq B_1\\cap B_2."');
  expect(html).not.toContain('<p>x\\in');
  expect(html).not.toContain('$$');
  expect(html).not.toContain('\\_1');
});

test('does not recover prose before a following display math fence', () => {
  const html = markdownToHtml(
    [
      '> Let $\\mathcal S\\subseteq\\mathcal P(X)$. Let',
      '>',
      '> $$',
      '> \\mathcal B_{\\mathcal S}',
      '> =\\left\\{S_1\\cap\\cdots\\cap S_n\\mid n\\ge 1\\right\\}.',
      '> $$',
      '>',
      '> If $\\bigcup_{S\\in\\mathcal S}S=X$, then $\\mathcal S$ is a **subbasis**.',
    ].join('\n'),
    { deferMath: true },
  );

  expect(html).toContain('<p>Let ');
  expect(html).toContain('Let</p>');
  expect(html).toContain('<p>If ');
  expect(html).toContain('<strong>subbasis</strong>');
  expect(html).toContain('data-rin-math-source="\\mathcal B_{\\mathcal S}');
  expect(html).not.toContain('data-rin-math-source="Let $');
  expect(html).not.toContain('data-rin-math-source="If $');
});

test('treats repeated dollar display fences as fences', () => {
  const html = markdownToHtml(
    ['$$$', '', '\\mathcal B\\_1 = a\\<b', '', '$$$'].join('\n'),
    { deferMath: true },
  );

  expect(html).toContain('class="rin-display-math rin-deferred-math"');
  expect(html).toContain('data-rin-math-source="\\mathcal B_1 = a&lt;b"');
  expect(html).not.toContain('$$$');
  expect(html).not.toContain('\\_1');
  expect(html).not.toContain('\\&lt;');
});

test('normalizes markdown escapes in display math source', () => {
  const html = markdownToHtml(
    [
      '$$',
      '\\mathcal T\\_{\\mathcal B}',
      '\\=\\left{U\\subseteq X\\middle|x\\in U\\right}.',
      '$$',
    ].join('\n'),
    { deferMath: true },
  );

  expect(html).toContain('\\mathcal T_{\\mathcal B}');
  expect(html).toContain('=\\left\\{U\\subseteq X\\middle|x\\in U\\right\\}.');
  expect(html).not.toContain('\\=');
  expect(html).not.toContain('\\_{');
  expect(html).not.toContain('\\left{');
  expect(html).not.toContain('\\right}.');
});

test('normalizes markdown escaped brackets and literal set braces in display math source', () => {
  const html = markdownToHtml(
    [
      '$$',
      'X/\\sim={\\[x]\\mid x\\in X},',
      'CX=(X\\times{1})/{a\\sim f(a)\\mid a\\in A}.',
      'X\\*Y=(X\\times Y\\times\\[0,1])/\\sim,',
      '(X\\times{y_0})\\cup({x_0}\\times Y).',
      '\\mathbb R^{n+1}\\setminus{0}',
      '$$',
    ].join('\n'),
    { deferMath: true },
  );

  expect(html).toContain('X/\\sim=\\{[x]\\mid x\\in X\\}');
  expect(html).toContain('CX=(X\\times\\{1\\})/\\{a\\sim f(a)\\mid a\\in A\\}');
  expect(html).toContain('X*Y=(X\\times Y\\times[0,1])/\\sim,');
  expect(html).toContain('(X\\times\\{y_0\\})\\cup(\\{x_0\\}\\times Y)');
  expect(html).toContain('\\mathbb R^{n+1}\\setminus\\{0\\}');
  expect(html).not.toContain('\\[x]');
  expect(html).not.toContain('X\\*Y');
  expect(html).not.toContain('\\times{1}');
  expect(html).not.toContain('/{a\\sim');
});

test('treats even backslashes before dollar as an inline math closing delimiter', () => {
  const html = markdownToHtml(
    '$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}\\\\$',
  );

  expect(html).toContain('katex');
  expect(html).not.toContain('$\\begin{aligned}');
  expect(html).not.toContain('\\end{aligned}\\\\$');
});

test('unescapes markdown punctuation in normal inline text', () => {
  const html = markdownToHtml('OM\\_ValAppend(); 往表里添加key');

  expect(html).toContain('OM_ValAppend(); 往表里添加key');
  expect(html).not.toContain('OM\\_ValAppend');
});

test('preserves fenced code language for syntax enhancement', () => {
  const html = markdownToHtml(['```C', 'int main(void) { return 0; }', '```'].join('\n'));

  expect(html).toContain('data-rin-code-language="c"');
  expect(html).toContain('class="language-c"');
});

test('hides quiver metadata comments and renders diagram images compactly', () => {
  const html = markdownToHtml(
    [
      '<!-- rin-quiver url="https://rinspace.com/quiver/#q=abc123" type="tikzcd" -->',
      '![abc123](/rin/api/diagrams/tikzcd/example.svg)',
    ].join('\n'),
  );

  expect(html).toContain('class="rin-quiver rin-quiver-image-figure"');
  expect(html).toContain('class="rin-quiver-image"');
  expect(html).not.toContain('rin-quiver url=');
  expect(html).not.toContain('<figcaption>abc123</figcaption>');
});

test('does not render generated markdown image alt text as a caption', () => {
  const html = markdownToHtml(
    [
      '![](https://example.com/blank.png)',
      '',
      '![1.00](https://cdn.example.com/graph.png)',
      '',
      '![20260727172848276.png](https://cdn.example.com/upload.png)',
    ].join('\n'),
  );

  expect(html).toContain('class="rin-markdown-image-figure"');
  expect(html).toContain('src="https://cdn.example.com/graph.png" alt=""');
  expect(html).not.toContain('<figcaption>');
  expect(html).not.toContain('1.00</figcaption>');
  expect(html).not.toContain('20260727172848276.png</figcaption>');
});

test('renders explicit markdown image captions', () => {
  const html = markdownToHtml(
    [
      '![PageRank graph](https://example.com/pagerank.png)',
      '',
      '![1.00](https://example.com/transition.png "Transition matrix")',
    ].join('\n'),
  );

  expect(html).toContain('<figcaption>PageRank graph</figcaption>');
  expect(html).toContain(
    '<figure class="rin-markdown-image-figure has-caption"><img src="https://example.com/transition.png" alt="" loading="lazy" decoding="async" /><figcaption>Transition matrix</figcaption></figure>',
  );
  expect(html).not.toContain('src="https://example.com/transition.png &quot;Transition matrix&quot;"');
  expect(html).not.toContain('<figcaption>1.00</figcaption>');
});

test('renders standalone html break lines without showing the tag as text', () => {
  const html = markdownToHtml(['前文', '', '<br />', '', '后文'].join('\n'));

  expect(html).toContain('<p>前文</p>');
  expect(html).toContain('<br />');
  expect(html).toContain('<p>后文</p>');
  expect(html).not.toContain('&lt;br');
});

test('keeps indented autolinks inside markdown list items', () => {
  const html = markdownToHtml(
    [
      '推荐阅读：',
      '',
      '* Fred Brooks, "No Silver Bullet," IEEE Computer, vol.20, no.4, 1987',
      '',
      '* 40多年前的《人月神话》在当下还有多大的指导意义？ - 王勃的回答 - 知乎\\',
      '  <https://www.zhihu.com/question/51002726/answer/2021632010695784185>',
    ].join('\n'),
  );

  expect(html).toContain('<p>推荐阅读：</p>');
  expect(html).toContain('<li>Fred Brooks, &quot;No Silver Bullet,&quot; IEEE Computer, vol.20, no.4, 1987</li>');
  expect(html).toContain(
    '<li>40多年前的《人月神话》在当下还有多大的指导意义？ - 王勃的回答 - 知乎<br /><a href="https://www.zhihu.com/question/51002726/answer/2021632010695784185">https://www.zhihu.com/question/51002726/answer/2021632010695784185</a></li>',
  );
  expect(html).not.toContain('&lt;https://www.zhihu.com/question/51002726/answer/2021632010695784185&gt;');
  expect(html).not.toContain('知乎\\</li>');
});

test('renders markdown tables instead of flattening them into text', () => {
  const html = markdownToHtml(
    [
      '| Model | Params | Notes |',
      '|:---|---:|:---:|',
      '| Transformer | 175B | decoder-only |',
      '| MLP-Mixer | 5M | vision |',
    ].join('\n'),
  );

  expect(html).toContain('<table>');
  expect(html).toContain('<thead>');
  expect(html).toContain('<tbody>');
  expect(html).toContain('<th style="text-align: left;">Model</th>');
  expect(html).toContain('<th style="text-align: right;">Params</th>');
  expect(html).toContain('<th style="text-align: center;">Notes</th>');
  expect(html).toContain('<td style="text-align: left;">Transformer</td>');
  expect(html).toContain('<td style="text-align: right;">175B</td>');
  expect(html).not.toContain('| Model | Params | Notes |');
});

test('markdown excerpts skip block math and keep inline math', () => {
  const excerpt = excerptFromMarkdown(
    [
      '# 经典零测 Kakeya 集的构造 Perron Tree 方法',
      '',
      '$$',
      'a+b',
      '$$',
      '',
      '> 参考教材为 $\\text{K. J. Falconer, }\\textit{The Geometry of Fractal Sets}$ 的 96-99面。这一部分介绍了构造。',
    ].join('\n'),
  );

  expect(excerpt).toBe('参考教材为 $\\text{K. J. Falconer, }\\textit{The Geometry of Fractal Sets}$ 的 96-99面。');
  expect(excerptFromMarkdown('# 标题\n\n第一段包含 $x_i = a_b$ 和 \\(\\alpha_*\\)。第二句不应该进入摘要。')).toBe(
    '第一段包含 $x_i = a_b$ 和 \\(\\alpha_*\\)。',
  );
  expect(excerptFromMarkdown(['$$$', 'a+b', '$$$', '', '正文摘要。'].join('\n'))).toBe('正文摘要。');
});

test('renders unaligned markdown tables without requiring colon markers', () => {
  const html = markdownToHtml(
    [
      '| 架构 | 代表模型 | 注意力方式 | 典型用途 |',
      '| --- | --- | --- | --- |',
      '| Encoder-only | BERT | 双向 Self-Attention | 分类 |',
    ].join('\n'),
  );

  expect(html).toContain('<table>');
  expect(html).toContain('<td>Encoder-only</td>');
  expect(html).toContain('<th>架构</th>');
  expect(html).not.toContain('<p>| 架构 | 代表模型 | 注意力方式 | 典型用途 |</p>');
});

test('renders markdown tables with single-dash alignment cells', () => {
  const html = markdownToHtml(
    [
      '| 性质 | 表述 | 名称 |',
      '| :- | :--- | :---- |',
      '| A1 | $(a + b) + c = a + (b + c)$ | 结合律 |',
    ].join('\n'),
  );

  expect(html).toContain('<table>');
  expect(html).toContain('<th style="text-align: left;">性质</th>');
  expect(html).toContain('<td style="text-align: left;">A1</td>');
  expect(html).toContain('(a + b) + c = a + (b + c)');
  expect(html).not.toContain('<p>| 性质 | 表述 | 名称 |');
});

test('keeps standalone quote lines inside blockquotes instead of showing literal markers', () => {
  const html = markdownToHtml(['>', '> First paragraph', '', '>', '> Second paragraph'].join('\n'));

  expect(html).toContain('<blockquote>');
  expect(html).toContain('<p>First paragraph</p>');
  expect(html).toContain('<p>Second paragraph</p>');
  expect(html).not.toContain('<p>&gt;</p>');
});

test('normalizes markdown whitespace entities in prose before rendering', () => {
  const markdown = [
    '精细加工策略',
    '',
    '&#x20;编码和组织策略',
    '',
    '```html',
    '&#x20;keep literal in code',
    '```',
  ].join('\n');
  const html = markdownToHtml(markdown);

  expect(html).toContain('<p>编码和组织策略</p>');
  expect(html).not.toContain('&amp;#x20;编码和组织策略');
  expect(normalizeMarkdownWhitespaceEntities(markdown)).toContain(' 编码和组织策略');
  expect(normalizeMarkdownWhitespaceEntities(markdown)).toContain('&#x20;keep literal in code');
});

test('renders markdown footnote references and definitions', () => {
  const html = markdownToHtml(
    [
      '自动求导会计算所需的缩并[^1]结果。',
      '',
      '[^1]: **缩并**（contraction）会消去一对轴。',
    ].join('\n'),
  );

  expect(html).toContain('<sup id="rin-md-fnref-1" class="rin-footnote-ref">');
  expect(html).toContain('<a href="#rin-md-fn-1" aria-label="脚注 1">1</a>');
  expect(html).toContain('<section class="rin-footnotes" aria-label="脚注">');
  expect(html).toContain('<li id="rin-md-fn-1"><p><strong>缩并</strong>（contraction）会消去一对轴。</p>');
  expect(html).not.toContain('[^1]');
  expect(html).not.toContain('[^1]:');
});

test('keeps undefined markdown footnote references as text', () => {
  const html = markdownToHtml('这里暂时保留[^missing]引用。');

  expect(html).toContain('<p>这里暂时保留[^missing]引用。</p>');
  expect(html).not.toContain('rin-footnotes');
  expect(html).not.toContain('rin-footnote-ref');
});

test('keeps footnote-looking syntax inside fenced code blocks', () => {
  const html = markdownToHtml(
    [
      '```md',
      '[^1]: not a rendered footnote',
      '```',
      '',
      '正文[^1]',
      '',
      '[^1]: rendered footnote',
    ].join('\n'),
  );

  expect(html).toContain('[^1]: not a rendered footnote');
  expect(html).toContain('<li id="rin-md-fn-1"><p>rendered footnote</p>');
});

test('stores markdown blog body as source-only markers', () => {
  const body = bodyFromMarkdownSource('# Title\n\n<script>alert(1)</script>', null);

  expect(markdownBlogSource(body)).toBe('# Title\n\n<script>alert(1)</script>');
  expect(markdownBlogHtml(body)).toBe('');
  expect(body).not.toContain('[[RIN_MARKDOWN]]');
  expect(body).not.toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('finds a repository-backed Markdown source when legacy file metadata is absent', () => {
  const post = {
    body: bodyFromMarkdownSource('# New article', null),
    repositorySource: {
      commit: 'a'.repeat(40),
      entrypoint: 'content.md',
      url: `/repos/a/581/raw/commit/${'a'.repeat(40)}/content.md`,
    },
  } as PostDetail;

  const source = markdownSourceFile(post);
  expect(source?.filename).toBe('content.md');
  expect(source?.mime).toBe('text/markdown');
  expect(source?.url).toBe(post.repositorySource?.url);
  expect(giteaSourceFilePageUrl(post.repositorySource!.url)).toBe(
    `/repos/a/581/src/commit/${'a'.repeat(40)}/content.md`,
  );
});

test('keeps legacy Markdown source metadata when both source formats exist', () => {
  const legacy = { filename: 'article.md', url: '/legacy/source.md', bytes: 123 };
  const post = {
    body: bodyFromMarkdownSource('# Existing article', null),
    markdownSource: legacy,
    repositorySource: {
      commit: 'b'.repeat(40),
      entrypoint: 'content.md',
      url: `/repos/a/422/raw/commit/${'b'.repeat(40)}/content.md`,
    },
  } as PostDetail;

  const source = markdownSourceFile(post);
  expect(source?.filename).toBe(legacy.filename);
  expect(source?.url).toBe(legacy.url);
  expect(source?.bytes).toBe(legacy.bytes);
});

test('converts Gitea raw source urls to file browser urls', () => {
  expect(
    giteaSourceFilePageUrl(
      'https://rinspace.com/git/testbot/articles/raw/commit/abc123/77-%E6%B5%8B%E8%AF%95/content.md',
    ),
  ).toContain('/repos/testbot/articles/src/commit/abc123/77-%E6%B5%8B%E8%AF%95/content.md');
  expect(
    giteaSourceFilePageUrl('/git/testbot/articles-private/raw/branch/main/57-paper/content.tex'),
  ).toContain('/repos/testbot/articles-private/src/branch/main/57-paper/content.tex');
  expect(giteaSourceFilePageUrl('/uploads/posts/source.md')).toBe('');
});

test('converts Gitea raw source urls to folder browser urls', () => {
  expect(
    giteaSourceFolderPageUrl(
      'https://rinspace.com/git/testbot/articles/raw/commit/abc123/77-%E6%B5%8B%E8%AF%95/content.md',
    ),
  ).toBe('https://rinspace.com/repos/testbot/articles/src/commit/abc123/77-%E6%B5%8B%E8%AF%95');
  expect(
    giteaSourceFolderPageUrl('/git/testbot/articles-private/raw/branch/main/57-paper/content.tex'),
  ).toBe('/repos/testbot/articles-private/src/branch/main/57-paper');
  expect(giteaSourceFolderPageUrl('/uploads/posts/source.md')).toBe('');
});

test('reads rin writer source file metadata from the dedicated marker', () => {
  const file = rinWriterSourceFile(
    [
      '[[RIN_SOURCE_FILE]]',
      JSON.stringify({
        filename: 'content.tex',
        mime: 'application/x-tex;charset=utf-8',
        bytes: 42,
        url: 'https://rinspace.com/git/testbot/articles/raw/commit/abc/content.tex',
      }),
      '[[/RIN_SOURCE_FILE]]',
    ].join('\n'),
  );

  expect(file?.filename || '').toBe('content.tex');
  expect(file?.url || '').toContain('/git/testbot/articles/raw/commit/abc/content.tex');
});

test('rin writer source fallback file returns null without the RIN_SOURCE section', () => {
  expect(rinWriterSourceFallbackFile('# 正文')).toBe(null);
  expect(rinWriterSourceFallbackFile('')).toBe(null);
});

test('rin writer source fallback file synthesizes metadata from the raw source section', () => {
  const body = [
    '[[RIN_WRITER]]',
    '<p>正文</p>',
    '[[/RIN_WRITER]]',
    '',
    '[[RIN_SOURCE]]',
    '\\documentclass{article}',
    '正文 定理 1',
    '[[/RIN_SOURCE]]',
  ].join('\n');
  const file = rinWriterSourceFallbackFile(body);
  expect(file?.filename || '').toBe('main.tex');
  expect(file?.url || '').toBe('');
  expect((file?.bytes || 0) > 0).toBe(true);
  // CJK characters expand beyond one byte per code point in UTF-8.
  expect((file?.bytes || 0) > 12).toBe(true);
});

test('blog editor kind recognizes the Typst editor', () => {
  expect(blogEditorKind({ editor: 'typst' })).toBe('typst');
  expect(blogEditorKind({ editor: '  Typst  ' })).toBe('typst');
  expect(blogEditorKind({ editor: 'rin' })).toBe('rin');
  expect(blogEditorKind({ editor: 'latex' })).toBe('rin');
  expect(blogEditorKind({ editor: 'markdown' })).toBe('markdown');
});

test('typst source file reports the fixed repository entry point', () => {
  const file = typstSourceFile({ editor: 'typst' });
  expect(file?.filename).toBe('main.typ');
  expect(file?.mime).toBe('text/plain');
  expect(file?.url).toBe('');
});

test('typst source file stays null for non-Typst editors', () => {
  expect(typstSourceFile({ editor: 'rin' })).toBe(null);
  expect(typstSourceFile({ editor: 'markdown' })).toBe(null);
  expect(typstSourceFile({ editor: '' })).toBe(null);
});

test('a Typst article body exposes source metadata that the LaTeX markers cannot', () => {
  const body = [
    '[[RIN_WRITER]]',
    '<h2>1. 引言</h2><p>从这里开始撰写文章。</p>',
    '[[/RIN_WRITER]]',
  ].join('\n');
  expect(rinWriterSourceFile(body)).toBe(null);
  expect(rinWriterSourceFallbackFile(body)).toBe(null);
  expect(typstSourceFile({ editor: 'typst', body })?.filename).toBe('main.typ');
});
