import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
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
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.listSessions);
  ipcMain.removeHandler(IPC_CHANNELS.markClosed);
  ipcMain.removeHandler(IPC_CHANNELS.deleteSession);
  ipcMain.removeHandler(IPC_CHANNELS.attachThoughts);
  ipcMain.removeHandler(IPC_CHANNELS.sendMessage);
}
