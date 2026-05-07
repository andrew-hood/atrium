import { type MouseEvent, type PointerEvent, useEffect, useMemo, useState } from 'react';
import { type Editor } from 'tldraw';
import type { Session, SessionState } from '../../shared/types';
import { formatElapsed, formatSessionState } from './session-format';
import { getSessionShapeId } from './hooks/useSessionUpdates';
import { useSessions } from './hooks/useSessions';
import {
  SESSION_STICKY_TYPE,
  type SessionStickyShape,
} from './shapes/session-sticky/SessionStickyShape';

interface SessionsPanelProps {
  editor: Editor;
  selectedSessionShape: SessionStickyShape | null;
  onOpenIdeas: () => void;
  onMinimize: () => void;
}

type StateFilter = 'triage' | 'all' | 'awaiting_input' | 'running';
type ProviderKey = 'claude' | 'codex';

export function SessionsPanel({
  editor,
  selectedSessionShape,
  onOpenIdeas,
  onMinimize,
}: SessionsPanelProps) {
  const sessions = useSessions();
  const [currentPageSessionIds, setCurrentPageSessionIds] = useState(() =>
    getCurrentPageSessionIds(editor)
  );
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('triage');

  useEffect(() => {
    const syncCurrentPageSessions = (): void => {
      const nextIds = getCurrentPageSessionIds(editor);
      setCurrentPageSessionIds((currentIds) => (areSetsEqual(currentIds, nextIds) ? currentIds : nextIds));
    };

    syncCurrentPageSessions();
    const unsub = editor.store.listen(syncCurrentPageSessions, { source: 'all', scope: 'all' });
    return unsub;
  }, [editor]);

  const currentPageSessions = useMemo(
    () => sessions.filter((session) => currentPageSessionIds.has(session.sessionId)),
    [currentPageSessionIds, sessions]
  );

  const counts = useMemo(
    () => ({
      all: currentPageSessions.length,
      open: currentPageSessions.filter(isOpenSession).length,
      triage: currentPageSessions.filter(isTriageSession).length,
      running: currentPageSessions.filter((session) => session.state === 'running').length,
      awaiting_input: currentPageSessions.filter((session) => session.state === 'awaiting_input').length,
      stale: currentPageSessions.filter((session) => session.state === 'stale').length,
      idle: currentPageSessions.filter((session) => session.state === 'idle').length,
      errored: currentPageSessions.filter((session) => session.state === 'errored').length,
    }),
    [currentPageSessions]
  );

  const visibleSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return currentPageSessions
      .filter((session) => matchesStateFilter(session, stateFilter))
      .filter((session) => matchesQuery(session, needle))
      .sort(compareTrackingSessions);
  }, [currentPageSessions, query, stateFilter]);

  function focusSessions(targetSessions: Session[]): void {
    const ids = targetSessions.flatMap((session) => {
      const id = getSessionShapeId(session.sessionId);
      return editor.getShape(id) ? [id] : [];
    });
    if (ids.length === 0) return;

    editor.select(...ids);
    editor.zoomToSelection({ animation: { duration: editor.options.animationMediumMs } });
  }

  function handleCloseSession(event: MouseEvent, session: Session): void {
    event.stopPropagation();
    void window.api.markClosed(session.sessionId);
  }

  function handleOpenSession(event: MouseEvent, session: Session): void {
    event.stopPropagation();
    void window.api.openSessionContext(session.sessionId);
  }

  const selectedSessionId = selectedSessionShape?.props.sessionId ?? '';
  const hasFilters = stateFilter !== 'triage' || query.trim().length > 0;
  const listTitle = getListTitle(stateFilter, visibleSessions.length);

  return (
    <aside className="sessions-panel" aria-label="Sessions" onPointerDown={stopCanvasEvent}>
      <header className="sessions-panel__header">
        <div className="sessions-panel__title-group">
          <h2 className="sessions-panel__title">Sessions</h2>
          <p className="sessions-panel__subtitle">
            {counts.triage} need attention, {counts.awaiting_input} waiting, {counts.running} running
          </p>
        </div>
        <div className="sessions-panel__header-actions">
          <button
            className="sessions-panel__secondary-button"
            type="button"
            onClick={onOpenIdeas}
          >
            Brainstorm
          </button>
          <button
            className="sessions-panel__secondary-button"
            type="button"
            onClick={onMinimize}
          >
            Minimize
          </button>
        </div>
      </header>

      <div className="sessions-panel__controls">
        <label className="sessions-panel__field">
          <span>Find session</span>
          <input
            className="sessions-panel__search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, project, prompt, action"
          />
        </label>

        <div className="sessions-panel__segments" role="group" aria-label="Session state">
          {getStateFilters(counts).map((filter) => (
            <button
              key={filter.key}
              className={`sessions-panel__segment${
                stateFilter === filter.key ? ' sessions-panel__segment--active' : ''
              }`}
              type="button"
              aria-pressed={stateFilter === filter.key}
              onClick={() => setStateFilter(filter.key)}
            >
              <span>{filter.label}</span>
              <strong>{filter.count}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="sessions-panel__list-header">
        <div>
          <h3>{listTitle}</h3>
          <p>{getListSubtitle(stateFilter, counts)}</p>
        </div>
        <div className="sessions-panel__list-actions">
          {hasFilters ? (
            <button
              className="sessions-panel__secondary-button"
              type="button"
              onClick={() => {
                setQuery('');
                setStateFilter('triage');
              }}
            >
              Reset view
            </button>
          ) : null}
          <button
            className="sessions-panel__secondary-button"
            type="button"
            onClick={() => focusSessions(visibleSessions)}
            disabled={visibleSessions.length === 0}
          >
            Frame shown
          </button>
        </div>
      </div>

      <div className="sessions-panel__content">
        {visibleSessions.length > 0 ? (
          <ul className="sessions-panel__list">
            {visibleSessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                isSelected={selectedSessionId === session.sessionId}
                onFocus={() => focusSessions([session])}
                onOpen={(event) => handleOpenSession(event, session)}
                onClose={(event) => handleCloseSession(event, session)}
              />
            ))}
          </ul>
        ) : (
          <SessionsEmpty
            hasSessionsOnPage={currentPageSessions.length > 0}
            hasFilters={hasFilters}
            onReset={() => {
              setQuery('');
              setStateFilter('triage');
            }}
          />
        )}
      </div>
    </aside>
  );
}

interface SessionRowProps {
  session: Session;
  isSelected: boolean;
  onFocus: () => void;
  onOpen: (event: MouseEvent) => void;
  onClose: (event: MouseEvent) => void;
}

function SessionRow({ session, isSelected, onFocus, onOpen, onClose }: SessionRowProps) {
  const canClose = !session.closed && session.state !== 'idle';
  const canOpen = session.cwd.trim().length > 0;

  return (
    <li>
      <article
        className={[
          'sessions-panel__session',
          `sessions-panel__session--${session.state}`,
          isSelected ? 'sessions-panel__session--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          className="sessions-panel__session-main"
          type="button"
          aria-current={isSelected ? 'true' : undefined}
          aria-label={`Focus ${session.label}`}
          onClick={onFocus}
        >
          <span className="sessions-panel__session-topline">
            <strong title={session.label}>{session.label}</strong>
            <span className={`session-sticky__state session-sticky__state--${session.state}`}>
              {formatSessionState(session.state)}
            </span>
          </span>
          <span className="sessions-panel__session-meta" title={session.cwd}>
            <span className={`sessions-panel__provider sessions-panel__provider--${getProviderKey(session)}`}>
              {formatProviderLabel(session)}
            </span>
            <span>{formatShortPath(session.cwd)}</span>
          </span>
          <span className="sessions-panel__session-action">{formatTriageAction(session)}</span>
          {session.recentPrompt ? (
            <span className="sessions-panel__session-prompt">{session.recentPrompt}</span>
          ) : null}
          <span className="sessions-panel__session-time">
            {formatSessionState(session.state)} for {formatElapsed(session.stateChangedAt)} · updated{' '}
            {formatElapsed(session.updatedAt)}
          </span>
        </button>
        <div className="sessions-panel__session-actions">
          <button
            className="sessions-panel__row-button"
            type="button"
            onClick={onOpen}
            disabled={!canOpen}
          >
            Open context
          </button>
          <button
            className="sessions-panel__row-button sessions-panel__row-button--quiet"
            type="button"
            onClick={onClose}
            disabled={!canClose}
          >
            Dismiss
          </button>
        </div>
      </article>
    </li>
  );
}

function getStateFilters(counts: {
  triage: number;
  open: number;
  awaiting_input: number;
  running: number;
  all: number;
}): Array<{ key: StateFilter; label: string; count: number }> {
  return [
    { key: 'triage', label: 'Triage', count: counts.triage },
    { key: 'awaiting_input', label: 'Waiting', count: counts.awaiting_input },
    { key: 'running', label: 'Running', count: counts.running },
    { key: 'all', label: 'All', count: counts.all },
  ];
}

function getCurrentPageSessionIds(editor: Editor): Set<string> {
  return new Set(
    editor
      .getCurrentPageShapes()
      .filter((shape): shape is SessionStickyShape => shape.type === SESSION_STICKY_TYPE)
      .map((shape) => shape.props.sessionId)
      .filter(Boolean)
  );
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function matchesStateFilter(session: Session, filter: StateFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'triage') return isTriageSession(session);
  return session.state === filter;
}

function matchesQuery(session: Session, needle: string): boolean {
  if (!needle) return true;
  return [
    session.label,
    session.cwd,
    session.lastAction,
    session.recentPrompt,
    session.lastResponse,
    session.provider ?? '',
  ].some((value) => value.toLowerCase().includes(needle));
}

function compareTrackingSessions(a: Session, b: Session): number {
  const stateDelta = getStateRank(a.state) - getStateRank(b.state);
  if (stateDelta !== 0) return stateDelta;
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function getStateRank(state: SessionState): number {
  switch (state) {
    case 'awaiting_input':
      return 0;
    case 'running':
      return 1;
    case 'stale':
      return 2;
    case 'errored':
      return 3;
    case 'idle':
      return 4;
  }
}

function isOpenSession(session: Session): boolean {
  return !session.closed && session.state !== 'idle';
}

function isTriageSession(session: Session): boolean {
  return !session.closed && ['awaiting_input', 'running', 'errored'].includes(session.state);
}

function getListTitle(filter: StateFilter, count: number): string {
  const noun = count === 1 ? 'session' : 'sessions';
  switch (filter) {
    case 'triage':
      return `${count} ${noun} to triage`;
    case 'awaiting_input':
      return `${count} waiting`;
    case 'running':
      return `${count} running`;
    case 'all':
      return `${count} total`;
  }
}

function getListSubtitle(
  filter: StateFilter,
  counts: { triage: number; awaiting_input: number; running: number; open: number; all: number }
): string {
  switch (filter) {
    case 'triage':
      return 'Waiting, running, and errored sessions first.';
    case 'awaiting_input':
      return 'Sessions blocked on your next input.';
    case 'running':
      return 'Sessions actively doing work right now.';
    case 'all':
      return `${counts.open} open across this canvas page.`;
  }
}

function formatTriageAction(session: Session): string {
  if (session.state === 'awaiting_input') return `Waiting: ${session.lastAction}`;
  if (session.state === 'running') return `Running: ${session.lastAction}`;
  if (session.state === 'errored') return `Needs review: ${session.lastAction}`;
  return session.lastAction;
}

function formatProviderLabel(session: Session): string {
  const provider = getProviderKey(session);
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex') return 'Codex';
  return 'Agent';
}

function getProviderKey(session: Session): ProviderKey | 'agent' {
  const provider = session.provider?.toLowerCase();
  if (provider === 'claude' || provider === 'codex') return provider;
  return 'agent';
}

function formatShortPath(cwd: string): string {
  if (!cwd) return 'No project';
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `.../${parts.slice(-2).join('/')}`;
}

function SessionsEmpty({
  hasSessionsOnPage,
  hasFilters,
  onReset,
}: {
  hasSessionsOnPage: boolean;
  hasFilters: boolean;
  onReset: () => void;
}) {
  if (!hasSessionsOnPage) {
    return (
      <section className="sessions-panel__empty" aria-live="polite">
        <strong>No sessions on this canvas page</strong>
        <span>Start a Claude or Codex session, or switch to a page that already has session stickies.</span>
      </section>
    );
  }

  return (
    <section className="sessions-panel__empty" aria-live="polite">
      <strong>{hasFilters ? 'No sessions match this view' : 'No sessions need triage'}</strong>
      <span>
        {hasFilters
          ? 'Clear the search and filters to get back to the active queue.'
          : 'Waiting, running, and errored sessions will appear here as soon as they need attention.'}
      </span>
      {hasFilters ? (
        <button className="sessions-panel__secondary-button" type="button" onClick={onReset}>
          Reset view
        </button>
      ) : null}
    </section>
  );
}

function stopCanvasEvent(event: PointerEvent<HTMLElement>): void {
  event.stopPropagation();
}
