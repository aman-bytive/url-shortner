# CLAUDE.md — context for AI sessions on this repo

## Read this first: the one rule that overrides everything else

**This is a cold-build learning project. AI must never write, edit, or paste implementation code into this repo.**

The owner is drilling backend fundamentals (concurrency, caching, auth, indexing, distributed id generation) by hand, timed, without reference. If AI writes the code, the exercise is defeated — the whole point is the struggle.

### What AI (you, future session) SHOULD do here
- Answer architecture/design questions — explain trade-offs, stress-test the owner's proposed approach, point out what's missing.
- Give **pseudocode only** when asked for implementation help — plain-English steps, no real syntax, no copy-pasteable logic.
- Write and maintain **docs** (`docs/`, `README.md`, `REQUIREMENTS.md`, `TIMELINE.md`, ADRs) — planning artifacts are fair game.
- Debug **infra/environment** issues (Docker, `.env`, connection strings, permission errors) — this is plumbing, not the tested skill.
- Review code the owner already wrote and flag bugs/gaps in plain language — don't rewrite it for them, describe the fix.
- Do simple math/lookups on request (base62 examples, collision probability, capacity estimates).

### What AI must NOT do
- Do not use Write/Edit tools on any file under `services/*/src/`, `services/*/app.js`, `services/*/server.js`, or any other implementation file.
- Do not paste runnable code blocks as "here's how you'd do it" — pseudocode only, framework-agnostic.
- Do not silently "fix" a bug in their service code by editing it. Explain what's wrong and let them type the fix.
- Docs, config scaffolding (`docker-compose.yml`, `package.json` dependency lists, `.env.example` keys), and schema files ARE fine to write/edit directly — these aren't the skill being tested. When in doubt about a file, ask.

---

## Project

URL shortener, built as 4 independent Node/Express services behind a gateway, matching a `ticket-master-server` sibling project's same cold-build methodology. Full requirements/timeline/architecture reasoning lives in `docs/` and the root planning files — **read those before answering design questions**, don't re-derive from scratch.

| File | Contents |
|------|----------|
| `README.md` | overview, quickstart, ports, repo layout |
| `REQUIREMENTS.md` | week-by-week build spec with acceptance criteria (the actual curriculum) |
| `TIMELINE.md` | dated day-by-day schedule mapped to REQUIREMENTS.md |
| `docs/architecture.md` | component responsibilities, request flows, trust boundaries |
| `docs/api.md` | full HTTP API reference |
| `docs/data-model.md` | Postgres schema + index reasoning |
| `docs/caching.md` | Redis cache-aside, invalidation, stampede, async analytics |
| `docs/short-codes.md` | short-code generation strategy |
| `docs/scaling.md` | capacity math, sharding, failure modes |
| `docs/deployment.md` | env vars, topology, runbook |
| `docs/adr/` | locked decisions + the reasoning behind each (read before suggesting alternatives — most have already been argued through) |

## Locked technical decisions (don't re-litigate without cause — check the ADR first)

- **No ORM.** Raw SQL via `pg` driver only, in a repository layer. Deliberate — hiding SQL defeats the learning goal.
- **Short-code generation: Redis `INCR` + base62** ([ADR-0007](docs/adr/0007-redis-counter-code-generation.md)). Not id-range leasing, not Snowflake — single atomic counter, no per-request batching (considered and rejected as premature).
- **Auth: JWT access token (15 min) + opaque refresh token (30 days, hashed at rest), no rotation** ([ADR-0006](docs/adr/0006-jwt-access-refresh.md)). Auth is its own service (`services/auth`), not folded into the gateway.
- **Gateway verifies JWT signature locally, injects trusted `X-User-Id` header downstream.** Write/Read services trust that header only because internal ports aren't publicly reachable — network isolation is the actual security boundary, not the header check.
- **Cache-aside, not write-through**, for the redirect cache ([ADR-0002](docs/adr/0002-cache-aside.md)).
- **302 default redirect**, 301 opt-in via `permanent: true` ([ADR-0003](docs/adr/0003-302-default-redirect.md)).
- **Soft delete only** on `urls` — codes are never reused ([ADR-0005](docs/adr/0005-soft-delete.md)).
- **New code per create by default**; dedup is opt-in via `?dedup=true` ([ADR-0004](docs/adr/0004-dedup-policy.md)).
- **Read/Write split** is based on hot-path-vs-everything-else, not GET-vs-POST — owner-facing reads (`GET /urls`, `GET /urls/:code`) live in Write Service, not Read Service ([ADR-0001](docs/adr/0001-split-read-write-services.md)).

## Layering convention (every service, consistently)

```
src/
  config/        # db.js (pg Pool), redis/client.js
  routes/        # express Router, thin — wires path to controller
  controllers/   # req/res only — parse input, call service, map result to status code. No SQL, no business rules.
  services/      # business logic + orchestration. No req/res, no raw SQL — calls repositories.
  repositories/  # raw SQL only. No business decisions, no response shaping.
  middlewares/   # auth checks, validation, error handling
  utils/         # small stateless helpers (base62 encode, response shaping, apiError)
  validators/    # request schema validation (Joi or similar)
app.js           # express app + middleware wiring
server.js        # entrypoint, connects DB, starts listener
```

No shared code imports between services (`gateway`, `auth`, `write`, `read`) — the only shared surface is Postgres and Redis. Duplicate small boilerplate (e.g. `db.js` shape) rather than factor out a shared package.

## Current state (check `git branch` / `git log` for the real up-to-date picture — this is a snapshot, not a live source)

All four services have scaffolding and substantial implementation already in progress across feature branches (`feat/writeService`, `feat/readService`, `feat/gateway`, `feat/auth`, `feat/redis`). Write and Read services include Redis integration (counter, cache, single-flight, click tracking). Don't assume anything is unbuilt — check the actual files in `services/*/src/` before answering "have you built X yet"-type questions.

## Stack

Node.js + Express, PostgreSQL (`pg`, raw SQL), Redis, Docker Compose. No TypeScript, no ORM, no query builder.
