import { useEffect } from 'react';
import { createShapeId, Editor, HistoryEntry, TLFrameShape, TLRecord } from 'tldraw';
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
  const { x, y } = getPositionForSession(editor, session, props, nextPositionIndex);
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
    w: existingProps?.w ?? 360,
    h: existingProps?.h ?? 280,
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
    x: 80 + (index % 4) * 388,
    y: 80 + Math.floor(index / 4) * 308,
  };
}

function getPositionForSession(
  editor: Editor,
  session: Session,
  props: SessionStickyShape['props'],
  fallbackIndex: number
): { x: number; y: number } {
  const lane = findSessionLane(editor, session);
  if (!lane) return getPositionForIndex(fallbackIndex);

  const index = getLaneSessionCount(editor, lane, session.sessionId);
  const padding = 24;
  const headerOffset = 58;
  const gap = 18;
  const columns = Math.max(1, Math.floor((lane.props.w - padding * 2 + gap) / (props.w + gap)));
  return {
    x: lane.x + padding + (index % columns) * (props.w + gap),
    y: lane.y + headerOffset + Math.floor(index / columns) * (props.h + gap),
  };
}

function findSessionLane(editor: Editor, session: Session): TLFrameShape | null {
  const candidates = getLaneNameCandidates(session);
  const frames = editor.getCurrentPageShapes().filter((shape): shape is TLFrameShape => shape.type === 'frame');
  return (
    frames.find((frame) => {
      const name = frame.props.name.toLowerCase();
      return candidates.some((candidate) => name.includes(candidate));
    }) ?? null
  );
}

function getLaneNameCandidates(session: Session): string[] {
  if (session.state === 'awaiting_input') return ['awaiting', 'waiting', 'input', 'review'];
  if (session.state === 'running') return ['running', 'progress', 'doing'];
  if (session.state === 'errored') return ['blocked', 'error', 'review'];
  if (session.state === 'stale') return ['stale', 'paused', 'parking'];
  return ['done', 'idle', 'closed'];
}

function getLaneSessionCount(editor: Editor, lane: TLFrameShape, incomingSessionId: string): number {
  const laneBounds = editor.getShapePageBounds(lane.id);
  if (!laneBounds) return 0;

  return editor
    .getCurrentPageShapes()
    .filter((shape): shape is SessionStickyShape => shape.type === SESSION_STICKY_TYPE)
    .filter((shape) => shape.props.sessionId !== incomingSessionId)
    .filter((shape) => {
      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) return false;
      return (
        bounds.x >= laneBounds.x &&
        bounds.y >= laneBounds.y &&
        bounds.maxX <= laneBounds.maxX &&
        bounds.maxY <= laneBounds.maxY
      );
    }).length;
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
