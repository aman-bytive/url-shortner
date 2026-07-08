# ADR-0004: New code per create by default; dedup is opt-in

**Status:** Accepted

## Context
If the same long URL is submitted twice, do we return the same code or a new one? Dedup saves storage; distinct codes let users track separate campaigns/channels for the same destination.

## Decision
Default: **new code every create.** Opt in to dedup with `dedup=true`, which returns the existing code for a matching `(user_id, long_url)` pair.

## Consequences
- Default preserves per-link analytics — two shares of the same URL are independently measurable.
- `dedup=true` needs a lookup on `(user_id, long_url)`; add a supporting index only if dedup usage is high (not indexed by default to avoid write overhead on the common path).
- Anonymous creates (`user_id` null) never dedup — no owner to scope the match.
