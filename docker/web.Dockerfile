# ── Nibblio web — client static build served by Caddy (TLS + WS proxy) ──────
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY apps/bot/package.json apps/bot/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/protocol/package.json packages/protocol/
COPY packages/game-core/package.json packages/game-core/
COPY packages/asset-types/package.json packages/asset-types/
COPY tools/asset-pipeline/package.json tools/asset-pipeline/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/client ./apps/client
RUN cd apps/client && pnpm exec vite build

# ── runtime: Caddy serves static + proxies WS/API (spec §64) ─────────────────
FROM caddy:2-alpine AS runtime
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/client/dist /srv
EXPOSE 80 443
