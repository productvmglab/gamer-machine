import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { KioskApp } from './screens/KioskApp';
import { OverlayApp } from './overlay/OverlayApp';

declare global {
  interface Window {
    electronAPI: {
      isOverlay: () => boolean;
      sessionStart: (token: string) => Promise<{ sessionId: string }>;
      sessionEnd: (sessionId: string, token: string) => Promise<void>;
      onBalanceUpdate: (cb: (data: any) => void) => void;
      onWarning: (cb: (data: any) => void) => void;
      onSessionEnded: (cb: () => void) => void;
      removeAllListeners: (channel: string) => void;
      endCurrentSession: () => Promise<void>;
      setIgnoreMouse: (ignore: boolean) => void;
    };
  }
}

export default function App() {
  const isOverlay = window.electronAPI?.isOverlay?.() ?? false;

  if (isOverlay) return <OverlayApp />;
  return <KioskApp />;
}
