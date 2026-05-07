import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { shouldHideSession } from '../shared/session-filters';
import type {
  HookEventPayload,
  SendMessageResult,
  Session,
  SessionChange,
  SessionState,
} from '../shared/types';
import { findCodexTranscriptPath, readCodexThreadTitle } from './codex-thread-title';
import type { SessionStore } from './session-store';
import { readTranscriptData, type TranscriptData } from './transcript-title';

const STALE_AFTER_MS = 10 * 60 * 1000;
const STALE_CHECK_MS = 60 * 1000;

const TTY_INJECT_SCRIPT = `
import errno, fcntl, os, struct, sys
tty_path, message = sys.argv[1], sys.argv[2] + chr(13)
TIOCSTI = 0x80017472 if sys.platform == 'darwin' else 0x5412
fd = os.open(tty_path, os.O_WRONLY)
try:
    for b in message.encode('utf-8'):
        fcntl.ioctl(fd, TIOCSTI, struct.pack('B', b))
except OSError as e:
    os.close(fd)
    sys.exit(2 if e.errno in (errno.EPERM, errno.ENOTTY, errno.ENOTSUP, errno.EACCES) else 1)
os.close(fd)
`;

export class SessionMachine {
  private staleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: SessionStore,
    private readonly onChange: (change: SessionChange) => void
  ) {}

  listSessions(): Session[] {
    return this.store
      .listSessions()
      .map((session) => this.withCodexThreadTitle(session))
      .map((session) => this.withTranscriptData(session))
      .filter((session) => !shouldHideSession(session));
  }

  handleEvent(payload: HookEventPayload): SessionChange {
    const existing = this.store.getSession(payload.sessionId);
    const now = new Date(payload.timestamp ?? Date.now()).toISOString();
    const nextState = getNextState(existing?.state, payload.event);
    const transcriptPath = resolveTranscriptPath(payload, existing);
    const transcript = readTranscriptData(transcriptPath);
    const codexTitle =
      payload.provider === 'codex' || existing?.provider === 'codex'
        ? readCodexThreadTitle(payload.sessionId)
        : undefined;
    const label = resolveSessionLabel(payload, existing, transcript, codexTitle);
    const recentPrompt = resolveRecentPrompt(payload, existing, transcript);
    const lastResponse = resolveLastResponse(payload, existing, transcript);
    const session: Session = existing
      ? {
          ...existing,
          label,
          recentPrompt,
          lastResponse,
          state: nextState,
          cwd: payload.cwd || existing.cwd,
          lastAction: summarizeAction(payload),
          lastEvent: payload.event,
          updatedAt: now,
          stateChangedAt: existing.state === nextState ? existing.stateChangedAt : now,
          closed: false,
        }
      : {
          sessionId: payload.sessionId,
          label,
          recentPrompt,
          lastResponse,
          state: nextState,
          cwd: payload.cwd,
          lastAction: summarizeAction(payload),
          lastEvent: payload.event,
          createdAt: now,
          updatedAt: now,
          stateChangedAt: now,
          thoughts: '',
          closed: false,
        };

    if (payload.pid !== undefined) session.pid = payload.pid;
    if (payload.provider !== undefined) session.provider = payload.provider;
    else if (existing?.provider !== undefined) session.provider = existing.provider;
    if (transcriptPath !== undefined) session.transcriptPath = transcriptPath;
    if (payload.tty !== undefined) session.tty = payload.tty;
    if (payload.event === 'SessionEnd') session.endedAt = now;

    this.store.upsertSession(session);
    const change = { session, isNew: !existing };
    this.onChange(change);
    return change;
  }

  markClosed(sessionId: string): Session | null {
    const existing = this.store.getSession(sessionId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const session: Session = {
      ...existing,
      state: 'idle',
      lastAction: 'Marked closed',
      lastEvent: 'manual:markClosed',
      updatedAt: now,
      stateChangedAt: existing.state === 'idle' ? existing.stateChangedAt : now,
      endedAt: existing.endedAt ?? now,
      closed: true,
    };

    this.store.upsertSession(session);
    this.onChange({ session, isNew: false });
    return session;
  }

  deleteSession(sessionId: string): boolean {
    return this.store.deleteSession(sessionId);
  }

  sendMessage(sessionId: string, message: string): SendMessageResult {
    const session = this.store.getSession(sessionId);
    if (!session) return { ok: false, error: 'Session not found' };
    if (session.state !== 'awaiting_input') return { ok: false, error: 'Session is not awaiting input' };
    if (!session.tty) return { ok: false, error: 'No terminal attached to session' };
    if (!isValidTtyPath(session.tty)) return { ok: false, error: 'Invalid terminal path' };

    try {
      const sanitized = sanitizeMessage(message);
      const result = spawnSync('python3', ['-c', TTY_INJECT_SCRIPT, session.tty, sanitized], {
        timeout: 5000,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      if (result.status === 0) return { ok: true };
      if (result.status === 2) {
        return {
          ok: false,
          error: 'TIOCSTI disabled by macOS. Run: sudo sysctl kern.tty.enable_tiocsti=1',
        };
      }
      return { ok: false, error: 'Failed to send message to terminal' };
    } catch {
      return { ok: false, error: 'Failed to send message to terminal' };
    }
  }

  attachThoughts(sessionId: string, thoughts: string): Session | null {
    const existing = this.store.getSession(sessionId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const session: Session = {
      ...existing,
      thoughts: thoughts.trim(),
      lastAction: thoughts.trim() ? 'Thoughts attached' : existing.lastAction,
      updatedAt: now,
    };

    this.store.upsertSession(session);
    this.onChange({ session, isNew: false });
    return session;
  }

  startStalenessTimer(): void {
    if (this.staleTimer) {
      return;
    }

    this.staleTimer = setInterval(() => this.markStaleSessions(), STALE_CHECK_MS);
    this.staleTimer.unref();
  }

  stopStalenessTimer(): void {
    if (!this.staleTimer) {
      return;
    }
    clearInterval(this.staleTimer);
    this.staleTimer = null;
  }

  private markStaleSessions(): void {
    const now = Date.now();
    for (const session of this.store.listSessions()) {
      if (session.state !== 'running' && session.state !== 'awaiting_input') {
        continue;
      }
      if (now - Date.parse(session.updatedAt) < STALE_AFTER_MS) {
        continue;
      }

      const updated: Session = {
        ...session,
        state: 'stale',
        lastEvent: 'timer:stale',
        updatedAt: new Date(now).toISOString(),
        stateChangedAt: new Date(now).toISOString(),
      };
      this.store.upsertSession(updated);
      this.onChange({ session: updated, isNew: false });
    }
  }

  private withCodexThreadTitle(session: Session): Session {
    if (session.provider && session.provider !== 'codex') {
      return session;
    }

    const title = cleanTitle(readCodexThreadTitle(session.sessionId));
    if (!title || title === session.label) {
      return session;
    }

    const updated: Session = { ...session, label: title, provider: session.provider ?? 'codex' };
    this.store.upsertSession(updated);
    return updated;
  }

  private withTranscriptData(session: Session): Session {
    const transcriptPath =
      session.transcriptPath ??
      (session.provider === 'codex' ? findCodexTranscriptPath(session.sessionId) : undefined);
    const lastResponse = cleanTitle(readTranscriptData(transcriptPath).response) ?? session.lastResponse;

    if (transcriptPath === session.transcriptPath && lastResponse === session.lastResponse) {
      return session;
    }

    const updated: Session = { ...session, lastResponse };
    if (transcriptPath !== undefined) {
      updated.transcriptPath = transcriptPath;
    }

    this.store.upsertSession(updated);
    return updated;
  }
}

function getNextState(current: SessionState | undefined, event: string): SessionState {
  switch (event) {
    case 'SessionStart':
    case 'PreToolUse':
    case 'PostToolUse':
    case 'UserPromptSubmit':
      return 'running';
    case 'PermissionRequest':
    case 'Stop':
      return 'awaiting_input';
    case 'SessionEnd':
      return 'idle';
    default:
      return current ?? 'running';
  }
}

function summarizeAction(payload: HookEventPayload): string {
  switch (payload.event) {
    case 'SessionStart':
      return 'Session started';
    case 'PreToolUse':
      return payload.tool ? `Using ${payload.tool}` : 'Working';
    case 'PostToolUse':
      return payload.tool ? `Finished ${payload.tool}` : 'Working';
    case 'PermissionRequest':
      return payload.tool ? `Awaiting approval: ${payload.tool}` : 'Awaiting approval';
    case 'Stop':
      return 'Awaiting input';
    case 'UserPromptSubmit':
      return 'User prompt submitted';
    case 'SessionEnd':
      return 'Session ended';
    default:
      return payload.tool ? `${payload.event}: ${payload.tool}` : payload.event;
  }
}

function deriveLabel(cwd: string): string {
  const base = path.basename(cwd);
  return base || cwd || 'Agent session';
}

function resolveSessionLabel(
  payload: HookEventPayload,
  existing: Session | null,
  transcript: TranscriptData,
  codexTitle: string | undefined
): string {
  return (
    cleanTitle(payload.sessionName) ??
    cleanTitle(codexTitle) ??
    cleanTitle(transcript.title) ??
    existing?.label ??
    deriveLabel(payload.cwd)
  );
}

function resolveRecentPrompt(
  payload: HookEventPayload,
  existing: Session | null,
  transcript: TranscriptData
): string {
  return (
    cleanTitle(payload.prompt) ??
    cleanTitle(transcript.prompt) ??
    existing?.recentPrompt ??
    ''
  );
}

function resolveLastResponse(
  payload: HookEventPayload,
  existing: Session | null,
  transcript: TranscriptData
): string {
  return (
    cleanTitle(payload.response) ??
    cleanTitle(transcript.response) ??
    existing?.lastResponse ??
    ''
  );
}

function resolveTranscriptPath(
  payload: HookEventPayload,
  existing: Session | null
): string | undefined {
  return (
    payload.transcriptPath ??
    existing?.transcriptPath ??
    (payload.provider === 'codex' || existing?.provider === 'codex'
      ? findCodexTranscriptPath(payload.sessionId)
      : undefined)
  );
}

function cleanTitle(value: string | undefined): string | undefined {
  const title = value?.trim();
  return title ? title : undefined;
}

function isValidTtyPath(ttyPath: string): boolean {
  return /^\/dev\/(ttys?\d+|pts\/\d+)$/.test(ttyPath);
}

function sanitizeMessage(message: string): string {
  // Strip terminal control characters before injecting input into the session tty.
  // eslint-disable-next-line no-control-regex
  return message.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '');
}
