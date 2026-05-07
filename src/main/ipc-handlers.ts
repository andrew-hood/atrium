import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { ipcMain, shell } from 'electron';
import { IPC_CHANNELS, type OpenSessionContextResult, type Session } from '../shared/types';
import { SessionMachine } from './session-machine';

export function registerIpcHandlers(machine: SessionMachine): void {
  ipcMain.handle(IPC_CHANNELS.listSessions, () => machine.listSessions());
  ipcMain.handle(IPC_CHANNELS.markClosed, (_event, sessionId: string) => machine.markClosed(sessionId));
  ipcMain.handle(IPC_CHANNELS.deleteSession, (_event, sessionId: string) => machine.deleteSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.attachThoughts, (_event, sessionId: string, thoughts: string) =>
    machine.attachThoughts(sessionId, thoughts)
  );
  ipcMain.handle(IPC_CHANNELS.sendMessage, (_event, sessionId: string, message: string) =>
    machine.sendMessage(sessionId, message)
  );
  ipcMain.handle(IPC_CHANNELS.openSessionContext, (_event, sessionId: string) =>
    openSessionContext(machine.listSessions().find((session) => session.sessionId === sessionId))
  );
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.listSessions);
  ipcMain.removeHandler(IPC_CHANNELS.markClosed);
  ipcMain.removeHandler(IPC_CHANNELS.deleteSession);
  ipcMain.removeHandler(IPC_CHANNELS.attachThoughts);
  ipcMain.removeHandler(IPC_CHANNELS.sendMessage);
  ipcMain.removeHandler(IPC_CHANNELS.openSessionContext);
}

async function openSessionContext(session: Session | undefined): Promise<OpenSessionContextResult> {
  if (!session) {
    return { ok: false, error: 'Session not found' };
  }

  const cwd = session.cwd.trim();
  if (!cwd) {
    return { ok: false, error: 'No working directory recorded' };
  }

  if (!isExistingDirectory(cwd)) {
    return { ok: false, error: 'Working directory no longer exists' };
  }

  if (process.platform === 'darwin') {
    const terminalResult = openMacTerminal(cwd);
    if (terminalResult.ok) {
      return terminalResult;
    }
  }

  const error = await shell.openPath(cwd);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, target: 'project' };
}

function openMacTerminal(cwd: string): OpenSessionContextResult {
  try {
    const child = spawn('/usr/bin/open', ['-a', 'Terminal', cwd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { ok: true, target: 'terminal' };
  } catch {
    return { ok: false, error: 'Failed to open Terminal' };
  }
}

function isExistingDirectory(value: string): boolean {
  try {
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
}
