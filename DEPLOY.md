# Guia de Deploy — Gamer Machine

> Documento escrito para o próximo desenvolvedor. Cobre tudo desde zero: servidor cloud (Vultr + Alpine Linux), painel admin, API e build do instalador Windows.

---

## Visão Geral da Arquitetura em Produção

```
┌─────────────────────────────────┐       ┌──────────────────────────────┐
│  Vultr VPS (Alpine Linux)       │       │  PCs das máquinas (Windows)  │
│                                 │       │                              │
│  ┌─────────────┐  ┌──────────┐ │◄─────►│  Machine Guard (.exe)        │
│  │  API NestJS │  │ Admin    │ │       │  Electron kiosk app          │
│  │  :3001      │  │ React    │ │       │  Aponta para IP/domínio      │
│  └─────────────┘  │ (nginx)  │ │       │  do servidor Vultr           │
│  ┌─────────────┐  └──────────┘ │       └──────────────────────────────┘
│  │ PostgreSQL  │               │
│  │ (Docker)    │               │
│  └─────────────┘               │
└─────────────────────────────────┘
```

**O que roda na cloud:** API + banco de dados + painel admin
**O que roda em cada PC:** Electron (machine-guard) — gera instalador `.exe`

---

## Parte 1 — Servidor Vultr (API + Banco)

### 1.1 Criar o servidor

- **Imagem:** Alpine Linux 3.19+ (64-bit)
- **Plano mínimo:** 1 vCPU / 1 GB RAM / 25 GB SSD (plano de ~$6/mês)
- **Firewall:** libere as portas:
  - `22` (SSH)
  - `80` (HTTP — necessário para certbot/Let's Encrypt se usar HTTPS)
  - `443` (HTTPS, se configurar)
  - `3001` (API — pode fechar externamente se colocar nginx na frente)

### 1.2 Primeiro acesso e setup

```sh
# Acesse como root via SSH
ssh root@<IP_DO_SERVIDOR>

# Alpine: habilite repositórios community (necessário para git, curl, etc.)
echo "https://dl-cdn.alpinelinux.org/alpine/v$(cut -d. -f1,2 /etc/alpine-release)/community" >> /etc/apk/repositories
apk update
```

### 1.3 Deploy automático (usa o deploy.sh do repo)

**Antes de rodar:** edite o `deploy.sh` na raiz do repo e troque a linha:
```sh
REPO_URL="https://github.com/SEU_USER/SEU_REPO.git"  # <- altere aqui
```
pelo URL real do repositório Git.

```sh
# No servidor Alpine, baixe e rode o script de deploy
curl -O https://raw.githubusercontent.com/SEU_USER/SEU_REPO/master/deploy.sh
sh deploy.sh
```

O script vai:
1. Instalar Docker + docker-compose
2. Clonar o repositório em `/opt/gamer-machine`
3. Criar o `.env` com JWT_SECRET aleatório e pedir a senha do admin
4. Fazer `docker compose build` + `docker compose up -d`
5. Rodar as migrations do Prisma automaticamente ao subir a API

**Para atualizar depois (novo deploy):**
```sh
sh /opt/gamer-machine/deploy.sh --update
```

### 1.4 Variáveis de ambiente da API

Arquivo: `/opt/gamer-machine/services/api/.env`

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Gerado automaticamente pelo docker-compose (não alterar) |
| `JWT_SECRET` | sim | Gerado pelo deploy.sh. Nunca expor. |
| `JWT_EXPIRES_IN` | sim | Padrão: `7d` |
| `PORT` | sim | Padrão: `3001` |
| `ADMIN_USERNAME` | sim | Usuário do admin da API (padrão: `admin`) |
| `ADMIN_PASSWORD` | sim | Senha pedida pelo deploy.sh |
| `ABACATEPAY_API_KEY` | não | PIX real. Sem isso, usa mock automático. |
| `ABACATEPAY_WEBHOOK_SECRET` | não | Valida webhooks PIX. Sem isso, aceita tudo (ok p/ testes). |
| `SMTP_HOST` | não | Email real. Sem isso, OTPs e verificações são logados no console. |
| `SMTP_PORT` | não | Padrão: `587` |
| `SMTP_USER` | não | Usuário SMTP |
| `SMTP_PASS` | não | Senha SMTP |
| `SMTP_FROM` | não | Padrão: `noreply@gamermachine.com` |

> **SMS:** O sistema está em modo mock (`[SMS MOCK]` no console). Para ativar SMS real via AWS SNS, adicione `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_REGION` ao `.env`. Veja `services/api/src/sms/sms.service.ts`.

### 1.5 Banco de dados

- O banco PostgreSQL roda dentro do Docker no volume `postgres_data`.
- Migrations são aplicadas **automaticamente** toda vez que o container da API sobe (`prisma migrate deploy` no CMD do Dockerfile).
- Para backup manual:
  ```sh
  docker exec gamer_machine_db pg_dump -U gamer gamer_machine > backup.sql
  ```
- Para restaurar:
  ```sh
  docker exec -i gamer_machine_db psql -U gamer gamer_machine < backup.sql
  ```

### 1.6 Comandos úteis no servidor

```sh
# Ver status dos containers
docker compose -f /opt/gamer-machine/docker-compose.yml ps

# Ver logs da API em tempo real
docker compose -f /opt/gamer-machine/docker-compose.yml logs -f api

# Reiniciar apenas a API
docker compose -f /opt/gamer-machine/docker-compose.yml restart api

# Acessar o banco via psql
docker exec -it gamer_machine_db psql -U gamer -d gamer_machine

# Interface gráfica do banco (roda localmente com port-forward)
# Na sua máquina local:
ssh -L 5433:localhost:5433 root@<IP_DO_SERVIDOR>
# Depois: cd services/api && npx prisma studio
```

---

## Parte 2 — Painel Admin (React SPA)

O admin é uma SPA estática (`apps/admin/`). Precisa ser buildada e servida via nginx no servidor.

### 2.1 Build local (na máquina do dev, antes de enviar ao servidor)

```sh
# Na raiz do monorepo
cd apps/admin

# Configure a URL da API de produção
echo "VITE_API_URL=http://<IP_OU_DOMINIO>:3001" > .env.production

# Build
pnpm build
# Gera: apps/admin/dist/
```

### 2.2 Servir com nginx no Alpine

```sh
# No servidor Alpine
apk add --no-cache nginx

# Crie a pasta de destino
mkdir -p /var/www/admin

# Envie o build do seu PC para o servidor (rode isso na sua máquina local)
scp -r apps/admin/dist/* root@<IP_DO_SERVIDOR>:/var/www/admin/
```

Crie `/etc/nginx/http.d/admin.conf`:

```nginx
server {
    listen 80;
    server_name _;          # troque por domínio se tiver

    root /var/www/admin;
    index index.html;

    # SPA: redireciona tudo para index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy para a API (evita CORS se servir tudo no mesmo host)
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```sh
# Habilita e inicia nginx
rc-update add nginx default
service nginx start
```

O admin ficará acessível em `http://<IP_DO_SERVIDOR>/`.

> **Credenciais do admin:** usuário `admin`, senha definida no `.env` (`ADMIN_PASSWORD`).

---

## Parte 3 — Machine Guard (Electron, instalador Windows)

O machine-guard **não roda no servidor**. É um instalador `.exe` que você distribui para cada PC da lan house.

### 3.1 Configurar a URL da API de produção

Há **dois lugares** onde a URL da API precisa ser atualizada:

**1. Renderer (React) — `apps/machine-guard/.env`:**
```sh
VITE_API_URL=http://<IP_OU_DOMINIO>:3001
```

**2. Main process (Electron) — `apps/machine-guard/electron/windowManager.ts`, linha ~79:**
```ts
// Troque localhost:3001 pelo IP/domínio do servidor
this.connectWebSocket('http://<IP_OU_DOMINIO>:3001', ...)
```
> Este valor está hardcoded e **não lê do .env**. Precisa ser alterado manualmente antes do build. Ver CLAUDE.md "Gotchas" para detalhes.

### 3.2 Build do instalador

Execute na máquina Windows do desenvolvedor (não no servidor):

```sh
# Na raiz do monorepo
pnpm install

# Gera o instalador
cd apps/machine-guard
pnpm build
# Saída: apps/machine-guard/release/Machine Guard Setup *.exe
```

Requisitos para buildar:
- Node.js 20+
- pnpm 10+
- Windows (electron-builder com target NSIS requer Windows para `.exe`)

### 3.3 Instalar nos PCs

1. Copie o `.exe` gerado para cada PC da lan house
2. Instale normalmente (NSIS, permite escolher diretório)
3. Execute como Administrador (necessário para bloquear Alt+F4/Alt+Tab e Task Manager)

---

## Parte 4 — Itens Pendentes (todo.md)

Os itens abaixo estão marcados como pendentes e **não foram implementados**:

| Item | Status | O que fazer |
|---|---|---|
| **SMS real** | Mock | Configurar AWS SNS: adicionar `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` no `.env` |
| **Email real** | Mock (console) | Configurar SMTP: preencher `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` no `.env` |
| **Build .exe** | Pendente | Seguir Parte 3 acima; requer atualizar URL da API antes do build |
| **Deploy** | Pendente | Seguir este documento |

---

## Parte 5 — HTTPS (opcional mas recomendado)

Se tiver um domínio apontando para o servidor:

```sh
# Alpine
apk add --no-cache certbot certbot-nginx

# Gera certificado
certbot --nginx -d seudominio.com

# Renova automaticamente (adicionar ao crontab)
echo "0 3 * * * certbot renew --quiet" >> /etc/crontabs/root
```

Depois atualize `VITE_API_URL` e o `windowManager.ts` para usar `https://`.

---

## Resumo Rápido (checklist)

```
[ ] 1. Criar VPS Vultr Alpine, abrir portas 22/80/3001
[ ] 2. Editar deploy.sh: trocar REPO_URL pelo repo real
[ ] 3. Fazer push do código para o repositório
[ ] 4. No servidor: sh deploy.sh  (instala tudo, cria .env, sobe Docker)
[ ] 5. Preencher ABACATEPAY_API_KEY, SMTP_* no .env do servidor
[ ] 6. Build do admin: VITE_API_URL=http://<IP>:3001 pnpm build
[ ] 7. Enviar dist/ do admin via scp, configurar nginx
[ ] 8. Atualizar VITE_API_URL e windowManager.ts com IP/domínio do servidor
[ ] 9. pnpm build no machine-guard → gerar .exe
[ ] 10. Distribuir .exe para cada PC
```
