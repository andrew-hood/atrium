import type { HookEventPayload, Session } from './types';

const CODEX_TITLE_PROMPT_PREFIX =
  'You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task';

export function shouldIgnoreHookPayload(payload: HookEventPayload): boolean {
  return isCodexPayload(payload) && (payload.event === 'SessionStart' || isGeneratedTitlePrompt(payload.prompt));
}

export function shouldHideSession(session: Pick<Session, 'recentPrompt' | 'transcriptPath'>): boolean {
  return !session.transcriptPath && isGeneratedTitlePrompt(session.recentPrompt);
}

function isCodexPayload(payload: HookEventPayload): boolean {
  return payload.provider === 'codex';
}

function isGeneratedTitlePrompt(value: string | undefined): boolean {
  const prompt = value?.replace(/\s+/g, ' ').trim();
  return prompt?.startsWith(CODEX_TITLE_PROMPT_PREFIX) ?? false;
}
