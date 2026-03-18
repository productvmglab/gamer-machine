import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/appStore';
import { QrCodeModal } from '../components/QrCodeModal';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const TOP_UP_OPTIONS = [
  { label: 'R$ 5', cents: 500 },
  { label: 'R$ 10', cents: 1000 },
  { label: 'R$ 20', cents: 2000 },
  { label: 'R$ 50', cents: 5000 },
];

export function DashboardScreen() {
  const { user, accessToken, setScreen, setSessionId, setBalance } = useAppStore();
  const [qrData, setQrData] = useState<{ qrCodeText: string; amountCents: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(`${API_URL}/sessions`, { auth: { token: accessToken } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join'));
    socket.on('payment_confirmed', (data: { balance_cents: number }) => {
      setBalance(data.balance_cents);
      setQrData(null);
    });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [accessToken]);

  const balance = user ? (user.balance_cents / 100).toFixed(2).replace('.', ',') : '0,00';

  const handleTopUp = async (cents: number) => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/payments/create-pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amount_cents: cents }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message ?? 'Erro ao criar PIX');
      setQrData({ qrCodeText: data.payment.qr_code_text, amountCents: cents });
    } catch (e: any) {
      setError(e.message ?? 'Erro ao criar PIX');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async () => {
    if (!accessToken || !user || user.balance_cents <= 0) {
      setError('Saldo insuficiente');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.sessionStart(accessToken);
      setSessionId(result.sessionId);
      setScreen('PLAYING');
    } catch (e: any) {
      setError(e.message ?? 'Erro ao iniciar sessão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-3xl font-black text-neon-green mb-1">DASHBOARD</h2>
      <p className="text-gray-400 mb-8">{user?.phone}</p>

      <div className="text-5xl font-black text-white mb-8">
        R$ <span className="text-neon-green">{balance}</span>
      </div>

      <p className="text-gray-400 mb-4">Recarregar saldo</p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs mb-8">
        {TOP_UP_OPTIONS.map(({ label, cents }) => (
          <button
            key={cents}
            onClick={() => handleTopUp(cents)}
            disabled={loading}
            className="py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-bold transition-colors disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

      <button
        onClick={handlePlay}
        disabled={loading || !user || user.balance_cents <= 0}
        className="w-full max-w-xs py-5 rounded-2xl bg-neon-green text-black text-2xl font-black hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
      >
        🎮 JOGAR
      </button>

      {qrData && (
        <QrCodeModal
          qrCodeText={qrData.qrCodeText}
          amountCents={qrData.amountCents}
          onClose={() => setQrData(null)}
        />
      )}
    </div>
  );
}
