import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminUser, addCredit, getUser } from '../api';

export default function UserDetailPage() {
  const { phone: encodedPhone } = useParams<{ phone: string }>();
  const phone = decodeURIComponent(encodedPhone ?? '');
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [amountInput, setAmountInput] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getUser(phone)
      .then(setUser)
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
    if (isNaN(amount) || amount <= 0) {
      setError('Valor inválido');
      return;
    }
    setLoading(true);
    try {
      await addCredit(phone, Math.round(amount * 100));
      const updated = await getUser(phone);
      setUser(updated);
      setNotFound(false);
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

      <div className="bg-white rounded-2xl shadow-md p-6">
        <p className="text-gray-500 text-sm mb-1">Telefone</p>
        <h2 className="text-xl font-mono font-bold mb-4">{phone}</h2>

        <p className="text-gray-500 text-sm mb-1">Saldo atual</p>
        <p className="text-3xl font-bold text-green-600 mb-6">
          R$ {(balance / 100).toFixed(2).replace('.', ',')}
        </p>

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
    </div>
  );
}
