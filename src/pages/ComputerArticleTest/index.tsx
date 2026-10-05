import { Icon } from 'components/ui';
import { publicEnv } from '@/app/config/env';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import { messageFromError } from '@/services/errors';
import { loadContentDetail } from '@/services/domains/article';
import type { PostDetail } from '@/services/contracts';
import { markdownBlogSource, markdownToHtml } from '@/utils/blogBody';
import { contentPath } from '@/utils/routes';

const computerTestPostId = '227';

type ComputerTocItem = {
  id: string;
  level: number;
  text: string;
};

const computerFontStack = [
  'Newsreader',
  'Noto Serif SC',
  'Fira Code',
].join(' / ');
const publicAssetBase = (publicEnv.publicBasePath || '').replace(/\/$/, '');
const computerLocalFontStylesheet = `${publicAssetBase}/fonts/computer/computer-fonts.css`;

function fallbackMarkdownFromBody(body: string) {
  return body
    .replace(/^\s*\[\[RIN_MARKDOWN_SOURCE\]\]\s*/, '')
    .replace(/\s*\[\[\/RIN_MARKDOWN_SOURCE\]\]\s*$/, '')
    .trim();
}

function plainMarkdownText(value: string) {
  return value
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function comparableText(value: string) {
  return plainMarkdownText(value).replace(/\s+/g, '').toLowerCase();
}

function articleMarkdown(post: PostDetail) {
  const source = markdownBlogSource(post.body) || fallbackMarkdownFromBody(post.body);
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex >= 0) {
    const match = lines[firstContentIndex].match(/^#\s+(.+)$/);
    if (match && comparableText(match[1]) === comparableText(post.title)) {
      lines.splice(firstContentIndex, 1);
      if (lines[firstContentIndex]?.trim() === '') lines.splice(firstContentIndex, 1);
    }
  }
  return lines.join('\n').trim();
}

function computerTocItems(markdown: string) {
  const items: ComputerTocItem[] = [];
  Array.from(markdown.matchAll(/^(#{1,4})\s+(.+)$/gm)).forEach((match) => {
    const text = plainMarkdownText(match[2]);
    if (!text) return;
    items.push({
      id: `computer-section-${items.length + 1}`,
      level: match[1].length,
      text,
    });
  });
  return items;
}

function articleHtml(markdown: string, tocItems: ComputerTocItem[]) {
  let headingIndex = 0;
  return markdownToHtml(markdown, { deferMath: true }).replace(
    /<h([1-6])>([\s\S]*?)<\/h\1>/g,
    (match, level: string, inner: string) => {
      const item = tocItems[headingIndex];
      headingIndex += 1;
      if (!item) return match;
      return `<h${level} id="${item.id}">${inner}</h${level}>`;
    },
  );
}

function countMatches(value: string, pattern: RegExp) {
  return Array.from(value.matchAll(pattern)).length;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function ComputerArticleTestPage() {
  const { t } = useTranslation('navigation');
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadContentDetail(computerTestPostId)
      .then((nextPost) => {
        if (!cancelled) setPost(nextPost);
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFromError(loadError, 'integrations.articleTestLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markdown = useMemo(() => (post ? articleMarkdown(post) : ''), [post]);
  const tocItems = useMemo(() => computerTocItems(markdown), [markdown]);
  const html = useMemo(() => articleHtml(markdown, tocItems), [markdown, tocItems]);
  const originalPath = post ? contentPath('blog', post.id, post.title) : '/blog';
  const codeBlockCount = useMemo(
    () => countMatches(markdown, /^```[\s\S]*?^```/gm),
    [markdown],
  );
  const inlineCodeCount = useMemo(
    () => countMatches(markdown, /`[^`\n]+`/g),
    [markdown],
  );

  return (
    <>
      <Helmet title={`Computer Article Test - ${t('brandName')}`}>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={computerLocalFontStylesheet} />
      </Helmet>
      <SiteTopbar />
      <main className="computer-test-shell">
        {loading ? (
          <div className="computer-test-loading">
            <LoadingState variant="panel" label="加载计算机文章测试页" />
          </div>
        ) : error ? (
          <div className="computer-test-loading">
            <Alert variant="danger">{error}</Alert>
          </div>
        ) : post ? (
          <div className="computer-test-layout">
            <article className="computer-test-article" aria-label="计算机文章测试正文">
              <header className="computer-test-header">
                <div className="computer-test-kicker">
                  <span>computer article</span>
                  <strong>typography test</strong>
                </div>
                <h1>{post.title}</h1>
                <div className="computer-test-meta">
                  <span>{post.author}</span>
                  <span>{formatDate(post.createdAt)}</span>
                  <span>{codeBlockCount} code blocks</span>
                  <span>{inlineCodeCount} inline code</span>
                </div>
                <div className="computer-test-tags">
                  {post.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </header>
              <section
                className="rin-writer-article computer-test-body"
                aria-label="Markdown 渲染正文"
              >
                <div
                  className="rin-writer-html rin-writer-html-no-intro"
                  dangerouslySetInnerHTML={{
                    __html: html || '<p>Empty article.</p>',
                  }}
                />
              </section>
            </article>
            <aside className="computer-test-side" aria-label="文章索引">
              <div className="computer-test-side-block">
                <span>source</span>
                <Link to={originalPath}>
                  <Icon name="box-arrow-up-right" />
                  <strong>original article</strong>
                </Link>
              </div>
              <div className="computer-test-side-block computer-test-type-block">
                <span>type</span>
                <strong>{computerFontStack}</strong>
                <small>external first · local fallback</small>
              </div>
              {tocItems.length ? (
                <nav className="computer-test-toc" aria-label="目录">
                  <span>contents</span>
                  <ol>
                    {tocItems.map((item) => (
                      <li key={item.id} className={`level-${item.level}`}>
                        <a href={`#${item.id}`}>{item.text}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}

export default ComputerArticleTestPage;
