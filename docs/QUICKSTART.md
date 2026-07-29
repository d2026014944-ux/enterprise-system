# 🚀 Guia Rápido — Deploy Gratuito

## Resumo

| Componente | Serviço | Custo |
|-----------|---------|-------|
| Backend (NestJS) | Render.com | **Gratuito** |
| Banco de Dados | Supabase | **Gratuito** |
| Auth | Supabase Auth | **Gratuito** |
| Storage | Supabase Storage | **Gratuito** (1GB) |

**Custo total: R$ 0,00** 🎉

---

## Passo 1: Configurar Supabase

### 1.1 Criar projeto (se ainda não tem)
1. Acesse: https://supabase.com
2. Crie uma conta (gratuita)
3. Crie um novo projeto
4. Anote a **Database Password** que você escolher

### 1.2 Obter a connection string
1. No dashboard do Supabase → **Settings** → **Database**
2. Seção **Connection string** → **URI**
3. Copie a string (formato: `postgresql://postgres.[REF]:[SENHA]@...`)

### 1.3 Rodar as migrations de segurança
1. No dashboard → **SQL Editor**
2. Execute cada arquivo `.sql` na ordem:
   - `00001_extensions.sql`
   - `00002_enums.sql`
   - `00003_security_infrastructure.sql`
   - `00004_core_schema.sql`
   - `00005_financial_schema.sql`
   - `00006_rls_policies.sql`
   - `00007_secure_functions.sql`
   - `00008_grants.sql`
   - `00009_intrusion_detection.sql`

---

## Passo 2: Configurar o projeto local

### 2.1 Executar setup
```bash
cd enterprise-system
./scripts/setup.sh
```

### 2.2 Editar .env
```bash
# Abra .env e coloque sua DATABASE_URL do Supabase
DATABASE_URL=postgresql://postgres.SUA_REF:SUA_SENHA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 2.3 Testar localmente
```bash
pnpm start:dev
# Acesse: http://localhost:3000/api/docs
```

---

## Passo 3: Deploy no Render.com

### 3.1 Preparar repositório
```bash
# Inicializar git (se necessário)
git init
git add -A
git commit -m "Deploy ready"

# Criar repositório no GitHub
# → github.com → New Repository
# → Siga as instruções para push
```

### 3.2 Conectar ao Render
1. Acesse: https://render.com
2. Crie uma conta (gratuita)
3. Clique em **New** → **Web Service**
4. Conecte seu repositório GitHub
5. Render detecta `render.yaml` automaticamente

### 3.3 Configurar variáveis de ambiente
No dashboard do Render → **Environment**, adicione:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | Sua connection string do Supabase |
| `DATABASE_SSL` | `true` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Gerado pelo setup (veja .env) |
| `JWT_REFRESH_SECRET` | Gerado pelo setup (veja .env) |

### 3.4 Deploy!
1. Clique em **Create Web Service**
2. Render faz build e deploy automaticamente
3. Acesse: `https://seu-app.onrender.com`

---

## Passo 4: Verificar

### Endpoints importantes
| URL | Descrição |
|-----|-----------|
| `https://seu-app.onrender.com/api/v1/health` | Health check |
| `https://seu-app.onrender.com/api/docs` | Swagger UI |
| `https://seu-app.onrender.com/api/v1` | API root |

---

## ⚠️ Limitações do Free Tier

### Render.com
- **Cold start:** Após 15 min de inatividade, o serviço "dorme"
- **Primeira requisição:** Pode demorar ~30s
- **Solução:** Use [UptimeRobot](https://uptimerobot.com) para ping a cada 5 min

### Supabase
- **Banco:** 500MB de armazenamento
- **Auth:** 50.000 usuários ativos/mês
- **Storage:** 1GB de arquivos
- **Bandwidth:** 2GB/mês

---

## 🔧 Troubleshooting

### "Can't reach database server"
→ Use o Pooler (porta 6543), não o Direct (5432)

### "Tenant or user not found"
→ Username deve ser `postgres.REF`, não `postgres`

### "Self-signed certificate"
→ `DATABASE_SSL_REJECT_UNAUTHORIZED=false`

### Build falha no Render
→ Verifique os logs no dashboard → **Logs**

---

## 📚 Documentação

- [Supabase Docs](https://supabase.com/docs)
- [Render Docs](https://render.com/docs)
- [NestJS Docs](https://docs.nestjs.com)
- [Prisma Docs](https://prisma.io/docs)
