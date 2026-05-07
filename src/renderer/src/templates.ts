import { toRichText, type Editor } from 'tldraw';

export interface CanvasTemplate {
  id: string;
  name: string;
  description: string;
  apply: (editor: Editor) => void;
}

const FRAME_W = 360;
const FRAME_H = 700;
const GAP = 32;
const ORIGIN_X = 80;
const ORIGIN_Y = 80;
const TRIAGE_FRAME_W = 380;

function createColumns(editor: Editor, names: string[]): void {
  editor.run(() => {
    for (const [i, name] of names.entries()) {
      editor.createShape({
        type: 'frame',
        x: ORIGIN_X + i * (FRAME_W + GAP),
        y: ORIGIN_Y,
        props: { w: FRAME_W, h: FRAME_H, name },
      });
    }
  });
}

function createSessionTriage(editor: Editor): void {
  const lanes = [
    { name: 'Awaiting input', color: 'blue' },
    { name: 'Running now', color: 'yellow' },
    { name: 'Blocked / errored', color: 'red' },
    { name: 'Done / idle', color: 'grey' },
  ] as const;

  editor.run(() => {
    for (const [i, lane] of lanes.entries()) {
      editor.createShape({
        type: 'frame',
        x: ORIGIN_X + i * (TRIAGE_FRAME_W + GAP),
        y: ORIGIN_Y,
        props: { w: TRIAGE_FRAME_W, h: FRAME_H, name: lane.name },
      });
      editor.createShape({
        type: 'note',
        x: ORIGIN_X + i * (TRIAGE_FRAME_W + GAP) + 24,
        y: ORIGIN_Y + 38,
        props: {
          color: lane.color,
          richText: toRichText(getLanePrompt(lane.name)),
        },
      });
    }
  });
}

export const canvasTemplates: CanvasTemplate[] = [
  {
    id: 'session-triage',
    name: 'Session Triage',
    description: 'Miro-style lanes for live agents, blockers, and done work',
    apply(editor) {
      createSessionTriage(editor);
    },
  },
  {
    id: 'kanban',
    name: 'Kanban Board',
    description: 'Four columns for tracking work from backlog to done',
    apply(editor) {
      createColumns(editor, ['Backlog', 'In Progress', 'Review / Testing', 'Done']);
    },
  },
  {
    id: 'standup',
    name: 'Daily Standup',
    description: "Three lanes to track today's progress",
    apply(editor) {
      createColumns(editor, ['To Do', 'In Progress', 'Done']);
    },
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'Start empty — sessions appear freely',
    apply() {},
  },
];

function getLanePrompt(name: string): string {
  switch (name) {
    case 'Awaiting input':
      return 'Decide, answer, unblock';
    case 'Running now':
      return 'Watch active work';
    case 'Blocked / errored':
      return 'Fix or close';
    default:
      return 'Archive useful outcomes';
  }
}
