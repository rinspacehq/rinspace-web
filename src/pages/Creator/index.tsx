import {
  AnimateChartSpline,
  AnimateKanban,
  AnimateLayoutDashboard,
  AnimateSidebar,
  AnimateSidebarContent,
  AnimateSidebarFooter,
  AnimateSidebarHeader,
  AnimateSidebarInset,
  AnimateSidebarMenu,
  AnimateSidebarMenuBadge,
  AnimateSidebarMenuButton,
  AnimateSidebarMenuItem,
  AnimateSidebarProvider,
  AnimateSidebarTrigger,
  Button,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useNoticeToasts,
} from 'components/ui';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Form } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import LoadingState from '@/components/LoadingState';
import { MathInline } from '@/components/MathText';
import TagPicker, { joinTagValues, splitTagValues } from '@/components/TagPicker';
import UserIdentity from '@/components/UserIdentity';
import BookProfileDialog from '@/features/publish/BookProfileDialog';
import { localizedErrorMessage } from '@/i18n/errors';
import { formatDate, formatNumber } from '@/i18n/format';
import { feedPresentationDate } from '@/i18n/feedPresentation';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import type { LocaleId } from '@/i18n/types';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { deleteContent, loadContentDetail, loadContentFeed, updateContent } from '@/services/domains/article';
import { loadCreatorContributions } from '@/services/domains/creator';
import { loadCurrentUserInfo, loadPersonalQuestionPage } from '@/services/domains/identity';
import { deleteQuestion, loadQuestionDetail, updateQuestion } from '@/services/domains/question';
import type { CurrentUserInfo, FeedItem, PersonalQuestionSummary, PostDetail, PublishContentType, QuestionTagInput } from '@/services/contracts';
import { blogEditPath } from '@/utils/blogBody';
import { contentEditDestination } from '@/utils/contentEditDestination';
import { contentTypeMetaChar } from '@/utils/contentTypeMeta';
import { bookWorkspacePath, contentPath, legacyTagPath, questionPath } from '@/utils/routes';
import {
  contentStatusForCreatorControls,
  creatorPageState,
  creatorSourceVisibility,
  type CreatorPageState,
  type CreatorSourceVisibility,
} from './publicationControls';
import ContentAnalyticsDashboard from '@/features/content-analytics/ContentAnalyticsDashboard';
import { loadCreatorAnalytics } from '@/features/content-analytics/api';
import CreatorContributionHeatmap from './CreatorContributionHeatmap';
import {
  creatorAnalyticsGranularity,
  currentCreatorPeriod,
  normalizeCreatorPeriod,
  type CreatorAnalyticsGranularity,
} from './creatorInsights';

type CreatorTab = 'blog' | 'book' | 'question' | 'discussion' | 'dynamic';
type CreatorView = 'home' | 'content' | 'analytics';
type EditingKey = `${CreatorTab}:${string}`;

function isOriginalStyleBook(item: FeedItem) {
  return item.book?.kind === 'original' || item.book?.kind === 'markdown' || item.book?.kind === 'typst';
}

type EditDraft = {
  title: string;
  body: string;
  tags: string;
};

type PendingDeleteAction =
  | { kind: 'feed'; tab: Exclude<CreatorTab, 'question'>; item: FeedItem }
  | { kind: 'question'; item: PersonalQuestionSummary };

const tabOrder: CreatorTab[] = ['blog', 'book', 'question', 'discussion', 'dynamic'];

const creatorViewLinks: Array<{ view: CreatorView; translationKey: string; to: string }> = [
  { view: 'home', translationKey: 'navigation.home', to: '/creator' },
  { view: 'content', translationKey: 'navigation.content', to: '/creator?view=content' },
  { view: 'analytics', translationKey: 'navigation.analytics', to: '/creator?view=analytics' },
];

function isCreatorTab(value: string | null): value is CreatorTab {
  return Boolean(value && tabOrder.some((tab) => tab === value));
}

function creatorView(value: string | null): CreatorView {
  if (value === 'content' || value === 'analytics') return value;
  return 'home';
}

function CreatorMetaCategory({ tab, label }: { tab: CreatorTab; label: string }) {
  return (
    <span
      className={`meta-category content-type-meta content-type-meta-${tab} creator-row-category`}
      title={label}
    >
      <span className="creator-row-category-token">
        <span className="char" aria-hidden="true">
          {contentTypeMetaChar(tab, label.slice(0, 1).toLowerCase())}
        </span>
        <span className="label">{label}</span>
      </span>
    </span>
  );
}

type CreatorTime = Readonly<{ dateTime: string; label: string }>;

function formattedCreatorTime(
  locale: LocaleId,
  date: Date,
  includeTime = true,
): CreatorTime | null {
  if (Number.isNaN(date.getTime())) return null;
  return {
    dateTime: date.toISOString(),
    label: formatDate(
      locale,
      date,
      includeTime
        ? { dateStyle: 'medium', timeStyle: 'short' }
        : { dateStyle: 'medium' },
    ),
  };
}

function creatorFeedTime(item: FeedItem, locale: LocaleId) {
  const date = feedPresentationDate(item);
  return date ? formattedCreatorTime(locale, date) : null;
}

function creatorQuestionTime(item: PersonalQuestionSummary, locale: LocaleId) {
  return item.created_at
    ? formattedCreatorTime(locale, new Date(item.created_at * 1000))
    : null;
}

type CreatorTagLink = {
  key: string;
  label: string;
  slug: string;
};

function feedTagLinks(tags: string[]): CreatorTagLink[] {
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((tag) => ({ key: tag, label: tag, slug: tag }));
}

function questionTagLinks(tags: PersonalQuestionSummary['tags']): CreatorTagLink[] {
  return tags
    .map((tag) => ({
      key: tag.slug || tag.name || tag.displayName,
      label: tag.displayName || tag.name || tag.slug,
      slug: tag.slug || tag.name || tag.displayName,
    }))
    .filter((tag) => tag.key && tag.label && tag.slug)
    .slice(0, 6);
}

function CreatorTagLinks({ tags, label }: { tags: CreatorTagLink[]; label: string }) {
  if (!tags.length) return null;
  return (
    <div className="creator-row-tags" aria-label={label}>
      {tags.map((tag) => (
        <Link key={tag.key} to={legacyTagPath(tag.slug)}>
          {tag.label}
        </Link>
      ))}
    </div>
  );
}

function splitTags(value: string) {
  return splitTagValues(value).slice(0, 6);
}

function questionTags(value: string): QuestionTagInput[] {
  return splitTags(value).map((tag) => ({
    slugName: tag,
    name: tag,
    displayName: tag,
    originalText: tag,
  }));
}

function feedPath(tab: CreatorTab, item: FeedItem) {
  if (tab === 'blog') return contentPath('blog', item.id, item.title);
  if (tab === 'book') return contentPath('book', item.id, item.title);
  if (tab === 'discussion') return contentPath('discussion', item.id, item.title);
  return contentPath('dynamic', item.id, item.title);
}

function questionItemPath(item: PersonalQuestionSummary) {
  return questionPath(item.question_id || item.id || item.url_title, item.title);
}

function feedEditType(tab: CreatorTab): PublishContentType {
  if (tab === 'book') return 'book';
  if (tab === 'discussion') return 'discussion';
  if (tab === 'dynamic') return 'dynamic';
  return 'blog';
}

function itemKey(tab: CreatorTab, id: string): EditingKey {
  return `${tab}:${id}`;
}

function CreatorPage() {
  const { t } = useFeatureTranslation('creator');
  const locale = useResolvedLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = creatorView(searchParams.get('view'));
  const requestedTab = searchParams.get('type');
  const activeTab: CreatorTab = isCreatorTab(requestedTab) ? requestedTab : 'blog';
  const analyticsGranularity = creatorAnalyticsGranularity(searchParams.get('granularity'));
  const analyticsPeriod = normalizeCreatorPeriod(analyticsGranularity, searchParams.get('period'));
  const [user, setUser] = useState<CurrentUserInfo | null>(null);
  const [blogs, setBlogs] = useState<FeedItem[]>([]);
  const [books, setBooks] = useState<FeedItem[]>([]);
  const [discussions, setDiscussions] = useState<FeedItem[]>([]);
  const [dynamics, setDynamics] = useState<FeedItem[]>([]);
  const [questions, setQuestions] = useState<PersonalQuestionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [editingKey, setEditingKey] = useState<EditingKey | ''>('');
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteAction | null>(null);
  const [quickEditPost, setQuickEditPost] = useState<PostDetail | null>(null);
  const [draft, setDraft] = useState<EditDraft>({
    title: '',
    body: '',
    tags: '',
  });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const tabLabel = (tab: CreatorTab) => t(`tabs.${tab}`);
  const activeViewLink = creatorViewLinks.find((item) => item.view === activeView);
  const activeViewLabel = activeViewLink
    ? t(activeViewLink.translationKey)
    : t('title');

  const counts = useMemo(() => ({
    blog: blogs.length,
    book: books.length,
    question: questions.length,
    discussion: discussions.length,
    dynamic: dynamics.length,
  }), [blogs.length, books.length, discussions.length, dynamics.length, questions.length]);

  const totalCount = useMemo(
    () => tabOrder.reduce((total, tab) => total + counts[tab], 0),
    [counts],
  );

  const recentItems = useMemo(() => {
    const feedRows = [
      ...blogs.map((item) => ({ key: `blog:${item.id}`, tab: 'blog' as const, title: item.title, path: feedPath('blog', item), time: item.updatedAt || item.createdAt || '', stamp: Date.parse(item.updatedAt || item.createdAt || '') || 0 })),
      ...books.map((item) => ({ key: `book:${item.id}`, tab: 'book' as const, title: item.title, path: feedPath('book', item), time: item.updatedAt || item.createdAt || '', stamp: Date.parse(item.updatedAt || item.createdAt || '') || 0 })),
      ...discussions.map((item) => ({ key: `discussion:${item.id}`, tab: 'discussion' as const, title: item.title, path: feedPath('discussion', item), time: item.updatedAt || item.createdAt || '', stamp: Date.parse(item.updatedAt || item.createdAt || '') || 0 })),
      ...dynamics.map((item) => ({ key: `dynamic:${item.id}`, tab: 'dynamic' as const, title: item.title, path: feedPath('dynamic', item), time: item.updatedAt || item.createdAt || '', stamp: Date.parse(item.updatedAt || item.createdAt || '') || 0 })),
    ];
    const questionRows = questions.map((item) => ({
      key: `question:${item.question_id || item.id}`,
      tab: 'question' as const,
      title: item.title,
      path: questionItemPath(item),
      time: item.created_at ? new Date(item.created_at * 1000).toISOString() : '',
      stamp: item.created_at ? item.created_at * 1000 : 0,
    }));
    return [...feedRows, ...questionRows].sort((left, right) => right.stamp - left.stamp).slice(0, 6);
  }, [blogs, books, discussions, dynamics, questions]);

  const selectContentTab = (next: string) => {
    if (!isCreatorTab(next)) return;
    const params = new URLSearchParams(searchParams);
    params.set('view', 'content');
    params.set('type', next);
    setSearchParams(params);
    setEditingKey('');
  };

  const selectAnalyticsGranularity = (next: CreatorAnalyticsGranularity) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', 'analytics');
    params.set('granularity', next);
    params.set('period', currentCreatorPeriod(next));
    setSearchParams(params);
  };

  const selectAnalyticsPeriod = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', 'analytics');
    params.set('granularity', analyticsGranularity);
    params.set('period', next);
    setSearchParams(params);
  };

  const loadCreator = async () => {
    setLoading(true);
    setError('');
    try {
      const current = await loadCurrentUserInfo();
      setUser(current);
      if (!current) {
        setBlogs([]);
        setBooks([]);
        setDiscussions([]);
        setDynamics([]);
        setQuestions([]);
        setContentLoaded(true);
      }
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useNoticeToasts({
    error, notice,
  });
  useEffect(() => {
    void loadCreator();
  }, []);

  useEffect(() => {
    if (!user || activeView === 'analytics' || contentLoaded) return undefined;
    let cancelled = false;
    const username = user.username;
    void Promise.all([
      loadContentFeed({ type: 'blog', username, page: 1, size: 50, includeDrafts: true }),
      loadContentFeed({ type: 'book', username, page: 1, size: 50, includeDrafts: true }),
      loadContentFeed({ type: 'forum', username, page: 1, size: 50, includeDrafts: true }),
      loadContentFeed({ type: 'status', username, page: 1, size: 50, includeDrafts: true }),
      loadPersonalQuestionPage({ username, page: 1, pageSize: 50 }),
    ]).then(([blogPage, bookPage, discussionPage, dynamicPage, questionPage]) => {
      if (cancelled) return;
      setBlogs(blogPage.items);
      setBooks(bookPage.items.filter(isOriginalStyleBook));
      setDiscussions(discussionPage.items);
      setDynamics(dynamicPage.items);
      setQuestions(questionPage.items);
      setContentLoaded(true);
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(localizedErrorMessage(err, 'creator.contentLoadFailed'));
        setContentLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeView, contentLoaded, user]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setTimeout(() => {
      if (activeView !== 'analytics') {
        const granularity: CreatorAnalyticsGranularity = 'month';
        void loadCreatorAnalytics(
          { granularity, period: currentCreatorPeriod(granularity) },
          { cacheScope: user.id },
        ).catch(() => undefined);
      }
      if (activeView !== 'home') {
        void loadCreatorContributions(user.username).catch(() => undefined);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeView, user]);

  const beginFeedEdit = async (tab: Exclude<CreatorTab, 'question'>, item: FeedItem) => {
    const key = itemKey(tab, item.id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const detail = await loadContentDetail(item.id);
      setEditingKey(key);
      setDraft({
        title: detail.title,
        body: detail.body,
        tags: detail.tags.join(', '),
      });
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.editLoadFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const beginQuestionEdit = async (item: PersonalQuestionSummary) => {
    const id = item.question_id || item.id;
    const key = itemKey('question', id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const detail = await loadQuestionDetail(item.url_title || id);
      setEditingKey(key);
      setDraft({
        title: detail.question.title,
        body: detail.body,
        tags: item.tags.map((tag) => tag.slug || tag.name || tag.displayName).filter(Boolean).join(', '),
      });
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.editLoadFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const submitFeedEdit = async (
    event: FormEvent,
    tab: Exclude<CreatorTab, 'question'>,
    item: FeedItem,
  ) => {
    event.preventDefault();
    const key = itemKey(tab, item.id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const updated = await updateContent(item.id, {
        type: feedEditType(tab),
        title: draft.title,
        body: draft.body,
        tags: splitTags(draft.tags),
      });
      const applyUpdate = (items: FeedItem[]) =>
        items.map((entry) => (entry.id === item.id ? { ...entry, title: updated.title, excerpt: updated.excerpt, tags: updated.tags } : entry));
      if (tab === 'blog') setBlogs(applyUpdate);
      if (tab === 'discussion') setDiscussions(applyUpdate);
      if (tab === 'dynamic') setDynamics(applyUpdate);
      setEditingKey('');
      setNotice(t('notice.contentSaved'));
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.saveFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const submitQuestionEdit = async (event: FormEvent, item: PersonalQuestionSummary) => {
    event.preventDefault();
    const id = item.question_id || item.id;
    const key = itemKey('question', id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const updated = await updateQuestion({
        id,
        title: draft.title,
        content: draft.body,
        tags: questionTags(draft.tags),
      });
      const nextQuestion = updated.question;
      setQuestions((items) =>
        items.map((entry) => (
          (entry.question_id || entry.id) === id
            ? {
                ...entry,
                title: nextQuestion?.title || draft.title,
                description: nextQuestion?.excerpt || draft.body,
                tags: (nextQuestion?.tags || splitTags(draft.tags)).map((tag) => ({
                  slug: tag,
                  name: tag,
                  displayName: tag,
                  postCount: 0,
                  parentTags: [],
                  usageExcerpt: '',
                })),
              }
            : entry
        )),
      );
      setEditingKey('');
      setNotice(t('notice.questionSaved'));
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.saveFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const removeFeedItem = async (
    tab: Exclude<CreatorTab, 'question'>,
    item: FeedItem,
  ) => {
    const key = itemKey(tab, item.id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await deleteContent(item.id);
      if (tab === 'blog') setBlogs((items) => items.filter((entry) => entry.id !== item.id));
      if (tab === 'book') setBooks((items) => items.filter((entry) => entry.id !== item.id));
      if (tab === 'discussion') setDiscussions((items) => items.filter((entry) => entry.id !== item.id));
      if (tab === 'dynamic') setDynamics((items) => items.filter((entry) => entry.id !== item.id));
      setNotice(t('notice.contentDeleted'));
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.deleteFailed'));
      throw err;
    } finally {
      setBusyKey('');
    }
  };

  const updateFeedPublishing = async (
    tab: Exclude<CreatorTab, 'question'>,
    item: FeedItem,
    nextPageState: CreatorPageState,
    nextSourceVisibility: CreatorSourceVisibility,
  ) => {
    const key = itemKey(tab, item.id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const detail = await loadContentDetail(item.id);
      const updated = await updateContent(item.id, {
        type: feedEditType(tab),
        status: contentStatusForCreatorControls(nextPageState, nextSourceVisibility),
        repositoryStatus: nextPageState,
        sourceVisibility: nextSourceVisibility,
        title: detail.title,
        body: detail.body,
        tags: detail.tags,
        coverUrl: detail.coverUrl,
        editor: detail.editor === 'markdown' ? 'markdown' : detail.editor === 'rin' ? 'rin' : undefined,
        markdownSource: detail.markdownSource || null,
        forumSection: detail.forumSection,
        forumPinned: detail.forumPinned,
        forumAnnouncement: detail.forumAnnouncement,
        book: detail.book,
      });
      const applyUpdate = (items: FeedItem[]) =>
        items.map((entry) => (
          entry.id === item.id
            ? {
                ...entry,
                title: updated.title,
                excerpt: updated.excerpt,
                tags: updated.tags,
                publishStatus: updated.publishStatus,
                repositoryStatus: updated.repositoryStatus,
                sourceVisibility: updated.sourceVisibility,
                updatedAt: updated.updatedAt,
                contentUpdatedAt: updated.contentUpdatedAt,
              }
            : entry
        ));
      if (tab === 'blog') setBlogs(applyUpdate);
      if (tab === 'book') setBooks(applyUpdate);
      if (tab === 'discussion') setDiscussions(applyUpdate);
      if (tab === 'dynamic') setDynamics(applyUpdate);
      setNotice(t('notice.publishingUpdated'));
    } catch (err) {
      setError(
        localizedErrorMessage(err, 'creator.publishingUpdateFailed'),
      );
    } finally {
      setBusyKey('');
    }
  };

  const removeQuestion = async (item: PersonalQuestionSummary) => {
    const id = item.question_id || item.id;
    const key = itemKey('question', id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await deleteQuestion({ id });
      setQuestions((items) => items.filter((entry) => (entry.question_id || entry.id) !== id));
      setNotice(t('notice.questionDeleted'));
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.deleteFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const confirmPendingDelete = async () => {
    const action = pendingDelete;
    if (!action) return;
    if (action.kind === 'feed') {
      await removeFeedItem(action.tab, action.item);
    } else {
      await removeQuestion(action.item);
    }
    setPendingDelete(null);
  };

  const beginQuickEdit = async (tab: 'blog' | 'book', item: FeedItem) => {
    const key = itemKey(tab, item.id);
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const detail = await loadContentDetail(item.id);
      setQuickEditPost(detail);
    } catch (err) {
      setError(localizedErrorMessage(err, 'creator.loadFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const applyQuickEdit = (saved: PostDetail) => {
    const update = (items: FeedItem[]) => items.map((item) => (item.id === saved.id ? saved : item));
    if (saved.type === 'blog') setBlogs(update);
    if (saved.type === 'book') setBooks(update);
    setQuickEditPost(saved);
    setNotice(t('notice.contentSaved'));
  };

  const renderDraft = (
    onSubmit: (event: FormEvent) => void,
    saving: boolean,
  ) => (
    <Form className="creator-edit-form" onSubmit={onSubmit}>
      <Form.Group controlId="creator-edit-title">
        <Form.Label>{t('edit.title')}</Form.Label>
        <Form.Control
          value={draft.title}
          maxLength={150}
          onChange={(event) => {
            const title = event.currentTarget.value;
            setDraft((current) => ({ ...current, title }));
          }}
        />
      </Form.Group>
      <Form.Group controlId="creator-edit-body">
        <Form.Label>{t('edit.body')}</Form.Label>
        <Form.Control
          as="textarea"
          rows={7}
          value={draft.body}
          onChange={(event) => {
            const body = event.currentTarget.value;
            setDraft((current) => ({ ...current, body }));
          }}
        />
      </Form.Group>
      <div className="creator-edit-grid">
        <Form.Group controlId="creator-edit-tags">
          <Form.Label>{t('edit.tags')}</Form.Label>
          <TagPicker
            value={splitTags(draft.tags)}
            onChange={(next) => setDraft((current) => ({ ...current, tags: joinTagValues(next) }))}
            disabled={saving}
            ariaLabel={t('content.tagsLabel')}
          />
        </Form.Group>
      </div>
      <div className="creator-edit-actions">
        <Button className="primary-button" type="submit" disabled={saving}>
          {saving ? t('edit.saving') : t('edit.save')}
        </Button>
        <Button className="secondary-link" type="button" onClick={() => setEditingKey('')}>
          {t('edit.cancel')}
        </Button>
      </div>
    </Form>
  );

  const renderFeedList = (tab: Exclude<CreatorTab, 'question'>, items: FeedItem[]) => {
    if (!items.length) {
      return (
        <div className="state-strip">
          {t('content.emptyType', { type: tabLabel(tab) })}
        </div>
      );
    }
    return (
      <div className="creator-list">
        {items.map((item) => {
          const key = itemKey(tab, item.id);
          const editing = editingKey === key;
          const saving = busyKey === key;
          const pageState = creatorPageState(item);
          const sourceVisibility = creatorSourceVisibility(item);
          const editDestination = contentEditDestination(item);
          const timeLabel = creatorFeedTime(item, locale);
          return (
            <article className="creator-row" key={key}>
              <div className="creator-row-main">
                <div className="creator-row-meta">
                  <CreatorMetaCategory tab={tab} label={tabLabel(tab)} />
                  <CreatorTagLinks tags={feedTagLinks(item.tags)} label={t('content.tagsLabel')} />
                  {timeLabel ? <time className="creator-row-time" dateTime={timeLabel.dateTime}>{timeLabel.label}</time> : null}
                </div>
                <Link to={feedPath(tab, item)}><MathInline text={item.title} /></Link>
                {item.excerpt ? <p><MathInline text={item.excerpt} /></p> : null}
              </div>
              <div className="creator-row-actions">
                {tab === 'blog' && editDestination === 'quick-edit' ? (
                  <Button className="secondary-link" type="button" disabled={saving} onClick={() => void beginQuickEdit('blog', item)}>
                    {saving ? t('common.opening') : t('common.edit')}
                  </Button>
                ) : tab === 'blog' ? (
                  <Link className="secondary-link" to={blogEditPath(item)}>
                    {t('common.edit')}
                  </Link>
                ) : tab === 'book' && editDestination === 'book-workspace' ? (
                  <Link className="secondary-link" to={bookWorkspacePath(item.id)}>
                    {t('common.edit')}
                  </Link>
                ) : tab === 'book' && editDestination === 'quick-edit' ? (
                  <Button className="secondary-link" type="button" disabled={saving} onClick={() => void beginQuickEdit('book', item)}>
                    {saving ? t('common.opening') : t('common.edit')}
                  </Button>
                ) : tab === 'book' ? (
                  <Link className="secondary-link" to={`/books/${encodeURIComponent(item.id)}/edit`}>
                    {t('common.edit')}
                  </Link>
                ) : (
                  <Button className="secondary-link" type="button" disabled={saving} onClick={() => void beginFeedEdit(tab, item)}>
                    {t('common.edit')}
                  </Button>
                )}
                <Select
                  className="creator-row-select"
                  value={sourceVisibility}
                  disabled={saving}
                  aria-label={tab === 'blog' || tab === 'book' ? t('content.sourceVisibility') : t('content.visibility')}
                  onChange={(event) => void updateFeedPublishing(
                    tab,
                    item,
                    pageState,
                    event.currentTarget.value === 'open' ? 'open' : 'private',
                  )}
                >
                  <option value="private">{t('common.private')}</option>
                  <option value="open">{t('common.public')}</option>
                </Select>
                <Select
                  className="creator-row-select"
                  value={pageState}
                  disabled={saving}
                  aria-label={t('content.pageStatus')}
                  onChange={(event) => void updateFeedPublishing(
                    tab,
                    item,
                    event.currentTarget.value === 'draft' ? 'draft' : 'published',
                    sourceVisibility,
                  )}
                >
                  <option value="draft">{t('common.draft')}</option>
                  <option value="published">{t('common.published')}</option>
                </Select>
                <Button className="secondary-link danger" type="button" disabled={saving} onClick={() => setPendingDelete({ kind: 'feed', tab, item })}>
                  {t('common.delete')}
                </Button>
              </div>
              {editing && tab !== 'blog' && tab !== 'book' ? renderDraft((event) => void submitFeedEdit(event, tab, item), saving) : null}
            </article>
          );
        })}
      </div>
    );
  };

  const renderQuestionList = () => {
    if (!questions.length) {
      return (
        <div className="state-strip">
          {t('content.emptyType', { type: tabLabel('question') })}
        </div>
      );
    }
    return (
      <div className="creator-list">
        {questions.map((item) => {
          const id = item.question_id || item.id;
          const key = itemKey('question', id);
          const editing = editingKey === key;
          const saving = busyKey === key;
          const timeLabel = creatorQuestionTime(item, locale);
          return (
            <article className="creator-row" key={key}>
              <div className="creator-row-main">
                <div className="creator-row-meta">
                  <CreatorMetaCategory tab="question" label={tabLabel('question')} />
                  <CreatorTagLinks tags={questionTagLinks(item.tags)} label={t('content.tagsLabel')} />
                  <span>
                    {t('content.answerCount', {
                      count: item.answer_count,
                      displayCount: formatNumber(locale, item.answer_count),
                    })}
                    {' · '}
                    {t('content.voteCount', {
                      count: item.vote_count,
                      displayCount: formatNumber(locale, item.vote_count),
                    })}
                  </span>
                  {timeLabel ? <time className="creator-row-time" dateTime={timeLabel.dateTime}>{timeLabel.label}</time> : null}
                </div>
                <Link to={questionItemPath(item)}><MathInline text={item.title} /></Link>
                {item.description ? <p><MathInline text={item.description} /></p> : null}
              </div>
              <div className="creator-row-actions">
                <Button className="secondary-link" type="button" disabled={saving} onClick={() => void beginQuestionEdit(item)}>
                  {t('common.edit')}
                </Button>
                <Button className="secondary-link danger" type="button" disabled={saving} onClick={() => setPendingDelete({ kind: 'question', item })}>
                  {t('common.delete')}
                </Button>
              </div>
              {editing ? renderDraft((event) => void submitQuestionEdit(event, item), saving) : null}
            </article>
          );
        })}
      </div>
    );
  };

  const renderOverview = () => (
    <div className="creator-workspace-view creator-overview" aria-label={t('overview.label')}>
      <CreatorContributionHeatmap username={user?.username || ''} />

      <section className="creator-overview-recent" aria-labelledby="creator-recent-heading">
        <div className="creator-section-heading">
          <h2 id="creator-recent-heading">{t('overview.recent')}</h2>
          <Link to="/creator?view=content">{t('overview.allContent')}</Link>
        </div>
        {!contentLoaded ? <div className="creator-panel-state"><LoadingState variant="compact" /></div> : recentItems.length ? (
          <div className="creator-recent-list">
            {recentItems.map((item) => (
              <Link className="creator-recent-row" to={item.path} key={item.key}>
                <CreatorMetaCategory tab={item.tab} label={tabLabel(item.tab)} />
                <strong><MathInline text={item.title} /></strong>
                {item.stamp ? <time dateTime={item.time}>{formattedCreatorTime(locale, new Date(item.stamp))?.label}</time> : null}
              </Link>
            ))}
          </div>
        ) : <div className="state-strip">{t('overview.empty')}</div>}
      </section>
    </div>
  );

  const renderContentManagement = () => (
    <section className="creator-workspace-view creator-content-management" aria-label={t('content.label')}>
      <Tabs value={activeTab} onValueChange={selectContentTab}>
        <div className="creator-content-toolbar">
          <TabsList className="creator-tabs" aria-label={t('content.typeLabel')}>
            {tabOrder.map((tab) => (
              <TabsTrigger value={tab} key={tab}>
                <span>{tabLabel(tab)}</span>
                <strong>{formatNumber(locale, counts[tab])}</strong>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="blog">{activeTab === 'blog' ? renderFeedList('blog', blogs) : null}</TabsContent>
        <TabsContent value="book">{activeTab === 'book' ? renderFeedList('book', books) : null}</TabsContent>
        <TabsContent value="question">{activeTab === 'question' ? renderQuestionList() : null}</TabsContent>
        <TabsContent value="discussion">{activeTab === 'discussion' ? renderFeedList('discussion', discussions) : null}</TabsContent>
        <TabsContent value="dynamic">{activeTab === 'dynamic' ? renderFeedList('dynamic', dynamics) : null}</TabsContent>
      </Tabs>
    </section>
  );

  const renderAnalytics = () => (
    <div className="creator-workspace-view creator-analytics" aria-label={t('analytics.label')}>
      <ContentAnalyticsDashboard
        userId={user?.id || ''}
        granularity={analyticsGranularity}
        period={analyticsPeriod}
        createdAt={user?.created_at || 0}
        onGranularityChange={selectAnalyticsGranularity}
        onPeriodChange={selectAnalyticsPeriod}
      />
    </div>
  );

  const renderViewIcon = (view: CreatorView) => {
    if (view === 'home') return <AnimateLayoutDashboard animateOnHover size={18} aria-hidden="true" />;
    if (view === 'content') return <AnimateKanban animateOnHover size={18} aria-hidden="true" />;
    return <AnimateChartSpline animateOnHover size={18} aria-hidden="true" />;
  };

  return (
    <>
      <Helmet title={`${activeViewLabel} - ${t('navigation:brandName')}`} />
      <SiteTopbar />

      <ConfirmActionDialog
        show={Boolean(pendingDelete)}
        title={t('delete.title')}
        description={t('delete.description', {
          title: pendingDelete?.item.title || '',
        })}
        details={
          pendingDelete?.kind === 'feed'
            ? [
                t('delete.feedRemoved', { type: tabLabel(pendingDelete.tab) }),
                pendingDelete.tab === 'blog' || pendingDelete.tab === 'book'
                  ? t('delete.sourceRemoved')
                  : t('delete.referencesHidden'),
              ]
            : [t('delete.questionImpact')]
        }
        confirmLabel={t('delete.confirm')}
        busy={Boolean(busyKey)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmPendingDelete()}
      />

      <BookProfileDialog
        open={Boolean(quickEditPost)}
        post={quickEditPost}
        user={user}
        variant={quickEditPost?.type === 'blog' ? 'article' : 'book'}
        onClose={() => setQuickEditPost(null)}
        onSaved={applyQuickEdit}
      />

      <AnimateSidebarProvider className="creator-workspace-shell">
        <AnimateSidebar label={t('navigation.label')}>
          <AnimateSidebarHeader className="creator-sidebar-header">
            <Link className="creator-sidebar-brand" to="/creator" aria-label={t('navigation.homeAria')}>
              <span className="creator-sidebar-brand-copy">{t('title')}</span>
            </Link>
            <AnimateSidebarTrigger />
          </AnimateSidebarHeader>
          <AnimateSidebarContent>
            <AnimateSidebarMenu>
              {creatorViewLinks.map((item) => (
                <AnimateSidebarMenuItem key={item.view}>
                  <AnimateSidebarMenuButton asChild isActive={activeView === item.view} tooltip={t(item.translationKey)}>
                    <Link to={item.to}>
                      {renderViewIcon(item.view)}
                      <span>{t(item.translationKey)}</span>
                      {item.view === 'content' && totalCount ? <AnimateSidebarMenuBadge>{formatNumber(locale, totalCount)}</AnimateSidebarMenuBadge> : null}
                    </Link>
                  </AnimateSidebarMenuButton>
                </AnimateSidebarMenuItem>
              ))}
            </AnimateSidebarMenu>
          </AnimateSidebarContent>
          <AnimateSidebarFooter className="creator-sidebar-footer">
            {user ? (
              <UserIdentity
                className="creator-sidebar-user"
                name={user.display_name || user.username}
                username={user.username}
                userId={user.id}
                imageUrl={user.avatar.custom || user.avatar.gravatar}
                rank={user.rank}
                variant="compact"
              />
            ) : null}
          </AnimateSidebarFooter>
        </AnimateSidebar>

        <AnimateSidebarInset className="creator-workspace-main">
          <div className="creator-mobile-toolbar"><AnimateSidebarTrigger /></div>
          {loading ? <div className="creator-workspace-loading"><LoadingState variant="compact" /></div> : null}
          {!loading && !user ? (
            <section className="creator-auth-state">
              <span>{t('auth.required')}</span>
              <Button asChild variant="primary"><Link to="/#login">{t('auth.signIn')}</Link></Button>
            </section>
          ) : null}
          {!loading && user && activeView === 'home' ? renderOverview() : null}
          {!loading && user && activeView === 'content' && !contentLoaded ? <div className="creator-workspace-loading"><LoadingState variant="compact" /></div> : null}
          {!loading && user && activeView === 'content' && contentLoaded ? renderContentManagement() : null}
          {!loading && user && activeView === 'analytics' ? renderAnalytics() : null}
        </AnimateSidebarInset>
      </AnimateSidebarProvider>
    </>
  );
}

export default CreatorPage;
