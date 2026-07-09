# URL Shortener

A horizontally-scalable URL shortening service. Turns long URLs into short codes and redirects on lookup, built for a read-heavy workload (redirects vastly outnumber creates).

The system is split into independent services behind an API gateway so the read (redirect) path and write (create) path scale separately.

```
          ┌──────────────┐
client ──▶│  API Gateway │  auth (JWT verify) · rate-limit · routing
          └──────┬───────┘
     auth  │ write │   read
     ┌─────┘  ┌────┴───┐  └────┐
     ▼        ▼        ▼       ▼
┌─────────┐┌─────────┐    ┌─────────┐
│Auth Svc ││Write Svc│    │Read Svc │
│register ││create/  │    │redirect │
│login    ││edit     │    │         │
└────┬────┘└────┬────┘    └────┬────┘
     │          │          cache │
     └──────────┴─────────┬──────┘
                          ▼
          ┌────────────┐   miss   ┌─────────────┐
          │   Redis    │ ───────▶ │ PostgreSQL  │
          │  cache     │          │ source of   │
          └────────────┘          │ truth       │
                                  └─────────────┘
```

## Documentation

| Doc | What's in it |
|-----|--------------|
| [docs/architecture.md](docs/architecture.md) | Component responsibilities, request flows, why read/write are split |
| [docs/api.md](docs/api.md) | Full HTTP API reference — gateway, write service, read service |
| [docs/data-model.md](docs/data-model.md) | PostgreSQL schema, indexes, DDL, delete strategy |
| [docs/caching.md](docs/caching.md) | Redis cache-aside, invalidation, stampede protection, async analytics |
| [docs/short-codes.md](docs/short-codes.md) | Code generation, base62, collisions, distributed ID allocation |
| [docs/scaling.md](docs/scaling.md) | Capacity estimates, sharding, bottlenecks, failure modes |
| [docs/deployment.md](docs/deployment.md) | Running locally, env vars, ports, Docker Compose, ops runbook |
| [docs/adr/](docs/adr/) | Architecture Decision Records — the "why" behind each locked choice |

## Stack

- **Node.js + Express** — all four services
- **PostgreSQL** — source of truth for URL mappings, users, refresh tokens
- **Redis** — hot-key cache + rate-limit counters + async analytics queue
- **Docker Compose** — local orchestration

## Quickstart

```bash
# 1. bring up datastores
docker compose up -d postgres redis

# 2. apply schema
psql "$DATABASE_URL" -f db/schema.sql

# 3. install deps (workspace root)
npm install

# 4. run all services + worker
npm run dev

# 5. register + login
curl -X POST http://localhost:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"prachi@bytive.in","password":"correct-horse-1"}'

curl -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"prachi@bytive.in","password":"correct-horse-1"}'
# → 200 { "accessToken":"...", "refreshToken":"...", "expiresIn":900 }

# 6. shorten a URL (through the gateway, with the access token)
curl -X POST http://localhost:8080/urls \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{"longUrl":"https://example.com/some/very/long/path?a=1&b=2"}'
# → 201 { "shortCode":"9aF2kQ", "shortUrl":"http://localhost:8080/9aF2kQ", ... }

# 7. follow the redirect
curl -i http://localhost:8080/9aF2kQ
# → 302 Location: https://example.com/some/very/long/path?a=1&b=2

# 8. refresh an expired access token
curl -X POST http://localhost:8080/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

## Ports

| Service | Port | Public? |
|---------|------|---------|
| API Gateway | 8080 | yes — only public entry point |
| Auth Service | 8083 | no — internal |
| Write Service | 8081 | no — internal |
| Read Service | 8082 | no — internal |
| PostgreSQL | 5432 | no |
| Redis | 6379 | no |

## Repository layout

```
url-shortner/
├── README.md
├── docker-compose.yml
├── db/
│   └── schema.sql
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── data-model.md
│   ├── caching.md
│   ├── short-codes.md
│   ├── scaling.md
│   ├── deployment.md
│   └── adr/
├── services/
│   ├── gateway/
│   ├── auth/
│   ├── write/
│   ├── read/
│   └── worker/          # drains the analytics queue
└── REQUIREMENTS.md      # cold-build learning spec (separate track)
```
