#!/bin/bash
# ============================================================================
# Deploy Script — Render.com Free Tier
# ============================================================================
# Usage: ./scripts/deploy.sh
# ============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Enterprise System — Deploy para Render.com (Gratuito)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Verify prerequisites ───────────────────────────
log "Verificando pré-requisitos..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale: https://nodejs.org"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo "❌ Git não encontrado. Instale: https://git-scm.com"
  exit 1
fi

NODE_VERSION=$(node -v)
info "Node.js: $NODE_VERSION"

# ── Step 2: Check .env ────────────────────────────────────
log "Verificando configuração..."

if [ ! -f ".env" ]; then
  warn ".env não encontrado. Copiando de .env.example..."
  cp .env.example .env
  warn "⚠️  Edite .env com suas credenciais do Supabase antes de continuar!"
  echo ""
  echo "Variáveis obrigatórias:"
  echo "  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
  echo "  JWT_SECRET=$(openssl rand -hex 32)"
  echo "  JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
  echo ""
  exit 1
fi

# ── Step 3: Build ─────────────────────────────────────────
log "Instalando dependências..."
npm install -g pnpm 2>/dev/null || true
pnpm install --frozen-lockfile

log "Gerando Prisma Client..."
npx prisma generate

log "Compilando aplicação..."
npx nest build

info "✅ Build concluído!"

# ── Step 4: Test locally ──────────────────────────────────
echo ""
log "Teste local antes de fazer deploy?"
echo "  pnpm start:prod"
echo ""
echo "Se tudo OK, faça o deploy:"
echo ""

# ── Step 5: Deploy instructions ───────────────────────────
echo "═══════════════════════════════════════════════════════════"
echo "  OPÇÕES DE DEPLOY GRATUITO"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  🟢 OPÇÃO 1: Render.com (Recomendado)"
echo "  ─────────────────────────────────────"
echo "  1. Crie conta em https://render.com"
echo "  2. Conecte seu repositório GitHub/GitLab"
echo "  3. Render detecta render.yaml automaticamente"
echo "  4. Configure DATABASE_URL no dashboard"
echo "  5. Deploy automático a cada push!"
echo ""
echo "  🟡 OPÇÃO 2: Railway"
echo "  ─────────────────────────────────────"
echo "  1. Instale CLI: npm i -g @railway/cli"
echo "  2. railway login"
echo "  3. railway init"
echo "  4. railway up"
echo ""
echo "  🔵 OPÇÃO 3: Fly.io"
echo "  ─────────────────────────────────────"
echo "  1. Instale CLI: curl -L https://fly.io/install.sh | sh"
echo "  2. fly auth signup"
echo "  3. fly launch"
echo "  4. fly deploy"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
