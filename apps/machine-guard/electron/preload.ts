import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Check if this window is the overlay
  isOverlay: () => {
    return window.location.search.includes('overlay=true');
  },

  // Renderer → Main
  sessionStart: (token: string) =>
    ipcRenderer.invoke('session:start', token),
  sessionEnd: (sessionId: string, token: string) =>
    ipcRenderer.invoke('session:end', sessionId, token),

  // Main → Renderer (events)
  onBalanceUpdate: (cb: (data: any) => void) => {
    ipcRenderer.on('balance_update', (_event, data) => cb(data));
  },
  onWarning: (cb: (data: any) => void) => {
    ipcRenderer.on('warning', (_event, data) => cb(data));
  },
  onSessionEnded: (cb: () => void) => {
    ipcRenderer.on('session_ended', () => cb());
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  endCurrentSession: () => ipcRenderer.invoke('session:end:current'),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('overlay:set-ignore-mouse', ignore),
});
