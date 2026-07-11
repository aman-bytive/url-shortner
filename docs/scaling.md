# Scaling, Capacity & Failure Modes

## Capacity estimate (worked example)

Assume: 100M new URLs/month, read:write ratio 100:1.

**Writes**
- 100M / month ≈ 40 writes/sec average, ~400/sec peak (10× burst).
- Trivial for a single Postgres primary. Write Service: 2 instances for HA, not throughput.

**Reads**
- 40 × 100 = 4,000 redirects/sec average, ~40,000/sec peak.
- At a 90%+ cache hit rate, Postgres sees ≤4,000/sec of misses at peak — still comfortable. Redis absorbs the rest.
- Read Service scales horizontally; each instance is stateless.

**Storage**
- 100M rows/month × ~500 bytes ≈ 50 GB/month in `urls`.
- `clicks` dominates: 4,000/sec × 100 bytes ≈ 34 GB/day. Partition `clicks` by month and expire/archive old partitions.

**Code space**
- 7-char base62 = 3.5e12. At 1.2B/year, decades of runway before needing 8 chars.

## Scaling each tier

| Tier | Scale by | Notes |
|------|----------|-------|
| Gateway | add instances | stateless; rate-limit state in Redis |
| Read Service | add instances | stateless; hottest tier |
| Write Service | add instances | shares one Redis counter for id-gen — see [short-codes.md](short-codes.md), already multi-instance-safe |
| Redis | replica for reads / cluster shard by `code` | cache is rebuildable — lose it, warm it back from DB |
| Postgres | read replicas, then shard | see below |

## Sharding Postgres

When one primary can't hold the write volume or dataset, shard the `urls` table by `short_code`.

- **Shard key:** `short_code` (redirect always knows the code — routes directly to the owning shard).
- **Routing:** consistent hashing over shards so adding a shard moves only `1/N` of keys, not everything.
- **ID generation needs no change.** The Redis `INCR` counter is already global and shared by every Write Service instance — sharding Postgres doesn't introduce a new uniqueness problem, since ids never came from per-shard auto-increment in the first place. If the counter itself becomes the bottleneck at extreme scale, partition it into N sub-counters (e.g. `urls:id_counter:{0..N}`, round-robin or hash-assigned) — not because of sharding, but because a single Redis key has a throughput ceiling.

Consistent hashing recap (interview-grade):
- Node join/leave moves only the keys between the new node and its successor on the ring — `~keys/N`, not a full reshuffle.
- **Virtual nodes** spread each physical node across many ring positions → smoother key distribution, less variance, gentler rebalancing.
- **Hot partition:** one viral link can hammer a single shard. Mitigate at the cache tier — a hot code is a Redis hit, never reaching its shard. For hot *ranges*, add virtual-node weight or a dedicated cache.

## Failure modes

| Failure | Effect | Mitigation |
|---------|--------|-----------|
| Redis down | every redirect misses → all hit Postgres; **also blocks all creates** (id counter lives here) | Read Service falls back to DB directly; add Redis replica/Sentinel; DB must survive the miss storm (connection pool cap + single-flight); creates fail closed (503) rather than risk duplicate ids |
| Postgres primary down | no new writes; reads served from cache until TTL | replica promotion; cached redirects keep working meanwhile |
| Worker down | click events queue up, `click_count` stalls | queue buffers; drains on restart; redirects unaffected |
| Gateway down | total outage (single entry point) | run ≥2 behind a load balancer |
| Cache stampede | herd of misses to DB | single-flight lock (see [caching.md](caching.md)) |
| Analytics queue overflow | Redis memory pressure | cap stream length (`MAXLEN`), shed oldest, alert on depth |

## Bottleneck order (what breaks first as you grow)

1. **Redis memory / hit rate** — the working set outgrows one node → Redis cluster.
2. **Postgres write throughput** — → sharding (id generation already handled by the Redis counter, no extra work needed there).
3. **`clicks` table size** — → time-partitioning + archival (hits first by raw volume, but is off the critical path).
4. **Redis counter key itself** — theoretical ceiling, unlikely to hit in practice; partition into sub-counters only if `INCR` throughput on one key becomes measurably limiting.

The redirect path is designed so that #2 and #3 never touch it under a healthy cache.
