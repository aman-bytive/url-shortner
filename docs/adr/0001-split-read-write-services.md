# ADR-0001: Split read and write into separate services

**Status:** Accepted

## Context
Create and resolve have opposite profiles: resolve is very high QPS with a tight latency budget and simple work; create is low QPS, latency-relaxed, heavy work (validation, id gen, uniqueness). A single service forces both to scale together and makes the hot redirect path carry write-path dependencies.

## Decision
Run Write Service and Read Service as separate processes behind an API gateway. They share only PostgreSQL and Redis — no shared code imports.

## Consequences
- Read Service scales horizontally and independently to absorb redirect traffic.
- Read path stays minimal (one cache lookup) and deployable on its own.
- Cost: operational overhead of more services, and a network hop through the gateway.
- Cross-service consistency is eventual (cache TTL + explicit invalidation), accepted deliberately.
