#!/bin/bash
# ============================================================================
# Setup Script — Supabase + Render.com
# ============================================================================
# Configura tudo para deploy gratuito
# ============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
step() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 Setup — Enterprise System + Supabase + Render (Gratuito)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Environment ───────────────────────────────────
step "Configurando variáveis de ambiente..."

if [ ! -f ".env" ]; then
  # Generate secrets
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)

  cat > .env << EOF
# ═══════════════════════════════════════════════════════════
# Enterprise System — Environment Variables
# ═══════════════════════════════════════════════════════════

# ── Application ──────────────────────────────────────────
NODE_ENV=production
PORT=3000
GLOBAL_PREFIX=api/v1
API_VERSION=1.0.0

# ── Supabase Database ────────────────────────────────────
# ⚠️ SUBSTITUA pela sua connection string do Supabase
# Formato: postgresql://postgres.[REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
DATABASE_URL=postgresql://postgres:password@localhost:5432/enterprise
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# ── JWT ──────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# ── CORS ─────────────────────────────────────────────────
CORS_ORIGINS=*

# ── Logging ──────────────────────────────────────────────
LOG_LEVEL=info

# ── Rate Limiting ────────────────────────────────────────
RATE_LIMIT_DEFAULT=100
RATE_LIMIT_WINDOW_SECONDS=60

# ── Shutdown ─────────────────────────────────────────────
SHUTDOWN_TIMEOUT_MS=10000
EOF

  log ".env criado com secrets gerados"
  warn "⚠️  EDITE .env e coloque sua DATABASE_URL do Supabase!"
else
  log ".env já existe"
fi

# ── Step 2: Install dependencies ──────────────────────────
step "Instalando dependências..."

if command -v pnpm &> /dev/null; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  log "Dependências instaladas (pnpm)"
elif command -v npm &> /dev/null; then
  npm install
  log "Dependências instaladas (npm)"
else
  warn "npm/pnpm não encontrado"
fi

# ── Step 3: Generate Prisma ──────────────────────────────
step "Gerando Prisma Client..."

if [ -f "prisma/schema.prisma" ]; then
  npx prisma generate 2>/dev/null && log "Prisma Client gerado" || warn "Prisma generate falhou"
fi

# ── Step 4: Build ─────────────────────────────────────────
step "Compilando aplicação..."

if command -v npx &> /dev/null; then
  npx nest build 2>/dev/null && log "Build concluído" || warn "Build falhou (verifique os erros)"
fi

# ── Step 5: Git setup ────────────────────────────────────
step "Verificando Git..."

if [ ! -d ".git" ]; then
  git init
  git add -A
  git commit -m "Initial commit — Enterprise System"
  log "Repositório Git inicializado"
else
  log "Repositório Git já existe"
fi

# ── Step 6: Summary ──────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ SETUP CONCLUÍDO!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  PRÓXIMOS PASSOS:"
echo ""
echo "  1. 📝 Edite .env com sua DATABASE_URL do Supabase"
echo "     → https://supabase.com/dashboard → Settings → Database"
echo "     → Use o Pooler (porta 6543)"
echo ""
echo "  2. 🗄️  Rode as migrations de segurança no Supabase"
echo "     → SQL Editor → cole cada arquivo .sql na ordem"
echo "     → Ou: supabase db push"
echo ""
echo "  3. 🚀 Faça deploy no Render.com"
echo "     → https://render.com → New Web Service"
echo "     → Conecte seu repo GitHub/GitLab"
echo "     → Render detecta render.yaml automaticamente"
echo ""
echo "  4. 🔗 Configure as env vars no Render"
echo "     → Copie de .env para o dashboard do Render"
echo ""
echo "  5. 🎉 Acesse!"
echo "     → API: https://seu-app.onrender.com/api/v1"
echo "     → Docs: https://seu-app.onrender.com/api/docs"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
