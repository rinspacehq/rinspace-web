import type { Crepe } from '@milkdown/crepe';
import { editorViewCtx } from '@milkdown/kit/core';
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { restoreSelectionBookmarkInCtx } from './mathMarkdown';
import {
  insertQuiverDiagramBlock,
  normalizeQuiverTikzcd,
  parseTikzcdSource,
  readQuiverExportMessage,
  renderTikzcdDiagram,
  replaceQuiverDiagramBlock,
  type TikzcdDiagramSource,
} from './quiver';

type QuiverEditorMessages = {
  notLoaded: string;
  stillLoading: string;
  timeout: string;
  exportFailed: string;
  empty: string;
  renderFailed: (error: unknown) => string;
};

type UseQuiverEditorOptions = {
  editorRef: RefObject<Crepe | null>;
  readOnlyRef?: RefObject<boolean>;
  syncingRef: RefObject<boolean>;
  skipNextMathReparseRef: RefObject<boolean>;
  closeCompetingEditor: () => void;
  normalizeMarkdown: (markdown: string) => string;
  onCommit: (markdown: string) => void;
  messages: QuiverEditorMessages;
  onExportFailure?: (error: string) => void;
  renderDiagram?: (
    source: TikzcdDiagramSource,
    replacingImageSrc: string,
  ) => Promise<{ url: string }>;
  onRenderFailure?: (
    source: TikzcdDiagramSource,
    replacingImageSrc: string,
  ) => void | Promise<void>;
};

export type OpenQuiverEditorOptions = {
  source?: string;
  replacingImageSrc?: string;
};

/** Own the shared Quiver iframe protocol and Milkdown insertion lifecycle. */
export function useQuiverEditor(options: UseQuiverEditorOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const selectionRestoreRef = useRef<(() => boolean) | null>(null);
  const replacingImageSrcRef = useRef('');
  const importSourceRef = useRef('');
  const importRequestSequenceRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const activeRequestRef = useRef<{ id: string; timeout: number } | null>(null);
  const pendingRef = useRef(false);
  const frameReadyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [error, setError] = useState('');

  pendingRef.current = pending;
  frameReadyRef.current = frameReady;

  const clearRequest = useCallback(() => {
    if (activeRequestRef.current) {
      window.clearTimeout(activeRequestRef.current.timeout);
    }
    activeRequestRef.current = null;
  }, []);

  const saveSelection = useCallback(() => {
    const { editorRef } = optionsRef.current;
    if (!editorRef.current) {
      selectionRestoreRef.current = null;
      return;
    }
    selectionRestoreRef.current = editorRef.current.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const bookmark = view.state.selection.getBookmark();
      return () => {
        if (!editorRef.current) return false;
        return editorRef.current.editor.action((restoreCtx) =>
          restoreSelectionBookmarkInCtx(restoreCtx, bookmark),
        );
      };
    });
  }, []);

  const importSource = useCallback(() => {
    const source = importSourceRef.current;
    if (!source || !frameReadyRef.current) return;
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(
      {
        scope: 'rin-quiver',
        type: 'import-tikzcd',
        requestId: `quiver-import-${Date.now()}-${++importRequestSequenceRef.current}`,
        payload: { data: source },
      },
      window.location.origin,
    );
  }, []);

  const closeEditor = useCallback(() => {
    clearRequest();
    replacingImageSrcRef.current = '';
    importSourceRef.current = '';
    setOpen(false);
    setPending(false);
    setFrameReady(false);
    setError('');
  }, [clearRequest]);

  const openEditor = useCallback(({
    source = '',
    replacingImageSrc = '',
  }: OpenQuiverEditorOptions = {}) => {
    const current = optionsRef.current;
    if (current.readOnlyRef?.current) return;
    current.closeCompetingEditor();
    selectionRestoreRef.current = null;
    replacingImageSrcRef.current = replacingImageSrc;
    importSourceRef.current = source;
    setError('');
    setPending(false);
    setFrameReady(false);
    setOpen(true);
  }, []);

  const requestExport = useCallback(() => {
    if (pendingRef.current) return;
    const target = frameRef.current?.contentWindow;
    const current = optionsRef.current;
    if (!target) {
      setError(current.messages.notLoaded);
      return;
    }
    if (!frameReadyRef.current) {
      setError(current.messages.stillLoading);
      return;
    }
    if (replacingImageSrcRef.current) {
      selectionRestoreRef.current = null;
    } else {
      saveSelection();
    }
    const requestId = `quiver-${Date.now()}-${++requestSequenceRef.current}`;
    clearRequest();
    setPending(true);
    setError('');
    activeRequestRef.current = {
      id: requestId,
      timeout: window.setTimeout(() => {
        activeRequestRef.current = null;
        setPending(false);
        setError(optionsRef.current.messages.timeout);
      }, 8000),
    };
    target.postMessage(
      {
        scope: 'rin-quiver',
        type: 'export-tikzcd',
        requestId,
      },
      window.location.origin,
    );
  }, [clearRequest, saveSelection]);

  const handleFrameLoad = useCallback(() => {
    setFrameReady(true);
    setError('');
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = readQuiverExportMessage(event.data);
      if (!message) return;
      if (!activeRequestRef.current || message.requestId !== activeRequestRef.current.id) {
        return;
      }

      clearRequest();
      setPending(false);
      if (!message.ok) {
        const current = optionsRef.current;
        if (message.error) current.onExportFailure?.(message.error);
        setError(message.error && !current.onExportFailure
          ? message.error
          : current.messages.exportFailed);
        return;
      }

      void (async () => {
        let parsedSource: TikzcdDiagramSource | null = null;
        let replacingImageSrc = '';
        try {
          parsedSource = parseTikzcdSource(
            normalizeQuiverTikzcd(message.payload?.data || ''),
          );
          if (!parsedSource) {
            setError(optionsRef.current.messages.empty);
            return;
          }
          replacingImageSrc = replacingImageSrcRef.current;
          const diagram = optionsRef.current.renderDiagram
            ? await optionsRef.current.renderDiagram(parsedSource, replacingImageSrc)
            : await renderTikzcdDiagram(parsedSource);
          closeEditor();

          const current = optionsRef.current;
          current.syncingRef.current = true;
          current.skipNextMathReparseRef.current = true;
          try {
            if (replacingImageSrc) {
              current.editorRef.current?.editor.action(
                replaceQuiverDiagramBlock(replacingImageSrc, diagram.url),
              );
            } else {
              selectionRestoreRef.current?.();
              current.editorRef.current?.editor.action(
                insertQuiverDiagramBlock(diagram.url),
              );
            }
          } catch (insertError) {
            current.syncingRef.current = false;
            throw insertError;
          }
          window.setTimeout(() => {
            const latest = optionsRef.current;
            latest.syncingRef.current = false;
            if (!latest.editorRef.current) return;
            latest.onCommit(
              latest.normalizeMarkdown(latest.editorRef.current.getMarkdown()),
            );
          }, 0);
        } catch (renderError) {
          setPending(false);
          if (parsedSource && optionsRef.current.onRenderFailure) {
            try {
              await optionsRef.current.onRenderFailure(parsedSource, replacingImageSrc);
            } catch (draftError) {
              console.error('Failed to preserve the Quiver source draft', draftError);
            }
          }
          setError(optionsRef.current.messages.renderFailed(renderError));
        }
      })();
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [clearRequest, closeEditor, open]);

  useEffect(() => {
    if (!open || !frameReady) return;
    importSource();
  }, [frameReady, importSource, open]);

  useEffect(() => clearRequest, [clearRequest]);

  return {
    frameRef,
    open,
    pending,
    frameReady,
    error,
    openEditor,
    closeEditor,
    requestExport,
    handleFrameLoad,
  };
}
