# API Reference

All external traffic goes through the **API Gateway** at `http://localhost:8080`. Clients never call the Write or Read services directly.

## Conventions

- **Base URL:** `http://localhost:8080` (gateway).
- **Auth:** write routes require `Authorization: Bearer <access-token>` (short-lived JWT from `/auth/login` or `/auth/refresh`). The redirect route is public. See [Auth API](#auth-api) below.
- **Content type:** `application/json` for request/response bodies (redirects have no body).
- **Error shape** (every error, everywhere):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "longUrl must be a valid http(s) URL" } }
```

### Status codes

| Code | Meaning |
|------|---------|
| 200 | OK (metadata / list) |
| 201 | Created |
| 204 | Deleted (no body) |
| 301 / 302 | Redirect (see note below) |
| 400 | Malformed request |
| 401 | Missing/invalid credentials |
| 404 | Code not found or soft-deleted |
| 410 | Code expired |
| 422 | Validation failed |
| 429 | Rate limit exceeded |

### 301 vs 302

Redirects use **302 (Found, temporary)** by default. A 301 is cached aggressively by browsers and proxies, which means later redirects never reach the Read Service — breaking click analytics and making edits/deletes invisible to already-cached clients. 302 keeps every hit flowing through the service. Set `?permanent=true` on create to opt into 301 for links that will never change and don't need analytics.

---

## Auth API

Handled by the gateway (or a dedicated Auth Service behind it — see [architecture.md](architecture.md#auth-service)). Issues short-lived **access tokens** (JWT, 15 min) and long-lived **refresh tokens** (opaque, 30 days, stored hashed in `refresh_tokens`).

### `POST /auth/register`

**Request**
```json
{ "email": "prachi@bytive.in", "password": "min-8-chars" }
```

**Responses**

`201 Created`
```json
{ "userId": 42, "email": "prachi@bytive.in" }
```

| Failure | Status | `error.code` |
|---------|--------|--------------|
| email already registered | 409 | `EMAIL_TAKEN` |
| email malformed / password < 8 chars | 422 | `VALIDATION_ERROR` |

Password hashed (bcrypt/argon2) before storage. Plaintext never touches the DB or logs.

### `POST /auth/login`

**Request**
```json
{ "email": "prachi@bytive.in", "password": "min-8-chars" }
```

**Responses**

`200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "8f3b2c1a-...",
  "expiresIn": 900
}
```

| Failure | Status | `error.code` |
|---------|--------|--------------|
| wrong email/password | 401 | `INVALID_CREDENTIALS` |

A new `refresh_tokens` row is created per login (per-device/session). `accessToken` is a signed JWT carrying `{ userId, exp }` — the gateway verifies its signature locally, no DB hit per request.

### `POST /auth/refresh`

**Request**
```json
{ "refreshToken": "8f3b2c1a-..." }
```

**Responses**

`200 OK`
```json
{ "accessToken": "eyJhbGciOiJIUzI1NiJ9...", "expiresIn": 900 }
```

| Failure | Status | `error.code` |
|---------|--------|--------------|
| unknown / expired / revoked refresh token | 401 | `INVALID_REFRESH_TOKEN` |

Refresh token is **not** rotated by default (see [ADR-0006](adr/0006-jwt-access-refresh.md)); it stays valid until its own expiry or explicit logout.

### `POST /auth/logout`

Auth required (access token).

**Request**
```json
{ "refreshToken": "8f3b2c1a-..." }
```

Sets `revoked_at` on the matching `refresh_tokens` row. `204 No Content`. Access tokens already issued remain valid until they naturally expire (≤15 min) — logout is not instant revocation of access, only of future refreshes. See [ADR-0006](adr/0006-jwt-access-refresh.md) for that trade-off.

---

## Write API

### `POST /urls` — create a short URL

Auth required.

**Request**

```json
{
  "longUrl": "https://example.com/some/very/long/path?a=1",
  "customCode": "my-link",      // optional, 4–32 chars, [A-Za-z0-9_-]
  "expiresAt": "2027-01-01T00:00:00Z",  // optional
  "permanent": false            // optional, default false (302); true → 301
}
```

**Responses**

`201 Created`
```json
{
  "shortCode": "9aF2kQ",
  "shortUrl": "http://localhost:8080/9aF2kQ",
  "longUrl": "https://example.com/some/very/long/path?a=1",
  "expiresAt": null,
  "createdAt": "2026-07-09T10:00:00Z"
}
```

| Failure | Status | `error.code` |
|---------|--------|--------------|
| `longUrl` missing/not a valid http(s) URL | 422 | `VALIDATION_ERROR` |
| `customCode` already taken | 409 | `CODE_TAKEN` |
| `customCode` fails charset/length rules | 422 | `VALIDATION_ERROR` |
| No/invalid/expired access token | 401 | `UNAUTHORIZED` |

**Idempotency / dedup:** submitting the same `longUrl` twice by default returns a **new** code each time (a user may want distinct links for distinct campaigns). To dedup, pass `dedup=true` — the service returns the existing code for that `(user_id, long_url)` pair if one exists. See [ADR-0004](adr/0004-dedup-policy.md).

### `GET /urls` — list the caller's URLs

Auth required. Returns the authenticated user's own links only (scoped by `X-User-Id`, never a query param — can't list someone else's).

**Query params:** `?cursor=&limit=` (cursor/keyset pagination, sorted by `created_at DESC, id DESC`).

`200 OK`
```json
{
  "items": [
    {
      "shortCode": "9aF2kQ",
      "longUrl": "https://example.com/...",
      "clickCount": 1423,
      "createdAt": "2026-07-09T10:00:00Z",
      "expiresAt": null,
      "isDeleted": false
    }
  ],
  "nextCursor": "MjAyNi0wNy0wOVQxMDowMDowMFp8NDI="
}
```

**Acceptance rules:**
- `limit` capped (default 20, max 100) — `limit=100000` gets clamped, not OOM.
- No links yet → `200 { "items": [], "nextCursor": null }`, never 404.
- Deleted links excluded by default; `?includeDeleted=true` shows them (owner audit view only).
- `nextCursor: null` means last page.

Backed by `urls_user_recent` index (`user_id, created_at DESC WHERE NOT is_deleted`) — see [data-model.md](data-model.md).

### `GET /urls/:code` — fetch metadata (not a redirect)

Auth required (owner or admin).

`200 OK`
```json
{
  "shortCode": "9aF2kQ",
  "longUrl": "https://example.com/...",
  "clickCount": 1423,
  "createdAt": "2026-07-09T10:00:00Z",
  "expiresAt": null,
  "isDeleted": false
}
```

`404` if the code never existed. A soft-deleted code returns `200` with `isDeleted: true` to the owner (audit visibility), but `404` on the public redirect path.

### `PUT /urls/:code` — edit target / expiry

Auth required (owner). Full replace of mutable fields (`longUrl`, `expiresAt`). Idempotent: same body twice = same end state. On success the cache entry `url:{code}` is invalidated.

`200 OK` + updated object · `404` if not found · `422` on validation.

### `DELETE /urls/:code` — soft delete

Auth required (owner). Sets `is_deleted=true` and immediately `DEL url:{code}` from cache.

`204 No Content` · `404` if not found.

---

## Read API

### `GET /:code` — resolve and redirect

Public. No auth. This is the hot path.

| Case | Status | Behaviour |
|------|--------|-----------|
| Live code | 302 (or 301 if `permanent`) | `Location: <longUrl>` |
| Unknown code | 404 | HTML/JSON not-found, negatively cached |
| Soft-deleted | 404 | treated as unknown to the public |
| Expired (`expiresAt` past) | 410 | Gone, not a redirect |

Response headers on a hit:
```
HTTP/1.1 302 Found
Location: https://example.com/some/very/long/path?a=1
Cache-Control: private, max-age=0
```

Every successful resolve emits a click event to the analytics queue asynchronously; the redirect does not wait for it.

---

## Rate limits

Enforced at the gateway, sliding-window, per authenticated `userId` (from access token) or per IP (anonymous/redirect traffic).

| Route class | Default limit |
|-------------|---------------|
| Auth (`POST /auth/*`) | 10 req / min / IP |
| Write (`POST/PUT/DELETE /urls`) | 60 req / min / user |
| Metadata (`GET /urls/:code`) | 600 req / min / user |
| Redirect (`GET /:code`) | 6000 req / min / IP |

Exceeding a limit:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 23
```
```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests. Retry after 23s." } }
```

Write limits are tighter than read limits because creates are expensive and the abuse surface (spam links) is higher. See [caching.md](caching.md#rate-limiting) for the sliding-window implementation.

---

## Health & ops endpoints

Each service exposes, on its internal port:

| Path | Purpose |
|------|---------|
| `GET /healthz` | liveness — process up |
| `GET /readyz` | readiness — DB/Redis reachable |
| `GET /metrics` | Prometheus metrics (latency, cache hit rate, queue depth) |
