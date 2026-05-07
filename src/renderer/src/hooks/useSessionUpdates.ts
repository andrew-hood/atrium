import { useEffect } from 'react';
import { createShapeId, Editor, HistoryEntry, TLRecord } from 'tldraw';
import type { Session } from '../../../shared/types';
import { SESSION_STICKY_TYPE, type SessionStickyShape } from '../shapes/session-sticky/SessionStickyShape';

export function useSessionUpdates(editor: Editor | null): void {
  useEffect(() => {
    if (!editor) {
      return;
    }

    let disposed = false;
    void window.api.listSessions().then((sessions) => {
      if (disposed) {
        return;
      }
      editor.run(
        () => {
          removeOrphanSessionShapes(editor, sessions);
          let nextPositionIndex = getSessionShapeCount(editor);
          for (let index = sessions.length - 1; index >= 0; index -= 1) {
            nextPositionIndex = upsertSessionShape(editor, sessions[index]!, nextPositionIndex);
          }
        },
        { history: 'ignore' }
      );
    });

    const syncSession = (session: Session): void => {
      editor.run(() => {
        upsertSessionShape(editor, session);
      }, { history: 'ignore' });
    };

    const offCreated = window.api.onSessionCreated(syncSession);
    const offUpdated = window.api.onSessionUpdated(syncSession);
    const pendingDeleteTimers = new Set<number>();

    const offStoreListener = editor.store.listen(
      (entry: HistoryEntry<TLRecord>) => {
        if (entry.source !== 'user') return;
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === 'shape' && 'type' in record && record.type === SESSION_STICKY_TYPE) {
            const shape = record as unknown as SessionStickyShape;
            const timer = window.setTimeout(() => {
              pendingDeleteTimers.delete(timer);
              if (disposed || editor.getShape(shape.id)) return;
              void window.api.deleteSession(shape.props.sessionId);
            }, 0);
            pendingDeleteTimers.add(timer);
          }
        }
      },
      { source: 'user', scope: 'document' }
    );

    return () => {
      disposed = true;
      offCreated();
      offUpdated();
      offStoreListener();
      for (const timer of pendingDeleteTimers) {
        window.clearTimeout(timer);
      }
      pendingDeleteTimers.clear();
    };
  }, [editor]);
}

function upsertSessionShape(editor: Editor, session: Session, positionIndex?: number): number {
  const id = getSessionShapeId(session.sessionId);
  const existing = editor.getShape<SessionStickyShape>(id);
  const props = sessionToShapeProps(session, existing?.props);

  if (existing) {
    if (!areSessionShapePropsEqual(existing.props, props)) {
      editor.updateShape<SessionStickyShape>({
        id,
        type: SESSION_STICKY_TYPE,
        props,
      });
    }
    return positionIndex ?? getSessionShapeCount(editor);
  }

  const nextPositionIndex = positionIndex ?? getSessionShapeCount(editor);
  const { x, y } = getPositionForIndex(nextPositionIndex);
  editor.createShape<SessionStickyShape>({
    id,
    type: SESSION_STICKY_TYPE,
    x,
    y,
    props,
  });
  return nextPositionIndex + 1;
}

function removeOrphanSessionShapes(editor: Editor, sessions: Session[]): void {
  const activeIds = new Set(sessions.map((session) => getSessionShapeId(session.sessionId)));
  const orphanIds = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === SESSION_STICKY_TYPE && !activeIds.has(shape.id))
    .map((shape) => shape.id);

  if (orphanIds.length > 0) {
    editor.deleteShapes(orphanIds);
  }
}

function sessionToShapeProps(
  session: Session,
  existingProps?: SessionStickyShape['props'],
): SessionStickyShape['props'] {
  return {
    w: existingProps?.w ?? 330,
    h: existingProps?.h ?? 230,
    sessionId: session.sessionId,
    provider: session.provider ?? '',
    label: session.label,
    transcriptPath: session.transcriptPath ?? '',
    recentPrompt: session.recentPrompt,
    lastResponse: session.lastResponse,
    state: session.state,
    cwd: session.cwd,
    pid: session.pid ?? 0,
    tty: session.tty ?? '',
    lastAction: session.lastAction,
    lastEvent: session.lastEvent,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    stateChangedAt: session.stateChangedAt,
    endedAt: session.endedAt ?? '',
    thoughts: session.thoughts,
    closed: session.closed,
  };
}

export function getSessionShapeId(sessionId: string) {
  const encoded = Array.from(sessionId)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  return createShapeId(`session_${encoded.slice(0, 96)}`);
}

function getSessionShapeCount(editor: Editor): number {
  return editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === SESSION_STICKY_TYPE).length;
}

function getPositionForIndex(index: number): { x: number; y: number } {
  return {
    x: 80 + (index % 4) * 340,
    y: 80 + Math.floor(index / 4) * 230,
  };
}

function areSessionShapePropsEqual(
  current: SessionStickyShape['props'],
  next: SessionStickyShape['props']
): boolean {
  return (
    current.w === next.w &&
    current.h === next.h &&
    current.sessionId === next.sessionId &&
    current.provider === next.provider &&
    current.label === next.label &&
    current.transcriptPath === next.transcriptPath &&
    current.recentPrompt === next.recentPrompt &&
    current.lastResponse === next.lastResponse &&
    current.state === next.state &&
    current.cwd === next.cwd &&
    current.pid === next.pid &&
    current.tty === next.tty &&
    current.lastAction === next.lastAction &&
    current.lastEvent === next.lastEvent &&
    current.createdAt === next.createdAt &&
    current.updatedAt === next.updatedAt &&
    current.stateChangedAt === next.stateChangedAt &&
    current.endedAt === next.endedAt &&
    current.thoughts === next.thoughts &&
    current.closed === next.closed
  );
}
