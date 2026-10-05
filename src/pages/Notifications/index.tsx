import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/compat';
import { Icon, type IconName, AnimateButton, useNoticeToasts } from 'components/ui';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

import SiteTopbar from '@/components/SiteTopbarShell';
import AvatarName from '@/components/AvatarName';
import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import { identityDateLabel, identityNotificationActionLabel, identityObjectTypeLabel, type IdentityTranslation } from '@/features/identity/labels';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadNotificationPage, loadNotificationStatus, markAllNotificationReadState, markNotificationReadState, notifyNotificationStateChanged } from '@/services/domains/notification';
import type { NotificationPageInput, NotificationPageItem, NotificationPageResult, NotificationStatus } from '@/services/contracts';
import { contentPath, profilePath, tagReadOrLegacyPath } from '@/utils/routes';

type NotificationSection = NonNullable<NotificationPageInput['type']>;
type InboxFilter = NonNullable<NotificationPageInput['inboxType']>;

const inboxFilters: InboxFilter[] = ['all', 'posts', 'follows', 'likes', 'collections'];

function itemPath(item: NotificationPageItem) {
  if (item.href?.startsWith('/') && !item.href.startsWith('//')) return item.href;
  const targetType = item.objectInfo.objectType || item.targetType;
  const targetId = item.objectInfo.objectId || item.targetId;
  if (!targetId) return '/';

  if (targetType === 'question') return contentPath('question', targetId);
  if (targetType === 'blog') return contentPath('blog', targetId);
  if (targetType === 'book') return contentPath('book', targetId);
  if (targetType === 'discussion' || targetType === 'forum') return contentPath('discussion', targetId);
  if (targetType === 'dynamic' || targetType === 'status') return contentPath('dynamic', targetId);
  if (targetType === 'tag') return tagReadOrLegacyPath(targetId);
  if (targetType === 'user') return profilePath(targetId);
  return `/activity?object_type=${encodeURIComponent(targetType)}&object_id=${encodeURIComponent(targetId)}`;
}

function actorName(item: NotificationPageItem) {
  return item.userInfo?.displayName || item.userInfo?.username || 'Rinspace';
}

function actorProfilePath(item: NotificationPageItem) {
  const userRef = item.userInfo?.username || item.userInfo?.id;
  return userRef ? profilePath(userRef) : '';
}

function currentUnread(status: NotificationStatus | null, section: NotificationSection) {
  if (!status) return 0;
  return section === 'system' ? status.system : status.inbox;
}

function notificationSentence(t: IdentityTranslation, item: NotificationPageItem) {
  const actor = actorName(item);
  const target = identityObjectTypeLabel(t, item.objectInfo.objectType || item.targetType);
  switch (item.notificationAction) {
    case 'answer':
      return t('notifications.sentences.answer', { actor, target });
    case 'comment':
      return t('notifications.sentences.comment', { actor, target });
    case 'mention':
      return t('notifications.sentences.mention', { actor, target });
    case 'reply':
      return t('notifications.sentences.reply', { actor, target });
    case 'follow':
      return t('notifications.sentences.follow', { actor });
    case 'invite':
      return t('notifications.sentences.invite', { actor, target });
    case 'question':
      return t('notifications.sentences.question', { actor });
    case 'repost':
      return t('notifications.sentences.repost', { actor, target });
    case 'vote':
      return t('notifications.sentences.vote', { actor, target });
    case 'badge':
    case 'achievement':
      return t('notifications.sentences.badge', {
        action: identityNotificationActionLabel(t, item.notificationAction),
      });
    case 'moderation_first_review':
      return t('notifications.sentences.moderationFirstReview');
    case 'moderation_second_review_passed':
      return t('notifications.sentences.moderationSecondReviewPassed');
    case 'moderation_second_review_manual':
      return t('notifications.sentences.moderationSecondReviewManual');
    case 'moderation_manual_review_approved':
      return t('notifications.sentences.moderationManualApproved');
    case 'moderation_manual_review_rejected':
      return t('notifications.sentences.moderationManualRejected');
    case 'report_resolved':
      if (item.reportResult?.outcome === 'action_taken') return t('notifications.sentences.reportActionTaken');
      if (item.reportResult?.outcome === 'no_violation') return t('notifications.sentences.reportNoViolation');
      if (item.reportResult?.outcome === 'target_unavailable') return t('notifications.sentences.reportTargetUnavailable');
      return t('notifications.sentences.reportResolved');
    case 'wallet_tip_received':
      return t('notifications.sentences.walletTip', { actor });
    case 'wallet_recharge_completed':
      return t('notifications.sentences.walletRecharge');
    case 'wallet_conversion_completed':
      return t('notifications.sentences.walletConversion');
    default:
      return t('notifications.sentences.default', {
        actor,
        action: identityNotificationActionLabel(t, item.notificationAction),
      });
  }
}

function isModerationNotification(item: NotificationPageItem) {
  return item.notificationAction.startsWith('moderation_');
}

function isReportResolution(item: NotificationPageItem) {
  return item.notificationAction === 'report_resolved';
}

function shouldShowNotificationExcerpt(item: NotificationPageItem) {
  return (
    Boolean(item.objectInfo.excerpt?.trim()) &&
    ['comment', 'mention', 'reply'].includes(item.notificationAction)
  );
}

function actionIcon(value: string): IconName {
  switch (value) {
    case 'comment':
      return 'chat-dots';
    case 'mention':
      return 'at';
    case 'follow':
      return 'person-plus';
    case 'invite':
      return 'send';
    case 'repost':
      return 'repeat';
    case 'vote':
      return 'hand-thumbs-up';
    case 'badge':
    case 'achievement':
      return 'award';
    case 'wallet_tip_received':
      return 'star';
    case 'wallet_recharge_completed':
    case 'wallet_conversion_completed':
      return 'arrow-left-right';
    default:
      return 'bell';
  }
}

function NotificationsPage() {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const [section, setSection] = useState<NotificationSection>('inbox');
  const [inboxType, setInboxType] = useState<InboxFilter>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<NotificationPageResult | null>(null);
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const pageSize = 12;
  const pageCount = useMemo(() => {
    if (!result?.count) return 1;
    return Math.max(1, Math.ceil(result.count / result.pageSize));
  }, [result]);
  const unreadCount = currentUnread(status, section);

  const reload = useCallback(async () => {
    const [pageResult, nextStatus] = await Promise.all([
      loadNotificationPage({ page, pageSize, type: section, inboxType }),
      loadNotificationStatus(),
    ]);
    setResult(pageResult);
    setStatus(nextStatus);
    setError('');
  }, [inboxType, page, section]);

  useNoticeToasts({
    error, notice,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotice('');
    void reload()
      .catch((loadError) => {
        if (!cancelled) {
          setResult(null);
          setStatus(null);
          setError(localizedErrorMessage(loadError, 'identity.notificationsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const changeSection = (nextSection: NotificationSection) => {
    setSection(nextSection);
    setPage(1);
  };

  const changeInboxType = (nextInboxType: InboxFilter) => {
    setInboxType(nextInboxType);
    setPage(1);
  };

  const markItemRead = async (item: NotificationPageItem) => {
    if (item.isRead) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await markNotificationReadState(item.id);
      setResult((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)),
        };
      });
      setStatus(await loadNotificationStatus());
      notifyNotificationStateChanged();
    } catch (readError) {
      setError(localizedErrorMessage(readError, 'identity.notificationUpdateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await markAllNotificationReadState(section);
      await reload();
      notifyNotificationStateChanged();
      setNotice(t('notifications.markedAll', {
        section: t(`notifications.sections.${section}`),
      }));
    } catch (readError) {
      setError(localizedErrorMessage(readError, 'identity.notificationUpdateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const sectionItems: Array<{
    key: NotificationSection;
    icon: IconName;
    count: number;
  }> = [
    { key: 'inbox', icon: 'inbox', count: status?.inbox || 0 },
    { key: 'system', icon: 'bell', count: status?.system || 0 },
  ];

  const renderNotification = (item: NotificationPageItem) => {
    const reportResolution = isReportResolution(item);
    const actorHref = actorProfilePath(item);
    const actorAvatar = <AvatarName name={actorName(item)} imageUrl={item.userInfo?.avatar} size="sm" />;
    const objectTitle = item.targetType === 'wallet'
      ? t('notifications.walletTitle')
      : item.objectInfo.title || `${identityObjectTypeLabel(t, item.targetType)} #${item.targetId}`;
    return (
      <article className={`notification-row${item.isRead ? ' is-read' : ' is-unread'}${reportResolution ? ' is-system' : ''}`} key={item.id}>
        <div className="notification-avatar">
          {reportResolution ? (
            <span className="notification-system-mark" aria-label={t('notifications.system')}><Icon name="bell" /></span>
          ) : actorHref ? (
            <Link className="notification-actor-link" to={actorHref} aria-label={t('notifications.viewProfile', { name: actorName(item) })}>
              {actorAvatar}
            </Link>
          ) : (
            actorAvatar
          )}
        </div>
        <div className="notification-body">
          <div className="notification-row-head">
            <span className="notification-action-chip">
              <Icon name={actionIcon(item.notificationAction)} />
              {identityNotificationActionLabel(t, item.notificationAction)}
            </span>
            <strong>{identityObjectTypeLabel(t, item.objectInfo.objectType || item.targetType)}</strong>
            {!item.isRead ? <i className="notification-unread-dot" aria-label={t('notifications.unreadLabel')} /> : null}
          </div>
          <p className="notification-summary">{notificationSentence(t, item)}</p>
          {shouldShowNotificationExcerpt(item) ? (
            <blockquote className="notification-excerpt">
              <MathInline text={item.objectInfo.excerpt || ''} />
            </blockquote>
          ) : null}
          <h2>
            <Link to={itemPath(item)} onClick={() => void markItemRead(item)}>
              <MathInline text={objectTitle} />
            </Link>
          </h2>
          <p className="notification-meta">
            {actorHref && !reportResolution ? (
              <Link className="notification-meta-user" to={actorHref}>
                {actorName(item)}
              </Link>
            ) : (
              <span>{actorName(item)}</span>
            )}
            <span className="meta-dot">·</span>
            <span>
              {identityObjectTypeLabel(t, item.targetType)}
              {isModerationNotification(item) || reportResolution ? '' : ` #${item.targetId}`}
            </span>
          </p>
        </div>
        <div className="notification-side">
          <time>{identityDateLabel(locale, item.updateTime)}</time>
          <AnimateButton unstyled type="button" className="notification-read-button" onClick={() => void markItemRead(item)} disabled={busy || item.isRead}>
            {item.isRead ? t('notifications.read') : t('notifications.markRead')}
          </AnimateButton>
        </div>
      </article>
    );
  };

  return (
    <>
      <Helmet title={`${t('notifications.title')} - ${t('navigation:brandName')}`} />
      <SiteTopbar />

      <main className="notification-shell">
        <section className="notification-grid">
          <aside className="panel notification-sidebar">
            <div className="notification-sidebar-head">
              <strong>{t('notifications.center')}</strong>
              <span>
                {loading
                  ? t('shared.syncing')
                  : t('notifications.unread', { count: unreadCount, displayCount: formatNumber(locale, unreadCount) })}
              </span>
            </div>
            <nav className="notification-section-list" aria-label={t('notifications.sectionLabel')}>
              {sectionItems.map((item) => (
                <AnimateButton unstyled
                  type="button"
                  className={section === item.key ? 'active' : ''}
                  onClick={() => changeSection(item.key)}
                  key={item.key}
                >
                  <Icon name={item.icon} />
                  <span>{t(`notifications.sections.${item.key}`)}</span>
                  {item.count ? <strong>{formatNumber(locale, item.count)}</strong> : null}
                </AnimateButton>
              ))}
            </nav>
          </aside>
          <article className="panel notification-board">
            <div className="panel-heading large">
              <div>
                <span>{t(`notifications.sections.${section}`)}</span>
                <strong>
                  {loading
                    ? t('shared.syncing')
                    : t('notifications.summary', {
                        total: formatNumber(locale, result?.count ?? 0),
                        unread: formatNumber(locale, unreadCount),
                      })}
                </strong>
              </div>
              <Button className="secondary-button" type="button" onClick={() => void markAllRead()} disabled={busy || loading || unreadCount === 0}>
                {t('notifications.markAll')}
              </Button>
            </div>

            {section === 'inbox' ? (
              <nav className="notification-filters" aria-label={t('notifications.filtersLabel')}>
                {inboxFilters.map((filter) => (
                  <AnimateButton unstyled
                    key={filter}
                    type="button"
                    className={inboxType === filter ? 'active' : ''}
                    onClick={() => changeInboxType(filter)}
                  >
                    {t(`notifications.filters.${filter}`)}
                  </AnimateButton>
                ))}
              </nav>
            ) : null}
            {loading ? (
              <LoadingState variant="panel" />
            ) : null}
            {!loading && !error && !result?.items.length ? (
              <div className="state-strip">{t('shared.noResults')}</div>
            ) : null}

            <div className="notification-list">
              {result?.items.map(renderNotification)}
            </div>

            <div className="notification-pagination">
              <Button className="secondary-button" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
                {t('shared.previous')}
              </Button>
              <span>{t('shared.page', { page: formatNumber(locale, page), pageCount: formatNumber(locale, pageCount) })}</span>
              <Button className="secondary-button" type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount || loading}>
                {t('shared.next')}
              </Button>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}

export default NotificationsPage;
