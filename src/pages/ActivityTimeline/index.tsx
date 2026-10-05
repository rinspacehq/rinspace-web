import { Icon, AnimateButton, useNoticeToasts } from 'components/ui';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';

import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import { identityActivityLabel, identityDateLabel, identityObjectTypeLabel, type IdentityTranslation } from '@/features/identity/labels';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import type { LocaleId } from '@/i18n/types';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadActivityTimeline, loadActivityTimelineDetail } from '@/services/domains/activity';
import type { ActivityTimelineEntry, ActivityTimelineRevisionDetail, ActivityTimelineObjectInfo, RevisionObjectType } from '@/services/contracts';
import { answerPath, contentPath } from '@/utils/routes';

const objectTypeOptions: RevisionObjectType[] = [
  'question',
  'answer',
  'comment',
  'tag',
  'blog',
  'discussion',
  'dynamic',
  'forum',
  'status',
];

type DiffKind = 'equal' | 'insert' | 'delete';

type DiffOp<T> = {
  kind: DiffKind;
  value: T;
};

type InlineDiffPart = {
  kind: DiffKind;
  text: string;
};

type RevisionDiffRow = {
  kind: 'equal' | 'insert' | 'delete' | 'modify';
  oldLineNumber?: number;
  newLineNumber?: number;
  oldText?: string;
  newText?: string;
  oldParts?: InlineDiffPart[];
  newParts?: InlineDiffPart[];
};

type RevisionChangeSummary = {
  addedChars: number;
  deletedChars: number;
  addedLines: number;
  deletedLines: number;
};

function normalizeObjectType(value: string | null): RevisionObjectType {
  return objectTypeOptions.some((option) => option === value) ? (value as RevisionObjectType) : 'question';
}

function objectLink(info: ActivityTimelineObjectInfo | null, objectType: RevisionObjectType, objectId: string) {
  if (info?.objectType === 'question' && info.questionId) return contentPath('question', info.questionId);
  if (info?.objectType === 'answer' && info.questionId && info.answerId) {
    return answerPath(info.questionId, info.answerId);
  }
  if (objectType === 'tag' && info?.mainTagSlugName) return `/tags?q=${encodeURIComponent(info.mainTagSlugName)}`;
  if (objectType === 'blog') return contentPath('blog', objectId);
  if (objectType === 'discussion' || objectType === 'forum') return contentPath('discussion', objectId);
  if (objectType === 'dynamic' || objectType === 'status') return contentPath('dynamic', objectId);
  return '/search';
}

function entryTitle(t: IdentityTranslation, entry: ActivityTimelineEntry) {
  return identityActivityLabel(t, entry.activityType);
}

function textLength(value: string) {
  return Array.from(value || '').length;
}

function revisionDeltaLabel(
  t: IdentityTranslation,
  locale: LocaleId,
  current: ActivityTimelineRevisionDetail | null,
  previous: ActivityTimelineRevisionDetail | null,
) {
  if (!current) return '—';
  const summary = revisionChangeSummary(current, previous);
  if (!previous) return t('activity.newRevision', { displayCount: formatNumber(locale, summary.addedChars) });
  if (!summary.addedChars && !summary.deletedChars) return t('activity.sameLength');
  return t('activity.revisionDelta', {
    added: formatNumber(locale, summary.addedChars),
    deleted: formatNumber(locale, summary.deletedChars),
  });
}

function revisionTagsLabel(revision: ActivityTimelineRevisionDetail | null) {
  if (!revision?.tags.length) return '-';
  return revision.tags.map((tag) => tag.displayName || tag.slugName).join(' · ');
}

function revisionTextPreview(t: IdentityTranslation, revision: ActivityTimelineRevisionDetail | null) {
  if (!revision) return t('activity.noVersion');
  return revision.excerpt || revision.originalText || t('activity.emptyVersion');
}

function diffSequence<T>(oldItems: T[], newItems: T[], isEqual: (oldItem: T, newItem: T) => boolean): DiffOp<T>[] {
  const rows = oldItems.length;
  const columns = newItems.length;
  const matrix: number[][] = Array.from({ length: rows + 1 }, () => Array(columns + 1).fill(0));

  for (let oldIndex = rows - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = columns - 1; newIndex >= 0; newIndex -= 1) {
      matrix[oldIndex][newIndex] = isEqual(oldItems[oldIndex], newItems[newIndex])
        ? matrix[oldIndex + 1][newIndex + 1] + 1
        : Math.max(matrix[oldIndex + 1][newIndex], matrix[oldIndex][newIndex + 1]);
    }
  }

  const result: DiffOp<T>[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < rows && newIndex < columns) {
    if (isEqual(oldItems[oldIndex], newItems[newIndex])) {
      result.push({ kind: 'equal', value: oldItems[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (matrix[oldIndex + 1][newIndex] >= matrix[oldIndex][newIndex + 1]) {
      result.push({ kind: 'delete', value: oldItems[oldIndex] });
      oldIndex += 1;
    } else {
      result.push({ kind: 'insert', value: newItems[newIndex] });
      newIndex += 1;
    }
  }
  while (oldIndex < rows) {
    result.push({ kind: 'delete', value: oldItems[oldIndex] });
    oldIndex += 1;
  }
  while (newIndex < columns) {
    result.push({ kind: 'insert', value: newItems[newIndex] });
    newIndex += 1;
  }
  return result;
}

function coalesceInlineDiff(ops: DiffOp<string>[]) {
  const parts: InlineDiffPart[] = [];
  for (const op of ops) {
    const previous = parts[parts.length - 1];
    if (previous?.kind === op.kind) {
      previous.text += op.value;
    } else {
      parts.push({ kind: op.kind, text: op.value });
    }
  }
  return parts;
}

function inlineDiff(oldText: string, newText: string) {
  return coalesceInlineDiff(
    diffSequence(Array.from(oldText), Array.from(newText), (oldChar, newChar) => oldChar === newChar),
  );
}

function splitRevisionLines(text: string) {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function revisionDiffRows(
  current: ActivityTimelineRevisionDetail | null,
  previous: ActivityTimelineRevisionDetail | null,
): RevisionDiffRow[] {
  if (!current) return [];
  const oldLines = splitRevisionLines(previous?.originalText || '');
  const newLines = splitRevisionLines(current.originalText);
  const ops = diffSequence(oldLines, newLines, (oldLine, newLine) => oldLine === newLine);
  const rows: RevisionDiffRow[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let index = 0;

  while (index < ops.length) {
    if (ops[index].kind === 'equal') {
      rows.push({
        kind: 'equal',
        oldLineNumber,
        newLineNumber,
        oldText: ops[index].value,
        newText: ops[index].value,
      });
      oldLineNumber += 1;
      newLineNumber += 1;
      index += 1;
      continue;
    }

    const deleted: Array<{ text: string; lineNumber: number }> = [];
    const inserted: Array<{ text: string; lineNumber: number }> = [];
    while (index < ops.length && ops[index].kind !== 'equal') {
      if (ops[index].kind === 'delete') {
        deleted.push({ text: ops[index].value, lineNumber: oldLineNumber });
        oldLineNumber += 1;
      } else {
        inserted.push({ text: ops[index].value, lineNumber: newLineNumber });
        newLineNumber += 1;
      }
      index += 1;
    }

    const pairedCount = Math.min(deleted.length, inserted.length);
    for (let pairIndex = 0; pairIndex < pairedCount; pairIndex += 1) {
      const oldText = deleted[pairIndex].text;
      const newText = inserted[pairIndex].text;
      const parts = inlineDiff(oldText, newText);
      rows.push({
        kind: 'modify',
        oldLineNumber: deleted[pairIndex].lineNumber,
        newLineNumber: inserted[pairIndex].lineNumber,
        oldText,
        newText,
        oldParts: parts.filter((part) => part.kind !== 'insert'),
        newParts: parts.filter((part) => part.kind !== 'delete'),
      });
    }
    for (let deleteIndex = pairedCount; deleteIndex < deleted.length; deleteIndex += 1) {
      rows.push({
        kind: 'delete',
        oldLineNumber: deleted[deleteIndex].lineNumber,
        oldText: deleted[deleteIndex].text,
      });
    }
    for (let insertIndex = pairedCount; insertIndex < inserted.length; insertIndex += 1) {
      rows.push({
        kind: 'insert',
        newLineNumber: inserted[insertIndex].lineNumber,
        newText: inserted[insertIndex].text,
      });
    }
  }

  return rows;
}

function changedRevisionDiffRows(
  current: ActivityTimelineRevisionDetail | null,
  previous: ActivityTimelineRevisionDetail | null,
) {
  return revisionDiffRows(current, previous).filter((row) => row.kind !== 'equal');
}

function revisionChangeSummary(
  current: ActivityTimelineRevisionDetail | null,
  previous: ActivityTimelineRevisionDetail | null,
): RevisionChangeSummary {
  const summary: RevisionChangeSummary = {
    addedChars: 0,
    deletedChars: 0,
    addedLines: 0,
    deletedLines: 0,
  };
  for (const row of changedRevisionDiffRows(current, previous)) {
    if (row.kind === 'insert') {
      summary.addedLines += 1;
      summary.addedChars += textLength(row.newText || '');
      continue;
    }
    if (row.kind === 'delete') {
      summary.deletedLines += 1;
      summary.deletedChars += textLength(row.oldText || '');
      continue;
    }
    const addedChars = (row.newParts || [])
      .filter((part) => part.kind === 'insert')
      .reduce((total, part) => total + textLength(part.text), 0);
    const deletedChars = (row.oldParts || [])
      .filter((part) => part.kind === 'delete')
      .reduce((total, part) => total + textLength(part.text), 0);
    if (addedChars > 0) {
      summary.addedLines += 1;
      summary.addedChars += addedChars;
    }
    if (deletedChars > 0) {
      summary.deletedLines += 1;
      summary.deletedChars += deletedChars;
    }
  }
  return summary;
}

function revisionTitleChanged(
  current: ActivityTimelineRevisionDetail | null,
  previous: ActivityTimelineRevisionDetail | null,
) {
  if (!current || !previous) return false;
  return current.title !== previous.title;
}

function renderInlineParts(parts: InlineDiffPart[] | undefined, fallback: string) {
  const visibleParts = parts?.length ? parts : [{ kind: 'equal' as DiffKind, text: fallback }];
  return visibleParts.map((part, index) => (
    <span className={part.kind === 'equal' ? undefined : `revision-inline-${part.kind}`} key={`${part.kind}-${index}`}>
      {part.text || ' '}
    </span>
  ));
}

function revisionDiffLine(
  marker: '+' | '-' | '~',
  lineNumber: number | undefined,
  children: ReactNode,
  key?: string,
) {
  return (
    <div
      className={`revision-diff-line revision-diff-${marker === '+' ? 'insert' : marker === '-' ? 'delete' : 'modify'}`}
      key={key}
    >
      <span className="revision-diff-marker">{marker}</span>
      <span className="revision-diff-number">{lineNumber || ''}</span>
      <code>{children}</code>
    </div>
  );
}

function RevisionDiffView({
  current,
  previous,
  locale,
  t,
}: {
  current: ActivityTimelineRevisionDetail | null;
  previous: ActivityTimelineRevisionDetail | null;
  locale: LocaleId;
  t: IdentityTranslation;
}) {
  if (!current) return null;
  const changedRows = changedRevisionDiffRows(current, previous);
  const titleChanged = revisionTitleChanged(current, previous);
  const oldTags = revisionTagsLabel(previous);
  const newTags = revisionTagsLabel(current);
  const tagsChanged = Boolean(previous) && oldTags !== newTags;
  const summary = revisionChangeSummary(current, previous);

  return (
    <section>
      <span>{t('activity.specificChanges')}</span>
      <div className="revision-diff-box">
        <div className="revision-diff-summary">
          <strong>{t('activity.addedChars', { displayCount: formatNumber(locale, summary.addedChars) })}</strong>
          <strong>{t('activity.deletedChars', { displayCount: formatNumber(locale, summary.deletedChars) })}</strong>
          <span>
            {previous
              ? t('activity.lineSummary', {
                  added: formatNumber(locale, summary.addedLines),
                  deleted: formatNumber(locale, summary.deletedLines),
                })
              : t('activity.firstVersion')}
          </span>
        </div>
        {titleChanged ? (
          <div className="revision-field-diff">
            <span>{t('activity.titleField')}</span>
            <del>{previous?.title || t('activity.untitled')}</del>
            <ins>{current.title || t('activity.untitled')}</ins>
          </div>
        ) : null}
        {tagsChanged ? (
          <div className="revision-field-diff">
            <span>{t('activity.tagsField')}</span>
            <del>{oldTags}</del>
            <ins>{newTags}</ins>
          </div>
        ) : null}
        {!changedRows.length ? (
          <p className="revision-diff-empty">
            {titleChanged || tagsChanged ? t('activity.bodyUnchanged') : t('activity.noChanges')}
          </p>
        ) : (
          <div className="revision-diff-lines">
            {changedRows.map((row, index) => {
              if (row.kind === 'insert') {
                return revisionDiffLine('+', row.newLineNumber, row.newText || ' ', `insert-${row.newLineNumber || index}`);
              }
              if (row.kind === 'delete') {
                return revisionDiffLine('-', row.oldLineNumber, row.oldText || ' ', `delete-${row.oldLineNumber || index}`);
              }
              return (
                <div className="revision-diff-pair" key={`modify-${row.oldLineNumber || index}-${row.newLineNumber || index}`}>
                  {revisionDiffLine('-', row.oldLineNumber, renderInlineParts(row.oldParts, row.oldText || ' '))}
                  {revisionDiffLine('+', row.newLineNumber, renderInlineParts(row.newParts, row.newText || ' '))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function RevisionDetailCard({
  entry,
  current,
  previous,
  loading,
  error,
  locale,
  t,
}: {
  entry: ActivityTimelineEntry | null;
  current: ActivityTimelineRevisionDetail | null;
  previous: ActivityTimelineRevisionDetail | null;
  loading: boolean;
  error: string;
  locale: LocaleId;
  t: IdentityTranslation;
}) {
  return (
    <section className="activity-revision-detail">
      <div className="panel-heading">
        <span>{t('activity.revisionDetail')}</span>
        <strong>{entry ? `#${entry.revisionId}` : t('shared.notSelected')}</strong>
      </div>
      {loading ? (
        <LoadingState variant="compact" />
      ) : null}
      {!loading && !error ? (
        <>
          <dl className="detail-stats">
            <div>
              <dt>{t('activity.submitter')}</dt>
              <dd>{current?.author || entry?.userInfo?.display_name || '—'}</dd>
            </div>
            <div>
              <dt>{t('activity.time')}</dt>
              <dd>{current ? identityDateLabel(locale, current.createdAt) : '—'}</dd>
            </div>
            <div>
              <dt>{t('activity.change')}</dt>
              <dd>{revisionDeltaLabel(t, locale, current, previous)}</dd>
            </div>
            <div>
              <dt>{t('activity.tags')}</dt>
              <dd>{revisionTagsLabel(current)}</dd>
            </div>
          </dl>
          <div className="activity-revision-copy">
            <div>
              <span>{t('activity.note')}</span>
              <strong>{current?.reason || entry?.comment || t('activity.updatedContent')}</strong>
            </div>
            <RevisionDiffView current={current} previous={previous} locale={locale} t={t} />
            <section>
              <span>{t('activity.currentVersion')}</span>
              <p><MathInline text={revisionTextPreview(t, current)} /></p>
            </section>
            {previous ? (
              <section>
                <span>{t('activity.previousVersion')}</span>
                <p><MathInline text={revisionTextPreview(t, previous)} /></p>
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function ActivityTimelinePage() {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const objectType = normalizeObjectType(searchParams.get('object_type') || searchParams.get('objectType'));
  const objectId = searchParams.get('object_id') || searchParams.get('objectId') || '3';
  const requestedRevisionId = searchParams.get('revision_id') || searchParams.get('revisionId') || '';
  const [draftType, setDraftType] = useState<RevisionObjectType>(objectType);
  const [draftId, setDraftId] = useState(objectId);
  const [objectInfo, setObjectInfo] = useState<ActivityTimelineObjectInfo | null>(null);
  const [timeline, setTimeline] = useState<ActivityTimelineEntry[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState('');
  const [revisionDetail, setRevisionDetail] =
    useState<ActivityTimelineRevisionDetail | null>(null);
  const [previousRevisionDetail, setPreviousRevisionDetail] =
    useState<ActivityTimelineRevisionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useNoticeToasts({
    detailError, error,
  });
  useEffect(() => {
    setDraftType(objectType);
    setDraftId(objectId);
  }, [objectId, objectType]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSelectedRevisionId('');
    setRevisionDetail(null);
    setPreviousRevisionDetail(null);
    setDetailError('');
    setLoadedRequestKey('');

    void loadActivityTimeline({ objectType, objectId })
      .then((result) => {
        if (cancelled) return;
        setObjectInfo(result.objectInfo);
        setTimeline(result.timeline);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setObjectInfo(null);
          setTimeline([]);
          setError(localizedErrorMessage(loadError, 'identity.activityLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [objectId, objectType]);

  const title = useMemo(
    () => objectInfo?.title || `${identityObjectTypeLabel(t, objectType)} ${objectId}`,
    [objectId, objectInfo?.title, objectType, t],
  );
  const selectedIndex = timeline.findIndex((entry) => entry.revisionId === selectedRevisionId);
  const selectedEntry = selectedIndex >= 0 ? timeline[selectedIndex] : null;

  const loadRevisionDetail = useCallback((entry: ActivityTimelineEntry, index: number) => {
    const previous = timeline[index + 1];
    setSelectedRevisionId(entry.revisionId);
    setDetailLoading(true);
    setDetailError('');
    void loadActivityTimelineDetail({
      newRevisionId: entry.revisionId,
      oldRevisionId: previous?.revisionId,
    })
      .then((detail) => {
        setRevisionDetail(detail.newRevision);
        setPreviousRevisionDetail(detail.oldRevision);
      })
      .catch((loadError) => {
        setRevisionDetail(null);
        setPreviousRevisionDetail(null);
        setDetailError(localizedErrorMessage(loadError, 'identity.activityDetailLoadFailed'));
      })
      .finally(() => setDetailLoading(false));
  }, [timeline]);

  const toggleRevisionDetail = (entry: ActivityTimelineEntry, index: number) => {
    if (selectedRevisionId === entry.revisionId) {
      setSelectedRevisionId('');
      setRevisionDetail(null);
      setPreviousRevisionDetail(null);
      setDetailError('');
      setDetailLoading(false);
      return;
    }
    loadRevisionDetail(entry, index);
  };

  useEffect(() => {
    if (!timeline.length) return;
    const requestKey = `${objectType}:${objectId}:${requestedRevisionId || 'latest'}`;
    if (loadedRequestKey === requestKey) return;
    const requestedIndex = requestedRevisionId
      ? timeline.findIndex((entry) => entry.revisionId === requestedRevisionId)
      : -1;
    const index = requestedIndex >= 0 ? requestedIndex : 0;
    loadRevisionDetail(timeline[index], index);
    setLoadedRequestKey(requestKey);
  }, [loadRevisionDetail, loadedRequestKey, objectId, objectType, requestedRevisionId, timeline]);

  const updateParams = (nextType: RevisionObjectType, nextId: string) => {
    const normalizedId = nextId.trim();
    if (!normalizedId) return;
    setSearchParams({ object_type: nextType, object_id: normalizedId });
  };

  const submitLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams(draftType, draftId);
  };

  return (
    <>
      <Helmet title={`${title} - ${t('activity.titleSuffix')} - ${t('navigation:brandName')}`} />
      <SiteTopbar />

      <main className="activity-shell">
        <section className="panel directory-toolbar activity-toolbar">
          <div className="detail-kicker">
            <span>{t('activity.kicker')}</span>
            <strong>
              {loading
                ? t('shared.syncing')
                : t('activity.eventCount', { count: timeline.length, displayCount: formatNumber(locale, timeline.length) })}
            </strong>
          </div>
          <h1><MathInline text={title} /></h1>
          <p />
          <form
            className="directory-search activity-lookup-form"
            onSubmit={submitLookup}
          >
            <select value={draftType} onChange={(event) => setDraftType(event.currentTarget.value as RevisionObjectType)}>
              {objectTypeOptions.map((option) => (
                <option key={option} value={option}>{identityObjectTypeLabel(t, option)}</option>
              ))}
            </select>
            <input
              value={draftId}
              inputMode="numeric"
              placeholder={t('activity.objectId')}
              aria-label={t('activity.objectId')}
              onChange={(event) => setDraftId(event.currentTarget.value)}
            />
            <AnimateButton unstyled type="submit">
              <Icon name="clock-history" />
              {t('activity.viewHistory')}
            </AnimateButton>
          </form>
        </section>

        <section className="activity-grid">
          <article className="panel activity-board">
            <div className="panel-heading large">
              <div>
                <span>{t('activity.timeline')}</span>
                <strong>{identityObjectTypeLabel(t, objectInfo?.objectType || objectType)}</strong>
              </div>
              <Link to={objectLink(objectInfo, objectType, objectId)}>{t('activity.viewObject')}</Link>
            </div>

            {loading ? (
              <LoadingState variant="panel" />
            ) : null}
            {!loading && !error && !timeline.length ? (
              <div className="state-strip">{t('shared.noResults')}</div>
            ) : null}

            <div className="activity-list">
              {timeline.map((entry, index) => {
                const expanded = selectedRevisionId === entry.revisionId;
                return (
                  <div className={expanded ? 'activity-revision-item expanded' : 'activity-revision-item'} key={entry.activityId}>
                    <AnimateButton unstyled
                      aria-expanded={expanded}
                      className={expanded ? 'activity-row active' : 'activity-row'}
                      type="button"
                      onClick={() => toggleRevisionDetail(entry, index)}
                    >
                      <span className="activity-row-date">{identityDateLabel(locale, entry.createdAt)}</span>
                      <div className="activity-row-body">
                        <div className="stream-card-head">
                          <span>{entryTitle(t, entry)}</span>
                          <strong>{entry.cancelled ? t('shared.cancelled') : t('shared.valid')}</strong>
                        </div>
                        <h2>{entry.comment || entryTitle(t, entry)}</h2>
                        <p>
                          {entry.userInfo?.display_name || entry.userInfo?.username || objectInfo?.displayName || 'Rinspace'}
                          {' · '}
                          {identityObjectTypeLabel(t, entry.objectType)}
                          {' #'}
                          {entry.objectId}
                        </p>
                      </div>
                      <span className="activity-row-toggle">
                        {expanded ? t('shared.collapse') : t('shared.expand')}
                      </span>
                    </AnimateButton>
                    {expanded ? (
                      <RevisionDetailCard
                        current={revisionDetail}
                        entry={entry}
                        error={detailError}
                        loading={detailLoading}
                        previous={previousRevisionDetail}
                        locale={locale}
                        t={t}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </article>

          <aside className="activity-side">
            <section className="panel">
              <div className="panel-heading">
                <span>{t('activity.object')}</span>
                <strong>{objectId}</strong>
              </div>
              <dl className="detail-stats">
                <div>
                  <dt>{t('activity.type')}</dt>
                  <dd>{identityObjectTypeLabel(t, objectInfo?.objectType || objectType)}</dd>
                </div>
                <div>
                  <dt>{t('activity.author')}</dt>
                  <dd>{objectInfo?.displayName || 'Rinspace'}</dd>
                </div>
                <div>
                  <dt>{t('activity.mainTag')}</dt>
                  <dd>{objectInfo?.mainTagSlugName || '—'}</dd>
                </div>
              </dl>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <span>{t('activity.entry')}</span>
                <strong>{t('activity.community')}</strong>
              </div>
              <div className="search-link-list">
                <Link to="/questions">{t('activity.questions')}</Link>
                <Link to="/tags">{t('activity.tagsLink')}</Link>
                <Link to="/">{t('activity.home')}</Link>
              </div>
            </section>
            <SiteIcpLink />
          </aside>
        </section>
      </main>
    </>
  );
}

export default ActivityTimelinePage;
