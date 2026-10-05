import {
  AnimateButton,
  Dialog,
  DialogBody,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  Icon,
} from 'components/ui';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import ImageCropDialog from '@/components/ImageCropDialog';
import TagPicker from '@/components/TagPicker';
import { formatNumber } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { createContent, isContentModerationSubmission } from '@/services/domains/article';
import { uploadAnswerFile } from '@/services/domains/publication';
import { messageFromError } from '@/services/errors';
import type { BookTOCItem } from '@/services/feed';
import type { RinspaceUser } from '@/services/phoneAuth';
import { uploadCoverFile } from '@/services/profile';
import { openGiteaPath } from '@/utils/giteaPaths';
import { bookWorkspacePath, contentPath } from '@/utils/routes';
import { extractPDFTOC, renderPDFCover } from '@/utils/pdfToc';

import { latexArticleInitialSource } from './latexArticleTemplate';
import { typstCreationEnabled } from './typstFeature';

import './publish-dialog.css';

export type PublishDialogMode = 'blog' | 'typst-blog' | 'latex-book' | 'typst-book' | 'markdown-book' | 'pdf-book';

type PublishCreateDialogProps = {
  open: boolean;
  mode: PublishDialogMode;
  user: RinspaceUser | null;
  onClose(): void;
};

type PendingCoverCrop = {
  imageUrl: string;
  fileName: string;
};

const DIALOG_META: Record<
  PublishDialogMode,
  { aspect: number; outputWidth: number; outputHeight: number; ratioLabel: string }
> = {
  blog: { aspect: 16 / 9, outputWidth: 1600, outputHeight: 900, ratioLabel: '16:9' },
  'typst-blog': { aspect: 16 / 9, outputWidth: 1600, outputHeight: 900, ratioLabel: '16:9' },
  'latex-book': { aspect: 2 / 3, outputWidth: 900, outputHeight: 1350, ratioLabel: '2:3' },
  'typst-book': { aspect: 2 / 3, outputWidth: 900, outputHeight: 1350, ratioLabel: '2:3' },
  'markdown-book': { aspect: 2 / 3, outputWidth: 900, outputHeight: 1350, ratioLabel: '2:3' },
  'pdf-book': { aspect: 2 / 3, outputWidth: 900, outputHeight: 1350, ratioLabel: '2:3' },
};

const MODE_TRANSLATION_KEYS: Record<PublishDialogMode, 'blog' | 'typstBlog' | 'latexBook' | 'typstBook' | 'markdownBook' | 'pdfBook'> = {
  blog: 'blog',
  'typst-blog': 'typstBlog',
  'latex-book': 'latexBook',
  'typst-book': 'typstBook',
  'markdown-book': 'markdownBook',
  'pdf-book': 'pdfBook',
};

function latexArticleInitialBody() {
  return [
    '[[RIN_WRITER]]',
    '<h2 id="introduction">Introduction</h2>',
    '<p>Start writing the article here.</p>',
    '[[/RIN_WRITER]]',
    '',
    '[[RIN_SOURCE]]',
    latexArticleInitialSource,
    '[[/RIN_SOURCE]]',
  ].join('\n');
}

export default function PublishCreateDialog({ open, mode, user, onClose }: PublishCreateDialogProps) {
  const navigate = useNavigate();
  const { t, i18n } = useFeatureTranslation('creation');
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const meta = DIALOG_META[mode];
  const modeTranslationKey = MODE_TRANSLATION_KEYS[mode];
  const isBook = mode !== 'blog' && mode !== 'typst-blog';
  const isPdf = mode === 'pdf-book';

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState('');
  const [status, setStatus] = useState<'private' | 'published'>('published');
  const [pendingCoverCrop, setPendingCoverCrop] = useState<PendingCoverCrop | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFilename, setPdfFilename] = useState('');
  const [pdfToc, setPdfToc] = useState<BookTOCItem[]>([]);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfTocStatus, setPdfTocStatus] = useState('');
  const [pdfCoverStatus, setPdfCoverStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setExcerpt('');
    setTags([]);
    setCoverUrl('');
    setStatus('published');
    setPendingCoverCrop(null);
    setCoverUploading(false);
    setCreating(false);
    setError('');
    setNotice('');
    setPdfUrl('');
    setPdfFilename('');
    setPdfToc([]);
    setPdfUploading(false);
    setPdfTocStatus('');
    setPdfCoverStatus('');
  }, [open, mode]);

  const busy = creating || coverUploading || pdfUploading;

  const closeDialog = () => {
    if (busy) return;
    if (pendingCoverCrop) {
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    }
    onClose();
  };

  const changeCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('publishDialog.cover.imageOnly'));
      return;
    }
    if (pendingCoverCrop) {
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    }
    setError('');
    setNotice('');
    setPendingCoverCrop({
      imageUrl: URL.createObjectURL(file),
      fileName: file.name || `${mode}-cover.jpg`,
    });
  };

  const closeCoverCrop = () => {
    if (coverUploading) return;
    if (pendingCoverCrop) {
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    }
  };

  const uploadCroppedCover = async (file: File) => {
    if (!pendingCoverCrop) return;
    if (!user) {
      setError(t('publishPage.validation.signInToUploadCover'));
      setNotice('');
      return;
    }
    setCoverUploading(true);
    setError('');
    setNotice(t('publishDialog.cover.uploading'));
    try {
      const uploaded = await uploadCoverFile(user, file);
      setCoverUrl(uploaded.fileID);
      setNotice(t('publishDialog.cover.uploaded'));
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    } catch (uploadError) {
      setError(messageFromError(uploadError, 'creation.coverUploadFailed'));
      setNotice('');
    } finally {
      setCoverUploading(false);
    }
  };

  const uploadPDF = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError(t('publishDialog.pdf.fileOnly'));
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      setError(t('publishDialog.pdf.tooLarge'));
      return;
    }
    setPdfUploading(true);
    setError('');
    setPdfTocStatus(t('publishDialog.pdf.extractingToc'));
    setPdfCoverStatus(
      coverUrl.trim()
        ? t('publishDialog.pdf.keepingCover')
        : t('publishDialog.pdf.generatingCover'),
    );
    setPdfToc([]);
    try {
      try {
        const toc = await extractPDFTOC(file);
        setPdfToc(toc);
        setPdfTocStatus(
          toc.length
            ? t('publishDialog.pdf.tocExtracted', {
              count: toc.length,
              displayCount: formatNumber(locale, toc.length),
            })
            : t('publishDialog.pdf.tocUnavailable'),
        );
      } catch {
        setPdfToc([]);
        setPdfTocStatus(t('publishDialog.pdf.tocUnavailable'));
      }
      if (!coverUrl.trim()) {
        try {
          const coverFile = await renderPDFCover(file);
          const cover = await uploadAnswerFile('post', coverFile);
          setCoverUrl(cover);
          setPdfCoverStatus(t('publishDialog.pdf.coverGenerated'));
        } catch {
          setPdfCoverStatus(t('publishDialog.pdf.coverUnavailable'));
        }
      }
      const url = await uploadAnswerFile('post_attachment', file);
      setPdfUrl(url);
      setPdfFilename(file.name);
    } catch (uploadError) {
      setError(messageFromError(uploadError, 'creation.pdfUploadFailed'));
      setPdfTocStatus('');
      setPdfCoverStatus('');
    } finally {
      setPdfUploading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || creating) return;
    if ((mode === 'typst-blog' || mode === 'typst-book') && !typstCreationEnabled) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('publishDialog.create.titleRequired'));
      return;
    }
    if (!isBook && !excerpt.trim()) {
      setError(t('publishDialog.create.excerptRequired'));
      return;
    }
    if (isPdf && !pdfUrl) {
      setError(t('publishDialog.create.pdfRequired'));
      return;
    }
    setCreating(true);
    setError('');
    setNotice(t(`publishDialog.create.creating.${modeTranslationKey}`));
    try {
      if (mode === 'blog' || mode === 'typst-blog') {
        const saved = await createContent({
          type: 'blog',
          status: 'draft',
          repositoryStatus: 'published',
          sourceVisibility: status === 'published' ? 'open' : 'private',
          title: trimmedTitle,
          excerpt: excerpt.trim(),
          tags: tags.slice(0, 6),
          coverUrl,
          editor: mode === 'typst-blog' ? 'typst' : 'rin',
          body: mode === 'typst-blog' ? '' : latexArticleInitialBody(),
        });
        if (isContentModerationSubmission(saved)) {
          setNotice(t(`publishDialog.create.moderation.${saved.state === 'rejected' ? 'rejected' : saved.state === 'published' ? 'published' : 'pending'}`));
          setCreating(false);
          return;
        }
        setNotice(t('publishDialog.create.openingRepository'));
        openGiteaPath('a', saved.id);
        return;
      }
      const saved = await createContent({
        type: 'book',
        title: trimmedTitle,
        body: '',
        excerpt: excerpt.trim(),
        tags: tags.slice(0, 6),
        coverUrl,
        book: {
          kind: mode === 'markdown-book' ? 'markdown' : mode === 'typst-book' ? 'typst' : 'original',
          bookTitle: trimmedTitle,
          authors: [],
          pdfUrl: pdfUrl || undefined,
          pdfFilename: pdfFilename || undefined,
          toc: pdfToc,
        },
      });
      if (isContentModerationSubmission(saved)) {
        setNotice(t(`publishDialog.create.moderation.${saved.state === 'rejected' ? 'rejected' : saved.state === 'published' ? 'published' : 'pending'}`));
        setCreating(false);
        return;
      }
      setCreating(false);
      onClose();
      navigate(isPdf ? contentPath('book', saved.id, saved.title) : bookWorkspacePath(saved.id));
    } catch (submitError) {
      setError(messageFromError(submitError, 'creation.contentCreateFailed'));
      setNotice('');
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
      <DialogPortal>
        <DialogOverlay className="rin-ui-overlay" />
        <DialogBody
          className="auth-dialog latex-blog-dialog publish-create-dialog"
          aria-describedby={undefined}
        >
          <div className="auth-dialog-head">
            <DialogTitle className="auth-dialog-title">
              {t(`publishDialog.create.titles.${modeTranslationKey}`)}
            </DialogTitle>
            <DialogClose asChild>
              <AnimateButton
                unstyled
                type="button"
                aria-label={t('publishDialog.create.close')}
                disabled={busy}
              >
                <Icon name="x-lg" />
              </AnimateButton>
            </DialogClose>
          </div>
          <form className="auth-dialog-form latex-blog-dialog-form" onSubmit={submit}>
            <label>
              <span>{t('publishDialog.fields.title')}</span>
              <input
                type="text"
                value={title}
                maxLength={120}
                disabled={creating}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{t('publishDialog.fields.excerpt')}</span>
              <textarea
                value={excerpt}
                maxLength={240}
                rows={3}
                disabled={creating}
                onChange={(event) => setExcerpt(event.currentTarget.value)}
              />
            </label>
            <div className="latex-blog-field">
              <span>{t('publishDialog.fields.tags')}</span>
              <TagPicker
                value={tags}
                disabled={creating}
                max={6}
                placeholder={t('publishDialog.fields.tagPlaceholder')}
                createMode="add"
                onChange={setTags}
              />
            </div>
            {!isBook ? (
              <div
                className="latex-blog-visibility"
                role="group"
                aria-label={t('publishDialog.create.visibility')}
              >
                <AnimateButton
                  unstyled
                  type="button"
                  className={status === 'published' ? 'active' : ''}
                  disabled={creating}
                  onClick={() => setStatus('published')}
                >
                  {t('publishDialog.create.public')}
                </AnimateButton>
                <AnimateButton
                  unstyled
                  type="button"
                  className={status === 'private' ? 'active' : ''}
                  disabled={creating}
                  onClick={() => setStatus('private')}
                >
                  {t('publishDialog.create.private')}
                </AnimateButton>
              </div>
            ) : null}
            <div className="latex-blog-cover-row">
              <div className={`latex-blog-cover-preview ${isBook ? 'publish-dialog-book-cover' : ''}`}>
                {coverUrl ? <img src={coverUrl} alt="" /> : <span>{meta.ratioLabel}</span>}
              </div>
              <label className="latex-blog-cover-upload">
                <Icon name="image" />
                <span>
                  {coverUrl
                    ? t('publishDialog.cover.replace')
                    : t('publishDialog.cover.upload')}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={changeCover}
                />
              </label>
              {coverUrl ? (
                <AnimateButton
                  unstyled
                  type="button"
                  className="latex-blog-cover-remove"
                  disabled={busy}
                  onClick={() => setCoverUrl('')}
                >
                  {t('publishDialog.cover.remove')}
                </AnimateButton>
              ) : null}
            </div>
            {isPdf ? (
              <div className="publish-dialog-pdf-row">
                <label className="latex-blog-cover-upload">
                  <Icon name="filetype-pdf" />
                  <span>
                    {pdfUrl
                      ? t('publishDialog.pdf.replace')
                      : t('publishDialog.pdf.upload')}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={busy}
                    onChange={uploadPDF}
                  />
                </label>
                {pdfFilename ? <span className="publish-dialog-pdf-name">{pdfFilename}</span> : null}
                {pdfTocStatus ? <span className="publish-dialog-pdf-status">{pdfTocStatus}</span> : null}
                {pdfCoverStatus ? <span className="publish-dialog-pdf-status">{pdfCoverStatus}</span> : null}
              </div>
            ) : null}
            {error ? <p className="auth-dialog-error" role="alert">{error}</p> : null}
            {notice ? (
              <p className="auth-dialog-status" role="status" aria-live="polite">
                {notice}
              </p>
            ) : null}
            <div className="auth-dialog-actions">
              <AnimateButton
                unstyled
                type="button"
                className="auth-dialog-link"
                disabled={busy}
                onClick={closeDialog}
              >
                {t('common:actions.cancel')}
              </AnimateButton>
              <AnimateButton unstyled type="submit" disabled={busy}>
                {creating
                  ? t('publishDialog.create.creatingAction')
                  : t('publishDialog.create.createAction')}
              </AnimateButton>
            </div>
          </form>
        </DialogBody>
      </DialogPortal>
      {pendingCoverCrop ? (
        <ImageCropDialog
          open
          imageUrl={pendingCoverCrop.imageUrl}
          title={t(isBook ? 'publishDialog.cover.cropBook' : 'publishDialog.cover.cropBlog')}
          aspect={meta.aspect}
          cropShape="rect"
          outputWidth={meta.outputWidth}
          outputHeight={meta.outputHeight}
          outputFileName={pendingCoverCrop.fileName}
          busy={coverUploading}
          error={error}
          onCancel={closeCoverCrop}
          onConfirm={uploadCroppedCover}
        />
      ) : null}
    </Dialog>
  );
}
