import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getI18n } from 'react-i18next';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type { ReaderHandle } from '@rinspacehq/embedpdf-snippet/dist/reader-api';
import { Button } from '@/components/ui';
import { publicAsset } from '@/app/config/env';
import { chooseReaderPdf, identifyReaderFile, resolveReaderFile } from '@/features/reader/files';
import { getReaderDocument, getReaderThumbnail, markReaderOpened, registerReaderDocument, saveReaderProgress, saveReaderThumbnail } from '@/features/reader/storage';
import { createReaderAgentHost } from '@/features/reader/agentHost';
import type { ReaderDocument, ReaderProgress } from '@/features/reader/types';
import '@/features/reader/reader.css';
import readerRelease from '../../../contracts/reader/embedpdf-release.json';

export default function ReaderPdfPage() {
  const { localId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useFeatureTranslation('reader');
  const translate = useRef(t);
  translate.current = t;
  const mount = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<ReaderDocument>();
  const [file, setFile] = useState<File>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const choose = useCallback(async () => {
    try {
      const selection = await chooseReaderPdf();
      if (!selection) return;
      setLoading(true); setError('');
      const version = await identifyReaderFile(selection.file);
      const next = await registerReaderDocument(selection, version);
      if (next.id === localId) { setDocument(next); setFile(selection.file); }
      else navigate(`/reader/pdf/local/${next.id}`, { replace: true });
    } catch (caught) { setError(caught instanceof Error ? caught.message : translate.current('library.storageError')); }
    finally { setLoading(false); }
  }, [localId, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    setDocument(undefined); setFile(undefined); setLoading(true); setError('');
    void (async () => {
      try {
        const doc = await getReaderDocument(localId);
        if (controller.signal.aborted) return;
        if (!doc) throw new Error(translate.current('library.missing'));
        setDocument(doc);
        const resolved = await resolveReaderFile(doc);
        if (!resolved || controller.signal.aborted) return;
        const version = await identifyReaderFile(resolved, controller.signal);
        if (version !== doc.contentVersion) {
          const next = await registerReaderDocument({ file: resolved, handle: doc.handle }, version);
          if (!controller.signal.aborted) navigate(`/reader/pdf/local/${next.id}`, { replace: true });
          return;
        }
        if (!controller.signal.aborted) setFile(resolved);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : translate.current('library.storageError')); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); };
  }, [localId, navigate, attempt]);

  useEffect(() => {
    if (!file || !document || !mount.current) return;
    let disposed = false;
    let viewer: ReaderHandle | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let saveQueue = Promise.resolve();
    let revision = document.progress?.revision ?? 0;
    let conflict = false;
    let pending: ReaderProgress | undefined;
    const agent = createReaderAgentHost(document);
    const persist = () => {
      if (!pending || conflict) return;
      const progress = pending; pending = undefined;
      saveQueue = saveQueue.then(async () => {
        const saved = await saveReaderProgress(document.id, document.contentVersion, progress, revision);
        if (saved.progress?.revision !== revision + 1) { conflict = true; return; }
        revision++;
      }).catch(() => { if (!disposed) setError(translate.current('library.storageError')); });
    };
    const visibility = () => { if (globalThis.document.visibilityState === 'hidden') persist(); };
    globalThis.document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', persist);
    void (async () => {
      try {
        const moduleUrl = new URL(publicAsset(`/assets/reader/${readerRelease.version}/embedpdf.js`), location.origin).href;
        const pdf = await import(/* @vite-ignore */ moduleUrl) as typeof import('@rinspacehq/embedpdf-snippet/dist/reader');
        const buffer = await file.arrayBuffer();
        if (disposed || !mount.current) return;
        const handle = await pdf.initReader({ target: mount.current,
          wasmUrl: new URL(publicAsset(`/assets/reader/${readerRelease.version}/pdfium.wasm`), location.origin).href,
          documentId: document.id, title: document.title, buffer, host: agent.host, view: document.progress,
          locale: getI18n().resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en',
          onOpenFile: () => { void choose(); }, onClose: () => navigate('/reader'),
          onViewChange: view => {
            if (disposed) return;
            pending = { ...view, revision };
            clearTimeout(timer); timer = setTimeout(persist, 350);
          },
          onReady: pageCount => {
            if (disposed) return;
            void markReaderOpened(document.id, pageCount).catch(() => setError(translate.current('library.storageError')));
            requestAnimationFrame(() => { void (async () => {
              if (disposed || await getReaderThumbnail(document.id)) return;
              const blob = await viewer?.thumbnail();
              if (blob && !disposed) await saveReaderThumbnail(document.id, blob);
            })().catch(() => {}); });
          },
        });
        if (disposed) handle.destroy(); else viewer = handle;
      } catch (caught) { if (!disposed) setError(caught instanceof Error ? caught.message : translate.current('pdfReading.error')); }
    })();
    return () => {
      persist(); disposed = true; clearTimeout(timer);
      globalThis.document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', persist);
      agent.dispose(); viewer?.destroy();
    };
  }, [file, document, choose, navigate]);

  if (!file) return <main className="reader-file-state">
    <p role={error ? 'alert' : 'status'}>{error || (loading ? t('library.loading') : t('library.unavailable'))}</p>
    {!loading && <Button onClick={() => { void choose(); }}>{t('library.reselect')}</Button>}
    {!loading && document?.handle && <Button onClick={() => {
      void resolveReaderFile(document, true).then(resolved => { if (resolved) setAttempt(value => value + 1); }).catch(caught => setError(String(caught)));
    }}>{t('library.permission')}</Button>}
    <Link to="/reader">{t('library.back')}</Link>
  </main>;
  return <main className="reader-viewer">{error && <div role="alert" className="reader-viewer-error">{error}</div>}<div ref={mount} /></main>;
}
