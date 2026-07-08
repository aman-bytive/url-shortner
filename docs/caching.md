# Caching & Redis

Redis serves three separate concerns. Keep the keyspaces mentally distinct.

| Concern | Key pattern | Type |
|---------|-------------|------|
| Redirect cache | `url:{code}` | string |
| Rate limiting | `rl:{scope}:{id}` | sorted set |
| Analytics queue | `clicks:queue` | stream (or list) |

## Redirect cache (cache-aside)

The redirect path reads from Redis first, DB only on miss.

```
GET url:{code}
 ├─ hit  → redirect
 └─ miss → SELECT from Postgres
            ├─ found  → SETEX url:{code} <TTL> <longUrl>  → redirect
            └─ absent → SETEX url:{code} <NEG_TTL> "∅"    → 404
```

**Why cache-aside (not write-through):** most created codes are never clicked, or clicked far later. Write-through would populate cache on every create, filling Redis with cold entries. Cache-aside only caches what's actually resolved — the working set stays hot and small. See [ADR-0002](adr/0002-cache-aside.md).

**TTL:** live entries `TTL = 24h`. Long enough that hot links stay resident, short enough that a missed invalidation self-heals within a day.

### Invalidation

On **edit** (`PUT`) or **delete** (`DELETE`), the Write Service immediately `DEL url:{code}`. Next resolve re-reads the DB and re-populates. This closes the dangerous window: a deleted link must stop redirecting *now*, not in 24h.

Ordering matters: write the DB **then** delete the cache key. If you delete the cache first, a concurrent read can re-populate the old value before the DB commit lands.

## Negative caching

Unknown codes are cached as a tombstone (`"∅"`) with a short TTL (`NEG_TTL = 60s`). Without this, a bot scanning random codes drives one DB read per bogus request. With it, repeated misses for the same bogus code hit Redis, not Postgres.

Trade-off: if a code is created *after* being negatively cached, it stays 404 for up to `NEG_TTL`. Mitigate by having the Write Service `DEL url:{code}` on create too (covers the create-after-probe case).

## Cache stampede protection

Problem: a hot code expires (or was never cached). 1000 concurrent redirects all miss simultaneously and fire 1000 identical DB reads (a "thundering herd").

**Solution: single-flight lock.** First miss acquires `SET url:{code}:lock <token> NX EX 5`. Only the lock holder queries the DB and populates the cache; others briefly wait-and-retry the cache read (short spin with jitter, capped) or serve stale if available.

```
miss:
  if SET lock NX succeeds:
      value = DB read; SETEX url:{code}; DEL lock; return value
  else:
      sleep(jitter); retry GET url:{code}  (bounded attempts, then fall through to DB)
```

**Acceptance:** 1000 concurrent requests for one cold code → DB sees ~1 read, not 1000.

## Async click analytics

The redirect must not block on an analytics write.

```
read svc:  XADD clicks:queue * code {code} ts {now} ref {referrer} ip {ip_hash}
           → return 302 immediately (fire-and-forget)

worker:    XREADGROUP  → batch → INSERT into clicks
                                → UPDATE urls SET click_count = click_count + n
           → XACK
```

- Worker down → events accumulate in the stream, not lost. On restart it drains the backlog.
- `click_count` is **eventually** correct. After N redirects settle, `click_count == N`.
- Batch inserts (e.g. 100 events or 1s, whichever first) to amortize DB round-trips.

## Rate limiting

Sliding-window log per client, in Redis sorted sets, so the limit holds across all gateway instances.

```
key = rl:{routeClass}:{apiKeyOrIp}
now = epoch_ms

ZREMRANGEBYSCORE key 0 (now - windowMs)   # drop old entries
count = ZCARD key
if count >= limit:  reject 429, Retry-After = ttl of oldest+window
else:
   ZADD key now {unique-member}
   PEXPIRE key windowMs
   allow
```

Sliding-window (log) not fixed-bucket: a fixed bucket resetting on a hard boundary lets a client send `2×limit` across the boundary instant. The sliding window counts the *trailing* window at every request, so the limit is smooth.

Wrapped in a `MULTI`/Lua script so the read-modify-write is atomic under concurrency.
