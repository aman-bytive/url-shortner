# Architecture

## Overview

The URL shortener does two things: **create** a mapping (long URL → short code) and **resolve** it (short code → redirect). These two operations have opposite characteristics, so the system is built as separate services rather than one process.

| Dimension | Create (write) | Resolve (read) |
|-----------|----------------|----------------|
| Frequency | Low | Very high (100:1+ vs writes) |
| Latency budget | Relaxed (~100ms fine) | Tight (<10ms p99 target) |
| Work per request | Validation, ID gen, uniqueness, DB write | One cache lookup, redirect |
| Scaling driver | Write throughput | Read QPS, cache hit rate |
| Failure blast radius | New links can't be made | Existing links break — worse |

Coupling them into one service means the redirect path pays for write-path complexity and they can't scale independently. Splitting them is the core architectural decision (see [ADR-0001](adr/0001-split-read-write-services.md)).

## Components

### API Gateway (`services/gateway`, port 8080)

The only public entry point. Responsibilities:

- **Routing** — `POST /urls`, `PUT/DELETE /urls/:code`, `GET /urls/:code` (metadata) → Write Service. `GET /:code` (redirect) → Read Service.
- **Authentication** — validates API key / JWT on write routes. Redirect route is public.
- **Rate limiting** — sliding-window per API key (or per IP for anonymous redirect traffic), state in Redis so it works across gateway instances.
- **Trust boundary** — strips any client-supplied identity headers and injects a trusted `X-User-Id` derived from the validated credential. Downstream services trust this header *only* because it arrives from the gateway on the internal network.

The gateway holds no business logic and no database connection. It is stateless (rate-limit state lives in Redis), so it scales by adding instances behind a load balancer.

### Write Service (`services/write`, port 8081)

Owns the create/edit/delete lifecycle.

- Validates URL format before any DB work.
- Generates the short code (see [short-codes.md](short-codes.md)).
- Writes the mapping to PostgreSQL.
- Invalidates the Redis cache entry on edit/delete.

Low QPS, so a small number of instances suffice. It is the only service that issues writes to the `urls` table.

### Read Service (`services/read`, port 8082)

Owns redirect resolution. This is the hot path.

- Looks up `short_code` in Redis (cache-aside).
- On miss: reads PostgreSQL, populates cache, redirects.
- Emits a click event to the Redis analytics queue **without blocking the redirect**.
- Returns `302` for live codes, `404` for unknown/deleted, `410` for expired.

Read-only against `urls` — never writes the mapping table. Scales widest of all services.

### Worker (`services/worker`)

Background consumer. Drains the Redis analytics stream into the `clicks` table and increments `click_count`. Keeps analytics writes off the redirect hot path. Can lag or restart without affecting redirects; the queue buffers events.

### PostgreSQL

Source of truth for URL mappings. Every code that exists, exists here. Cache is derived and disposable.

### Redis

Three distinct uses, logically separate keyspaces:

1. **Redirect cache** — `url:{code}` → long URL (+ short negative-cache entries for unknown codes).
2. **Rate-limit counters** — sliding-window sorted sets per client.
3. **Analytics queue** — a stream/list of pending click events.

## Request flows

### Create a short URL

```
client → gateway (auth + rate-limit) → write svc
  → validate URL
  → generate short_code
  → INSERT into urls
  → 201 { shortCode, shortUrl, longUrl }
```

### Resolve (redirect) — cache hit

```
client → gateway (rate-limit) → read svc
  → GET url:{code} from Redis  ✓ hit
  → LPUSH click event to Redis queue (fire-and-forget)
  → 302 Location: longUrl
```

### Resolve — cache miss

```
client → gateway → read svc
  → GET url:{code}  ✗ miss
  → SELECT long_url FROM urls WHERE short_code=$1 AND NOT is_deleted
      ├─ found  → SET url:{code} (TTL) → emit click → 302
      └─ absent → SET url:{code} = "∅" (short TTL, negative cache) → 404
```

### Delete

```
client → gateway (auth) → write svc
  → UPDATE urls SET is_deleted=true WHERE short_code=$1
  → DEL url:{code}   (invalidate cache immediately)
  → 204
```

## Network & trust boundaries

- Only the gateway is exposed publicly. Write/Read services bind to the internal network and are unreachable from outside (enforced in deploy via network policy / security group — see [deployment.md](deployment.md)).
- Services do **not** import each other's code. The only shared surface is PostgreSQL and Redis. This keeps the read path deployable and scalable without dragging write-path dependencies along.
- The `X-User-Id` header is trusted downstream solely because external clients cannot reach the internal services to forge it.

## What this design deliberately does NOT do

- No multi-region replication (single-region datastores).
- No strong consistency across cache and DB — redirects are eventually consistent within cache TTL. Acceptable because a slightly stale redirect is harmless; invalidation on delete closes the dangerous window.
- No synchronous analytics — click counts are eventually correct, not real-time exact.

These trade-offs are documented per-decision in [docs/adr/](adr/).
