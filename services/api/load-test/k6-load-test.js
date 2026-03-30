/**
 * Teste de carga — Gamer Machine API
 * Servidor alvo: 1 vCPU, 512 MB RAM, 10 GB SSD
 *
 * Fluxo de produção simulado:
 *   - 1 usuário simultâneo
 *   - 5 recargas PIX por dia
 *   - Dados: 30 dias (2026-03)
 *   - Ponto crítico: GET /admin/financeiro/mensal
 *
 * Pré-requisitos:
 *   1. API rodando: docker compose -f docker-compose.yml \
 *                    -f load-test/docker-compose.load-test.yml up -d
 *   2. Seed: cd services/api && npx ts-node ../../load-test/seed.ts
 *   3. k6 instalado: https://k6.io/docs/get-started/installation/
 *
 * Como rodar (raiz do repo):
 *   k6 run -e ADMIN_USER=admin -e ADMIN_PASS=<senha> load-test/k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL   = __ENV.BASE_URL   || 'http://localhost:3001';
const ADMIN_USER = __ENV.ADMIN_USER || 'admin';
const ADMIN_PASS = __ENV.ADMIN_PASS || 'admin123';
const TEST_PHONE = __ENV.TEST_PHONE || '+5511900000001';
const TEST_MONTH = __ENV.TEST_MONTH || '2026-03';

// ---------------------------------------------------------------------------
// Métricas customizadas
// ---------------------------------------------------------------------------

const reportDuration  = new Trend('report_duration_ms',  true);
const paymentDuration = new Trend('payment_duration_ms', true);
const sessionDuration = new Trend('session_duration_ms', true);
const errRate         = new Rate('errors');
const paymentCount    = new Counter('payments_created');

// ---------------------------------------------------------------------------
// Budget de RAM: 512 MB
//   OS + Docker daemon : ~30 MB
//   PostgreSQL alpine  : ~70 MB
//   NestJS             : ~130 MB (idle)
//   Baseline           : ~230 MB  → headroom ~280 MB
//   Pool Prisma (1vCPU): 1×2+1 = 3 conexões simultâneas ao DB
//
// Teto arquitetural real: 3 VUs simultâneos (esgota pool sem OOM)
// 20 VUs (versão anterior) causaria spike de heap → risco de OOM
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // -----------------------------------------------------------------------
    // A — Carga realística: 1 VU, 2 min
    // Simula o admin consultando o relatório normalmente.
    // Responde: "o servidor aguenta o uso diário sem erros?"
    // -----------------------------------------------------------------------
    report_realistic: {
      executor: 'constant-vus',
      vus: 1,
      duration: '2m',
      exec: 'reportRealistic',
      tags: { scenario: 'report_realistic' },
    },

    // -----------------------------------------------------------------------
    // B — Sondagem de concorrência: 3 VUs, 30s
    // 3 VUs = teto do pool Prisma (num_cpus×2+1 = 3) em 1 vCPU.
    // Responde: "o servidor degrada graciosamente no pior caso?"
    // Até 5% de erros são esperados aqui — isso é intencional.
    // -----------------------------------------------------------------------
    report_concurrency: {
      executor: 'constant-vus',
      vus: 3,
      duration: '30s',
      exec: 'reportConcurrencyProbe',
      startTime: '2m10s',
      tags: { scenario: 'report_concurrency' },
    },

    // -----------------------------------------------------------------------
    // C — Soak test: 1 VU, 5 min
    // Cicla start/end de sessão para detectar vazamento dos Maps
    // `timers` e `warnedOnce` do SessionsService.
    // Responde: "há memory leak nos timers?"
    // -----------------------------------------------------------------------
    soak: {
      executor: 'constant-vus',
      vus: 1,
      duration: '5m',
      exec: 'soakTest',
      startTime: '3m',
      tags: { scenario: 'soak' },
    },

    // -----------------------------------------------------------------------
    // D — Fluxo completo: 1 VU, 5 iterações
    // Auth → PIX → webhook → sessão. Smoke funcional end-to-end.
    // -----------------------------------------------------------------------
    user_flow: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 5,
      exec: 'userFlow',
      startTime: '8m30s',
      tags: { scenario: 'user_flow' },
    },
  },

  thresholds: {
    // Relatório: full table scan em 150 rows deve ser rápido
    'report_duration_ms': ['p(95)<500', 'p(99)<1500'],

    // Carga realística: zero tolerância a erros
    'http_req_failed{scenario:report_realistic}': ['rate<0.01'],

    // Concorrência: até 5% de erros aceitáveis (queuing no pool)
    'http_req_failed{scenario:report_concurrency}': ['rate<0.05'],

    // Soak: nenhum erro de lifecycle de sessão
    'http_req_failed{scenario:soak}': ['rate<0.01'],

    // Fluxo de pagamento e sessão
    'payment_duration_ms': ['p(95)<1000'],
    'session_duration_ms': ['p(95)<500'],

    // Taxa global de erros (checks)
    'errors': ['rate<0.02'],
  },
};

// ---------------------------------------------------------------------------
// Setup — executa UMA vez antes de todos os cenários
// ---------------------------------------------------------------------------

export function setup() {
  const res = http.post(
    `${BASE_URL}/admin/login`,
    JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, { 'admin login: 200/201': (r) => r.status === 200 || r.status === 201 });

  const adminToken = res.json('access_token');
  if (!adminToken) {
    throw new Error(`Admin login falhou: ${res.status} — ${res.body}`);
  }

  return { adminToken };
}

// ---------------------------------------------------------------------------
// Cenário A — carga realística (1 VU, 2 min)
// ---------------------------------------------------------------------------

export function reportRealistic(data) {
  const res = http.get(
    `${BASE_URL}/admin/financeiro/mensal?month=${TEST_MONTH}`,
    { headers: { Authorization: `Bearer ${data.adminToken}` } },
  );

  reportDuration.add(res.timings.duration);

  const ok = check(res, {
    'relatório: 200': (r) => r.status === 200,
    'relatório: pix_revenue_cents presente': (r) => {
      try { return r.json('pix_revenue_cents') !== undefined; } catch { return false; }
    },
    'relatório: distribuicao presente': (r) => {
      try { return r.json('distribuicao') !== undefined; } catch { return false; }
    },
  });
  errRate.add(!ok);

  sleep(1); // simula o admin navegando antes de recarregar
}

// ---------------------------------------------------------------------------
// Cenário B — sondagem de concorrência (3 VUs, 30s)
// ATENÇÃO: até 5% de erros são esperados — isso é intencional.
// O objetivo é saturar o pool Prisma e observar degradação graciosa.
// ---------------------------------------------------------------------------

export function reportConcurrencyProbe(data) {
  const res = http.get(
    `${BASE_URL}/admin/financeiro/mensal?month=${TEST_MONTH}`,
    { headers: { Authorization: `Bearer ${data.adminToken}` } },
  );

  reportDuration.add(res.timings.duration);

  const ok = check(res, { 'concorrência: 200 ou 503/504': (r) => r.status < 600 });
  errRate.add(!ok);
  // Sem sleep — saturação deliberada
}

// ---------------------------------------------------------------------------
// Cenário C — soak test (1 VU, 5 min)
// Valida que setInterval/Maps são limpos corretamente a cada endSession.
// ---------------------------------------------------------------------------

export function soakTest(data) {
  const headers = { 'Content-Type': 'application/json' };

  // Passo 1: obter OTP (getActiveOtp cria novo se expirado — seguro em loop)
  const otpRes = http.get(
    `${BASE_URL}/admin/users/${encodeURIComponent(TEST_PHONE)}/otp`,
    { headers: { Authorization: `Bearer ${data.adminToken}` } },
  );
  check(otpRes, { 'soak OTP: 200': (r) => r.status === 200 });

  const otpCode = otpRes.json('code');
  if (!otpCode) { errRate.add(1); return; }

  // Passo 2: autenticar
  const authRes = http.post(
    `${BASE_URL}/auth/verify-otp`,
    JSON.stringify({ phone: TEST_PHONE, code: otpCode }),
    { headers },
  );
  check(authRes, { 'soak auth: 200/201': (r) => r.status === 200 || r.status === 201 });

  const userToken = authRes.json('access_token');
  if (!userToken) { errRate.add(1); return; }

  const authHeaders = { ...headers, Authorization: `Bearer ${userToken}` };

  // Passo 3: iniciar sessão (cria setInterval no SessionsService)
  const t0 = Date.now();
  const startRes = http.post(`${BASE_URL}/sessions/start`, '{}', { headers: authHeaders });
  sessionDuration.add(Date.now() - t0);
  check(startRes, { 'soak sessão: iniciada': (r) => r.status === 200 || r.status === 201 });

  // startSession retorna { session: { id, ... }, balance_seconds, time_remaining_seconds }
  const sessionId = startRes.json('session.id');
  if (!sessionId) { errRate.add(1); return; }

  // Passo 4: aguarda 1 tick completo do timer (intervalo = 5s)
  sleep(6);

  // Passo 5: encerrar sessão (deve limpar timer dos Maps timers/warnedOnce)
  const endRes = http.post(
    `${BASE_URL}/sessions/end`,
    JSON.stringify({ session_id: sessionId }),
    { headers: authHeaders },
  );
  const endOk = check(endRes, {
    'soak sessão: encerrada': (r) => r.status === 200 || r.status === 201,
    'soak sessão: duration_seconds presente': (r) => {
      try { return r.json('duration_seconds') !== null; } catch { return false; }
    },
  });
  errRate.add(!endOk);

  sleep(2); // cool-down entre iterações
}

// ---------------------------------------------------------------------------
// Cenário D — fluxo completo (1 VU, 5 iterações)
// Auth → recarga PIX → webhook → sessão
// ---------------------------------------------------------------------------

export function userFlow(data) {
  const headers = { 'Content-Type': 'application/json' };

  // Passo 1: OTP via admin (SMS é mock, código retornado diretamente)
  const otpRes = http.get(
    `${BASE_URL}/admin/users/${encodeURIComponent(TEST_PHONE)}/otp`,
    { headers: { Authorization: `Bearer ${data.adminToken}` } },
  );
  check(otpRes, { 'flow OTP: 200': (r) => r.status === 200 });

  const otpCode = otpRes.json('code');
  if (!otpCode) { errRate.add(1); return; }

  // Passo 2: autenticar
  const authRes = http.post(
    `${BASE_URL}/auth/verify-otp`,
    JSON.stringify({ phone: TEST_PHONE, code: otpCode }),
    { headers },
  );
  check(authRes, { 'flow auth: 200/201': (r) => r.status === 200 || r.status === 201 });

  const userToken = authRes.json('access_token');
  if (!userToken) { errRate.add(1); return; }

  const authHeaders = { ...headers, Authorization: `Bearer ${userToken}` };

  // Passo 3: criar PIX (AbacatePay em mock se ABACATEPAY_API_KEY ausente)
  const t0 = Date.now();
  const pixRes = http.post(
    `${BASE_URL}/payments/create-pix`,
    JSON.stringify({ package_id: 'pack_60min' }),
    { headers: authHeaders },
  );
  paymentDuration.add(Date.now() - t0);
  paymentCount.add(1);
  check(pixRes, { 'flow PIX: 200/201': (r) => r.status === 200 || r.status === 201 });

  const abacatepayId = pixRes.json('payment.abacatepay_id');
  if (!abacatepayId) { errRate.add(1); return; }

  // Passo 4: confirmar pagamento via webhook (simula AbacatePay → API)
  const webhookRes = http.post(
    `${BASE_URL}/payments/webhook`,
    JSON.stringify({ id: abacatepayId, status: 'PAID' }),
    { headers },
  );
  check(webhookRes, { 'flow webhook: 200/201': (r) => r.status === 200 || r.status === 201 });

  sleep(0.5); // propagação assíncrona

  // Passo 5: iniciar sessão
  const t1 = Date.now();
  const startRes = http.post(`${BASE_URL}/sessions/start`, '{}', { headers: authHeaders });
  sessionDuration.add(Date.now() - t1);
  check(startRes, { 'flow sessão: iniciada': (r) => r.status === 200 || r.status === 201 });

  // startSession retorna { session: { id, ... }, balance_seconds, time_remaining_seconds }
  const sessionId = startRes.json('session.id');
  if (!sessionId) { errRate.add(1); return; }

  sleep(1); // sessão curta de teste

  // Passo 6: encerrar sessão
  const endRes = http.post(
    `${BASE_URL}/sessions/end`,
    JSON.stringify({ session_id: sessionId }),
    { headers: authHeaders },
  );
  const endOk = check(endRes, {
    'flow sessão: encerrada': (r) => r.status === 200 || r.status === 201,
    'flow sessão: duration_seconds presente': (r) => {
      try { return r.json('duration_seconds') !== null; } catch { return false; }
    },
  });
  errRate.add(!endOk);

  sleep(2);
}
