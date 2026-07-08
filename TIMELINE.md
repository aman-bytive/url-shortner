# URL Shortener — Timeline & Schedule

**Duration:** 4 weeks, Mon–Fri. **Start:** Mon 2026-07-14. **End:** Fri 2026-08-08.
**Method:** cold build, no AI code, 35-min timer per component, blank file, no reference open. Retest cold ≥2×, spaced 3–7 days.

**Daily block:** 1× 35-min cold build + 25 min test/debug + 15 min written defense = ~75 min/day core. Day 5 each week = outreach + blockers log (no build).

---

## Week 1 — Write & Read services (07-14 → 07-18)

| Day | Date | Task | Time box | Done when |
|-----|------|------|----------|-----------|
| 1 | Mon 07-14 | Write Service: `POST /urls`, `GET/DELETE /urls/:code` + code generation | 35 min | bad URL → 422, create → 201 + code, dup handling matches your written decision |
| 2 | Tue 07-15 | Read Service (separate process): `GET /:code` → 302 | 35 min | live → 302, unknown → 404, expired → 410, deleted → 404 |
| 3 | Wed 07-16 | Written defense: index type, 301 vs 302, collision math @ 1M/100M/1B | 30 min | 3 answers written, no notes |
| 4 | Thu 07-17 | Cold rebuild: code-gen + collision only, blank file | 35 min | passes Day 1 tests, no peeking |
| 5 | Fri 07-18 | Outreach + blockers log | — | log written |

---

## Week 2 — Redis cache & read performance (07-21 → 07-25)

| Day | Date | Task | Time box | Done when |
|-----|------|------|----------|-----------|
| 1 | Mon 07-21 | Cache-aside on redirect + invalidation on edit/delete | 35 min | hit faster than DB (logged), delete invalidates key |
| 2 | Tue 07-22 | Negative caching + stampede protection (single-flight) | 35 min | 1000 concurrent cold hits → DB sees ~1 read |
| 3 | Wed 07-23 | Async click analytics: Redis queue + worker | 35 min | redirect returns before persist; worker restart drains backlog; N redirects → count == N |
| 4 | Thu 07-24 | Cold rebuild: cache-aside + invalidation | 35 min | passes Day 1 tests, blank file |
| 5 | Fri 07-25 | Outreach + blockers log | — | log written |

**Retest (spaced):** re-run Week 1 code-gen cold, ~5 min sanity.

---

## Week 3 — API Gateway (07-28 → 08-01)

| Day | Date | Task | Time box | Done when |
|-----|------|------|----------|-----------|
| 1 | Mon 07-28 | Gateway routing/proxy: write routes → Write svc, `GET /:code` → Read svc | 35 min | 302 + Location forwarded unchanged; internal ports not public |
| 2 | Tue 07-29 | Rate limiter at gateway: sliding-window, Redis, per key/IP | 35 min | N+1th → 429 + Retry-After; window slides; works across instances |
| 3 | Wed 07-30 | Auth at gateway + trusted `X-User-Id` injection | 35 min | write w/o key → 401 (never reaches svc); redirect public |
| 4 | Thu 07-31 | Cold rebuild: rate limiter | 35 min | passes Day 2 tests, blank file |
| 5 | Fri 08-01 | Outreach + blockers log | — | log written |

**Retest (spaced):** re-run Week 2 cache-aside cold.

---

## Week 4 — Scale write path & demo (08-04 → 08-08)

| Day | Date | Task | Time box | Done when |
|-----|------|------|----------|-----------|
| 1 | Mon 08-04 | Distributed id / code gen, standalone (id-range or snowflake) | 35 min | unique ids across 2 instances, no per-write central call |
| 2 | Tue 08-05 | Wire into Write Service + **same-day cold rebuild** | 30 min | concurrent creates across 2 instances → zero dup short_code |
| 3 | Wed 08-06 | Recorded unscripted walkthrough | 30 min | answers read/write split, cache stampede, sharded uniqueness |
| 4 | Thu 08-07 | Cold rebuild of weakest component across all 4 weeks | 35 min | passes its acceptance tests |
| 5 | Fri 08-08 | Final blockers log + decide extend/repeat | — | log written |

---

## Retest ledger (fill as you go)

| Component | Built | Retest 1 | Retest 2 |
|-----------|-------|----------|----------|
| Code generation | 07-14 | 07-17 | Week 2 |
| Read/redirect | 07-15 | | |
| Cache-aside + invalidation | 07-21 | 07-24 | Week 3 |
| Stampede / single-flight | 07-22 | | |
| Async analytics queue | 07-23 | | |
| Gateway routing | 07-28 | | |
| Rate limiter | 07-29 | 07-31 | Week 3 spaced |
| Auth / trust boundary | 07-30 | | |
| Distributed id gen | 08-04 | 08-05 | |

**Rule:** component not cold-passed twice, spaced ≥3 days = not learned. Reschedule it into the next Day-5 slot.
