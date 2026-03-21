import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { join } from 'path';
import { setupShortcutBlocker, releaseShortcutBlocker } from './shortcutBlocker';
import { WindowManager } from './windowManager';

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

let windowManager: WindowManager;

app.on('ready', () => {
  windowManager = new WindowManager(isDev);
  windowManager.createKioskWindow();
  setupShortcutBlocker();
});

app.on('will-quit', () => {
  releaseShortcutBlocker();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: Start session
ipcMain.handle('session:start', async (_event, token: string) => {
  try {
    const apiUrl = isDev ? 'http://localhost:3001' : 'http://localhost:3001';
    const res = await fetch(`${apiUrl}/sessions/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.message ?? 'Failed to start session');

    windowManager.unlockKiosk(token, data.session.id, data.balance_cents, data.time_remaining_seconds);
    return { sessionId: data.session.id };
  } catch (err: any) {
    throw new Error(err.message ?? 'Failed to start session');
  }
});

// IPC: End session
ipcMain.handle('session:end', async (_event, sessionId: string, token: string) => {
  try {
    const apiUrl = 'http://localhost:3001';
    await fetch(`${apiUrl}/sessions/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    windowManager.lockKiosk();
  } catch (err: any) {
    throw new Error(err.message ?? 'Failed to end session');
  }
});

// IPC: End current session (called from overlay)
ipcMain.handle('session:end:current', async () => {
  await windowManager.endCurrentSession();
});

// IPC: Toggle overlay mouse ignore (for clickable elements in overlay)
ipcMain.on('overlay:set-ignore-mouse', (_event, ignore: boolean) => {
  windowManager.setOverlayIgnoreMouse(ignore);
});

// Crash recovery
app.on('render-process-gone', (_event, _wc, details) => {
  console.error('Renderer process gone:', details);
  windowManager?.lockKiosk();
});
