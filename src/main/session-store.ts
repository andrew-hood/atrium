import { app } from 'electron';
import Database from 'better-sqlite3';
import path from 'node:path';
import type { Session, SessionState } from '../shared/types';

interface SessionRow {
  session_id: string;
  provider: string | null;
  label: string;
  transcript_path: string | null;
  recent_prompt: string | null;
  last_response: string | null;
  state: SessionState;
  cwd: string;
  pid: number | null;
  tty: string | null;
  last_action: string;
  last_event: string;
  created_at: string;
  updated_at: string;
  state_changed_at: string;
  ended_at: string | null;
  thoughts: string | null;
  closed: 0 | 1;
}

export class SessionStore {
  private readonly db: Database.Database;

  constructor(dbPath = path.join(app.getPath('userData'), 'atrium.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        provider TEXT,
        label TEXT NOT NULL,
        transcript_path TEXT,
        recent_prompt TEXT,
        last_response TEXT,
        state TEXT NOT NULL,
        cwd TEXT NOT NULL,
        pid INTEGER,
        tty TEXT,
        last_action TEXT NOT NULL,
        last_event TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        state_changed_at TEXT NOT NULL,
        ended_at TEXT,
        thoughts TEXT,
        closed INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    `);
    this.ensureColumn('sessions', 'provider', 'TEXT');
    this.ensureColumn('sessions', 'transcript_path', 'TEXT');
    this.ensureColumn('sessions', 'recent_prompt', 'TEXT');
    this.ensureColumn('sessions', 'last_response', 'TEXT');
  }

  listSessions(): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
      .all() as SessionRow[];
    return rows.map(rowToSession);
  }

  getSession(sessionId: string): Session | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE session_id = ?')
      .get(sessionId) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  upsertSession(session: Session): void {
    this.db
      .prepare(`
        INSERT INTO sessions (
          session_id,
          provider,
          label,
          transcript_path,
          recent_prompt,
          last_response,
          state,
          cwd,
          pid,
          tty,
          last_action,
          last_event,
          created_at,
          updated_at,
          state_changed_at,
          ended_at,
          thoughts,
          closed
        )
        VALUES (
          @sessionId,
          @provider,
          @label,
          @transcriptPath,
          @recentPrompt,
          @lastResponse,
          @state,
          @cwd,
          @pid,
          @tty,
          @lastAction,
          @lastEvent,
          @createdAt,
          @updatedAt,
          @stateChangedAt,
          @endedAt,
          @thoughts,
          @closedInt
        )
        ON CONFLICT(session_id) DO UPDATE SET
          provider = excluded.provider,
          label = excluded.label,
          transcript_path = excluded.transcript_path,
          recent_prompt = excluded.recent_prompt,
          last_response = excluded.last_response,
          state = excluded.state,
          cwd = excluded.cwd,
          pid = excluded.pid,
          tty = excluded.tty,
          last_action = excluded.last_action,
          last_event = excluded.last_event,
          updated_at = excluded.updated_at,
          state_changed_at = excluded.state_changed_at,
          ended_at = excluded.ended_at,
          thoughts = excluded.thoughts,
          closed = excluded.closed
      `)
      .run(toDbParams(session));
  }

  deleteSession(sessionId: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!rows.some((row) => row.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

function toDbParams(session: Session): Record<string, unknown> {
  return {
    ...session,
    provider: session.provider ?? null,
    transcriptPath: session.transcriptPath ?? null,
    recentPrompt: session.recentPrompt ?? '',
    lastResponse: session.lastResponse ?? '',
    pid: session.pid ?? null,
    tty: session.tty ?? null,
    endedAt: session.endedAt ?? null,
    thoughts: session.thoughts ?? '',
    closedInt: session.closed ? 1 : 0,
  };
}

function rowToSession(row: SessionRow): Session {
  const session: Session = {
    sessionId: row.session_id,
    label: row.label,
    recentPrompt: row.recent_prompt ?? '',
    lastResponse: row.last_response ?? '',
    state: row.state,
    cwd: row.cwd,
    lastAction: row.last_action,
    lastEvent: row.last_event,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stateChangedAt: row.state_changed_at,
    thoughts: row.thoughts ?? '',
    closed: row.closed === 1,
  };

  if (row.provider !== null) session.provider = row.provider;
  if (row.pid !== null) session.pid = row.pid;
  if (row.transcript_path !== null) session.transcriptPath = row.transcript_path;
  if (row.tty !== null) session.tty = row.tty;
  if (row.ended_at !== null) session.endedAt = row.ended_at;

  return session;
}
