import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getI18n } from 'react-i18next';
import type { ReaderHandle, ReaderView } from '@rinspacehq/embedpdf-snippet/dist/reader-api';
import { publicAsset } from '@/app/config/env';
import { Button } from '@/components/ui';
import { createReaderAgentHost } from '@/features/reader/agentHost';
import { chooseReaderPdf, identifyReaderFile } from '@/features/reader/files';
import { publicationReaderDocument } from '@/features/reader/publicationDocument';
import { getPublicationReaderView, registerReaderDocument, savePublicationReaderView } from '@/features/reader/storage';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { apiPath, requestJson, ServiceError } from '@/services/httpClient';
import { contentPath, tagReadPath } from '@/utils/routes';
import readerRelease from '../../../contracts/reader/embedpdf-release.json';
import '@/features/reader/reader.css';

type PublicationKind = 'article' | 'book' | 'tag';
type PublicationPdf = {
  kind: PublicationKind;
  id: string;
  title: string;
  version: string;
  sha256: string;
  bytes: number;
  pages: number;
  mediaType: 'application/pdf';
  fileUrl: string;
};

const isPublicationKind = (kind: string): kind is PublicationKind =>
  kind === 'article' || kind === 'book' || kind === 'tag';
const isContentId = (id: unknown): id is string => typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id);
const sourcePath = (kind: string, id: string, title?: string) => {
  if (!isContentId(id)) return '/reader';
  if (kind === 'tag') return tagReadPath(id, title);
  if (kind === 'article' || kind === 'book') return contentPath(kind === 'article' ? 'blog' : 'book', id, title);
  return '/reader';
};

type Status = 'loading' | 'ready' | 'unavailable' | 'changed' | 'error';

function pdfStatus(status: number): Status {
  if (status === 409 || status === 412) return 'changed';
  if (status === 401 || status === 403 || status === 404) return 'unavailable';
  return 'error';
}

export default function ReaderPublicationPdfPage() {
  const { kind = '', id = '' } = useParams();
  const [query] = useSearchParams();
  const requestedVersion = query.get('version');
  const requestedDigest = query.get('sha256');
  const navigate = useNavigate();
  const { t } = useFeatureTranslation('reader');
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [back, setBack] = useState(sourcePath(kind, id));
  const [attempt, setAttempt] = useState(0);
  const [viewError, setViewError] = useState(false);

  useEffect(() => {
    setStatus('loading');
    setBack(sourcePath(kind, id));
    setViewError(false);
    if (!isPublicationKind(kind) || !isContentId(id)) {
      setStatus('unavailable');
      return;
    }
    const controller = new AbortController();
    let viewer: ReaderHandle | undefined;
    let agent: ReturnType<typeof createReaderAgentHost> | undefined;
    let documentId: string | undefined;
    let hasReadyPage = false;
    let pending: ReaderView | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const persist = () => {
      if (!pending || !documentId) return;
      const view = pending;
      pending = undefined;
      void savePublicationReaderView(documentId, view).catch(() => {
        if (!controller.signal.aborted) setViewError(true);
      });
    };
    const visibility = () => { if (document.visibilityState === 'hidden') persist(); };
    const stop = () => {
      controller.abort();
      clearTimeout(timer);
      persist();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', persist);
      viewer?.destroy();
      viewer = undefined;
      agent?.dispose();
      agent = undefined;
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', persist);
    void (async () => {
      try {
        const publication = await requestJson<PublicationPdf>(`publications/${kind}/${id}/pdf`, {
          auth: 'optional', signal: controller.signal, cache: 'no-store',
        });
        if (controller.signal.aborted || !mount.current) return;
        const { version, sha256, bytes, pages, title } = publication;
        const expectedUrl = apiPath(`publications/${kind}/${publication.id}/pdf/${version}/${sha256}/file`);
        if (publication.kind !== kind || !isContentId(publication.id) || (kind !== 'tag' && id !== publication.id)
            || !/^v1-[0-9a-f]{64}$/.test(version) || !/^[0-9a-f]{64}$/.test(sha256)
            || !Number.isSafeInteger(bytes) || bytes < 1 || !Number.isSafeInteger(pages) || pages < 1
            || typeof title !== 'string' || publication.mediaType !== 'application/pdf' || publication.fileUrl !== expectedUrl)
          throw new Error('Invalid publication PDF metadata');

        const closePath = sourcePath(kind, publication.id, title);
        setBack(closePath);
        if ((requestedVersion && requestedVersion !== version) || (requestedDigest && requestedDigest !== sha256)) {
          setStatus('changed');
          return;
        }
        const identity = `publication:${kind}:${publication.id}:${sha256}`;
        documentId = identity;
        const assets = `/assets/reader/${readerRelease.version}`;
        const moduleUrl = new URL(publicAsset(`${assets}/embedpdf.js`), location.origin).href;
        const [pdf, view] = await Promise.all([
          import(/* @vite-ignore */ moduleUrl) as Promise<typeof import('@rinspacehq/embedpdf-snippet/dist/reader')>,
          getPublicationReaderView(identity).catch(() => {
            if (!controller.signal.aborted) setViewError(true);
            return undefined;
          }),
        ]);
        if (controller.signal.aborted || !mount.current) return;
        const document = { id: identity, title, size: bytes, lastModified: 0, contentVersion: sha256, pageCount: pages };
        const etag = `"sha256-${sha256}"`;
        agent = createReaderAgentHost(document, publicationReaderDocument(document, expectedUrl, etag, controller.signal));
        const handle = await pdf.initReader({
          target: mount.current, signal: controller.signal,
          wasmUrl: new URL(publicAsset(`${assets}/pdfium.wasm`), location.origin).href,
          documentId: identity, title, view, host: agent.host,
          locale: getI18n().resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en',
          rangeSource: { url: expectedUrl, bytes, etag },
          onRangeError: code => { if (!controller.signal.aborted) { stop(); setStatus(pdfStatus(code)); } },
          onOpenFile: () => {
            void (async () => {
              try {
                const selection = await chooseReaderPdf();
                if (!selection || controller.signal.aborted) return;
                const fingerprint = await identifyReaderFile(selection.file, controller.signal);
                const next = await registerReaderDocument(selection, fingerprint);
                if (!controller.signal.aborted) navigate(`/reader/pdf/local/${next.id}`, { replace: true });
              } catch { if (!controller.signal.aborted) { stop(); setStatus('error'); } }
            })();
          },
          onClose: () => navigate(closePath, { replace: true }),
          onReady: count => {
            if (controller.signal.aborted) return;
            if (count !== pages) { stop(); setStatus('error'); return; }
            hasReadyPage = true;
            setStatus('ready');
          },
          onViewChange: next => {
            if (!hasReadyPage || controller.signal.aborted) return;
            pending = next;
            clearTimeout(timer);
            timer = setTimeout(persist, 350);
          },
        });
        if (controller.signal.aborted) handle.destroy(); else viewer = handle;
      } catch (error) {
        if (controller.signal.aborted) return;
        stop();
        setStatus(error instanceof ServiceError ? pdfStatus(error.status) : 'error');
      }
    })();
    return stop;
  }, [kind, id, requestedVersion, requestedDigest, attempt, navigate]);

  const failed = status !== 'ready' && status !== 'loading';
  return <main className={failed ? 'reader-file-state' : 'reader-viewer'}>
    {status === 'loading' && <p role="status" className="reader-annotation-status">{t('pdfReading.loading')}</p>}
    {status === 'ready' && viewError && <p role="status" className="reader-annotation-status">{t('library.storageError')}</p>}
    {failed && <>
      <p role="alert">{t(status === 'error' ? 'pdfReading.error' : `publicationPdf.${status}`)}</p>
      {status === 'changed' && <Link to={`/reader/pdf/publication/${kind}/${id}`} replace onClick={() => setAttempt(value => value + 1)}>{t('publicationPdf.reopen')}</Link>}
      {status === 'error' && <Button onClick={() => setAttempt(value => value + 1)}>{t('publicationPdf.retry')}</Button>}
      <Link to={back} replace>{t('publicationPdf.back')}</Link>
    </>}
    <div ref={mount} hidden={failed} />
  </main>;
}
