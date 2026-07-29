# ─────────────────────────────────────────────────────────────
# Multi-Stage Dockerfile — Enterprise NestJS System
#
# Stages:
#   1. deps     — Install production dependencies
#   2. build    — Compile TypeScript
#   3. production — Minimal runtime image
#
# Features:
#   - Non-root user (node:1001)
#   - tini for proper PID 1 signal handling
#   - Health check built-in
#   - Layer caching optimized
#   - <100MB final image target
# ─────────────────────────────────────────────────────────────

# ── Base image ──────────────────────────────────────────────
FROM node:22-alpine AS base

# Install tini for proper signal handling (PID 1)
RUN apk add --no-cache tini

WORKDIR /app

# ── Stage 1: Dependencies ───────────────────────────────────
FROM base AS deps

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install pnpm and production dependencies
RUN corepack enable pnpm && \
    pnpm install --frozen-lockfile --prod --ignore-scripts && \
    # Store prod deps separately
    cp -R node_modules /prod_node_modules && \
    # Install all deps (including dev) for build
    pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: Build ──────────────────────────────────────────
FROM base AS build

# Copy all dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and config
COPY package.json tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npx nest build

# Remove dev dependencies from the build output
RUN rm -rf node_modules && \
    cp -R /prod_node_modules node_modules 2>/dev/null || true

# ── Stage 3: Production ─────────────────────────────────────
FROM base AS production

# Build arguments
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Install only production dependencies
COPY --from=deps /prod_node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Copy package.json for runtime metadata
COPY package.json ./

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    # Create necessary directories
    mkdir -p /app/logs /app/tmp && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health/live || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "--max-old-space-size=512", "--enable-source-maps", "dist/main.js"]
