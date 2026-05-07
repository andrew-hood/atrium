import {
  type FormEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createShapeId, type Editor, type TLNoteShape, toRichText } from 'tldraw';
import type { Session } from '../../shared/types';
import type { SessionStickyShape } from './shapes/session-sticky/SessionStickyShape';

interface IdeasPanelProps {
  editor: Editor;
  selectedSessionShape: SessionStickyShape | null;
  onMinimize: () => void;
}

interface IdeaCandidate {
  id: string;
  title: string;
  why: string;
  nextAction: string;
  confidence: string;
  selected: boolean;
}

interface WaitingRequest {
  requestId: string;
  sessionId: string;
}

const NOTE_GAP_X = 270;
const NOTE_GAP_Y = 250;
const NOTE_COLUMNS = 3;

export function IdeasPanel({
  editor,
  selectedSessionShape,
  onMinimize,
}: IdeasPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [goal, setGoal] = useState('');
  const [waitingRequest, setWaitingRequest] = useState<WaitingRequest | null>(null);
  const [candidates, setCandidates] = useState<IdeaCandidate[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void window.api.listSessions().then((nextSessions) => {
      if (!disposed) setSessions(sortSessions(nextSessions));
    });

    const syncSession = (session: Session) => {
      setSessions((current) => upsertSession(current, session));
    };
    const offCreated = window.api.onSessionCreated(syncSession);
    const offUpdated = window.api.onSessionUpdated(syncSession);

    return () => {
      disposed = true;
      offCreated();
      offUpdated();
    };
  }, []);

  const eligibleSessions = useMemo(
    () => sessions.filter((session) => isEligibleIdeationSession(session)),
    [sessions]
  );

  useEffect(() => {
    setSelectedSessionId((current) => {
      const currentSession = sessions.find((session) => session.sessionId === current);
      if (
        currentSession &&
        (isEligibleIdeationSession(currentSession) || waitingRequest?.sessionId === current)
      ) {
        return current;
      }

      const selectedSession = sessions.find(
        (session) => session.sessionId === selectedSessionShape?.props.sessionId
      );
      if (selectedSession && isEligibleIdeationSession(selectedSession)) {
        return selectedSession.sessionId;
      }

      return eligibleSessions[0]?.sessionId ?? '';
    });
  }, [eligibleSessions, selectedSessionShape?.props.sessionId, sessions, waitingRequest?.sessionId]);

  useEffect(() => {
    if (!waitingRequest) return;
    const session = sessions.find((candidate) => candidate.sessionId === waitingRequest.sessionId);
    const response = session?.lastResponse ?? '';
    if (!response.includes(waitingRequest.requestId)) return;

    const parsed = parseIdeaResponse(response, waitingRequest.requestId);
    if (!parsed.ok) {
      setError(parsed.error);
      setWaitingRequest(null);
      return;
    }

    setCandidates(parsed.ideas);
    setError(null);
    setNotice(`Generated ${parsed.ideas.length} brainstorm items`);
    setWaitingRequest(null);
  }, [sessions, waitingRequest]);

  const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId);
  const canGenerate =
    goal.trim().length > 0 &&
    Boolean(selectedSession && isEligibleIdeationSession(selectedSession)) &&
    !isSending &&
    !waitingRequest;
  const selectedIdeaCount = candidates.filter((candidate) => candidate.selected).length;

  async function handleGenerate(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedSession || !canGenerate) return;

    const requestId = createRequestId();
    setIsSending(true);
    setError(null);
    setNotice(null);
    setCandidates([]);

    try {
      const result = await window.api.sendMessage(
        selectedSession.sessionId,
        buildIdeationPrompt({
          goal: goal.trim(),
          requestId,
          session: selectedSession,
        })
      );

      if (!result.ok) {
        setError(result.error ?? 'Failed to send brainstorm prompt');
        return;
      }

      setWaitingRequest({ requestId, sessionId: selectedSession.sessionId });
      setNotice('Waiting for Codex');
    } finally {
      setIsSending(false);
    }
  }

  function handleCandidateToggle(candidateId: string): void {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, selected: !candidate.selected } : candidate
      )
    );
  }

  function handleInsertSelected(): void {
    const selectedIdeas = candidates.filter((candidate) => candidate.selected);
    if (selectedIdeas.length === 0) return;
    const anchorShape =
      selectedSessionShape?.props.sessionId === selectedSessionId ? selectedSessionShape : null;
    insertIdeaNotes(editor, selectedIdeas, anchorShape);
    setNotice(`Added ${selectedIdeas.length} stickies`);
  }

  return (
    <aside className="ideas-panel" aria-label="Brainstorm" onPointerDown={stopCanvasEvent}>
      <header className="ideas-panel__header">
        <div className="ideas-panel__title-group">
          <h2 className="ideas-panel__title">Brainstorm</h2>
          <p className="ideas-panel__subtitle">Turn an awaiting Codex session into canvas stickies.</p>
        </div>
        <div className="ideas-panel__header-actions">
          <button className="ideas-panel__secondary-button" type="button" onClick={onMinimize}>
            Minimize
          </button>
        </div>
      </header>

      <form className="ideas-panel__form" onSubmit={(event) => void handleGenerate(event)}>
        <label className="ideas-panel__field">
          <span>Codex session</span>
          <select
            className="ideas-panel__select"
            value={selectedSessionId}
            onChange={(event) => setSelectedSessionId(event.target.value)}
            disabled={Boolean(waitingRequest) || eligibleSessions.length === 0}
          >
            {eligibleSessions.length === 0 ? (
              <option value="">No waiting Codex sessions</option>
            ) : (
              eligibleSessions.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>
                  {session.label}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="ideas-panel__field">
          <span>What should Codex brainstorm?</span>
          <textarea
            className="ideas-panel__textarea"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Example: find the next three product moves that will increase session velocity"
            disabled={isSending || Boolean(waitingRequest)}
            rows={5}
          />
        </label>

        <button className="ideas-panel__primary-button" type="submit" disabled={!canGenerate}>
          {waitingRequest ? 'Waiting' : isSending ? 'Sending' : 'Generate'}
        </button>

        {error ? <p className="ideas-panel__error">{error}</p> : null}
        {!error && notice ? <p className="ideas-panel__notice">{notice}</p> : null}
      </form>

      <div className="ideas-panel__content">
        {candidates.length > 0 ? (
          <>
            <div className="ideas-panel__candidate-header">
              <h3>Candidate stickies</h3>
              <button
                className="ideas-panel__secondary-button"
                type="button"
                onClick={handleInsertSelected}
                disabled={selectedIdeaCount === 0}
              >
                Add selected
              </button>
            </div>
            <div className="ideas-panel__candidates">
              {candidates.map((candidate) => (
                <label key={candidate.id} className="ideas-panel__candidate">
                  <input
                    type="checkbox"
                    checked={candidate.selected}
                    onChange={() => handleCandidateToggle(candidate.id)}
                  />
                  <span className="ideas-panel__candidate-copy">
                    <strong>{candidate.title}</strong>
                    {candidate.why ? <span>{candidate.why}</span> : null}
                    {candidate.nextAction ? <em>{candidate.nextAction}</em> : null}
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="ideas-panel__empty">
            {eligibleSessions.length === 0
              ? 'Start or select a Codex session and wait for it to ask for input.'
              : 'Generated brainstorm items will appear here before they become stickies.'}
          </p>
        )}
      </div>
    </aside>
  );
}

function isEligibleIdeationSession(session: Session): boolean {
  return session.provider === 'codex' && session.state === 'awaiting_input' && Boolean(session.tty);
}

function buildIdeationPrompt({
  goal,
  requestId,
  session,
}: {
  goal: string;
  requestId: string;
  session: Session;
}): string {
  return [
    'Help me generate concrete Atrium canvas stickies for ideation velocity.',
    `Request id: ${requestId}`,
    `Goal: ${goal}`,
    `Current session: ${session.label}`,
    `Project: ${session.cwd}`,
    session.recentPrompt ? `Recent prompt: ${session.recentPrompt}` : '',
    session.lastAction ? `Current status: ${session.lastAction}` : '',
    '',
    'Return only one fenced json block. No prose outside the block.',
    'Use this exact shape:',
    '```json',
    '{"requestId":"REQUEST_ID","ideas":[{"title":"short sticky title","why":"why this matters","nextAction":"first concrete action","confidence":"high|medium|low"}]}',
    '```',
    'Generate 6 ideas. Keep titles under 80 characters. Keep why and nextAction under 150 characters each.',
  ]
    .filter(Boolean)
    .join('\n');
}

function parseIdeaResponse(
  response: string,
  requestId: string
): { ok: true; ideas: IdeaCandidate[] } | { ok: false; error: string } {
  const jsonText = extractJsonText(response, requestId);
  if (!jsonText) {
    return { ok: false, error: 'Codex responded, but no matching JSON block was found.' };
  }

  try {
    const data = JSON.parse(jsonText) as unknown;
    const parsed = normalizeIdeaPayload(data, requestId);
    if (parsed.length === 0) {
      return { ok: false, error: 'Codex returned JSON, but it did not contain any usable brainstorm items.' };
    }
    return { ok: true, ideas: parsed };
  } catch {
    return { ok: false, error: 'Codex returned malformed JSON. Ask it to resend the idea block.' };
  }
}

function extractJsonText(response: string, requestId: string): string | null {
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(response)) !== null) {
    const candidate = match[1]?.trim();
    if (candidate?.includes(requestId)) return candidate;
  }

  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = response.slice(firstBrace, lastBrace + 1).trim();
    if (candidate.includes(requestId)) return candidate;
  }

  return null;
}

function normalizeIdeaPayload(data: unknown, requestId: string): IdeaCandidate[] {
  if (!isObject(data)) return [];
  if (data.requestId !== requestId) return [];
  const ideas = Array.isArray(data.ideas) ? data.ideas : [];

  return ideas.flatMap((idea, index) => {
    if (!isObject(idea)) return [];
    const title = normalizeText(idea.title);
    if (!title) return [];

    return {
      id: `${requestId}-${index}`,
      title,
      why: normalizeText(idea.why),
      nextAction: normalizeText(idea.nextAction),
      confidence: normalizeText(idea.confidence) || 'medium',
      selected: true,
    };
  });
}

function insertIdeaNotes(
  editor: Editor,
  ideas: IdeaCandidate[],
  anchorShape: SessionStickyShape | null
): void {
  const origin = getNoteOrigin(editor, anchorShape);
  const ids = ideas.map(() => createShapeId());

  editor.run(() => {
    for (const [index, idea] of ideas.entries()) {
      const id = ids[index]!;
      editor.createShape<TLNoteShape>({
        id,
        type: 'note',
        x: origin.x + (index % NOTE_COLUMNS) * NOTE_GAP_X,
        y: origin.y + Math.floor(index / NOTE_COLUMNS) * NOTE_GAP_Y,
        props: {
          color: noteColorForConfidence(idea.confidence),
          richText: toRichText(formatIdeaNote(idea)),
        },
      });
    }
    editor.select(...ids);
  });
}

function getNoteOrigin(editor: Editor, anchorShape: SessionStickyShape | null): { x: number; y: number } {
  if (anchorShape) {
    const bounds = editor.getShapePageBounds(anchorShape.id);
    if (bounds) return { x: bounds.maxX + 48, y: bounds.y };
  }

  const viewport = editor.getViewportPageBounds();
  return { x: viewport.x + 96, y: viewport.y + 96 };
}

function formatIdeaNote(idea: IdeaCandidate): string {
  const lines = [idea.title];
  if (idea.why) lines.push('', `Why: ${idea.why}`);
  if (idea.nextAction) lines.push('', `Next: ${idea.nextAction}`);
  if (idea.confidence) lines.push('', `Confidence: ${idea.confidence}`);
  return lines.join('\n');
}

function noteColorForConfidence(confidence: string): TLNoteShape['props']['color'] {
  switch (confidence.toLowerCase()) {
    case 'high':
      return 'green';
    case 'low':
      return 'orange';
    default:
      return 'yellow';
  }
}

function upsertSession(sessions: Session[], session: Session): Session[] {
  const next = sessions.filter((candidate) => candidate.sessionId !== session.sessionId);
  next.push(session);
  return sortSessions(next);
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function createRequestId(): string {
  return `atrium-ideas-${Date.now().toString(36)}`;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stopCanvasEvent(event: PointerEvent<HTMLElement>): void {
  event.stopPropagation();
}
