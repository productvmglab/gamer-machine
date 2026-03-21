import { useEffect, useRef, useState } from 'react';
import { TimerDisplay } from './TimerDisplay';
import { WarningBanner } from './WarningBanner';

type WarningType = 'WARNING_1MIN' | 'WARNING_30SEC' | 'SESSION_ENDED' | null;

function enableMouse() { window.electronAPI?.setIgnoreMouse(false); }
function disableMouse() { window.electronAPI?.setIgnoreMouse(true); }

export function OverlayApp() {
  const [warning, setWarning] = useState<WarningType>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [hasData, setHasData] = useState(false);
  const timeRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (timeRef.current > 0) {
        timeRef.current -= 1;
        setTimeRemaining(timeRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onBalanceUpdate((data) => {
      const t = Math.round(data.time_remaining_seconds ?? 0);
      if (!isNaN(t) && t > 0) {
        timeRef.current = t;
        setTimeRemaining(t);
        setHasData(true);
      }
    });

    window.electronAPI.onWarning((data) => {
      setWarning(data.type);
      if (data.type === 'SESSION_ENDED') return;
      setTimeout(() => setWarning(null), 10000);
    });

    return () => {
      window.electronAPI.removeAllListeners('balance_update');
      window.electronAPI.removeAllListeners('warning');
    };
  }, []);

  const handleEndSession = () => {
    window.electronAPI?.endCurrentSession();
  };

  const sessionEnded = warning === 'SESSION_ENDED';

  return (
    <div className="w-screen h-screen bg-transparent pointer-events-none">
      {warning && <WarningBanner type={warning} timeRemaining={timeRemaining} />}

      {!sessionEnded && (
        <div
          className="fixed top-3 right-4 flex flex-col items-end gap-1"
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={enableMouse}
          onMouseLeave={disableMouse}
        >
          <TimerDisplay seconds={timeRemaining} hasData={hasData} />
          <button
            onClick={handleEndSession}
            className="px-3 py-1 rounded text-white text-xs font-semibold select-none cursor-pointer"
            style={{
              backgroundColor: '#00000099',
              border: '1px solid #FFFFFF33',
              backdropFilter: 'blur(6px)',
            }}
          >
            Encerrar sessão
          </button>
        </div>
      )}
    </div>
  );
}
