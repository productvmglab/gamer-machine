import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { join } from 'path';
import { execFile, execFileSync } from 'child_process';
import { setupShortcutBlocker, releaseShortcutBlocker } from './shortcutBlocker';
import { WindowManager } from './windowManager';

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

let windowManager: WindowManager;

// ── Registry helpers (Windows only) ─────────────────────────────────────────

const REG_HKLM_PATH = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System';
const REG_HKCU_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System';

function isTaskMgrDisabled(): boolean {
  if (process.platform !== 'win32') return true; // N/A on non-Windows
  for (const path of [REG_HKLM_PATH, REG_HKCU_PATH]) {
    try {
      const result = execFileSync(
        'reg',
        ['query', path, '/v', 'DisableTaskMgr'],
        { windowsHide: true, encoding: 'utf8', timeout: 3000 },
      );
      if (result.includes('0x1') || result.includes('1')) return true;
    } catch {
      // Key or value not found
    }
  }
  return false;
}

/**
 * Attempt to disable Task Manager via registry.
 *
 * Strategy:
 * 1. Try HKCU (no elevation needed, works on most machines).
 * 2. If denied, spawn an elevated PowerShell via UAC (Start-Process -Verb RunAs).
 *    UAC appears only if HKCU write fails — once approved the HKLM key persists
 *    across restarts so UAC never shows again.
 */
function applyKioskRegistry() {
  if (process.platform !== 'win32') return;

  // Fast path: already set
  if (isTaskMgrDisabled()) {
    console.log('[kiosk] Task Manager already disabled via registry ✓');
    return;
  }

  const scriptPath = join(app.getAppPath(), '..', '..', 'scripts', 'setup-kiosk.ps1');

  // Step 1: try without elevation (HKCU)
  execFile(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-File', scriptPath, '-Quiet'],
    { windowsHide: true, timeout: 8000 },
    (err) => {
      if (!err && isTaskMgrDisabled()) {
        console.log('[kiosk] Task Manager disabled via HKCU registry ✓');
        return;
      }

      // Step 2: HKCU write was denied → request elevation via UAC
      console.warn('[kiosk] HKCU write denied. Requesting elevation to set HKLM registry key...');
      const escapedPath = scriptPath.replace(/'/g, "''");
      execFile(
        'powershell.exe',
        [
          '-NoProfile', '-ExecutionPolicy', 'Bypass',
          '-Command',
          `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden ` +
          `-ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ''${escapedPath}'' -Quiet'`,
        ],
        { windowsHide: false, timeout: 30000 },
        (elevErr) => {
          if (elevErr) {
            console.warn(
              '[kiosk] UAC was cancelled or failed — Task Manager NOT blocked via registry.\n' +
              '[kiosk] For full protection, run scripts/setup-kiosk.ps1 as Administrator.',
            );
          } else if (isTaskMgrDisabled()) {
            console.log('[kiosk] Task Manager disabled via HKLM registry (elevated) ✓');
          } else {
            console.warn('[kiosk] Registry key not set after elevation — check setup-kiosk.ps1.');
          }
        },
      );
    },
  );
}

function restoreKioskRegistry() {
  if (process.platform !== 'win32') return;
  const scriptPath = join(app.getAppPath(), '..', '..', 'scripts', 'restore-kiosk.ps1');
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-File', scriptPath, '-Quiet'],
      { windowsHide: true, timeout: 5000 },
    );
    console.log('[kiosk] Registry kiosk settings restored.');
  } catch {
    // HKLM restore needs admin — skip silently; admin should run restore-kiosk.ps1 manually
    console.warn('[kiosk] Could not restore HKLM key — run scripts/restore-kiosk.ps1 as Administrator if needed.');
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', () => {
  windowManager = new WindowManager(isDev);
  windowManager.createKioskWindow();
  setupShortcutBlocker();

  if (!isDev) {
    applyKioskRegistry();
  }
});

app.on('will-quit', () => {
  releaseShortcutBlocker();
  globalShortcut.unregisterAll();

  if (!isDev) {
    restoreKioskRegistry();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers ─────────────────────────────────────────────────────────────

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

ipcMain.handle('session:end:current', async () => {
  await windowManager.endCurrentSession();
});

ipcMain.on('overlay:set-ignore-mouse', (_event, ignore: boolean) => {
  windowManager.setOverlayIgnoreMouse(ignore);
});

app.on('render-process-gone', (_event, _wc, details) => {
  console.error('Renderer process gone:', details);
  windowManager?.lockKiosk();
});
