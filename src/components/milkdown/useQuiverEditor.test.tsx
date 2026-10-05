import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Crepe } from '@milkdown/crepe';
import { AnimateButton } from 'components/ui';
import { useRef } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

import { useQuiverEditor } from './useQuiverEditor';

const quiverMocks = vi.hoisted(() => ({
  insert: vi.fn(() => () => undefined),
  render: vi.fn(),
}));

vi.mock('./quiver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./quiver')>();
  return {
    ...actual,
    insertQuiverDiagramBlock: quiverMocks.insert,
    renderTikzcdDiagram: quiverMocks.render,
  };
});

const onCommit = vi.fn();
const onRenderFailure = vi.fn();
const closeCompetingEditor = vi.fn();
const editorAction = vi.fn(() => () => true);
const editor = {
  editor: { action: editorAction },
  getMarkdown: () => '# Draft\n\n![Quiver diagram](/rin/api/diagrams/diagram-1)',
} as unknown as Crepe;

function QuiverEditorHarness() {
  const editorRef = useRef<Crepe | null>(editor);
  const syncingRef = useRef(false);
  const skipNextMathReparseRef = useRef(false);
  const quiver = useQuiverEditor({
    editorRef,
    syncingRef,
    skipNextMathReparseRef,
    closeCompetingEditor,
    normalizeMarkdown: (markdown) => `normalized:${markdown}`,
    onCommit,
    onRenderFailure,
    messages: {
      notLoaded: 'not loaded',
      stillLoading: 'still loading',
      timeout: 'timed out',
      exportFailed: 'export failed',
      empty: 'empty',
      renderFailed: () => 'render failed',
    },
  });

  return (
    <>
      <AnimateButton unstyled type="button" onClick={() => quiver.openEditor()}>
        Open
      </AnimateButton>
      {quiver.open ? (
        <>
          <iframe
            ref={quiver.frameRef}
            title="Quiver test frame"
            onLoad={quiver.handleFrameLoad}
          />
          <AnimateButton unstyled type="button" onClick={quiver.requestExport}>
            Export
          </AnimateButton>
        </>
      ) : null}
    </>
  );
}

beforeEach(() => {
  onCommit.mockReset();
  onRenderFailure.mockReset();
  closeCompetingEditor.mockReset();
  editorAction.mockReset();
  editorAction.mockImplementation(() => () => true);
  quiverMocks.insert.mockClear();
  quiverMocks.render.mockReset();
  quiverMocks.render.mockResolvedValue({ url: '/rin/api/diagrams/diagram-1' });
});

test('preserves exported Quiver source when backend rendering fails', async () => {
  quiverMocks.render.mockRejectedValueOnce(new Error('renderer unavailable'));
  render(<QuiverEditorHarness />);

  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  const frame = screen.getByTitle<HTMLIFrameElement>('Quiver test frame');
  const frameWindow = frame.contentWindow;
  if (!frameWindow) throw new Error('The test iframe has no content window.');
  const postMessage = vi.spyOn(frameWindow, 'postMessage');

  fireEvent.load(frame);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  const request = postMessage.mock.calls[0]?.[0] as { requestId?: string };
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      source: frameWindow,
      data: {
        scope: 'rin-quiver',
        type: 'export-tikzcd-result',
        requestId: request.requestId,
        ok: true,
        payload: { data: '\\begin{tikzcd}A \\arrow[r] & B\\end{tikzcd}' },
      },
    }));
  });

  await waitFor(() => {
    expect(onRenderFailure).toHaveBeenCalledWith({
      body: 'A \\arrow[r] & B',
      options: '',
    }, '');
  });
  expect(onCommit).not.toHaveBeenCalled();
});

test('exports a Quiver diagram through the shared iframe protocol and commits Markdown', async () => {
  render(<QuiverEditorHarness />);

  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(closeCompetingEditor).toHaveBeenCalledTimes(1);

  const frame = screen.getByTitle<HTMLIFrameElement>('Quiver test frame');
  const frameWindow = frame.contentWindow;
  expect(frameWindow).not.toBeNull();
  if (!frameWindow) throw new Error('The test iframe has no content window.');
  const postMessage = vi.spyOn(frameWindow, 'postMessage');

  fireEvent.load(frame);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));

  const request = postMessage.mock.calls[0]?.[0] as { requestId?: string };
  expect(request.requestId).toBeTruthy();
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      source: frameWindow,
      data: {
        scope: 'rin-quiver',
        type: 'export-tikzcd-result',
        requestId: request.requestId,
        ok: true,
        payload: { data: '\\begin{tikzcd}A \\arrow[r] & B\\end{tikzcd}' },
      },
    }));
  });

  await waitFor(() => {
    expect(quiverMocks.insert).toHaveBeenCalledWith('/rin/api/diagrams/diagram-1');
    expect(onCommit).toHaveBeenCalledWith(
      'normalized:# Draft\n\n![Quiver diagram](/rin/api/diagrams/diagram-1)',
    );
  });
  expect(screen.queryByTitle('Quiver test frame')).toBeNull();
});
