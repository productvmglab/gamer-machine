import { BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { io, Socket } from 'socket.io-client';

const isDev = process.env.NODE_ENV !== 'production' && !process.env.ELECTRON_RENDERER_URL;

export class WindowManager {
  private kioskWindow: BrowserWindow | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private wsClient: Socket | null = null;
  private currentToken: string | null = null;
  private currentSessionId: string | null = null;
  private currentBalanceCents: number = 0;
  private currentTimeRemaining: number = 0;

  constructor(private dev: boolean) {}

  private getRendererUrl(path = '') {
    if (this.dev) return `http://localhost:5173${path}`;
    return `file://${join(__dirname, '../dist/index.html')}${path}`;
  }

  setOverlayIgnoreMouse(ignore: boolean) {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }

  async endCurrentSession() {
    if (!this.currentToken || !this.currentSessionId) return;
    try {
      await fetch('http://localhost:3001/sessions/end', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this.currentSessionId }),
      });
    } catch (err) {
      console.error('Failed to end session from overlay:', err);
    }
    this.lockKiosk();
  }

  createKioskWindow() {
    const preload = join(__dirname, 'preload.js');
    this.kioskWindow = new BrowserWindow({
      fullscreen: !this.dev,
      kiosk: !this.dev,
      frame: this.dev,
      alwaysOnTop: !this.dev,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
    });

    this.kioskWindow.loadURL(this.getRendererUrl());
  }

  unlockKiosk(token: string, sessionId: string, balanceCents: number, timeRemaining: number) {
    if (!this.kioskWindow) return;
    this.currentToken = token;
    this.currentSessionId = sessionId;
    this.currentBalanceCents = balanceCents ?? 0;
    this.currentTimeRemaining = timeRemaining ?? 0;
    this.kioskWindow.setKiosk(false);
    this.kioskWindow.minimize();
    this.kioskWindow.hide();

    this.createOverlayWindow();
    this.connectWebSocket(token, sessionId);
  }

  lockKiosk() {
    this.currentToken = null;
    this.currentSessionId = null;
    this.disconnectWebSocket();
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.close();
      this.overlayWindow = null;
    }
    if (this.kioskWindow && !this.kioskWindow.isDestroyed()) {
      this.kioskWindow.show();
      if (!this.dev) this.kioskWindow.setKiosk(true);
      this.kioskWindow.focus();
      this.kioskWindow.webContents.send('session_ended');
    }
  }

  private createOverlayWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const preload = join(__dirname, 'preload.js');
    this.overlayWindow = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      alwaysOnTop: true,
      type: 'toolbar',
      focusable: false,
      skipTaskbar: true,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
    });

    const url = this.getRendererUrl('?overlay=true');
    this.overlayWindow.loadURL(url);
    this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    this.overlayWindow.webContents.once('did-finish-load', () => {
      this.overlayWindow?.webContents.send('balance_update', {
        balance_cents: this.currentBalanceCents,
        time_remaining_seconds: this.currentTimeRemaining,
        session_id: this.currentSessionId,
      });
    });
  }

  private connectWebSocket(token: string, sessionId: string) {
    const wsUrl = this.dev ? 'http://localhost:3001' : 'http://localhost:3001';
    this.wsClient = io(`${wsUrl}/sessions`, {
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    this.wsClient.on('connect', () => {
      this.wsClient?.emit('join');
    });

    this.wsClient.on('balance_update', (data: any) => {
      this.overlayWindow?.webContents.send('balance_update', data);
      this.kioskWindow?.webContents.send('balance_update', data);
    });

    this.wsClient.on('warning', (data: any) => {
      this.overlayWindow?.webContents.send('warning', data);
      this.kioskWindow?.webContents.send('warning', data);
      if (data.type === 'SESSION_ENDED') {
        this.lockKiosk();
      }
    });
  }

  private disconnectWebSocket() {
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
  }
}
