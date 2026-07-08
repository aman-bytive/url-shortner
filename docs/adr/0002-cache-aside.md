# ADR-0002: Cache-aside for the redirect cache

**Status:** Accepted

## Context
Redirects should hit Redis, not Postgres. Two strategies: write-through (populate cache on every create) or cache-aside (populate on first read-miss).

## Decision
Cache-aside. On resolve: read Redis; on miss, read DB and populate with a 24h TTL. Invalidate (`DEL`) on edit/delete.

## Consequences
- Cache holds only codes that are actually resolved — the working set stays small and hot. Most created links are never (or rarely) clicked, so write-through would waste memory on cold entries.
- Cost: the first resolve of any code pays a DB read. Acceptable — happens once per code per TTL window.
- Requires explicit invalidation on writes and a stampede guard (single-flight) for hot cold-misses. Both documented in [caching.md](../caching.md).
