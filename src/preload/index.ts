import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type AtriumAPI, type Session, type SessionListener } from '../shared/types';

function onSession(channel: typeof IPC_CHANNELS.sessionCreated | typeof IPC_CHANNELS.sessionUpdated, listener: SessionListener) {
  const wrapped = (_event: Electron.IpcRendererEvent, session: Session) => listener(session);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.off(channel, wrapped);
}

const api: AtriumAPI = {
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.listSessions),
  markClosed: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.markClosed, sessionId),
  deleteSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.deleteSession, sessionId),
  attachThoughts: (sessionId, thoughts) => ipcRenderer.invoke(IPC_CHANNELS.attachThoughts, sessionId, thoughts),
  sendMessage: (sessionId, message) => ipcRenderer.invoke(IPC_CHANNELS.sendMessage, sessionId, message),
  openSessionContext: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.openSessionContext, sessionId),
  onSessionCreated: (listener) => onSession(IPC_CHANNELS.sessionCreated, listener),
  onSessionUpdated: (listener) => onSession(IPC_CHANNELS.sessionUpdated, listener),
};

contextBridge.exposeInMainWorld('api', api);
