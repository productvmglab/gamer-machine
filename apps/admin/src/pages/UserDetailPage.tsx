import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminUser, Deposit, SessionRecord, addCredit, getDeposits, getSessions, getUser } from '../api';

function fmtMoney(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

export default function UserDetailPage() {
  const { phone: encodedPhone } = useParams<{ phone: string }>();
  const phone = decodeURIComponent(encodedPhone ?? '');
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [amountInput, setAmountInput] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function loadHistory(p: string) {
    getDeposits(p).then(setDeposits).catch(() => {});
    getSessions(p).then(setSessions).catch(() => {});
  }

  useEffect(() => {
    getUser(phone)
      .then(u => { setUser(u); loadHistory(phone); })
      .catch(err => {
        if (err.message === 'NOT_FOUND') setNotFound(true);
        else setError(err.message);
      });
  }, [phone]);

  async function handleAddCredit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) { setError('Valor inválido'); return; }
    setLoading(true);
    try {
      await addCredit(phone, Math.round(amount * 100));
      const updated = await getUser(phone);
      setUser(updated);
      setNotFound(false);
      loadHistory(phone);
      setSuccess(`Crédito de R$ ${amount.toFixed(2).replace('.', ',')} adicionado com sucesso!`);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao adicionar crédito');
    } finally {
      setLoading(false);
    }
  }

  const balance = user?.balance_cents ?? 0;

  return (
    <div className="min-h-screen p-6 max-w-lg mx-auto">
      <button
        onClick={() => navigate('/')}
        className="text-blue-600 hover:text-blue-800 mb-6 flex items-center gap-1 text-sm"
      >
        ← Voltar
      </button>

      <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
        <p className="text-gray-500 text-sm mb-1">Telefone</p>
        <h2 className="text-xl font-mono font-bold mb-4">{phone}</h2>

        <p className="text-gray-500 text-sm mb-1">Saldo atual</p>
        <p className="text-3xl font-bold text-green-600 mb-6">{fmtMoney(balance)}</p>

        {notFound && (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
            Usuário novo — será criado ao adicionar crédito.
          </p>
        )}

        <form onSubmit={handleAddCredit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Valor a adicionar (R$)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold rounded-lg px-4 py-2 transition-colors"
          >
            {loading ? 'Adicionando...' : 'Adicionar Crédito'}
          </button>
        </form>
      </div>

      {/* Histórico de depósitos */}
      {!notFound && (
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-3">Histórico de Depósitos</h3>
          {deposits.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum depósito encontrado.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {deposits.map(d => (
                <div key={d.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      d.source === 'pix'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {d.source === 'pix' ? 'PIX' : 'Admin'}
                    </span>
                    <span className="text-gray-500">{fmtDate(d.created_at)}</span>
                  </div>
                  <span className="font-semibold text-green-600">+{fmtMoney(d.amount_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Histórico de uso */}
      {!notFound && (
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h3 className="font-bold text-gray-800 mb-3">Histórico de Uso</h3>
          {sessions.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma sessão encontrada.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map(s => (
                <div key={s.id} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="text-gray-700">{fmtDate(s.started_at)}</p>
                    <p className="text-gray-400 text-xs">{fmtDuration(s.duration_seconds)}</p>
                  </div>
                  <span className="font-semibold text-red-500">-{fmtMoney(s.cost_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
