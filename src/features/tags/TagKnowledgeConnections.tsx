import { AnimateButton, AnimateCircleAlert, AnimateClipboard, AnimateHistory, AnimateMessageCircleWarning, AnimateTerminal, Icon, Tooltip } from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { formatNumber } from '@/i18n/format';
import { useOptionalLanguage } from '@/i18n/LanguageProvider';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import {
  loadCanonicalTagCitation,
  loadCanonicalTagConnections,
  loadTagPublicationCandidate,
  loadTagStatements,
  type CanonicalTagConnections,
  type KnowledgeConnection,
  type KnowledgeCitation,
  type KnowledgePage,
  type KnowledgeView,
  type PublicationCandidate,
  type TagStatement,
} from '@/services/tagV2';
import { contentPath, tagReadPath } from '@/utils/routes';
import { giteaPath } from '@/utils/giteaPaths';
import TagGovernancePanel from './TagGovernancePanel';

type Props = {
  tagId: number;
  displayName: string;
  parentTags: Array<{ tagId: string; slugName: string; displayName: string }>;
  repositoryState?: 'legacy' | 'pending' | 'failed' | 'active';
};

const knowledgeViews: KnowledgeView[] = ['outgoing', 'backlinks', 'unresolved', 'anchors'];

function sourcePath(item: KnowledgeConnection) {
  if (!item.sourceId || !item.sourceKind) return '';
  return contentPath(item.sourceKind, item.sourceId);
}

function compactCommit(commit: string | undefined, fallback: string) {
  return commit ? commit.slice(0, 10) : fallback;
}

function issueURL(repositoryURL: string, title: string, body: string) {
  const query = new URLSearchParams({ title, body });
  return `${repositoryURL}/issues/new?${query}`;
}

function ConnectionList({ items, empty }: { items: KnowledgeConnection[]; empty: string }) {
  const { t, i18n } = useFeatureTranslation('reader');
  const language = useOptionalLanguage();
  const resolvedLocale = language?.resolvedLocale ?? resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  if (!items.length) return <p className="tag-knowledge-empty">{empty}</p>;
  return (
    <ul className="tag-knowledge-list">
      {items.map((item, index) => {
        const href = sourcePath(item);
        const label = item.label || (item.targetTagId
          ? t('tagKnowledge.tagId', { id: formatNumber(resolvedLocale, item.targetTagId) })
          : item.sourceKind
            ? `${item.sourceKind} #${item.sourceId}`
            : t('tagKnowledge.unnamedConnection'));
        return (
          <li key={`${item.projectId || item.kind}:${item.sourceCommit || ''}:${item.path || ''}:${item.line || 0}:${index}`}>
            <div>
              {href ? <Link to={href}>{label}</Link> : item.targetTagId ? <Link to={tagReadPath(item.targetTagId, label)}>{label}</Link> : <strong>{label}</strong>}
              {item.relation ? <span className="tag-knowledge-relation">{item.relation}</span> : null}
            </div>
            <small>{item.sourceAnchorId ? `#${item.sourceAnchorId} · ` : ''}{item.path ? `${item.path}:${item.line || 1} · ` : ''}{compactCommit(item.sourceCommit, t('tagKnowledge.noPublicRevision'))}</small>
          </li>
        );
      })}
    </ul>
  );
}

export default function TagKnowledgeConnections({ tagId, displayName, parentTags, repositoryState }: Props) {
  const { t, i18n } = useFeatureTranslation('reader');
  const language = useOptionalLanguage();
  const resolvedLocale = language?.resolvedLocale ?? resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const location = useLocation();
  const [hierarchy, setHierarchy] = useState<CanonicalTagConnections | null>(null);
  const [pages, setPages] = useState<Partial<Record<KnowledgeView, KnowledgePage>>>({});
  const [citation, setCitation] = useState<KnowledgeCitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyView, setBusyView] = useState<KnowledgeView | ''>('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [candidate, setCandidate] = useState<PublicationCandidate | null>(null);
  const [requires, setRequires] = useState<TagStatement[]>([]);
  const [requiredBy, setRequiredBy] = useState<TagStatement[]>([]);
  const candidateCommit = useMemo(() => new URLSearchParams(location.search).get('candidate')?.trim().toLowerCase() || '', [location.search]);
  const publicTagURL = useMemo(() => new URL(location.pathname, window.location.origin).toString(), [location.pathname]);
  const repositoryURL = giteaPath('tags', tagId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPages({});
    setCitation(null);
    void Promise.all(knowledgeViews.map((view) => loadCanonicalTagConnections(tagId, view).then((result) => [view, result] as const)))
      .then((results) => {
        if (cancelled) return;
        const next: Partial<Record<KnowledgeView, KnowledgePage>> = {};
        for (const [view, result] of results) {
          if (result.knowledge) next[view] = result.knowledge;
        }
        setHierarchy(results[0]?.[1] || null);
        setPages(next);
        if (results.some(([, result]) => result.knowledgeUnavailable)) setError(t('tagKnowledge.connectionUnavailable'));
      })
      .catch(() => {
        if (!cancelled) setError(t('tagKnowledge.connectionUnavailable'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void loadCanonicalTagCitation(tagId).then((value) => {
      if (!cancelled) setCitation(value);
    }).catch(() => undefined);
    void Promise.all([loadTagStatements(tagId, 'requires'), loadTagStatements(tagId, 'required-by')]).then(([forward, reverse]) => { if (!cancelled) { setRequires(forward); setRequiredBy(reverse); } }).catch(() => undefined);
    if (/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(candidateCommit)) {
      void loadTagPublicationCandidate(tagId, candidateCommit).then((value) => { if (!cancelled) setCandidate(value); }).catch(() => { if (!cancelled) setAnnouncement(t('tagKnowledge.candidateUnavailable')); });
    } else {
      setCandidate(null);
    }
    return () => { cancelled = true; };
  }, [candidateCommit, tagId, t]);

  const relationTagNames = useMemo(() => {
    const names = new Map<number, string>();
    parentTags.forEach((parent) => names.set(Number(parent.tagId), parent.displayName || parent.slugName));
    hierarchy?.parentTags?.forEach((tag) => names.set(tag.id, tag.displayName));
    hierarchy?.childTags?.forEach((tag) => names.set(tag.id, tag.displayName));
    requires.forEach((item) => {
      if (item.objectTagDisplayName) names.set(item.objectTagId, item.objectTagDisplayName);
      if (item.contextTagId && item.contextTagDisplayName) names.set(item.contextTagId, item.contextTagDisplayName);
    });
    requiredBy.forEach((item) => {
      if (item.subjectTagDisplayName) names.set(item.subjectTagId, item.subjectTagDisplayName);
      if (item.contextTagId && item.contextTagDisplayName) names.set(item.contextTagId, item.contextTagDisplayName);
    });
    return names;
  }, [hierarchy, parentTags, requiredBy, requires]);

  const relationTagLink = (id: number, key: string | number) => {
    const name = relationTagNames.get(id)?.trim() || '';
    const formattedID = formatNumber(resolvedLocale, id);
    return (
      <Link key={key} to={tagReadPath(id, name || `tag-${id}`)}>
        {name ? <><span>{name}</span><small>ID {formattedID}</small></> : t('tagKnowledge.tagId', { id: formattedID })}
      </Link>
    );
  };

  const relationContext = (id: number) => {
    const name = relationTagNames.get(id)?.trim() || '';
    const formattedID = formatNumber(resolvedLocale, id);
    return name ? `${name} · ID ${formattedID}` : t('tagKnowledge.contextId', { id: formattedID });
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setAnnouncement(t('tagKnowledge.copied', { label }));
    } catch {
      setAnnouncement(t('tagKnowledge.copyFailed'));
    }
  };

  const loadMore = async (view: KnowledgeView) => {
    const cursor = pages[view]?.nextCursor;
    if (!cursor) return;
    setBusyView(view);
    try {
      const result = await loadCanonicalTagConnections(tagId, view, cursor);
      if (result.knowledge) setPages((current) => ({ ...current, [view]: { ...result.knowledge!, items: [...(current[view]?.items || []), ...result.knowledge!.items] } }));
    } catch {
      setAnnouncement(t('tagKnowledge.loadMoreFailed'));
    } finally {
      setBusyView('');
    }
  };

  const anchors = pages.anchors?.items || [];
  const reportBody = t('tagKnowledge.reportBody', {
    tag: displayName,
    id: formatNumber(resolvedLocale, tagId),
    revision: citation?.activeCommit || 'unknown',
    page: publicTagURL,
  });
  const actionButtons = (
    <div className="tag-knowledge-actions" aria-label={t('tagKnowledge.actions')}>
      {hierarchy ? <TagGovernancePanel tagId={tagId} displayName={displayName} version={hierarchy.tag.version} parentTags={parentTags} /> : null}
      <Tooltip content={t('tagKnowledge.reportIssue')}>
        <a className="tag-knowledge-icon-action tag-knowledge-report" aria-label={t('tagKnowledge.reportIssue')} href={issueURL(repositoryURL, t('tagKnowledge.correctionTitle', { tag: displayName }), reportBody)} target="_blank" rel="noreferrer"><AnimateCircleAlert data-tag-knowledge-icon="report" animateOnHover size={18} /></a>
      </Tooltip>
      <Tooltip content={t('tagKnowledge.source')}>
        <a className="tex-source-link tag-knowledge-icon-action tag-knowledge-source" aria-label={t('tagKnowledge.source')} href={repositoryURL} target="_blank" rel="noreferrer"><Icon data-tag-knowledge-icon="source" name="git" size={18} /></a>
      </Tooltip>
      {citation ? <Tooltip content={t('tagKnowledge.copyCurrent')}><AnimateButton unstyled className="tag-knowledge-icon-action" type="button" aria-label={t('tagKnowledge.copyCurrent')} onClick={() => void copyText(citation.current, t('tagKnowledge.currentCitation'))}><AnimateClipboard data-tag-knowledge-icon="copy-current" animateOnHover size={18} /></AnimateButton></Tooltip> : null}
      {citation ? <Tooltip content={t('tagKnowledge.copyRevision')}><AnimateButton unstyled className="tag-knowledge-icon-action" type="button" aria-label={t('tagKnowledge.copyRevision')} onClick={() => void copyText(citation.revision, t('tagKnowledge.revisionCitation'))}><AnimateHistory data-tag-knowledge-icon="copy-revision" animateOnHover size={18} /></AnimateButton></Tooltip> : null}
    </div>
  );

  return (
    <>
      <section className="panel tag-knowledge-maintenance-panel" aria-labelledby="tag-knowledge-maintenance-title">
        <div className="panel-heading">
          <span id="tag-knowledge-maintenance-title">{t('tagKnowledge.maintenanceTitle')}</span>
        </div>
        {actionButtons}
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </section>

      <section className="panel tag-knowledge-panel" aria-labelledby="tag-knowledge-title">
        <div className="panel-heading">
          <span id="tag-knowledge-title">{t('tagKnowledge.title')}</span>
        </div>
        {loading ? <p className="tag-knowledge-empty" role="status">{t('tagKnowledge.loading')}</p> : null}
        {error ? <p className="tag-knowledge-warning" role="status">{error}</p> : null}
        {candidate ? (
          <section className="tag-candidate-diagnostics" aria-labelledby="tag-candidate-title">
            <div><AnimateTerminal size={17} /><strong id="tag-candidate-title">{candidate.preview ? t('tagKnowledge.pullRequestPreview') : t('tagKnowledge.releaseCandidate')}</strong><code>{compactCommit(candidate.commit, t('tagKnowledge.noPublicRevision'))}</code></div>
            <p>{t('tagKnowledge.candidateState', { state: candidate.state, source: candidate.sourceRef })}</p>
            {candidate.diagnostics.length ? <ul>{candidate.diagnostics.map((item) => <li key={`${item.code}:${item.path || ''}:${item.line || 0}`}><code>{item.code}</code><span>{item.message}</span>{item.path ? <small>{item.path}:{item.line || 1}</small> : null}</li>)}</ul> : <p>{t('tagKnowledge.noDiagnostics')}</p>}
          </section>
        ) : null}
        {repositoryState && repositoryState !== 'active' ? <p className="tag-knowledge-repository-state" data-state={repositoryState}>{t(`tagKnowledge.repositoryState.${repositoryState}`)}</p> : null}

        <div className="tag-knowledge-section">
          <dl className="tag-relation-list">
            <div><dt>{t('tagKnowledge.parents')}</dt><dd className="tag-knowledge-chips">{(hierarchy?.parentTagIds || []).map((id) => relationTagLink(id, id))}{!hierarchy?.parentTagIds.length ? <span>{t('tagKnowledge.none')}</span> : null}</dd></div>
            {hierarchy?.childTagIds.length ? <div><dt>{t('tagKnowledge.children')}</dt><dd className="tag-knowledge-chips">{hierarchy.childTagIds.map((id) => relationTagLink(id, id))}</dd></div> : null}
            <div><dt>{t('tagKnowledge.prerequisites')}</dt><dd className="tag-knowledge-chips">{requires.length ? requires.map((item) => <Link key={item.id} to={tagReadPath(item.objectTagId, relationTagNames.get(item.objectTagId) || `tag-${item.objectTagId}`)}><span>{relationTagNames.get(item.objectTagId) || t('tagKnowledge.tagId', { id: formatNumber(resolvedLocale, item.objectTagId) })}</span>{relationTagNames.has(item.objectTagId) ? <small>ID {formatNumber(resolvedLocale, item.objectTagId)}</small> : null}{item.contextTagId ? <small>{relationContext(item.contextTagId)}</small> : null}</Link>) : <span>{t('tagKnowledge.none')}</span>}</dd></div>
            <div><dt>{t('tagKnowledge.dependants')}</dt><dd className="tag-knowledge-chips">{requiredBy.length ? requiredBy.map((item) => <Link key={item.id} to={tagReadPath(item.subjectTagId, relationTagNames.get(item.subjectTagId) || `tag-${item.subjectTagId}`)}><span>{relationTagNames.get(item.subjectTagId) || t('tagKnowledge.tagId', { id: formatNumber(resolvedLocale, item.subjectTagId) })}</span>{relationTagNames.has(item.subjectTagId) ? <small>ID {formatNumber(resolvedLocale, item.subjectTagId)}</small> : null}{item.contextTagId ? <small>{relationContext(item.contextTagId)}</small> : null}</Link>) : <span>{t('tagKnowledge.none')}</span>}</dd></div>
          </dl>
        </div>

        {pages.outgoing?.items.length ? <div className="tag-knowledge-section">
          <h3>{t('tagKnowledge.outgoing')}</h3>
          <ConnectionList items={pages.outgoing.items} empty="" />
          {pages.outgoing?.nextCursor ? <AnimateButton unstyled type="button" disabled={busyView === 'outgoing'} onClick={() => void loadMore('outgoing')}>{t('tagKnowledge.loadMore')}</AnimateButton> : null}
        </div> : null}
        {pages.backlinks?.items.length ? <div className="tag-knowledge-section">
          <h3>{t('tagKnowledge.backlinks')}</h3>
          <ConnectionList items={pages.backlinks.items} empty="" />
          {pages.backlinks?.nextCursor ? <AnimateButton unstyled type="button" disabled={busyView === 'backlinks'} onClick={() => void loadMore('backlinks')}>{t('tagKnowledge.loadMore')}</AnimateButton> : null}
        </div> : null}
        {pages.unresolved?.items.length ? <div className="tag-knowledge-section">
          <h3>{t('tagKnowledge.unresolved')}</h3>
          <ConnectionList items={pages.unresolved.items} empty="" />
          {pages.unresolved?.nextCursor ? <AnimateButton unstyled type="button" disabled={busyView === 'unresolved'} onClick={() => void loadMore('unresolved')}>{t('tagKnowledge.loadMore')}</AnimateButton> : null}
        </div> : null}
        {anchors.length ? (
          <div className="tag-knowledge-section">
            <h3>{t('tagKnowledge.anchors')}</h3>
            <ul className="tag-anchor-list">
              {anchors.map((anchor) => (
                <li key={anchor.anchorId}>
                  <code>{anchor.anchorId}</code><span>{anchor.anchorState}</span>
                  <AnimateButton unstyled type="button" onClick={() => void loadCanonicalTagCitation(tagId, anchor.anchorId).then((value) => copyText(value.current, t('tagKnowledge.anchorCitation'))).catch(() => setAnnouncement(t('tagKnowledge.anchorUnavailable')))}><AnimateClipboard animateOnHover size={16} />{t('tagKnowledge.cite')}</AnimateButton>
                  <a href={issueURL(repositoryURL, t('tagKnowledge.anchorCorrectionTitle', { tag: displayName, anchor: anchor.anchorId }), `${reportBody}\nAnchor: ${anchor.anchorId}`)} target="_blank" rel="noreferrer"><AnimateMessageCircleWarning animateOnHover size={16} />{t('tagKnowledge.correction')}</a>
                </li>
              ))}
            </ul>
            {pages.anchors?.nextCursor ? <AnimateButton unstyled type="button" disabled={busyView === 'anchors'} onClick={() => void loadMore('anchors')}>{t('tagKnowledge.loadMore')}</AnimateButton> : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
