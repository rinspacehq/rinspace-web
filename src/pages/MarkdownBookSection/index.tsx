import { Icon, AnimateButton, useNoticeToasts } from 'components/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Spinner } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import { MathInline } from '@/components/MathText';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import LoadingState from '@/components/LoadingState';
import RinMilkdownEditor, { type RinMilkdownEditorHandle } from '@/components/RinMilkdownEditor';
import {
  repositoryAssetUrl,
  type RepositoryFileInput,
} from '@/components/milkdown/repositoryAssets';
import SiteTopbar from '@/components/SiteTopbarShell';
import { loadContentDetail, updateContent } from '@/services/domains/article';
import { loadMarkdownEditorSource } from '@/services/markdownEditorSource';
import type { BookMetadata, PostDetail } from '@/services/contracts';
import type { RinspaceUser } from '@/services/phoneAuth';
import { messageFromError } from '@/services/errors';
import { getCurrentUser } from '@/services/profile';
import {
  bodyFromMarkdownBookProject,
  markdownBookExcerpt,
  markdownBookProjectFromBody,
  updateMarkdownBookFile,
  type MarkdownBookProject,
} from '@/utils/markdownBook';
import { firstMarkdownHeading, markdownWithTitle } from '@/utils/markdownTitle';
import {
  makeMilkdownAutosaveKey,
  useMilkdownAutosave,
  type MilkdownAutosaveDraft,
} from '@/utils/milkdownAutosave';

function sameUserId(left: string | undefined | null, right: string | undefined | null) {
  const normalizedLeft = (left || '').trim().toLowerCase();
  const normalizedRight = (right || '').trim().toLowerCase();
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export default function MarkdownBookSectionPage() {
  const { t } = useFeatureTranslation('creation');
  const { postId = '', sectionId = '' } = useParams();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [user, setUser] = useState<RinspaceUser | null>(null);
  const [project, setProject] = useState<MarkdownBookProject | null>(null);
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [restoredRepositoryFiles, setRestoredRepositoryFiles] = useState<RepositoryFileInput[]>([]);
  const editorRef = useRef<RinMilkdownEditorHandle | null>(null);
  const resolveRepositoryAsset = useCallback(
    (path: string) => post ? repositoryAssetUrl(post, path) : path,
    [post],
  );

  useNoticeToasts({
    error,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotice('');
    setProject(null);
    void Promise.all([
      loadContentDetail(postId),
      getCurrentUser().catch(() => null),
    ])
      .then(async ([detail, currentUser]) => {
        if (cancelled) return;
        if (detail.type !== 'book' || detail.book?.kind !== 'markdown') {
          throw new Error(t('markdownSection.notMarkdownBook'));
        }
        const repositoryBody = detail.repositorySource
          ? await loadMarkdownEditorSource(detail)
          : detail.body;
        if (cancelled) return;
        const nextProject = markdownBookProjectFromBody(
          repositoryBody,
          detail.book.bookTitle || detail.title,
        );
        const file = nextProject.files.find((item) => item.id === sectionId);
        if (!file) {
          throw new Error(t('markdownSection.notFound'));
        }
        setPost(detail);
        setUser(currentUser);
        setProject(nextProject);
        setTitle(file.title);
        setDraft(markdownWithTitle(file.body, file.title));
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFromError(loadError, 'creation.markdownSectionLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, sectionId, t]);

  const file = useMemo(
    () => project?.files.find((item) => item.id === sectionId) || null,
    [project, sectionId],
  );
  const bookTitle = post?.book?.bookTitle || post?.title || t('markdownSection.bookFallback');
  const canEdit = Boolean(
    post &&
      post.type === 'book' &&
      post.book?.kind === 'markdown' &&
      sameUserId(user?.id, post.authorUid || post.authorId),
  );
  const canSave = Boolean(canEdit && editorReady && !saving && file && title.trim());
  const autosaveKey = useMemo(
    () => makeMilkdownAutosaveKey(user, 'markdown-book-section', `${postId}:${sectionId}`),
    [postId, sectionId, user],
  );

  const makeAutosaveDraft = useCallback((): MilkdownAutosaveDraft | null => {
    if (!file || !post) return null;
    const draftMarkdown = markdownWithTitle(draft, title);
    if (!draftMarkdown.trim() && !title.trim()) return null;
    return {
      version: 1,
      key: autosaveKey,
      kind: 'markdown-book-section',
      title,
      markdown: draftMarkdown,
      bookId: postId,
      sectionId,
      bookTitle,
      repositoryFiles: editorRef.current?.snapshotRepositoryFiles() || restoredRepositoryFiles,
      savedAt: Date.now(),
    };
  }, [autosaveKey, bookTitle, draft, file, post, postId, restoredRepositoryFiles, sectionId, title]);

  const applyAutosaveDraft = useCallback((autosaveDraft: MilkdownAutosaveDraft) => {
    if (
      autosaveDraft.kind !== 'markdown-book-section' ||
      autosaveDraft.bookId !== postId ||
      autosaveDraft.sectionId !== sectionId
    ) {
      return;
    }
    const nextTitle = autosaveDraft.title || firstMarkdownHeading(autosaveDraft.markdown) || title;
    setTitle(nextTitle);
    setDraft(markdownWithTitle(autosaveDraft.markdown, nextTitle));
    setRestoredRepositoryFiles(autosaveDraft.repositoryFiles || []);
  }, [postId, sectionId, title]);

  const {
    checked: autosaveChecked,
    notice: autosaveNotice,
    noticeTone: autosaveNoticeTone,
    markChanged: markAutosaveChanged,
    scheduleAutosave,
    saveNow,
    clearAutosave,
  } = useMilkdownAutosave({
    key: autosaveKey,
    user,
    userChecked: !loading,
    enabled: Boolean(file && canEdit && !loading),
    ready: editorReady && !saving,
    makeDraft: makeAutosaveDraft,
    applyDraft: applyAutosaveDraft,
  });

  const changeDraft = (value: string) => {
    setDraft(value);
    const heading = firstMarkdownHeading(value);
    if (heading && heading !== title) setTitle(heading);
    markAutosaveChanged();
  };

  useEffect(() => {
    if (!autosaveChecked || !editorReady || !canEdit) return;
    scheduleAutosave(8000);
  }, [autosaveChecked, canEdit, editorReady, scheduleAutosave, title]);

  const saveSection = async () => {
    if (!post || !project || !file || !canEdit) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveNow();
      if (editorRef.current?.hasPendingQuiver(draft)) {
        setError(t('markdownWriter.quiver.pendingPublish'));
        return;
      }
      const nextProject = updateMarkdownBookFile(project, file.id, title, draft);
      const book: BookMetadata = {
        ...(post.book || {
          kind: 'markdown',
          bookTitle,
          authors: [],
        }),
        kind: 'markdown',
        bookTitle,
      };
      const repositoryFiles = await editorRef.current?.collectRepositoryFiles(draft) || [];
      const saved = await updateContent(post.slug || post.id, {
        type: 'book',
        sourceCommit: post.pendingCommit || post.repositorySource?.commit,
        status: 'published',
        editor: 'markdown',
        title: post.title,
        body: bodyFromMarkdownBookProject(nextProject),
        excerpt: post.excerpt || markdownBookExcerpt(nextProject),
        tags: post.tags || [],
        coverUrl: post.coverUrl || '',
        repositoryFiles,
        book,
      });
      const savedProject = saved.publicationPending
        ? nextProject
        : markdownBookProjectFromBody(saved.body, bookTitle);
      const savedFile = savedProject.files.find((item) => item.id === file.id);
      setPost(saved);
      setProject(savedProject);
      if (savedFile) {
        setTitle(savedFile.title);
        setDraft(markdownWithTitle(savedFile.body, savedFile.title));
      }
      await editorRef.current?.clearPersistedRepositoryFiles();
      await clearAutosave();
      setNotice(t('markdownSection.saved'));
    } catch (saveError) {
      setError(messageFromError(saveError, 'creation.markdownSectionSaveFailed'));
    } finally {
      setSaving(false);
    }
  };
  const topbarNotice = notice || autosaveNotice;

  return (
    <>
      <Helmet title={`${title || t('markdownSection.documentFallback')} · ${t('navigation:brandName')}`} />
      <SiteTopbar />
      <main className="writer-shell markdown-writer-shell">
        <div className="writer-publish-bar book-writer-publish-bar workspace-section-editor-bar">
          <div className="book-writer-profile-strip">
            {post?.coverUrl ? (
              <img src={post.coverUrl} alt="" />
            ) : (
              <span aria-hidden="true"><Icon name="markdown" /></span>
            )}
            <div className="book-writer-profile-main">
              <em>{t('markdownSection.workspace')}</em>
              <strong><MathInline text={bookTitle} /></strong>
              <small>{post?.tags.length ? post.tags.join(' / ') : t('markdownSection.tagsManagedInProfile')}</small>
            </div>
            {file ? (
              <div className="writer-source-context writer-source-context-inline">
                <span>{t('markdownSection.entry')}</span>
                <strong>
                  <MathInline text={title || file.title} />
                </strong>
                <em>{file.path || t('markdownSection.updatesWholeBook')}</em>
              </div>
            ) : null}
          </div>
          <div className="writer-topbar-actions">
            {topbarNotice ? (
              <span className={!notice && autosaveNoticeTone === 'destructive' ? 'writer-inline-save-status warning' : 'writer-inline-save-status'}>
                {topbarNotice}
              </span>
            ) : null}
            <AnimateButton unstyled
              className="primary-button"
              type="button"
              disabled={!canSave}
              onClick={() => void saveSection()}
            >
              {saving ? (
                <>
                  <Spinner animation="border" size="sm" />
                  {t('markdownSection.saving')}
                </>
              ) : (
                <>
                  <Icon name="cloud-arrow-up" />
                  {t('markdownSection.save')}
                </>
              )}
            </AnimateButton>
          </div>
        </div>
        {loading ? (
          <LoadingState variant="strip" />
        ) : null}
        {!loading && canEdit && !autosaveChecked ? (
          <LoadingState variant="strip" />
        ) : null}
        {!loading && post && !canEdit ? (
          <Alert className="notice warning">{t('markdownSection.authorOnly')}</Alert>
        ) : null}
        {!loading && post && file && (!canEdit || autosaveChecked) ? (
          <section className="writer-frame markdown-writer-frame" aria-label={t('markdownSection.editor')}>
            <RinMilkdownEditor
              ref={editorRef}
              id="markdown-book-section-body"
              repositoryAssets
              repositoryFiles={restoredRepositoryFiles}
              assetNamespace={`markdown-book:${post.id}:${file.id}`}
              resolveRepositoryAssetUrl={resolveRepositoryAsset}
              value={draft}
              minHeight="560px"
              placeholder={t('markdownSection.placeholder')}
              ariaLabel={t('markdownSection.content')}
              readOnly={!canEdit || saving}
              onChange={changeDraft}
              onReady={setEditorReady}
              onError={setError}
            />
          </section>
        ) : null}
      </main>
    </>
  );
}
