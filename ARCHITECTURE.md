# Enterprise System Architecture

## Stack
- **Runtime:** TypeScript 5.x + Node.js 22
- **Framework:** NestJS 10
- **Database:** PostgreSQL 16 + Prisma ORM
- **Cache:** Redis 7
- **Queue:** BullMQ
- **Auth:** JWT + RBAC + OAuth2
- **Observability:** OpenTelemetry + Prometheus + Structured Logging
- **Container:** Docker + Kubernetes
- **Testing:** Jest + Supertest + TestContainers

## Architectural Layers (Clean Architecture + DDD)
1. **Domain** — Entities, Value Objects, Aggregates, Domain Events, Domain Services
2. **Application** — Use Cases, CQRS (Commands/Queries), DTOs, Ports
3. **Infrastructure** — Repositories, External Adapters, Message Brokers, Cache
4. **Presentation** — REST Controllers, GraphQL Resolvers, Guards, Interceptors
5. **Security** — Authentication, Authorization, Rate Limiting, Encryption
6. **Observability** — Logging, Metrics, Distributed Tracing, Health Checks
7. **Testing** — Unit, Integration, E2E, Contract, Performance
8. **DevOps** — Docker, K8s manifests, CI/CD, IaC
