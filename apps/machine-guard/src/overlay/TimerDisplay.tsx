interface TimerDisplayProps {
  seconds: number;
  hasData: boolean;
}

export function TimerDisplay({ seconds, hasData }: TimerDisplayProps) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const formatted = hasData
    ? `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : '--:--';

  const isLow = hasData && seconds <= 60;

  return (
    <div
      className="px-3 py-1.5 rounded-lg text-white font-mono font-bold text-lg select-none"
      style={{
        backgroundColor: isLow ? '#FF444488' : '#00000088',
        backdropFilter: 'blur(6px)',
        border: `1px solid ${isLow ? '#FF4444AA' : '#FFFFFF22'}`,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      }}
    >
      {formatted}
    </div>
  );
}
