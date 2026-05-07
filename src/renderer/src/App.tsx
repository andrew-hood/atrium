import { type PointerEvent, useEffect, useState } from 'react';
import { Editor, Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { EmptyState } from './EmptyState';
import { IdeasPanel } from './IdeasPanel';
import { SessionDetailsPanel } from './SessionDetailsPanel';
import { useSessionUpdates } from './hooks/useSessionUpdates';
import { customShapeUtils } from './shapes';
import { SESSION_STICKY_TYPE, type SessionStickyShape } from './shapes/session-sticky/SessionStickyShape';

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [emptyDismissed, setEmptyDismissed] = useState(false);
  const [selectedSessionShape, setSelectedSessionShape] = useState<SessionStickyShape | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [ideasCollapsed, setIdeasCollapsed] = useState(false);
  useSessionUpdates(editor);

  useEffect(() => {
    if (!editor) return;

    function check() {
      const hasShapes = editor!.getCurrentPageShapes().length > 0;
      setCanvasEmpty((current) => (current === !hasShapes ? current : !hasShapes));
    }

    check();
    const unsub = editor.store.listen(check, { source: 'all', scope: 'all' });
    return unsub;
  }, [editor]);

  useEffect(() => {
    if (!canvasEmpty) setEmptyDismissed(false);
  }, [canvasEmpty]);

  useEffect(() => {
    if (!editor) {
      setSelectedSessionShape(null);
      return;
    }
    const currentEditor = editor;

    function checkSelection() {
      setSelectedSessionShape((current) => {
        const next = getSelectedSessionShape(currentEditor);
        return current === next ? current : next;
      });
    }

    checkSelection();
    const unsub = currentEditor.store.listen(checkSelection, { source: 'all', scope: 'all' });
    return unsub;
  }, [editor]);

  function handleDetailsClose() {
    setSelectedSessionShape(null);
    editor?.selectNone();
  }

  function handleOpenIdeas() {
    setIdeasOpen(true);
    setIdeasCollapsed(false);
  }

  function handleMinimizeIdeas() {
    setIdeasCollapsed(true);
  }

  const showIdeasPanel = Boolean(editor && ideasOpen && !ideasCollapsed);
  const showIdeasRail = Boolean(editor && (!ideasOpen || ideasCollapsed));
  const shellClassName = [
    'atrium-shell',
    showIdeasPanel ? 'atrium-shell--side-open' : '',
    showIdeasRail ? 'atrium-shell--side-rail' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className={shellClassName}>
      <div className="atrium-canvas-frame">
        <Tldraw persistenceKey="atrium-canvas" shapeUtils={customShapeUtils} onMount={setEditor} />
        {canvasEmpty && !emptyDismissed && editor && (
          <EmptyState editor={editor} onDismiss={() => setEmptyDismissed(true)} />
        )}
        {selectedSessionShape ? (
          <SessionDetailsPanel shape={selectedSessionShape} onClose={handleDetailsClose} />
        ) : null}
      </div>

      {showIdeasPanel && editor ? (
        <IdeasPanel
          editor={editor}
          selectedSessionShape={selectedSessionShape}
          onMinimize={handleMinimizeIdeas}
        />
      ) : null}

      {showIdeasRail && editor ? (
        <SideRail ideasActive={ideasOpen} onOpenIdeas={handleOpenIdeas} />
      ) : null}
    </main>
  );
}

function getSelectedSessionShape(editor: Editor): SessionStickyShape | null {
  const selectedShape = editor.getOnlySelectedShape();
  if (!selectedShape || selectedShape.type !== SESSION_STICKY_TYPE) {
    return null;
  }

  return selectedShape as SessionStickyShape;
}

interface SideRailProps {
  ideasActive: boolean;
  onOpenIdeas: () => void;
}

function SideRail({ ideasActive, onOpenIdeas }: SideRailProps) {
  return (
    <aside className="atrium-side-rail" aria-label="Brainstorm panel" onPointerDown={stopCanvasEvent}>
      <button
        className={`atrium-side-rail__button${ideasActive ? ' atrium-side-rail__button--active' : ''}`}
        type="button"
        aria-label="Open brainstorm panel"
        aria-pressed={ideasActive}
        title="Brainstorm"
        onClick={onOpenIdeas}
      >
        <BrainstormIcon />
      </button>
    </aside>
  );
}

function BrainstormIcon() {
  return (
    <svg
      className="atrium-side-rail__icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M9.2 18.4h5.6M10 21h4M8.5 14.6c-1.6-1.1-2.7-2.8-2.7-4.9A6.2 6.2 0 0 1 12 3.5a6.2 6.2 0 0 1 6.2 6.2c0 2.1-1 3.8-2.7 4.9-.8.5-1.1 1.1-1.1 1.8H9.6c0-.7-.3-1.3-1.1-1.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.2 4.8 3 3.6M19.8 4.8 21 3.6M12 1.8V.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function stopCanvasEvent(event: PointerEvent<HTMLElement>): void {
  event.stopPropagation();
}
