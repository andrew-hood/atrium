import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_TRANSCRIPT_BYTES = 256 * 1024;

export interface TranscriptData {
  title?: string;
  prompt?: string;
  response?: string;
}

interface TranscriptCacheEntry {
  mtimeMs: number;
  size: number;
  data: TranscriptData;
}

const transcriptDataCache = new Map<string, TranscriptCacheEntry>();

export function readTranscriptData(transcriptPath: string | undefined): TranscriptData {
  if (!transcriptPath) {
    return {};
  }

  const resolvedPath = expandHome(transcriptPath);

  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      return {};
    }

    const cached = transcriptDataCache.get(resolvedPath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return cached.data;
    }

    const data = readTranscriptDataFromFile(resolvedPath, stats.size);
    transcriptDataCache.set(resolvedPath, {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      data,
    });
    return data;
  } catch {
    return {};
  }
}

export function readTranscriptTitle(transcriptPath: string | undefined): string | undefined {
  return readTranscriptData(transcriptPath).title;
}

export function readTranscriptPrompt(transcriptPath: string | undefined): string | undefined {
  return readTranscriptData(transcriptPath).prompt;
}

export function readTranscriptResponse(transcriptPath: string | undefined): string | undefined {
  return readTranscriptData(transcriptPath).response;
}

function readTranscriptDataFromFile(resolvedPath: string, size: number): TranscriptData {
  const fd = fs.openSync(resolvedPath, 'r');
  try {
    const headLength = Math.min(size, MAX_TRANSCRIPT_BYTES);
    const tailLength = Math.min(size, MAX_TRANSCRIPT_BYTES);
    const tailStart = Math.max(0, size - tailLength);
    const headChunk = readChunk(fd, headLength, 0);
    const tailChunk = tailStart === 0 && tailLength === headLength
      ? headChunk
      : readChunk(fd, tailLength, tailStart);
    const data: TranscriptData = {};
    const title = findTitle(headChunk);
    const prompt = findMostRecentPrompt(tailChunk);
    const response = findMostRecentAssistantResponse(tailChunk);

    if (title) data.title = title;
    if (prompt) data.prompt = prompt;
    if (response) data.response = response;
    return data;
  } finally {
    fs.closeSync(fd);
  }
}

function readChunk(fd: number, length: number, position: number): string {
  if (length <= 0) {
    return '';
  }

  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, position);
  return buffer.toString('utf8');
}

function findTitle(chunk: string): string | undefined {
  for (const line of chunk.split('\n')) {
    if (!line.includes('"ai-title"') && !line.includes('"aiTitle"')) {
      continue;
    }

    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (record.type === 'ai-title' && typeof record.aiTitle === 'string') {
        const title = record.aiTitle.trim();
        return title.length > 0 ? title : undefined;
      }
    } catch {
      // Ignore partial or non-JSON transcript lines.
    }
  }

  return undefined;
}

function findMostRecentPrompt(chunk: string): string | undefined {
  let prompt: string | undefined;

  for (const line of chunk.split('\n')) {
    if (!line.includes('"last-prompt"') && !line.includes('"lastPrompt"') && !line.includes('"prompt"')) {
      continue;
    }

    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (record.type === 'last-prompt' && typeof record.lastPrompt === 'string') {
        prompt = cleanText(record.lastPrompt);
      } else if (typeof record.prompt === 'string') {
        prompt = cleanText(record.prompt);
      }
    } catch {
      // Ignore partial or non-JSON transcript lines.
    }
  }

  return prompt;
}

function findMostRecentAssistantResponse(chunk: string): string | undefined {
  let response: string | undefined;

  for (const line of chunk.split('\n')) {
    if (
      !line.includes('"assistant"') &&
      !line.includes('"agent_message"') &&
      !line.includes('"output_text"')
    ) {
      continue;
    }

    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      response = extractAssistantResponse(record) ?? response;
    } catch {
      // Ignore partial or non-JSON transcript lines.
    }
  }

  return response;
}

function extractAssistantResponse(record: Record<string, unknown>): string | undefined {
  if (record.type === 'assistant') {
    return extractAssistantMessageText(record.message);
  }

  if (record.type === 'response_item') {
    return extractCodexResponseItemText(record.payload);
  }

  if (record.type === 'event_msg') {
    return extractCodexEventMessageText(record.payload);
  }

  return undefined;
}

function extractAssistantMessageText(value: unknown): string | undefined {
  if (!isRecord(value) || value.role !== 'assistant') {
    return undefined;
  }

  return extractContentText(value.content, ['text']);
}

function extractCodexResponseItemText(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== 'message' || value.role !== 'assistant') {
    return undefined;
  }

  return extractContentText(value.content, ['output_text', 'text']);
}

function extractCodexEventMessageText(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== 'agent_message' || typeof value.message !== 'string') {
    return undefined;
  }

  return cleanText(value.message);
}

function extractContentText(value: unknown, allowedTypes: string[]): string | undefined {
  if (typeof value === 'string') {
    return cleanText(value);
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts = value
    .map((item) => {
      if (!isRecord(item) || typeof item.text !== 'string') {
        return undefined;
      }

      return typeof item.type === 'string' && allowedTypes.includes(item.type)
        ? item.text.trim()
        : undefined;
    })
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function cleanText(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function expandHome(filePath: string): string {
  return filePath === '~' || filePath.startsWith('~/')
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;
}
