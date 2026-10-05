import { useToast } from 'components/ui';
import type { Crepe } from '@milkdown/crepe';
import {
  MarkdownWriterPage,
  type MarkdownWriterHandle,
  type MarkdownWriterLabels,
  type MarkdownWriterPageLabels,
  type MarkdownWriterRefs,
} from '@rinspacehq/markdown-writer/page';
import '@rinspacehq/markdown-writer/writer.css';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { replaceAll } from '@milkdown/kit/utils';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Modal } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';

import CodeMirrorEditor from '@/components/CodeMirrorEditor';
import ImageCropDialog from '@/components/ImageCropDialog';
import LoadingState from '@/components/LoadingState';
import MilkdownMarkdownArticle from '@/components/MilkdownMarkdownArticle';
import { createMilkdownInteractions } from '@/components/milkdown/interactions';
import SiteTopbar from '@/components/SiteTopbarShell';
import TagPicker, { joinTagValues, splitTagValues } from '@/components/TagPicker';
import { normalizeMilkdownMathMarkdown } from '@/components/milkdown/mathMarkdown';
import {
  isRepositoryQuiverImageUrl,
  normalizeQuiverImages,
  renderTikzcdRepositoryDiagram,
  tikzcdDiagramSourceText,
} from '@/components/milkdown/quiver';
import {
  MilkdownRepositoryAssetHost,
  repositoryAssetUrl,
} from '@/components/milkdown/repositoryAssets';
import QuiverDialog from '@/components/milkdown/QuiverDialog';
import { useQuiverEditor } from '@/components/milkdown/useQuiverEditor';
import { i18n as appI18n } from '@/i18n';
import { localizedErrorMessage } from '@/i18n/errors';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { createContent, isContentModerationSubmission, loadContentDetail, updateContent } from '@/services/domains/article';
import { moveWorkItem } from '@/services/domains/identity';
import type { CreateContentInput, PostDetail } from '@/services/contracts';
import { getCurrentUser, uploadCoverFile } from '@/services/profile';
import { loadMarkdownEditorSource } from '@/services/markdownEditorSource';
import type { RinspaceUser } from '@/services/phoneAuth';
import {
  firstMarkdownHeading,
  markdownWithTitle,
  markdownWithoutDefaultTemplate,
} from '@/utils/markdownTitle';
import {
  MilkdownDraftSaveError,
  makeMilkdownAutosaveKey,
  useMilkdownAutosave,
  type MilkdownAutosaveDraft,
} from '@/utils/milkdownAutosave';
import {
  blogEditorKind,
  bodyFromMarkdownSource,
  excerptFromMarkdown,
  normalizeMarkdownWhitespaceEntities,
} from '@/utils/blogBody';
import { contentPath } from '@/utils/routes';

const defaultQuiverFrameSrc = '/quiver/?rinWriter=1';
function bodyHeadingOptions() {
  return [
    { label: appI18n.t('creation:markdownWriter.headings.paragraph'), level: null },
    { label: appI18n.t('creation:markdownWriter.headings.heading2'), level: 2 },
    { label: appI18n.t('creation:markdownWriter.headings.heading3'), level: 3 },
    { label: appI18n.t('creation:markdownWriter.headings.heading4'), level: 4 },
    { label: appI18n.t('creation:markdownWriter.headings.heading5'), level: 5 },
    { label: appI18n.t('creation:markdownWriter.headings.heading6'), level: 6 },
  ];
}

function markdownTopBarLabels() {
  return {
    toolbar: appI18n.t('creation:markdownWriter.topBar.toolbar'),
    heading: appI18n.t('creation:markdownWriter.topBar.heading'),
    items: [
      appI18n.t('creation:markdownWriter.topBar.bold'),
      appI18n.t('creation:markdownWriter.topBar.italic'),
      appI18n.t('creation:markdownWriter.topBar.strikethrough'),
      appI18n.t('creation:markdownWriter.topBar.inlineCode'),
      appI18n.t('creation:markdownWriter.topBar.bulletList'),
      appI18n.t('creation:markdownWriter.topBar.orderedList'),
      appI18n.t('creation:markdownWriter.topBar.taskList'),
      appI18n.t('creation:markdownWriter.topBar.link'),
      appI18n.t('creation:markdownWriter.topBar.image'),
      appI18n.t('creation:markdownWriter.topBar.table'),
      appI18n.t('creation:markdownWriter.topBar.codeBlock'),
      appI18n.t('creation:markdownWriter.topBar.quote'),
      appI18n.t('creation:markdownWriter.topBar.horizontalRule'),
      appI18n.t('creation:markdownWriter.topBar.math'),
      appI18n.t('creation:markdownWriter.topBar.quiver'),
    ],
  };
}

type PendingCoverCrop = {
  imageUrl: string;
  fileName: string;
};

type MarkdownPageState = 'draft' | 'published';

type MarkdownWriterNotice = {
  key: string;
  values?: Record<string, string | number>;
};

type MarkdownSourceVisibility = 'private' | 'open';

function pageStateForPost(post: PostDetail): MarkdownPageState {
  return post.publishStatus === 'draft' ? 'draft' : 'published';
}

function sourceVisibilityForPost(post: PostDetail): MarkdownSourceVisibility {
  if (post.sourceVisibility === 'open') return 'open';
  if (post.sourceVisibility === 'private') return 'private';
  if (post.repositoryStatus === 'published') return 'open';
  return post.publishStatus === 'published' ? 'open' : 'private';
}

function contentStatusForControls(
  pageState: MarkdownPageState,
  sourceVisibility: MarkdownSourceVisibility,
): CreateContentInput['status'] {
  if (pageState === 'draft') return 'draft';
  return sourceVisibility === 'open' ? 'published' : 'private';
}

function normalizeManualExcerpt(value: string) {
  return normalizeMarkdownWhitespaceEntities(value).trim();
}

function normalizeArticleEditorMarkdown(markdown: string) {
  return normalizeMarkdownWhitespaceEntities(
    normalizeMilkdownMathMarkdown(markdownWithoutDefaultTemplate(markdown)),
  );
}

function manualExcerptFromPost(post: PostDetail, markdown: string) {
  const savedExcerpt = normalizeManualExcerpt(post.excerpt || '');
  if (!savedExcerpt) return '';
  const automaticExcerpt = normalizeManualExcerpt(excerptFromMarkdown(markdown));
  return savedExcerpt === automaticExcerpt ? '' : savedExcerpt;
}

async function sourceFromPost(post: PostDetail) {
  return loadMarkdownEditorSource(post);
}

export default function BlogMarkdownPage() {
  const {
    t,
    i18n,
    ready: creationTranslationsReady,
  } = useFeatureTranslation('creation');
  const [editorTranslationsReady, setEditorTranslationsReady] = useState(
    creationTranslationsReady,
  );
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editSlug = searchParams.get('edit')?.trim() || '';
  const worksFolderId = searchParams.get('worksFolderId')?.trim() || '';
  const writerRef = useRef<MarkdownWriterHandle | null>(null);
  const editorRef = useRef<Crepe | null>(null);
  const readOnlyRef = useRef(false);
  const markdownRef = useRef('');
  const titleRef = useRef('');
  const syncingTitleRef = useRef(false);
  const skipNextMathReparseRef = useRef(false);
  const skipEditReloadRef = useRef('');
  const [user, setUser] = useState<RinspaceUser | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editPost, setEditPost] = useState<PostDetail | null>(null);
  const [initialMarkdown, setInitialMarkdown] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [manualExcerpt, setManualExcerpt] = useState('');
  const [manualExcerptEnabled, setManualExcerptEnabled] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [summaryEditorValue, setSummaryEditorValue] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [pendingCoverCrop, setPendingCoverCrop] = useState<PendingCoverCrop | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [savingMode, setSavingMode] = useState<'draft' | 'published' | ''>('');
  const [sourceVisibility, setSourceVisibility] = useState<MarkdownSourceVisibility>('open');
  const [repositoryAssetsReady, setRepositoryAssetsReady] = useState(false);
  const [status, setStatus] = useState<MarkdownWriterNotice | null>(null);
  const [error, setError] = useState('');
  const [userChecked, setUserChecked] = useState(false);
  const autosaveKey = useMemo(
    () => makeMilkdownAutosaveKey(user, 'blog-markdown', editSlug || 'new'),
    [editSlug, user],
  );
  const resolveRepositoryAsset = useCallback(
    (path: string) => editPost ? repositoryAssetUrl(editPost, path) : path,
    [editPost],
  );
  const assetHost = useMemo(
    () => new MilkdownRepositoryAssetHost(autosaveKey, resolveRepositoryAsset),
    [autosaveKey],
  );

  useEffect(() => {
    assetHost.setRepositoryUrlResolver(resolveRepositoryAsset);
  }, [assetHost, resolveRepositoryAsset]);

  useEffect(() => () => assetHost.dispose(), [assetHost]);

  useEffect(() => {
    let cancelled = false;
    setRepositoryAssetsReady(false);
    void assetHost.ready().then(() => {
      if (!cancelled) setRepositoryAssetsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assetHost]);

  const {
    frameRef: quiverFrameRef,
    open: quiverOpen,
    pending: quiverPending,
    frameReady: quiverFrameReady,
    error: quiverError,
    openEditor: openQuiverDialog,
    closeEditor: closeQuiverDialog,
    requestExport: requestQuiverTikzcd,
    handleFrameLoad: handleQuiverFrameLoad,
  } = useQuiverEditor({
    editorRef,
    readOnlyRef,
    syncingRef: syncingTitleRef,
    skipNextMathReparseRef,
    closeCompetingEditor: () => writerRef.current?.closeLatexEditor(),
    normalizeMarkdown: (markdown) =>
      normalizeQuiverImages(markdownWithoutDefaultTemplate(assetHost.serializeMarkdown(markdown))),
    onCommit: (markdown) => {
      markdownRef.current = markdown;
    },
    messages: {
      notLoaded: t('markdownWriter.quiver.notLoaded'),
      stillLoading: t('markdownWriter.quiver.stillLoading'),
      timeout: t('markdownWriter.quiver.timeout'),
      exportFailed: t('markdownWriter.quiver.exportFailed'),
      empty: t('markdownWriter.quiver.empty'),
      renderFailed: (error) =>
        localizedErrorMessage(error, 'creation.quiverRenderFailed'),
    },
    onExportFailure: (message) => {
      console.error('Quiver export failed', message);
    },
    renderDiagram: async (source, replacingImageSrc) => {
      const rendered = await renderTikzcdRepositoryDiagram(source, {
        legacyMigration: Boolean(replacingImageSrc) && !isRepositoryQuiverImageUrl(replacingImageSrc),
      });
      const staged = await assetHost.stageQuiver(
        tikzcdDiagramSourceText(source),
        rendered.svg,
        replacingImageSrc,
      );
      return { url: staged.previewUrl };
    },
    onRenderFailure: async (source, replacingImageSrc) => {
      await assetHost.stagePendingQuiver(tikzcdDiagramSourceText(source), replacingImageSrc);
    },
  });

  const canSave = Boolean(
    user &&
      editorReady &&
      !loadingEdit &&
      title.trim() &&
      !savingMode,
  );
  const statusText = status ? t(status.key, status.values) : '';

  useEffect(() => {
    let cancelled = false;
    setUserChecked(false);
    void getCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setUserChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    };
  }, [pendingCoverCrop]);

  useEffect(() => {
    if (editSlug && skipEditReloadRef.current === editSlug) {
      return undefined;
    }
    skipEditReloadRef.current = '';
    let cancelled = false;
    setError('');
    setStatus(null);
    setEditPost(null);
    setInitialMarkdown(null);
    if (!editSlug) {
      titleRef.current = '';
      markdownRef.current = '';
      setTitle('');
      setTags('');
      setManualExcerpt('');
      setManualExcerptEnabled(false);
      setSummaryEditorValue('');
      setSummaryDialogOpen(false);
      setCoverUrl('');
      setSourceVisibility('open');
      setInitialMarkdown('');
      setLoadingEdit(false);
      return undefined;
    }
    setLoadingEdit(true);
    setStatus({ key: 'markdownWriter.loading.source' });
    void loadContentDetail(editSlug)
      .then(async (post) => {
        if (post.type !== 'blog') {
          throw new Error('Unsupported Markdown content type.');
        }
        if (blogEditorKind(post) !== 'markdown') {
          throw new Error('The blog uses a different editor.');
        }
        const source = await sourceFromPost(post);
        if (!source.trim()) {
          throw new Error('No Markdown source is available.');
        }
        if (cancelled) return;
        const sourceTitle = firstMarkdownHeading(source) || post.title;
        const syncedSource = markdownWithTitle(source, sourceTitle);
        const nextManualExcerpt = manualExcerptFromPost(post, syncedSource);
        setEditPost(post);
        titleRef.current = sourceTitle;
        setTitle(sourceTitle);
        setTags(post.tags.join(', '));
        setManualExcerpt(nextManualExcerpt);
        setManualExcerptEnabled(Boolean(nextManualExcerpt));
        setSummaryEditorValue(nextManualExcerpt);
        setSummaryDialogOpen(false);
        setCoverUrl(post.coverUrl || '');
        setSourceVisibility(sourceVisibilityForPost(post));
        setInitialMarkdown(syncedSource);
        markdownRef.current = syncedSource;
        setStatus({ key: 'markdownWriter.status.sourceLoaded' });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(localizedErrorMessage(loadError, 'creation.markdownEditLoadFailed'));
          setStatus(null);
          titleRef.current = '';
          markdownRef.current = '';
          setTitle('');
          setManualExcerpt('');
          setManualExcerptEnabled(false);
          setSummaryEditorValue('');
          setSummaryDialogOpen(false);
          setInitialMarkdown('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editSlug]);

  const makeAutosaveDraft = useCallback((): MilkdownAutosaveDraft | null => {
    const draftTitle = titleRef.current || title;
    const draftMarkdown = markdownWithTitle(markdownRef.current, draftTitle);
    const draftExcerpt = manualExcerptEnabled ? normalizeManualExcerpt(manualExcerpt) : '';
    if (!draftMarkdown.trim() && !draftTitle.trim() && !tags.trim() && !coverUrl.trim() && !draftExcerpt) {
      return null;
    }
    return {
      version: 1,
      key: autosaveKey,
      kind: 'blog-markdown',
      title: draftTitle,
      markdown: draftMarkdown,
      excerpt: draftExcerpt,
      excerptCustomized: Boolean(draftExcerpt),
      tags,
      coverUrl,
      sourceVisibility,
      editSlug,
      repositoryFiles: assetHost.snapshotRepositoryFiles(),
      savedAt: Date.now(),
    };
  }, [autosaveKey, coverUrl, editSlug, manualExcerpt, manualExcerptEnabled, sourceVisibility, tags, title]);

  const applyAutosaveDraft = useCallback(async (draft: MilkdownAutosaveDraft) => {
    if (draft.kind !== 'blog-markdown') return;
    await assetHost.importRepositoryFiles(draft.repositoryFiles);
    const nextTitle = draft.title || firstMarkdownHeading(draft.markdown) || titleRef.current;
    const nextMarkdown = markdownWithTitle(draft.markdown, nextTitle);
    titleRef.current = nextTitle;
    markdownRef.current = nextMarkdown;
    setTitle(nextTitle);
    const nextExcerpt = draft.excerptCustomized ? normalizeManualExcerpt(draft.excerpt || '') : '';
    setManualExcerpt(nextExcerpt);
    setManualExcerptEnabled(Boolean(nextExcerpt));
    setSummaryEditorValue(nextExcerpt);
    setTags(draft.tags || '');
    setCoverUrl(draft.coverUrl || '');
    if (draft.sourceVisibility) setSourceVisibility(draft.sourceVisibility);
    setInitialMarkdown(nextMarkdown);
    if (!editorRef.current) return;
    syncingTitleRef.current = true;
    editorRef.current.editor.action(replaceAll(assetHost.hydrateMarkdown(nextMarkdown), true));
    window.setTimeout(() => {
      syncingTitleRef.current = false;
    }, 0);
  }, [assetHost]);

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
    userChecked,
    enabled: initialMarkdown !== null && !loadingEdit,
    ready: editorReady && !savingMode,
    makeDraft: makeAutosaveDraft,
    applyDraft: applyAutosaveDraft,
  });

  // Transient notices render as toasts (bottom-left) so they never shift the
  // writing surface layout.
  const toast = useToast();
  useEffect(() => {
    if (creationTranslationsReady) setEditorTranslationsReady(true);
  }, [creationTranslationsReady]);
  useEffect(() => {
    if (statusText) toast.notify({ title: statusText });
  }, [statusText, toast]);
  useEffect(() => {
    if (autosaveNotice) toast.notify({ title: autosaveNotice, tone: autosaveNoticeTone });
  }, [autosaveNotice, autosaveNoticeTone, toast]);
  useEffect(() => {
    if (error) toast.notify({ title: error, tone: 'destructive' });
  }, [error, toast]);

  const writerRefs = useMemo<MarkdownWriterRefs>(() => ({
    editor: editorRef,
    markdown: markdownRef,
    title: titleRef,
    syncing: syncingTitleRef,
    readOnly: readOnlyRef,
    skipNextMathReparse: skipNextMathReparseRef,
  }), []);
  const writerLabels: MarkdownWriterLabels = {
    title: appI18n.t('creation:markdownWriter.labels.title'),
    editor: appI18n.t('creation:markdownWriter.editor'),
    enterFullscreen: appI18n.t('creation:markdownWriter.controls.fullscreen'),
    exitFullscreen: appI18n.t('creation:markdownWriter.controls.exitFullscreen'),
    mathBlockEditor: appI18n.t('creation:markdownWriter.math.blockEditor'),
    done: appI18n.t('creation:markdownWriter.actions.done'),
    math: appI18n.t('creation:markdownWriter.topBar.math'),
    headings: bodyHeadingOptions(),
    topBar: markdownTopBarLabels(),
    inlineMath: {
      ariaLabel: appI18n.t('creation:markdownWriter.math.inlineEditor'),
      save: appI18n.t('creation:markdownWriter.actions.done'),
      cancel: appI18n.t('creation:markdownWriter.actions.cancel'),
    },
  };
  const writerPageLabels: MarkdownWriterPageLabels = {
    tags: t('markdownWriter.labels.tags'),
    summary: t('markdownWriter.labels.summary'),
    cover: t('markdownWriter.labels.cover'),
    uploadCover: t('markdownWriter.actions.upload'),
    changeCover: t('markdownWriter.actions.change'),
    removeCover: t('markdownWriter.actions.remove'),
    source: t('markdownWriter.labels.source'),
    saveState: t('markdownWriter.controls.saveState'),
    sourceVisibility: t('markdownWriter.controls.sourceVisibility'),
    openSource: t('markdownWriter.visibility.open'),
    privateSource: t('markdownWriter.visibility.private'),
    saveDraft: t('actions.saveDraft'),
    publish: t('actions.publish'),
    saving: t('markdownWriter.actions.saving'),
    publishing: t('writer.actions.publishing'),
  };
  const writerActive = Boolean(
    editorTranslationsReady &&
      repositoryAssetsReady &&
      !loadingEdit &&
      initialMarkdown !== null &&
      autosaveChecked
  );

  useEffect(() => {
    if (!autosaveChecked || !editorReady) return;
    scheduleAutosave(8000);
  }, [
    autosaveChecked,
    coverUrl,
    editorReady,
    manualExcerpt,
    manualExcerptEnabled,
    scheduleAutosave,
    sourceVisibility,
    tags,
    title,
  ]);

  const automaticExcerptPreview = useMemo(() => {
    if (!summaryDialogOpen) return '';
    const sourceMarkdown = normalizeMarkdownWhitespaceEntities(
      markdownWithTitle(markdownRef.current, titleRef.current || title),
    ).trim();
    return excerptFromMarkdown(sourceMarkdown);
  }, [summaryDialogOpen, title]);

  const summaryPreviewMarkdown =
    normalizeManualExcerpt(summaryEditorValue) || automaticExcerptPreview;
  const summaryCustomized =
    manualExcerptEnabled && Boolean(normalizeManualExcerpt(manualExcerpt));

  const openSummaryDialog = () => {
    writerRef.current?.closeLatexEditor();
    setSummaryEditorValue(summaryCustomized ? manualExcerpt : '');
    setSummaryDialogOpen(true);
  };

  const closeSummaryDialog = () => {
    setSummaryDialogOpen(false);
    setSummaryEditorValue(summaryCustomized ? manualExcerpt : '');
  };

  const useAutomaticSummary = () => {
    setManualExcerpt('');
    setManualExcerptEnabled(false);
    setSummaryEditorValue('');
    setSummaryDialogOpen(false);
    markAutosaveChanged();
  };

  const saveSummaryDialog = () => {
    const nextExcerpt = normalizeManualExcerpt(summaryEditorValue);
    setManualExcerpt(nextExcerpt);
    setManualExcerptEnabled(Boolean(nextExcerpt));
    setSummaryEditorValue(nextExcerpt);
    setSummaryDialogOpen(false);
    markAutosaveChanged();
  };

  const changeCover = (file: File) => {
    setError('');
    setStatus(null);
    if (!file.type.startsWith('image/')) {
      setError(t('markdownWriter.validation.imageOnly'));
      return;
    }
    if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    setPendingCoverCrop({
      imageUrl: URL.createObjectURL(file),
      fileName: file.name || 'markdown-cover.jpg',
    });
  };

  const closeCoverCrop = () => {
    if (coverUploading) return;
    if (pendingCoverCrop) URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    setPendingCoverCrop(null);
  };

  const uploadCroppedCover = async (file: File) => {
    if (!pendingCoverCrop) return;
    if (!user) {
      setError(t('publishPage.validation.signInToUploadCover'));
      setStatus(null);
      return;
    }
    setCoverUploading(true);
    setError('');
    setStatus({ key: 'markdownWriter.status.coverUploading' });
    try {
      const uploaded = await uploadCoverFile(user, file);
      setCoverUrl(uploaded.fileID);
      setStatus({ key: 'markdownWriter.status.coverUploaded' });
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    } catch (uploadError) {
      setError(localizedErrorMessage(uploadError, 'creation.markdownCoverUploadFailed'));
      setStatus(null);
    } finally {
      setCoverUploading(false);
    }
  };

  const saveArticle = async (mode: MarkdownPageState) => {
    writerRef.current?.closeLatexEditor();
    if (!user) {
      setError(t('markdownWriter.validation.signIn'));
      return;
    }
    setSavingMode(mode);
    setError('');
    setStatus(null);
    let durableDraftSaved = false;
    try {
      const sourceMarkdown = normalizeMarkdownWhitespaceEntities(
        normalizeQuiverImages(markdownWithTitle(markdownRef.current, title)),
      ).trim();
      markdownRef.current = sourceMarkdown;
      // Persist the exact current source before any renderer or upload request.
      // Published revisions must remain visible while a new revision is a draft.
      await saveNow();
      durableDraftSaved = true;
      if (mode === 'published' && assetHost.hasPendingQuiver(sourceMarkdown)) {
        setError(t('markdownWriter.quiver.pendingPublish'));
        return;
      }
      if (mode === 'draft' && editPost && pageStateForPost(editPost) === 'published') {
        setStatus({ key: 'markdownWriter.status.revisionDraftSaved' });
        return;
      }
      const repositoryFiles = await assetHost.collectRepositoryFiles(sourceMarkdown);
      const tagList = splitTagValues(tags).slice(0, 6);
      const creatingPost = !editPost;
      const savedStatus = contentStatusForControls(mode, sourceVisibility);
      const savedExcerpt = manualExcerptEnabled ? normalizeManualExcerpt(manualExcerpt) : '';
      const input: CreateContentInput = {
        type: 'blog',
        sourceCommit: editPost?.pendingCommit || editPost?.repositorySource?.commit,
        status: savedStatus,
        repositoryStatus: mode,
        sourceVisibility,
        editor: 'markdown',
        title: title.trim(),
        body: bodyFromMarkdownSource(sourceMarkdown, null),
        excerpt: savedExcerpt || excerptFromMarkdown(sourceMarkdown),
        tags: tagList,
        coverUrl,
        markdownSource: null,
        repositoryFiles,
      };
      const saved = editPost
        ? await updateContent(editPost.slug || editPost.id, input)
        : await createContent(input);
      if (isContentModerationSubmission(saved)) {
        setStatus({
          key: `publishDialog.create.moderation.${saved.state === 'rejected'
            ? 'rejected'
            : saved.state === 'published'
              ? 'published'
              : 'pending'}`,
        });
        return;
      }
      await assetHost.clearPersistedRepositoryFiles();
      await clearAutosave();
      // Moving from the new-draft key to the saved post reinitializes autosave
      // and the editor. Seed that editor with the source just saved.
      setInitialMarkdown(sourceMarkdown);
      setEditPost(saved);
      setSourceVisibility(sourceVisibilityForPost(saved));
      const destination = contentPath('blog', saved.id, saved.title);
      const successKey = saved.publicationPending
        ? 'markdownWriter.status.activationPending'
        : mode === 'draft'
        ? 'markdownWriter.status.draftSaved'
        : sourceVisibility === 'open'
          ? 'markdownWriter.status.published'
          : 'markdownWriter.status.privatePublished';
      const successValues = mode === 'draft'
        ? undefined
        : { title: saved.title };
      const savedReference = saved.slug || saved.id;
      setStatus(null);
      skipEditReloadRef.current = savedReference;
      if (mode === 'draft') {
        navigate(`/write/markdown?edit=${encodeURIComponent(savedReference)}`, { replace: true });
      } else {
        if (creatingPost && worksFolderId) {
          await moveWorkItem({ postId: saved.id, folderId: worksFolderId }).catch((folderError) => {
            console.error('The published article could not be moved to its folder', folderError);
          });
        }
        navigate(`/write/markdown?edit=${encodeURIComponent(savedReference)}`, { replace: true });
      }
      toast.notify({
        title: t(successKey, successValues),
        actionLabel: t('markdownWriter.actions.viewBlog'),
        durationMs: 10000,
        onAction: () => navigate(destination),
      });
    } catch (saveError) {
      const failure = saveError instanceof MilkdownDraftSaveError
        ? t(saveError.localSaved
          ? 'markdownWriter.status.accountDraftFailedLocalKept'
          : 'markdownWriter.status.accountDraftFailed')
        : localizedErrorMessage(saveError, 'creation.markdownSaveFailed');
      setError(durableDraftSaved
        ? t(mode === 'published'
          ? 'markdownWriter.status.publishFailedDraftKept'
          : 'markdownWriter.status.draftContentSaveFailedDraftKept', { reason: failure })
        : failure);
    } finally {
      setSavingMode('');
    }
  };

  return (
    <>
      <Helmet title={t('markdownWriter.documentTitle')} />
      <SiteTopbar />
      <MarkdownWriterPage
        ref={writerRef}
        title={title}
        initialMarkdown={initialMarkdown || ''}
        labels={writerLabels}
        pageLabels={writerPageLabels}
        refs={writerRefs}
        active={writerActive}
        onTitleChange={setTitle}
        onMarkdownChange={() => markAutosaveChanged()}
        onReadyChange={setEditorReady}
        onError={(createError) => {
          setError(localizedErrorMessage(createError, 'creation.markdownEditorFailed'));
        }}
        serializeMarkdown={(markdown) => assetHost.serializeMarkdown(markdown)}
        hydrateMarkdown={(markdown) => assetHost.hydrateMarkdown(markdown)}
        normalizeMarkdown={normalizeArticleEditorMarkdown}
        editorOptions={{
          uploadImage: async (file) => (await assetHost.stageImage(file)).previewUrl,
          imageCaptionPlaceholder: appI18n.t(
            'creation:markdownWriter.placeholders.imageCaption',
          ),
          imageUploadPlaceholder: appI18n.t(
            'creation:markdownWriter.placeholders.imageUpload',
          ),
          mathTrust: true,
        }}
        quiver={{
          label: appI18n.t('creation:markdownWriter.topBar.quiver'),
          onOpen: () => openQuiverDialog(),
        }}
        createInteractions={(runtime) => createMilkdownInteractions({
          ...runtime,
          openQuiver: openQuiverDialog,
          onQuiverSourceError: (interactionError) => {
            setError(localizedErrorMessage(interactionError, 'creation.quiverSourceLoadFailed'));
          },
          loadQuiverSource: (imageSrc) => assetHost.readQuiverSource(imageSrc),
        })}
        loading={<LoadingState variant="strip" />}
        controls={{
          renderTagsControl: ({ disabled }) => (
              <TagPicker
                value={splitTagValues(tags).slice(0, 6)}
                onChange={(next) => setTags(joinTagValues(next))}
                disabled={disabled}
                ariaLabel={t('markdownWriter.labels.tags')}
              />
          ),
          summaryCustomized,
          onOpenSummary: openSummaryDialog,
          coverUrl,
          onCoverFile: changeCover,
          onRemoveCover: () => setCoverUrl(''),
          sourceVisibility,
          onSourceVisibilityChange: setSourceVisibility,
          onSaveDraft: () => void saveArticle('draft'),
          onPublish: () => void saveArticle('published'),
          tagsDisabled: !user || Boolean(savingMode),
          summaryDisabled: !user || Boolean(savingMode) || loadingEdit,
          coverDisabled: !user,
          sourceDisabled: Boolean(savingMode) || loadingEdit,
          coverBusy: coverUploading,
          canSave,
          savingMode,
        }}
        dialogs={(
          <>
        <Modal
          show={summaryDialogOpen}
          onHide={closeSummaryDialog}
          size="lg"
          centered
          dialogClassName="markdown-summary-dialog"
        >
          <Modal.Header closeButton>
            <Modal.Title>{t('markdownWriter.labels.summary')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="markdown-summary-stack">
              <section className="markdown-summary-panel" aria-label={t('markdownWriter.summary.edit')}>
                <div className="markdown-summary-panel-head">
                  <span>{t('markdownWriter.actions.edit')}</span>
                </div>
                <CodeMirrorEditor
                  id="markdown-summary"
                  value={summaryEditorValue}
                  minHeight="168px"
                  placeholder={t('markdownWriter.placeholders.summary')}
                  ariaLabel={t('markdownWriter.labels.summary')}
                  submitOnEnter={false}
                  onChange={setSummaryEditorValue}
                />
              </section>
              <section className="markdown-summary-panel" aria-label={t('markdownWriter.summary.preview')}>
                <div className="markdown-summary-panel-head">
                  <span>{t('markdownWriter.actions.preview')}</span>
                </div>
                <MilkdownMarkdownArticle
                  markdown={summaryPreviewMarkdown}
                  className="markdown-summary-preview"
                  emptyFallback={t('markdownWriter.summary.emptyPreview')}
                />
              </section>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button className="secondary-link" type="button" onClick={useAutomaticSummary}>
              {t('markdownWriter.actions.useDefault')}
            </Button>
            <Button className="secondary-link" type="button" onClick={closeSummaryDialog}>
              {t('markdownWriter.actions.cancel')}
            </Button>
            <Button className="primary-button" type="button" onClick={saveSummaryDialog}>
              {t('markdownWriter.actions.save')}
            </Button>
          </Modal.Footer>
        </Modal>
        {pendingCoverCrop ? (
          <ImageCropDialog
            open
            imageUrl={pendingCoverCrop.imageUrl}
            title={t('markdownWriter.coverCrop')}
            aspect={16 / 9}
            cropShape="rect"
            outputWidth={1600}
            outputHeight={900}
            outputFileName={pendingCoverCrop.fileName}
            busy={coverUploading}
            error={error}
            onCancel={closeCoverCrop}
            onConfirm={uploadCroppedCover}
          />
        ) : null}
        {quiverOpen ? (
          <QuiverDialog
            frameRef={quiverFrameRef}
            frameSrc={defaultQuiverFrameSrc}
            frameReady={quiverFrameReady}
            pending={quiverPending}
            error={quiverError}
            ariaLabel={t('markdownWriter.quiver.editor')}
            helpText={t('markdownWriter.quiver.help')}
            cancelLabel={t('markdownWriter.actions.cancel')}
            insertLabel={t('markdownWriter.quiver.insert')}
            loadingLabel={t('markdownWriter.quiver.loading')}
            exportingLabel={t('markdownWriter.quiver.exporting')}
            onClose={closeQuiverDialog}
            onRequestExport={requestQuiverTikzcd}
            onFrameLoad={handleQuiverFrameLoad}
          />
        ) : null}
          </>
        )}
      />
    </>
  );
}
