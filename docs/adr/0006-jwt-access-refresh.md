# ADR-0006: JWT access token + opaque refresh token, no rotation

**Status:** Accepted

## Context
Write routes need auth. Options: static API keys, session cookies, or token-based (JWT) auth with login/register. A shortener product needs real user accounts (dashboards, ownership, per-user rate limits), so static API keys alone are insufficient.

## Decision
- **Access token:** signed JWT, 15 min TTL, carries `{ userId, exp }`. Gateway verifies the signature locally — no DB round trip per request.
- **Refresh token:** opaque random string, 30 day TTL, stored **hashed** in `refresh_tokens` (one row per login/session), exchanged for a new access token via `POST /auth/refresh`.
- **No rotation on refresh** — the same refresh token stays valid until its own expiry or explicit `/auth/logout`.

## Consequences
- Short access-token TTL bounds the damage window if one leaks — it self-expires in 15 min without needing revocation infrastructure.
- Refresh tokens are stored hashed, same rationale as password hashing — a DB leak doesn't hand out usable tokens.
- Per-session rows in `refresh_tokens` let a user log out one device (`revoked_at`) without invalidating others.
- **Trade-off accepted:** logout revokes future refreshes but not already-issued access tokens (they simply expire naturally within 15 min). True instant revocation would need the gateway to check a blocklist per request, reintroducing a DB/Redis hit on the hot write-auth path — rejected as unnecessary given the short TTL.
- **Trade-off accepted:** no refresh-token rotation. Rotation (issuing a new refresh token on every refresh call) detects token replay/theft more precisely, at the cost of extra write-per-refresh and client-side complexity (must swap the stored refresh token every time). Not worth it for a shortener's threat model; revisit if this becomes a target for credential theft.
