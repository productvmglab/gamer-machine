import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminUser, Deposit, SessionRecord, addCredit, getActiveOtp, getDeposits, getSessions, getUser, updateUser } from '../api';

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

  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [otp, setOtp] = useState<{ code: string; expires_at: string } | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

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
      .then(u => {
        setUser(u);
        setNameInput(u.name ?? '');
        loadHistory(phone);
      })
      .catch(err => {
        if (err.message === 'NOT_FOUND') setNotFound(true);
        else setError(err.message);
      });
  }, [phone]);

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameSuccess(false);
    try {
      const updated = await updateUser(phone, nameInput.trim());
      setUser(updated);
      setNotFound(false);
      setNameSuccess(true);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar nome');
    } finally {
      setSavingName(false);
    }
  }

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

  async function handleFetchOtp() {
    setOtpError('');
    setOtp(null);
    setOtpLoading(true);
    try {
      setOtp(await getActiveOtp(phone));
    } catch (err: any) {
      setOtpError(err.message);
    } finally {
      setOtpLoading(false);
    }
  }

  const balance = user?.balance_cents ?? 0;
  const hasName = (user?.name ?? nameInput.trim()).length >= 2;

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

        {/* Nome */}
        <form onSubmit={handleSaveName} className="mb-6">
          <label className="text-sm text-gray-600 mb-1 block">Nome do cliente</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nome completo"
              value={nameInput}
              onChange={e => { setNameInput(e.target.value); setNameSuccess(false); }}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={savingName || nameInput.trim().length < 2}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg px-4 py-2 transition-colors text-sm"
            >
              {savingName ? '...' : 'Salvar'}
            </button>
          </div>
          {nameSuccess && <p className="text-green-600 text-xs mt-1">Nome salvo.</p>}
          {!hasName && !notFound && (
            <p className="text-amber-600 text-xs mt-1">Preencha o nome antes de adicionar crédito.</p>
          )}
        </form>

        <p className="text-gray-500 text-sm mb-1">Saldo atual</p>
        <p className="text-3xl font-bold text-green-600 mb-6">{fmtMoney(balance)}</p>

        {notFound && (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
            Usuário novo — será criado ao adicionar crédito.
          </p>
        )}

        {/* Adicionar crédito — bloqueado sem nome */}
        <form onSubmit={handleAddCredit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Valor a adicionar (R$)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              disabled={!hasName}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}
          <button
            type="submit"
            disabled={loading || !hasName}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2 transition-colors"
            title={!hasName ? 'Preencha o nome do cliente primeiro' : undefined}
          >
            {loading ? 'Adicionando...' : 'Adicionar Crédito'}
          </button>
        </form>
      </div>

      {/* Código OTP */}
      <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
        <h3 className="font-bold text-gray-800 mb-3">Código de Acesso (OTP)</h3>
        <p className="text-gray-500 text-sm mb-3">
          Gera ou recupera o código ativo para o cliente digitar no kiosk. Expira em 5 minutos.
        </p>
        <button
          onClick={handleFetchOtp}
          disabled={otpLoading}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {otpLoading ? 'Aguarde...' : 'Ver código de acesso'}
        </button>
        {otp && (
          <div className="mt-4 bg-indigo-50 rounded-xl p-4 text-center">
            <p className="text-4xl font-mono font-bold tracking-widest text-indigo-700">{otp.code}</p>
            <p className="text-xs text-gray-400 mt-2">
              Expira às {new Date(otp.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
        {otpError && <p className="text-amber-600 text-sm mt-3">{otpError}</p>}
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
