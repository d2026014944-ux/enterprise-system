# ─────────────────────────────────────────────────────────────
# Supabase — Guia de Configuração para Deploy
# ─────────────────────────────────────────────────────────────

## 1. Obter a DATABASE_URL do Supabase

1. Acesse: https://supabase.com/dashboard → seu projeto
2. Vá em: **Settings** → **Database**
3. Em **Connection string**, copie a URI:
   ```
   postgresql://postgres.[REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

### ⚠️ IMPORTANTE: Use a Connection Pooler (porta 6543)

```
# ✅ CORRETO — Pooler (recomendado para serverless/Render)
postgresql://postgres.[REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# ❌ EVITE — Direct (porta 5432, não funciona em free tier)
postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
```

## 2. Configurar variáveis de ambiente no Render

No dashboard do Render, vá em **Environment** e adicione:

```
DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
NODE_ENV=production
PORT=3000
JWT_SECRET=<gere com: openssl rand -hex 32>
JWT_REFRESH_SECRET=<gere com: openssl rand -hex 32>
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
CORS_ORIGINS=*
LOG_LEVEL=info
```

## 3. Executar as migrações do Supabase

### Opção A: Via Supabase CLI (recomendado)

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Linkar ao projeto
supabase link --project-ref vmxubssgrfzizlyqmkfx

# Aplicar as migrações de segurança
supabase db push
```

### Opção B: Via SQL Editor do Supabase Dashboard

1. Acesse: https://supabase.com/dashboard → seu projeto → **SQL Editor**
2. Execute cada migration na ordem:
   - `00001_extensions.sql`
   - `00002_enums.sql`
   - `00003_security_infrastructure.sql`
   - `00004_core_schema.sql`
   - `00005_financial_schema.sql`
   - `00006_rls_policies.sql`
   - `00007_secure_functions.sql`
   - `00008_grants.sql`
   - `00009_intrusion_detection.sql`

### Opção C: Via psql direto

```bash
# Conectar ao Supabase
psql "postgresql://postgres.[REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Executar cada migration
\i supabase/migrations/00001_extensions.sql
\i supabase/migrations/00002_enums.sql
# ... etc
```

## 4. Prisma + Supabase

O projeto usa Prisma como ORM. Para gerar o client:

```bash
npx prisma generate
```

Para aplicar as migrations do Prisma (se houver):

```bash
npx prisma migrate deploy
```

## 5. Verificar o deploy

Após o deploy, acesse:

- **API:** `https://seu-app.onrender.com/api/v1`
- **Swagger:** `https://seu-app.onrender.com/api/docs`
- **Health:** `https://seu-app.onrender.com/api/v1/health`

## 6. Troubleshooting

### Erro: "Can't reach database server"
- Verifique se está usando o Pooler (porta 6543)
- Verifique se `DATABASE_SSL=true`

### Erro: "Tenant or user not found"
- O Supabase Pooler exige o formato `postgres.[REF]` no username
- Não use `postgres` direto

### Erro: "Self-signed certificate"
- Configure `DATABASE_SSL_REJECT_UNAUTHORIZED=false`

### Cold Start (Render Free Tier)
- O Render desliga o serviço após 15 min de inatividade
- Primeira requisição pode demorar ~30s
- Solução: use UptimeRobot para manter vivo (ping a cada 5 min)
