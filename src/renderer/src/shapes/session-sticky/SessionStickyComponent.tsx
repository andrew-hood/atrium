import { useEffect, useRef, useState } from 'react';
import { useElapsedTicker } from '../../hooks/useElapsedTicker';
import { formatElapsed, formatSessionState } from '../../session-format';
import type { SessionStickyShape } from './SessionStickyShape';

interface SessionStickyComponentProps {
  shape: SessionStickyShape;
}

export function SessionStickyComponent({ shape }: SessionStickyComponentProps) {
  const [justUpdated, setJustUpdated] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  const prevUpdatedAt = useRef(shape.props.updatedAt);
  const props = shape.props;
  const hasNotes = props.thoughts.trim().length > 0;
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

  const className = [
    'session-sticky',
    `session-sticky--${props.state}`,
    justUpdated && 'session-sticky--just-updated',
    isEntering && 'session-sticky--entering',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className} style={{ width: props.w, height: props.h }}>
      <header className="session-sticky__header">
        <div className="session-sticky__title-group">
          <div className="session-sticky__kicker">
            <span className={`session-sticky__provider session-sticky__provider--${getProviderKey(props.provider)}`}>
              {formatProviderLabel(props.provider)}
            </span>
            <span className="session-sticky__project" title={props.cwd}>
              {formatShortPath(props.cwd)}
            </span>
          </div>
          <h2 className="session-sticky__label" title={props.label}>
            {props.label}
          </h2>
        </div>
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
        {hasNotes ? (
          <div className="session-sticky__notes">
            <span>Notes</span>
            <p>{props.thoughts}</p>
          </div>
        ) : null}
      </section>

      <footer className="session-sticky__footer">
        <span>{formatElapsed(props.stateChangedAt)}</span>
      </footer>
    </article>
  );
}

function formatProviderLabel(provider: string): string {
  const key = getProviderKey(provider);
  if (key === 'claude') return 'Claude';
  if (key === 'codex') return 'Codex';
  return 'Agent';
}

function getProviderKey(provider: string): 'claude' | 'codex' | 'agent' {
  const normalized = provider.toLowerCase();
  if (normalized === 'claude' || normalized === 'codex') return normalized;
  return 'agent';
}

function formatShortPath(cwd: string): string {
  if (!cwd) return 'No project';
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `.../${parts.slice(-2).join('/')}`;
}
