import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useElapsedTicker } from '../../hooks/useElapsedTicker';
import { formatElapsed, formatSessionState } from '../../session-format';
import type { SessionStickyShape } from './SessionStickyShape';

interface SessionStickyComponentProps {
  shape: SessionStickyShape;
}

const UNDO_DELAY_MS = 5_000;

export function SessionStickyComponent({ shape }: SessionStickyComponentProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  const prevUpdatedAt = useRef(shape.props.updatedAt);
  const closeTimer = useRef<number | null>(null);
  const props = shape.props;
  const isClosed = props.closed || props.state === 'idle';
  const isRunning = props.state === 'running';
  const isActive = props.state === 'running' || props.state === 'awaiting_input';
  useElapsedTicker();

  useEffect(() => {
    const t = window.setTimeout(() => setIsEntering(false), 500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (props.updatedAt !== prevUpdatedAt.current) {
      prevUpdatedAt.current = props.updatedAt;
      setJustUpdated(true);
      const timeout = window.setTimeout(() => setJustUpdated(false), 800);
      return () => window.clearTimeout(timeout);
    }
  }, [props.updatedAt]);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const handleClose = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();

      if (isActive) {
        setPendingClose(true);
        closeTimer.current = window.setTimeout(() => {
          setIsClosing(true);
          setPendingClose(false);
          void window.api.markClosed(props.sessionId).finally(() => setIsClosing(false));
        }, UNDO_DELAY_MS);
        return;
      }

      setIsClosing(true);
      void window.api.markClosed(props.sessionId).finally(() => setIsClosing(false));
    },
    [isActive, props.sessionId],
  );

  const handleUndo = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setPendingClose(false);
  }, []);

  const className = [
    'session-sticky',
    isRunning && 'session-sticky--running',
    justUpdated && 'session-sticky--just-updated',
    isEntering && 'session-sticky--entering',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className} style={{ width: props.w, height: props.h }}>
      <header className="session-sticky__header">
        <h2 className="session-sticky__label" title={props.label}>
          {props.label}
        </h2>
        <span className={`session-sticky__state session-sticky__state--${props.state}`}>
          {formatSessionState(props.state)}
        </span>
      </header>

      <section className="session-sticky__body">
        <p className="session-sticky__action">{props.lastAction}</p>
        {props.recentPrompt ? (
          <div className="session-sticky__prompt">
            <span>Prompt</span>
            <p>{props.recentPrompt}</p>
          </div>
        ) : null}
        <p className="session-sticky__meta" title={props.cwd}>
          {props.cwd}
        </p>
        {props.thoughts ? <p className="session-sticky__thoughts">{props.thoughts}</p> : null}
      </section>

      <footer className="session-sticky__footer">
        <span>{formatElapsed(props.stateChangedAt)}</span>
        {pendingClose ? (
          <div
            className="session-sticky__undo"
            onPointerDown={stopCanvasEvent}
          >
            <span>Closing…</span>
            <button onClick={handleUndo}>Undo</button>
          </div>
        ) : (
          <button
            className="session-sticky__button"
            disabled={isClosed || isClosing}
            onPointerDown={stopCanvasEvent}
            onClick={handleClose}
          >
            {isClosing ? 'Closing' : 'Close'}
          </button>
        )}
      </footer>
    </article>
  );
}

function stopCanvasEvent(event: PointerEvent<HTMLButtonElement | HTMLDivElement>): void {
  event.stopPropagation();
}
