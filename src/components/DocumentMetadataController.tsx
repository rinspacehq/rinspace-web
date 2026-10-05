import { publicEnv } from '@/app/config/env';
import { createPortal } from 'react-dom';

export type DocumentMetadata = Readonly<{
  title: string;
  description?: string;
  canonicalPath: string;
  robots?: string;
  openGraphType?: string;
  jsonLd?: unknown;
  /** Leave page-authored title and description nodes under react-helmet ownership. */
  pageOwnsDocumentCopy?: boolean;
}>;

const SITE_NAME = 'Rinspace';

function normalizedBasePath() {
  const value = publicEnv.basePath.trim();
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

/** Builds one absolute public URL without inheriting query/hash UI state. */
export function absolutePublicUrl(pathname: string, origin = window.location.origin) {
  const parsed = new URL(origin);
  const path = pathname.split(/[?#]/, 1)[0] || '/';
  const normalizedPath = `/${path.replace(/^\/+/, '')}`;
  const base = normalizedBasePath();
  const withBase = base && normalizedPath !== base && !normalizedPath.startsWith(`${base}/`)
    ? `${base}${normalizedPath}`
    : normalizedPath;
  parsed.pathname = withBase.replace(/\/{2,}/g, '/');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

/**
 * The server's initial HTML owns these nodes until the interactive app starts.
 * Run this once, before createRoot: React then owns every client metadata node.
 */
export function removeStaticDocumentMetadata() {
  document.head.querySelectorAll([
    'title',
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[name="robots"]',
    'meta[property="og:site_name"]',
    'meta[property="og:type"]',
    'meta[property="og:url"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[name="twitter:card"]',
    'meta[name="twitter:title"]',
    'meta[name="twitter:description"]',
    'script[type="application/ld+json"]',
  ].join(', ')).forEach((node) => node.remove());
}

/** React owns and removes these nodes on navigation; no DOM deduplication runs after mount. */
export function DocumentMetadataController({ metadata }: { metadata: DocumentMetadata }) {
  const canonical = absolutePublicUrl(metadata.canonicalPath);
  const description = metadata.description?.trim() || '';
  const robots = metadata.robots?.trim() || 'index,follow';
  const openGraphType = metadata.openGraphType?.trim() || 'website';
  const jsonLd = metadata.jsonLd === undefined
    ? undefined
    : JSON.stringify(metadata.jsonLd).replace(/</g, '\\u003c');

  return createPortal(<>
    {!metadata.pageOwnsDocumentCopy && <title data-rin-metadata="title">{metadata.title}</title>}
    {!metadata.pageOwnsDocumentCopy && description && (
      <meta data-rin-metadata="description" name="description" content={description} />
    )}
    <link data-rin-metadata="canonical" rel="canonical" href={canonical} />
    <meta data-rin-metadata="robots" name="robots" content={robots} />
    <meta data-rin-metadata="og:site_name" property="og:site_name" content={SITE_NAME} />
    <meta data-rin-metadata="og:type" property="og:type" content={openGraphType} />
    <meta data-rin-metadata="og:url" property="og:url" content={canonical} />
    <meta data-rin-metadata="twitter:card" name="twitter:card" content="summary" />
    {!metadata.pageOwnsDocumentCopy && <>
      <meta data-rin-metadata="og:title" property="og:title" content={metadata.title} />
      <meta data-rin-metadata="twitter:title" name="twitter:title" content={metadata.title} />
      {description && <>
        <meta data-rin-metadata="og:description" property="og:description" content={description} />
        <meta data-rin-metadata="twitter:description" name="twitter:description" content={description} />
      </>}
    </>}
    {jsonLd !== undefined && (
      <script data-rin-metadata="json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    )}
  </>, document.head);
}

export default DocumentMetadataController;
