import type { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { replaceAll } from '@milkdown/kit/utils';
import {
  forwardRef,
  type CSSProperties,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import LoadingState from '@/components/LoadingState';
import { createRinMilkdownEditor } from '@/components/milkdown/editor';
import { createMilkdownInteractions } from '@/components/milkdown/interactions';
import { createMathReparseController } from '@/components/milkdown/mathReparse';
import { insertLatexBlockInCtx } from '@/components/milkdown/mathCommands';
import { normalizeMilkdownMathMarkdown } from '@/components/milkdown/mathMarkdown';
import {
  LatexBlockEditorPanel,
  useLatexBlockEditor,
} from '@/components/milkdown/LatexBlockEditor';
import {
  isRepositoryQuiverImageUrl,
  normalizeQuiverImages,
  renderTikzcdRepositoryDiagram,
  tikzcdDiagramSourceText,
} from '@/components/milkdown/quiver';
import {
  MilkdownRepositoryAssetHost,
  type RepositoryFileInput,
} from '@/components/milkdown/repositoryAssets';
import { applyMilkdownTopBarLabels } from '@/components/milkdown/topBar';
import QuiverDialog from '@/components/milkdown/QuiverDialog';
import { useQuiverEditor } from '@/components/milkdown/useQuiverEditor';
import { uploadAnswerFile } from '@/services/domains/publication';
import { messageFromError } from '@/services/errors';
import { markdownWithoutDefaultTemplate } from '@/utils/markdownTitle';

export type RinMilkdownEditorHandle = {
  getValue: () => string;
  collectRepositoryFiles: (markdown?: string) => Promise<RepositoryFileInput[]>;
  snapshotRepositoryFiles: () => RepositoryFileInput[];
  hasPendingQuiver: (markdown?: string) => boolean;
  clearPersistedRepositoryFiles: () => Promise<void>;
};

type RinMilkdownEditorProps = {
  id?: string;
  value: string;
  minHeight?: string;
  placeholder?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onReady?: (ready: boolean) => void;
  onError?: (message: string) => void;
  repositoryAssets?: boolean;
  repositoryFiles?: RepositoryFileInput[];
  assetNamespace?: string;
  resolveRepositoryAssetUrl?: (path: string) => string;
};

const defaultQuiverFrameSrc = '/quiver/?rinWriter=1';
const editorTopBarLabels = {
  toolbar: 'Markdown 编辑工具',
  heading: '段落与标题',
  items: [
    '粗体',
    '斜体',
    '删除线',
    '行内代码',
    '无序列表',
    '有序列表',
    '任务列表',
    '插入链接',
    '插入图片',
    '插入表格',
    '插入代码块',
    '插入引用',
    '插入分隔线',
    '插入公式',
    '插入交换图',
  ],
};

function applyEditorAccessibility(host: HTMLDivElement, ariaLabel: string) {
  host.querySelector<HTMLElement>('.ProseMirror')?.setAttribute('aria-label', ariaLabel);
  applyMilkdownTopBarLabels(host, editorTopBarLabels);
}

const bodyHeadingOptions = [
  { label: 'Paragraph', level: null },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
  { label: 'Heading 4', level: 4 },
  { label: 'Heading 5', level: 5 },
  { label: 'Heading 6', level: 6 },
];

function cleanEditorMarkdown(markdown: string) {
  return normalizeMilkdownMathMarkdown(markdownWithoutDefaultTemplate(markdown));
}

const RinMilkdownEditor = forwardRef<RinMilkdownEditorHandle, RinMilkdownEditorProps>(
  function RinMilkdownEditor(
    {
      id,
      value,
      minHeight = '220px',
      placeholder = '写下内容...',
      ariaLabel,
      readOnly = false,
      className = '',
      onChange,
      onReady,
      onError,
      repositoryAssets = false,
      repositoryFiles = [],
      assetNamespace = `rin-milkdown:${id || 'editor'}`,
      resolveRepositoryAssetUrl,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<Crepe | null>(null);
    const markdownRef = useRef(value);
    const skipNextMathReparseRef = useRef(false);
    const syncingRef = useRef(false);
    const readOnlyRef = useRef(readOnly);
    const [editorReady, setEditorReady] = useState(false);
    const [repositoryAssetsReady, setRepositoryAssetsReady] = useState(!repositoryAssets);
    const assetHost = useMemo(
      () => repositoryAssets
        ? new MilkdownRepositoryAssetHost(assetNamespace, resolveRepositoryAssetUrl)
        : null,
      [assetNamespace, repositoryAssets],
    );

    useImperativeHandle(ref, () => ({
      getValue: () => markdownRef.current,
      collectRepositoryFiles: (markdown) => assetHost?.collectRepositoryFiles(markdown) || Promise.resolve([]),
      snapshotRepositoryFiles: () => assetHost?.snapshotRepositoryFiles() || [],
      hasPendingQuiver: (markdown) => assetHost?.hasPendingQuiver(markdown) || false,
      clearPersistedRepositoryFiles: () => assetHost?.clearPersistedRepositoryFiles() || Promise.resolve(),
    }), [assetHost]);

    useEffect(() => {
      assetHost?.setRepositoryUrlResolver(resolveRepositoryAssetUrl);
    }, [assetHost, resolveRepositoryAssetUrl]);

    useEffect(() => () => assetHost?.dispose(), [assetHost]);

    useEffect(() => {
      let cancelled = false;
      if (!assetHost) {
        setRepositoryAssetsReady(true);
        return undefined;
      }
      setRepositoryAssetsReady(false);
      void assetHost.importRepositoryFiles(repositoryFiles).then(() => {
        if (!cancelled) setRepositoryAssetsReady(true);
      });
      return () => {
        cancelled = true;
      };
    }, [assetHost, repositoryFiles]);

    useEffect(() => {
      readOnlyRef.current = readOnly;
    }, [readOnly]);

    const emitChange = (next: string) => {
      markdownRef.current = next;
      onChange(next);
    };

    const {
      editor: latexEditor,
      editorHandleRef: latexEditorHandleRef,
      closeEditor: closeLatexBlockEditor,
      changeValue: changeLatexBlockValue,
      submitAndContinue: submitLatexBlockAndContinue,
      openEditorAtPos: openLatexBlockEditorAtPos,
      openEditorFromFocus: openFocusedLatexBlockEditor,
      openEditorFromPointer: openLatexBlockEditor,
      openEditorFromShortcut,
      openFocusedEditor: openNewFocusedLatexBlockEditor,
    } = useLatexBlockEditor({
      editorRef,
      readOnlyRef,
      skipNextMathReparseRef,
      normalizeMarkdown: (markdown) => cleanEditorMarkdown(assetHost?.serializeMarkdown(markdown) || markdown),
      onCommit: emitChange,
    });

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
      syncingRef,
      skipNextMathReparseRef,
      closeCompetingEditor: closeLatexBlockEditor,
      normalizeMarkdown: (markdown) =>
        normalizeQuiverImages(markdownWithoutDefaultTemplate(assetHost?.serializeMarkdown(markdown) || markdown)),
      onCommit: emitChange,
      messages: {
        notLoaded: 'Quiver 尚未加载完成',
        stillLoading: 'Quiver 正在加载，请稍后再插入',
        timeout: 'Quiver 导出超时，请确认弹层已加载完成',
        exportFailed: 'Quiver 导出失败',
        empty: '请先在 Quiver 中画一个图表，再点击插入',
        renderFailed: (error) =>
          messageFromError(error, 'creation.quiverRenderFailed'),
      },
      renderDiagram: assetHost ? async (source, replacingImageSrc) => {
        const rendered = await renderTikzcdRepositoryDiagram(source, {
          legacyMigration: Boolean(replacingImageSrc) && !isRepositoryQuiverImageUrl(replacingImageSrc),
        });
        const staged = await assetHost.stageQuiver(
          tikzcdDiagramSourceText(source),
          rendered.svg,
          replacingImageSrc,
        );
        return { url: staged.previewUrl };
      } : undefined,
      onRenderFailure: assetHost ? async (source, replacingImageSrc) => {
        await assetHost.stagePendingQuiver(tikzcdDiagramSourceText(source), replacingImageSrc);
      } : undefined,
    });

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || !editorReady) return;
      const nextValue = cleanEditorMarkdown(value || '');
      if (nextValue === markdownRef.current) return;
      syncingRef.current = true;
      markdownRef.current = nextValue;
      editor.editor.action(replaceAll(assetHost?.hydrateMarkdown(nextValue) || nextValue, true));
      window.setTimeout(() => {
        syncingRef.current = false;
      }, 0);
    }, [assetHost, value, editorReady]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host || !repositoryAssetsReady) return undefined;
      onReady?.(false);
      setEditorReady(false);
      host.innerHTML = '';
      const initialValue = cleanEditorMarkdown(value || '');
      markdownRef.current = initialValue;
      const {
        clear: clearMathReparseTimer,
        hasActiveSelection: editorHasActiveSelection,
        markHandled: markMathReparseHandled,
        replaceAllWhenInactive: replaceAllWhenEditorInactive,
        schedule: scheduleMathReparse,
      } = createMathReparseController({
        host,
        editorRef,
        markdownRef,
        syncingRef,
      });
      const editor = createRinMilkdownEditor({
        root: host,
        defaultValue: assetHost?.hydrateMarkdown(initialValue) || initialValue,
        headingOptions: bodyHeadingOptions,
        placeholder,
        openMath: (ctx) => {
          closeLatexBlockEditor();
          clearMathReparseTimer();
          skipNextMathReparseRef.current = true;
          const pos = insertLatexBlockInCtx(ctx);
          if (pos === false) {
            skipNextMathReparseRef.current = false;
            return;
          }
          window.requestAnimationFrame(() => {
            if (openLatexBlockEditorAtPos(pos)) return;
            window.setTimeout(() => {
              openLatexBlockEditorAtPos(pos);
            }, 50);
          });
        },
        openQuiver: () => openQuiverDialog(),
        uploadImage: assetHost
          ? async (file) => (await assetHost.stageImage(file)).previewUrl
          : (file) => uploadAnswerFile('post', file),
        imageCaptionPlaceholder: '图片说明',
        imageUploadPlaceholder: '上传图片',
      });
      const interactions = createMilkdownInteractions({
        host,
        editorRef,
        readOnlyRef,
        scheduleMathReparse,
        openLatexFromPointer: openLatexBlockEditor,
        openLatexFromFocus: openFocusedLatexBlockEditor,
        openLatexFromShortcut: openEditorFromShortcut,
        openFocusedLatex: openNewFocusedLatexBlockEditor,
        openQuiver: openQuiverDialog,
        onQuiverSourceError: (error) => {
          onError?.(messageFromError(error, 'creation.quiverSourceLoadFailed'));
        },
        loadQuiverSource: assetHost
          ? (imageSrc) => assetHost.readQuiverSource(imageSrc)
          : undefined,
        onSynchronized: () => {
          applyEditorAccessibility(host, ariaLabel || 'Markdown 编辑器');
        },
      });
      editorRef.current = editor;
      editor.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          const cleanMarkdown = cleanEditorMarkdown(assetHost?.serializeMarkdown(markdown) || markdown);
          markdownRef.current = cleanMarkdown;
          if (syncingRef.current) return;
          emitChange(cleanMarkdown);
          if (skipNextMathReparseRef.current) {
            skipNextMathReparseRef.current = false;
            markMathReparseHandled(cleanMarkdown);
            return;
          }
          if (cleanMarkdown !== markdown) {
            if (editorHasActiveSelection()) return;
            syncingRef.current = true;
            replaceAllWhenEditorInactive(assetHost?.hydrateMarkdown(cleanMarkdown) || cleanMarkdown);
            window.setTimeout(() => {
              syncingRef.current = false;
            }, 0);
            return;
          }
        });
      });
      void editor
        .create()
        .then(() => {
          const rawMarkdown = editor.getMarkdown();
          const currentMarkdown = assetHost?.serializeMarkdown(rawMarkdown) || rawMarkdown;
          const cleanMarkdown = cleanEditorMarkdown(currentMarkdown);
          markdownRef.current = cleanMarkdown;
          if (cleanMarkdown !== currentMarkdown) {
            replaceAllWhenEditorInactive(assetHost?.hydrateMarkdown(cleanMarkdown) || cleanMarkdown);
          }
          scheduleMathReparse(cleanMarkdown);
          interactions.attach();
          setEditorReady(true);
          onReady?.(true);
        })
        .catch((createError) => {
          const message = messageFromError(createError, 'creation.markdownEditorFailed');
          onError?.(message);
        });
      return () => {
        clearMathReparseTimer();
        interactions.destroy();
        closeLatexBlockEditor(false);
        editor.destroy();
        editorRef.current = null;
        setEditorReady(false);
        onReady?.(false);
      };
    }, [assetHost, repositoryAssetsReady]);

    return (
      <>
        <div
          id={id}
          ref={hostRef}
          className={[
            'milkdown-editor-host',
            'rin-milkdown-editor-host',
            readOnly ? 'rin-milkdown-readonly' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={ariaLabel}
          style={{ '--rin-milkdown-min-height': minHeight } as CSSProperties}
        />
        {!editorReady ? <LoadingState variant="strip" /> : null}
        {latexEditor ? (
          <LatexBlockEditorPanel
            editor={latexEditor}
            editorHandleRef={latexEditorHandleRef}
            onChange={changeLatexBlockValue}
            onSubmit={submitLatexBlockAndContinue}
          />
        ) : null}
        {quiverOpen ? (
          <QuiverDialog
            frameRef={quiverFrameRef}
            frameSrc={defaultQuiverFrameSrc}
            frameReady={quiverFrameReady}
            pending={quiverPending}
            error={quiverError}
            onClose={closeQuiverDialog}
            onRequestExport={requestQuiverTikzcd}
            onFrameLoad={handleQuiverFrameLoad}
          />
        ) : null}
      </>
    );
  },
);

export default RinMilkdownEditor;
