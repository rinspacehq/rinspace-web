import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { BookOpen, FolderOpen, MoreHorizontal, Search } from 'lucide-react';
import { AnimateButton, AnimateIconButton, Menu, MenuTrigger, MenuContent, MenuItem } from 'components/ui';
import { AnimateTabs, AnimateTabsList, AnimateTabsTrigger } from '@/components/animate-ui/tabs';
import { chooseReaderPdf, identifyReaderFile } from '@/features/reader/files';
import { clearReaderLocalData, getReaderThumbnail, listReaderDocuments, registerReaderDocument, removeReaderRecent, setReaderShelf } from '@/features/reader/storage';
import type { ReaderDocument } from '@/features/reader/types';
import '@/features/reader/reader.css';

function ReaderBook({ document, recent, onError }: { document: ReaderDocument; recent: boolean; onError: (error: unknown) => void }) {
  const { t, i18n } = useFeatureTranslation('reader');
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void getReaderThumbnail(document.id).then(item => {
        if (item && !cancelled) { url = URL.createObjectURL(item.blob); setCover(url); }
      }).catch(onError);
    });
    if (ref.current) observer.observe(ref.current);
    return () => { cancelled = true; observer.disconnect(); if (url) URL.revokeObjectURL(url); };
  }, [document.id, onError]);
  const run = (work: Promise<unknown>) => { void work.catch(onError); };
  return <article className="reader-book" ref={ref}>
    <button type="button" className="reader-book-open" onClick={() => navigate(`/reader/pdf/local/${document.id}`)}>
      <span className="reader-cover">{cover ? <img src={cover} alt="" /> : <BookOpen size={32} aria-hidden="true" />}</span>
      <span className="reader-book-title">{document.title.replace(/\.pdf$/i, '')}</span>
    </button>
    <div className="reader-book-footer">
      <div><span>{document.pageCount ? t('library.progress', { page: (document.progress?.pageIndex ?? 0) + 1, total: document.pageCount }) : t('library.unread')}</span>
        {recent && document.lastOpenedAt && <time dateTime={new Date(document.lastOpenedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(document.lastOpenedAt)}</time>}
      </div>
      <Menu><MenuTrigger asChild><AnimateIconButton label={t('library.more')} icon={<MoreHorizontal size={18} />} /></MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => run(setReaderShelf(document.id, !document.shelfAddedAt))}>{t(document.shelfAddedAt ? 'library.removeShelf' : 'library.addShelf')}</MenuItem>
          {recent && <MenuItem onSelect={() => run(removeReaderRecent(document.id))}>{t('library.removeRecent')}</MenuItem>}
        </MenuContent>
      </Menu>
    </div>
  </article>;
}

export default function ReaderPage() {
  const { t } = useFeatureTranslation('reader');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'shelf' ? 'shelf' : 'recent';
  const [documents, setDocuments] = useState<ReaderDocument[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | undefined>(undefined);
  const onError = useCallback((value: unknown) => setError(value instanceof Error ? value.message : t('library.storageError')), [t]);
  const load = useCallback(() => { void listReaderDocuments().then(setDocuments).catch(onError); }, [onError]);
  useEffect(() => {
    load();
    window.addEventListener('rinspace-reader-library-change', load);
    window.addEventListener('focus', load);
    return () => { window.removeEventListener('rinspace-reader-library-change', load); window.removeEventListener('focus', load); controller.current?.abort(); };
  }, [load]);
  const open = async () => {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      const selected = await chooseReaderPdf();
      if (!selected) return;
      controller.current = new AbortController();
      const version = await identifyReaderFile(selected.file, controller.current.signal);
      const doc = await registerReaderDocument(selected, version);
      navigate(`/reader/pdf/local/${doc.id}`);
    } catch (value) { if (!(value instanceof DOMException && value.name === 'AbortError')) onError(value); }
    finally { setBusy(false); }
  };
  const shown = documents.filter(doc => (tab === 'recent' ? doc.lastOpenedAt : doc.shelfAddedAt) && doc.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => tab === 'recent' ? (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) : (b.shelfAddedAt ?? 0) - (a.shelfAddedAt ?? 0));
  return <main className="reader-library">
    <div className="reader-heading"><h1>{t('title')}</h1><div className="reader-heading-actions">
      <AnimateButton onClick={() => { void open(); }} disabled={busy}><FolderOpen size={17} />{t(busy ? 'library.opening' : 'library.open')}</AnimateButton>
      <Menu><MenuTrigger asChild><AnimateIconButton label={t('library.more')} icon={<MoreHorizontal size={18} />} /></MenuTrigger><MenuContent align="end">
        <MenuItem onSelect={() => { if (window.confirm(t('library.clearConfirm'))) void clearReaderLocalData().catch(onError); }}>{t('library.clear')}</MenuItem>
      </MenuContent></Menu>
    </div></div>
    <section className="reader-surface">
      <div className="reader-toolbar">
        <AnimateTabs value={tab} onValueChange={value => setParams(value === 'shelf' ? { tab: value } : {})}>
          <AnimateTabsList aria-label={t('title')}><AnimateTabsTrigger value="recent" aria-controls="reader-documents">{t('library.recent')}</AnimateTabsTrigger><AnimateTabsTrigger value="shelf" aria-controls="reader-documents">{t('library.shelf')}</AnimateTabsTrigger></AnimateTabsList>
        </AnimateTabs>
        <label className="reader-search"><Search size={17} /><input type="search" aria-label={t('library.search')} placeholder={t('library.search')} value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      {error && <p className="reader-error" role="alert">{error}</p>}
      <div id="reader-documents" role="tabpanel" aria-label={t(tab === 'recent' ? 'library.recent' : 'library.shelf')}>
        {shown.length ? <div className="reader-grid">{shown.map(doc => <ReaderBook key={doc.id} document={doc} recent={tab === 'recent'} onError={onError} />)}</div> : <div className="reader-empty">{t(query ? 'library.noResults' : tab === 'recent' ? 'library.emptyRecent' : 'library.emptyShelf')}</div>}
      </div>
    </section>
  </main>;
}
