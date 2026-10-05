import { Icon, AnimateButton, useNoticeToasts } from 'components/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';

import { MathInline } from '@/components/MathText';
import LoadingState from '@/components/LoadingState';
import SiteTopbar from '@/components/SiteTopbarShell';
import PublicationProgressPanel from '@/components/PublicationProgressPanel';
import { PublicationProgressPoller, type PublicationProgress } from '@/services/publicationProgress';
import { openGiteaPath } from '@/utils/giteaPaths';
import BookProfileDialog from '@/features/publish/BookProfileDialog';
import { formatNumber } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadContentDetail, updateContent } from '@/services/domains/article';
import { loadBookImportJob, startBookImportJob } from '@/services/domains/book';
import type { BookImportJob, BookMetadata, BookTOCItem, PostDetail } from '@/services/contracts';
import { messageFromError } from '@/services/errors';
import { type RinspaceUser } from '@/services/phoneAuth';
import { getCurrentUser } from '@/services/profile';
import {
  buildBookProjectIndex,
  importBookProjectArchive,
  rinArchiveFromBody,
  type BookMatter,
  type BookProjectIndex,
} from '@/utils/bookProject';
import {
  addMarkdownBookFile,
  addMarkdownBookSection,
  bodyFromMarkdownBookProject,
  markdownBookExcerpt,
  markdownBookProjectFromBody,
  moveMarkdownBookFileNear,
  type MarkdownBookProject,
} from '@/utils/markdownBook';
import {
  bookReadingPath,
  bookWorkspacePath,
  contentPath,
} from '@/utils/routes';

type WorkspaceChapter = {
  id: string;
  title: string;
  source: 'reader' | 'toc' | 'source';
  page?: number;
  path?: string;
  command?: 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection';
  matter?: BookMatter;
  line?: number;
  level?: number;
  fileNode?: boolean;
};

type WorkspaceMatter = 'front' | 'main' | 'back';
type OriginalBookWorkspaceFormat = 'latex' | 'typst';
type DropTarget = {
  path: string;
  placement: 'before' | 'after';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sameUserId(
  left: string | undefined | null,
  right: string | undefined | null,
) {
  const normalizedLeft = (left || '').trim().toLowerCase();
  const normalizedRight = (right || '').trim().toLowerCase();
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  );
}

function extractMarkedSection(body: string, marker: string) {
  const startMarker = `[[${marker}]]`;
  const endMarker = `[[/${marker}]]`;
  const start = body.indexOf(startMarker);
  if (start < 0) return '';
  const end = body.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return '';
  return body.slice(start + startMarker.length, end).trim();
}

function stripLatexTitle(value: string) {
  return value
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function chapterSlug(value: string, fallback: string) {
  const slug = value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function tocChapterKey(index: number, item: BookTOCItem) {
  const page =
    typeof item.page === 'number' && Number.isFinite(item.page)
      ? Math.max(0, Math.trunc(item.page))
      : 0;
  return `toc-${String(index + 1).padStart(3, '0')}-p${page}-${chapterSlug(item.title, 'chapter')}`;
}

function readerChapters(body: string): WorkspaceChapter[] {
  const raw = extractMarkedSection(body, 'RIN_READER');
  if (!raw) return [];
  try {
    const payload: unknown = JSON.parse(raw);
    if (!isRecord(payload) || !Array.isArray(payload.toc)) return [];
    const chapters = payload.toc
      .map((item): WorkspaceChapter | null => {
        if (!isRecord(item)) return null;
        if (typeof item.id !== 'string' || typeof item.text !== 'string')
          return null;
        const level = typeof item.level === 'number' ? item.level : 2;
        return {
          id: item.id,
          title: item.text,
          source: 'reader',
          level,
        };
      })
      .filter((item): item is WorkspaceChapter => item !== null);
    if (chapters.length) return chapters;
    if (!Array.isArray(payload.pages)) return [];
    return payload.pages
      .map((item): WorkspaceChapter | null => {
        if (!isRecord(item)) return null;
        if (typeof item.id !== 'string' || typeof item.text !== 'string')
          return null;
        return {
          id: item.id,
          title: item.text,
          source: 'reader',
        };
      })
      .filter((item): item is WorkspaceChapter => item !== null);
  } catch {
    return [];
  }
}

function tocChapters(toc: BookTOCItem[] | undefined): WorkspaceChapter[] {
  if (!toc?.length) return [];
  const normalized = toc.map((item) => ({
    item,
    level: Math.max(1, Math.trunc(item.level || 1) || 1),
  }));
  const rootLevel = Math.min(...normalized.map((entry) => entry.level));
  return normalized
    .map((entry, index): WorkspaceChapter | null => {
      if (entry.level !== rootLevel) return null;
      return {
        id: tocChapterKey(index, entry.item),
        title: entry.item.title,
        page: entry.item.page,
        source: 'toc',
      };
    })
    .filter((item): item is WorkspaceChapter => item !== null);
}

function latexHeadingLevel(command: NonNullable<WorkspaceChapter['command']>) {
  return {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
  }[command];
}

function sourceCommandChapters(source: string) {
  const chapters: WorkspaceChapter[] = [];
  const pattern =
    /\\(part|chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const command = match[1] as NonNullable<WorkspaceChapter['command']>;
    const title =
      stripLatexTitle(match[2] || '') || `Chapter ${chapters.length + 1}`;
    chapters.push({
      id: `source-${command}-${String(chapters.length + 1).padStart(3, '0')}-${chapterSlug(title, 'chapter')}`,
      title,
      source: 'source',
      command,
      level: latexHeadingLevel(command),
    });
  }
  return chapters;
}

function sourceChapters(body: string): WorkspaceChapter[] {
  const source = extractMarkedSection(body, 'RIN_SOURCE');
  if (!source) return [];
  return sourceCommandChapters(source);
}

function workspaceChapters(post: PostDetail | null): WorkspaceChapter[] {
  if (!post) return [];
  const fromReader = readerChapters(post.body);
  if (fromReader.length) return fromReader;
  const fromToc = tocChapters(post.book?.toc);
  if (fromToc.length) return fromToc;
  return sourceChapters(post.body);
}

function projectIndexChapters(
  index: BookProjectIndex | null,
): WorkspaceChapter[] {
  if (!index) return [];
  return index.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    source: 'source',
    path: node.path,
    command: node.command,
    matter: node.matter,
    line: node.line,
    level: node.level,
    fileNode: node.fileNode,
  }));
}

function hasReaderPayload(post: PostDetail | null) {
  return readerPageCount(post) > 0;
}

function readerPageCount(post: PostDetail | null) {
  if (!post) return 0;
  try {
    const payload: unknown = JSON.parse(extractMarkedSection(post.body, 'RIN_READER'));
    return isRecord(payload) && Array.isArray(payload.pages) ? payload.pages.length : 0;
  } catch {
    return 0;
  }
}

function groupChapters(chapters: WorkspaceChapter[]) {
  const groups: Array<{
    key: WorkspaceMatter;
    items: WorkspaceChapter[];
  }> = [
    { key: 'front', items: [] },
    { key: 'main', items: [] },
    { key: 'back', items: [] },
  ];
  chapters.forEach((chapter) => {
    const matter: WorkspaceMatter =
      chapter.matter === 'front'
        ? 'front'
        : chapter.matter === 'back' || chapter.matter === 'appendix'
          ? 'back'
          : 'main';
    const group = groups.find((item) => item.key === matter);
    group?.items.push(chapter);
  });
  return groups;
}

function originalBookWorkspaceFormat(post: PostDetail | null): OriginalBookWorkspaceFormat {
  const editor = (post?.editor || '').trim().toLowerCase();
  if (editor === 'typst' || editor === 'typ') return 'typst';
  return 'latex';
}

export default function BookWorkspacePage() {
  const { postId = '' } = useParams();
  const { t, i18n } = useFeatureTranslation('creation');
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [publicationProgress, setPublicationProgress] = useState<PublicationProgress | null>(null);
  const [currentUser, setCurrentUser] = useState<RinspaceUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectIndex, setProjectIndex] = useState<BookProjectIndex | null>(
    null,
  );
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectNotice, setProjectNotice] = useState('');
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [importJob, setImportJob] = useState<BookImportJob | null>(null);
  const [activeImportJobID, setActiveImportJobID] = useState('');
  const [markdownProject, setMarkdownProject] =
    useState<MarkdownBookProject | null>(null);
  const [newMarkdownPageTitle, setNewMarkdownPageTitle] = useState('');
  const [newMarkdownSectionTitles, setNewMarkdownSectionTitles] = useState<
    Record<string, string>
  >({});
  const [dragChapterPath, setDragChapterPath] = useState('');
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragChapterPathRef = useRef('');
  const importJobStorageKey = useMemo(
    () => `rinspace-book-import-job:${postId}`,
    [postId],
  );

  useNoticeToasts({
    error, projectError, projectNotice,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPost(null);
    setError('');
    void Promise.all([
      loadContentDetail(postId),
      getCurrentUser().catch(() => null),
    ])
      .then(([detail, user]) => {
        if (cancelled) return;
        setPost(detail);
        setCurrentUser(user);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(messageFromError(loadError, 'creation.bookWorkspaceLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    if (post?.type !== 'book') return;
    let cancelled = false;
    setPublicationProgress(null);
    const poller = new PublicationProgressPoller(postId, (progress) => {
      if (cancelled) return;
      setPublicationProgress(progress);
      if (post.publicationPending && (!progress || progress.state === 'published')) {
        void loadContentDetail(postId).then((detail) => {
          if (!cancelled) setPost(detail);
        }).catch(() => undefined);
      }
    });
    poller.start();
    return () => {
      cancelled = true;
      poller.stop();
    };
  }, [postId, post?.type, post?.publicationPending]);

  useEffect(() => {
    let cancelled = false;
    setProjectIndex(null);
    setProjectError('');
    setProjectNotice('');
    if (!post || post.type !== 'book' || post.book?.kind !== 'original') {
      setProjectLoading(false);
      return undefined;
    }
    const archive = rinArchiveFromBody(post.body);
    if (!archive) {
      setProjectLoading(false);
      return undefined;
    }
    setProjectLoading(true);
    void importBookProjectArchive(archive)
      .then((loadedProject) => {
        if (!cancelled) {
          setProjectIndex(buildBookProjectIndex(loadedProject));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setProjectError(messageFromError(loadError, 'creation.bookProjectLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post]);

  useEffect(() => {
    if (!post || post.type !== 'book' || post.book?.kind !== 'markdown') {
      setMarkdownProject(null);
      return;
    }
    const nextProject = markdownBookProjectFromBody(
      post.body,
      post.book.bookTitle || post.title,
    );
    setMarkdownProject(nextProject);
  }, [post]);

  useEffect(() => {
    const savedJobID = window.localStorage.getItem(importJobStorageKey) || '';
    setActiveImportJobID(savedJobID);
    setImportJob(null);
  }, [importJobStorageKey]);

  const chapters = useMemo(() => {
    const fromProject = projectIndexChapters(projectIndex);
    return fromProject.length ? fromProject : workspaceChapters(post);
  }, [post, projectIndex]);
  const chapterGroups = useMemo(() => groupChapters(chapters), [chapters]);
  const visibleChapterGroups = useMemo(
    () => chapterGroups.filter((group) => group.items.length > 0),
    [chapterGroups],
  );
  const originalFormat = originalBookWorkspaceFormat(post);
  const title = post?.book?.bookTitle || post?.title || t('bookWorkspace.fallbackTitle');
  const overviewPath = post ? contentPath('book', post.id, title) : '/books';
  const readerPath = post ? bookReadingPath(post.id, title) : '/books';
  const editRef = encodeURIComponent(post?.slug || post?.id || postId);
  const profileEditPath = `/books/${editRef}/edit`;
  const canEdit = Boolean(
    post &&
    post.type === 'book' &&
    (post.book?.kind === 'original' ||
      post.book?.kind === 'markdown' ||
      post.book?.kind === 'typst') &&
    sameUserId(currentUser?.id, post.authorUid || post.authorId),
  );
  const importJobInProgress =
    Boolean(activeImportJobID) &&
    (!importJob ||
      importJob.status === 'queued' ||
      importJob.status === 'running');
  const readerReady = hasReaderPayload(post);
  const markdownReaderReady = Boolean(
    post?.book?.kind === 'markdown' &&
    (readerReady || extractMarkedSection(post.body, 'RIN_MARKDOWN_BOOK')),
  );
  const repositoryMarkdownBook = Boolean(post?.book?.kind === 'markdown'
    && !extractMarkedSection(post.body, 'RIN_MARKDOWN_BOOK'));
  const publishStatusKey = post?.publishStatus === 'draft'
    ? 'draft'
    : post?.publishStatus === 'private'
      ? 'private'
      : 'published';
  const countLabel = (
    kind: 'page' | 'file' | 'chapter' | 'node',
    count: number,
  ) => t(`bookWorkspace.counts.${kind}`, {
    count,
    displayCount: formatNumber(locale, count),
  });

  useEffect(() => {
    if (!activeImportJobID || !post || !canEdit) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const slug = post.slug || post.id;
    const poll = () => {
      void loadBookImportJob(slug, activeImportJobID)
        .then((job) => {
          if (cancelled) return;
          setImportJob(job);
          if (job.status === 'succeeded') {
            window.localStorage.removeItem(importJobStorageKey);
            setActiveImportJobID('');
            setProjectNotice(t('bookWorkspace.notices.renderPublished'));
            void loadContentDetail(slug)
              .then((detail) => {
                if (!cancelled) setPost(detail);
              })
              .catch((loadError) => {
                if (!cancelled) {
                  setProjectError(
                    messageFromError(loadError, 'creation.bookWorkspaceLoadFailed'),
                  );
                }
              });
            return;
          }
          if (job.status === 'failed') {
            window.localStorage.removeItem(importJobStorageKey);
            setActiveImportJobID('');
            console.error('Book import job failed', {
              jobId: job.id,
              detail: job.error,
            });
            setProjectError(
              messageFromError(null, 'creation.bookImportFailed'),
            );
            return;
          }
          timer = window.setTimeout(poll, 3500);
        })
        .catch((loadError) => {
          if (cancelled) return;
          setProjectError(
            messageFromError(loadError, 'creation.bookImportStatusFailed'),
          );
          timer = window.setTimeout(poll, 6000);
        });
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeImportJobID, canEdit, importJobStorageKey, post, t]);
  const setActiveDragChapterPath = (path: string) => {
    dragChapterPathRef.current = path;
    setDragChapterPath(path);
  };
  const clearActiveDragChapterPath = () => {
    dragChapterPathRef.current = '';
    setDragChapterPath('');
    setDropTarget(null);
  };

  const saveMarkdownProject = async (
    nextProject: MarkdownBookProject,
    notice: string,
  ) => {
    if (!post || !canEdit) return false;
    setProjectSaving(true);
    setProjectError('');
    setProjectNotice('');
    try {
      const book: BookMetadata = {
        ...(post.book || {
          kind: 'markdown',
          bookTitle: title,
          authors: [],
        }),
        kind: 'markdown',
        bookTitle: post.book?.bookTitle || post.title || title,
      };
      // Structural saves (chapter/section creation and reordering) do not
      // render: they persist the project as-is and keep the previous reader.
      const saved = await updateContent(post.slug || post.id, {
        type: 'book',
        status: post.publishStatus === 'draft' || post.publishStatus === 'private' ? post.publishStatus : 'published',
        editor: 'markdown',
        title: post.title,
        body: bodyFromMarkdownBookProject(nextProject),
        excerpt: post.excerpt || markdownBookExcerpt(nextProject),
        tags: post.tags || [],
        coverUrl: post.coverUrl || '',
        book,
      });
      setPost(saved);
      setMarkdownProject(nextProject);
      setProjectNotice(notice);
      return true;
    } catch (saveError) {
      setProjectError(
        messageFromError(saveError, 'creation.markdownStructureSaveFailed'),
      );
      return false;
    } finally {
      setProjectSaving(false);
    }
  };

  const createMarkdownPage = async () => {
    if (!markdownProject) return;
    const pageTitle = newMarkdownPageTitle.trim();
    if (!pageTitle) return;
    const nextProject = addMarkdownBookFile(markdownProject, pageTitle);
    setNewMarkdownPageTitle('');
    await saveMarkdownProject(
      nextProject,
      t('bookWorkspace.notices.chapterCreated', { title: pageTitle }),
    );
  };

  const setMarkdownSectionTitle = (parentId: string, value: string) => {
    setNewMarkdownSectionTitles((current) => ({
      ...current,
      [parentId]: value,
    }));
  };

  const createMarkdownSection = async (parentId: string) => {
    if (!markdownProject) return;
    const sectionTitle = (newMarkdownSectionTitles[parentId] || '').trim();
    if (!sectionTitle) return;
    const nextProject = addMarkdownBookSection(
      markdownProject,
      parentId,
      sectionTitle,
    );
    setMarkdownSectionTitle(parentId, '');
    await saveMarkdownProject(
      nextProject,
      t('bookWorkspace.notices.sectionCreated', { title: sectionTitle }),
    );
  };

  const reorderMarkdownFile = async (
    fromId: string,
    toId: string,
    placement: 'before' | 'after',
  ) => {
    if (!markdownProject || !fromId || !toId || fromId === toId) return;
    const previousProject = markdownProject;
    const nextProject = moveMarkdownBookFileNear(
      markdownProject,
      fromId,
      toId,
      placement,
    );
    if (nextProject === markdownProject) {
      clearActiveDragChapterPath();
      return;
    }
    setMarkdownProject(nextProject);
    const saved = await saveMarkdownProject(
      nextProject,
      t('bookWorkspace.notices.orderUpdated'),
    );
    if (!saved) setMarkdownProject(previousProject);
    clearActiveDragChapterPath();
  };

  const publishWholeProject = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !post || !canEdit) return;
    setProjectSaving(true);
    setError('');
    setProjectError('');
    setProjectNotice('');
    try {
      const slug = post.slug || post.id;
      const job = await startBookImportJob(slug, file);
      setImportJob(job);
      setActiveImportJobID(job.id);
      window.localStorage.setItem(importJobStorageKey, job.id);
      setProjectNotice(t('bookWorkspace.notices.renderSubmitted'));
    } catch (publishError) {
      setProjectError(messageFromError(publishError, 'creation.bookImportFailed'));
    } finally {
      setProjectSaving(false);
    }
  };

  return (
    <>
      <Helmet title={t('bookWorkspace.documentTitle', { title })} />
      <SiteTopbar />
      <main className="book-workspace-page">
        {loading ? <LoadingState variant="strip" /> : null}
        {!loading && error ? <Alert className="notice danger">{error}</Alert> : null}
        {!loading && post?.type === 'book' ? (
          <>
            <PublicationProgressPanel progress={publicationProgress} />
            {post.publicationPending && publicationProgress?.state !== 'failed' ? (
              <Alert className="notice warning">
                {t('common:publication.awaitingEvent.waiting')}
              </Alert>
            ) : null}
          </>
        ) : null}
        {!loading && post && post.type !== 'book' ? (
          <Alert className="notice danger">{t('bookWorkspace.notBook')}</Alert>
        ) : null}
        {!loading &&
        post?.type === 'book' &&
        post.book?.kind !== 'original' &&
        post.book?.kind !== 'markdown' &&
        post.book?.kind !== 'typst' ? (
          <Alert className="notice warning">
            {t('bookWorkspace.externalBookManagement')}
            <Link to={profileEditPath}>{t('bookWorkspace.editBookProfile')}</Link>
          </Alert>
        ) : null}
        {!loading && post?.type === 'book' && post.book?.kind === 'markdown' ? (
          <>
            <section className="book-workspace-hero book-workspace-hero--markdown">
              <div className="book-workspace-cover">
                {post.coverUrl ? (
                  <img src={post.coverUrl} alt="" />
                ) : (
                  <Icon name="markdown" />
                )}
              </div>
              <div className="book-workspace-identity">
                <span className="eyebrow">{t('bookWorkspace.markdownWorkspace')}</span>
                <h1>
                  <MathInline text={title} />
                </h1>
                <p>
                  <MathInline
                    text={post.excerpt || t('bookWorkspace.defaultMarkdownExcerpt')}
                  />
                </p>
                <div className="book-workspace-meta">
                  <span>{t(`bookWorkspace.publishStatus.${publishStatusKey}`)}</span>
                  <span>{post.author}</span>
                  <span>{countLabel('page', repositoryMarkdownBook ? readerPageCount(post) : markdownProject?.files.length || 0)}</span>
                  <span>
                    {markdownReaderReady
                      ? t('bookWorkspace.reader.generated')
                      : t('bookWorkspace.reader.notGenerated')}
                  </span>
                </div>
              </div>
              <div
                className="book-workspace-actions"
                aria-label={t('bookWorkspace.actions.label')}
              >
                <Link to={overviewPath}>
                  <Icon name="layout-text-sidebar-reverse" />
                  {t('bookWorkspace.actions.ratingPage')}
                </Link>
                {markdownReaderReady ? (
                  <Link to={readerPath}>
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPage')}
                  </Link>
                ) : (
                  <span className="disabled-action">
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPending')}
                  </span>
                )}
                {canEdit ? (
                  <AnimateButton unstyled type="button" onClick={() => openGiteaPath('b', post.id)}>
                    <Icon name="git" />
                    {t('bookWorkspace.actions.openRepository')}
                  </AnimateButton>
                ) : null}
                {canEdit ? (
                  <AnimateButton
                    unstyled
                    className="primary-workspace-action"
                    type="button"
                    onClick={() => setProfileDialogOpen(true)}
                  >
                    <Icon name="card-text" />
                    {t('bookWorkspace.actions.editProfile')}
                  </AnimateButton>
                ) : (
                  <span className="disabled-action">
                    <Icon name="lock" />
                    {t('bookWorkspace.actions.authorOnly')}
                  </span>
                )}
              </div>
            </section>

            <section className="book-workspace-layout reader-only">
              <article className="book-workspace-panel book-workspace-chapters">
                <div className="panel-heading">
                  <span>{t('bookWorkspace.markdown.chapters')}</span>
                  <strong>
                    {countLabel(repositoryMarkdownBook ? 'node' : 'file', repositoryMarkdownBook ? chapters.length : markdownProject?.files.length || 0)}
                  </strong>
                </div>
                
                
                {canEdit && !repositoryMarkdownBook ? (
                  <div className="book-workspace-section-heading">
                    <strong>{t('bookWorkspace.markdown.newChapter')}</strong>
                    <div className="book-workspace-section-tools">
                      <input
                        value={newMarkdownPageTitle}
                        aria-label={t('bookWorkspace.markdown.newChapterTitle')}
                        disabled={projectSaving}
                        onChange={(event) =>
                          setNewMarkdownPageTitle(event.currentTarget.value)
                        }
                      />
                      <AnimateButton unstyled
                        type="button"
                        disabled={projectSaving || !newMarkdownPageTitle.trim()}
                        onClick={() => void createMarkdownPage()}
                      >
                        {t('bookWorkspace.markdown.createChapter')}
                      </AnimateButton>
                    </div>
                  </div>
                ) : null}
                {repositoryMarkdownBook && chapters.length ? (
                  <ol className="book-workspace-chapter-list">
                    {chapters.map((chapter) => (
                      <li key={chapter.id} className="book-workspace-node">
                        <Link to={`${readerPath}#${encodeURIComponent(chapter.id)}`}>
                          <MathInline text={chapter.title} />
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : markdownProject?.files.length ? (
                  <ol className="book-workspace-chapter-list">
                    {markdownProject.files.map((file, index) => {
                      const editPath = `${bookWorkspacePath(post.id)}/markdown/${encodeURIComponent(file.id)}`;
                      const activeDropTarget = dropTarget;
                      const dropClass =
                        activeDropTarget && activeDropTarget.path === file.id
                          ? ` drop-${activeDropTarget.placement}`
                          : '';
                      const indent = file.level === 3 ? 2 : 0;
                      return (
                        <li
                          key={file.id}
                          className={`book-workspace-node depth-${indent}${dragChapterPath === file.id ? ' is-dragging' : ''}${dropClass}`}
                          onDragOver={(event) => {
                            const activeDragId =
                              dragChapterPathRef.current || dragChapterPath;
                            if (!activeDragId || projectSaving) return;
                            const dragged = markdownProject.files.find(
                              (item) => item.id === activeDragId,
                            );
                            if (
                              !dragged ||
                              dragged.level !== file.level ||
                              (dragged.parentId || '') !== (file.parentId || '')
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            const placement =
                              event.clientY > rect.top + rect.height / 2
                                ? 'after'
                                : 'before';
                            setDropTarget({ path: file.id, placement });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (projectSaving) return;
                            const fromId =
                              event.dataTransfer.getData('text/plain') ||
                              dragChapterPathRef.current ||
                              dragChapterPath;
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            const placement =
                              event.clientY > rect.top + rect.height / 2
                                ? 'after'
                                : 'before';
                            void reorderMarkdownFile(
                              fromId,
                              file.id,
                              placement,
                            );
                          }}
                          onDragLeave={() => {
                            if (dropTarget?.path === file.id)
                              setDropTarget(null);
                          }}
                        >
                          <div className="book-workspace-node-main">
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <strong>
                              <MathInline text={file.title} />
                            </strong>
                            <em>
                              {file.level === 3
                                ? t('bookWorkspace.markdown.section')
                                : t('bookWorkspace.markdown.chapter')} · {file.path}
                            </em>
                          </div>
                          <div
                            className={`book-workspace-node-actions markdown-node-actions${file.level === 2 && canEdit ? ' has-inline-section' : ''}`}
                          >
                            {file.level === 2 && canEdit ? (
                              <div className="book-workspace-inline-section">
                                <input
                                  value={
                                    newMarkdownSectionTitles[file.id] || ''
                                  }
                                  aria-label={t('bookWorkspace.markdown.newSectionTitle', {
                                    title: file.title,
                                  })}
                                  disabled={projectSaving}
                                  onChange={(event) =>
                                    setMarkdownSectionTitle(
                                      file.id,
                                      event.currentTarget.value,
                                    )
                                  }
                                />
                                <AnimateButton unstyled
                                  type="button"
                                  disabled={
                                    projectSaving ||
                                    !(
                                      newMarkdownSectionTitles[file.id] || ''
                                    ).trim()
                                  }
                                  onClick={() =>
                                    void createMarkdownSection(file.id)
                                  }
                                >
                                  {t('bookWorkspace.markdown.createSection')}
                                </AnimateButton>
                              </div>
                            ) : null}
                            {canEdit ? (
                              <>
                                <AnimateButton unstyled
                                  className="book-workspace-drag-handle"
                                  type="button"
                                  draggable={!projectSaving}
                                  disabled={projectSaving}
                                  aria-label={t('bookWorkspace.markdown.reorder')}
                                  title={t('bookWorkspace.markdown.reorder')}
                                  onDragStart={(event) => {
                                    if (projectSaving) return;
                                    setActiveDragChapterPath(file.id);
                                    setDropTarget(null);
                                    event.dataTransfer.effectAllowed = 'move';
                                    event.dataTransfer.setData(
                                      'text/plain',
                                      file.id,
                                    );
                                  }}
                                  onDragEnd={clearActiveDragChapterPath}
                                >
                                  <Icon name="grip-vertical" />
                                </AnimateButton>
                                <Link to={editPath}>
                                  <Icon name="pencil-square" />
                                  {t('bookWorkspace.markdown.edit')}
                                </Link>
                              </>
                            ) : null}
                            <Link
                              to={`${readerPath}#${encodeURIComponent(file.id)}`}
                            >
                              <Icon name="book" />
                              {t('bookWorkspace.markdown.read')}
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="book-workspace-empty">
                    <strong>{t('bookWorkspace.markdown.empty')}</strong>
                  </div>
                )}
              </article>
            </section>
          </>
        ) : null}
        {!loading && post?.type === 'book' && post.book?.kind === 'typst' ? (
          <>
            <section className="book-workspace-hero book-workspace-hero--typst">
              <div className="book-workspace-cover">
                {post.coverUrl ? (
                  <img src={post.coverUrl} alt="" />
                ) : (
                  <span className="typst-menu-mark" aria-hidden="true">
                    T
                  </span>
                )}
              </div>
              <div className="book-workspace-identity">
                <span className="eyebrow">{t('bookWorkspace.typstWorkspace')}</span>
                <h1>
                  <MathInline text={title} />
                </h1>
                <p>
                  <MathInline
                    text={post.excerpt || t('bookWorkspace.defaultTypstExcerpt')}
                  />
                </p>
                <div className="book-workspace-meta">
                  <span>{t(`bookWorkspace.publishStatus.${publishStatusKey}`)}</span>
                  <span>{post.author}</span>
                  <span>
                    {chapters.length
                      ? countLabel('chapter', chapters.length)
                      : t('bookWorkspace.typst.noChapters')}
                  </span>
                  <span>
                    {readerReady
                      ? t('bookWorkspace.reader.generated')
                      : t('bookWorkspace.reader.notGenerated')}
                  </span>
                </div>
              </div>
              <div
                className="book-workspace-actions"
                aria-label={t('bookWorkspace.actions.label')}
              >
                <Link to={overviewPath}>
                  <Icon name="layout-text-sidebar-reverse" />
                  {t('bookWorkspace.actions.ratingPage')}
                </Link>
                {readerReady ? (
                  <Link to={readerPath}>
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPage')}
                  </Link>
                ) : (
                  <span className="disabled-action">
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPending')}
                  </span>
                )}
                {canEdit ? (
                  <>
                    <AnimateButton
                      unstyled
                      className="primary-workspace-action"
                      type="button"
                      onClick={() => setProfileDialogOpen(true)}
                    >
                      <Icon name="card-text" />
                      {t('bookWorkspace.actions.editProfile')}
                    </AnimateButton>
                    <AnimateButton unstyled type="button" onClick={() => openGiteaPath('b', post.id)}>
                      <Icon name="git" />
                      {t('bookWorkspace.actions.openRepository')}
                    </AnimateButton>
                  </>
                ) : (
                  <span className="disabled-action">
                    <Icon name="lock" />
                    {t('bookWorkspace.actions.authorOnly')}
                  </span>
                )}
              </div>
            </section>

            <section className="book-workspace-layout reader-only">
              <article className="book-workspace-panel book-workspace-chapters">
                <div className="panel-heading">
                  <span>{t('bookWorkspace.typst.workspace')}</span>
                  <strong>
                    {chapters.length
                      ? countLabel('chapter', chapters.length)
                      : t('bookWorkspace.typst.emptyDirectory')}
                  </strong>
                </div>
                {chapters.length ? (
                  <ol className="book-workspace-chapter-list">
                    {chapters.map((chapter) => (
                      <li key={chapter.id} className="book-workspace-node">
                        <Link to={`${readerPath}#${encodeURIComponent(chapter.id)}`}>
                          <MathInline text={chapter.title} />
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="book-workspace-empty">
                    <strong>{t('bookWorkspace.typst.empty')}</strong>
                  </div>
                )}
              </article>
            </section>
          </>
        ) : null}
        {!loading && post?.type === 'book' && post.book?.kind === 'original' ? (
          <>
            <section className={`book-workspace-hero book-workspace-hero--${originalFormat}`}>
              <div className="book-workspace-cover">
                {post.coverUrl ? (
                  <img src={post.coverUrl} alt="" />
                ) : (
                  <Icon name="book" />
                )}
              </div>
              <div className="book-workspace-identity">
                <span className="eyebrow">
                  {t(`bookWorkspace.${originalFormat}Workspace`)}
                </span>
                <h1>
                  <MathInline text={title} />
                </h1>
                <p>
                  <MathInline
                    text={post.excerpt || t('bookWorkspace.defaultBookExcerpt')}
                  />
                </p>
                <div className="book-workspace-meta">
                  <span>{t(`bookWorkspace.publishStatus.${publishStatusKey}`)}</span>
                  <span>{post.author}</span>
                  <span>
                    {chapters.length
                      ? countLabel('chapter', chapters.length)
                      : t('bookWorkspace.original.noChapters')}
                  </span>
                  <span>
                    {readerReady
                      ? t('bookWorkspace.reader.generated')
                      : t('bookWorkspace.reader.notGenerated')}
                  </span>
                </div>
              </div>
              <div
                className="book-workspace-actions"
                aria-label={t('bookWorkspace.actions.label')}
              >
                <Link to={overviewPath}>
                  <Icon name="layout-text-sidebar-reverse" />
                  {t('bookWorkspace.actions.ratingPage')}
                </Link>
                {readerReady ? (
                  <Link to={readerPath}>
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPage')}
                  </Link>
                ) : (
                  <span className="disabled-action">
                    <Icon name="book" />
                    {t('bookWorkspace.actions.readingPending')}
                  </span>
                )}
                {canEdit ? (
                  <>
                    <AnimateButton
                      unstyled
                      className="primary-workspace-action"
                      type="button"
                      onClick={() => setProfileDialogOpen(true)}
                    >
                      <Icon name="card-text" />
                      {t('bookWorkspace.actions.editProfile')}
                    </AnimateButton>
                    <AnimateButton unstyled type="button" onClick={() => openGiteaPath('b', post.id)}>
                      <Icon name="git" />
                      {t('bookWorkspace.actions.openRepository')}
                    </AnimateButton>
                    <label
                      className={`primary-workspace-action book-workspace-import${projectSaving || projectLoading || importJobInProgress ? ' disabled-action' : ''}`}
                    >
                      <Icon name="cloud-arrow-up" />
                      {projectSaving
                        ? t('bookWorkspace.actions.uploading')
                        : importJobInProgress
                          ? t('bookWorkspace.actions.rendering')
                          : projectLoading
                            ? t('bookWorkspace.actions.loading')
                            : t('bookWorkspace.actions.importAndPublish')}
                      <input
                        type="file"
                        accept=".zip,.tar,.gz,.tgz,.tex,.ltx,application/zip,application/x-tar,application/gzip,text/x-tex,text/plain"
                        disabled={
                          projectSaving || projectLoading || importJobInProgress
                        }
                        onChange={(event) =>
                          void publishWholeProject(event.currentTarget)
                        }
                      />
                    </label>
                  </>
                ) : (
                  <span className="disabled-action">
                    <Icon name="lock" />
                    {t('bookWorkspace.actions.authorOnly')}
                  </span>
                )}
              </div>
            </section>

            <section className="book-workspace-layout reader-only">
              <article className="book-workspace-panel book-workspace-chapters">
                <div className="panel-heading">
                  <span>{t('bookWorkspace.original.workspace')}</span>
                  <strong>
                    {projectLoading
                      ? t('bookWorkspace.original.indexing')
                      : chapters.length
                        ? countLabel('node', chapters.length)
                        : t('bookWorkspace.original.emptyDirectory')}
                  </strong>
                </div>
                
                {importJobInProgress ? (
                  <Alert className="notice success">
                    {t('bookWorkspace.original.renderingImport', {
                      filename: importJob?.filename || t('bookWorkspace.original.wholeBook'),
                    })}
                  </Alert>
                ) : null}
                
                {projectIndex?.diagnostics.length ? (
                  <div className="book-workspace-diagnostics">
                    {projectIndex.diagnostics.slice(0, 4).map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                ) : null}
                {visibleChapterGroups.length ? (
                  <div className="book-workspace-section-groups">
                    {visibleChapterGroups.map((group) => (
                      <section
                        className="book-workspace-section-group"
                        key={group.key}
                      >
                        <div className="book-workspace-section-heading">
                          <strong>{t(`bookWorkspace.matter.${group.key}`)}</strong>
                          <div className="book-workspace-section-tools">
                            <span>{countLabel('node', group.items.length)}</span>
                          </div>
                        </div>
                        {group.items.length ? (
                          <ol className="book-workspace-chapter-list">
                            {group.items.map((chapter, index) => {
                              const indent = Math.max(
                                0,
                                Math.min(4, chapter.level ?? 0),
                              );
                              return (
                                <li
                                  key={`${chapter.source}-${chapter.id}`}
                                  className={`book-workspace-node depth-${indent}`}
                                >
                                  <div className="book-workspace-node-main">
                                    <span>
                                      {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <strong>
                                      <MathInline text={chapter.title} />
                                    </strong>
                                    <em>
                                      {chapter.command
                                        ? `\\${chapter.command}`
                                        : chapter.source === 'reader'
                                          ? t('bookWorkspace.original.sources.reader')
                                          : chapter.source === 'toc'
                                            ? t('bookWorkspace.original.sources.toc')
                                            : t(`bookWorkspace.original.sources.${originalFormat}`)}
                                      {chapter.path ? ` · ${chapter.path}` : ''}
                                      {chapter.page
                                        ? ` · p. ${chapter.page}`
                                        : ''}
                                      {chapter.fileNode === false
                                        ? ` · ${t('bookWorkspace.original.sources.sameFile')}`
                                        : ''}
                                    </em>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <div className="book-workspace-empty compact">
                            <strong>{t('bookWorkspace.original.emptyGroup')}</strong>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="book-workspace-empty">
                    <strong>{t('bookWorkspace.original.empty')}</strong>
                  </div>
                )}
              </article>
            </section>
          </>
        ) : null}
      </main>
      <BookProfileDialog
        open={profileDialogOpen}
        post={post}
        user={currentUser}
        onClose={() => setProfileDialogOpen(false)}
        onSaved={(saved) => setPost(saved)}
      />
    </>
  );
}
