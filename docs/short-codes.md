# Short Code Generation

The short code is the public key in `shortUrl = host + "/" + code`. It must be short, URL-safe, unique, and generated without a global bottleneck.

## Alphabet: base62

`[0-9A-Za-z]` = 62 symbols. URL-safe (no `+`, `/`, `=` like base64), case-sensitive for max density.

| Length | Keyspace (62^n) | Rough capacity |
|--------|-----------------|----------------|
| 6 | 5.7e10 | 57 billion |
| 7 | 3.5e12 | 3.5 trillion |
| 8 | 2.2e14 | 218 trillion |

Default **7 chars** — trillions of codes, still short. Length grows automatically if the id range demands it.

## Strategy: base62 of a distributed ID

Codes are the base62 encoding of a globally-unique 64-bit id. This makes uniqueness a property of the id generator — **no collision check, no retry, no unique-constraint failure on the hot path.**

```
id (unique bigint) ── base62 encode ──▶ short_code
```

Two id sources depending on deployment:

### Single write instance / low scale
PostgreSQL `GENERATED ALWAYS AS IDENTITY` gives a monotonic `bigint`. Encode it. Simple, zero coordination. Downside: codes are sequential and guessable — fine unless enumeration is a threat.

### Multiple write instances (see [scaling.md](scaling.md))
Auto-increment serializes and leaks order across shards. Replace with either:

- **ID-range allocation.** Each write instance leases a block of ids (e.g. 10,000) from a central counter (`INCRBY urls:idblock 10000` in Redis, or a DB sequence). It hands out ids locally until the block is exhausted, then leases the next. Central counter touched once per 10k creates, not per create.
- **Snowflake-style id.** `[timestamp | instance_id | sequence]` packed into 64 bits, generated locally with no coordination. Encode to base62.

Both guarantee global uniqueness without a per-write round trip to a shared authority.

## Custom codes (vanity)

`POST /urls` with `customCode`. These bypass id-generation and go straight to an insert guarded by the `UNIQUE(short_code)` constraint:

```sql
INSERT INTO urls (short_code, long_url, ...) VALUES ($1, ...);
-- unique violation → 409 CODE_TAKEN
```

The unique index is the single source of truth for uniqueness — even generated codes rely on it as a backstop.

## Guessability / enumeration

Sequential base62 codes are enumerable (`abc`, `abd`, ...). If links must be private/unguessable:

- add per-user random salt to the encoded id, or
- use random 7-char codes with a uniqueness check + bounded retry (accept the small collision-handling cost).

Default build assumes links are semi-public (share links), so sequential is acceptable and cheaper. Documented as a knob, not a default.

## Collision math (for the random strategy)

Birthday bound: expected first collision around `√(62^n)` codes.

- 7 chars → collision likely around ~1.9M random codes without a uniqueness check.
- With a `UNIQUE` constraint + retry, collisions are *detected*, not silent — a retry loop bounded at 3 attempts handles it; probability of 3 straight collisions at <10% table fill is negligible.

This is why the id-encoding strategy is preferred at scale: it sidesteps the birthday problem entirely.
