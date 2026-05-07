import { NoteShapeUtil } from 'tldraw';
import { SessionStickyUtil } from './session-sticky/SessionStickyUtil';

const ResizableNoteShapeUtil = NoteShapeUtil.configure({ resizeMode: 'scale' });

export const customShapeUtils = [ResizableNoteShapeUtil, SessionStickyUtil];
