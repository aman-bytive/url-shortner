# Deployment & Ops

## Local development

```bash
docker compose up -d postgres redis     # datastores
psql "$DATABASE_URL" -f db/schema.sql    # schema
npm install                              # workspace deps
npm run dev                              # gateway + write + read + worker
```

`npm run dev` runs all four processes concurrently with restart-on-change.

## Environment variables

Shared:

| Var | Example | Used by |
|-----|---------|---------|
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/shortener` | write, read, worker |
| `REDIS_URL` | `redis://localhost:6379` | all |
| `PUBLIC_HOST` | `http://localhost:8080` | write (builds `shortUrl`) |
| `LOG_LEVEL` | `info` | all |

Per-service:

| Var | Example | Service |
|-----|---------|---------|
| `GATEWAY_PORT` | `8080` | gateway |
| `WRITE_URL` | `http://localhost:8081` | gateway (proxy target) |
| `READ_URL` | `http://localhost:8082` | gateway (proxy target) |
| `WRITE_PORT` | `8081` | write |
| `READ_PORT` | `8082` | read |
| `JWT_SECRET` / `API_KEYS` | — | gateway (auth) |
| `CACHE_TTL_S` | `86400` | read |
| `NEG_TTL_S` | `60` | read |
| `RL_WRITE_PER_MIN` | `60` | gateway |
| `RL_READ_PER_MIN` | `6000` | gateway |
| `WORKER_BATCH` | `100` | worker |

## docker-compose.yml (datastores)

See [`docker-compose.yml`](../docker-compose.yml). Brings up Postgres and Redis with named volumes for persistence.

## Production topology

```
            Internet
               │
        ┌──────▼──────┐
        │ Load Balancer│
        └──────┬──────┘
        ┌──────▼───────┐   (N instances, stateless)
        │   Gateway    │
        └──┬────────┬──┘
      write│        │read
   ┌───────▼──┐  ┌──▼────────┐
   │ Write ×2 │  │ Read ×N   │
   └────┬─────┘  └────┬──────┘
        └──────┬──────┘
        ┌──────▼──────┐    ┌──────────┐
        │   Redis     │    │  Worker  │
        │ (+ replica) │◀───│ (queue)  │
        └──────┬──────┘    └────┬─────┘
        ┌──────▼──────────────────▼─┐
        │  Postgres (primary+replica)│
        └────────────────────────────┘
```

### Network isolation (critical)

- **Only the load balancer → gateway** is reachable from the internet.
- Write/Read services bind to the private network. Enforce with security groups / network policies so nothing external can reach `:8081`/`:8082` and forge the `X-User-Id` header the gateway injects.
- Postgres and Redis accept connections only from service subnets.

## Runbook

### Deploy order
1. Apply DB migrations (backward-compatible first).
2. Roll Write Service.
3. Roll Read Service.
4. Roll Gateway.
5. Roll Worker.
Read/Write share only the DB+Redis contract, so they roll independently.

### Key metrics to watch (`/metrics`)
- **Redirect p99 latency** — SLO < 10ms on cache hit.
- **Cache hit rate** — alert if < 85%.
- **Analytics queue depth** — alert if growing (worker falling behind).
- **429 rate** — spike = abuse or a limit set too low.
- **DB connections in use** — near pool cap = stampede or Redis outage.

### Common incidents

| Symptom | Likely cause | Action |
|---------|-------------|--------|
| Redirect latency spike | Redis down/slow | check Redis; DB fallback should hold; scale DB pool |
| `click_count` frozen | worker dead | restart worker; queue drains automatically |
| Mass 404 on valid links | bad cache invalidation / wrong TTL | check `url:{code}` in Redis; flush affected keys |
| 429 storm on redirects | limit too tight or bot | raise `RL_READ_PER_MIN` or block IP upstream |
| Duplicate `short_code` error | distributed id gen misconfigured | verify id-range/snowflake instance ids are unique |

### Backups
- Postgres: daily base backup + WAL archiving (PITR).
- Redis: **not** backed up — it's a rebuildable cache. Cold start warms from DB on demand.
