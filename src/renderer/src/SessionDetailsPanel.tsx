import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useElapsedTicker } from './hooks/useElapsedTicker';
import { formatElapsed, formatSessionState } from './session-format';
import type { SessionStickyShape } from './shapes/session-sticky/SessionStickyShape';

interface SessionDetailsPanelProps {
  shape: SessionStickyShape;
  onClose: () => void;
}

export function SessionDetailsPanel({
  shape,
  onClose,
}: SessionDetailsPanelProps) {
  const props = shape.props;
  useElapsedTicker();
  const hasPrompt = props.recentPrompt.trim().length > 0;
  const hasResponse = props.lastResponse.trim().length > 0;
  const canSend = props.state === 'awaiting_input';
  const hasTty = props.tty.trim().length > 0;
  const isPermissionRequest = props.lastEvent === 'PermissionRequest';

  return (
    <aside
      className="session-details-panel"
      aria-label="Session details"
      onPointerDown={stopCanvasEvent}
    >
      <header className="session-details-panel__header">
        <div className="session-details-panel__title-group">
          <h2 className="session-details-panel__title">{props.label}</h2>
          <div className="session-details-panel__meta">
            <span
              className={`session-details-panel__state session-sticky__state session-sticky__state--${props.state}`}
            >
              {formatSessionState(props.state)}
            </span>
            <span>{formatElapsed(props.stateChangedAt)}</span>
          </div>
        </div>
        <div className="session-details-panel__header-actions">
          <button
            className="session-details-panel__secondary-button"
            type="button"
            onPointerDown={stopCanvasEvent}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </header>

      <div className="session-details-panel__content">
        <section className="session-details-panel__section">
          <h3>Now</h3>
          <p className="session-details-panel__primary">{props.lastAction}</p>
        </section>

        <section className="session-details-panel__section">
          <h3>Project</h3>
          <p className="session-details-panel__path">{props.cwd || 'No working directory recorded.'}</p>
        </section>

        <SessionLinkSection sessionId={props.sessionId} cwd={props.cwd} tty={props.tty} />

        {hasPrompt ? (
          <section className="session-details-panel__section">
            <h3>Prompt</h3>
            <p className="session-details-panel__copy">{props.recentPrompt}</p>
          </section>
        ) : null}

        {hasResponse ? (
          <section className="session-details-panel__section">
            <h3>Response</h3>
            <MarkdownText markdown={props.lastResponse} />
          </section>
        ) : null}

        <SessionNotesSection sessionId={props.sessionId} notes={props.thoughts} />
      </div>

      {canSend ? (
        <SendSection
          sessionId={props.sessionId}
          hasTty={hasTty}
          isPermissionRequest={isPermissionRequest}
        />
      ) : null}
    </aside>
  );
}

interface SessionLinkSectionProps {
  sessionId: string;
  cwd: string;
  tty: string;
}

function SessionLinkSection({ sessionId, cwd, tty }: SessionLinkSectionProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProjectPath = cwd.trim().length > 0;
  const hasTty = tty.trim().length > 0;

  async function handleOpen(): Promise<void> {
    if (isOpening || !hasProjectPath) return;

    setIsOpening(true);
    setError(null);
    try {
      const result = await window.api.openSessionContext(sessionId);
      if (!result.ok) {
        setError(result.error ?? 'Failed to open session context');
      }
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <section className="session-details-panel__section">
      <h3>Link</h3>
      <div className="session-details-panel__link-card">
        <div className="session-details-panel__link-copy">
          <strong>{hasTty ? 'Terminal attached' : 'Project directory'}</strong>
          <span title={hasTty ? tty : cwd}>
            {hasTty ? tty : hasProjectPath ? cwd : 'No project path available'}
          </span>
        </div>
        <button
          className="session-details-panel__secondary-button"
          type="button"
          disabled={!hasProjectPath || isOpening}
          onClick={() => void handleOpen()}
        >
          {isOpening ? 'Opening' : 'Open'}
        </button>
      </div>
      {error ? <p className="session-details-panel__send-error">{error}</p> : null}
    </section>
  );
}

interface SessionNotesSectionProps {
  sessionId: string;
  notes: string;
}

function SessionNotesSection({ sessionId, notes }: SessionNotesSectionProps) {
  const [draft, setDraft] = useState(notes);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const hasChanges = draft.trim() !== notes.trim();

  useEffect(() => {
    setDraft(notes);
    setStatus(null);
  }, [notes, sessionId]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (isSaving || !hasChanges) return;

    setIsSaving(true);
    setStatus(null);
    try {
      const updated = await window.api.attachThoughts(sessionId, draft);
      setStatus(updated ? 'Saved' : 'Session not found');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="session-details-panel__section" onSubmit={(event) => void handleSubmit(event)}>
      <h3>Notes</h3>
      <textarea
        className="session-details-panel__notes-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Capture decisions, risks, follow-ups, or context for this session."
        rows={5}
        disabled={isSaving}
      />
      <div className="session-details-panel__notes-actions">
        {status ? <span>{status}</span> : null}
        <button
          className="session-details-panel__secondary-button"
          type="submit"
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? 'Saving' : 'Save notes'}
        </button>
      </div>
    </form>
  );
}

interface SendSectionProps {
  sessionId: string;
  hasTty: boolean;
  isPermissionRequest: boolean;
}

function SendSection({ sessionId, hasTty, isPermissionRequest }: SendSectionProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  if (!hasTty) {
    return (
      <div className="session-details-panel__send">
        <p className="session-details-panel__send-disabled">No terminal attached</p>
      </div>
    );
  }

  async function send(text: string): Promise<void> {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const result = await window.api.sendMessage(sessionId, text.trim());
      if (result.ok) {
        setMessage('');
      } else {
        setError(result.error ?? 'Failed to send');
      }
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    void send(message);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(message);
    }
  }

  function handleApprove(): void {
    void send('y');
  }

  return (
    <form className="session-details-panel__send" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="session-details-panel__send-input"
        placeholder={isPermissionRequest ? 'Respond to approval...' : 'Send a message...'}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSending}
        rows={2}
      />
      <div className="session-details-panel__send-actions">
        {isPermissionRequest ? (
          <button
            type="button"
            className="session-details-panel__approve-button"
            onClick={handleApprove}
            disabled={isSending}
          >
            Approve
          </button>
        ) : null}
        <button
          type="submit"
          className="session-details-panel__send-button"
          disabled={isSending || !message.trim()}
        >
          Send
        </button>
      </div>
      {error ? <p className="session-details-panel__send-error">{error}</p> : null}
    </form>
  );
}

function stopCanvasEvent(event: PointerEvent<HTMLElement>): void {
  event.stopPropagation();
}

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; code: string; language: string };

function MarkdownText({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);

  return (
    <div className="session-details-panel__markdown">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  );
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^\s*```([\w-]*)\s*$/);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', code: codeLines.join('\n'), language: fenceMatch[1] ?? '' });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1]?.length ?? 1,
        text: headingMatch[2] ?? '',
      });
      index += 1;
      continue;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? '').match(/^\s*>\s?(.*)$/);
        if (!match) break;
        quoteLines.push(match[1] ?? '');
        index += 1;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = (lines[index] ?? '').match(
          ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/
        );
        if (!itemMatch) break;
        items.push(itemMatch[1] ?? '');
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index]?.trim()) {
      const current = lines[index] ?? '';
      if (
        /^\s*```/.test(current) ||
        /^(#{1,6})\s+/.test(current) ||
        /^\s*>\s?/.test(current) ||
        /^\s*[-*+]\s+/.test(current) ||
        /^\s*\d+[.)]\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks;
}

function renderMarkdownBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.type === 'heading') {
    const content = renderInlineMarkdown(block.text);
    switch (Math.min(block.level + 2, 6)) {
      case 3:
        return <h3 key={index}>{content}</h3>;
      case 4:
        return <h4 key={index}>{content}</h4>;
      case 5:
        return <h5 key={index}>{content}</h5>;
      default:
        return <h6 key={index}>{content}</h6>;
    }
  }

  if (block.type === 'blockquote') {
    return <blockquote key={index}>{renderInlineMarkdown(block.text)}</blockquote>;
  }

  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul';
    return (
      <ListTag key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === 'code') {
    return (
      <pre key={index}>
        <code>{block.code}</code>
      </pre>
    );
  }

  return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]\n]+\]\([^) \n]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;
    if (start > cursor) {
      nodes.push(...renderLineBreaks(text.slice(cursor, start), nodes.length));
    }
    nodes.push(renderInlineToken(token, nodes.length));
    cursor = start + token.length;
  }

  if (cursor < text.length) {
    nodes.push(...renderLineBreaks(text.slice(cursor), nodes.length));
  }

  return nodes;
}

function renderInlineToken(token: string, key: number): ReactNode {
  const linkMatch = token.match(/^\[([^\]\n]+)\]\(([^) \n]+)\)$/);
  if (linkMatch) {
    const [, label, href] = linkMatch;
    if (isSafeMarkdownHref(href)) {
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }

    return <span key={key}>{token}</span>;
  }

  if (token.startsWith('`') && token.endsWith('`')) {
    return <code key={key}>{token.slice(1, -1)}</code>;
  }

  if (
    (token.startsWith('**') && token.endsWith('**')) ||
    (token.startsWith('__') && token.endsWith('__'))
  ) {
    return <strong key={key}>{renderInlineMarkdown(token.slice(2, -2))}</strong>;
  }

  if (
    (token.startsWith('*') && token.endsWith('*')) ||
    (token.startsWith('_') && token.endsWith('_'))
  ) {
    return <em key={key}>{renderInlineMarkdown(token.slice(1, -1))}</em>;
  }

  return <span key={key}>{token}</span>;
}

function renderLineBreaks(text: string, keyOffset: number): ReactNode[] {
  return text.split('\n').flatMap((part, index, parts) => {
    const nodes: ReactNode[] = [<span key={`${keyOffset}-${index}`}>{part}</span>];
    if (index < parts.length - 1) {
      nodes.push(<br key={`${keyOffset}-${index}-br`} />);
    }
    return nodes;
  });
}

function isSafeMarkdownHref(value: string | undefined): value is string {
  // Markdown links must not contain control characters or whitespace.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\s]/.test(value)) {
    return false;
  }

  const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) {
    return true;
  }

  return !['javascript', 'data', 'vbscript'].includes(schemeMatch[1]?.toLowerCase() ?? '');
}
