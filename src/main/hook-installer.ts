import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOOK_SCRIPT_NAME = 'atrium-hook.py';
const HOOK_MARKER = 'atrium-hook.py';

const CLAUDE_HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');
const CLAUDE_HOOK_SCRIPT = path.join(CLAUDE_HOOKS_DIR, HOOK_SCRIPT_NAME);
const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

const CODEX_HOME = path.join(os.homedir(), '.codex');
const CODEX_HOOKS_DIR = path.join(CODEX_HOME, 'hooks');
const CODEX_HOOK_SCRIPT = path.join(CODEX_HOOKS_DIR, HOOK_SCRIPT_NAME);
const CODEX_HOOKS_FILE = path.join(CODEX_HOME, 'hooks.json');
const CODEX_CONFIG_FILE = path.join(CODEX_HOME, 'config.toml');

const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'] as const;
const CLAUDE_SESSION_EVENTS = ['SessionStart', 'Stop', 'UserPromptSubmit', 'SessionEnd'] as const;
const CLAUDE_HOOK_EVENTS = [...CLAUDE_SESSION_EVENTS, ...TOOL_EVENTS] as const;

const CODEX_TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PermissionRequest'] as const;
const CODEX_SESSION_EVENTS = ['Stop', 'UserPromptSubmit'] as const;
const CODEX_HOOK_EVENTS = [...CODEX_SESSION_EVENTS, ...CODEX_TOOL_EVENTS] as const;
const CODEX_MANAGED_EVENTS = ['SessionStart', ...CODEX_HOOK_EVENTS] as const;

type HookEntry = {
  matcher?: string;
  hooks?: Array<{ type: string; command: string }>;
};

function hookEntry(provider: 'claude' | 'codex', event: string, scriptPath: string): HookEntry {
  const hook = {
    type: 'command',
    command: `ATRIUM_EVENT=${event} ATRIUM_PROVIDER=${provider} python3 ${shellQuote(scriptPath)}`,
  };
  if ((TOOL_EVENTS as readonly string[]).includes(event)) {
    return { matcher: '*', hooks: [hook] };
  }
  return { hooks: [hook] };
}

function codexHookEntry(event: string): HookEntry {
  const hook = {
    type: 'command',
    command: `ATRIUM_EVENT=${event} ATRIUM_PROVIDER=codex python3 ${shellQuote(CODEX_HOOK_SCRIPT)}`,
  };

  if ((CODEX_TOOL_EVENTS as readonly string[]).includes(event)) {
    return { matcher: '*', hooks: [hook] };
  }

  return { hooks: [hook] };
}

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJsonFile(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getBundledHookPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'hooks', HOOK_SCRIPT_NAME);
  }
  return path.join(process.cwd(), 'hooks', HOOK_SCRIPT_NAME);
}

export function install(): void {
  installClaudeHooks();
  installCodexHooks();
}

export function uninstall(): void {
  uninstallClaudeHooks();
  uninstallCodexHooks();
}

export function isInstalled(): boolean {
  return isClaudeInstalled() || isCodexInstalled();
}

function installClaudeHooks(): void {
  installHookScript(CLAUDE_HOOK_SCRIPT);

  const settings = readJsonFile(CLAUDE_SETTINGS_FILE);
  const hooks = ((settings.hooks as Record<string, unknown[]>) ?? {}) as Record<string, HookEntry[]>;

  for (const event of CLAUDE_HOOK_EVENTS) {
    const existing = hooks[event] ?? [];
    const alreadyPresent = existing.some((entry) =>
      entry.hooks?.some((hook) => hook.command.includes(HOOK_MARKER))
    );
    if (!alreadyPresent) {
      existing.push(hookEntry('claude', event, CLAUDE_HOOK_SCRIPT));
    }
    hooks[event] = existing;
  }

  settings.hooks = hooks;
  writeJsonFile(CLAUDE_SETTINGS_FILE, settings);
}

function installCodexHooks(): void {
  installHookScript(CODEX_HOOK_SCRIPT);
  ensureCodexHooksFeature();

  const settings = readJsonFile(CODEX_HOOKS_FILE);
  const hooks = ((settings.hooks as Record<string, unknown[]>) ?? {}) as Record<string, HookEntry[]>;

  for (const event of CODEX_MANAGED_EVENTS) {
    hooks[event] = removeAtriumHooks(hooks[event] ?? []);
    if (hooks[event].length === 0) {
      delete hooks[event];
    }
  }

  for (const event of CODEX_HOOK_EVENTS) {
    const existing = hooks[event] ?? [];
    existing.push(codexHookEntry(event));
    hooks[event] = existing;
  }

  settings.hooks = hooks;
  writeJsonFile(CODEX_HOOKS_FILE, settings);
}

function uninstallClaudeHooks(): void {
  removeHookScript(CLAUDE_HOOK_SCRIPT);

  const settings = readJsonFile(CLAUDE_SETTINGS_FILE);
  const hooks = ((settings.hooks as Record<string, unknown[]>) ?? {}) as Record<string, HookEntry[]>;

  for (const event of CLAUDE_HOOK_EVENTS) {
    hooks[event] = (hooks[event] ?? []).filter(
      (entry) => !entry.hooks?.some((hook) => hook.command.includes(HOOK_MARKER))
    );
    if (hooks[event].length === 0) {
      delete hooks[event];
    }
  }

  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  } else {
    settings.hooks = hooks;
  }
  writeJsonFile(CLAUDE_SETTINGS_FILE, settings);
}

function uninstallCodexHooks(): void {
  removeHookScript(CODEX_HOOK_SCRIPT);

  const settings = readJsonFile(CODEX_HOOKS_FILE);
  const hooks = ((settings.hooks as Record<string, unknown[]>) ?? {}) as Record<string, HookEntry[]>;

  for (const event of CODEX_MANAGED_EVENTS) {
    hooks[event] = removeAtriumHooks(hooks[event] ?? []);
    if (hooks[event].length === 0) {
      delete hooks[event];
    }
  }

  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  } else {
    settings.hooks = hooks;
  }
  writeJsonFile(CODEX_HOOKS_FILE, settings);
}

function isClaudeInstalled(): boolean {
  const settings = readJsonFile(CLAUDE_SETTINGS_FILE);
  const hooks = ((settings.hooks as Record<string, unknown[]>) ?? {}) as Record<string, HookEntry[]>;
  return Object.values(hooks).some((entries) =>
    entries.some((entry) => entry.hooks?.some((hook) => hook.command.includes(HOOK_MARKER)))
  );
}

function isCodexInstalled(): boolean {
  const settings = readJsonFile(CODEX_HOOKS_FILE);
  const hooks = ((settings.hooks as Record<string, unknown[]>) ?? {}) as Record<string, HookEntry[]>;
  return Object.values(hooks).some((entries) =>
    entries.some((entry) => entry.hooks?.some((hook) => hook.command.includes(HOOK_MARKER)))
  );
}

function installHookScript(targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(getBundledHookPath(), targetPath);
  fs.chmodSync(targetPath, 0o755);
}

function removeHookScript(targetPath: string): void {
  try {
    fs.unlinkSync(targetPath);
  } catch {
    // Already absent.
  }
}

function removeAtriumHooks(entries: HookEntry[]): HookEntry[] {
  return entries.filter((entry) => !entry.hooks?.some((hook) => hook.command.includes(HOOK_MARKER)));
}

function ensureCodexHooksFeature(): void {
  const existing = readTextFile(CODEX_CONFIG_FILE);
  const updated = setTomlFeatureFlag(existing, 'codex_hooks', true);
  if (updated !== existing) {
    fs.mkdirSync(path.dirname(CODEX_CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CODEX_CONFIG_FILE, updated);
  }
}

function setTomlFeatureFlag(content: string, key: string, value: boolean): string {
  const normalizedValue = String(value);
  if (content.trim().length === 0) {
    return `[features]\n${key} = ${normalizedValue}\n`;
  }

  const lines = content.split('\n');
  const featuresIndex = lines.findIndex((line) => isTomlTable(line, 'features'));
  if (featuresIndex === -1) {
    return `[features]\n${key} = ${normalizedValue}\n\n${content}`;
  }

  const sectionEnd = findTomlSectionEnd(lines, featuresIndex);
  const existingIndex = lines.findIndex((line, index) => {
    return index > featuresIndex && index < sectionEnd && new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(line);
  });

  if (existingIndex !== -1) {
    const comment = lines[existingIndex]?.match(/(\s+#.*)$/)?.[1] ?? '';
    const indent = lines[existingIndex]?.match(/^(\s*)/)?.[1] ?? '';
    lines[existingIndex] = `${indent}${key} = ${normalizedValue}${comment}`;
    return lines.join('\n');
  }

  lines.splice(featuresIndex + 1, 0, `${key} = ${normalizedValue}`);
  return lines.join('\n');
}

function findTomlSectionEnd(lines: string[], sectionIndex: number): number {
  const nextSectionIndex = lines.findIndex((line, index) => index > sectionIndex && /^\s*\[.+\]\s*(?:#.*)?$/.test(line));
  return nextSectionIndex === -1 ? lines.length : nextSectionIndex;
}

function isTomlTable(line: string, tableName: string): boolean {
  return new RegExp(`^\\s*\\[${escapeRegExp(tableName)}\\]\\s*(?:#.*)?$`).test(line);
}

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
