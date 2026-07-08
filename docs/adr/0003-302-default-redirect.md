# ADR-0003: Default to 302 redirects

**Status:** Accepted

## Context
A shortener can redirect with 301 (permanent, aggressively cached by browsers/proxies) or 302 (temporary, revalidated each time). 301 is faster for the client but the request stops reaching our service once cached.

## Decision
Default to **302**. Offer opt-in 301 via `permanent: true` on create.

## Consequences
- Every resolve flows through the Read Service → click analytics work, and edits/deletes take effect for all clients.
- Cost: slightly more redirect traffic hits our infrastructure vs 301 (client re-requests each time). Absorbed by the cache tier.
- `permanent: true` suits links that will never change and don't need analytics; those clients get browser-cached 301 speed at the cost of losing per-click tracking and post-hoc editability.
