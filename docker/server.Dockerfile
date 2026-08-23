# ── Nibblio game server — multi-stage production build (spec §61) ────────────
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# dependency graph first (layer caching)
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

# sources
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server

# bundle (esbuild inlines @nibblio/* workspace source; real deps stay external)
RUN cd apps/server && node build.mjs

# production node_modules for the server package only
RUN pnpm --filter @nibblio/server --prod deploy --legacy /deploy

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/migrations ./migrations
COPY --from=build /app/apps/server/package.json ./package.json

# non-root (spec §61)
USER node
EXPOSE 2567

HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||2567)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
