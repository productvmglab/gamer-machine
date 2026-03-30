# Teste de Carga — Gamer Machine API

Valida se o servidor de produção aguenta o fluxo esperado.

**Servidor alvo:** 1 vCPU · 512 MB RAM · 10 GB SSD
**Fluxo simulado:** 1 usuário simultâneo · 5 recargas PIX/dia · 30 dias

---

## Arquivos

| Arquivo | Descrição |
|---|---|
| `seed.ts` | Popula o banco com 30 dias de dados realistas |
| `k6-load-test.js` | Script k6 com 4 cenários sequenciais |
| `docker-compose.load-test.yml` | Override Docker com os limites do servidor de produção |

---

## Pré-requisitos

- **Docker Desktop** rodando
- **k6** instalado (`winget install k6`)
- **Node.js 20+** e **pnpm** instalados

---

## Passo a passo

### 1. Subir a API com os limites do servidor de produção

```bash
docker compose -f docker-compose.yml -f load-test/docker-compose.load-test.yml up -d
```

Isso sobe PostgreSQL e a API com restrições de CPU e RAM idênticas à nuvem:

| Container | RAM | CPU |
|---|---|---|
| postgres | 80 MB | 0.3 vCPU |
| api | 200 MB | 0.7 vCPU |

> Swap está **desabilitado** nos dois containers — sem isso o Docker usaria disco
> para sobreviver ao OOM, mascarando um problema que existiria em produção.

### 2. Popular o banco (seed)

Simula 30 dias de uso: 150 pagamentos PIX e 30 sessões de 30 min.

```bash
cd services/api
npx ts-node ../../load-test/seed.ts
```

Saída esperada:

```
Limpando dados anteriores de teste...
Usuário criado: <uuid>
Criando 150 pagamentos e 30 sessões...
  Dia 5/30 concluído
  ...
  Dia 30/30 concluído

=== Seed concluído ===
  Usuário      : +5511900000001
  Pagamentos   : 150
  Sessões      : 30
  Crédito total: 75300s (20.9h)
  Usado total  : 54000s
  Saldo final  : 21300s
```

Mix de pacotes gerado pelo seed:

| Pacote | Preço | Tempo | Frequência |
|---|---|---|---|
| R$60 – 60 min | 6000 cents | 3600s | 50% |
| R$40 – 35 min | 4000 cents | 2100s | 30% |
| R$20 – 15 min | 2000 cents | 900s  | 15% |
| R$10 – 5 min  | 1000 cents | 300s  | 5%  |

### 3. Monitorar RAM (opcional, janela separada)

```bash
# Git Bash / terminal com loop
while true; do docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"; sleep 2; done
```

Ou abra o **Docker Desktop → Containers** e acompanhe visualmente.

### 4. Rodar o teste

```bash
# Na raiz do repo
k6 run -e ADMIN_USER=admin -e ADMIN_PASS=<senha> load-test/k6-load-test.js
```

Variáveis de ambiente disponíveis:

| Variável | Padrão | Descrição |
|---|---|---|
| `BASE_URL` | `http://localhost:3001` | URL da API |
| `ADMIN_USER` | `admin` | Usuário admin |
| `ADMIN_PASS` | `admin123` | Senha admin |
| `TEST_PHONE` | `+5511900000001` | Telefone do usuário de teste |
| `TEST_MONTH` | `2026-03` | Mês usado no relatório financeiro |

---

## Cenários

O teste roda **~10 minutos no total**, com 4 cenários sequenciais:

```
0:00 ──── report_realistic  (2 min)  ────────────────────────┐
2:10 ── report_concurrency  (30s)  ──────────────────────────┤
3:00 ──────────── soak      (5 min) ─────────────────────────┤
8:30 ──────────── user_flow (5 iter)────────────────────────┘
```

### A — `report_realistic` · 1 VU · 2 min

Simula o admin consultando o relatório financeiro normalmente, com 1s de pausa entre requisições.

**Pergunta respondida:** o servidor aguenta o uso diário sem erros?

**Endpoint:** `GET /admin/financeiro/mensal?month=2026-03`

### B — `report_concurrency` · 3 VUs · 30s

Satura deliberadamente o pool de conexões do Prisma. Em um servidor de 1 vCPU, o pool tem `1×2+1 = 3` conexões simultâneas ao PostgreSQL — esses 3 VUs esgotam exatamente esse limite.

**Pergunta respondida:** o servidor degrada graciosamente quando está no teto?

> Até 5% de erros são **esperados e aceitáveis** neste cenário — o objetivo é observar
> degradação graciosa (filas de espera), não ausência total de erros.

### C — `soak` · 1 VU · 5 min

Cicla `startSession → aguarda 6s → endSession` repetidamente. O intervalo de 6s garante ao menos 1 disparo do `setInterval` de 5s do `SessionsService`, forçando o caminho de emissão de `balance_update` via WebSocket.

**Pergunta respondida:** há vazamento de memória nos timers de sessão?

O `SessionsService` mantém dois `Map`s internos (`timers` e `warnedOnce`) que devem ser limpos a cada `endSession()`. Se houver leak, a RAM do container `api` cresce continuamente durante este cenário.

### D — `user_flow` · 1 VU · 5 iterações

Fluxo completo ponta-a-ponta:

```
1. GET  /admin/users/:phone/otp    → obtém OTP (SMS é mock)
2. POST /auth/verify-otp           → obtém JWT do usuário
3. POST /payments/create-pix       → cria cobrança PIX
4. POST /payments/webhook          → confirma pagamento (simula AbacatePay)
5. POST /sessions/start            → inicia sessão de jogo
6.      sleep(1s)
7. POST /sessions/end              → encerra sessão
```

**Pergunta respondida:** o fluxo completo funciona corretamente de ponta a ponta?

---

## Thresholds (critérios de aprovação)

| Métrica | Threshold | Falha indica |
|---|---|---|
| `report_duration_ms` p95 | < 500ms | Query lenta no relatório |
| `report_duration_ms` p99 | < 1500ms | Pico de latência inaceitável |
| erros em `report_realistic` | < 1% | Servidor não aguenta uso normal |
| erros em `report_concurrency` | < 5% | Pool esgotado causa crash, não fila |
| erros em `soak` | < 1% | Leak no lifecycle de sessão |
| `payment_duration_ms` p95 | < 1000ms | Criação de PIX lenta |
| `session_duration_ms` p95 | < 500ms | Start/end de sessão lento |
| `errors` (global) | < 2% | Taxa geral de falhas |

---

## Interpretando os resultados

### RAM plana durante o soak → sem memory leak

Se a coluna `MEM USAGE` do container `api` ficar estável (±10 MB) durante os 5 min do soak, os timers estão sendo limpos corretamente.

Se crescer continuamente (ex.: 150 MB → 180 MB → 210 MB), investigar:
- `SessionsService.timers` Map — verificar se `clearTimer()` é chamado em todo caminho de `endSession`
- `SessionsService.warnedOnce` Map — mesmo ponto
- Subscriptions do Socket.io gateway que não são removidas no disconnect

### Relatório dentro do threshold → banco aguenta

`getMonthlyReport` faz dois full table scans na tabela `Payment` filtrados por data. Com 150 registros é trivial. Se o p95 ultrapassar 500ms, considerar adicionar índice:

```sql
CREATE INDEX idx_payment_source_status_date
  ON "Payment" (source, status, created_at);
```

Equivalente em Prisma (`schema.prisma`):
```prisma
@@index([source, status, created_at])
```

### `report_concurrency` com erros > 5% → pool insuficiente

Significa que as 3 conexões simultâneas causam timeouts em vez de queuing. Solução: aumentar o pool via `DATABASE_URL`:

```
DATABASE_URL="postgresql://...?connection_limit=5"
```

---

## Notas

**AbacatePay mock:** se `ABACATEPAY_API_KEY` não estiver configurado no `.env`, a criação de PIX retorna dados falsos automaticamente. O webhook funciona normalmente. Não é necessária nenhuma configuração extra para rodar o teste.

**OTP no soak:** `getActiveOtp()` cria um novo OTP automaticamente se o anterior expirar (TTL = 5 min). O soak de 5 min pode cruzar esse limite, mas é tratado de forma transparente.

**Limpeza após o teste:** o seed cria um usuário de teste (`+5511900000001`) separado dos usuários reais. Para remover após o teste, basta rodar o seed novamente — ele limpa os dados anteriores antes de recriar.
