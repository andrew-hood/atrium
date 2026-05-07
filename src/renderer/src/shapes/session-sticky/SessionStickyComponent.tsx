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
  const preview = getSessionPreview(props);
  const markers = getSessionMarkers(props, preview?.type);
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
        {preview ? (
          <div className={`session-sticky__preview session-sticky__preview--${preview.type}`}>
            <span>{preview.label}</span>
            <p>{preview.text}</p>
          </div>
        ) : null}
      </section>

      <footer className="session-sticky__footer">
        <span>{formatElapsed(props.stateChangedAt)}</span>
        {markers.length > 0 ? (
          <span className="session-sticky__markers" aria-label="Available session details">
            {markers.join(' · ')}
          </span>
        ) : (
          <span className="session-sticky__event">{formatEventLabel(props.lastEvent)}</span>
        )}
      </footer>
    </article>
  );
}

type PreviewType = 'prompt' | 'response' | 'notes';

function getSessionPreview(
  props: SessionStickyShape['props']
): { type: PreviewType; label: string; text: string } | null {
  const recentPrompt = props.recentPrompt.trim();
  const lastResponse = props.lastResponse.trim();
  const notes = props.thoughts.trim();

  if (props.state === 'awaiting_input' && recentPrompt) {
    return { type: 'prompt', label: 'Waiting on', text: recentPrompt };
  }

  if ((props.state === 'errored' || props.state === 'stale') && lastResponse) {
    return {
      type: 'response',
      label: props.state === 'errored' ? 'Error context' : 'Last response',
      text: lastResponse,
    };
  }

  if (lastResponse) {
    return { type: 'response', label: 'Last response', text: lastResponse };
  }

  if (notes) {
    return { type: 'notes', label: 'Notes', text: notes };
  }

  if (recentPrompt) {
    return { type: 'prompt', label: 'Prompt', text: recentPrompt };
  }

  return null;
}

function getSessionMarkers(
  props: SessionStickyShape['props'],
  visiblePreviewType: PreviewType | undefined
): string[] {
  const markers: string[] = [];
  if (props.recentPrompt.trim() && visiblePreviewType !== 'prompt') {
    markers.push('Prompt saved');
  }
  if (props.lastResponse.trim() && visiblePreviewType !== 'response') {
    markers.push('Response saved');
  }
  if (props.thoughts.trim() && visiblePreviewType !== 'notes') {
    markers.push('Notes saved');
  }
  return markers.slice(0, 2);
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

function formatEventLabel(event: string): string {
  return event.replace(/([a-z])([A-Z])/g, '$1 $2');
}
