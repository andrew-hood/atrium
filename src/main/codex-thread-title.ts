import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CODEX_HOME = path.join(os.homedir(), '.codex');
const CODEX_SESSION_INDEX = path.join(CODEX_HOME, 'session_index.jsonl');
const CODEX_STATE_DB = path.join(CODEX_HOME, 'state_5.sqlite');
const CODEX_SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
const TRANSCRIPT_PATH_CACHE_TTL_MS = 5_000;

interface FileSignature {
  mtimeMs: number;
  size: number;
}

interface TitleCacheEntry {
  dbSignature: FileSignature | null;
  indexSignature: FileSignature | null;
  title: string | undefined;
}

interface TranscriptPathCacheEntry {
  checkedAt: number;
  value: string | undefined;
}

interface TranscriptFileEntry {
  name: string;
  path: string;
}

const titleCache = new Map<string, TitleCacheEntry>();
const transcriptPathCache = new Map<string, TranscriptPathCacheEntry>();
let transcriptFileCache: { checkedAt: number; files: TranscriptFileEntry[] } | null = null;

export function readCodexThreadTitle(sessionId: string): string | undefined {
  const indexSignature = getFileSignature(CODEX_SESSION_INDEX);
  const dbSignature = getFileSignature(CODEX_STATE_DB);
  const cached = titleCache.get(sessionId);
  if (
    cached &&
    sameSignature(cached.indexSignature, indexSignature) &&
    sameSignature(cached.dbSignature, dbSignature)
  ) {
    return cached.title;
  }

  const title =
    cleanTitle(readCodexThreadTitleFromIndex(sessionId)) ??
    cleanTitle(readCodexThreadTitleFromStateDb(sessionId));
  titleCache.set(sessionId, { dbSignature, indexSignature, title });
  return title;
}

export function findCodexTranscriptPath(sessionId: string): string | undefined {
  const now = Date.now();
  const cached = transcriptPathCache.get(sessionId);
  if (cached && (cached.value || now - cached.checkedAt < TRANSCRIPT_PATH_CACHE_TTL_MS)) {
    return cached.value;
  }

  const transcriptPath = findCodexTranscriptPathInDir(sessionId, now);
  transcriptPathCache.set(sessionId, { checkedAt: now, value: transcriptPath });
  return transcriptPath;
}

function readCodexThreadTitleFromIndex(sessionId: string): string | undefined {
  try {
    let title: string | undefined;
    for (const line of fs.readFileSync(CODEX_SESSION_INDEX, 'utf8').split('\n')) {
      if (!line.includes(sessionId)) {
        continue;
      }

      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.id === sessionId && typeof record.thread_name === 'string') {
          title = record.thread_name;
        }
      } catch {
        // Ignore partial or non-JSON index lines.
      }
    }
    return title;
  } catch {
    return undefined;
  }
}

function readCodexThreadTitleFromStateDb(sessionId: string): string | undefined {
  let db: Database.Database | null = null;

  try {
    db = new Database(CODEX_STATE_DB, { readonly: true, fileMustExist: true });
    const row = db.prepare('SELECT title FROM threads WHERE id = ?').get(sessionId) as
      | { title?: unknown }
      | undefined;
    return typeof row?.title === 'string' ? row.title : undefined;
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}

function findCodexTranscriptPathInDir(sessionId: string, now: number): string | undefined {
  for (const file of getCodexTranscriptFiles(now)) {
    if (file.name.includes(sessionId)) {
      return file.path;
    }
  }

  return undefined;
}

function getCodexTranscriptFiles(now: number): TranscriptFileEntry[] {
  if (transcriptFileCache && now - transcriptFileCache.checkedAt < TRANSCRIPT_PATH_CACHE_TTL_MS) {
    return transcriptFileCache.files;
  }

  const files: TranscriptFileEntry[] = [];
  const stack = [CODEX_SESSIONS_DIR];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push({ name: entry.name, path: fullPath });
      }
    }
  }

  transcriptFileCache = { checkedAt: now, files };
  return files;
}

function cleanTitle(value: string | undefined): string | undefined {
  const title = value?.trim();
  return title ? title : undefined;
}

function getFileSignature(filePath: string): FileSignature | null {
  try {
    const stats = fs.statSync(filePath);
    return {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    };
  } catch {
    return null;
  }
}

function sameSignature(left: FileSignature | null, right: FileSignature | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}
