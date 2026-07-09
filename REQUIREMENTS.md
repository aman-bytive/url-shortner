# URL Shortener — Requirements & Build Spec

**Method:** You write every line of code, cold, timed. No AI-authored code. This doc = requirements + acceptance criteria only. It tells you *what* to build and *how you'll know it works* — never *how to write it*.

**Stack (locked):** Node + Express + PostgreSQL + Redis. Services run as separate processes (separate ports), not one monolith with route folders.

**Golden rules (non-negotiable):**
1. AI never touches your editor. Paste finished code back for review only.
2. Every component: build blank-file, 35-min timer, no reference open.
3. Every component retested cold ≥2x, spaced 3–7 days apart.
4. Stuck 20 min → hand-write pseudocode, don't ask AI. Timer keeps running.
5. No copy-paste from this doc. Retype everything, including SQL.

---

## Target Architecture

Four independent pieces. Each runs and gets tested on its own before wiring.

```
          ┌──────────────┐
client ──▶│  API Gateway │  auth, rate-limit, route write vs read
          └──────┬───────┘
         write   │   read
        ┌────────┴────────┐
        ▼                 ▼
 ┌─────────────┐   ┌─────────────┐
 │ Write Svc   │   │ Read Svc    │
 │ create/edit │   │ redirect    │
 └──────┬──────┘   └──────┬──────┘
        │            cache │ hit
        │                  ▼
        │            ┌──────────┐
        └───────────▶│  Redis   │  code → longUrl, hot keys
                     └────┬─────┘
                          │ miss
                          ▼
                   ┌─────────────┐
                   │ PostgreSQL  │  source of truth
                   └─────────────┘
```

**Why split read/write:** read traffic dwarfs write (100:1+). Redirect path must be cache-first, sub-10ms, horizontally scalable. Write path is heavier (ID generation, uniqueness, validation) and low-QPS. Different scaling needs → different services.

---

## Domain Model

**urls**
- id, short_code, long_url, user_id, created_at, expires_at, is_deleted, click_count
- short_code is the lookup key on redirect — **decide its index** (unique? what type?). Justify.
- Decide: which columns need indexes? (hint: redirect filters on `short_code`; user dashboard filters on `user_id`).

**clicks** (analytics, optional but design for it)
- id, short_code → urls, clicked_at, referrer, ip_hash
- Write-heavy, append-only. Decide: write synchronously on redirect, or async off the hot path? Justify (hint: redirect latency).

**Write-down before coding (1 line each):**
- Soft vs hard delete on urls — which and why?
- `short_code` collision strategy — how do you guarantee uniqueness under concurrent writes?

---

## Week 1 — Write Service + Read Service, standalone

**Client ask:** "Shorten a long URL, then redirect from the short one. Reliably, no collisions."

### Day 1 — Write Service, cold, 35 min
Standalone service. `POST /urls`.

| Method | Path | Acceptance criteria |
|--------|------|--------------------|
| POST | /urls | Validate URL format BEFORE DB write. 201 + `{ shortCode, shortUrl, longUrl }`. Bad URL → 422. |
| GET | /urls | List caller's own links, own rows only (scope by authenticated user, never a query param). `?cursor=&limit=`, capped limit (max 100). Empty → 200 + `[]`, never 404. |
| GET | /urls/:code | Metadata (not redirect) → 200 + object. Not found → 404 (never 200 + null). |
| DELETE | /urls/:code | Soft delete. Return 204 or 200 — pick one, be consistent. |

**Short-code generation — decide and defend one:**
- Base62 of an auto-increment ID (short, sequential, guessable).
- Random N-char base62 + uniqueness check + retry on collision.
- Hash(longUrl) truncated (dedup identical URLs, but collision handling required).

**Acceptance criteria:**
- Same long URL submitted twice — decide: dedup to same code, or new code each time? Write down which and why. Test matches your decision.
- Error shape identical everywhere: `{ "error": { "code": "...", "message": "..." } }`.
- Codes are URL-safe (no `+`, `/`, `=`).

### Day 2 — Read Service, cold, 35 min
Separate process/port. `GET /:code` → **301/302 redirect** to long_url.

**Acceptance criteria:**
- Valid code → 302 (or 301 — pick one, know the caching difference and explain it).
- Unknown code → 404 page, not a crash, not a redirect to `undefined`.
- Expired code (`expires_at` past) → 410 Gone, not 302.
- Soft-deleted code → 404.
- Read Service does **not** import Write Service code. Only shared thing is the DB/Redis. Enforce the boundary.

### Day 3 — Defend in writing
- `short_code` index type + why.
- 301 vs 302 for redirect — cache implications, and which you'd pick for an analytics-driven shortener.
- Collision probability for your code scheme at 1M / 100M / 1B URLs. Do the math.

### Day 4 — Cold rebuild, 35 min
Rebuild the code-generation + collision handling only. Blank file. No peeking at Day 1.

### Day 5 — Outreach + blockers log.

---

## Week 2 — Redis Cache + Read Path Performance

**Client ask:** "Redirects are hitting the DB every time. Popular links must be instant."

### Day 1 — Cache-aside on redirect, cold
Redis in front of the redirect lookup: `code → long_url`.

**Acceptance criteria:**
- Cache hit path measurably faster than DB path (log both, show the numbers).
- TTL set on cached keys.
- Cache miss → read DB → populate cache → redirect. Second hit for same code = cache hit.
- **Invalidation:** on DELETE or edit of a URL, its cached entry is invalidated. Stale redirect after delete = fail. This is what interviews probe.
- Decide + write down: cache-aside vs write-through. Which and why for a read-heavy redirect?

### Day 2 — Negative caching + stampede
- Cache misses for **nonexistent** codes too (short negative TTL) — else 404-scanning hammers the DB.
- Cache stampede: 1000 concurrent requests for an uncached hot code. Don't fire 1000 DB reads. Decide: lock, or single-flight, or stale-while-revalidate. Implement one, justify.

**Acceptance criteria:**
- Fire 1000 concurrent requests at one cold code. DB sees ≪1000 reads (ideally 1). Prove it with a query counter/log.
- Bogus-code flood does not proportionally hit DB.

### Day 3 — Async click analytics, cold
Redirect must not block on analytics write. Push click events to a **Redis** list/stream; a worker drains them into `clicks` + increments `click_count`.

**Acceptance criteria:**
- Redirect returns before the click row is persisted.
- Worker down for 60s → events queue, not lost. Worker back up → drains backlog.
- `click_count` eventually correct after a burst of redirects (test: N redirects → count == N).

### Day 4 — Cold rebuild the cache-aside + invalidation layer, 35 min.

### Day 5 — Outreach + blockers log.

---

## Week 3 — API Gateway

**Client ask:** "One entry point. Auth, rate limits, and route read vs write — clients shouldn't know the internal services."

### Day 1 — Gateway routing, cold
Gateway process fronts both services. Client only ever talks to the gateway.

**Acceptance criteria:**
- `POST /urls` and `/urls/*` → proxied to Write Service.
- `GET /:code` → proxied to Read Service.
- Gateway forwards status, body, and the redirect `Location` header unchanged. A 302 from Read Service reaches the client as a 302.
- Internal service ports are not publicly reachable — only the gateway is. State how you'd enforce this in deploy (not necessarily coded single-node).

### Day 2 — Rate limiter at the gateway, cold (read-heavy service — this matters)
Sliding-window, per-API-key (or per-IP for anonymous), backed by **Redis**. Applied at gateway before proxying.

**Acceptance criteria:**
- N requests/window per key enforced. N+1th → 429 + Retry-After.
- Window slides correctly (not fixed-bucket that hard-resets on boundary — know the difference, explain it).
- Different limits for write vs read routes (write is cheaper to abuse-cap). Justify the numbers.
- State lives in Redis, works across multiple gateway instances.

### Day 3 — Auth Service: register + login, cold
Standalone service (or module). `POST /auth/register`, `POST /auth/login`.

**Acceptance criteria:**
- Register: hash password before storing (bcrypt/argon2) — never plaintext, never even in logs. Duplicate email → 409.
- Login: verify password against hash. Wrong password → 401, same error whether email exists or not (don't leak which).
- Login issues an **access token** (JWT, short TTL e.g. 15 min, signed, carries `userId`) and a **refresh token** (opaque random string, long TTL e.g. 30 days, stored **hashed** in a `refresh_tokens` table).
- Write down: why hash the refresh token in DB too, not just the password?

### Day 4 — Access token verification at the gateway + refresh/logout, cold
Gateway verifies the JWT signature locally (no DB call) on write routes. Add `POST /auth/refresh` and `POST /auth/logout`.

**Acceptance criteria:**
- Missing/invalid/expired access token on a write route → 401, request never reaches Write Service.
- Public redirect works with no auth.
- Gateway injects a trusted `user_id` header downstream (from the verified JWT claim, not client-supplied); Write Service trusts it **only** from the gateway. Explain the trust boundary.
- `/auth/refresh`: valid, non-expired, non-revoked refresh token → new access token. Expired/revoked/unknown → 401.
- `/auth/logout`: marks the refresh token revoked. Old access tokens already issued still work until they naturally expire — write down why that's acceptable (or not) for this system.

### Day 5 — Outreach + blockers log.

---

## Week 4 — Scale the Write Path + Demo

**Client ask:** "Millions of URLs, multiple write instances. No two ever collide. Walk us through it."

### Day 1 — Distributed ID / code generation, cold, standalone
Auto-increment breaks across multiple write instances / shards. Build one:
- Pre-allocated ID ranges per instance (counter block from Redis/DB), or
- Snowflake-style ID → base62, or
- Random + uniqueness check with bounded retry.

### Day 2 — Wire in as the Write Service code generator. **Same-day cold rebuild, 30 min** — least-reinforced piece before a recorded demo needs 2 reps.

**Acceptance criteria:**
- Fire concurrent creates across 2 write instances. Zero duplicate `short_code` in DB.
- No single-point counter that serializes every write (or if there is, justify the throughput ceiling).

### Day 3 — Recorded unscripted walkthrough.
Before recording, write the 3 hardest questions an interviewer asks:
- Read/write split — why, and how each scales independently?
- Cache invalidation + stampede — walk the hot-key path.
- Code generation across shards — how do you guarantee global uniqueness without a bottleneck?
- Access + refresh token split — why short-TTL JWT + longer opaque refresh, and what logout actually revokes.
Confirm your unscripted answer hits all three.

### Day 4 — Cold rebuild of weakest component across all 4 weeks.

### Day 5 — Final blockers log + decide Week 5 repeat or extend.

---

## Scope Honesty
Single-node per service throughout unless noted. Redis is single instance. "Multiple instances" tested by running 2 local processes, not a real cluster. Fine for interview-level concept recall — but not a deployed distributed system. Say so honestly; don't imply production-scale.

## Open Item
**DSA maintenance** — not allocated here. Decide: dead, or 2 problems/day cold as a separate track. Silence = it dies.
