# ADR-0007: Redis atomic counter (INCR) for short-code generation

**Status:** Accepted

## Context
Short codes need global uniqueness with no per-write collision check. Considered: Postgres `IDENTITY` column (simple but doesn't solve multi-instance write scaling without extra work), id-range leasing, Snowflake-style composite ids, and a shared atomic counter in Redis.

## Decision
Use a single Redis key with `INCR` as the id source. Encode the returned integer as base62 to produce the short code.

## Consequences
- **Uniqueness is free across multiple Write Service instances.** Redis is single-threaded; `INCR` is atomic. Two concurrent calls from two different instances always get two different values. This is the multi-instance uniqueness problem [scaling.md](../scaling.md) originally solved with id-range leasing or Snowflake ids — the Redis counter gets it for free, no extra mechanism needed.
- No retry loop, no unique-constraint race handling on the hot path for generated codes (custom/vanity codes still go through the `UNIQUE(short_code)` insert-and-catch path, since they don't come from the counter).
- **New durability dependency:** the counter's state lives in Redis, not Postgres (the system's source of truth everywhere else). Mitigated with Redis `--appendonly yes` (already set in `docker-compose.yml`). The `UNIQUE(short_code)` DB constraint remains a hard backstop if the counter ever regresses.
- **New single point of contention:** one counter key, one Redis node. Accepted — `INCR` throughput vastly exceeds this project's write volume (see [scaling.md](../scaling.md)). Revisit if Redis itself needs to shard.
- Codes are sequential and guessable, same trade-off as an auto-increment id — see [short-codes.md](../short-codes.md#guessability--enumeration) for the enumeration knob if needed later.
