# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder

RUN npm install -g pnpm@10
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json    ./services/api/
COPY services/api/prisma          ./services/api/prisma

# Install all deps (dev included — needed for nest build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY services/api/src         ./services/api/src
COPY services/api/tsconfig.json ./services/api/tsconfig.json
COPY services/api/nest-cli.json ./services/api/nest-cli.json

# Build shared types, then API
RUN pnpm --filter @gamer-machine/shared build \
 && pnpm --filter @gamer-machine/api build

# ---- Stage 2: Production ----
FROM node:20-alpine

# OpenSSL required by Prisma engine on Alpine
RUN apk add --no-cache openssl

RUN npm install -g pnpm@10
WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json    ./services/api/
COPY services/api/prisma          ./services/api/prisma

# Install production deps only (triggers @prisma/client postinstall → generate)
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/api/dist    ./services/api/dist

WORKDIR /app/services/api
EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
