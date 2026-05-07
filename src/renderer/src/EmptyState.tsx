import type { Editor } from 'tldraw';
import { canvasTemplates, type CanvasTemplate } from './templates';

interface EmptyStateProps {
  editor: Editor;
  onDismiss: () => void;
}

export function EmptyState({ editor, onDismiss }: EmptyStateProps) {
  function handleSelect(template: CanvasTemplate) {
    template.apply(editor);
    if (template.id !== 'blank') {
      requestAnimationFrame(() => {
        editor.zoomToFit();
      });
    }
    onDismiss();
  }

  return (
    <div className="atrium-empty-state">
      <div className="atrium-empty-state__card">
        <CanvasIcon />
        <h2 className="atrium-empty-state__title">No sessions yet</h2>
        <p className="atrium-empty-state__subtitle">
          Sessions appear as you use Claude Code or Codex.
          <br />
          Pick a template to organize your canvas.
        </p>
        <div className="atrium-empty-state__templates">
          {canvasTemplates.map((t) => (
            <button
              key={t.id}
              className="atrium-empty-state__template"
              onClick={() => handleSelect(t)}
            >
              <div className="atrium-empty-state__template-preview">
                <TemplatePreview id={t.id} />
              </div>
              <span className="atrium-empty-state__template-name">{t.name}</span>
              <span className="atrium-empty-state__template-desc">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CanvasIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      className="atrium-empty-state__icon"
    >
      <rect x="4" y="4" width="32" height="32" rx="6" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="9" y="12" width="10" height="7" rx="2" fill="#94a3b8" opacity="0.25" />
      <rect x="21" y="12" width="10" height="7" rx="2" fill="#94a3b8" opacity="0.18" />
      <rect x="9" y="22" width="10" height="7" rx="2" fill="#94a3b8" opacity="0.12" />
      <rect x="21" y="22" width="10" height="7" rx="2" fill="#94a3b8" opacity="0.08" />
    </svg>
  );
}

function TemplatePreview({ id }: { id: string }) {
  switch (id) {
    case 'session-triage':
      return <SessionTriagePreview />;
    case 'kanban':
      return <KanbanPreview />;
    case 'standup':
      return <StandupPreview />;
    default:
      return <BlankPreview />;
  }
}

function SessionTriagePreview() {
  const cols = [
    { x: 2, tone: 0.28, cards: [0.32, 0.18] },
    { x: 34, tone: 0.2, cards: [0.28] },
    { x: 66, tone: 0.24, cards: [0.3, 0.16] },
    { x: 98, tone: 0.12, cards: [0.18] },
  ];
  return (
    <svg viewBox="0 0 128 80" fill="none">
      {cols.map((col, ci) => (
        <g key={ci}>
          <rect
            x={col.x}
            y={2}
            width={28}
            height={76}
            rx={2.5}
            stroke="currentColor"
            strokeWidth={0.75}
            opacity={0.42}
          />
          <rect x={col.x + 4} y={8} width={20} height={8} rx={1.5} fill="currentColor" opacity={col.tone} />
          {col.cards.map((opacity, ri) => (
            <rect
              key={ri}
              x={col.x + 4}
              y={24 + ri * 16}
              width={20}
              height={12}
              rx={2}
              fill="currentColor"
              opacity={opacity}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function KanbanPreview() {
  const cols = [
    { x: 2, cards: [0.2, 0.15, 0.1] },
    { x: 34, cards: [0.25, 0.18] },
    { x: 66, cards: [0.22] },
    { x: 98, cards: [0.2, 0.15] },
  ];
  return (
    <svg viewBox="0 0 128 80" fill="none">
      {cols.map((col, ci) => (
        <g key={ci}>
          <rect
            x={col.x}
            y={2}
            width={28}
            height={76}
            rx={2.5}
            stroke="currentColor"
            strokeWidth={0.75}
            opacity={0.4}
          />
          {col.cards.map((opacity, ri) => (
            <rect
              key={ri}
              x={col.x + 3}
              y={10 + ri * 14}
              width={22}
              height={10}
              rx={2}
              fill="currentColor"
              opacity={opacity}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function StandupPreview() {
  const cols = [
    { x: 2, cards: [0.2, 0.15] },
    { x: 44, cards: [0.25, 0.18] },
    { x: 86, cards: [0.2] },
  ];
  return (
    <svg viewBox="0 0 128 80" fill="none">
      {cols.map((col, ci) => (
        <g key={ci}>
          <rect
            x={col.x}
            y={2}
            width={38}
            height={76}
            rx={2.5}
            stroke="currentColor"
            strokeWidth={0.75}
            opacity={0.4}
          />
          {col.cards.map((opacity, ri) => (
            <rect
              key={ri}
              x={col.x + 4}
              y={10 + ri * 14}
              width={30}
              height={10}
              rx={2}
              fill="currentColor"
              opacity={opacity}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function BlankPreview() {
  return (
    <svg viewBox="0 0 128 80" fill="none">
      <rect
        x={4}
        y={4}
        width={120}
        height={72}
        rx={4}
        stroke="currentColor"
        strokeWidth={0.75}
        strokeDasharray="4 3"
        opacity={0.4}
      />
      <line
        x1={58}
        y1={40}
        x2={70}
        y2={40}
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        opacity={0.35}
      />
      <line
        x1={64}
        y1={34}
        x2={64}
        y2={46}
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        opacity={0.35}
      />
    </svg>
  );
}
