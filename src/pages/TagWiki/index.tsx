import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';

import LoadingState from '@/components/LoadingState';
import DocumentMetadataController, { absolutePublicUrl } from '@/components/DocumentMetadataController';
import MathText, { MathInline } from '@/components/MathText';
import { formatDate, formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadTagDetail, loadTagSynonyms } from '@/services/domains/tag';
import type { ObjectReferenceSummary, TagDetail, TagReferenceSummary, TagSynonym } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { useRinPageContext } from '@/utils/rinPageContext';
import { legacyTagPath, tagReadPath, tagWikiPath } from '@/utils/routes';
import { sanitizeReaderHtml } from '@/utils/sanitizeHtml';
import {
  enhanceWikiTagLinks,
  extractWikiTagReferences,
  polishRinBibliographyHtml,
  wikiDocumentHtml,
  wikiPlainTextFromHtml,
  type WikiResolvedReference,
  type WikiTagReference,
} from '@/utils/wikiLinks';
import { tagWikiGiteaHistoryPath, tagWikiGiteaSourcePath } from './gitea';

function tagName(tag: TagDetail) {
  return tag.displayName.trim() || tag.slugName;
}

type WikiTocItem = {
  id: string;
  level: 2 | 3;
  text: string;
};

type WikiReferenceLink = {
  kind: string;
  slug: string;
  label: string;
  section: string;
  href: string;
  resolved: boolean;
};

function slugifyHeading(value: string, used: Set<string>) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    || 'section';
  let next = base;
  let index = 2;
  while (used.has(next)) {
    next = `${base}-${index}`;
    index += 1;
  }
  used.add(next);
  return next;
}

function objectReferenceResolution(reference: ObjectReferenceSummary): WikiResolvedReference | null {
  if (!reference.targetKey) return null;
  const key = reference.section ? `${reference.targetKey}#${reference.section}` : reference.targetKey;
  const slug = reference.targetSlugName || reference.targetKey.replace(/^tag:/, '').replace(/^tags\//, '');
  const label = cleanReferenceLabel(reference.label, reference.targetDisplayName, slug, reference.targetKey);
  return {
    key,
    label,
    href: reference.targetType === 'tag'
      ? tagWikiReferencePath(reference.targetId, slug, label, reference.section)
      : reference.href,
    resolved: reference.resolved,
  };
}

function prepareWikiHtml(
  rawHtml: string,
  fallback: string,
  resolvedReferences: WikiResolvedReference[] = [],
  rendererFinal = false,
) {
  const source = sanitizeReaderHtml(rawHtml, { rendererFinal }).trim();
  if (!source || typeof DOMParser === 'undefined') {
    return {
      html: source,
      toc: [] as WikiTocItem[],
      references: extractWikiTagReferences(source),
      text: source || fallback,
    };
  }
  const parser = new DOMParser();
  const document = parser.parseFromString(source, 'text/html');
  document.body.querySelectorAll('.rin-doc-title').forEach((element) => {
    element.remove();
  });
  const used = new Set<string>();
  const toc: WikiTocItem[] = [];
  document.body.querySelectorAll('h2, h3').forEach((heading) => {
    const text = (heading.textContent || '').trim();
    if (!text) return;
    const existingId = heading.getAttribute('id') || '';
    const id = existingId || slugifyHeading(text, used);
    if (existingId) used.add(existingId);
    heading.setAttribute('id', id);
    toc.push({
      id,
      level: heading.tagName.toLowerCase() === 'h3' ? 3 : 2,
      text,
    });
  });
  const html = polishRinBibliographyHtml(
    enhanceWikiTagLinks(wikiDocumentHtml(document) || source, resolvedReferences),
  );
  return {
    html,
    toc,
    references: extractWikiTagReferences(html),
    text: (document.body.textContent || '').trim() || fallback,
  };
}

function dateLabel(value: string, locale: 'zh-CN' | 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function wikiTagRoutePath(slug: string, section = '') {
  return withSection(`${legacyTagPath(slug)}/info`, section);
}

function withSection(href: string, section = '') {
  return section ? `${href}#${encodeURIComponent(section)}` : href;
}

function tagWikiReferencePath(
  id: string | number | undefined,
  slug: string,
  display: string,
  section = '',
) {
  const idText = String(id || '').trim();
  if (/^\d+$/.test(idText)) {
    return withSection(tagWikiPath(idText, slug || display || idText), section);
  }
  const wikiSlug = (slug || display).trim();
  if (wikiSlug && !/^\d+$/.test(wikiSlug)) {
    return wikiTagRoutePath(wikiSlug, section);
  }
  return withSection(legacyTagPath(idText || display || slug), section);
}

function cleanReferenceLabel(label: string, display: string, slug: string, key = '') {
  const value = label.trim();
  const lower = value.toLowerCase();
  if (
    !value ||
    value === slug ||
    value === key ||
    value === key.replace(/^tags\//, '') ||
    value.startsWith('tags/') ||
    value.startsWith('tag:') ||
    value.includes('/tags/') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://')
  ) {
    return display || slug || key || value;
  }
  return value;
}

function referenceFromSummary(reference: TagReferenceSummary): WikiReferenceLink {
  const slug = reference.targetSlugName || reference.sourceSlugName;
  return {
    kind: 'tag',
    slug,
    label: cleanReferenceLabel(reference.label, reference.targetDisplayName, slug),
    section: reference.section,
    href: tagWikiReferencePath(reference.targetTagId, slug, reference.targetDisplayName, reference.section),
    resolved: reference.resolved,
  };
}

function referenceFromObjectSummary(reference: ObjectReferenceSummary): WikiReferenceLink | null {
  if (reference.targetType !== 'tag') return null;
  const slug = reference.targetSlugName || reference.targetId || reference.targetKey.replace(/^tag:/, '').replace(/^tags\//, '');
  if (!slug) return null;
  const display = reference.targetDisplayName || slug;
  return {
    kind: 'tag',
    slug,
    label: cleanReferenceLabel(reference.label, display, slug, reference.targetKey),
    section: reference.section,
    href: tagWikiReferencePath(reference.targetId, slug, display, reference.section),
    resolved: reference.resolved,
  };
}

function referenceFromClient(reference: WikiTagReference): WikiReferenceLink {
  if (reference.kind === 'blog' || reference.kind === 'book') {
    return {
      kind: reference.kind,
      slug: reference.slug,
      label: reference.label,
      section: reference.section,
      href: '#',
      resolved: false,
    };
  }
  const href = tagWikiReferencePath(reference.tagId, reference.slug, reference.label, reference.section);
  return {
    kind: reference.kind || 'tag',
    slug: reference.slug,
    label: reference.label,
    section: reference.section,
    href,
    resolved: true,
  };
}

function incomingReferenceRoute(reference: TagReferenceSummary) {
  return tagWikiReferencePath(reference.sourceTagId, reference.sourceSlugName, reference.sourceDisplayName);
}

function incomingReferenceFromSummary(reference: TagReferenceSummary): WikiReferenceLink {
  const slug = reference.sourceSlugName;
  return {
    kind: 'tag',
    slug,
    label: reference.sourceDisplayName || slug,
    section: '',
    href: incomingReferenceRoute(reference),
    resolved: true,
  };
}

function incomingReferenceFromObjectSummary(reference: ObjectReferenceSummary): WikiReferenceLink | null {
  if (reference.sourceType !== 'tag') return null;
  const slug = reference.sourceSlugName || reference.sourceId;
  if (!slug) return null;
  return {
    kind: 'tag',
    slug,
    label: reference.sourceDisplayName || slug,
    section: '',
    href: tagWikiReferencePath(reference.sourceId, slug, reference.sourceDisplayName),
    resolved: true,
  };
}

function uniqueReferenceLinks(references: WikiReferenceLink[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.slug}#${reference.section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function TagWikiPage() {
  const { t } = useFeatureTranslation('reader');
  const locale = useResolvedLocale();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routeTagId = decodeURIComponent(params.tagId || '').trim();
  const rawRouteTagName = decodeURIComponent(params.tagName || '').trim();
  const effectiveRouteTagId = routeTagId || (/^\d+$/.test(rawRouteTagName) ? rawRouteTagName : '');
  const routeTagName = effectiveRouteTagId ? '' : rawRouteTagName;
  const tagLookup = effectiveRouteTagId || routeTagName;
  const [tag, setTag] = useState<TagDetail | null>(null);
  const [synonyms, setSynonyms] = useState<TagSynonym[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setTag(null);
    setSynonyms([]);

    if (!tagLookup) {
      setError(t('tagWiki.missing'));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void loadTagDetail(effectiveRouteTagId ? { tagId: effectiveRouteTagId } : { name: routeTagName })
      .then(async (detail) => {
        const synonymResult = await loadTagSynonyms({ tagId: detail.tagId });
        if (cancelled) return;
        setTag(detail);
        setSynonyms(synonymResult.synonyms);
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFromError(loadError, 'reader.tagLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveRouteTagId, routeTagName, t, tagLookup]);

  useEffect(() => {
    if (!tag) return;
    const canonicalPath = tagWikiPath(tag.id, tag.slugName || tagName(tag));
    const canonicalWithSearch = `${canonicalPath}${location.search}${location.hash}`;
    if (location.pathname !== canonicalPath) {
      navigate(canonicalWithSearch, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate, tag]);

  const title = useMemo(() => {
    if (!tag) return t('tagWiki.documentTitle');
    return t('tagWiki.tagDocumentTitle', { tag: tagName(tag) });
  }, [t, tag]);
  const wikiArticle = useMemo(() => {
    if (!tag) {
      return {
        html: '',
        toc: [] as WikiTocItem[],
        references: [] as WikiTagReference[],
        text: '',
      };
    }
    return prepareWikiHtml(
      tag.html || tag.parsedText,
      tagName(tag),
      tag.outgoingObjectReferences
        .map(objectReferenceResolution)
        .filter((reference): reference is WikiResolvedReference => reference !== null),
      tag.rendererFinal,
    );
  }, [tag]);
  const leadText = useMemo(() => {
    if (!tag) return '';
    return wikiPlainTextFromHtml(tag.usageExcerpt) || wikiPlainTextFromHtml(tag.excerpt);
  }, [tag]);
  const wikiIndexable = Boolean(tag && wikiArticle.text.trim()
    && wikiArticle.text.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
      !== `${tagName(tag)} ${leadText}`.replace(/\s+/g, ' ').trim().toLocaleLowerCase());
  const outgoingReferences = useMemo(() => {
    if (!tag) return [] as WikiReferenceLink[];
    return uniqueReferenceLinks([
      ...tag.outgoingObjectReferences
        .map(referenceFromObjectSummary)
        .filter((reference): reference is WikiReferenceLink => reference !== null),
      ...tag.outgoingReferences.map(referenceFromSummary),
      ...wikiArticle.references
        .filter((reference) => !reference.kind || reference.kind === 'tag')
        .map(referenceFromClient),
    ]);
  }, [tag, wikiArticle.references]);
  const incomingReferences = useMemo(() => {
    if (!tag) return [] as WikiReferenceLink[];
    return uniqueReferenceLinks([
      ...tag.incomingObjectReferences
        .map(incomingReferenceFromObjectSummary)
        .filter((reference): reference is WikiReferenceLink => reference !== null),
      ...tag.incomingReferences.map(incomingReferenceFromSummary),
    ]);
  }, [tag]);
  useRinPageContext(
    tag
      ? {
          kind: 'tag',
          id: String(tag.id),
          slug: tag.slugName,
          title: `${tagName(tag)} Wiki`,
          body: tag.originalText || tag.parsedText || tag.excerpt || tagName(tag),
          excerpt: tag.excerpt,
          sections: [
            synonyms.length
              ? {
                  title: t('tagWiki.aliasesContext'),
                  body: synonyms.map((item) => item.displayName || item.slugName).join(locale === 'zh-CN' ? '、' : ', '),
                }
              : undefined,
            outgoingReferences.length
              ? {
                  title: t('tagWiki.referencesContext'),
                  body: outgoingReferences.map((reference) => reference.slug).join(locale === 'zh-CN' ? '、' : ', '),
                }
              : undefined,
          ].filter((section): section is { title: string; body: string } => Boolean(section)),
          updatedAt: tag.updatedAt,
        }
      : undefined,
  );

  return (
    <>
      <DocumentMetadataController metadata={{
        title,
        description: leadText || wikiArticle.text,
        canonicalPath: tag ? tagWikiPath(tag.id, tag.slugName || tagName(tag)) : location.pathname,
        robots: wikiIndexable ? 'index,follow' : 'noindex,follow',
        openGraphType: 'article',
        jsonLd: tag && wikiIndexable ? (() => {
          const canonical = absolutePublicUrl(tagWikiPath(tag.id, tag.slugName || tagName(tag)));
          const hub = absolutePublicUrl(tagReadPath(tag.id, tag.slugName || tagName(tag)));
          return {
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'WebPage', '@id': `${canonical}#webpage`, name: `${tagName(tag)} Wiki`, url: canonical, mainEntity: { '@id': `${canonical}#entity` } },
              {
                '@type': 'TechArticle', '@id': `${canonical}#entity`, headline: `${tagName(tag)} Wiki`,
                description: leadText || wikiArticle.text, url: canonical, dateModified: tag.updatedAt,
                about: { '@type': 'DefinedTerm', '@id': `${hub}#entity`, name: tagName(tag), url: hub },
              },
            ],
          };
        })() : undefined,
      }} />
      <SiteTopbar />
      <main
        className="tag-wiki-shell detail-blog"
        data-rin-public-document="tag-wiki"
        data-rin-object-id={tag?.tagId}
        data-rin-public-version={tag?.publicVersion}
        data-rin-content-digest={tag?.contentDigest}
      >
        {loading ? (
          <LoadingState variant="panel" />
        ) : null}
        {error ? <Alert className="notice error">{error}</Alert> : null}
        {tag ? (
          <section className="wiki-entry-layout">
            <aside className="wiki-toc" aria-label={t('tagWiki.tocLabel')}>
              <span>{t('tagWiki.toc')}</span>
              {wikiArticle.toc.length ? (
                <ol>
                  {wikiArticle.toc.map((item) => (
                    <li className={`level-${item.level}`} key={item.id}>
                      <a href={`#${item.id}`}>{item.text}</a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{t('tagWiki.emptyToc')}</p>
              )}
            </aside>

            <article className="wiki-entry-main detail-article panel blog-detail-article">
              <header className="wiki-entry-header">
                <div className="wiki-entry-actions">
                  <span>{t('tagWiki.read')}</span>
                  <a href={tagWikiGiteaSourcePath(tag)}>{t('tagWiki.source')}</a>
                  <a href={tagWikiGiteaHistoryPath(tag)}>{t('tagWiki.history')}</a>
                </div>
                <p className="wiki-entry-kicker">Wiki</p>
                <h1><MathInline text={tagName(tag)} /></h1>
                {leadText ? <p className="wiki-entry-lead"><MathInline text={leadText} /></p> : null}
                <div className="wiki-entry-meta">
                  <span>{t('tagWiki.created', { date: dateLabel(tag.createdAt, locale) })}</span>
                  <span>{t('tagWiki.updated', { date: dateLabel(tag.updatedAt, locale) })}</span>
                </div>
              </header>

              <section className="wiki-entry-body detail-body" data-rin-primary-text="tag-wiki">
                {wikiArticle.html ? (
                  <div
                    className="rin-writer-html wiki-entry-html"
                    dangerouslySetInnerHTML={{ __html: wikiArticle.html }}
                  />
                ) : (
                  <MathText text={tagName(tag)} />
                )}
              </section>

              <footer className="wiki-entry-footer">
                <section>
                  <h2>{t('tagWiki.outgoing')}</h2>
                  {outgoingReferences.length ? (
                    <div className="wiki-reference-row">
                  {outgoingReferences.map((reference) => (
                        <Link to={reference.href} key={`${reference.kind}:${reference.slug}#${reference.section}`}>
                          {reference.label}
                          {!reference.resolved ? ` ${t('tagWiki.uncreated')}` : ''}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p>{t('tagWiki.emptyOutgoing')}</p>
                  )}
                </section>
                <section>
                  <h2>{t('tagWiki.incoming')}</h2>
                  {incomingReferences.length ? (
                    <div className="wiki-reference-row">
                      {incomingReferences.map((reference) => (
                        <Link to={reference.href} key={`${reference.kind}:${reference.slug}#${reference.section}`}>
                          {reference.label}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p>{t('tagWiki.emptyIncoming')}</p>
                  )}
                </section>
              </footer>
            </article>

            <aside className="wiki-infobox" aria-label={t('tagWiki.infoLabel')}>
              <div className="wiki-infobox-title">
                <strong><MathInline text={tagName(tag)} /></strong>
              </div>
              <dl>
                {tag.parentTags.length ? (
                  <div>
                    <dt>{t('tagWiki.parentTags')}</dt>
                    <dd>
                      {tag.parentTags.map((parent, index) => (
                        <span key={parent.tagId}>
                          {index > 0 ? (locale === 'zh-CN' ? '、' : ' / ') : ''}
                          <Link to={tagReadPath(parent.tagId, parent.slugName || parent.displayName)}>
                            {parent.displayName || parent.slugName}
                          </Link>
                        </span>
                      ))}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Slug</dt>
                  <dd>{tag.slugName}</dd>
                </div>
                <div>
                  <dt>{t('tagWiki.followers')}</dt>
                  <dd>{formatNumber(locale, tag.followCount)}</dd>
                </div>
                <div>
                  <dt>{t('tagWiki.questions')}</dt>
                  <dd>{formatNumber(locale, tag.questionCount)}</dd>
                </div>
              </dl>
              <div className="wiki-infobox-links">
                <Link to={tagReadPath(tag.id, tag.slugName || tagName(tag))}>{t('tagWiki.tagHome')}</Link>
                <a href={tagWikiGiteaSourcePath(tag)}>{t('tagWiki.giteaSource')}</a>
                <a href={tagWikiGiteaHistoryPath(tag)}>{t('tagWiki.giteaHistory')}</a>
              </div>
              <section>
                <h2>{t('tagWiki.aliases')}</h2>
                {synonyms.length ? (
                  <div className="wiki-alias-list">
                    {synonyms.map((item) => (
                      <Link to={tagWikiPath(item.tagId, item.slugName || item.displayName)} key={item.tagId}>
                        {item.displayName || item.slugName}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p>{t('tagWiki.emptyAliases')}</p>
                )}
              </section>
              <SiteIcpLink />
            </aside>
          </section>
        ) : null}
      </main>
    </>
  );
}

export default TagWikiPage;
