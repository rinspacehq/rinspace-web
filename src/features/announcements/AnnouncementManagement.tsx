import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import LoadingState from '@/components/LoadingState';
import { Button, Pagination, Surface } from '@/components/ui';
import { formatDate } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type { AdminContentPageResponse } from '@/services/contracts';
import { loadAdminContentPage, setAnnouncementPinned } from '@/services/domains/admin';
import { messageFromError } from '@/services/errors';
import { contentPath } from '@/utils/routes';

import { useAnnouncementAccess } from './useAnnouncementAccess';

export const announcementManagementPath = '/admin?view=content&section=announcements';
const writerState = { from: announcementManagementPath };
const pageSize = 20;

export function AnnouncementManagement({ access }: { access: ReturnType<typeof useAnnouncementAccess> }) {
  const { t } = useFeatureTranslation('discovery');
  const { t: adminT } = useFeatureTranslation('admin');
  const locale = useResolvedLocale();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<AdminContentPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinBusyId, setPinBusyId] = useState('');

  useEffect(() => {
    if (access.state !== 'allowed') return;
    let active = true;
    setLoading(true);
    setError('');
    void loadAdminContentPage({ type: 'announcement', status: 'published', page, pageSize })
      .then(data => { if (active) setResult(data); })
      .catch((reason: unknown) => {
        if (active) setError(messageFromError(reason, 'discovery.announcementsLoadFailed'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [access.accountKey, access.state, attempt, page]);

  const changePin = async (id: string, pinned: boolean) => {
    if (pinBusyId || access.state !== 'allowed') return;
    setPinBusyId(id);
    setPinError('');
    try {
      await setAnnouncementPinned(id, pinned);
      setResult(current => current ? {
        ...current,
        items: current.items.map(item => item.id === id ? { ...item, forumPinned: pinned } : item),
      } : current);
    } catch (reason) {
      setPinError(messageFromError(reason, 'discovery.announcementPinFailed'));
    } finally {
      setPinBusyId('');
    }
  };

  return (
    <Surface className="admin-panel">
      <header className="panel-heading large">
        <h2>{t('pages.announcement.heading')}</h2>
        {access.state === 'allowed' ? (
          <Link className="primary-button" to="/announcements/new" state={writerState}>
            {t('pages.announcement.new')}
          </Link>
        ) : null}
      </header>
      {access.state === 'loading' ? <LoadingState variant="strip" /> : access.state !== 'allowed' ? (
        <div className="state-strip" role="status">
          <p>{t(access.state === 'unavailable' ? 'pages.announcement.accessUnavailable' : 'pages.announcement.accessDenied')}</p>
          {access.state === 'unavailable' ? (
            <Button onClick={access.retry}>{t('common:actions.retry')}</Button>
          ) : null}
        </div>
      ) : loading ? <LoadingState variant="strip" /> : error ? (
        <div className="state-strip" role="alert">
          <p>{error}</p>
          <Button onClick={() => setAttempt(value => value + 1)}>{t('common:actions.retry')}</Button>
        </div>
      ) : (
        <>
          {pinError ? <div className="state-strip" role="alert">{pinError}</div> : null}
          {result?.items.map(item => {
            const detailPath = contentPath('announcement', item.id);
            const editPath = detailPath + '/edit';
            const publication = item.publishedAt || item.createdAt;
            return (
              <article className="admin-row" key={item.id}>
                <div className="admin-row-main">
                  <Link to={detailPath}>{item.title}</Link>
                  <div className="admin-row-meta">
                    {item.forumPinned ? <span>{t('pages.announcement.pinned')}</span> : null}
                    {publication ? (
                      <time dateTime={publication}>
                        {formatDate(locale, publication, { dateStyle: 'medium', timeZone: 'Asia/Shanghai' })}
                      </time>
                    ) : null}
                  </div>
                </div>
                <div className="admin-row-action-menu">
                  <Link className="admin-row-link-button" to={detailPath}>{adminT('shared.open')}</Link>
                  <Link className="admin-row-link-button" to={editPath} state={writerState}>{adminT('shared.edit')}</Link>
                  <Button
                    variant="ghost"
                    disabled={Boolean(pinBusyId)}
                    onClick={() => void changePin(item.id, !item.forumPinned)}
                  >
                    {pinBusyId === item.id ? adminT('shared.processing') : t(item.forumPinned
                      ? 'pages.announcement.unpin' : 'pages.announcement.pin')}
                  </Button>
                </div>
              </article>
            );
          })}
          {!result?.count ? <div className="state-strip">{t('pages.announcement.empty')}</div> : null}
          {result && (result.count > pageSize || page > 1) ? (
            <Pagination page={page} pageCount={Math.max(1, Math.ceil(result.count / pageSize))} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </Surface>
  );
}
