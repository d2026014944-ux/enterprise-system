# ─────────────────────────────────────────────────────────────
# Multi-Stage Dockerfile — Enterprise NestJS System
# ─────────────────────────────────────────────────────────────

# ── Base image ──────────────────────────────────────────────
FROM node:22-alpine AS base

RUN apk add --no-cache tini
WORKDIR /app

# ── Stage 1: Dependencies ───────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts && \
    cp -R node_modules /prod_node_modules && \
    # Install all deps (including dev) for build
    npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# ── Stage 2: Build ──────────────────────────────────────────
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules

COPY package.json tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npx nest build

RUN rm -rf node_modules && \
    cp -R /prod_node_modules node_modules 2>/dev/null || true

# ── Stage 3: Production ─────────────────────────────────────
FROM base AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

COPY --from=deps /prod_node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    mkdir -p /app/logs /app/tmp && \
    chown -R appuser:appgroup /app

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--max-old-space-size=512", "--enable-source-maps", "dist/main.js"]
