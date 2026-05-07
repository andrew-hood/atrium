import type { Editor } from 'tldraw';

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

export const canvasTemplates: CanvasTemplate[] = [
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
