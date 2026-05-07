import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS, HOOK_PORT, type SessionChange } from '../shared/types';
import { HookHttpServer } from './http-server';
import { install as installHook } from './hook-installer';
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc-handlers';
import { SessionMachine } from './session-machine';
import { SessionStore } from './session-store';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: SessionStore | null = null;
let machine: SessionMachine | null = null;
let server: HookHttpServer | null = null;
let isQuitting = false;

const fallbackTrayIcon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR42mNk+M9Qz0AEYBxVSFUBAAAdJQIRAk7Y0AAAAABJRU5ErkJggg==';

function broadcastSessionChange(change: SessionChange): void {
  const channel = change.isNew ? IPC_CHANNELS.sessionCreated : IPC_CHANNELS.sessionUpdated;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, change.session);
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: 'Atrium',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on('close', (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    window.hide();
  });

  window.once('ready-to-show', () => window.show());

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return window;
}

function createTray(): Tray {
  const image = nativeImage.createFromPath(getIconPath());
  const trayImage = image.isEmpty() ? nativeImage.createFromDataURL(fallbackTrayIcon) : image;
  trayImage.setTemplateImage(true);

  const appTray = new Tray(trayImage);
  appTray.setToolTip('Atrium');
  appTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show Canvas',
        click: showMainWindow,
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  appTray.on('click', showMainWindow);
  return appTray;
}

function showMainWindow(): void {
  if (!mainWindow) {
    mainWindow = createWindow();
  }
  mainWindow.show();
  mainWindow.focus();
}

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(process.cwd(), 'resources', 'icon.png');
}

async function boot(): Promise<void> {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  store = new SessionStore();
  machine = new SessionMachine(store, broadcastSessionChange);
  registerIpcHandlers(machine);

  server = new HookHttpServer(machine);
  await server.start(HOOK_PORT);
  machine.startStalenessTimer();

  installHook();

  mainWindow = createWindow();
  tray = createTray();
}

app.whenReady().then(() => {
  void boot().catch((error) => {
    console.error('[atrium] boot failed', error);
    app.quit();
  });
});

app.on('activate', showMainWindow);

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {});

app.on('will-quit', async () => {
  unregisterIpcHandlers();
  machine?.stopStalenessTimer();
  await server?.stop();
  store?.close();
  tray = null;
});
