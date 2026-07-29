# 🏢 Enterprise System

Enterprise-grade NestJS system with Clean Architecture, DDD, and CQRS.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Run in development
npm run start:dev

# Build for production
npm run build

# Run in production
npm run start:prod
```

## 📚 API Documentation

After starting the server, visit:
- **Swagger UI:** http://localhost:3000/api/docs
- **Health Check:** http://localhost:3000/api/v1/health

## 🏗️ Architecture

```
src/
├── application/     # Use cases, commands, queries (CQRS)
├── domain/          # Entities, value objects, domain services
├── infrastructure/  # Database, cache, external services
├── presentation/    # Controllers, DTOs, filters
├── security/        # Auth, RBAC, encryption
├── observability/   # Logging, metrics, tracing
└── common/          # Shared utilities, types, decorators
```

## 🔒 Security

- **Authentication:** JWT with refresh token rotation
- **Authorization:** Role-based access control (RBAC)
- **Rate Limiting:** Per-IP and per-user throttling
- **Input Validation:** Whitelist mode, forbid unknown properties
- **Encryption:** AES-256-GCM for sensitive data
- **Audit Trail:** All mutations logged

## 🗄️ Database

- **ORM:** Prisma
- **Database:** PostgreSQL (Supabase)
- **Migrations:** Versioned SQL files in `supabase/migrations/`

## 🐳 Docker

```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## ☸️ Kubernetes

```bash
# Deploy to dev
kubectl apply -k k8s/overlays/dev

# Deploy to production
kubectl apply -k k8s/overlays/prod
```

## 📊 Observability

- **Logging:** Winston (structured JSON in production)
- **Metrics:** Prometheus (http://localhost:9090)
- **Tracing:** Jaeger (http://localhost:16686)
- **Dashboards:** Grafana (http://localhost:4000)

## 🧪 Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## 📦 Tech Stack

| Category | Technology |
|----------|------------|
| Framework | NestJS 10 |
| Language | TypeScript 5.6 |
| Database | PostgreSQL 16 (Supabase) |
| ORM | Prisma 5 |
| Cache | Redis 7 |
| Auth | JWT + Passport |
| Validation | class-validator + Zod |
| Logging | Winston |
| Testing | Jest + Supertest |
| API Docs | Swagger/OpenAPI |

## 📄 License

Proprietary — All rights reserved.
