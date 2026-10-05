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

import ImageCropDialog from '@/components/ImageCropDialog';
import TagPicker from '@/components/TagPicker';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { updateContent } from '@/services/domains/article';
import { messageFromError } from '@/services/errors';
import type { PostDetail } from '@/services/feed';
import { uploadCoverFile } from '@/services/profile';

import './publish-dialog.css';

type PendingCoverCrop = {
  imageUrl: string;
  fileName: string;
};

type BookProfileDialogProps = {
  open: boolean;
  post: PostDetail | null;
  user: { id?: string } | null;
  variant?: 'book' | 'article';
  onClose(): void;
  onSaved(post: PostDetail): void;
};

export default function BookProfileDialog({
  open,
  post,
  user,
  variant = 'book',
  onClose,
  onSaved,
}: BookProfileDialogProps) {
  const { t } = useFeatureTranslation('creation');
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState('');
  const [pendingCoverCrop, setPendingCoverCrop] = useState<PendingCoverCrop | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open || !post) return;
    setTitle(post.title || '');
    setExcerpt(post.excerpt || '');
    setTags(post.tags || []);
    setCoverUrl(post.coverUrl || '');
    setPendingCoverCrop(null);
    setCoverUploading(false);
    setSaving(false);
    setError('');
    setNotice('');
  }, [open, post]);

  const busy = saving || coverUploading;
  const isArticle = variant === 'article';

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
      fileName: file.name || (isArticle ? 'article-cover.jpg' : 'book-cover.jpg'),
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!post || !user || saving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t(isArticle ? 'publishDialog.quickEdit.titleRequired' : 'publishDialog.bookProfile.titleRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setNotice(t(isArticle ? 'publishDialog.quickEdit.saving' : 'publishDialog.bookProfile.saving'));
    try {
      const saved = await updateContent(post.slug || post.id, {
        type: isArticle ? 'blog' : 'book',
        status: post.publishStatus === 'draft' || post.publishStatus === 'private' || post.publishStatus === 'published'
          ? post.publishStatus
          : undefined,
        repositoryStatus: post.repositoryStatus === 'draft' || post.repositoryStatus === 'private' || post.repositoryStatus === 'published'
          ? post.repositoryStatus
          : undefined,
        sourceVisibility: post.sourceVisibility === 'open' || post.sourceVisibility === 'private'
          ? post.sourceVisibility
          : undefined,
        title: trimmedTitle,
        body: post.body,
        excerpt: excerpt.trim(),
        tags: tags.slice(0, 6),
        coverUrl,
        editor: post.editor === 'rin' || post.editor === 'markdown' || post.editor === 'typst'
          ? post.editor
          : undefined,
        sourceCommit: post.repositorySource?.commit,
        markdownSource: post.markdownSource || null,
        book: isArticle
          ? undefined
          : {
              ...(post.book || { kind: 'original' as const, bookTitle: trimmedTitle, authors: [] }),
              bookTitle: trimmedTitle,
            },
      });
      if (saved.publicationPending) {
        setNotice(t(isArticle ? 'publishDialog.quickEdit.activationPending' : 'publishDialog.bookProfile.activationPending'));
        onSaved(saved);
        setSaving(false);
        return;
      }
      setNotice(t(isArticle ? 'publishDialog.quickEdit.saved' : 'publishDialog.bookProfile.saved'));
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(messageFromError(saveError, 'creation.bookProfileSaveFailed'));
      setNotice('');
      setSaving(false);
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
              {t(isArticle ? 'publishDialog.quickEdit.articleTitle' : 'publishDialog.bookProfile.title')}
            </DialogTitle>
            <DialogClose asChild>
              <AnimateButton
                unstyled
                type="button"
                aria-label={t(isArticle ? 'publishDialog.quickEdit.close' : 'publishDialog.bookProfile.close')}
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
                disabled={saving}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{t('publishDialog.fields.excerpt')}</span>
              <textarea
                value={excerpt}
                maxLength={240}
                rows={3}
                disabled={saving}
                onChange={(event) => setExcerpt(event.currentTarget.value)}
              />
            </label>
            <div className="latex-blog-field">
              <span>{t('publishDialog.fields.tags')}</span>
              <TagPicker
                value={tags}
                disabled={saving}
                max={6}
                placeholder={t('publishDialog.fields.tagPlaceholder')}
                createMode="add"
                onChange={setTags}
              />
            </div>
            <div className="latex-blog-cover-row">
              <div className={`latex-blog-cover-preview${isArticle ? '' : ' publish-dialog-book-cover'}`}>
                {coverUrl ? <img src={coverUrl} alt="" /> : <span>{isArticle ? '16:9' : '2:3'}</span>}
              </div>
              <label className="latex-blog-cover-upload">
                <Icon name="image" />
                <span>
                  {coverUrl
                    ? t('publishDialog.cover.replace')
                    : t('publishDialog.cover.upload')}
                </span>
                <input type="file" accept="image/*" disabled={busy} onChange={changeCover} />
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
            {error ? <p className="auth-dialog-error" role="alert">{error}</p> : null}
            {notice ? (
              <p className="auth-dialog-status" role="status" aria-live="polite">
                {notice}
              </p>
            ) : null}
            <div className="auth-dialog-actions">
              <AnimateButton unstyled type="button" className="auth-dialog-link" disabled={busy} onClick={closeDialog}>
                {t('common:actions.cancel')}
              </AnimateButton>
              <AnimateButton unstyled type="submit" disabled={busy}>
                {saving
                  ? t(isArticle ? 'publishDialog.quickEdit.savingAction' : 'publishDialog.bookProfile.savingAction')
                  : t(isArticle ? 'publishDialog.quickEdit.saveAction' : 'publishDialog.bookProfile.saveAction')}
              </AnimateButton>
            </div>
          </form>
        </DialogBody>
      </DialogPortal>
      {pendingCoverCrop ? (
        <ImageCropDialog
          open
          imageUrl={pendingCoverCrop.imageUrl}
          title={t(isArticle ? 'publishDialog.cover.cropBlog' : 'publishDialog.cover.cropBook')}
          aspect={isArticle ? 16 / 9 : 2 / 3}
          cropShape="rect"
          outputWidth={isArticle ? 1600 : 900}
          outputHeight={isArticle ? 900 : 1350}
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
