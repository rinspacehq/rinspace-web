import { AnimateButton } from 'components/ui';
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  defaultQuiverDialogLayout,
  fitQuiverDialogLayout,
  quiverResizeEdges,
  resizeQuiverDialogLayout,
  type QuiverDialogLayout,
  type QuiverResizeEdge,
} from '@/utils/quiverDialogLayout';

type QuiverDialogInteraction = {
  mode: 'drag' | 'resize';
  edge?: QuiverResizeEdge;
  pointerId: number;
  startX: number;
  startY: number;
  startLayout: QuiverDialogLayout;
};

type QuiverDialogProps = {
  frameRef: RefObject<HTMLIFrameElement | null>;
  frameSrc: string;
  frameReady: boolean;
  pending: boolean;
  error: string;
  ariaLabel?: string;
  helpText?: string;
  cancelLabel?: string;
  insertLabel?: string;
  loadingLabel?: string;
  exportingLabel?: string;
  onClose: () => void;
  onRequestExport: () => void;
  onFrameLoad: () => void;
};

export default function QuiverDialog({
  frameRef,
  frameSrc,
  frameReady,
  pending,
  error,
  ariaLabel = 'Quiver 交换图编辑器',
  helpText = '导出为图片并插入当前光标位置',
  cancelLabel = '取消',
  insertLabel = '插入',
  loadingLabel = '加载中',
  exportingLabel = '导出中',
  onClose,
  onRequestExport,
  onFrameLoad,
}: QuiverDialogProps) {
  const interactionRef = useRef<QuiverDialogInteraction | null>(null);
  const [layout, setLayout] = useState<QuiverDialogLayout>(() =>
    defaultQuiverDialogLayout(),
  );
  const [interacting, setInteracting] = useState(false);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode: 'drag',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: layout,
    };
    setInteracting(true);
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLElement>,
    edge: QuiverResizeEdge,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode: 'resize',
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: layout,
    };
    setInteracting(true);
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      event.preventDefault();
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;
      if (interaction.mode === 'drag') {
        setLayout(
          fitQuiverDialogLayout({
            ...interaction.startLayout,
            left: interaction.startLayout.left + deltaX,
            top: interaction.startLayout.top + deltaY,
          }),
        );
        return;
      }
      if (interaction.edge) {
        setLayout(
          resizeQuiverDialogLayout(
            interaction.startLayout,
            interaction.edge,
            deltaX,
            deltaY,
          ),
        );
      }
    };

    const endPointerInteraction = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      interactionRef.current = null;
      setInteracting(false);
    };

    const handleViewportResize = () => {
      setLayout((current) => fitQuiverDialogLayout(current));
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endPointerInteraction);
    window.addEventListener('pointercancel', endPointerInteraction);
    window.addEventListener('resize', handleViewportResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endPointerInteraction);
      window.removeEventListener('pointercancel', endPointerInteraction);
      window.removeEventListener('resize', handleViewportResize);
    };
  }, []);

  return (
    <section
      className={[
        'rin-quiver-dialog',
        interacting ? 'rin-quiver-dialog-interacting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      style={{
        left: `${layout.left}px`,
        top: `${layout.top}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
      }}
    >
      <div
        className="rin-quiver-dialog-title"
        role="presentation"
        onPointerDown={beginDrag}
      >
        <div>
          <strong>Quiver</strong>
          <span>{helpText}</span>
        </div>
        <div className="rin-quiver-dialog-actions">
          <AnimateButton unstyled type="button" onClick={onClose}>
            {cancelLabel}
          </AnimateButton>
          <AnimateButton
            unstyled
            type="button"
            className="primary"
            disabled={pending || !frameReady}
            onClick={onRequestExport}
          >
            {pending ? exportingLabel : frameReady ? insertLabel : loadingLabel}
          </AnimateButton>
        </div>
      </div>
      {error ? <div className="rin-quiver-dialog-error">{error}</div> : null}
      <iframe
        ref={frameRef}
        className="rin-quiver-frame"
        title="Quiver commutative diagram editor"
        src={frameSrc}
        onLoad={onFrameLoad}
      />
      {quiverResizeEdges.map((edge) => (
        <span
          aria-hidden="true"
          className={`rin-quiver-dialog-resize rin-quiver-dialog-resize-${edge}`}
          key={edge}
          onPointerDown={(event) => beginResize(event, edge)}
        />
      ))}
    </section>
  );
}
