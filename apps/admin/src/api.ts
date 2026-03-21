const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface AdminUser {
  id: string;
  phone: string;
  balance_cents: number;
  created_at: string;
}

export interface Deposit {
  id: string;
  amount_cents: number;
  source: 'pix' | 'admin';
  created_at: string;
}

export interface SessionRecord {
  id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  cost_cents: number;
}

const TOKEN_KEY = 'admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function adminLogin(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Credenciais inválidas');
  const data = await res.json();
  return data.access_token;
}

export async function listUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_URL}/admin/users`, {
    headers: authHeaders(),
  });
  if (res.status === 401) { clearToken(); throw new Error('Sessão expirada'); }
  if (!res.ok) throw new Error('Erro ao buscar usuários');
  return res.json();
}

export async function getUser(phone: string): Promise<AdminUser> {
  const res = await fetch(`${API_URL}/admin/users/${encodeURIComponent(phone)}`, {
    headers: authHeaders(),
  });
  if (res.status === 401) { clearToken(); throw new Error('Sessão expirada'); }
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('Erro ao buscar usuário');
  return res.json();
}

export async function addCredit(phone: string, amountCents: number): Promise<AdminUser> {
  const res = await fetch(`${API_URL}/admin/users/${encodeURIComponent(phone)}/credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ amount_cents: amountCents }),
  });
  if (res.status === 401) { clearToken(); throw new Error('Sessão expirada'); }
  if (!res.ok) throw new Error('Erro ao adicionar crédito');
  return res.json();
}

export async function getDeposits(phone: string): Promise<Deposit[]> {
  const res = await fetch(`${API_URL}/admin/users/${encodeURIComponent(phone)}/deposits`, {
    headers: authHeaders(),
  });
  if (res.status === 401) { clearToken(); throw new Error('Sessão expirada'); }
  if (!res.ok) throw new Error('Erro ao buscar depósitos');
  return res.json();
}

export async function getSessions(phone: string): Promise<SessionRecord[]> {
  const res = await fetch(`${API_URL}/admin/users/${encodeURIComponent(phone)}/sessions`, {
    headers: authHeaders(),
  });
  if (res.status === 401) { clearToken(); throw new Error('Sessão expirada'); }
  if (!res.ok) throw new Error('Erro ao buscar sessões');
  return res.json();
}
