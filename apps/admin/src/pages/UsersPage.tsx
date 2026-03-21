import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminUser, clearToken, listUsers } from '../api';

export default function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  const filteredUsers = users.filter(u => u.phone.includes(filter));
  const showNewPhone = filter.length >= 8 && filteredUsers.length === 0;

  function goToUser(phone: string) {
    navigate('/users/' + encodeURIComponent(phone));
  }

  return (
    <div className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          Sair
        </button>
      </div>

      <input
        type="text"
        placeholder="Filtrar por telefone..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Carregando...</p>}

      <div className="flex flex-col gap-2">
        {filteredUsers.map(user => (
          <button
            key={user.id}
            onClick={() => goToUser(user.phone)}
            className="bg-white rounded-xl shadow-sm p-4 text-left hover:bg-blue-50 transition-colors flex justify-between items-center"
          >
            <span className="font-mono text-gray-800">{user.phone}</span>
            <span className="text-green-600 font-semibold">
              R$ {(user.balance_cents / 100).toFixed(2).replace('.', ',')}
            </span>
          </button>
        ))}

        {showNewPhone && (
          <button
            onClick={() => goToUser(filter)}
            className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl p-4 text-left hover:bg-blue-100 transition-colors"
          >
            <span className="text-blue-600 font-semibold">+ Novo telefone: </span>
            <span className="font-mono text-blue-800">{filter}</span>
          </button>
        )}

        {!loading && !showNewPhone && filteredUsers.length === 0 && filter.length > 0 && (
          <p className="text-gray-400 text-center py-4">Nenhum usuário encontrado.</p>
        )}
      </div>
    </div>
  );
}
