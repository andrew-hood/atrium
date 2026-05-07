export const HOOK_PORT = 21517;

export const IPC_CHANNELS = {
  listSessions: 'session:list',
  markClosed: 'session:markClosed',
  deleteSession: 'session:delete',
  attachThoughts: 'session:attachThoughts',
  sendMessage: 'session:sendMessage',
  sessionCreated: 'session:created',
  sessionUpdated: 'session:updated',
} as const;

export interface SendMessageResult {
  ok: boolean;
  error?: string;
}

export type SessionState = 'running' | 'awaiting_input' | 'idle' | 'errored' | 'stale';

export type HookEventName =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PermissionRequest'
  | 'Stop'
  | 'UserPromptSubmit'
  | 'SessionEnd'
  | string;

export interface HookEventPayload {
  event: HookEventName;
  provider?: string;
  sessionId: string;
  sessionName?: string;
  transcriptPath?: string;
  cwd: string;
  model?: string;
  pid?: number;
  tty?: string | null;
  tool?: string;
  toolInput?: unknown;
  toolUseId?: string;
  prompt?: string;
  response?: string;
  status?: string;
  timestamp?: number;
  raw?: Record<string, unknown>;
}

export interface Session {
  sessionId: string;
  provider?: string;
  label: string;
  transcriptPath?: string;
  recentPrompt: string;
  lastResponse: string;
  state: SessionState;
  cwd: string;
  pid?: number;
  tty?: string | null;
  lastAction: string;
  lastEvent: string;
  createdAt: string;
  updatedAt: string;
  stateChangedAt: string;
  endedAt?: string;
  thoughts: string;
  closed: boolean;
}

export interface SessionChange {
  session: Session;
  isNew: boolean;
}

export type SessionListener = (session: Session) => void;

export interface AtriumAPI {
  listSessions(): Promise<Session[]>;
  markClosed(sessionId: string): Promise<Session | null>;
  deleteSession(sessionId: string): Promise<boolean>;
  attachThoughts(sessionId: string, thoughts: string): Promise<Session | null>;
  sendMessage(sessionId: string, message: string): Promise<SendMessageResult>;
  onSessionCreated(listener: SessionListener): () => void;
  onSessionUpdated(listener: SessionListener): () => void;
}
