# syntax=docker/dockerfile:1
# LuyFlow API image. Built and pushed to GHCR by .github/workflows/ci.yml.
ARG NODE_IMAGE=node:22-bookworm-slim

# ---- Stage 1: build (dev dependencies + TypeScript compile) ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: runtime (production dependencies + compiled code only) ----
FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="luyflow" \
      org.opencontainers.image.description="LuyFlow personal finance API (NestJS)" \
      org.opencontainers.image.source="https://github.com/Samnang-Vouen/luy_flow"
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Run as the unprivileged user that ships with the Node image.
USER node
EXPOSE 3000

# Healthy once the API answers on GET /.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Apply pending migrations, then replace the shell with Node so it receives SIGTERM directly
# (graceful shutdown via enableShutdownHooks in main.ts).
CMD ["sh", "-c", "npm run migration:run:prod && exec node dist/main"]
